// wand.js — 魔法棒：光标 + 仙尘拖尾（2D 叠加层）
//
// 3D 里的"杖尖光源"在 library.js（它需要场景和镜头）；这里只管屏幕上的东西：
//   · 魔法棒光标（CSS cursor，见 index.html 的 .wand / .wand-glow）
//   · 移动时洒下的金色小星星，点击时炸开一团
// 触屏没有光标，但手指划过和点击同样会有仙尘。

const COLORS = ['#fff4c8', '#ffd878', '#f7c35a', '#ffffff'];

export function createWand(layer) {
  const g = layer.getContext('2d');
  const particles = [];
  let last = null;                           // 上一次撒仙尘的位置（按移动距离撒，速度快时更多）

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    layer.width = window.innerWidth * dpr;
    layer.height = window.innerHeight * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  function spawn(x, y, speed = 0.4, life = 0.8) {
    const a = Math.random() * Math.PI * 2;
    particles.push({
      x, y,
      vx: Math.cos(a) * speed * 40, vy: Math.sin(a) * speed * 40 + 12,   // 微微往下飘
      size: 2 + Math.random() * 4,
      spin: Math.random() * Math.PI,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      life, age: 0
    });
  }

  /** 光标移动：每移动约 10 像素撒一颗。 */
  function trail(x, y) {
    if (!last) { last = { x, y }; return; }
    const dist = Math.hypot(x - last.x, y - last.y);
    const count = Math.min(6, Math.floor(dist / 10));
    for (let i = 0; i < count; i++) {
      const k = (i + 1) / count;
      spawn(last.x + (x - last.x) * k, last.y + (y - last.y) * k);
    }
    if (count) last = { x, y };
  }

  /** 点击：炸开一团。 */
  function burst(x, y, n = 18) {
    for (let i = 0; i < n; i++) spawn(x, y, 1.6 + Math.random() * 1.6, 0.9 + Math.random() * 0.4);
  }

  function star(x, y, r, spin) {
    g.beginPath();
    for (let k = 0; k < 8; k++) {
      const rr = k % 2 ? r * 0.3 : r, a = spin + (k / 8) * Math.PI * 2;
      g[k ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
  }

  function update(dt) {
    g.clearRect(0, 0, layer.width, layer.height);
    g.globalCompositeOperation = 'lighter';  // 叠加发光
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      if (p.age > p.life) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.94; p.vy = p.vy * 0.94 + 18 * dt;
      p.spin += dt * 3;
      const k = 1 - p.age / p.life;
      g.globalAlpha = k;
      g.fillStyle = p.color;
      g.shadowColor = p.color; g.shadowBlur = 8;
      star(p.x, p.y, p.size * (0.5 + k * 0.5), p.spin);
    }
    g.globalAlpha = 1;
    g.shadowBlur = 0;
    g.globalCompositeOperation = 'source-over';
  }

  return { trail, burst, update, lift() { last = null; } };
}
