"""
build_standalone.py — 把"魔法绘本书房"（图书馆 index.html + 阅读器 book.html）打包成**一个**独立的 HTML 文件。

运行：
  python3 tools/build_standalone.py            # 输出 dist/magic-library.html
  python3 tools/build_standalone.py --no-fonts  # 不下载、不内嵌 Google 字体（离线时用）

原理（为什么不用打包工具也能跑）：
  1. 资源（图片 / 配音 / JSON）全部 base64 塞进页面，每个文件一个 <script type="application/octet-stream">，
     用到时才解码成 Blob URL —— 打开页面不会一次性解码几十 MB。
     图片顺便转成 WebP（带透明通道），体积大约是 PNG 的 1/10。
  2. 给浏览器装一层"虚拟文件系统"：fetch()、<img>.src、<audio>.src 遇到 assets/… data/… 这样的路径，
     就从页面里取，不再去硬盘 / 网络找。所以双击打开（file://）也能用。
  3. JS 模块：每个模块的源码存成文本；运行时按依赖顺序（先叶子后根）生成 Blob URL，
     并把 import 路径换成对应的 Blob URL —— 浏览器原生的 ES 模块照常工作，代码一行不用改。
  4. 两个页面（图书馆 / 阅读器）都放进同一个文件，用网址的 #hash 区分：
     #index.html = 图书馆，#book.html?book=paper-moon = 读《纸月亮》。原来的跳转改成"改 hash + 重新载入"。
  5. 字体：Google Fonts 的拉丁字体下载后内嵌（国内打不开 Google 也能显示）；中文霞鹜文楷太大（几十 MB），
     仍走 jsDelivr CDN，没网时退回系统楷体。
"""

import base64
import io
import json
import mimetypes
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "dist", "magic-library.html")
PAGES = {"index.html": "js/library.js", "book.html": "js/app.js"}

# 图片压缩参数：最长边上限 + WebP 质量（透明通道单独给高一点的质量，免得纸片边缘发毛）
MAX_SIDE = 2048
WEBP_QUALITY = 80
# --artifact：发布成 claude.ai 网页（Artifact）用。网页有 16 MB 上限、只允许 Google Fonts 这一个外部样式来源，
# 而且外层文档骨架由平台生成，所以：图片压得更小、去掉 doctype/html/head/body、只保留 Google Fonts 链接。
ARTIFACT = "--artifact" in sys.argv
if ARTIFACT:
    MAX_SIDE, WEBP_QUALITY = 1400, 68
    OUT = os.path.join(ROOT, "dist", "magic-library-artifact.html")
WEBP_ALPHA_QUALITY = 90 if not ARTIFACT else 80


def read(path):
    with open(os.path.join(ROOT, path), encoding="utf-8") as f:
        return f.read()


# ---------------------------------------------------------------- 1. JS 模块：收集依赖图
IMPORT_RE = re.compile(r"""(\bfrom\s*|\bimport\s*)(["'])((?:\.{1,2}/|three)[^"']*)\2""")


def resolve_spec(spec, from_path):
    """把 import 路径换成项目里的相对路径（'three' 这类裸名按原来的 importmap 解析）。"""
    if spec == "three":
        return "vendor/three.module.min.js"
    if spec.startswith("three/addons/"):
        return "vendor/addons/" + spec[len("three/addons/"):]
    base = os.path.dirname(from_path)
    return os.path.normpath(os.path.join(base, spec)).replace(os.sep, "/")


def collect_modules(entries):
    modules = {}  # path -> {"src": 源码（import 路径换成占位符）, "deps": [...]}
    stack = list(entries)
    while stack:
        path = stack.pop()
        if path in modules:
            continue
        src = read(path)
        deps = []

        def swap(m):
            # 注释里的示例代码（如 "* @three_import import { X } from 'three/addons/…'"）不是真的依赖，跳过
            line_start = src.rfind("\n", 0, m.start()) + 1
            if src[line_start:m.start()].lstrip().startswith(("*", "//", "/*")):
                return m.group(0)
            target = resolve_spec(m.group(3), path)
            deps.append(target)
            return f"{m.group(1)}{m.group(2)}__MOD__{target}__{m.group(2)}"

        src = IMPORT_RE.sub(swap, src)
        src = patch_navigation(path, src)
        modules[path] = {"src": src, "deps": sorted(set(deps))}
        stack.extend(deps)
    return modules


def patch_navigation(path, src):
    """多页面 → 单文件：跳转、读网址参数、CSS 里的图片路径，都接到虚拟路由 / 虚拟文件系统上。"""
    src = re.sub(r"\blocation\.href\s*=\s*", "__nav(", src)  # location.href = X;  →  __nav(X);
    if "__nav(" in src:
        # 只有 library.js 里这一处：setTimeout(() => { location.href = b.book.href; }, 900);
        src = src.replace("__nav(b.book.href;", "__nav(b.book.href);")
    src = src.replace("location.search", "__vsearch()")
    src = src.replace('`url("${spread.thumbnail || assetFile(spread.focalSubject)}")`',
                      '`url("${__vurl(spread.thumbnail || assetFile(spread.focalSubject))}")`')
    return src


# ---------------------------------------------------------------- 2. 页面：样式 + 正文
def split_page(name):
    html = read(name)
    head = html[: html.index("</head>")]
    body_open = re.search(r"<body([^>]*)>", html)
    body = html[body_open.end(): html.rindex("</body>")]
    body = re.sub(r"<script\b[^>]*>.*?</script>", "", body, flags=re.S)  # 模块入口由打包器负责
    body = body.replace('href="index.html"', "href=\"javascript:__nav('index.html')\"")
    css = []
    externals = []
    for m in re.finditer(r"<style>(.*?)</style>|<link\b([^>]*)>", head, flags=re.S):
        if m.group(1) is not None:
            css.append(m.group(1))
            continue
        attrs = m.group(2)
        href = re.search(r'href="([^"]+)"', attrs)
        if not href or "stylesheet" not in attrs:
            continue
        href = href.group(1)
        if href.startswith("http"):
            externals.append(href)
        else:
            css.append(read(href))
    title = re.search(r"<title>(.*?)</title>", head).group(1)
    body_class = re.search(r'class="([^"]*)"', body_open.group(1) or "")
    return {
        "title": title,
        "css": "\n".join(css),
        "body": body,
        "bodyClass": body_class.group(1) if body_class else "",
        "entry": PAGES[name],
        "externals": externals,
    }


# ---------------------------------------------------------------- 3. 资源：只带真正用得到的
def wanted_assets(texts):
    """被代码 / 数据引用到的才打包（_alt- 开头的备选稿不带）；配音和地点缩略图按文件夹整个带。"""
    blob = "\n".join(texts)
    keep = []
    for dirpath, _, files in os.walk(os.path.join(ROOT, "assets")):
        for f in files:
            rel = os.path.relpath(os.path.join(dirpath, f), ROOT).replace(os.sep, "/")
            if f.startswith("_alt-") or f.startswith("."):
                continue
            if rel.startswith("assets/voice/") or rel.startswith("assets/spots/"):
                keep.append(rel)
            elif rel in blob or f in blob or os.path.splitext(f)[0] in blob:
                keep.append(rel)
    for dirpath, _, files in os.walk(os.path.join(ROOT, "data")):
        for f in files:
            if f.endswith(".json"):
                keep.append(os.path.relpath(os.path.join(dirpath, f), ROOT).replace(os.sep, "/"))
    return sorted(set(keep))


def encode_asset(rel):
    """返回 (mime, bytes)。PNG / JPEG 转 WebP（更小就用 WebP，否则保留原图）。"""
    path = os.path.join(ROOT, rel)
    raw = open(path, "rb").read()
    mime = mimetypes.guess_type(rel)[0] or "application/octet-stream"
    if rel.endswith(".json"):
        mime = "application/json"
    if mime in ("image/png", "image/jpeg"):
        from PIL import Image
        img = Image.open(io.BytesIO(raw))
        img.load()
        if max(img.size) > MAX_SIDE:
            img.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
        has_alpha = img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info)
        img = img.convert("RGBA" if has_alpha else "RGB")
        out = io.BytesIO()
        img.save(out, "WEBP", quality=WEBP_QUALITY, alpha_quality=WEBP_ALPHA_QUALITY, method=5)
        if out.tell() < len(raw):
            return "image/webp", out.getvalue()
    return mime, raw


# ---------------------------------------------------------------- 4. 字体：Google Fonts 内嵌
def embed_google_fonts(urls):
    """下载 Google Fonts 的 CSS（用浏览器的 UA 拿 woff2），只留 latin / latin-ext 子集，woff2 转成 data: URL。"""
    ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
    import subprocess

    def get(url):
        # 用 curl 下载：它走系统的网络设置；Python 自带的 urllib 在一些代理环境下 TLS 握手会失败
        return subprocess.run(["curl", "-sfL", "-m", "30", "-A", ua, url], capture_output=True, check=True).stdout

    css_out = []
    for url in urls:
        css = get(url).decode("utf-8")
        # 按 /* subset */ 注释切块
        for block in re.split(r"(?=/\* )", css):
            name = re.match(r"/\* ([\w-]+) \*/", block)
            if not name or name.group(1) not in ("latin", "latin-ext"):
                continue

            def inline(m):
                data = get(m.group(1))
                return f"url(data:font/woff2;base64,{base64.b64encode(data).decode()})"

            css_out.append(re.sub(r"url\((https://[^)]+)\)", inline, block))
    return "\n".join(css_out)


# ---------------------------------------------------------------- 5. 运行时：虚拟文件系统 + 模块加载 + 路由
BOOT = r"""
(() => {
  // ---- 路由：#index.html（图书馆）或 #book.html?book=…（阅读器）
  let saved = null;
  try { saved = sessionStorage.getItem('__route'); } catch (e) { /* 存不了就只用 hash */ }
  const route = decodeURIComponent(location.hash.slice(1)) || saved || 'index.html';
  const [pageName, query = ''] = route.split('?');
  const page = __PAGES[pageName] || __PAGES['index.html'];
  window.__vsearch = () => (query ? '?' + query : '');
  window.__nav = url => {
    url = String(url).replace(/^\.?\//, '');
    try { sessionStorage.setItem('__route', url); } catch (e) { /* 忽略 */ }
    try { location.hash = '#' + url; } catch (e) { /* 忽略 */ }
    location.reload();
  };

  // ---- 虚拟文件系统：路径 → 页面里的 base64 → Blob URL（用到才解码）
  const files = new Map();
  document.querySelectorAll('script[data-vfs]').forEach(s => files.set(s.dataset.vfs, s));
  const urls = new Map();
  const keyOf = raw => {
    if (typeof raw !== 'string' || /^(blob:|data:)/.test(raw)) return null;
    let p = raw.split('#')[0].split('?')[0];
    try { p = decodeURIComponent(p); } catch (e) { /* 保持原样 */ }
    p = p.replace(/^\.?\//, '');
    if (files.has(p)) return p;
    for (const root of ['assets/', 'data/']) {                // 绝对网址 / file:// 路径：从 assets/ 或 data/ 截出来
      const i = p.lastIndexOf('/' + root);
      if (i >= 0 && files.has(p.slice(i + 1))) return p.slice(i + 1);
    }
    return null;
  };
  const blobOf = key => {
    const s = files.get(key), bin = atob(s.textContent.trim()), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: s.dataset.mime });
  };
  const vurl = raw => {
    const key = keyOf(raw);
    if (!key) return raw;
    if (!urls.has(key)) {
      const s = files.get(key);
      urls.set(key, s.dataset.mime.startsWith('audio/') ? `data:${s.dataset.mime};base64,${s.textContent.trim()}` : URL.createObjectURL(blobOf(key)));
    }
    return urls.get(key);
  };
  window.__vurl = vurl;

  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const key = keyOf(typeof input === 'string' ? input : input && input.url);
    if (!key) return realFetch(input, init);
    return Promise.resolve(new Response(blobOf(key), { status: 200, headers: { 'Content-Type': files.get(key).dataset.mime } }));
  };
  for (const proto of [HTMLImageElement.prototype, HTMLMediaElement.prototype, HTMLSourceElement.prototype]) {
    const d = Object.getOwnPropertyDescriptor(proto, 'src');
    Object.defineProperty(proto, 'src', { ...d, set(v) { d.set.call(this, vurl(v)); } });
  }
  const RealAudio = window.Audio;
  window.Audio = function (src) { const a = new RealAudio(); if (src !== undefined) a.src = src; return a; };
  window.Audio.prototype = RealAudio.prototype;

  // ---- 页面：标题、样式（CSS 里的 url(assets/…) 换成 Blob URL）、正文
  const fixUrls = text => text
    .replace(/url\((['"]?)((?:\.\/)?(?:assets|data)\/[^'")]+)\1\)/g, (m, q, p) => `url(${q}${vurl(p)}${q})`)
    .replace(/(\s(?:src|href)=")((?:\.\/)?(?:assets|data)\/[^"]+)"/g, (m, a, p) => `${a}${vurl(p)}"`);
  document.title = page.title;
  page.externals.forEach(href => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l); });
  const style = document.createElement('style');
  style.textContent = fixUrls(page.css);
  document.head.appendChild(style);
  if (page.bodyClass) document.body.className = page.bodyClass;
  document.body.insertAdjacentHTML('afterbegin', fixUrls(page.body));

  // ---- 模块：按依赖顺序生成 Blob URL（先叶子），import 路径换成 Blob URL，再从入口启动
  const sources = new Map();
  document.querySelectorAll('script[data-module]').forEach(s => sources.set(s.dataset.module, s.textContent));
  const modUrls = new Map();
  const moduleUrl = (path, trail = []) => {
    if (modUrls.has(path)) return modUrls.get(path);
    if (trail.includes(path)) throw new Error('循环依赖：' + trail.concat(path).join(' → '));
    let src = sources.get(path);
    if (src === undefined) throw new Error('缺少模块：' + path);
    src = src.replace(/__MOD__(.+?)__(?=["'])/g, (m, dep) => moduleUrl(dep, trail.concat(path)));
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    modUrls.set(path, url);
    return url;
  };
  import(moduleUrl(page.entry)).catch(err => {
    console.error(err);
    document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;inset:auto 0 0 0;z-index:99;background:#300;color:#fdd;padding:12px;font:12px monospace;white-space:pre-wrap">加载失败：${String(err && err.stack || err)}</pre>`);
  });
})();
"""


def build(embed_fonts=True):
    pages = {name: split_page(name) for name in PAGES}
    modules = collect_modules([p["entry"] for p in pages.values()])

    # 字体
    font_css = ""
    if embed_fonts:
        google = sorted({u for p in pages.values() for u in p["externals"] if "fonts.googleapis.com" in u})
        try:
            font_css = embed_google_fonts(google)
            for p in pages.values():
                p["externals"] = [u for u in p["externals"] if "fonts.googleapis.com" not in u]
            print(f"字体：内嵌 {len(google)} 组 Google Fonts（{len(font_css) // 1024} KB）")
        except Exception as e:  # 下载失败：保留在线链接
            print(f"字体：下载失败（{e}），保留在线链接")

    if ARTIFACT:
        for p in pages.values():
            p["externals"] = [u for u in p["externals"] if "fonts.googleapis.com" in u]

    # 资源
    texts = [m["src"] for m in modules.values()] + [p["css"] + p["body"] for p in pages.values()]
    for dirpath, _, files in os.walk(os.path.join(ROOT, "data")):
        texts += [open(os.path.join(dirpath, f), encoding="utf-8").read() for f in files if f.endswith(".json")]
    assets = wanted_assets(texts)
    parts = []
    total_raw = total_out = 0
    for rel in assets:
        mime, data = encode_asset(rel)
        total_raw += os.path.getsize(os.path.join(ROOT, rel))
        total_out += len(data)
        parts.append(f'<script type="application/octet-stream" data-vfs="{rel}" data-mime="{mime}">{base64.b64encode(data).decode()}</script>')
    print(f"资源：{len(assets)} 个文件，{total_raw / 1e6:.1f} MB → {total_out / 1e6:.1f} MB")

    # 模块源码（</script 要转义，否则会提前结束 <script> 标签）
    mod_tags = [f'<script type="text/plain" data-module="{path}">{m["src"].replace("</script", "<\\/script")}</script>' for path, m in modules.items()]
    print(f"模块：{len(modules)} 个")

    pages_json = json.dumps({k: {kk: vv for kk, vv in v.items()} for k, v in pages.items()}, ensure_ascii=False).replace("</", "<\\/")
    shell_head = f"""<title>魔法绘本书房</title>
<!-- 魔法绘本书房 · 单文件版（由 tools/build_standalone.py 生成，请勿手改） -->
<style>{font_css}</style>"""
    shell_body = f"""{chr(10).join(parts)}
{chr(10).join(mod_tags)}
<script>const __PAGES = {pages_json};</script>
<script>{BOOT}</script>"""
    if ARTIFACT:
        html = shell_head + "\n" + shell_body + "\n"
    else:
        html = f"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<link rel="icon" href="data:,">
{shell_head}
</head>
<body>
{shell_body}
</body>
</html>
"""
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"完成：{os.path.relpath(OUT, ROOT)}  {os.path.getsize(OUT) / 1e6:.1f} MB")


if __name__ == "__main__":
    build(embed_fonts="--no-fonts" not in sys.argv)
