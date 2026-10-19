// magic-overlays.js — Magic Book 的两个覆盖层：书停下来问孩子 / 请孩子画羊
//
// 立体书机关（mechanics.js）和插图书（pagebook.js）共用。样式在 style.css「Magic Book 覆盖层」。
// 都返回 Promise：朗读会等孩子答完 / 画完再接着读。

function overlay() {
  const el = document.createElement('div');
  el.className = 'magic-overlay';
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('on'));
  const close = () => { el.classList.remove('on'); setTimeout(() => el.remove(), 300); };
  return { el, close };
}

export function askOverlay(m, play = () => {}) {
  return new Promise(resolve => {
    const { el, close } = overlay();
    const card = document.createElement('div');
    card.className = 'magic-card';
    if (m.image) card.append(Object.assign(document.createElement('img'), { src: m.image.file, alt: '', className: 'magic-card-image' }));
    card.append(Object.assign(document.createElement('p'), { className: 'magic-card-q', textContent: m.question }));
    const row = document.createElement('div');
    row.className = 'magic-card-choices';
    for (const [icon, label] of m.choices) {
      const b = Object.assign(document.createElement('button'), { type: 'button', className: 'magic-choice' });
      b.innerHTML = `<span class="magic-choice-icon">${icon}</span><span>${label}</span>`;
      b.addEventListener('click', () => {
        play('chime');
        row.querySelectorAll('button').forEach(x => { x.disabled = true; x.classList.toggle('picked', x === b); });
        if (m.reply) card.append(Object.assign(document.createElement('p'), { className: 'magic-card-reply', textContent: m.reply }));
        setTimeout(() => { close(); resolve(label); }, m.reply ? 1600 : 700);   // 不评判对错：选了就接着读
      });
      row.append(b);
    }
    card.append(row);
    el.append(card);
  });
}

export function drawOverlay(play = () => {}) {
  return new Promise(resolve => {
    const { el, close } = overlay();
    const card = document.createElement('div');
    card.className = 'magic-card magic-draw';
    card.append(Object.assign(document.createElement('p'), { className: 'magic-card-q', textContent: 'Draw the sheep you want. It lives inside the box!' }));
    const canvas = document.createElement('canvas');
    canvas.width = 640; canvas.height = 480;
    canvas.className = 'magic-draw-canvas';
    const g = canvas.getContext('2d');
    g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 9; g.strokeStyle = '#2a2420';
    let drawing = false, drew = false;
    const at = e => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * canvas.width / r.width, (e.clientY - r.top) * canvas.height / r.height]; };
    canvas.addEventListener('pointerdown', e => { drawing = true; drew = true; canvas.setPointerCapture(e.pointerId); g.beginPath(); g.moveTo(...at(e)); });
    canvas.addEventListener('pointermove', e => { if (drawing) { g.lineTo(...at(e)); g.stroke(); } });
    canvas.addEventListener('pointerup', () => { drawing = false; });
    const row = document.createElement('div');
    row.className = 'magic-card-choices';
    const clear = Object.assign(document.createElement('button'), { type: 'button', className: 'magic-choice', textContent: 'Start again' });
    clear.addEventListener('click', () => { g.clearRect(0, 0, canvas.width, canvas.height); drew = false; });
    const done = Object.assign(document.createElement('button'), { type: 'button', className: 'magic-choice primary', textContent: 'Done ✓' });
    done.addEventListener('click', () => {
      play('chime');
      const url = drew ? canvas.toDataURL('image/png') : null;   // 没画也可以：箱子里的羊你看不见也没关系
      close();
      resolve(url);
    });
    row.append(clear, done);
    card.append(canvas, row);
    el.append(card);
  });
}

const SHEEP_KEY = 'magic-library/my-sheep';
export const loadSheep = () => { try { return localStorage.getItem(SHEEP_KEY); } catch { return null; } };
export const saveSheep = url => { try { localStorage.setItem(SHEEP_KEY, url); } catch { /* 存不下就只在这次阅读里 */ } };

