"""
make_cover.py — 《小王子》第一册的正式封面（纯代码绘制，和书里的画风一致）

画面：原著第 6 章——小王子坐在小星球的椅子上看日落
      （"当一个人很难过的时候，他就会喜欢看日落"）。
      刻意不用 1943 年原版封面那种"站在星球上"的构图（角色形象在多国有商标）。
      天空从深靛蓝渐变到玫瑰金，星星一颗颗出来；他的金色围巾在风里飘；旁边是玻璃罩里的玫瑰。

输出:
  assets/lp/cover.png           书本封面（带书名，888×1000 的两倍）——书页里那本 3D 书用
  assets/lp/cover-library.png   书架封面（只有画，底部留给图书馆的书名铭牌，512×704 的两倍）

运行:
  python3 stories/little-prince/tools/make_cover.py
"""

import math
import random
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "assets" / "lp"
OUT.mkdir(parents=True, exist_ok=True)
FONTS = Path("/System/Library/Fonts/Supplemental")
random.seed(612)                                       # B 612

INDIGO, VIOLET, ROSE, GOLD = (24, 30, 74), (74, 70, 122), (214, 150, 140), (244, 204, 140)
INK = (34, 28, 52)
SCARF = (246, 200, 92)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def font(name, size, index=0):
    try:
        return ImageFont.truetype(str(FONTS / name), size, index=index)
    except OSError:
        return ImageFont.truetype("/System/Library/Fonts/Supplemental/Georgia.ttf", size)


def paper_grain(img, strength=10):
    noise = Image.effect_noise(img.size, 40).convert("L").filter(ImageFilter.GaussianBlur(0.6))
    noise = noise.point(lambda v: 128 + (v - 128) * strength // 40)
    return ImageChops.overlay(img.convert("RGB"), Image.merge("RGB", [noise] * 3))


def scene(W, H, horizon):
    """画面本体（不含文字）。horizon：星球地平线的高度（0–1）。"""
    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    hy = int(H * horizon)
    # ---- 天空：深靛蓝 → 紫 → 玫瑰 → 金（日落在地平线）
    for y in range(H):
        t = y / hy if y < hy else 1
        if t < 0.45:
            c = lerp(INDIGO, VIOLET, t / 0.45)
        elif t < 0.8:
            c = lerp(VIOLET, ROSE, (t - 0.45) / 0.35)
        else:
            c = lerp(ROSE, GOLD, (t - 0.8) / 0.2)
        d.line([(0, y), (W, y)], fill=c)
    # 水彩的晕染：几团很淡的、模糊的颜色
    wash = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    wd = ImageDraw.Draw(wash)
    for _ in range(26):
        x, y, r = random.uniform(0, W), random.uniform(0, hy), random.uniform(W * 0.08, W * 0.3)
        col = random.choice([(255, 220, 200), (150, 140, 210), (255, 190, 170), (90, 100, 170)])
        wd.ellipse([x - r, y - r * 0.6, x + r, y + r * 0.6], fill=col + (random.randint(10, 26),))
    img.paste(wash.filter(ImageFilter.GaussianBlur(W * 0.04)), (0, 0), wash.filter(ImageFilter.GaussianBlur(W * 0.04)))
    # ---- 星星：越往上越多；几颗带十字光芒
    stars = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(stars)
    for _ in range(int(W * 0.35)):
        x, y = random.uniform(0, W), (random.random() ** 1.8) * hy * 0.75
        r = random.choice([1, 1, 1.5, 2, 2.5]) * W / 900
        a = int(255 * (1 - y / (hy * 0.8)) * random.uniform(0.5, 1))
        sd.ellipse([x - r, y - r, x + r, y + r], fill=(255, 248, 230, max(0, a)))
    for _ in range(7):
        x, y, L = random.uniform(W * 0.05, W * 0.95), random.uniform(H * 0.05, hy * 0.5), W * random.uniform(0.012, 0.022)
        for dx, dy in [(L, 0), (0, L)]:
            sd.line([(x - dx, y - dy), (x + dx, y + dy)], fill=(255, 246, 220, 200), width=max(1, W // 700))
        sd.ellipse([x - L * 0.18, y - L * 0.18, x + L * 0.18, y + L * 0.18], fill=(255, 250, 235, 255))
    img.paste(stars, (0, 0), stars)
    glow_stars = stars.filter(ImageFilter.GaussianBlur(W / 300))
    img.paste(glow_stars, (0, 0), glow_stars)
    # ---- 落日：半个太阳 + 一大片柔光
    sx, sr = W * 0.7, W * 0.075
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for k in range(12, 0, -1):
        rr = sr * (1 + k * 0.55)
        gd.ellipse([sx - rr, hy - rr, sx + rr, hy + rr], fill=(255, 214, 150, 10))
    gd.ellipse([sx - sr, hy - sr, sx + sr, hy + sr], fill=(255, 236, 190, 255))
    glow = glow.filter(ImageFilter.GaussianBlur(W * 0.006))
    img.paste(glow, (0, 0), glow)
    # ---- 小星球：一大段弧形的地面（圆心在画面下方很远），边缘一圈暖色的逆光
    R = W * 1.6
    cx, cy = W * 0.5, hy + R - H * 0.02
    planet = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    pd = ImageDraw.Draw(planet)
    pd.ellipse([cx - R, cy - R, cx + R, cy + R], fill=(58, 50, 78, 255))
    rim = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(rim).ellipse([cx - R, cy - R, cx + R, cy + R], outline=(255, 206, 150, 230), width=max(2, W // 260))
    rim = rim.filter(ImageFilter.GaussianBlur(W / 500))
    # 地面的明暗：靠近地平线的地方被落日照暖一点
    shade = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sh = ImageDraw.Draw(shade)
    for y in range(hy - 20, H):
        t = max(0, min(1, (y - hy) / (H * 0.35)))
        sh.line([(0, y), (W, y)], fill=lerp((120, 90, 100), (40, 34, 60), t) + (int(140 * (1 - t)),))
    planet_mask = planet.getchannel("A")
    img.paste(planet, (0, 0), planet)
    img.paste(shade, (0, 0), ImageChops.multiply(shade.getchannel("A"), planet_mask))
    # 地面上的小颗粒、几株小芽
    gd2 = ImageDraw.Draw(img)
    for _ in range(int(W * 0.5)):
        x = random.uniform(0, W)
        y_top = cy - math.sqrt(max(0, R * R - (x - cx) ** 2))
        y = y_top + random.uniform(4, H - y_top)
        if y < H:
            r = random.uniform(0.6, 1.8) * W / 900
            gd2.ellipse([x - r, y - r, x + r, y + r], fill=(84, 72, 100))
    img.paste(rim, (0, 0), rim)

    def ground_y(x):
        return cy - math.sqrt(max(0, R * R - (x - cx) ** 2))

    # ---- 小王子坐在小椅子上（剪影），望向落日；金色的长围巾往左后方飘
    fig = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    fd = ImageDraw.Draw(fig)
    s = W / 900                                          # 以 900 宽为基准的比例
    px = W * 0.4
    gy = ground_y(px)
    # 椅子
    fd.rectangle([px - 26 * s, gy - 44 * s, px + 22 * s, gy - 38 * s], fill=INK)                     # 座面
    for lx in (-22, 18):
        fd.rectangle([px + lx * s, gy - 40 * s, px + (lx + 4) * s, gy], fill=INK)                    # 椅腿
    fd.rectangle([px - 26 * s, gy - 92 * s, px - 21 * s, gy - 40 * s], fill=INK)                     # 椅背
    # 身体（侧身坐，长外套）
    fd.polygon([(px - 18 * s, gy - 44 * s), (px + 14 * s, gy - 44 * s), (px + 8 * s, gy - 100 * s), (px - 14 * s, gy - 100 * s)], fill=INK)
    fd.polygon([(px + 6 * s, gy - 46 * s), (px + 34 * s, gy - 42 * s), (px + 36 * s, gy - 4 * s), (px + 28 * s, gy - 4 * s), (px + 26 * s, gy - 36 * s), (px + 4 * s, gy - 40 * s)], fill=INK)   # 腿
    # 头 + 一撮撮头发
    hx, hy2, hr = px - 1 * s, gy - 113 * s, 13 * s
    fd.ellipse([hx - hr, hy2 - hr, hx + hr, hy2 + hr], fill=INK)
    for k in range(4):                                  # 左上方三四撮被风吹起的发卷（小小的）
        a = math.pi * (1.1 + k * 0.16)
        rr = hr * (0.34 - k * 0.04)
        ox, oy = hx + math.cos(a) * hr * 0.98 - 2 * s, hy2 + math.sin(a) * hr * 0.98
        fd.ellipse([ox - rr, oy - rr, ox + rr, oy + rr], fill=INK)
    img.paste(fig, (0, 0), fig)
    # 头发的轮廓光（落日在右边）
    hl = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(hl).line([(px + 8 * s, gy - 98 * s), (px + 14 * s, gy - 46 * s)], fill=(255, 196, 130, 200), width=max(2, int(2.5 * s)))
    ImageDraw.Draw(hl).arc([hx - hr * 1.15, hy2 - hr * 1.15, hx + hr * 1.15, hy2 + hr * 1.15], 280, 40, fill=(255, 210, 130, 220), width=max(2, int(3 * s)))
    hl = hl.filter(ImageFilter.GaussianBlur(1.2 * s))
    img.paste(hl, (0, 0), hl)
    # 围巾：从脖子往左后方飘，越来越细，带一点波浪
    scarf = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sc = ImageDraw.Draw(scarf)
    for length, lift, wave, phase, width in [(250, 46, 18, 0.0, 4.2), (190, 22, 14, 1.4, 3.0)]:   # 两条尾巴
        top, bottom = [], []
        for k in range(60):
            t = k / 59
            x = px - 2 * s - t * length * s
            y = gy - 99 * s - t * lift * s + math.sin(t * 9 + phase) * wave * s * t
            w = (width - (width - 1.2) * t) * s
            top.append((x, y - w)); bottom.append((x, y + w))
        sc.polygon(top + bottom[::-1], fill=SCARF + (255,))
    sc.ellipse([px - 8 * s, gy - 103 * s, px + 6 * s, gy - 95 * s], fill=SCARF + (255,))       # 脖子上绕的一圈
    scarf_glow = scarf.filter(ImageFilter.GaussianBlur(4 * s))
    img.paste(scarf_glow, (0, 0), scarf_glow.point(lambda v: v // 2) if scarf_glow.mode == "L" else scarf_glow)
    img.paste(scarf, (0, 0), scarf)
    # ---- 玻璃罩里的玫瑰（右边一点，被落日照亮）
    rx = W * 0.6
    ry = ground_y(rx)
    rose = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    rd = ImageDraw.Draw(rose)
    rd.line([(rx, ry), (rx, ry - 34 * s)], fill=(60, 90, 60, 255), width=max(2, int(3 * s)))
    rd.ellipse([rx - 9 * s, ry - 50 * s, rx + 9 * s, ry - 32 * s], fill=(208, 60, 76, 255))
    rd.ellipse([rx - 4 * s, ry - 22 * s, rx + 10 * s, ry - 16 * s], fill=(70, 110, 70, 255))
    rd.chord([rx - 24 * s, ry - 70 * s, rx + 24 * s, ry + 26 * s], 180, 360, outline=(255, 240, 220, 150), width=max(2, int(2.5 * s)))
    rd.line([(rx - 24 * s, ry - 22 * s), (rx - 24 * s, ry)], fill=(255, 240, 220, 150), width=max(2, int(2.5 * s)))
    rd.line([(rx + 24 * s, ry - 22 * s), (rx + 24 * s, ry)], fill=(255, 240, 220, 150), width=max(2, int(2.5 * s)))
    rd.arc([rx - 18 * s, ry - 62 * s, rx + 6 * s, ry - 20 * s], 200, 250, fill=(255, 255, 255, 200), width=max(2, int(3 * s)))   # 玻璃上的高光
    img.paste(rose, (0, 0), rose)
    return paper_grain(img, 9)


def gold_text(img, xy, text, fnt, anchor="mm", glow=True):
    """烫金字：渐变金色 + 一点点柔光。"""
    W, H = img.size
    mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mask).text(xy, text, font=fnt, fill=255, anchor=anchor)
    grad = Image.new("RGB", (W, H))
    gd = ImageDraw.Draw(grad)
    bbox = mask.getbbox() or (0, 0, W, H)
    for y in range(bbox[1], bbox[3] + 1):
        t = (y - bbox[1]) / max(1, bbox[3] - bbox[1])
        gd.line([(0, y), (W, y)], fill=lerp((255, 236, 186), (214, 164, 82), t))
    if glow:
        halo = mask.filter(ImageFilter.GaussianBlur(fnt.size * 0.12)).point(lambda v: v * 0.55)
        img.paste(Image.new("RGB", (W, H), (255, 214, 150)), (0, 0), halo)
    img.paste(grad, (0, 0), mask)


def book_cover():
    W, H = 1776, 2000
    img = scene(W, H, horizon=0.66)
    d = ImageDraw.Draw(img)
    gold_text(img, (W / 2, H * 0.16), "The Little Prince", font("Baskerville.ttc", 190, index=2))   # 斜体
    gold_text(img, (W / 2, H * 0.245), "BOOK ONE", font("Didot.ttc", 64), glow=False)
    # 小装饰：两条细金线中间一颗星
    for side in (-1, 1):
        d.line([(W / 2 + side * 60, H * 0.285), (W / 2 + side * 300, H * 0.285)], fill=(232, 196, 120), width=4)
    d.regular_polygon((W / 2, H * 0.285, 14), 4, rotation=45, fill=(255, 226, 160))
    gold_text(img, (W / 2, H * 0.93), "Antoine de Saint-Exupéry", font("Baskerville.ttc", 70, index=2), glow=False)
    img.resize((888 * 2, 1000 * 2), Image.LANCZOS).save(OUT / "cover.png")


def shelf_cover():
    W, H = 1024, 1408                                  # 512×704 的两倍；底部约 30% 是图书馆的书名铭牌
    img = scene(W, H, horizon=0.4)                     # 地平线放高：人物在铭牌上方，不被书名挡住
    img.save(OUT / "cover-library.png")


book_cover()
shelf_cover()
print("写出 assets/lp/cover.png、assets/lp/cover-library.png")
