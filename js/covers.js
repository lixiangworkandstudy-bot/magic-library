// covers.js — 书封设计系统
//
// 和书房墙板同一套视觉语言（复古故事书 + 民间花纹）：
//   布面纹理 → 烫金双线边框 + 串珠 → 四角花饰 → 顶部小花 → 中央纹章（按主题）→ 书名铭牌 → 级别星星
// 每本书只需要 { title, theme, level, color }，就能得到一张统一又各不相同的封面。
// 有插画封面（book.cover 图片）时，插画铺底，铭牌和书名照样由代码写上，方便以后改书名。

const W = 512, H = 704;

// 书名字体：英文用 17 世纪英国印刷体复刻（旧书感强、孩子也认得清，index.html 里从 Google Fonts 加载）；
// 中文用系统宋体（和英文衬线体气质接近）
export const TITLE_FONT = '"IM Fell English", Georgia, serif';
export const TITLE_FONT_ZH = '"Songti SC", "STSong", "Noto Serif SC", serif';
export const fontFor = (lang, size) => (lang === 'zh' ? `bold ${size}px ${TITLE_FONT_ZH}` : `${size}px ${TITLE_FONT}`);

// ---------------------------------------------------------------- 颜色工具
function shade(hex, amount) {
  // amount > 0 变亮，< 0 变暗
  const n = parseInt(hex.slice(1), 16);
  const mix = (c) => Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount));
  const r = mix(n >> 16), g = mix((n >> 8) & 255), b = mix(n & 255);
  return `rgb(${r},${g},${b})`;
}

/** 烫金：斜向的亮暗交替渐变，看起来像金箔反光。 */
function goldFoil(g, x0 = 0, y0 = 0, x1 = W, y1 = H) {
  const grad = g.createLinearGradient(x0, y0, x1, y1);
  grad.addColorStop(0.0, '#f7e3a1');
  grad.addColorStop(0.3, '#d9b25f');
  grad.addColorStop(0.5, '#f3d98f');
  grad.addColorStop(0.7, '#b8893a');
  grad.addColorStop(1.0, '#f0d488');
  return grad;
}

/** 压印效果：先画一层暗色偏移的"凹痕"，再画金色本体。 */
function embossed(g, draw) {
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.45)';
  g.shadowOffsetX = 1.5; g.shadowOffsetY = 2;
  g.shadowBlur = 2;
  draw();
  g.restore();
}

// ---------------------------------------------------------------- 底：布面
function clothBackground(g, color) {
  g.fillStyle = color;
  g.fillRect(0, 0, W, H);
  // 布纹：细密的横竖线，亮暗交替
  for (let y = 0; y < H; y += 3) {
    g.fillStyle = y % 6 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)';
    g.fillRect(0, y, W, 1);
  }
  for (let x = 0; x < W; x += 3) {
    g.fillStyle = x % 6 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)';
    g.fillRect(x, 0, 1, H);
  }
  // 旧书感：四周压暗
  const v = g.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.38)');
  g.fillStyle = v;
  g.fillRect(0, 0, W, H);
}

// ---------------------------------------------------------------- 边框与花饰
function border(g) {
  const gold = goldFoil(g);
  embossed(g, () => {
    g.strokeStyle = gold;
    g.lineWidth = 6;
    g.strokeRect(22, 22, W - 44, H - 44);
    g.lineWidth = 1.6;
    g.strokeRect(40, 40, W - 80, H - 80);
  });
  // 串珠：两道边框之间一圈小金点
  g.fillStyle = gold;
  const bead = (x, y) => { g.beginPath(); g.arc(x, y, 1.8, 0, Math.PI * 2); g.fill(); };
  for (let x = 44; x <= W - 44; x += 14) { bead(x, 31); bead(x, H - 31); }
  for (let y = 44; y <= H - 44; y += 14) { bead(31, y); bead(W - 31, y); }
}

/** 四角花饰：一段弧 + 三片叶子 + 一朵小花，四个角旋转摆放。 */
function cornerOrnaments(g) {
  const gold = goldFoil(g);
  const one = () => {
    g.beginPath();
    g.arc(0, 0, 34, 0, Math.PI / 2);
    g.stroke();
    for (const [a, len] of [[Math.PI / 4, 30], [Math.PI / 4 - 0.5, 22], [Math.PI / 4 + 0.5, 22]]) {
      g.save();
      g.rotate(a);
      g.beginPath();
      g.ellipse(len, 0, 10, 4, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    g.beginPath(); g.arc(10, 10, 5, 0, Math.PI * 2); g.fill();
  };
  embossed(g, () => {
    g.strokeStyle = gold; g.fillStyle = gold; g.lineWidth = 2;
    for (const [x, y, r] of [[48, 48, 0], [W - 48, 48, Math.PI / 2], [W - 48, H - 48, Math.PI], [48, H - 48, -Math.PI / 2]]) {
      g.save(); g.translate(x, y); g.rotate(r); one(); g.restore();
    }
  });
}

/** 顶部中央的小花（呼应墙上的百合花饰）。 */
function topFleur(g) {
  const gold = goldFoil(g);
  embossed(g, () => {
    g.fillStyle = gold;
    g.save();
    g.translate(W / 2, 92);
    g.beginPath(); g.ellipse(0, -8, 7, 16, 0, 0, Math.PI * 2); g.fill();
    for (const s of [-1, 1]) { g.beginPath(); g.ellipse(s * 14, 0, 6, 12, s * 0.7, 0, Math.PI * 2); g.fill(); }
    g.fillRect(-16, 10, 32, 3);
    g.restore();
    // 两侧延伸的细线
    g.strokeStyle = gold; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(W / 2 - 110, 102); g.lineTo(W / 2 - 26, 102); g.moveTo(W / 2 + 26, 102); g.lineTo(W / 2 + 110, 102); g.stroke();
  });
}

// ---------------------------------------------------------------- 中央纹章（按主题）
function fourPointStar(g, x, y, r) {
  g.beginPath();
  for (let k = 0; k < 8; k++) {
    const rr = k % 2 ? r * 0.28 : r, a = (k / 8) * Math.PI * 2 - Math.PI / 2;
    g[k ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

const EMBLEMS = {
  // 童话：新月 + 星星
  fairytale(g, cx, cy, color) {
    g.beginPath(); g.arc(cx - 6, cy, 58, 0, Math.PI * 2); g.fill();
    g.fillStyle = shade(color, -0.35);
    g.beginPath(); g.arc(cx + 18, cy - 12, 52, 0, Math.PI * 2); g.fill();
    g.fillStyle = goldFoil(g);
    fourPointStar(g, cx + 42, cy + 30, 16);
    fourPointStar(g, cx + 20, cy - 52, 9);
  },
  // 科学：齿轮
  science(g, cx, cy, color) {
    const teeth = 10, outer = 62, inner = 50;
    g.beginPath();
    for (let k = 0; k < teeth * 4; k++) {
      const a = (k / (teeth * 4)) * Math.PI * 2;
      const r = (k % 4 < 2) ? outer : inner;
      g[k ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    g.closePath(); g.fill();
    g.fillStyle = shade(color, -0.35);
    g.beginPath(); g.arc(cx, cy, 26, 0, Math.PI * 2); g.fill();
    g.fillStyle = goldFoil(g);
    g.beginPath(); g.arc(cx, cy, 10, 0, Math.PI * 2); g.fill();
  },
  // 冒险：指南针玫瑰
  adventure(g, cx, cy, color) {
    const point = (a, len, width) => {
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
      g.lineTo(cx + Math.cos(a + Math.PI / 2) * width, cy + Math.sin(a + Math.PI / 2) * width);
      g.lineTo(cx - Math.cos(a) * 6, cy - Math.sin(a) * 6);
      g.lineTo(cx + Math.cos(a - Math.PI / 2) * width, cy + Math.sin(a - Math.PI / 2) * width);
      g.closePath(); g.fill();
    };
    for (let k = 0; k < 4; k++) point(Math.PI / 4 + k * Math.PI / 2, 40, 10);
    for (let k = 0; k < 4; k++) point(k * Math.PI / 2 - Math.PI / 2, 68, 14);
    g.strokeStyle = goldFoil(g); g.lineWidth = 2;
    g.beginPath(); g.arc(cx, cy, 30, 0, Math.PI * 2); g.stroke();
    g.fillStyle = shade(color, -0.35);
    g.beginPath(); g.arc(cx, cy, 7, 0, Math.PI * 2); g.fill();
  },
  // 语言魔法：三种文字
  language(g, cx, cy) {
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 64px "Songti SC", "STSong", serif';
    g.fillText('文', cx, cy - 26);
    g.font = 'italic bold 54px Georgia, serif';
    g.fillText('A', cx - 40, cy + 34);
    g.fillText('é', cx + 40, cy + 30);
  },
  // 其他：一颗大星
  default(g, cx, cy) { fourPointStar(g, cx, cy, 60); }
};

function medallion(g, book) {
  const cx = W / 2, cy = 272;
  // 底盘：比布面更深的圆
  g.fillStyle = shade(book.color, -0.35);
  g.beginPath(); g.arc(cx, cy, 112, 0, Math.PI * 2); g.fill();
  embossed(g, () => {
    g.strokeStyle = goldFoil(g); g.lineWidth = 4;
    g.beginPath(); g.arc(cx, cy, 112, 0, Math.PI * 2); g.stroke();
    // 点状内圈
    g.fillStyle = goldFoil(g);
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * Math.PI * 2;
      g.beginPath(); g.arc(cx + Math.cos(a) * 98, cy + Math.sin(a) * 98, 1.8, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = goldFoil(g);
    (EMBLEMS[book.theme] || EMBLEMS.default)(g, cx, cy, book.color);
  });
}

// ---------------------------------------------------------------- 书名铭牌 & 级别星
function titlePlate(g, book, title, lang, overImage) {
  const x = 70, w = W - 140, notch = 18;

  // ---- 先排版，再画框：长书名放不下时，铭牌往上加高，保证字号不会小到看不清
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const joiner = lang === 'zh' ? '' : ' ';
  // 英文按单词断行
  const wrap = (size) => {
    g.font = fontFor(lang, size);
    const lines = [];
    let line = '';
    for (const word of title.split(' ')) {
      const test = line ? `${line}${joiner}${word}` : word;
      if (g.measureText(test).width > w - 36 && line) { lines.push(line); line = word; } else line = test;
    }
    lines.push(line);
    return lines;
  };
  // 中文：按需要的行数均分字数（避免孤字）
  const wrapZh = (size) => {
    g.font = fontFor(lang, size);
    const chars = [...title];
    const n = Math.max(1, Math.ceil(g.measureText(title).width / (w - 36)));
    const per = Math.ceil(chars.length / n);
    return Array.from({ length: Math.ceil(chars.length / per) }, (_, i) => chars.slice(i * per, (i + 1) * per).join(''));
  };
  const layout = lang === 'zh' ? wrapZh : wrap;
  const fit = (h) => {
    let size = 60, lines = layout(size);
    while ((lines.length > 3 || lines.some(l => g.measureText(l).width > w - 36) || lines.length * size * 1.05 > h - 20) && size > 26) {
      size -= 2; lines = layout(size);
    }
    return { size, lines };
  };
  let y = 440, h = 150;
  let { size, lines } = fit(h);
  if (size < 48) { y = 396; h = 196; ({ size, lines } = fit(h)); }   // 加高版铭牌

  // ---- 铭牌形状：四角内凹的长方形（古书书名框）
  g.beginPath();
  g.moveTo(x + notch, y);
  g.lineTo(x + w - notch, y);
  g.arc(x + w, y, notch, Math.PI, Math.PI / 2, true);
  g.lineTo(x + w, y + h - notch);
  g.arc(x + w, y + h, notch, -Math.PI / 2, Math.PI, true);
  g.lineTo(x + notch, y + h);
  g.arc(x, y + h, notch, 0, -Math.PI / 2, true);
  g.lineTo(x, y + notch);
  g.arc(x, y, notch, Math.PI / 2, 0, true);
  g.closePath();
  g.fillStyle = overImage ? 'rgba(20,16,40,0.72)' : shade(book.color, -0.3);
  g.fill();
  embossed(g, () => { g.strokeStyle = goldFoil(g); g.lineWidth = 3; g.stroke(); });

  g.font = fontFor(lang, size);
  embossed(g, () => {
    g.fillStyle = goldFoil(g, 0, y, W, y + h);
    lines.forEach((line, i) => g.fillText(line, W / 2, y + h / 2 + 3 + (i - (lines.length - 1) / 2) * size * 1.05));
  });

  // 级别：底部 1~3 颗小星
  g.fillStyle = goldFoil(g);
  const n = book.level || 1;
  for (let i = 0; i < n; i++) fourPointStar(g, W / 2 + (i - (n - 1) / 2) * 30, 630, 11);
}

// ---------------------------------------------------------------- 入口
/**
 * 返回一张画好的封面 canvas。
 * title：这一语言下的书名；lang：'en' | 'zh'；image：可选的插画封面（Image 对象）。
 */
export function drawCover(book, title, lang, image) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  if (image) {
    g.drawImage(image, 0, 0, W, H);
  } else {
    clothBackground(g, book.color);
    border(g);
    cornerOrnaments(g);
    topFleur(g);
    medallion(g, book);
  }
  titlePlate(g, book, title, lang, !!image);
  return c;
}
