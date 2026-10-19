"""
make_book.py — 《小王子》Magic Book 第一册（献词 + 原著第 1–3 章）：会动的插图书

形式：一本摊开的书，原文全文印在纸上（我们从法语自译的英文，text/en/part-*.json），
      插图放在作者原书放插图的位置（text/fr/chapters.json 里的 cNN-imgN），
      魔法发生在插图上，或者从某个词里冒出来。朗读时纸上的词逐个高亮。

这里只输出"内容流"（标题 / 段落 / 插图 / 魔法）；分页排版在浏览器里做（js/pagebook.js），
因为分页取决于真实字体的宽度。

输出:
  assets/greybox/lp/*.png              插图（灰盒版，之后换正式画）
  data/books/little-prince-1.json      书稿（format: "illustrated"）

运行:
  python3 stories/little-prince/tools/make_book.py
"""

import json
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
LP = ROOT / "stories" / "little-prince"
ART = ROOT / "assets" / "greybox" / "lp"
ART.mkdir(parents=True, exist_ok=True)
REL = "assets/greybox/lp"
OUT = ROOT / "data" / "books" / "little-prince-1.json"

FR = json.loads((LP / "text" / "fr" / "chapters.json").read_text())
EN = {}
for f in sorted((LP / "text" / "en").glob("part-*.json")):
    EN.update(json.loads(f.read_text()))

# ---------------------------------------------------------------- 插图（灰盒：铅笔 + 水彩感的简单色块，透明底，像印在纸上）
INK = (52, 44, 40)
BOA = (120, 92, 60)
ELEPHANT = (150, 150, 162)
WHITE = (252, 252, 248)
GOLD_HAIR = (238, 196, 86)
COAT = (96, 146, 118)
SCARF = (244, 204, 74)
BOX = (214, 186, 140)
PLANET = (200, 172, 140)


def font(size):
    try:
        return ImageFont.truetype("/System/Library/Fonts/STHeiti Medium.ttc", size)
    except OSError:
        return ImageFont.load_default()


REAL = ROOT / "assets" / "lp"     # 正式插图（Codex 出图）放这里，文件名和灰盒一样；有就优先用


def art(name, W, H, draw):
    real = REAL / f"{name}.png"
    if real.exists():
        w, h = Image.open(real).size
        return {"file": f"assets/lp/{name}.png", "aspect": round(w / h, 4)}
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw(ImageDraw.Draw(img), W, H)
    img.save(ART / f"{name}.png")
    return {"file": f"{REL}/{name}.png", "aspect": round(W / H, 4)}


def boa_outside(d, W, H, y0=0.2, y1=0.86):
    pts = [(W * 0.06, H * y1), (W * 0.2, H * (y1 - 0.07)), (W * 0.32, H * (y0 + 0.1)), (W * 0.5, H * y0),
           (W * 0.67, H * (y0 + 0.12)), (W * 0.79, H * (y1 - 0.09)), (W * 0.94, H * y1)]
    d.polygon(pts + [(W * 0.94, H * (y1 + 0.04)), (W * 0.06, H * (y1 + 0.04))], fill=BOA, outline=INK)


def boa_inside(d, W, H):
    boa_outside(d, W, H)
    d.ellipse([W * 0.3, H * 0.34, W * 0.72, H * 0.86], fill=ELEPHANT, outline=INK, width=4)
    d.ellipse([W * 0.62, H * 0.34, W * 0.79, H * 0.58], fill=ELEPHANT, outline=INK, width=4)
    d.line([(W * 0.75, H * 0.52), (W * 0.81, H * 0.8)], fill=INK, width=8)
    for x in (0.38, 0.5, 0.6):
        d.rectangle([W * x, H * 0.8, W * (x + 0.05), H * 0.88], fill=ELEPHANT, outline=INK)
    d.ellipse([W * 0.7, H * 0.42, W * 0.72, H * 0.45], fill=INK)


def prince(d, cx, base, h):
    r = h * 0.13
    d.rounded_rectangle([cx - h * 0.14, base - h * 0.62, cx + h * 0.14, base - h * 0.08], radius=12, fill=COAT, outline=INK, width=3)
    d.polygon([(cx + h * 0.08, base - h * 0.6), (cx + h * 0.42, base - h * 0.68), (cx + h * 0.12, base - h * 0.52)], fill=SCARF, outline=INK)
    d.ellipse([cx - r, base - h * 0.62 - 2 * r, cx + r, base - h * 0.62], fill=(250, 228, 206), outline=INK, width=3)
    for k in range(6):
        a = -0.9 + k * 0.36
        d.ellipse([cx + r * a - r * 0.35, base - h * 0.62 - 2.2 * r, cx + r * a + r * 0.35, base - h * 0.62 - 1.5 * r], fill=GOLD_HAIR, outline=INK)
    d.rectangle([cx - h * 0.1, base - h * 0.08, cx - h * 0.03, base], fill=COAT, outline=INK)
    d.rectangle([cx + h * 0.03, base - h * 0.08, cx + h * 0.1, base], fill=COAT, outline=INK)


def sheep(d, cx, cy, s, extra=None):
    for dx, dy in [(-0.5, 0), (0, -0.25), (0.5, 0), (-0.25, 0.2), (0.25, 0.2)]:
        d.ellipse([cx + dx * s - s * 0.45, cy + dy * s - s * 0.4, cx + dx * s + s * 0.45, cy + dy * s + s * 0.4], fill=WHITE, outline=INK, width=3)
    d.ellipse([cx + s * 0.75, cy - s * 0.3, cx + s * 1.2, cy + s * 0.15], fill=(96, 86, 86), outline=INK)
    for lx in (-0.4, -0.1, 0.2, 0.5):
        d.rectangle([cx + lx * s, cy + s * 0.5, cx + lx * s + s * 0.1, cy + s * 0.85], fill=INK)
    if extra:
        extra(d, cx, cy, s)


IMG = {
    # 第 1 章：书里那幅"蟒蛇吞猛兽"的画
    "boa-beast": art("ill-boa-beast", 900, 520, lambda d, W, H: (
        d.ellipse([W * 0.55, H * 0.3, W * 0.85, H * 0.75], fill=(196, 128, 64), outline=INK, width=4),   # 猛兽
        d.ellipse([W * 0.78, H * 0.32, W * 0.9, H * 0.48], fill=(196, 128, 64), outline=INK, width=4),
        d.arc([W * 0.05, H * 0.15, W * 0.7, H * 0.95], 120, 400, fill=BOA, width=46),                      # 盘起来的蛇
        d.ellipse([W * 0.6, H * 0.18, W * 0.74, H * 0.36], fill=BOA, outline=INK, width=4),               # 蛇头
    )),
    "drawing1": art("ill-drawing-1", 900, 420, boa_outside),
    "drawing2": art("ill-drawing-2", 900, 420, boa_inside),
    "prince": art("ill-prince", 520, 820, lambda d, W, H: prince(d, W / 2, H - 10, H - 30)),
    "sheep-sick": art("ill-sheep-sick", 520, 360, lambda d, W, H: sheep(d, W * 0.42, H * 0.5, 90, lambda d, cx, cy, s: d.text((cx + s * 1.1, cy - s * 0.9), "ahem!", font=font(40), fill=INK))),
    "sheep-ram": art("ill-sheep-ram", 520, 360, lambda d, W, H: sheep(d, W * 0.42, H * 0.5, 90, lambda d, cx, cy, s: d.arc([cx + s * 0.55, cy - s * 0.75, cx + s * 1.15, cy - s * 0.05], 180, 40, fill=INK, width=12))),
    "sheep-old": art("ill-sheep-old", 520, 360, lambda d, W, H: sheep(d, W * 0.42, H * 0.5, 90, lambda d, cx, cy, s: d.line([(cx + s * 0.9, cy + s * 0.1), (cx + s * 1.0, cy + s * 0.55)], fill=WHITE, width=16))),
    # 箱子：上面留出空白，给"你的羊"探出头
    "box": art("ill-box", 640, 560, lambda d, W, H: (
        d.rectangle([90, 220, W - 90, H - 20], fill=BOX, outline=INK, width=5),
        [d.ellipse([x, 360, x + 30, 390], fill=INK) for x in (210, 305, 400)],
    )),
    "planet": art("ill-planet", 800, 800, lambda d, W, H: (
        d.ellipse([20, 20, W - 20, H - 20], fill=PLANET, outline=INK, width=6),
        # 只用第 3 章已经出现的东西做标记（转起来看得出转了一圈）：装羊的箱子、石子、几簇草
        # 不画火山 / 玫瑰 / 嫩芽——那是第 5、7–9 章才揭晓的，不提前剧透
        d.rectangle([W * 0.16, H * 0.36, W * 0.28, H * 0.46], fill=BOX, outline=INK, width=3),           # 装羊的箱子
        [d.ellipse([W * x - 10, H * y - 7, W * x + 10, H * y + 7], fill=(160, 140, 118), outline=INK, width=2) for x, y in [(0.72, 0.2), (0.8, 0.72), (0.38, 0.86)]],
        [d.line([(W * x, H * y), (W * x + dx, H * y - 22)], fill=(110, 140, 90), width=4) for x, y in [(0.6, 0.9), (0.86, 0.4)] for dx in (-8, 0, 8)],
    )),
    "walker": art("ill-walker", 260, 410, lambda d, W, H: prince(d, W / 2, H - 6, H - 16)),
}

# ---------------------------------------------------------------- 原书插图位置 → 我们的插图 + 魔法
# kind:
#   still    静止的插图
#   living   一直在轻轻动（活的画面）
#   appear   读到 cue 那一段才出现（style: draw = 像被一笔笔画出来 / fade = 慢慢显形）
#   reveal   from → to；cue 后发光邀请，孩子点一下用光"照进去"揭晓；auto = 读到就自动揭晓
#   box      你的羊：读到 cue 时朗读停下，请孩子画羊；sleepCue 时箱子里打呼噜
#   spin     小星球：左右拖动，他就一直往前走；cue 后轻轻晃动邀请
ILLUSTRATIONS = {
    "c01-img1": {"image": "boa-beast", "h": 0.27, "kind": "living"},
    "c01-img2": {"image": "drawing1", "h": 0.22, "kind": "still"},
    "c01-img3": {"image": "drawing1", "to": "drawing2", "h": 0.22, "kind": "reveal", "cue": "c01-p06"},
    "c02-img1": {"image": "prince", "h": 0.42, "kind": "appear", "style": "fade", "cue": "c02-p06"},
    "c02-img2": {"image": "sheep-sick", "h": 0.18, "kind": "appear", "style": "draw", "cue": "c02-p15"},
    "c02-img3": {"image": "sheep-ram", "h": 0.18, "kind": "appear", "style": "draw", "cue": "c02-p18"},
    "c02-img4": {"image": "sheep-old", "h": 0.18, "kind": "appear", "style": "draw", "cue": "c02-p21"},
    "c02-img5": {"image": "box", "h": 0.28, "kind": "box", "cue": "c02-p25", "sleepCue": "c02-p32"},
    "c03-img1": {"image": "planet", "walker": "walker", "h": 0.4, "kind": "spin", "cue": "c03-p25"},
}

# 挂在原文词上的魔法（不在插图上）
EFFECTS = [
    {"kind": "write", "para": "c00-p03", "note": "献词被作者亲手改写：第二行像墨水一样一笔笔写出来"},
    {"kind": "ask", "para": "c01-p04", "image": "drawing1", "question": "What do you see?",
     "choices": [["🎩", "A hat"], ["🐍", "A snake"], ["❓", "Something else"]], "reply": "Let's see what the grown-ups said…",
     "note": "延迟判断：先问孩子，不评判，再读大人们的答案"},
    {"kind": "ask", "para": "c01-p10", "image": "drawing1",
     "question": "Show Drawing Number One to a grown-up near you. What do they see?",
     "choices": [["🎩", "A hat"], ["🐘", "An elephant in a boa"]], "reply": "", "note": "亲子共读：轮到孩子测试大人"},
    {"kind": "bells", "para": "c03-p08", "word": "laughter", "note": "他的笑声 = 一串小铃铛（第 26 章星星会用同样的笑声）"},
    {"kind": "bells", "para": "c03-p23", "word": "laughing"},
    {"kind": "sticker", "para": "c03-p14", "word": "sheep", "note": "他从口袋里拿出的，是你画的那只羊"},
]

SPEAKERS = {"prince": ("小王子", "The little prince"), "pilot": ("飞行员", "The pilot"), "grownups": ("大人们", "The grown-ups")}
PRINCE = {"c02-p03", "c02-p05", "c02-p10", "c02-p12", "c02-p14", "c02-p17", "c02-p20", "c02-p22", "c02-p27", "c02-p29", "c02-p32",
          "c03-p02", "c03-p05", "c03-p07", "c03-p09", "c03-p13", "c03-p18", "c03-p21", "c03-p24", "c03-p27", "c03-p29"}
PILOT = {"c02-p04", "c02-p08", "c02-p25", "c02-p28", "c02-p30", "c03-p03", "c03-p06", "c03-p11", "c03-p16", "c03-p19", "c03-p22", "c03-p25"}
GROWN = {"c01-p05"}
MAX_WORDS = 34
CHAPTER_TITLE = {0: "", 1: "I", 2: "II", 3: "III"}


def chunks(text):
    """长段落按句子切成几段朗读单位（只切不改，拼回去就是原文）。"""
    if "\n" in text:
        return [text]
    sentences = re.split(r'(?<=[.!?…:])\s+(?=[A-Z"(])', text)
    out, cur = [], ""
    for s in sentences:
        if cur and len((cur + " " + s).split()) > MAX_WORDS:
            out.append(cur)
            cur = s
        else:
            cur = (cur + " " + s).strip()
    if cur:
        out.append(cur)
    assert " ".join(out) == text, f"切分改动了原文：{text[:40]}"
    return out


def build():
    flow = []
    for ch in FR[:4]:
        n = ch["chapter"]
        flow.append({"type": "chapter", "chapter": n, "label": CHAPTER_TITLE[n],
                     "title": "Dedication" if n == 0 else f"Chapter {CHAPTER_TITLE[n]}"})
        for b in ch["blocks"]:
            if b["type"] == "illustration":
                spec = ILLUSTRATIONS.get(b["id"])
                if not spec:
                    continue
                item = {"type": "img", "id": b["id"], **spec, "image": IMG[spec["image"]]}
                for k in ("to", "walker"):
                    if k in spec:
                        item[k] = IMG[spec[k]]
                flow.append(item)
                continue
            pid = b["id"]
            who = "prince" if pid in PRINCE else "pilot" if pid in PILOT else "grownups" if pid in GROWN else None
            zh, en = SPEAKERS[who] if who else ("", "")
            passages = [{"id": f"lp-{pid}-{k + 1}", "para": pid, "speaker": zh, "speakerEn": en,
                         "text": piece, "textEn": piece, "audio": None} for k, piece in enumerate(chunks(EN[pid]))]
            style = "center" if n == 0 and pid in ("c00-p01", "c00-p03") else None
            flow.append({"type": "p", "para": pid, "style": style, "passages": passages})
    effects = []
    for e in EFFECTS:
        e = dict(e)
        if "image" in e:
            e["image"] = IMG[e["image"]]
        effects.append(e)
    # 封面
    W, H = 888, 1000
    img = Image.new("RGB", (W, H), (36, 46, 88))
    d = ImageDraw.Draw(img)
    d.ellipse([W / 2 - 170, 200, W / 2 + 170, 540], fill=PLANET, outline=INK, width=6)
    prince(d, W / 2, 230, 200)
    d.text((W / 2, 660), "The Little Prince", font=font(72), fill=(246, 238, 220), anchor="mm")
    d.text((W / 2, 750), "Book One", font=font(40), fill=(200, 204, 226), anchor="mm")
    img.save(ART / "cover.png")
    book = {
        "schemaVersion": 3,
        "format": "illustrated",
        "title": "The Little Prince · Book One",
        "titleEn": "The Little Prince · Book One",
        "language": "en",
        "languages": ["en"],
        "adaptation": "Antoine de Saint-Exupéry, Le Petit Prince (1943) — 献词与第 1–3 章，原文全文。英文为本项目从法语原文自译。插图为灰盒占位，放在作者原书插图的位置。",
        "pageGeometry": {"pageWidth": 0.888, "pageHeight": 1, "coordinateUnits": "book"},
        "bookmarks": {"schemaVersion": 1, "storageKey": "little-prince-1/illustrated/v1"},
        "chapters": [{"id": "vol-1", "title": "Book One", "titleEn": "Book One"}],
        # 正式封面（tools/make_cover.py 画的）优先，没有就用灰盒封面
        "assets": [{"id": "cover-art", "type": "cover", "role": "cover",
                    "file": "assets/lp/cover.png" if (ROOT / "assets" / "lp" / "cover.png").exists() else f"{REL}/cover.png"}],
        "covers": {"front": "cover-art"},
        "flow": flow,
        "effects": effects,
        # spreads / spreadOrder 由 js/pagebook.js 按真实字体分页后生成
        "spreads": [],
        "spreadOrder": [],
    }
    OUT.write_text(json.dumps(book, ensure_ascii=False, indent=1))
    paras = sum(1 for f in flow if f["type"] == "p")
    words = sum(len(p["textEn"].split()) for f in flow if f["type"] == "p" for p in f["passages"])
    print(f"写出 {OUT.relative_to(ROOT)}：{paras} 段原文，{words} 词，{sum(1 for f in flow if f['type'] == 'img')} 幅插图，{len(effects)} 个词上的魔法")


build()
