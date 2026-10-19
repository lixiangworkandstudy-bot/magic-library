// spots.js — 阅读地点：书后面的场景图 + 对应的环境音（白噪声）
//
// 每个地点 = 一张背景图（assets/spots/<id>.png，没有就用程序画的占位图）+ 一段实时合成的环境音。
// 立体书本身不变，看起来像是被放在那个地方的桌面 / 毯子上读。

export const SPOTS = [
  // set：3D 置景（书桌在 environment.js，其余在 sets.js）
  // image：菜单里的缩略图——直接从 3D 场景截的图（场景改了以后重新截：见 README「地点缩略图」）
  { id: 'desk',    icon: '🏠', label: { en: 'Home Desk', zh: '家里的书桌' }, image: 'assets/spots/desk.jpg', set: 'desk' },
  { id: 'seaside', icon: '🌊', label: { en: 'Irish Seaside', zh: '爱尔兰的海边' }, image: 'assets/spots/seaside.jpg', set: 'seaside' },
  { id: 'moon',    icon: '🌙', label: { en: 'On the Moon', zh: '月亮上' },   image: 'assets/spots/moon.jpg', set: 'moon' }
  // 「小星球上」暂时下架（用户 2026-10-02：目前不必要）。置景代码还在 sets.js 的 buildSpaceSet，
  // 以后可以作为《小王子》的专属场景再上架：{ id: 'space', icon: '🪐', label: { en: 'A Tiny Planet', zh: '小星球上' }, image: null, animated: true, set: 'space' }
  // 「安静」不再是一个地点：要安静就关掉朗读 / 白噪声开关
];

const KEY = 'magic-library/spot';
export function loadSpot() {
  // 存着的地点如果已经下架（比如「小星球上」），回到书桌
  try { const id = localStorage.getItem(KEY); return SPOTS.some(s => s.id === id) ? id : 'desk'; } catch { return 'desk'; }
}
export function saveSpot(id) { try { localStorage.setItem(KEY, id); } catch { /* ignore */ } }

// ---------------------------------------------------------------- 占位图（出图前用）
// 构图规则和正式图一样：画面下方中间是一块空的平面（桌面 / 毯子），立体书"放"在上面。
function placeholderDesk(g, W, H) {
  // 墙：暖米色
  const wall = g.createLinearGradient(0, 0, 0, H * 0.62);
  wall.addColorStop(0, '#e9d8b8'); wall.addColorStop(1, '#d9c29a');
  g.fillStyle = wall; g.fillRect(0, 0, W, H * 0.62);
  // 窗：白天的天空 + 一团绿树
  g.fillStyle = '#8a6a48'; g.fillRect(W * 0.58, H * 0.08, W * 0.3, H * 0.38);
  const sky = g.createLinearGradient(0, H * 0.1, 0, H * 0.44);
  sky.addColorStop(0, '#9fd0ee'); sky.addColorStop(1, '#d8eefa');
  g.fillStyle = sky; g.fillRect(W * 0.595, H * 0.1, W * 0.27, H * 0.34);
  g.fillStyle = '#7aae6a';
  for (const [x, y, r] of [[0.66, 0.4, 0.09], [0.76, 0.36, 0.11], [0.84, 0.41, 0.08]]) { g.beginPath(); g.arc(W * x, H * y, W * r * 0.6, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#8a6a48'; g.fillRect(W * 0.725, H * 0.1, W * 0.012, H * 0.34); g.fillRect(W * 0.595, H * 0.265, W * 0.27, H * 0.012);
  // 台灯：左边一团暖光
  const glow = g.createRadialGradient(W * 0.18, H * 0.42, 10, W * 0.18, H * 0.42, W * 0.3);
  glow.addColorStop(0, 'rgba(255,220,150,0.75)'); glow.addColorStop(1, 'rgba(255,220,150,0)');
  g.fillStyle = glow; g.fillRect(0, 0, W, H);
  g.fillStyle = '#3f6a5a'; g.beginPath(); g.moveTo(W * 0.12, H * 0.4); g.lineTo(W * 0.24, H * 0.4); g.lineTo(W * 0.21, H * 0.3); g.lineTo(W * 0.15, H * 0.3); g.closePath(); g.fill();
  g.fillStyle = '#6b4a2e'; g.fillRect(W * 0.175, H * 0.4, W * 0.01, H * 0.2);
  // 书桌：木纹
  const desk = g.createLinearGradient(0, H * 0.6, 0, H);
  desk.addColorStop(0, '#a4724a'); desk.addColorStop(1, '#6e4a2e');
  g.fillStyle = desk; g.fillRect(0, H * 0.6, W, H * 0.4);
  g.strokeStyle = 'rgba(60,35,18,0.25)'; g.lineWidth = 2;
  for (let y = H * 0.64; y < H; y += 22) { g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(W * 0.3, y + 8, W * 0.7, y - 8, W, y + 4); g.stroke(); }
  // 桌上的小物：一个杯子、一叠书
  g.fillStyle = '#f2ead8'; g.fillRect(W * 0.82, H * 0.66, W * 0.05, H * 0.08);
  g.fillStyle = '#8c3b2e'; g.fillRect(W * 0.06, H * 0.7, W * 0.12, H * 0.03);
  g.fillStyle = '#2f4a6a'; g.fillRect(W * 0.07, H * 0.67, W * 0.1, H * 0.03);
}

function placeholderSeaside(g, W, H) {
  // 爱尔兰的海（菜单缩略图）：阴天的灰蓝天、深石板蓝的海、深色卵石滩、奶白针织毯
  const sky = g.createLinearGradient(0, 0, 0, H * 0.45);
  sky.addColorStop(0, '#9fb0c2'); sky.addColorStop(1, '#e4e9ee');
  g.fillStyle = sky; g.fillRect(0, 0, W, H * 0.45);
  g.fillStyle = '#5f6670'; g.beginPath(); g.moveTo(0, H * 0.45); g.lineTo(0, H * 0.3); g.lineTo(W * 0.22, H * 0.27); g.lineTo(W * 0.32, H * 0.45); g.fill();
  g.fillStyle = '#6f9a5c'; g.fillRect(0, H * 0.27, W * 0.22, H * 0.025);
  g.fillStyle = '#f4f2ec'; g.fillRect(W * 0.14, H * 0.2, W * 0.018, H * 0.07);
  const sea = g.createLinearGradient(0, H * 0.45, 0, H * 0.62);
  sea.addColorStop(0, '#34505f'); sea.addColorStop(1, '#5f8582');
  g.fillStyle = sea; g.fillRect(0, H * 0.45, W, H * 0.17);
  g.strokeStyle = 'rgba(233,238,238,0.75)'; g.lineWidth = 5;
  g.beginPath(); for (let x = 0; x <= W; x += 16) g.lineTo(x, H * 0.615 + Math.sin(x / 60) * 4); g.stroke();
  g.fillStyle = '#7d7468'; g.fillRect(0, H * 0.62, W, H * 0.38);
  for (let k = 0; k < 300; k++) { g.fillStyle = ['#9a948a', '#b8b0a2', '#6e7480'][k % 3]; g.beginPath(); g.arc(Math.random() * W, H * 0.62 + Math.random() * H * 0.38, 4 + Math.random() * 6, 0, Math.PI * 2); g.fill(); }
  g.save(); g.translate(W * 0.5, H * 0.82); g.scale(1, 0.38);
  g.fillStyle = '#ece4d3'; g.fillRect(-W * 0.25, -W * 0.25, W * 0.5, W * 0.5);
  g.strokeStyle = 'rgba(160,140,110,0.5)'; g.lineWidth = 6;
  for (let c = 0; c < 8; c++) { g.beginPath(); g.moveTo(-W * 0.25 + c * W * 0.0625 + 16, -W * 0.25); g.lineTo(-W * 0.25 + c * W * 0.0625 + 16, W * 0.25); g.stroke(); }
  g.restore();
}

const PLACEHOLDERS = { desk: placeholderDesk, seaside: placeholderSeaside };

// ---------------------------------------------------------------- 🌙 月亮上：全部程序绘制的动态场景
// 分三层：天空（静态）→ 星星和流星（每帧重画）→ 地球、远山、月面、小火箭（静态、透明底）。
// 这样每帧只需要把三层叠一次，不用重画整张图。
function makeMoonScene(W = 1536, H = 1024) {
  const layer = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const horizon = H * 0.56;

  // 1. 天空：深蓝 → 紫，再加两团淡淡的星云
  const sky = layer(), gs = sky.getContext('2d');
  const grad = gs.createLinearGradient(0, 0, 0, horizon);
  grad.addColorStop(0, '#0b1030'); grad.addColorStop(0.6, '#241a4a'); grad.addColorStop(1, '#3d2a5e');
  gs.fillStyle = grad; gs.fillRect(0, 0, W, H);
  for (const [x, y, r, c] of [[0.25, 0.22, 0.28, 'rgba(120,90,200,0.18)'], [0.62, 0.38, 0.22, 'rgba(60,160,190,0.12)']]) {
    const n = gs.createRadialGradient(W * x, H * y, 0, W * x, H * y, W * r);
    n.addColorStop(0, c); n.addColorStop(1, 'rgba(0,0,0,0)');
    gs.fillStyle = n; gs.fillRect(0, 0, W, H);
  }

  // 2. 星星：位置、大小、闪烁节奏预先随机好
  const stars = Array.from({ length: 260 }, () => ({
    x: Math.random() * W, y: Math.random() * horizon * 0.98,
    r: Math.random() < 0.08 ? 2.2 + Math.random() * 1.5 : 0.6 + Math.random() * 1.2,
    speed: 0.6 + Math.random() * 2.2, phase: Math.random() * 10,
    warm: Math.random() < 0.3
  }));

  // 3. 前景：地球、远处的月面山丘、近处月面（中间下方留空放书）、小火箭
  const fg = layer(), g = fg.getContext('2d');
  // 地球：蓝色海洋 + 绿色陆地 + 白云 + 一圈大气光
  const ex = W * 0.78, ey = H * 0.28, er = W * 0.062;   // 不要太靠上：宽屏裁切时地球要完整
  const atmo = g.createRadialGradient(ex, ey, er * 0.9, ex, ey, er * 1.5);
  atmo.addColorStop(0, 'rgba(120,190,255,0.45)'); atmo.addColorStop(1, 'rgba(120,190,255,0)');
  g.fillStyle = atmo; g.fillRect(ex - er * 2, ey - er * 2, er * 4, er * 4);
  g.save();
  g.beginPath(); g.arc(ex, ey, er, 0, Math.PI * 2); g.clip();
  g.fillStyle = '#2f6fb8'; g.fillRect(ex - er, ey - er, er * 2, er * 2);
  g.fillStyle = '#5fa86a';
  for (const [dx, dy, rx, ry, rot] of [[-0.35, -0.2, 0.35, 0.22, 0.4], [0.25, 0.25, 0.3, 0.2, -0.3], [0.1, -0.45, 0.2, 0.12, 0.1], [-0.2, 0.45, 0.18, 0.12, 0.6]]) {
    g.beginPath(); g.ellipse(ex + dx * er, ey + dy * er, rx * er, ry * er, rot, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = er * 0.07; g.lineCap = 'round';
  for (const [dy, len] of [[-0.55, 0.7], [-0.05, 0.9], [0.4, 0.6]]) {
    g.beginPath(); g.moveTo(ex - er * len * 0.6, ey + dy * er); g.quadraticCurveTo(ex, ey + dy * er - er * 0.12, ex + er * len * 0.6, ey + dy * er + er * 0.05); g.stroke();
  }
  // 地球的背光面（左下暗一点）
  const shade = g.createLinearGradient(ex + er, ey - er, ex - er, ey + er);
  shade.addColorStop(0.45, 'rgba(0,0,20,0)'); shade.addColorStop(1, 'rgba(0,0,20,0.55)');
  g.fillStyle = shade; g.fillRect(ex - er, ey - er, er * 2, er * 2);
  g.restore();

  // 远处的月面山丘
  g.fillStyle = '#6d6a86';
  g.beginPath(); g.moveTo(0, horizon);
  for (let x = 0; x <= W; x += 12) g.lineTo(x, horizon - 18 - Math.sin(x / 140) * 16 - Math.sin(x / 47 + 1) * 6);
  g.lineTo(W, H); g.lineTo(0, H); g.fill();

  // 近处月面：由灰紫到浅灰的渐变
  const ground = g.createLinearGradient(0, horizon, 0, H);
  ground.addColorStop(0, '#9c98b2'); ground.addColorStop(1, '#d9d5e4');
  g.fillStyle = ground;
  g.beginPath(); g.moveTo(0, horizon + 14);
  for (let x = 0; x <= W; x += 16) g.lineTo(x, horizon + 10 + Math.sin(x / 200 + 2) * 8);
  g.lineTo(W, H); g.lineTo(0, H); g.fill();

  // 陨石坑：只放在两侧和远处，中间下方留给书
  const crater = (x, y, rx) => {
    const ry = rx * 0.32;
    g.fillStyle = 'rgba(80,76,104,0.45)'; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(235,232,245,0.55)'; g.beginPath(); g.ellipse(x, y + ry * 0.35, rx * 0.85, ry * 0.6, 0, 0, Math.PI); g.fill();
    g.strokeStyle = 'rgba(245,242,252,0.6)'; g.lineWidth = 2; g.beginPath(); g.ellipse(x, y, rx, ry, 0, Math.PI, Math.PI * 2); g.stroke();
  };
  for (const [x, y, r] of [[0.1, 0.72, 70], [0.2, 0.9, 110], [0.88, 0.78, 90], [0.76, 0.64, 40], [0.33, 0.63, 30], [0.62, 0.61, 26], [0.95, 0.95, 60], [0.05, 0.62, 30]]) crater(W * x, H * y, r);

  // 复古小火箭（左后方）：身体、红色鼻锥、圆窗、两片尾翼
  g.save();
  g.translate(W * 0.16, horizon + 22); g.rotate(-0.06);
  g.fillStyle = '#b8483e';
  g.beginPath(); g.moveTo(-40, 0); g.lineTo(-22, -60); g.lineTo(-18, 0); g.fill();
  g.beginPath(); g.moveTo(40, 0); g.lineTo(22, -60); g.lineTo(18, 0); g.fill();
  g.fillStyle = '#efe6d2';
  g.beginPath(); g.moveTo(-22, 0); g.lineTo(-22, -130); g.quadraticCurveTo(0, -175, 22, -130); g.lineTo(22, 0); g.closePath(); g.fill();
  g.fillStyle = '#b8483e';
  g.beginPath(); g.moveTo(-22, -130); g.quadraticCurveTo(0, -175, 22, -130); g.closePath(); g.fill();
  g.fillStyle = '#3a5d8c'; g.beginPath(); g.arc(0, -95, 11, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#d9b25f'; g.lineWidth = 3; g.stroke();
  g.restore();

  // 纸纹：和书房同一种手绘质感
  const grain = g.getImageData(0, 0, W, H), px = grain.data;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    const n = (Math.random() - 0.5) * 14;
    px[i] += n; px[i + 1] += n; px[i + 2] += n;
  }
  g.putImageData(grain, 0, 0);

  // 输出画布 + 每帧的画法
  const out = layer(), go = out.getContext('2d');
  let shooting = null, nextShootAt = 3;
  function frame(t) {
    go.drawImage(sky, 0, 0);
    for (const s of stars) {
      const tw = 0.55 + 0.45 * Math.sin(t * s.speed + s.phase);
      go.globalAlpha = tw;
      go.fillStyle = s.warm ? '#ffe6b0' : '#e8ecff';
      go.beginPath(); go.arc(s.x, s.y, s.r, 0, Math.PI * 2); go.fill();
      if (s.r > 2) {                          // 亮星带一个小十字星芒
        go.fillRect(s.x - s.r * 3, s.y - 0.5, s.r * 6, 1);
        go.fillRect(s.x - 0.5, s.y - s.r * 3, 1, s.r * 6);
      }
    }
    go.globalAlpha = 1;
    // 流星：每隔几秒从左上往右下划过一道
    if (!shooting && t > nextShootAt) {
      shooting = { x: W * (0.1 + Math.random() * 0.5), y: H * (0.05 + Math.random() * 0.2), start: t };
    }
    if (shooting) {
      const k = (t - shooting.start) / 1.1;
      if (k >= 1) { shooting = null; nextShootAt = t + 4 + Math.random() * 6; }
      else {
        const hx = shooting.x + k * W * 0.3, hy = shooting.y + k * H * 0.16;
        const tail = go.createLinearGradient(hx - W * 0.08, hy - H * 0.043, hx, hy);
        tail.addColorStop(0, 'rgba(255,255,255,0)'); tail.addColorStop(1, `rgba(255,250,230,${Math.sin(k * Math.PI)})`);
        go.strokeStyle = tail; go.lineWidth = 2.5;
        go.beginPath(); go.moveTo(hx - W * 0.08, hy - H * 0.043); go.lineTo(hx, hy); go.stroke();
      }
    }
    go.drawImage(fg, 0, 0);
    return out;
  }
  frame(0);
  return { canvas: out, frame };
}

// ---------------------------------------------------------------- 🪐 外太空：没有地面，书漂在一片星尘云上
/**
 * base：Codex 画好的外太空底图（有就用它：画交给插画，代码只叠会动的东西——星星闪烁、彗星、星尘环上的光点）。
 * 没有底图时，退回到全部由代码绘制（星云、螺旋星系、行星、星尘云）。
 */
function makeSpaceScene(W = 1536, H = 1024, base = null) {
  const layer = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };

  // 1. 深空底色 + 星云 + 螺旋星系（静态）
  const bg = layer(), gb = bg.getContext('2d');
  const deep = gb.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.45, W * 0.75);
  deep.addColorStop(0, '#1c1650'); deep.addColorStop(1, '#05061a');
  gb.fillStyle = deep; gb.fillRect(0, 0, W, H);
  gb.globalCompositeOperation = 'lighter';
  for (const [x, y, r, c] of [
    [0.3, 0.55, 0.35, 'rgba(210,90,170,0.16)'], [0.7, 0.2, 0.3, 'rgba(70,160,220,0.16)'],
    [0.55, 0.7, 0.25, 'rgba(140,100,230,0.14)'], [0.9, 0.6, 0.2, 'rgba(255,140,120,0.1)']]) {
    const n = gb.createRadialGradient(W * x, H * y, 0, W * x, H * y, W * r);
    n.addColorStop(0, c); n.addColorStop(1, 'rgba(0,0,0,0)');
    gb.fillStyle = n; gb.fillRect(0, 0, W, H);
  }
  gb.globalCompositeOperation = 'source-over';

  // 螺旋星系：两条旋臂上撒一千颗光点，中心最亮（单独一层，好让它慢慢转）
  const GAL = 320;
  const galaxy = document.createElement('canvas'); galaxy.width = galaxy.height = GAL;
  const gg = galaxy.getContext('2d');
  const core = gg.createRadialGradient(GAL / 2, GAL / 2, 0, GAL / 2, GAL / 2, GAL * 0.18);
  core.addColorStop(0, 'rgba(255,240,210,0.95)'); core.addColorStop(1, 'rgba(255,200,160,0)');
  gg.fillStyle = core; gg.fillRect(0, 0, GAL, GAL);
  for (let i = 0; i < 1000; i++) {
    const arm = i % 2, k = Math.random();
    const theta = k * Math.PI * 3.2 + arm * Math.PI;
    const r = k * GAL * 0.46;
    const spread = (Math.random() - 0.5) * (6 + k * 18);
    const x = GAL / 2 + Math.cos(theta) * r + spread, y = GAL / 2 + Math.sin(theta) * r * 0.55 + spread * 0.5;
    gg.fillStyle = `rgba(${200 + Math.random() * 55},${190 + Math.random() * 50},255,${(1 - k) * 0.8})`;
    gg.fillRect(x, y, 1.5, 1.5);
  }

  // 2. 星星：远近两层，飘移速度不同（视差）
  const starLayer = (n, rMin, rMax, speed) => Array.from({ length: n }, () => ({
    x: Math.random() * W, y: Math.random() * H, r: rMin + Math.random() * (rMax - rMin),
    speed, tw: 0.8 + Math.random() * 2, phase: Math.random() * 10,
    color: ['#ffffff', '#dfe6ff', '#ffe9c7', '#ffd6f0'][Math.floor(Math.random() * 4)]
  }));
  const far = starLayer(base ? 70 : 320, 0.5, 1.3, base ? 0 : 4), near = starLayer(base ? 18 : 60, 1.4, 2.6, base ? 0 : 11);

  // 3. 行星（各画成一张小图，每帧只移动位置）
  const sprite = (size, draw) => { const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size); return c; };
  const shadeBall = (g, S, r) => {
    const sh = g.createRadialGradient(S / 2 - r * 0.4, S / 2 - r * 0.4, r * 0.2, S / 2, S / 2, r);
    sh.addColorStop(0, 'rgba(255,255,255,0.25)'); sh.addColorStop(0.6, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,20,0.55)');
    g.fillStyle = sh; g.beginPath(); g.arc(S / 2, S / 2, r, 0, Math.PI * 2); g.fill();
  };
  // 带光环的大行星：环分前后两半，行星夹在中间
  const ringed = sprite(420, (g, S) => {
    const r = S * 0.2, cx = S / 2, cy = S / 2;
    const ring = (front) => {
      g.save(); g.translate(cx, cy); g.rotate(-0.35);
      g.lineWidth = S * 0.035;
      for (const [rx, a] of [[S * 0.42, 0.55], [S * 0.36, 0.8], [S * 0.31, 0.5]]) {
        g.strokeStyle = `rgba(240,210,160,${a})`;
        g.beginPath(); g.ellipse(0, 0, rx, rx * 0.26, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2); g.stroke();
      }
      g.restore();
    };
    ring(false);
    g.save(); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
    const bands = ['#f0b36a', '#e59a55', '#f6cf92', '#d98548', '#f2c07c', '#e8a868', '#f6d6a0'];
    bands.forEach((c, i) => { g.fillStyle = c; g.fillRect(cx - r, cy - r + (i / bands.length) * 2 * r, 2 * r, 2 * r / bands.length + 1); });
    g.restore();
    shadeBall(g, S, r);
    ring(true);
  });
  const purple = sprite(160, (g, S) => {
    const r = S * 0.42;
    g.fillStyle = '#7a5ab8'; g.beginPath(); g.arc(S / 2, S / 2, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(60,40,110,0.6)';
    for (const [x, y, cr] of [[0.4, 0.4, 0.1], [0.62, 0.58, 0.07], [0.45, 0.68, 0.05]]) { g.beginPath(); g.arc(S * x, S * y, S * cr, 0, Math.PI * 2); g.fill(); }
    shadeBall(g, S, r);
  });
  const teal = sprite(60, (g, S) => {
    const r = S * 0.42;
    g.fillStyle = '#5ec8c0'; g.beginPath(); g.arc(S / 2, S / 2, r, 0, Math.PI * 2); g.fill();
    shadeBall(g, S, r);
  });

  // 4. 托着书的星尘云：一个压扁的发光椭圆 + 一群闪烁的金紫光点
  // 有底图时对准图里那圈发光的星尘环（横向 50%、纵向约 60%）
  const cloudX = W * 0.5, cloudY = base ? H * 0.605 : H * 0.82, cloudRX = base ? W * 0.29 : W * 0.38, cloudRY = base ? H * 0.05 : H * 0.12;
  const dust = Array.from({ length: 160 }, () => {
    const a = Math.random() * Math.PI * 2, d = base ? 0.8 + Math.random() * 0.25 : Math.sqrt(Math.random());   // 有底图：贴着环
    return { x: cloudX + Math.cos(a) * d * cloudRX, y: cloudY + Math.sin(a) * d * cloudRY, r: 0.8 + Math.random() * 2, tw: 1 + Math.random() * 3, phase: Math.random() * 10, gold: Math.random() < 0.5 };
  });

  const out = layer(), g = out.getContext('2d');
  let comet = null, nextCometAt = 4;
  function frame(t) {
    if (base) g.drawImage(base, 0, 0, W, H);
    else {
      g.drawImage(bg, 0, 0);
      // 星系慢慢转
      g.save(); g.globalCompositeOperation = 'lighter'; g.translate(W * 0.2, H * 0.22); g.rotate(t * 0.02); g.drawImage(galaxy, -GAL / 2, -GAL / 2); g.restore();
    }
    // 星星：往左飘，出界从右边回来
    for (const layerStars of [far, near]) {
      for (const s of layerStars) {
        const x = ((s.x - t * s.speed) % W + W) % W;
        g.globalAlpha = 0.5 + 0.5 * Math.sin(t * s.tw + s.phase);
        g.fillStyle = s.color;
        g.beginPath(); g.arc(x, s.y, s.r, 0, Math.PI * 2); g.fill();
      }
    }
    g.globalAlpha = 1;
    // 彗星：每隔一会儿从右上往左下飞过，拖一条长尾巴
    if (!comet && t > nextCometAt) comet = { x: W * (0.6 + Math.random() * 0.35), y: H * (0.03 + Math.random() * 0.15), start: t };
    if (comet) {
      const k = (t - comet.start) / 2.2;
      if (k >= 1) { comet = null; nextCometAt = t + 7 + Math.random() * 8; }
      else {
        const hx = comet.x - k * W * 0.45, hy = comet.y + k * H * 0.22;
        const tail = g.createLinearGradient(hx, hy, hx + W * 0.14, hy - H * 0.07);
        tail.addColorStop(0, `rgba(200,240,255,${Math.sin(k * Math.PI) * 0.9})`); tail.addColorStop(1, 'rgba(200,240,255,0)');
        g.strokeStyle = tail; g.lineWidth = 4; g.lineCap = 'round';
        g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx + W * 0.14, hy - H * 0.07); g.stroke();
        g.fillStyle = `rgba(255,255,255,${Math.sin(k * Math.PI)})`; g.beginPath(); g.arc(hx, hy, 4, 0, Math.PI * 2); g.fill();
      }
    }
    if (!base) {
      // 行星：各自慢慢上下浮动（底图里已经画好了行星，就不再画）
      g.drawImage(teal, W * 0.6 - 30, H * 0.13 - 30 + Math.sin(t * 0.5) * 4);
      g.drawImage(ringed, W * 0.8 - 210, H * 0.3 - 210 + Math.sin(t * 0.3 + 1) * 8);
      g.drawImage(purple, W * 0.1 - 80, H * 0.58 - 80 + Math.sin(t * 0.4 + 2) * 6);
    }
    // 星尘：没底图时画一团发光云；有底图时只在图里的环上撒闪烁光点
    g.save(); g.globalCompositeOperation = 'lighter';
    if (!base) {
      const glow = g.createRadialGradient(cloudX, cloudY, 0, cloudX, cloudY, cloudRX);
      glow.addColorStop(0, 'rgba(190,140,255,0.35)'); glow.addColorStop(0.5, 'rgba(255,190,120,0.14)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = glow;
      g.beginPath(); g.ellipse(cloudX, cloudY, cloudRX, cloudRY * 1.6, 0, 0, Math.PI * 2); g.fill();
    }
    for (const d of dust) {
      g.globalAlpha = 0.4 + 0.6 * Math.max(0, Math.sin(t * d.tw + d.phase));
      g.fillStyle = d.gold ? '#ffd88a' : '#d7b8ff';
      g.beginPath(); g.arc(d.x, d.y + Math.sin(t * 0.8 + d.phase) * 2, d.r, 0, Math.PI * 2); g.fill();
    }
    g.restore();
    g.globalAlpha = 1;
    return out;
  }
  frame(0);
  return { canvas: out, frame };
}

const animatedScenes = {};
const SCENE_MAKERS = { moon: makeMoonScene, space: makeSpaceScene };
/** 动态地点：返回 { canvas, frame(t) }，每帧调用 frame 更新画面。 */
export function getAnimatedSpot(id, base = null) {
  if (!SCENE_MAKERS[id]) return null;
  const cached = animatedScenes[id];
  if (!cached || (base && !cached.hasBase)) {
    animatedScenes[id] = SCENE_MAKERS[id](1536, 1024, base);
    animatedScenes[id].hasBase = !!base;
  }
  return animatedScenes[id];
}

/** 返回这个地点的背景：有正式图就用图，否则用占位画。结果是 canvas 或 Image。 */
export function loadSpotImage(spot) {
  return new Promise(resolve => {
    const draw = () => {
      const c = document.createElement('canvas');
      c.width = 1536; c.height = 1024;
      PLACEHOLDERS[spot.id](c.getContext('2d'), c.width, c.height);
      resolve(c);
    };
    if (spot.animated) {
      // 动态地点：有底图就"底图 + 代码动效"，底图加载失败就退回纯代码绘制
      if (!spot.image) return resolve(getAnimatedSpot(spot.id).canvas);
      const baseImg = new Image();
      baseImg.onload = () => resolve(getAnimatedSpot(spot.id, baseImg).canvas);
      baseImg.onerror = () => resolve(getAnimatedSpot(spot.id).canvas);
      baseImg.src = spot.image;
      return;
    }
    if (!spot.image) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = draw;
    img.src = spot.image;
  });
}

// ---------------------------------------------------------------- 环境音：全部实时合成
export function createAmbience() {
  let ctx = null, master = null, noise = null;
  let current = null;                        // 当前地点的节点和定时器，切换时一起清掉

  function setup() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const d = noise.getChannelData(0);
    // 粉红噪声（比白噪声柔和，更像自然环境）
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + w * 0.029591; b1 = 0.985 * b1 + w * 0.032534; b2 = 0.95 * b2 + w * 0.048056;
      d[i] = (b0 + b1 + b2 + w * 0.1) * 0.9;
    }
  }

  /** 一条循环的噪声：过滤波器 → 音量，返回 { src, filter, gain }。 */
  function noiseBed(type, freq, gainValue, q = 0.7) {
    const src = ctx.createBufferSource();
    src.buffer = noise; src.loop = true;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const filter = ctx.createBiquadFilter();
    filter.type = type; filter.frequency.value = freq; filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = gainValue;
    src.connect(filter).connect(gain).connect(master);
    src.start();
    current.nodes.push(src);
    return { src, filter, gain };
  }

  /** 一小段短促的噪声（钟表的滴答、翻纸）。 */
  function burst(time, freq, dur, peak, q = 3) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(peak, time + Math.min(0.004, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    src.connect(f).connect(g).connect(master);
    src.start(time, Math.random() * 2); src.stop(time + dur + 0.05);
  }

  /** 一声鸟叫 / 海鸥：正弦波的音高滑动。 */
  function call(time, from, to, dur, peak, vibrato = 0) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(from, time);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, time + dur);   // to = 0：音高不变（星星的"叮"）
    if (vibrato) {
      const lfo = ctx.createOscillator(), amount = ctx.createGain();
      lfo.frequency.value = vibrato; amount.gain.value = from * 0.04;
      lfo.connect(amount).connect(osc.frequency);
      lfo.start(time); lfo.stop(time + dur);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(peak, time + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(g).connect(master);
    osc.start(time); osc.stop(time + dur + 0.05);
  }

  /** 每隔一段随机时间做一件事（鸟叫、海鸥、翻纸）。 */
  function every(minS, maxS, fn) {
    const bag = current;                     // 记住属于哪个地点：切换后旧地点的定时器不会再往新地点里塞
    const loop = () => {
      const id = setTimeout(() => { if (current !== bag) return; fn(ctx.currentTime + 0.05); loop(); }, (minS + Math.random() * (maxS - minS)) * 1000);
      bag.timers.push(id);
    };
    loop();
  }

  const SCENES = {
    // 家里的书桌：钟表滴答 + 室内底噪 + 偶尔翻纸 + 窗外鸟叫
    desk() {
      noiseBed('lowpass', 380, 0.06);                                    // 房间里很轻的"空气声"
      let tock = false;
      const tick = () => {
        const t = ctx.currentTime + 0.05;
        burst(t, tock ? 2300 : 3100, 0.025, 0.05, 8);                   // 滴、答 两个音高交替
        tock = !tock;
      };
      current.timers.push(setInterval(tick, 1000));
      every(9, 18, t => burst(t, 1600, 0.35, 0.03, 0.8));              // 翻一页纸
      every(6, 14, t => {                                                // 窗外的小鸟：两三声短促的啾
        const base = 3000 + Math.random() * 1200;
        for (let k = 0; k < 2 + Math.floor(Math.random() * 2); k++) call(t + k * 0.14, base, base * 1.25, 0.09, 0.02);
      });
    },
    // 海边：两层错开的海浪（一涌一退）+ 海风 + 远处的海鸥
    seaside() {
      for (const [period, offset, cutoff] of [[8, 0, 900], [11, 4, 600]]) {
        const wave = noiseBed('lowpass', cutoff, 0.02);
        // 每一波：3 秒涌上来（变响、变亮）→ 慢慢退下去
        const swell = () => {
          const t = ctx.currentTime + 0.05;
          wave.gain.gain.cancelScheduledValues(t);
          wave.gain.gain.setValueAtTime(0.02, t);
          wave.gain.gain.linearRampToValueAtTime(0.22, t + 3);
          wave.gain.gain.linearRampToValueAtTime(0.03, t + period - 0.5);
          wave.filter.frequency.cancelScheduledValues(t);
          wave.filter.frequency.setValueAtTime(cutoff * 0.5, t);
          wave.filter.frequency.linearRampToValueAtTime(cutoff * 2, t + 3);
          wave.filter.frequency.linearRampToValueAtTime(cutoff * 0.5, t + period - 0.5);
        };
        const bag = current;
        bag.timers.push(setTimeout(() => { swell(); bag.timers.push(setInterval(swell, period * 1000)); }, offset * 1000));
      }
      noiseBed('bandpass', 700, 0.03, 0.5);                              // 海风
      every(10, 22, t => {                                               // 远处的海鸥：两三声往下滑的叫声
        for (let k = 0; k < 2 + Math.floor(Math.random() * 2); k++) call(t + k * 0.4, 1500, 950, 0.32, 0.018, 18);
      });
    },
    // 月亮上：低沉温柔的嗡鸣（两个略微错开的低音相互"拍动"）+ 很远的气流声 + 偶尔星星般的"叮"
    moon() {
      for (const [freq, detune] of [[55, 0], [82.4, 3], [110, -4]]) {
        const osc = ctx.createOscillator();
        osc.type = 'sine'; osc.frequency.value = freq; osc.detune.value = detune;
        const g = ctx.createGain(); g.gain.value = freq === 55 ? 0.05 : 0.025;
        osc.connect(g).connect(master); osc.start();
        current.nodes.push(osc);
      }
      noiseBed('bandpass', 400, 0.012, 0.4);
      every(3, 7, t => {
        const notes = [1318.5, 1568, 1760, 2093, 2349];               // E6 G6 A6 C7 D7：五声音阶，怎么叮都好听
        call(t, notes[Math.floor(Math.random() * notes.length)], 0, 2.5, 0.018);
      });
    },
    // 外太空：Cmaj7 → Am9 慢慢交替的梦幻和弦 + 很高很细的星光沙沙 + 偶尔几声叮
    space() {
      const chords = [[48, 55, 59, 64, 71], [45, 52, 60, 64, 71]];   // Cmaj7 / Am9（MIDI 编号）
      const midiHz = n => 440 * Math.pow(2, (n - 69) / 12);
      let k = 0;
      const playChord = () => {
        const t = ctx.currentTime + 0.05;
        for (const n of chords[k % 2]) {
          const osc = ctx.createOscillator();
          osc.type = 'triangle'; osc.frequency.value = midiHz(n); osc.detune.value = (Math.random() - 0.5) * 8;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(0.018, t + 3.5);             // 慢慢浮现
          g.gain.linearRampToValueAtTime(0.0001, t + 10);              // 慢慢消散，和下一组交叠
          osc.connect(g).connect(master);
          osc.start(t); osc.stop(t + 10.2);
        }
        k++;
      };
      playChord();
      current.timers.push(setInterval(playChord, 8000));
      const shimmer = noiseBed('bandpass', 6500, 0.012, 1.2);          // 星光沙沙
      const lfo = ctx.createOscillator(), amount = ctx.createGain();
      lfo.frequency.value = 0.15; amount.gain.value = 0.008;
      lfo.connect(amount).connect(shimmer.gain.gain); lfo.start();
      current.nodes.push(lfo);
      every(4, 9, t => {
        const notes = [1046.5, 1318.5, 1568, 1975.5, 2637];
        call(t, notes[Math.floor(Math.random() * notes.length)], 0, 3, 0.014);
      });
    },
    quiet() {}
  };

  return {
    /** 切到某个地点的环境音（需要在用户点击之后调用，浏览器才允许出声）。 */
    play(id) {
      if (!ctx) setup();
      if (ctx.state === 'suspended') ctx.resume();
      this.stop(0.6);
      const start = () => {
        current = { nodes: [], timers: [] };
        SCENES[id] && SCENES[id]();
        const t = ctx.currentTime;
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(0, t);
        master.gain.linearRampToValueAtTime(id === 'quiet' ? 0 : 0.8, t + 2);   // 2 秒淡入
      };
      setTimeout(start, 650);
    },
    stop(seconds = 0.8) {
      if (!ctx || !current) return;
      const old = current;
      current = null;
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0, t + seconds);
      setTimeout(() => {
        old.timers.forEach(id => { clearTimeout(id); clearInterval(id); });
        old.nodes.forEach(n => { try { n.stop(); } catch { /* 已停 */ } });
      }, seconds * 1000 + 50);
    }
  };
}
