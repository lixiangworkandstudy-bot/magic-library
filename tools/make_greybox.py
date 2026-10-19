"""
make_greybox.py — 《圣诞前夜》灰盒样书（绘本行业叫 dummy，游戏行业叫 greybox）

用途 / Why:
  正式出图之前，先用纯色块把 11 个跨页搭出来，在引擎里翻一遍，检查：
  节奏、翻页悬念、每页镜头、文字会不会挡画面、短版能不能接上、蓝 / 金 / 共享红的对比。
  色块的颜色 = 脚本里的「主光」，形状 = 「主导形状」，位置 = 「景别与视角」。
  每块纸片上都印着标签，说明它将来是什么。

  脚本：stories/night-before-christmas.md（v3）
  这个文件是灰盒的唯一来源：改这里 → 重新运行 → 刷新页面。

输出:
  assets/greybox/nbc/*.png (+ -mask.png)   色块纸片、页面底纹、封面
  data/books/night-before-christmas.json    书稿（11 个跨页、中英文字、每页镜头、短版标记）

运行:
  python3 tools/make_greybox.py
"""

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "assets" / "greybox" / "nbc"
ART.mkdir(parents=True, exist_ok=True)
BOOK_OUT = ROOT / "data" / "books" / "night-before-christmas.json"
BOOK_OUT.parent.mkdir(parents=True, exist_ok=True)
REL = "assets/greybox/nbc"

# ---------------------------------------------------------------- 调色板（只用脚本里定义的几种"光"）
NIGHT = (38, 50, 92)         # 夜空
MOON_BLUE = (112, 142, 196)  # 月光蓝：屋外、魔法
SNOW = (226, 234, 246)       # 被月光照亮的雪
FROST = (214, 228, 242)      # 窗上的霜
GOLD = (236, 172, 72)        # 炉火金：屋里、家、安全
WARM_WALL = (112, 66, 40)    # 屋里的墙（暗，靠炉火照亮）
DARK_ROOM = (56, 46, 66)     # 熄了灯的卧室
WOOD = (132, 92, 58)
RED = (198, 34, 40)          # ★ 共享红：只给 孩子的睡帽 / 圣诞老人 / 「我」的袜子
GREY = (138, 138, 146)       # 前框（窗框、床柱、椅背）
CREAM = (244, 232, 208)
BROWN = (120, 84, 56)
CHERRY = (226, 98, 126)      # 樱桃鼻子：故意和共享红区分开
PINK = (242, 170, 160)
INK = (30, 24, 28)
WHITE = (250, 250, 250)

FONT_PATH = "/System/Library/Fonts/STHeiti Medium.ttc"


def font(size):
    try:
        return ImageFont.truetype(FONT_PATH, size)
    except OSError:
        return ImageFont.load_default()


# ---------------------------------------------------------------- 色块纸片

ASSETS = []          # book.json 的 assets 列表


def standee(name, W, H, draw_fn, label, role="midground"):
    """画一张色块纸片：draw_fn(d) 用纯色画形状；底部印一条标签，说明它将来是什么。"""
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    draw_fn(d, W, H)
    # 标签：白底小条，放在纸片底部（纸片是从底边立起来的，底部总在画面里）
    size = max(20, int(min(W, H) * 0.06))
    f = font(size)
    while d.textlength(label, font=f) > W - 40 and size > 14:   # 窄纸片：字号缩到放得下
        size -= 2
        f = font(size)
    tw = d.textlength(label, font=f)
    pad = 10
    box = [W / 2 - tw / 2 - pad, H - f.size - 3 * pad, W / 2 + tw / 2 + pad, H - pad]
    d.rounded_rectangle(box, radius=8, fill=(255, 255, 255, 235), outline=INK, width=2)
    d.text((W / 2, (box[1] + box[3]) / 2), label, font=f, fill=INK, anchor="mm")
    img.save(ART / f"{name}.png")
    img.getchannel("A").convert("RGB").save(ART / f"{name}-mask.png")
    bbox = img.getchannel("A").point(lambda v: 255 if v > 110 else 0).getbbox()
    bounds = [round(bbox[0] / W, 3), round(bbox[1] / H, 3),
              round((bbox[2] - bbox[0]) / W, 3), round((bbox[3] - bbox[1]) / H, 3)]
    ASSETS.append({"id": name, "type": "standee", "role": role,
                   "file": f"{REL}/{name}.png", "maskFile": f"{REL}/{name}-mask.png", "alphaBounds": bounds})
    return name


def plain(name, W, H, draw_fn, note=None):
    """机关贴图：透明底 PNG，由 js/mechanics.js 直接加载（不是立起来的纸片，所以不进 assets）。"""
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    draw_fn(d, W, H)
    if note:
        d.text((W / 2, H - 28), note, font=font(30), fill=INK, anchor="mm")
    img.save(ART / f"{name}.png")
    return f"{REL}/{name}.png"


def ground(name, top, bottom, printed=None):
    """页面底纹（整个跨页 1776×1000，左页取左半、右页取右半）：从远端到近端的渐变。"""
    W, H = 1776, 1000
    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=tuple(int(top[i] * (1 - t) + bottom[i] * t) for i in range(3)))
    if printed:
        printed(d, W, H)
    img.save(ART / f"{name}.png")
    ASSETS.append({"id": name, "type": "page-art", "role": "ground-only", "file": f"{REL}/{name}.png"})
    return name


def outline(d, shape, box, fill, **kw):
    getattr(d, shape)(box, fill=fill, outline=INK, width=4, **kw)


# ---------------------------------------------------------------- 常用小形状

def child_head(d, cx, cy, r):
    """孩子的头 + 共享红睡帽（三角帽 + 小绒球）。"""
    outline(d, "ellipse", [cx - r, cy - r, cx + r, cy + r], CREAM)
    d.polygon([(cx - r, cy - r * 0.3), (cx + r, cy - r * 0.3), (cx + r * 1.4, cy - r * 1.9)], fill=RED, outline=INK)
    d.ellipse([cx + r * 1.25, cy - r * 2.1, cx + r * 1.6, cy - r * 1.75], fill=WHITE, outline=INK)


def stocking(d, x, y, w, h, color, tag):
    d.rectangle([x, y, x + w, y + h * 0.75], fill=color, outline=INK, width=3)
    d.ellipse([x - w * 0.1, y + h * 0.55, x + w * 1.4, y + h], fill=color, outline=INK, width=3)
    d.rectangle([x - 4, y - 14, x + w + 4, y + 10], fill=WHITE, outline=INK, width=2)
    d.text((x + w / 2, y + h * 0.35), tag, font=font(int(w * 0.42)), fill=INK if color != RED else WHITE, anchor="mm")


def santa_face(d, cx, cy, r, wink=False, turned=0.0):
    """圣诞老人的脸：全是圆。turned = 侧脸程度（五官往一边挪）。"""
    shift = r * 0.35 * turned
    outline(d, "pieslice", [cx - r * 1.05, cy - r * 0.2, cx + r * 1.05, cy + r * 1.5], WHITE, start=0, end=180)  # 胡子
    outline(d, "ellipse", [cx - r, cy - r, cx + r, cy + r], CREAM)
    outline(d, "chord", [cx - r * 1.05, cy - r * 1.55, cx + r * 1.05, cy - r * 0.15], RED, start=180, end=360)    # 帽子
    d.rectangle([cx - r * 1.1, cy - r * 0.6, cx + r * 1.1, cy - r * 0.38], fill=WHITE, outline=INK, width=3)
    ex, ey, er = r * 0.34, cy - r * 0.08, r * 0.12
    for side in (-1, 1):
        x = cx + shift + side * ex
        if wink and side == 1:
            d.arc([x - er, ey - er, x + er, ey + er], 200, 340, fill=INK, width=6)       # 眨眼
        else:
            d.ellipse([x - er, ey - er, x + er, ey + er], fill=INK)
            d.ellipse([x - er * 0.2, ey - er * 0.6, x + er * 0.25, ey - er * 0.15], fill=WHITE)
        d.ellipse([x - r * 0.22, cy + r * 0.12, x + r * 0.22, cy + r * 0.42], fill=PINK)  # 脸蛋
    d.ellipse([cx + shift - r * 0.15, cy + r * 0.05, cx + shift + r * 0.15, cy + r * 0.33], fill=CHERRY, outline=INK, width=3)
    d.arc([cx + shift - r * 0.3, cy + r * 0.3, cx + shift + r * 0.3, cy + r * 0.62], 20, 160, fill=INK, width=5)


# ================================================================ 11 个跨页
#
# 每个 item：(assetId, layer, side, anchor[x, 深度], maxW, maxH, crossGutter, word)
#   anchor：page 坐标 x = 0 书脊 → 1 外沿；spread 坐标 x = 0 左外沿 → 1 右外沿；深度 0 = 远（页顶）→ 1 = 近
#   maxW 以单页宽为单位（2 = 整个跨页），maxH 以页高为单位
#
# camera：每页默认镜头（pitch = 镜头偏离正上方的角度，弧度；默认 1.08；越大越"平视/压低"，越小越俯视）
# levels：哪些等级会读到这一页（短版 = Level 1 只读 1 4 5 7 8 9 11）

SHORT = [1, 2, 3]   # 短版和完整版都有
FULL = [2, 3]       # 只在完整版

g_room = ground("g-room", (150, 102, 64), (196, 136, 74))
g_room_rug = ground("g-room-rug", (150, 102, 64), (196, 136, 74),
                    lambda d, W, H: d.ellipse([W * 0.56, H * 0.55, W * 0.98, H * 1.05], fill=(190, 160, 120), outline=INK, width=4))
g_dark = ground("g-dark-room", (70, 58, 80), (110, 88, 96))
g_snow = ground("g-snow", (186, 200, 228), SNOW)

SPREADS = []


def spread(n, title_zh, title_en, levels, camera, page_art, items, passages, note, mechanics=None):
    SPREADS.append(dict(n=n, title=title_zh, titleEn=title_en, levels=levels, camera=camera, mechanics=mechanics or [],
                        pageArt=page_art, items=items, passages=passages, note=note))


# ---- 1 安静的小屋 ----------------------------------------------------------
standee("s1-wall", 1600, 560, lambda d, W, H: (
    outline(d, "rectangle", [0, 0, W, H - 70], WARM_WALL),
    outline(d, "rectangle", [W * 0.74, 70, W * 0.9, 330], MOON_BLUE),
    d.line([(W * 0.82, 70), (W * 0.82, 330)], fill=GREY, width=10),
), "墙 · 窗外一抹月光蓝（远景）", "background")
standee("s1-fireplace", 760, 640, lambda d, W, H: (
    outline(d, "rectangle", [90, 210, W - 90, H - 70], GOLD),
    outline(d, "rectangle", [210, 330, W - 210, H - 70], INK),
    outline(d, "rectangle", [40, 150, W - 40, 210], CREAM),
    [stocking(d, 70 + i * 130, 215, 70, 140, RED if i == 2 else CREAM, t) for i, t in enumerate("宝姐我猫狗")],
), "壁炉 + 5 只袜子（「我」= 共享红）")
standee("s1-chair", 720, 320, lambda d, W, H: (
    outline(d, "rectangle", [40, 60, W - 40, H - 70], BROWN),
    outline(d, "rectangle", [40, 30, 140, H - 70], BROWN),
    outline(d, "rectangle", [W - 140, 30, W - 40, H - 70], BROWN),
), "扶手椅（水平线 = 安静）")
RUG = (178, 132, 96)
m1_flap = plain("m1-flap", 700, 420, lambda d, W, H: (
    d.rounded_rectangle([0, 0, W, H], radius=30, fill=RUG, outline=INK, width=6),
    [d.line([(x, H - 6), (x, H + 30)], fill=INK, width=4) for x in range(20, W, 40)],
    d.text((W / 2, H / 2), "掀开地毯角 ↑", font=font(64), fill=CREAM, anchor="mm"),
))
m1_mouse = plain("m1-mouse", 700, 420, lambda d, W, H: (
    d.rounded_rectangle([0, 0, W, H], radius=30, fill=(120, 86, 60)),               # 地毯下面的阴影
    outline(d, "ellipse", [W * 0.3, H * 0.4, W * 0.62, H * 0.8], GREY),              # 蜷着的身子
    outline(d, "ellipse", [W * 0.56, H * 0.48, W * 0.72, H * 0.72], GREY),           # 头
    outline(d, "ellipse", [W * 0.6, H * 0.36, W * 0.68, H * 0.5], PINK),             # 耳朵
    d.arc([W * 0.62, H * 0.56, W * 0.68, H * 0.62], 0, 180, fill=INK, width=4),      # 闭着的眼
    d.line([(W * 0.3, H * 0.62), (W * 0.15, H * 0.5)], fill=INK, width=5),           # 尾巴
    d.text((W * 0.82, H * 0.3), "Zzz", font=font(60), fill=CREAM, anchor="mm"),
))
spread(1, "安静的小屋", "The Quiet House", SHORT, {"pitch": 1.08}, {"left": g_room_rug, "right": g_room_rug}, [
    ("s1-wall", "background", "left", [0.5, 0.14], 2, 0.56, True, "house"),
    ("s1-fireplace", "midground", "left", [0.5, 0.45], 0.75, 0.6, False, "chimney"),
    ("s1-chair", "midground", "right", [0.45, 0.5], 0.6, 0.28, False, None),
], [
    ("'Twas the night before Christmas, when all through the house / Not a creature was stirring, not even a mouse;",
     "圣诞前一夜，屋里静悄悄，谁也不出声，小老鼠也睡着了。"),
    ("The stockings were hung by the chimney with care, / In hopes that St. Nicholas soon would be there.",
     "袜子一只只，挂在壁炉旁，等着圣诞老人，悄悄来拜访。"),
], "全景 · 旁观 · 水平线 · 炉火金", mechanics=[
    # 翻翻页：地毯角平躺在右页前面，铰链在远端；拖起来 / 点一下 → 掀开，下面是打呼噜的老鼠
    {"kind": "flap", "x": 0.56, "z": 0.27, "w": 0.46, "d": 0.27, "top": m1_flap, "under": m1_mouse,
     "sound": "snore", "word": "mouse"},
])

# ---- 2 钻进被窝 ------------------------------------------------------------
standee("s2-wall", 1600, 560, lambda d, W, H: (
    outline(d, "rectangle", [0, 0, W, H - 70], DARK_ROOM),
    d.rectangle([W * 0.12, 40, W * 0.125, H - 70], fill=GOLD),
    outline(d, "rectangle", [W * 0.78, 90, W * 0.9, 280], MOON_BLUE),
), "熄灯的卧室 · 门缝一线炉火金", "background")
standee("s2-bed", 980, 380, lambda d, W, H: (
    outline(d, "rectangle", [30, 150, W - 30, H - 70], CREAM),
    outline(d, "rectangle", [30, 110, 90, H - 70], WOOD),
    outline(d, "ellipse", [110, 120, 330, 210], WHITE),
    child_head(d, 230, 140, 52),
), "床（水平线）· 「我」戴共享红睡帽")
standee("s2-dream", 620, 560, lambda d, W, H: (
    outline(d, "ellipse", [40, 30, W - 40, H - 120], CREAM),
    [outline(d, "ellipse", [x, y, x + 70, y + 70], c) for x, y, c in
     [(150, 120, PINK), (300, 100, GOLD), (420, 180, MOON_BLUE), (220, 240, (170, 210, 150)), (360, 290, PINK)]],
), "梦泡泡：跳舞的糖果（转盘）")
standee("s2-post", 200, 640, lambda d, W, H: (
    outline(d, "rectangle", [60, 40, 140, H - 70], WOOD),
    outline(d, "ellipse", [40, 10, 160, 90], WOOD),
), "床柱（前框）", "foreground")
spread(2, "钻进被窝", "Snug in Bed", FULL, {"pitch": 1.08}, {"left": g_dark, "right": g_dark}, [
    ("s2-wall", "background", "left", [0.5, 0.14], 2, 0.56, True, None),
    ("s2-bed", "midground", "left", [0.55, 0.55], 0.9, 0.34, False, "bed"),
    ("s2-dream", "midground", "right", [0.45, 0.42], 0.6, 0.5, False, "dream"),
    ("s2-post", "foreground", "left", [0.88, 0.86], 0.2, 0.55, False, None),
], [
    ("The children were nestled all snug in their beds, / While visions of sugar-plums danced in their heads;",
     "孩子们钻进被窝，暖暖地躺好，梦里的糖果，蹦蹦又跳跳。"),
    ("And Mama in her kerchief, and I in my cap, / Had just settled down for a long winter's nap,",
     "妈妈包着头巾，我戴着睡帽，刚刚闭上眼，要睡个长长的觉——"),
    ("When out on the lawn there arose such a clatter,",
     "忽然，屋外“哗啦啦”一阵好大的响！"),
], "中景 · 旁观 · 水平线 · ⚡ 押韵对句被翻页劈开")

# ---- 3 冲到窗前 ------------------------------------------------------------
standee("s3-window", 1600, 600, lambda d, W, H: (
    outline(d, "rectangle", [0, 0, W, H - 70], (70, 76, 104)),
    outline(d, "rectangle", [W * 0.3, 60, W * 0.7, H - 110], FROST),
    [d.polygon([(W * 0.3 + i * 64, 60), (W * 0.3 + i * 64 + 40, 60), (W * 0.3 + i * 64 + 20, 60 + 70 + (i % 3) * 30)],
               fill=WHITE, outline=INK) for i in range(10)],
), "结霜的窗 · 冰凌尖角（擦霜 → 往上推窗）", "background")
standee("s3-shutter-l", 420, 560, lambda d, W, H: (
    d.polygon([(20, 20), (W - 20, 80), (W - 20, H - 70), (20, H - 70)], fill=WOOD, outline=INK),
), "百叶窗·左（翻开）")
standee("s3-shutter-r", 420, 560, lambda d, W, H: (
    d.polygon([(20, 80), (W - 20, 20), (W - 20, H - 70), (20, H - 70)], fill=WOOD, outline=INK),
), "百叶窗·右（翻开）")
standee("s3-child", 520, 620, lambda d, W, H: (
    d.polygon([(80, H - 70), (230, H - 70), (420, 200), (300, 170)], fill=CREAM, outline=INK),
    child_head(d, 360, 150, 60),
), "孩子背影冲向窗（大斜线）", "foreground")
spread(3, "冲到窗前", "To the Window", FULL, {"pitch": 1.18}, {"left": g_dark, "right": g_dark}, [
    ("s3-window", "background", "left", [0.5, 0.12], 2, 0.6, True, "window"),
    ("s3-shutter-l", "midground", "left", [0.42, 0.36], 0.42, 0.5, False, None),
    ("s3-shutter-r", "midground", "right", [0.42, 0.36], 0.42, 0.5, False, None),
    ("s3-child", "foreground", "left", [0.5, 0.82], 0.45, 0.5, False, None),
], [
    ("I sprang from my bed to see what was the matter.",
     "我一骨碌跳下床，要去看一看。"),
    ("Away to the window I flew like a flash, / Tore open the shutters and threw up the sash.",
     "像一道闪电，我冲到窗前，推开百叶窗，把窗户往上一掀！"),
], "中→近 · 进入孩子 · 全书唯一的尖角 + 斜线")

# ---- 4 拨开云 --------------------------------------------------------------
standee("s4-sky", 1600, 620, lambda d, W, H: (
    outline(d, "rectangle", [0, 0, W, H - 70], NIGHT),
    outline(d, "ellipse", [W / 2 - 150, 90, W / 2 + 150, 390], (248, 236, 190)),
    [outline(d, "ellipse", [x, y, x + 260, y + 110], (200, 206, 222)) for x, y in [(W / 2 - 300, 260), (W / 2 + 40, 140)]],
    [d.ellipse([W * 0.72 + i * 34, 120 - i * 6, W * 0.72 + i * 34 + 22, 140 - i * 6], fill=BROWN, outline=INK) for i in range(8)],
    d.rounded_rectangle([W * 0.66, 130, W * 0.71, 160], radius=6, fill=RED, outline=INK),
), "夜空 · 月亮在正中 · 雪橇从右往左（拨开云）", "background")
standee("s4-roofs", 1600, 300, lambda d, W, H: (
    [(outline(d, "rectangle", [x, 110, x + 220, H - 70], MOON_BLUE),
      d.polygon([(x - 20, 115), (x + 240, 115), (x + 110, 30)], fill=SNOW, outline=INK)) for x in range(40, W - 200, 300)],
), "雪地屋顶（水平线，亮得像白天）", "midground")
standee("s4-sill", 1600, 260, lambda d, W, H: (
    outline(d, "rectangle", [0, 90, W, 170], GREY),
    outline(d, "rectangle", [0, 0, 70, 170], GREY),
    outline(d, "rectangle", [W - 70, 0, W, 170], GREY),
    outline(d, "ellipse", [W * 0.4, 60, W * 0.46, 110], CREAM),
    outline(d, "ellipse", [W * 0.54, 60, W * 0.6, 110], CREAM),
), "窗框 + 窗台上孩子的手（前框 = 我的视线）", "foreground")
spread(4, "拨开云", "Who's There?", SHORT, {"pitch": 1.2}, {"left": g_snow, "right": g_snow}, [
    ("s4-sky", "background", "left", [0.5, 0.12], 2, 0.62, True, "moon"),
    ("s4-roofs", "midground", "left", [0.5, 0.5], 2, 0.22, True, "snow"),
    ("s4-sill", "foreground", "left", [0.5, 0.9], 2, 0.2, True, "window"),
], [
    ("The moon on the top of the new-fallen snow / Made it bright as the day on the houses below,",
     "月亮照着新下的雪，把屋顶照得像白天一样亮。"),
    ("When what to my wondering eyes should appear, / But a little sleigh, and eight tiny reindeer,",
     "我睁大眼睛——你猜我看见了什么？一辆小雪橇，八只小驯鹿，"),
    ("With a little old driver, so lively and quick, / I knew in a moment it must be St. Nick.",
     "还有一个小老头，又灵活又快，我一下子就知道：是圣诞老人来啦！"),
], "近→远 · 孩子的眼睛 · 月亮正中 · 雪橇在上半部")

# ---- 5 八只驯鹿 ------------------------------------------------------------
standee("s5-sky", 1600, 620, lambda d, W, H: (
    outline(d, "rectangle", [0, 0, W, H - 70], NIGHT),
    [d.ellipse([x, y, x + 8, y + 8], fill=WHITE) for x, y in
     [(120, 80), (400, 50), (700, 120), (1000, 60), (1300, 140), (1500, 40), (260, 260), (900, 300)]],
), "深夜空（大远景）", "background")


def team(d, W, H):
    # 驯鹿排成一条斜线冲向右上；雪橇（共享红）在队尾左下
    for i in range(8):
        x, y = 360 + i * 140, 470 - i * 48
        outline(d, "ellipse", [x, y, x + 110, y + 60], BROWN)
        d.line([(x + 95, y + 5), (x + 120, y - 30)], fill=INK, width=5)
        d.text((x + 55, y + 30), str(i + 1), font=font(34), fill=WHITE, anchor="mm")
    d.rounded_rectangle([80, 470, 300, 560], radius=20, fill=RED, outline=INK, width=4)


standee("s5-team", 1600, 640, team, "八只驯鹿：斜线冲向右上（点每只数 1–8）")
standee("s5-frame", 1600, 560, lambda d, W, H: (
    outline(d, "rectangle", [0, 0, 60, H - 70], GREY),
    outline(d, "rectangle", [W - 60, 0, W, H - 70], GREY),
), "窗框边缘", "foreground")
spread(5, "八只驯鹿的名字", "Dash Away All!", SHORT, {"pitch": 1.2}, {"left": g_snow, "right": g_snow}, [
    ("s5-sky", "background", "left", [0.5, 0.1], 2, 0.62, True, "sky"),
    ("s5-team", "midground", "left", [0.5, 0.42], 1.9, 0.55, True, "reindeer"),
    ("s5-frame", "foreground", "left", [0.5, 0.92], 2, 0.5, True, None),
], [
    ("More rapid than eagles his reindeer they came, / And he whistled, and shouted, and called them by name:",
     "驯鹿们飞得比老鹰还要快，圣诞老人吹着口哨，一个一个喊名字："),
    ("“Now, Dasher! now, Dancer! now, Prancer and Vixen! / On, Comet! on, Cupid! on, Donder and Blitzen!",
     "“冲冲！舞舞！蹦蹦，还有小狐！彗星！丘比！雷雷，还有闪闪！"),
    ("To the top of the porch! to the top of the wall! / Now dash away! dash away! dash away all!”",
     "飞上门廊！飞上墙头！快飞呀，快飞呀，大家一起飞！”"),
], "大远景 · 孩子仰望 · 斜线 · 蓝夜里唯一的红")

# ---- 6 屋顶上的蹄子声 ------------------------------------------------------


def cutaway(d, W, H):
    # 上半：屋顶（月光蓝）+ 屋顶上的驯鹿；下半：屋里（炉火金）；烟囱竖线贯穿上下
    d.polygon([(100, 300), (W - 100, 300), (W / 2, 40)], fill=MOON_BLUE, outline=INK)
    d.polygon([(100, 300), (W - 100, 300), (W / 2, 40)], outline=INK)
    for i in range(5):
        outline(d, "ellipse", [W * 0.3 + i * 70, 190 - i * 18, W * 0.3 + i * 70 + 50, 220 - i * 18], BROWN)
    outline(d, "rectangle", [100, 300, W - 100, H - 70], GOLD)
    outline(d, "rectangle", [W * 0.62, 20, W * 0.68, H - 140], GREY)
    outline(d, "rectangle", [W * 0.58, H - 200, W * 0.72, H - 70], INK)


standee("s6-house", 1600, 700, cutaway, "剖面：上=屋顶（蓝）/ 下=屋里（金）· 烟囱竖线连通上下", "background")
standee("s6-lamp", 240, 520, lambda d, W, H: (
    d.line([(W / 2, 0), (W / 2, 300)], fill=INK, width=6),
    outline(d, "ellipse", [W / 2 - 70, 280, W / 2 + 70, 420], GOLD),
), "吊灯（会晃）")
standee("s6-child", 300, 460, lambda d, W, H: (
    outline(d, "rectangle", [90, 230, 210, H - 70], CREAM),
    child_head(d, 150, 180, 55),
), "孩子抬头听", "foreground")
spread(6, "屋顶上的蹄子声", "Hooves on the Roof", FULL, {"pitch": 1.3}, {"left": g_room, "right": g_room}, [
    ("s6-house", "background", "left", [0.5, 0.12], 2, 0.72, True, "roof"),
    ("s6-lamp", "midground", "left", [0.45, 0.5], 0.25, 0.45, False, None),
    ("s6-child", "foreground", "right", [0.35, 0.8], 0.3, 0.38, False, None),
], [
    ("So up to the house-top the reindeer they flew, / With the sleigh full of toys, and St. Nicholas too.",
     "驯鹿们呼啦啦飞上了屋顶，拉着满满一雪橇玩具，还有圣诞老人。"),
    ("And then, in a twinkling, I heard on the roof / The prancing and pawing of each little hoof.",
     "一眨眼，我听见屋顶上——嗒嗒、嗒嗒，小蹄子跳呀跳。"),
], "剖面 · 全知 · 竖线 · 上蓝下金 · ⚡ 只听见没看见")

# ---- 7 扑通！ --------------------------------------------------------------
standee("s7-wall", 1600, 620, lambda d, W, H: (
    outline(d, "rectangle", [0, 0, W, H - 70], WARM_WALL),
    outline(d, "rectangle", [W / 2 - 100, 0, W / 2 + 100, 160], GREY),
    outline(d, "rectangle", [W / 2 - 300, 160, W / 2 + 300, H - 70], GOLD),
    outline(d, "rectangle", [W / 2 - 200, 240, W / 2 + 200, H - 70], INK),
), "墙 + 竖长的壁炉洞口（炉火金）", "background")


def santa_body(d, W, H):
    outline(d, "ellipse", [70, 360, W - 70, H - 70], RED)                  # 圆肚子
    d.rectangle([70, 560, W - 70, 600], fill=INK)                          # 腰带
    outline(d, "ellipse", [W - 210, 380, W - 20, 600], BROWN)             # 玩具袋（圆）
    santa_face(d, W / 2 - 30, 230, 130)


m7_santa = plain("m7-santa", 600, 900, santa_body)
m7_tab = plain("m7-tab", 360, 300, lambda d, W, H: (
    d.rounded_rectangle([20, 0, W - 20, H - 10], radius=24, fill=CREAM, outline=INK, width=6),
    d.text((W / 2, H * 0.36), "往下拉", font=font(64), fill=INK, anchor="mm"),
    d.text((W / 2, H * 0.7), "↓", font=font(90), fill=RED, anchor="mm"),
))
standee("s7-chair", 900, 300, lambda d, W, H: (
    outline(d, "rectangle", [40, 110, W - 40, H - 70], BROWN),
    child_head(d, W * 0.72, 95, 40),
), "椅背（前框）· 孩子躲在后面偷看", "foreground")
spread(7, "扑通！", "Down the Chimney", SHORT, {"pitch": 1.28}, {"left": g_room, "right": g_room}, [
    ("s7-wall", "background", "left", [0.5, 0.12], 2, 0.62, True, "chimney"),
    ("s7-chair", "foreground", "right", [0.5, 0.86], 0.75, 0.24, False, None),
], [
    ("As I drew in my head, and was turning around, / Down the chimney St. Nicholas came with a bound.",
     "我刚把头缩回来，转过身——扑通！圣诞老人从烟囱滑下来啦！"),
    ("He was dressed all in fur, from his head to his foot, / And his clothes were all covered with ashes and soot;",
     "他从头到脚，穿着毛茸茸的皮衣，衣服上沾满了黑黑的煤灰；"),
    ("A bundle of toys he had flung on his back, / And he looked like a toy-man just opening his pack.",
     "背上背着一大包玩具，就像卖玩具的人，正要打开包袱。"),
], "中景 · 孩子的眼睛 · 微仰视 · 竖 + 圆 · 蓝落进金", mechanics=[
    # 拉拉条：右页前沿伸出一条纸舌，往下（往自己这边）拉 → 圣诞老人从烟囱里"扑通"掉进壁炉前
    # clipY = 墙的上沿：他在这条线以上时被"藏在烟囱里"（看不见）
    {"kind": "drop", "figure": m7_santa, "x": 0.0, "z": -0.12, "h": 0.8, "clipY": 0.6,
     "tab": m7_tab, "tabX": 0.62, "sound": "thud", "word": "chimney"},
])

# ---- 8 他长什么样 ----------------------------------------------------------
standee("s8-wall", 1600, 560, lambda d, W, H: outline(d, "rectangle", [0, 0, W, H - 70], GOLD),
        "炉火金的墙", "background")


def face_side(d, W, H):
    outline(d, "pieslice", [60, 520, W - 60, H + 300], RED, start=180, end=360)   # 弯着的肩膀
    santa_face(d, W / 2, 380, 300, turned=1.0)


standee("s8-face", 1200, 900, face_side, "特写：他弯腰侧着脸在忙（点眼睛 / 脸蛋 / 鼻子 / 胡子 / 肚子）")
standee("s8-sack", 520, 420, lambda d, W, H: (
    outline(d, "ellipse", [40, 40, W - 40, H - 70], BROWN),
    [outline(d, "ellipse", [x, y, x + 80, y + 80], c) for x, y, c in [(140, 60, GOLD), (260, 30, MOON_BLUE), (330, 90, PINK)]],
), "打开的玩具包", "foreground")
spread(8, "他长什么样", "His Twinkling Eyes", SHORT, {"pitch": 1.25}, {"left": g_room, "right": g_room}, [
    ("s8-wall", "background", "left", [0.5, 0.1], 2, 0.56, True, None),
    ("s8-face", "midground", "left", [0.48, 0.45], 1.3, 0.82, True, "face"),
    ("s8-sack", "foreground", "right", [0.72, 0.86], 0.45, 0.3, False, "toy"),
], [
    ("His eyes—how they twinkled! his dimples, how merry! / His cheeks were like roses, his nose like a cherry!",
     "他的眼睛亮晶晶！小酒窝笑眯眯！脸蛋像玫瑰，鼻子像樱桃！"),
    ("His funny little mouth was drawn up like a bow, / And the beard on his chin was as white as the snow.",
     "小嘴弯弯，像一张小弓，胡子白白，像雪一样；"),
    ("He had a broad face and a little round belly, / That shook when he laughed, like a bowlful of jelly.",
     "圆圆的脸，圆圆的小肚子，一笑起来，像一碗果冻，晃呀晃呀晃。"),
    ("He was chubby and plump, a right jolly old elf, / And I laughed when I saw him, in spite of myself.",
     "他胖乎乎、圆滚滚，是个快乐的老精灵——我看着他，忍不住“噗”地笑出了声。"),
], "特写 · 孩子的眼睛 · 平视 · 满屏圆形 · ⚡ 笑出声")

# ---- 9 他发现我了！ --------------------------------------------------------


def glow(d, W, H):
    for i in range(10, 0, -1):
        t = i / 10
        c = tuple(int(GOLD[k] * (1 - t * 0.5) + WARM_WALL[k] * t * 0.5) for k in range(3))
        d.ellipse([W / 2 - W * 0.06 * i, (H - 70) / 2 - 55 * i, W / 2 + W * 0.06 * i, (H - 70) / 2 + 55 * i], fill=c)
    d.rectangle([0, 0, W, H - 70], outline=INK, width=4)


standee("s9-glow", 1600, 620, glow, "温暖的炉火光（深色背景会让这一刻变吓人）", "background")


standee("s9-shoulders", 1200, 360, lambda d, W, H: (
    outline(d, "pieslice", [40, 40, W - 40, H * 2], RED, start=180, end=360),
    outline(d, "pieslice", [W * 0.3, -40, W * 0.7, H * 0.8], WHITE, start=0, end=180),
), "他蹲下来（肩膀）")


def head(turned=0.0, wink=False):
    def draw(d, W, H):
        santa_face(d, W / 2, H * 0.52, W * 0.34, wink=wink, turned=turned)
    return draw


m9_side = plain("m9-head-side", 800, 800, head(turned=-1.0))
m9_front = plain("m9-head-front", 800, 800, head())
m9_wink = plain("m9-head-wink", 800, 800, head(wink=True))
spread(9, "他发现我了！", "He Sees Me!", SHORT, {"pitch": 1.32}, {"left": g_room, "right": g_room}, [
    ("s9-glow", "background", "left", [0.5, 0.1], 2, 0.62, True, None),
    ("s9-shoulders", "midground", "left", [0.5, 0.45], 1.3, 0.3, True, None),
], [
    ("A wink of his eye and a twist of his head / Soon gave me to know I had nothing to dread.",
     "他转过头，朝我眨了眨眼——我就知道，什么也不用怕。"),
], "大特写 · 被看见 · 正中对视 · 圆 · 金", mechanics=[
    # 转头：一张两面的纸卡，正面 = 侧脸（看着别处），背面 = 正脸（看着你）。
    # 翻到这页停 1.2 秒 → 纸卡慢慢翻过来 → 眨眼。点他 = 他再眨一次（孩子"眨眼回应"）
    {"kind": "turnHead", "side": m9_side, "front": m9_front, "wink": m9_wink,
     "x": 0.0, "z": -0.03, "y": 0.52, "size": 0.62, "delay": 1.2, "sound": "chime", "word": "wink"},
])

# ---- 10 装袜子 + 秘密暗号 ---------------------------------------------------
standee("s10-wall", 1600, 600, lambda d, W, H: (
    outline(d, "rectangle", [0, 0, W, H - 70], WARM_WALL),
    outline(d, "rectangle", [W / 2 - 360, 200, W / 2 + 360, H - 70], GOLD),
    outline(d, "rectangle", [W / 2 - 400, 160, W / 2 + 400, 205], CREAM),
), "墙 + 壁炉", "background")


def stocking_row(d, W, H):
    d.rectangle([20, 30, W - 20, 60], fill=CREAM, outline=INK, width=3)
    for i, t in enumerate("宝姐我猫狗"):
        stocking(d, 80 + i * 300, 70, 150, 330, RED if i == 2 else CREAM, t)


standee("s10-stockings", 1600, 520, stocking_row, "5 只袜子：把玩具拖进对的袜子（「我」= 共享红）")
standee("s10-sack", 760, 380, lambda d, W, H: (
    outline(d, "chord", [30, 40, W - 30, H + 160], BROWN, start=180, end=360),
    outline(d, "ellipse", [120, 60, 200, 140], GOLD),          # 拨浪鼓
    outline(d, "ellipse", [250, 40, 350, 140], PINK),          # 毛线球
    outline(d, "rectangle", [400, 80, 520, 120], WHITE),       # 骨头
    outline(d, "ellipse", [560, 50, 660, 150], MOON_BLUE),     # 小鼓
), "玩具口袋（前框）：拨浪鼓 / 毛线球 / 骨头 / 小鼓", "foreground")
spread(10, "装袜子 + 秘密暗号", "Our Secret Sign", FULL, {"pitch": 1.08}, {"left": g_room, "right": g_room}, [
    ("s10-wall", "background", "left", [0.5, 0.1], 2, 0.6, True, None),
    ("s10-stockings", "midground", "left", [0.5, 0.42], 1.7, 0.5, True, "stocking"),
    ("s10-sack", "foreground", "left", [0.5, 0.88], 0.9, 0.26, True, "toy"),
], [
    ("He spoke not a word, but went straight to his work, / And filled all the stockings; then turned with a jerk,",
     "他一句话也不说，马上开始忙，把每只袜子都装得满满当当。"),
    ("And laying his finger aside of his nose, / And giving a nod, up the chimney he rose.",
     "然后，他转过身，摸摸鼻子，点一点头——嗖！又从烟囱飞上去了。"),
], "中景 · 参与 · 袜子由扁变圆 · 金")

# ---- 11 晚安 ---------------------------------------------------------------


def final_sky(d, W, H):
    outline(d, "rectangle", [0, 0, W, H - 70], NIGHT)
    outline(d, "ellipse", [W * 0.12, 70, W * 0.24, 230], (248, 236, 190))
    for i in range(12):                                         # 往右上的飞行路线（虚线）
        x, y = 300 + i * 95, 440 - i * 30
        d.ellipse([x, y, x + 14, y + 14], fill=WHITE)
    d.rounded_rectangle([W * 0.86, 60, W * 0.95, 110], radius=10, fill=RED, outline=INK, width=4)


standee("s11-sky", 1600, 620, final_sky, "雪橇往右上方飞出这本书（斜线 → 自由）", "background")


def town(d, W, H):
    for k, x in enumerate(range(30, W - 150, 190)):
        h = 140 + (k % 3) * 40
        outline(d, "rectangle", [x, H - 70 - h, x + 160, H - 70], MOON_BLUE)
        d.polygon([(x - 10, H - 70 - h), (x + 170, H - 70 - h), (x + 80, H - 140 - h)], fill=SNOW, outline=INK)
        for wx in (x + 25, x + 95):
            outline(d, "rectangle", [wx, H - 40 - h * 0.7, wx + 40, H - 40 - h * 0.7 + 40], GOLD if k % 2 == 0 else (60, 70, 110))


standee("s11-town", 1600, 400, town, "雪夜小镇：水平屋檐线 · 被点亮的窗变成炉火金")
standee("s11-snow", 1600, 200, lambda d, W, H: outline(d, "chord", [-200, 20, W + 200, 360], SNOW, start=180, end=360),
        "雪地（水平 = 入睡）", "foreground")
spread(11, "晚安", "Good Night", SHORT, {"pitch": 0.75}, {"left": g_snow, "right": g_snow}, [
    ("s11-sky", "background", "left", [0.5, 0.1], 2, 0.62, True, "sleigh"),
    ("s11-town", "midground", "left", [0.5, 0.5], 2, 0.34, True, "town"),
    ("s11-snow", "foreground", "left", [0.5, 0.9], 2, 0.14, True, "snow"),
], [
    ("He sprang to his sleigh, to his team gave a whistle, / And away they all flew like the down of a thistle.",
     "他跳上雪橇，吹了一声口哨，驯鹿们飞起来，像蒲公英一样轻飘飘。"),
    ("But I heard him call out, as he flew out of sight, / “Happy Christmas to all, and to all a good-night!”",
     "飞远之前，我听见他大声说：“祝大家圣诞快乐，祝大家晚安！”"),
], "最大远景 · 俯瞰 · 斜 → 水平 · 蓝 → 金")


# ---------------------------------------------------------------- 封面
def cover():
    W, H = 888, 1000
    img = Image.new("RGB", (W, H), NIGHT)
    d = ImageDraw.Draw(img)
    d.ellipse([W / 2 - 160, 140, W / 2 + 160, 460], fill=(248, 236, 190))
    d.rounded_rectangle([W * 0.62, 300, W * 0.74, 350], radius=10, fill=RED)
    d.text((W / 2, 600), "圣诞前夜", font=font(96), fill=CREAM, anchor="mm")
    d.text((W / 2, 690), "The Night Before Christmas", font=font(40), fill=CREAM, anchor="mm")
    d.text((W / 2, 780), "灰盒样书 · greybox", font=font(32), fill=(180, 190, 220), anchor="mm")
    img.save(ART / "cover.png")
    ASSETS.append({"id": "cover-art", "type": "cover", "role": "cover", "file": f"{REL}/cover.png"})


cover()


# ---------------------------------------------------------------- 写书稿
def build_book():
    spreads = []
    for s in SPREADS:
        sid = f"spread-{s['n']:02d}"
        scene = []
        for k, (asset, layer, side, anchor, mw, mh, cross, word) in enumerate(s["items"]):
            item = {"id": f"n{s['n']}-{k}", "assetId": asset, "layer": layer,
                    "coordinateSpace": "spread" if cross else "page", "side": side, "anchor": anchor,
                    "maxWidth": mw, "maxHeight": mh, "mechanism": "hinge", "reveal": {"start": 0.45, "end": 0.95}}
            if cross:
                item["crossGutter"] = True
            if word:
                item["word"] = word
            scene.append(item)
        passages = []
        for k, (en, zh) in enumerate(s["passages"]):
            speaker = ("St. Nicholas", "圣诞老人") if (s["n"] == 5 and k > 0) else ("Narrator", "旁白")
            passages.append({"id": f"nbc{s['n']}-{k + 1}", "speaker": speaker[1], "speakerEn": speaker[0],
                             "text": zh, "textEn": en.replace(" / ", "\n"), "audio": None})   # 诗的分行 → 真换行
        spreads.append({"id": sid, "chapterId": "chapter-01", "title": f"{s['n']} · {s['title']}",
                        "titleEn": f"{s['n']} · {s['titleEn']}", "focalSubject": s["items"][1][0] if len(s["items"]) > 1 else s["items"][0][0],
                        "pageArt": s["pageArt"], "scene": scene, "passages": passages,
                        "levels": s["levels"], "camera": s["camera"], "greyboxNote": s["note"],
                        "mechanics": s["mechanics"]})
    book = {
        "schemaVersion": 3,
        "title": "圣诞前夜",
        "titleEn": "The Night Before Christmas",
        "language": "zh",
        "adaptation": "改编自 1823 年公版诗歌 A Visit from St. Nicholas。灰盒样书：tools/make_greybox.py 生成，脚本见 stories/night-before-christmas.md",
        "greybox": True,
        "pageGeometry": {"pageWidth": 0.888, "pageHeight": 1, "coordinateUnits": "book"},
        "bookmarks": {"schemaVersion": 1, "storageKey": "night-before-christmas/greybox/v1"},
        "chapters": [{"id": "chapter-01", "title": "圣诞前夜", "titleEn": "The Night Before Christmas"}],
        "spreadOrder": [s["id"] for s in spreads],
        "assets": ASSETS,
        "spreads": spreads,
        "covers": {"front": "cover-art"},
        # 机关触发时读的单词（先放灰盒用到的几个，正式版再补全）
        "vocab": {"mouse": {"en": "mouse", "zh": "老鼠"}, "chimney": {"en": "chimney", "zh": "烟囱"},
                  "wink": {"en": "wink", "zh": "眨眼"}},
    }
    BOOK_OUT.write_text(json.dumps(book, ensure_ascii=False, indent=1))
    print(f"写出 {BOOK_OUT.relative_to(ROOT)}：{len(spreads)} 个跨页，{len(ASSETS)} 个素材")


build_book()
