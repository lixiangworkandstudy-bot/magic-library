"""
make_assets.py — 程序化生成《纸月亮》样片的剪纸风素材（零出图成本）。

思路 / Why:
  立体书的"手感"主要来自三件事：纸片分层、层与层之间的投影、纸张纹理。
  这三件事都可以用代码近似出来，所以样片阶段不用花钱出图，
  先把构图、纵深、翻页节奏调对；之后把 PNG 换成 AI 或手绘素材即可，book.json 不用大改。

输出:
  assets/art/*.png        带透明通道的纸片（standee）和页面底纹（ground）
  assets/art/*-mask.png   纸片背面的剪影遮罩（book3d.js 用它画纸片背面的白纸）

运行:
  python3 tools/make_assets.py
"""

import math
import random
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

OUT = Path(__file__).resolve().parent.parent / "assets" / "art"
OUT.mkdir(parents=True, exist_ok=True)

SUPERSAMPLE = 2          # 先按 2 倍尺寸画，最后缩小 → 边缘抗锯齿
random.seed(7)           # 固定随机种子：每次生成的图完全一样，方便对比调整前后

# ---------------------------------------------------------------- 调色板（剪纸常用的低饱和色）
PAPER = (239, 228, 204)
NIGHT_DEEP = (46, 58, 92)
NIGHT_MID = (70, 86, 124)
NIGHT_FAR = (104, 118, 150)
MOON = (246, 226, 160)
MOON_SHADE = (228, 200, 128)
FOX = (214, 112, 58)
FOX_DARK = (170, 82, 42)
FOX_CREAM = (244, 232, 210)
PINE = (58, 98, 80)
PINE_DARK = (40, 74, 62)
BARK = (110, 76, 52)
GRASS = (92, 132, 86)
GRASS_DARK = (66, 104, 70)
MUSH_RED = (196, 72, 58)
POND = (98, 140, 160)


# ---------------------------------------------------------------- 分层剪纸合成器

class FilledDraw:
    """
    遮罩画笔：Pillow 的 polygon/ellipse 默认不填充，这里统一补上 fill=255（白=有纸），
    这样每个形状函数里只写形状本身，不用反复写 fill。
    """

    def __init__(self, mask):
        self._draw = ImageDraw.Draw(mask)

    def __getattr__(self, shape_name):
        method = getattr(self._draw, shape_name)
        return lambda *args, **kwargs: method(*args, **{"fill": 255, **kwargs})


class PaperCut:
    """
    一张"剪纸片"：由多层纸按顺序叠起来。
    每叠上一层，就在下面已有的纸上投一小块阴影（模拟纸片之间的厚度），
    最后给整体轮廓描一圈深色边（模拟裁切边），再加纸纹。
    """

    def __init__(self, width, height):
        self.w, self.h = width * SUPERSAMPLE, height * SUPERSAMPLE
        self.color = Image.new("RGB", (self.w, self.h), (0, 0, 0))
        self.alpha = Image.new("L", (self.w, self.h), 0)

    def s(self, v):
        """把设计坐标（1 倍）换算成画布坐标（2 倍）。"""
        return v * SUPERSAMPLE

    def layer(self, color, draw_fn, shadow=True):
        """叠一层纸。draw_fn(draw, s) 在灰度遮罩上用白色画出这层纸的形状。"""
        mask = Image.new("L", (self.w, self.h), 0)
        draw_fn(FilledDraw(mask), self.s)

        if shadow:
            # 层间投影：本层形状往右下错开、模糊，压暗下面已存在的纸
            offset = ImageChops.offset(mask, self.s(3), self.s(4))
            soft = offset.filter(ImageFilter.GaussianBlur(self.s(4)))
            soft = ImageChops.multiply(soft, self.alpha)          # 只落在已有纸面上
            dark = Image.new("RGB", (self.w, self.h), (20, 16, 12))
            shade = soft.point(lambda v: int(v * 0.45))
            self.color = Image.composite(dark, self.color, shade)

        self.color = Image.composite(Image.new("RGB", (self.w, self.h), color), self.color, mask)
        self.alpha = ImageChops.lighter(self.alpha, mask)

    def finish(self, name, edge=True):
        img = self.color.copy()
        if edge:
            # 轮廓描边：外轮廓向内收一点，差值就是一圈细边，压暗它
            eroded = self.alpha.filter(ImageFilter.MinFilter(self.s(3) | 1))
            rim = ImageChops.subtract(self.alpha, eroded).point(lambda v: int(v * 0.35))
            img = Image.composite(Image.new("RGB", img.size, (30, 22, 16)), img, rim)
        img = add_grain(img, strength=10)
        rgba = img.convert("RGBA")
        rgba.putalpha(self.alpha)
        final = rgba.resize((self.w // SUPERSAMPLE, self.h // SUPERSAMPLE), Image.LANCZOS)
        final.save(OUT / f"{name}.png")

        # 背面遮罩：白=有纸，黑=透明（three.js alphaMap 读取颜色通道）
        mask = final.getchannel("A").convert("RGB")
        mask.save(OUT / f"{name}-mask.png")

        # 记录可见区域（alphaBounds，归一化 [x, y, w, h]），写 book.json 时要用
        bbox = final.getchannel("A").point(lambda v: 255 if v > 110 else 0).getbbox()
        W, H = final.size
        bounds = [round(bbox[0] / W, 3), round(bbox[1] / H, 3),
                  round((bbox[2] - bbox[0]) / W, 3), round((bbox[3] - bbox[1]) / H, 3)]
        print(f"{name:<18} {W}x{H}  alphaBounds={bounds}")
        return bounds


def add_grain(img, strength=8):
    """纸纹：逐像素加一点随机明暗噪声，再轻微模糊成纤维感。"""
    noise = Image.effect_noise(img.size, strength * 3).filter(ImageFilter.GaussianBlur(0.8))
    noise_rgb = Image.merge("RGB", [noise] * 3)
    # 128 为中性灰：>128 提亮，<128 压暗
    return ImageChops.add(ImageChops.subtract(img, Image.new("RGB", img.size, (6, 6, 6))),
                          ImageChops.subtract(noise_rgb, Image.new("RGB", img.size, (122, 122, 122))))


def wave_polygon(width, base_y, amplitude, wavelength, phase, bottom):
    """一条起伏的山脊线 → 闭合多边形（用来剪远山）。"""
    pts = [(0, bottom)]
    for x in range(0, width + 1, 8):
        y = base_y + amplitude * math.sin(x / wavelength + phase) \
            + amplitude * 0.45 * math.sin(x / (wavelength * 0.37) + phase * 2.1)
        pts.append((x, y))
    pts.append((width, bottom))
    return pts


# ---------------------------------------------------------------- 纸片：背景层

def night_hills():
    """背景幕：三层远山 + 月亮 + 星星。横跨整个跨页（crossGutter）。"""
    W, H = 1600, 420
    pc = PaperCut(W, H)
    s = pc.s
    pc.layer(NIGHT_FAR, lambda d, s: d.polygon([(s(x), s(y)) for x, y in wave_polygon(W, 150, 40, 90, 0.3, H)]), shadow=False)
    pc.layer(MOON, lambda d, s: d.ellipse([s(1130), s(30), s(1250), s(150)]))
    pc.layer(MOON_SHADE, lambda d, s: d.ellipse([s(1160), s(40), s(1260), s(140)]), shadow=False)
    pc.layer(NIGHT_MID, lambda d, s: d.polygon([(s(x), s(y)) for x, y in wave_polygon(W, 230, 45, 70, 1.7, H)]))
    pc.layer(NIGHT_DEEP, lambda d, s: d.polygon([(s(x), s(y)) for x, y in wave_polygon(W, 310, 30, 55, 4.2, H)]))
    for _ in range(26):
        x, y, r = random.randint(40, W - 40), random.randint(20, 120), random.choice([4, 5, 7])
        if 1100 < x < 1280:
            continue
        pc.layer(MOON, lambda d, s, x=x, y=y, r=r: d.ellipse([s(x - r), s(y - r), s(x + r), s(y + r)]), shadow=False)
    return pc.finish("bg-night-hills")


def moon_sky():
    """第三跨页的背景：只有高悬的月亮和几片云，给水面倒影留出空间。"""
    W, H = 1600, 380
    pc = PaperCut(W, H)
    pc.layer(NIGHT_FAR, lambda d, s: d.polygon([(s(x), s(y)) for x, y in wave_polygon(W, 290, 22, 120, 2.0, H)]), shadow=False)
    pc.layer(MOON, lambda d, s: d.ellipse([s(740), s(20), s(880), s(160)]))
    pc.layer(MOON_SHADE, lambda d, s: d.ellipse([s(770), s(28), s(886), s(150)]), shadow=False)
    for cx, cy in [(420, 150), (1180, 120)]:
        pc.layer((210, 214, 226), lambda d, s, cx=cx, cy=cy: [
            d.ellipse([s(cx - 90), s(cy - 20), s(cx + 90), s(cy + 30)]),
            d.ellipse([s(cx - 40), s(cy - 50), s(cx + 50), s(cy + 20)])])
    pc.layer(NIGHT_DEEP, lambda d, s: d.polygon([(s(x), s(y)) for x, y in wave_polygon(W, 340, 16, 60, 0.4, H)]))
    return pc.finish("bg-moon-sky")


# ---------------------------------------------------------------- 纸片：中景（角色 / 建筑）

def fox(name, facing_left=True):
    """主角小狐狸：坐姿，身体、尾巴、头、耳朵、白肚皮分层叠起来。"""
    W, H = 360, 420
    pc = PaperCut(W, H)

    def mirror(points):
        return [(W - x, y) if not facing_left else (x, y) for x, y in points]

    def poly(points):
        return lambda d, s: d.polygon([(s(x), s(y)) for x, y in mirror(points)])

    def ell(box):
        x0, y0, x1, y1 = box
        if not facing_left:
            x0, x1 = W - x1, W - x0
        return lambda d, s: d.ellipse([s(x0), s(y0), s(x1), s(y1)])

    # 尾巴（最底层）：一条弯弯的大尾巴，尖端是奶油色
    pc.layer(FOX_DARK, poly([(230, 400), (300, 360), (345, 280), (330, 200), (300, 250), (270, 330), (200, 380)]), shadow=False)
    pc.layer(FOX_CREAM, poly([(345, 280), (330, 200), (312, 232), (322, 290)]))
    # 身体
    pc.layer(FOX, ell((110, 190, 290, 410)))
    # 白肚皮
    pc.layer(FOX_CREAM, ell((120, 230, 200, 400)))
    # 前腿
    pc.layer(FOX_DARK, poly([(135, 330), (160, 330), (165, 412), (130, 412)]))
    # 头：朝左的尖脸
    pc.layer(FOX, poly([(60, 190), (130, 110), (220, 120), (235, 200), (170, 235)]))
    pc.layer(FOX_CREAM, poly([(60, 190), (120, 175), (170, 235)]))
    # 耳朵
    pc.layer(FOX_DARK, poly([(130, 115), (135, 40), (180, 118)]))
    pc.layer(FOX_DARK, poly([(185, 120), (215, 50), (230, 150)]))
    # 鼻子和眼睛
    pc.layer((40, 30, 26), ell((52, 180, 70, 198)), shadow=False)
    pc.layer((40, 30, 26), ell((138, 148, 152, 162)), shadow=False)
    return pc.finish(name)


def pine_tree():
    """中景的松树：三层三角形树冠 + 树干。"""
    W, H = 300, 560
    pc = PaperCut(W, H)
    pc.layer(BARK, lambda d, s: d.rectangle([s(132), s(400), s(168), s(560)]), shadow=False)
    for i, (top, bottom, half) in enumerate([(250, 450, 140), (130, 330, 110), (20, 210, 80)]):
        color = PINE_DARK if i % 2 == 0 else PINE
        pc.layer(color, lambda d, s, t=top, b=bottom, h=half: d.polygon(
            [(s(150), s(t)), (s(150 + h), s(b)), (s(150 - h), s(b))]))
    return pc.finish("mid-pine")


# ---------------------------------------------------------------- 纸片：前景（低矮道具）

def grass_tufts():
    W, H = 420, 160
    pc = PaperCut(W, H)
    for layer_index, color in enumerate([GRASS_DARK, GRASS]):
        def blades(d, s, li=layer_index):
            for i in range(14):
                x = 20 + i * 28 + li * 12
                tip_h = random.randint(40, 140)
                lean = random.randint(-25, 25)
                d.polygon([(s(x - 10), s(H)), (s(x + lean), s(H - tip_h)), (s(x + 10), s(H))])
        pc.layer(color, blades, shadow=layer_index > 0)
    return pc.finish("fg-grass")


def mushrooms():
    W, H = 360, 200
    pc = PaperCut(W, H)
    for cx, cap, stem_h in [(90, 70, 70), (210, 95, 100), (300, 50, 50)]:
        pc.layer(FOX_CREAM, lambda d, s, cx=cx, cap=cap, sh=stem_h: d.rectangle(
            [s(cx - cap * 0.22), s(H - sh), s(cx + cap * 0.22), s(H)]), shadow=False)
        pc.layer(MUSH_RED, lambda d, s, cx=cx, cap=cap, sh=stem_h: d.pieslice(
            [s(cx - cap), s(H - sh - cap * 0.8), s(cx + cap), s(H - sh + cap * 0.8)], 180, 360))
        pc.layer(FOX_CREAM, lambda d, s, cx=cx, cap=cap, sh=stem_h: [
            d.ellipse([s(cx + dx * cap - 7), s(H - sh - cap * 0.45 + dy) , s(cx + dx * cap + 7), s(H - sh - cap * 0.45 + dy + 14)])
            for dx, dy in [(-0.45, 10), (0.1, -8), (0.5, 12)]], shadow=False)
    return pc.finish("fg-mushrooms")


def reeds():
    W, H = 300, 320
    pc = PaperCut(W, H)
    for i, x in enumerate([40, 90, 150, 200, 255]):
        top = 40 + (i * 37) % 90
        pc.layer(GRASS_DARK, lambda d, s, x=x, t=top: d.polygon(
            [(s(x - 4), s(H)), (s(x - 2), s(t + 60)), (s(x + 2), s(t + 60)), (s(x + 4), s(H))]), shadow=False)
        pc.layer(BARK, lambda d, s, x=x, t=top: d.ellipse([s(x - 11), s(t), s(x + 11), s(t + 70)]))
    return pc.finish("fg-reeds")


# ---------------------------------------------------------------- 页面底纹（印在纸上的地面，不立起来）

def ground(name, tint, printed=None):
    """页面底纹：纸色 + 地面色的渐变 + 可选的'印刷细节'（小路、水塘）。"""
    # 注意：运行时把一张图当作"整个跨页"——左页取左半、右页取右半（见 book3d.js 的 uv 映射）
    # 所以宽度 = 两页宽 = 2 × 888，比例与 book.json 的 pageWidth:pageHeight = 0.888:1 一致
    W, H = 1776, 1000
    img = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(img)
    # 从页面远端（上）到近端（下）越来越接近地面色：让纸片"站"在地面上
    for y in range(H):
        t = min(1, max(0, (y - 120) / (H - 120)))
        c = tuple(int(PAPER[i] * (1 - t * 0.55) + tint[i] * t * 0.55) for i in range(3))
        d.line([(0, y), (W, y)], fill=c)
    if printed:
        printed(d, W, H)
    img = add_grain(img, strength=12)
    img.save(OUT / f"{name}.png")
    print(f"{name:<18} {W}x{H}  (ground)")


def printed_path(d, W, H):
    # 小路从右页近处蜿蜒伸向远方的山（坐标是整个跨页的比例，0.5 = 书脊）
    d.polygon([(W * 0.62, H), (W * 0.72, H * 0.45), (W * 0.77, H * 0.45), (W * 0.9, H)], fill=(222, 206, 170))


def printed_pond(d, W, H):
    # 水塘整个落在右页（x > 0.5），离书脊留一点边
    cx, cy = W * 0.76, H * 0.6
    d.ellipse([W * 0.56, H * 0.38, W * 0.97, H * 0.84], fill=POND)
    d.ellipse([cx - 70, cy - 55, cx + 70, cy + 55], fill=MOON)                 # 水里的月亮
    for r in range(1, 4):
        d.ellipse([cx - 60 - 45 * r, cy - 14 * r - 30, cx + 60 + 45 * r, cy + 14 * r + 30],
                  outline=(150, 184, 196), width=3)


# ---------------------------------------------------------------- 封面

def cover():
    W, H = 888, 1000
    img = Image.new("RGB", (W, H), NIGHT_DEEP)
    d = ImageDraw.Draw(img)
    d.ellipse([W * 0.5 - 150, 150, W * 0.5 + 150, 450], fill=MOON)
    d.ellipse([W * 0.5 - 100, 160, W * 0.5 + 160, 440], fill=MOON_SHADE)
    for pts, c in [(wave_polygon(W, 700, 40, 70, 1.0, H), NIGHT_MID), (wave_polygon(W, 820, 30, 50, 3.0, H), (36, 46, 76))]:
        d.polygon(pts, fill=c)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/STHeiti Medium.ttc", 96)
        small = ImageFont.truetype("/System/Library/Fonts/STHeiti Light.ttc", 36)
        d.text((W / 2, 560), "纸月亮", font=font, fill=PAPER, anchor="mm")
        d.text((W / 2, 650), "一本剪纸立体书 · 样片", font=small, fill=(200, 196, 210), anchor="mm")
    except OSError:
        pass                                     # 没有中文字体时就不写字
    add_grain(img, 12).save(OUT / "cover.png")
    print("cover              888x1000")


if __name__ == "__main__":
    night_hills()
    moon_sky()
    fox("mid-fox-left", facing_left=True)
    fox("mid-fox-right", facing_left=False)
    pine_tree()
    grass_tufts()
    mushrooms()
    reeds()
    ground("ground-forest", GRASS, printed_path)
    ground("ground-pond", GRASS, printed_pond)
    cover()
