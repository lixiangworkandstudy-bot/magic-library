// owl.js — 图书管理员猫头鹰「咕咕教授」：有求必应的选择式找书
//
// 罗琳的有求必应屋：你真心需要什么，它就变成什么。这里是儿童版 + 安全版：
// 孩子不打字，只点选"想看什么样的故事"，猫头鹰就把合适的书从书架上叫到面前。
// 以后要接 AI 推荐，只需把 library.js 里"挑书"那一步换掉，这个外壳不用变。

// 雪鸮（参考真实鸟类：通体雪白、黑色斑点和横纹、金黄色眼睛、喙藏在蓬松的羽毛里、圆圆的面盘）
const OWL_SVG = `
<svg viewBox="0 0 100 118" aria-hidden="true">
  <defs>
    <radialGradient id="owlBody" cx="45%" cy="35%" r="70%">
      <stop offset="0" stop-color="#ffffff"/><stop offset="0.65" stop-color="#eef0f6"/><stop offset="1" stop-color="#c9cddb"/>
    </radialGradient>
    <radialGradient id="owlFace" cx="50%" cy="45%" r="60%">
      <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e6e8f0"/>
    </radialGradient>
    <radialGradient id="owlEye" cx="40%" cy="35%" r="65%">
      <stop offset="0" stop-color="#fff3a8"/><stop offset="0.55" stop-color="#f6c230"/><stop offset="1" stop-color="#c98a10"/>
    </radialGradient>
    <linearGradient id="owlWing" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f4f5fa"/><stop offset="1" stop-color="#cfd3e0"/>
    </linearGradient>
  </defs>
  <!-- 蹲着的一摞书（烫金书口） -->
  <rect x="12" y="100" width="76" height="8" rx="2" fill="#6a3d7a"/>
  <rect x="12" y="100" width="76" height="1.6" fill="#e9cf86"/>
  <rect x="16" y="108" width="70" height="8" rx="2" fill="#27366b"/>
  <rect x="16" y="108" width="70" height="1.6" fill="#e9cf86"/>
  <g class="owl-body">
    <!-- 身体：蓬松的蛋形 -->
    <path d="M50 20 C77 20 84 48 82 70 C80 92 66 101 50 101 C34 101 20 92 18 70 C16 48 23 20 50 20 Z" fill="url(#owlBody)"/>
    <!-- 翅膀：两侧收拢，带黑色横纹 -->
    <path d="M22 50 C12 64 14 88 30 98 C28 82 28 64 32 52 Z" fill="url(#owlWing)"/>
    <path d="M78 50 C88 64 86 88 70 98 C72 82 72 64 68 52 Z" fill="url(#owlWing)"/>
    <g fill="#3a3348" opacity="0.8">
      <path d="M20 66 q4 -1.5 7 0 q-3.5 2 -7 0Z"/><path d="M19 75 q4 -1.5 8 0 q-4 2 -8 0Z"/><path d="M21 84 q4 -1.5 7 0 q-3.5 2 -7 0Z"/>
      <path d="M73 66 q4 -1.5 7 0 q-3.5 2 -7 0Z"/><path d="M73 75 q4 -1.5 8 0 q-4 2 -8 0Z"/><path d="M72 84 q4 -1.5 7 0 q-3.5 2 -7 0Z"/>
    </g>
    <!-- 胸口的小斑点（雪鸮的特征） -->
    <g fill="#4a4258" opacity="0.55">
      <circle cx="42" cy="72" r="1.1"/><circle cx="50" cy="75" r="1.1"/><circle cx="58" cy="72" r="1.1"/>
      <circle cx="46" cy="81" r="1"/><circle cx="54" cy="81" r="1"/><circle cx="40" cy="88" r="0.9"/><circle cx="50" cy="89" r="0.9"/><circle cx="60" cy="88" r="0.9"/>
    </g>
    <!-- 头顶的细斑 -->
    <g fill="#4a4258" opacity="0.5">
      <circle cx="40" cy="28" r="0.9"/><circle cx="50" cy="25" r="0.9"/><circle cx="60" cy="28" r="0.9"/><circle cx="45" cy="31" r="0.7"/><circle cx="55" cy="31" r="0.7"/>
    </g>
    <!-- 圆圆的面盘 -->
    <path d="M50 30 C66 30 72 42 70 52 C68 62 60 66 50 66 C40 66 32 62 30 52 C28 42 34 30 50 30 Z" fill="url(#owlFace)"/>
    <path d="M36 36 q14 -8 28 0" stroke="#d4d7e2" stroke-width="1" fill="none"/>
    <!-- 金色眼睛 -->
    <circle cx="40" cy="47" r="8.4" fill="#2a2433"/>
    <circle cx="60" cy="47" r="8.4" fill="#2a2433"/>
    <circle cx="40" cy="47" r="7.4" fill="url(#owlEye)"/>
    <circle cx="60" cy="47" r="7.4" fill="url(#owlEye)"/>
    <g class="owl-pupils">
      <circle cx="40.6" cy="47.6" r="3.6" fill="#15111c"/>
      <circle cx="60.6" cy="47.6" r="3.6" fill="#15111c"/>
      <circle cx="42.4" cy="45.2" r="1.5" fill="#fff"/>
      <circle cx="62.4" cy="45.2" r="1.5" fill="#fff"/>
      <circle cx="39" cy="49.4" r="0.7" fill="#fff" opacity="0.7"/>
      <circle cx="59" cy="49.4" r="0.7" fill="#fff" opacity="0.7"/>
    </g>
    <!-- 眼皮：白色羽毛，眨眼时合上 -->
    <g class="owl-lids">
      <circle cx="40" cy="47" r="8.8" fill="#f2f3f8"/>
      <circle cx="60" cy="47" r="8.8" fill="#f2f3f8"/>
      <path d="M32 48 q8 4 16 0 M52 48 q8 4 16 0" stroke="#b9bccb" stroke-width="1" fill="none"/>
    </g>
    <!-- 喙：黑色，一小半藏在羽毛里 -->
    <path d="M47.5 54 C48.5 52.5 51.5 52.5 52.5 54 L50 60 Z" fill="#2a2433"/>
    <path d="M44 55 q6 3 12 0" stroke="#ffffff" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <!-- 细细的金丝圆眼镜：图书管理员 -->
    <circle cx="40" cy="47" r="10.6" fill="none" stroke="#d9b25f" stroke-width="1.2" opacity="0.9"/>
    <circle cx="60" cy="47" r="10.6" fill="none" stroke="#d9b25f" stroke-width="1.2" opacity="0.9"/>
    <path d="M49.6 45.5 q0.4 -1.6 0.8 0" stroke="#d9b25f" stroke-width="1.2" fill="none"/>
    <!-- 爪子：毛茸茸的，只露黑色爪尖 -->
    <ellipse cx="40" cy="99" rx="7" ry="3.2" fill="#f4f5fa"/>
    <ellipse cx="60" cy="99" rx="7" ry="3.2" fill="#f4f5fa"/>
    <path d="M35 101 l-1 2 M39 101.5 l0 2 M43 101 l1 2 M57 101 l-1 2 M61 101.5 l0 2 M65 101 l1 2" stroke="#2a2433" stroke-width="1.2" stroke-linecap="round"/>
  </g>
</svg>`;

export function createOwl({ lines, t, onChoose }) {
  const owl = document.createElement('button');
  owl.type = 'button';
  owl.className = 'owl';
  owl.innerHTML = OWL_SVG;
  // 有插画版（assets/library/owl.png）就换成插画；眨眼图 owl-blink.png 可选
  const art = new Image();
  art.onload = () => {
    owl.innerHTML = '';
    owl.classList.add('art');
    const img = Object.assign(document.createElement('img'), { src: art.src, alt: '', className: 'owl-art' });
    owl.append(img);
    const blink = new Image();
    blink.onload = () => {
      // 每隔几秒换成闭眼图一瞬间
      setInterval(() => { img.src = blink.src; setTimeout(() => { img.src = art.src; }, 140); }, 4600);
    };
    blink.src = 'assets/library/owl-blink.png';
  };
  art.src = 'assets/library/owl.png';
  const bubble = document.createElement('div');
  bubble.className = 'owl-bubble';
  bubble.hidden = true;
  document.body.append(owl, bubble);

  let ctx = null;
  /** 咕咕两声：两个往下滑的柔和低音。 */
  function hoot() {
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.32].forEach((delay, i) => {
        const t0 = ctx.currentTime + delay;
        const osc = ctx.createOscillator(), g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(i ? 420 : 480, t0);
        osc.frequency.exponentialRampToValueAtTime(i ? 330 : 380, t0 + 0.28);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.08, t0 + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
        osc.connect(g).connect(ctx.destination);
        osc.start(t0); osc.stop(t0 + 0.35);
      });
    } catch { /* 没声音也不影响 */ }
  }

  function say(text, withChoices) {
    bubble.replaceChildren();
    const name = document.createElement('strong');
    name.textContent = t(lines.name);
    const p = document.createElement('p');
    p.textContent = text;
    bubble.append(name, p);
    if (withChoices) {
      const grid = document.createElement('div');
      grid.className = 'owl-choices';
      for (const c of lines.choices) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = `${c.icon} ${t(c.label)}`;
        b.addEventListener('click', e => { e.stopPropagation(); onChoose(c.tag); });
        grid.append(b);
      }
      bubble.append(grid);
    }
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'owl-close';
    close.textContent = t(lines.close);
    close.addEventListener('click', e => { e.stopPropagation(); hide(); });
    bubble.append(close);
    bubble.hidden = false;
    owl.classList.add('talking');
  }

  function hide() { bubble.hidden = true; owl.classList.remove('talking'); }

  owl.addEventListener('click', e => {
    e.stopPropagation();
    if (!bubble.hidden) { hide(); return; }
    hoot();
    say(t(lines.greet), true);
  });
  window.addEventListener('pointerdown', e => {
    if (!bubble.hidden && !e.target.closest('.owl, .owl-bubble')) hide();
  });

  return {
    /** 找到书之后说一句话（不再显示选项），几秒后自动收起。 */
    report(text) {
      hoot();
      say(text, false);
      clearTimeout(this._timer);
      this._timer = setTimeout(hide, 5000);
    },
    hide,
    refresh() { if (!bubble.hidden) say(t(lines.greet), true); }
  };
}
