// pagebook.js — 会动的插图书（Magic Book 的第二种形式）
//
// 适合有文学性的原著（第一本：《小王子》）。和立体书不同：
//   · 原文全文印在纸上（这里排版、分页），不是漂浮字幕；朗读时纸上的词一个个被"荧光笔"划过
//   · 插图放在作者原书放插图的位置；魔法发生在插图上（像《预言家日报》会动的照片），
//     或者从某个词里冒出来（读到 laughter，铃铛从那个词里飞出来）
//   · 没有立起来的纸片；书从正上方看，像把书捧在手里
//
// 结构：
//   prepareIllustratedBook(data)  在创建 PopupBook 之前调用：按真实字体分页，生成每个跨页的 canvas 页面，
//                                 填好 data.spreads / spreadOrder / assets（canvas 资产，见 book3d.js）
//   controller.attach(book, caption)  书建好之后接上：高亮、插图动画、点词、魔法线索
//
// 坐标：一个跨页 = 一张 2200×1239 的 canvas（左页 0–1100，右页 1100–2200），
//       对应书上 x ∈ [-pageW, pageW]、z ∈ [-0.5, 0.5]（页顶 = 远端）。

import * as THREE from 'three';
import { askOverlay, drawOverlay, loadSheep, saveSheep } from './magic-overlays.js';

const PW = 1100, PH = 1239;                     // 一页的像素（跨页 = 2 × PW）
const M = { top: 104, bottom: 120, outer: 84, inner: 112 };
const BODY = { size: 44, lead: 70, indent: 56, gap: 14, family: '"Libre Baskerville", Georgia, serif' };   // 孩子读得清的字号：一页大约 100 词
const TITLE = { size: 70, family: '"IM Fell English SC", "IM Fell English", Georgia, serif' };
const PAPER = '#f5edda', INK = '#2c2622', RED_INK = '#9a3a24';
const MARK = 'rgba(255, 200, 70, 0.6)', TAP_MARK = 'rgba(120, 180, 255, 0.45)';

const font = (px, italic = false) => `${italic ? 'italic ' : ''}${px}px ${BODY.family}`;
const ease = t => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const clamp01 = v => Math.max(0, Math.min(1, v));

function loadImage(src) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });
}

// ================================================================ 第一步：分页
export async function prepareIllustratedBook(data) {
  // 等字体真正加载好再量字宽，不然分页会和最后显示的不一样
  // 注意：字体样式表可能还没解析完，document.fonts.load 会"立刻成功"但什么也没加载——
  // 那样量出来的字宽和最后画出来的不一样，词会挤在一起。所以一直等到字体真的可用（最多 5 秒）。
  const want = [font(BODY.size), font(BODY.size, true), `${TITLE.size}px "IM Fell English SC"`];
  const t0 = performance.now();
  while (performance.now() - t0 < 5000) {
    try { await Promise.all(want.map(f => document.fonts.load(f))); } catch { /* 继续等 */ }
    if (want.every(f => document.fonts.check(f))) break;
    await new Promise(r => setTimeout(r, 120));
  }

  // 插图图片
  const files = new Set();
  for (const it of data.flow) if (it.type === 'img') ['image', 'to', 'walker'].forEach(k => it[k] && files.add(it[k].file));
  for (const e of data.effects || []) if (e.image) files.add(e.image.file);
  const images = new Map(await Promise.all([...files].map(async f => [f, await loadImage(f)])));

  const measure = document.createElement('canvas').getContext('2d');
  const pages = [];
  let page = null, y = 0;
  const newPage = () => {
    page = { index: pages.length, words: [], items: [], titles: [], chapter: null };
    pages.push(page);
    y = M.top;
  };
  const left = p => (p.index % 2 === 0 ? M.outer : M.inner);
  const right = p => PW - (p.index % 2 === 0 ? M.inner : M.outer);
  const bottom = PH - M.bottom;
  const contentH = PH - M.top - M.bottom;
  newPage();

  /** 试排一段：返回需要几行（判断放不放得下）。 */
  const linesFor = (text, x0, width, indent) => {
    measure.font = font(BODY.size);
    let lines = 1, x = indent;
    for (const w of text.split(/\s+/)) {
      const ww = measure.measureText(w).width, sp = measure.measureText(' ').width;
      if (x > 0 && x + ww > width) { lines += 1; x = 0; }
      x += ww + sp;
    }
    return lines;
  };

  let chapterTitle = '';
  for (const it of data.flow) {
    if (it.type === 'chapter') {
      if (page.words.length || page.items.length || page.titles.length) newPage();
      chapterTitle = it.title;
      page.chapter = it.title;
      if (it.label) {
        page.titles.push({ text: it.label, y: y + TITLE.size });
        y += TITLE.size + 70;
      } else {
        y += 140;                                       // 献词页：从更靠下的地方开始
      }
      continue;
    }
    if (it.type === 'img') {
      const h = it.h * contentH, w = Math.min(right(page) - left(page), h * it.image.aspect);
      if (y + h > bottom) newPage();
      const x = (left(page) + right(page)) / 2 - w / 2;
      page.items.push({ ...it, x, y, w, hpx: h, img: images.get(it.image.file), imgTo: it.to && images.get(it.to.file), imgWalker: it.walker && images.get(it.walker.file) });
      y += h + 26;
      continue;
    }
    // ---- 段落
    measure.font = font(BODY.size);
    const space = measure.measureText(' ').width;
    const center = it.style === 'center';
    let x = null, lineWords = [];
    const flushCenter = () => {                          // 居中的行：排完一行再整体挪到中间
      if (!center || !lineWords.length) return;
      const l = lineWords[0], r = lineWords[lineWords.length - 1];
      const shift = (left(page) + right(page)) / 2 - (l.x + (r.x + r.w - l.x) / 2);
      lineWords.forEach(w => { w.x += shift; });
      lineWords = [];
    };
    const newLine = () => {
      flushCenter();
      y += BODY.lead;
      if (y > bottom) newPage();
      x = left(page);
    };
    y += BODY.lead * 0.78;                               // 第一行的基线
    if (y > bottom) newPage();
    x = left(page) + (center ? 0 : BODY.indent);
    it.passages.forEach((p, k) => {
      // 右页放不下整段朗读单位 → 换到下一个跨页（朗读到的词必须在眼前这一页上）
      if (page.index % 2 === 1) {
        const need = linesFor(p.text, x - left(page), right(page) - left(page), x - left(page));
        if (y + (need - 1) * BODY.lead > bottom) { flushCenter(); newPage(); y += BODY.lead * 0.78; x = left(page); }
      }
      const re = /\S+|\n/g;
      let m;
      while ((m = re.exec(p.text))) {
        if (m[0] === '\n') { newLine(); continue; }
        const ww = measure.measureText(m[0]).width;
        if (x > left(page) && x + ww > right(page)) newLine();
        const word = { text: m[0], x, y, w: ww, page: page.index, passage: p.id, para: it.para, start: m.index, lineIdx: 0 };
        // 献词第二行（\n 之后）：作者亲手补写的那句，先藏着，读到时像墨水一样写出来
        if (it.para === 'c00-p03' && m.index > p.text.indexOf('\n')) word.ink = 'write';
        page.words.push(word);
        if (center) lineWords.push(word);
        x += ww + space;
      }
    });
    flushCenter();
    y += BODY.lead * 0.22 + BODY.gap;
  }

  // ---- 跨页
  const spreadCount = Math.ceil(pages.length / 2);
  data.spreads = [];
  data.spreadOrder = [];
  const spreads = [];
  for (let s = 0; s < spreadCount; s++) {
    const canvas = document.createElement('canvas');
    canvas.width = PW * 2; canvas.height = PH;
    const base = document.createElement('canvas');
    base.width = PW * 2; base.height = PH;
    const id = `spread-${String(s + 1).padStart(2, '0')}`;
    const assetId = `page-${id}`;
    const file = `canvas:${id}`;
    data.assets.push({ id: assetId, type: 'page-art', role: 'ground-only', file, canvas });
    const ps = [pages[s * 2], pages[s * 2 + 1]].filter(Boolean);
    const seen = new Set();
    const passages = [];
    for (const pg of ps) for (const w of pg.words) {
      if (seen.has(w.passage)) continue;
      seen.add(w.passage);
      const p = data.flow.find(f => f.type === 'p' && f.passages.some(q => q.id === w.passage)).passages.find(q => q.id === w.passage);
      passages.push(p);
    }
    const chapter = ps.map(p => p.chapter).find(Boolean) || null;
    data.spreads.push({
      id, chapterId: 'vol-1', title: chapter || '', titleEn: chapter || '',
      pageArt: { left: assetId, right: assetId }, scene: [], passages,
      camera: { pitch: 0.34 }                                   // 从正上方看，像捧着书读
    });
    data.spreadOrder.push(id);
    spreads.push({ id, file, canvas, base, pages: ps, dirty: true });
  }
  // 每页的章节名：没有新章节的页沿用上一章
  let last = '';
  for (const sp of data.spreads) { if (sp.title) last = sp.title; else { sp.title = last; sp.titleEn = last; } }

  return createController(data, spreads, images);
}

// ================================================================ 第二步：画页面 + 接上书
function createController(data, spreads, images) {
  const state = {
    written: 0,              // 献词补写的进度（0–1）
    mark: null,              // 正在读的词 { passage, start }
    tapMark: null,           // 刚被点的词
    ill: new Map()           // 插图状态：id → { shown, revealed, sheep, sleeping, angle ... }
  };
  for (const sp of spreads) for (const pg of sp.pages) for (const it of pg.items) {
    state.ill.set(it.id, { shown: !it.cue || it.kind !== 'appear', t: it.kind === 'appear' && it.cue ? 0 : 1, revealed: false, rt: 0, inviting: false, angle: 0, sleeping: false });
  }

  // ---- 纸张纹理（只做一次）
  const grain = document.createElement('canvas');
  grain.width = grain.height = 256;
  {
    const g = grain.getContext('2d'), d = g.createImageData(256, 256);
    for (let i = 0; i < d.data.length; i += 4) {
      const v = 128 + (Math.random() - 0.5) * 26;
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 22;
    }
    g.putImageData(d, 0, 0);
  }

  const offsetX = pg => (pg.index % 2) * PW;

  /** 画一幅插图在某个状态下的样子（基础层和动画层都用它）。 */
  function drawIllustration(g, it, x, y, time = 0) {
    const st = state.ill.get(it.id);
    const { w, hpx: h } = it;
    if (!it.img) return;
    if (it.kind === 'appear') {
      const e = ease(clamp01(st.t));
      if (e <= 0) return;
      g.save();
      if (it.style === 'draw') {                         // 像被一笔笔画出来：从左往右露出
        g.beginPath(); g.rect(x, y, w * e, h); g.clip();
        g.drawImage(it.img, x, y, w, h);
      } else {
        g.globalAlpha = e;
        g.drawImage(it.img, x, y + (1 - e) * 20, w, h);
      }
      g.restore();
      return;
    }
    if (it.kind === 'living') {                          // 活的画面：轻轻地呼吸
      const s = 1 + Math.sin(time * 1.6) * 0.012;
      g.drawImage(it.img, x + w * (1 - s) / 2, y + h * (1 - s), w * s, h * s);
      return;
    }
    if (it.kind === 'reveal') {
      g.drawImage(it.img, x, y, w, h);
      const e = ease(clamp01(st.rt));
      if (e > 0 && it.imgTo) {                           // 一圈光照进去：圆形范围里露出"里面"
        g.save();
        g.beginPath(); g.arc(x + w / 2, y + h / 2, Math.hypot(w, h) / 2 * e, 0, Math.PI * 2); g.clip();
        g.fillStyle = PAPER; g.fillRect(x, y, w, h);
        g.drawImage(it.imgTo, x, y, w, h);
        g.restore();
        if (e < 1) {
          g.save();
          g.strokeStyle = 'rgba(255, 220, 120, 0.8)'; g.lineWidth = 10;
          g.beginPath(); g.arc(x + w / 2, y + h / 2, Math.hypot(w, h) / 2 * e, 0, Math.PI * 2); g.stroke();
          g.restore();
        }
      }
      if (st.inviting && !st.revealed) {                 // 邀请：一圈呼吸的金光
        g.save();
        g.strokeStyle = `rgba(230, 170, 60, ${0.35 + Math.sin(time * 3) * 0.25})`;
        g.lineWidth = 6; g.setLineDash([14, 10]);
        g.strokeRect(x - 12, y - 12, w + 24, h + 24);
        g.restore();
      }
      return;
    }
    if (it.kind === 'box') {
      // 你的羊从箱子上面探出头（箱子图上方留了空白）
      if (st.sheep) {
        const bob = Math.sin(time * (st.sleeping ? 1.2 : 2.4)) * 4;
        const sw = w * 0.5, sh = sw * 0.75;
        g.drawImage(st.sheep, x + w / 2 - sw / 2, y + h * 0.42 - sh + bob, sw, sh);
      }
      g.drawImage(it.img, x, y, w, h);
      if (st.sleeping) {
        g.save();
        g.font = `italic ${36 + Math.sin(time * 1.6) * 4}px Georgia, serif`;
        g.fillStyle = `rgba(80, 70, 120, ${0.45 + Math.sin(time * 1.6) * 0.35})`;
        g.fillText('Zzz', x + w * 0.74, y + h * 0.3 - ((time * 12) % 30));
        g.restore();
      }
      return;
    }
    if (it.kind === 'spin') {
      const r = Math.min(w, h) / 2 * 0.86, cx = x + w / 2, cy = y + h - r - 4;
      g.save();
      g.translate(cx, cy); g.rotate(st.angle + (st.inviting && !st.moved ? Math.sin(time * 3) * 0.06 : 0));
      g.drawImage(it.img, -r, -r, r * 2, r * 2);
      g.restore();
      if (it.imgWalker) {                                // 他一直站在星球顶上，星球在他脚下转
        const wh = r * 0.62, ww = wh * it.walker.aspect;
        const hop = st.walking ? Math.abs(Math.sin(time * 9)) * 6 : 0;
        g.drawImage(it.imgWalker, cx - ww / 2, cy - r - wh + 6 - hop, ww, wh);
      }
      return;
    }
    g.drawImage(it.img, x, y, w, h);
  }

  /** 画整张跨页的"底"：纸、文字、插图（当前状态的快照——翻页时纸上看到的就是它）。 */
  function paintBase(sp, time = 0) {
    const g = sp.base.getContext('2d');
    g.fillStyle = PAPER; g.fillRect(0, 0, PW * 2, PH);
    g.fillStyle = g.createPattern(grain, 'repeat'); g.fillRect(0, 0, PW * 2, PH);
    // 书缝的阴影
    const gut = g.createLinearGradient(PW - 90, 0, PW + 90, 0);
    gut.addColorStop(0, 'rgba(90, 70, 40, 0)'); gut.addColorStop(0.5, 'rgba(90, 70, 40, 0.16)'); gut.addColorStop(1, 'rgba(90, 70, 40, 0)');
    g.fillStyle = gut; g.fillRect(PW - 90, 0, 180, PH);
    for (const pg of sp.pages) {
      const ox = offsetX(pg);
      g.fillStyle = INK; g.textBaseline = 'alphabetic';
      for (const t of pg.titles) {
        g.font = `${TITLE.size}px ${TITLE.family}`; g.textAlign = 'center';
        g.fillText(t.text, ox + PW / 2, t.y);
      }
      g.textAlign = 'left';
      for (const w of pg.words) {
        if (w.ink === 'write') {
          if (state.written <= 0) continue;
          const k = pg.words.filter(v => v.ink === 'write');
          if (k.indexOf(w) / k.length >= state.written) continue;
          g.font = font(BODY.size, true); g.fillStyle = RED_INK;
        } else {
          g.font = font(BODY.size); g.fillStyle = INK;
        }
        g.fillText(w.text, ox + w.x, w.y);
      }
      for (const it of pg.items) drawIllustration(g, it, ox + it.x, it.y, time);
      // 页码
      g.font = `22px ${BODY.family}`; g.fillStyle = 'rgba(44, 38, 34, 0.55)'; g.textAlign = 'center';
      g.fillText(String(pg.index + 1), ox + PW / 2, PH - 58);
      g.textAlign = 'left';
    }
    sp.dirty = true;
  }

  /** 在"底"上加荧光笔（正在读的词 / 刚被点的词），写进贴图用的 canvas。 */
  function compose(sp) {
    const g = sp.canvas.getContext('2d');
    g.drawImage(sp.base, 0, 0);
    const paint = (mark, color) => {
      if (!mark) return;
      for (const pg of sp.pages) for (const w of pg.words) {
        if (w.passage !== mark.passage || w.start !== mark.start) continue;
        g.save();
        g.globalCompositeOperation = 'multiply';
        g.fillStyle = color;
        g.beginPath();
        g.roundRect(offsetX(pg) + w.x - 5, w.y - BODY.size * 0.86, w.w + 10, BODY.size * 1.18, 8);
        g.fill();
        g.restore();
      }
    };
    paint(state.mark, MARK);
    paint(state.tapMark, TAP_MARK);
    sp.dirty = false;
    return true;
  }

  spreads.forEach(sp => { paintBase(sp); compose(sp); });

  // ---------------------------------------------------------------- 接上书
  function attach(book, caption) {
    const pageW = book.pageW;
    const texOf = sp => book._textures.get(sp.file);
    const current = () => spreads.find(sp => sp.id === book.current().spreadId);
    const upload = sp => { const t = texOf(sp); if (t) t.needsUpdate = true; };
    const refresh = (sp, time) => { paintBase(sp, time); compose(sp); upload(sp); };

    // ---- 声音
    let ctx = null;
    const tone = (f, dur, gain = 0.06, delay = 0, type = 'sine') => {
      try {
        ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
        const t0 = ctx.currentTime + delay, o = ctx.createOscillator(), gn = ctx.createGain();
        o.type = type; o.frequency.setValueAtTime(f, t0);
        gn.gain.setValueAtTime(0.0001, t0); gn.gain.exponentialRampToValueAtTime(gain, t0 + 0.02); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(gn).connect(ctx.destination); o.start(t0); o.stop(t0 + dur + 0.05);
      } catch { /* 没声音也不影响 */ }
    };
    const play = name => {
      if (name === 'chime') [880, 1320].forEach((f, i) => tone(f, 0.6, 0.06, i * 0.12));
      if (name === 'bells') [1568, 1976, 2349, 1976, 2637].forEach((f, i) => tone(f, 0.5, 0.05, i * 0.09));
      if (name === 'snore') { tone(110, 0.9, 0.06, 0, 'triangle'); tone(150, 0.7, 0.05, 1, 'triangle'); }
      if (name === 'pencil') for (let i = 0; i < 6; i++) tone(2400 + Math.random() * 800, 0.05, 0.012, i * 0.11, 'sawtooth');
    };

    // ---- 从词里冒出来的魔法：金色的光点（铃铛）/ 你的羊的小贴纸，在书页上方的 3D 空间里
    const fx = new THREE.Group();
    book.scene.add(fx);
    const wordWorld = (sp, w) => {
      const pg = sp.pages.find(p => p.index === w.page);
      const px = offsetX(pg) + w.x + w.w / 2, py = w.y - BODY.size * 0.3;
      return new THREE.Vector3((px / PW - 1) * pageW, 0.01, py / PH - 0.5);
    };
    const bursts = [];
    function bells(at) {
      play('bells');
      for (let i = 0; i < 16; i++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ color: i % 3 ? 0xffd77a : 0xfff4c8, transparent: true, depthWrite: false }));
        s.scale.setScalar(0.018 + Math.random() * 0.012);
        s.position.copy(at);
        s.userData = { v: new THREE.Vector3((Math.random() - 0.5) * 0.25, 0.35 + Math.random() * 0.3, (Math.random() - 0.5) * 0.15), t: 0 };
        fx.add(s);
        bursts.push(s);
      }
    }
    let sticker = null;
    function sheepSticker(at) {
      const url = loadSheep();
      if (!url) return;
      if (sticker) fx.remove(sticker);
      const t = new THREE.TextureLoader().load(url);
      t.colorSpace = THREE.SRGBColorSpace;
      sticker = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
      sticker.position.copy(at).add(new THREE.Vector3(0, 0.06, 0));
      sticker.userData = { t: 0 };
      sticker.scale.setScalar(0.001);
      fx.add(sticker);
      play('chime');
    }

    // ---- 朗读读到哪个词，纸上就高亮哪个词
    caption.onWord((passage, start) => {
      const sp = current();
      if (!sp) return;
      state.mark = start >= 0 && passage ? { passage: passage.id, start } : null;
      compose(sp); upload(sp);
    });

    // ---- 线索：读到某一段原文时，挂在这段上的魔法发生
    const fired = new Set();
    let firedSpread = null;
    caption.onPassage(passage => {
      const sp = current();
      if (!sp || book.state.phase !== 'idle') return null;
      if (firedSpread !== sp.id) { fired.clear(); firedSpread = sp.id; }
      const para = passage.para;
      if (fired.has(para)) return null;
      fired.add(para);
      const waits = [];
      // 插图上的魔法
      for (const pg of sp.pages) for (const it of pg.items) {
        const st = state.ill.get(it.id);
        if (it.cue === para) {
          if (it.kind === 'appear' && !st.shown) { st.shown = true; play(it.style === 'draw' ? 'pencil' : 'chime'); }
          if (it.kind === 'reveal') st.inviting = true;
          if (it.kind === 'spin') st.inviting = true;
          if (it.kind === 'box') {
            // 读到"你要的羊就在里面"：朗读停下来，请孩子画
            waits.push(drawOverlay(play).then(url => {
              if (url) saveSheep(url);
              return useSheep(st);
            }));
          }
        }
        if (it.sleepCue === para) { st.sleeping = true; play('snore'); }
      }
      // 词上的魔法
      for (const e of data.effects || []) {
        if (e.para !== para) continue;
        if (e.kind === 'ask') waits.push(askOverlay(e, play));
        if (e.kind === 'write') writeOn(sp);
        if (e.kind === 'bells' || e.kind === 'sticker') {
          const w = sp.pages.flatMap(p => p.words).find(v => v.para === para && v.text.toLowerCase().includes(e.word));
          if (w) {
            const at = wordWorld(sp, w);
            // 等朗读差不多读到这个词再发生（按词在段落里的位置估一个延迟）
            const delay = Math.min(6000, w.start * 65);   // 朗读大约每秒 15 个字符
            setTimeout(() => (e.kind === 'bells' ? bells(at) : sheepSticker(at)), delay);
          }
        }
      }
      return waits.length ? Promise.all(waits) : null;
    });

    function useSheep(st) {
      const url = loadSheep();
      if (!url) return null;
      return new Promise(res => {
        const img = new Image();
        img.onload = () => { st.sheep = img; res(); };
        img.onerror = () => res();
        img.src = url;
      });
    }
    // 之前画过的羊：翻到箱子那页时它已经在了
    for (const st of state.ill.values()) if (loadSheep()) useSheep(st);

    function writeOn(sp) {
      const t0 = performance.now();
      play('pencil');
      (function step() {
        state.written = clamp01((performance.now() - t0) / 1800);
        refresh(sp);
        if (state.written < 1) setTimeout(step, 90);
      })();
    }

    // ---- 动画：只重画正在动的插图所在的跨页（最多 20 帧/秒，省电）
    let lastPaint = 0, time = 0, lastT = performance.now();
    (function frame(now) {
      requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now; time += dt;
      // 光点和贴纸
      for (let i = bursts.length - 1; i >= 0; i--) {
        const s = bursts[i], u = s.userData;
        u.t += dt;
        s.position.addScaledVector(u.v, dt * 0.35);
        u.v.y -= dt * 0.12;
        s.material.opacity = Math.max(0, 1 - u.t / 1.6);
        if (u.t > 1.6) { fx.remove(s); bursts.splice(i, 1); }
      }
      if (sticker) {
        sticker.userData.t += dt;
        const k = Math.min(1, sticker.userData.t / 0.5);
        sticker.scale.set(0.12 * k * 1.33, 0.12 * k, 1);
        sticker.material.opacity = sticker.userData.t > 5 ? Math.max(0, 1 - (sticker.userData.t - 5)) : 1;
        if (sticker.userData.t > 6) { fx.remove(sticker); sticker = null; }
      }
      fx.visible = book.state.phase === 'idle';
      const sp = current();
      if (!sp || book.state.phase !== 'idle') return;
      let animating = false;
      for (const pg of sp.pages) for (const it of pg.items) {
        const st = state.ill.get(it.id);
        if (it.kind === 'living') animating = true;
        if (it.kind === 'appear' && st.shown && st.t < 1) { st.t += dt / 1.3; animating = true; }
        if (it.kind === 'reveal' && (st.inviting || (st.revealed ? st.rt < 1 : st.rt > 0))) {
          st.rt = clamp01(st.rt + (st.revealed ? dt : -dt) / 1.1);
          animating = true;
        }
        if (it.kind === 'box' && st.sheep) animating = true;
        if (it.kind === 'spin') {
          if (!st.dragging) { st.angle += (st.vel || 0) * dt; st.vel = (st.vel || 0) * Math.pow(0.12, dt); }
          st.walking = st.dragging || Math.abs(st.vel || 0) > 0.3;
          if (st.inviting || st.walking) animating = true;
        }
      }
      if (animating && now - lastPaint > 50) { lastPaint = now; refresh(sp, time); }
    })(performance.now());

    // ---- 点书页：插图上的机关 / 点一个词就读这个词
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
    function pagePoint(e) {
      const r = book.canvas.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, book.camera);
      if (!ray.ray.intersectPlane(plane, hit)) return null;
      return { x: (hit.x / pageW + 1) * PW, y: (hit.z + 0.5) * PH };
    }
    function itemAt(sp, pt) {
      for (const pg of sp.pages) for (const it of pg.items) {
        const ox = offsetX(pg);
        if (pt.x >= ox + it.x - 14 && pt.x <= ox + it.x + it.w + 14 && pt.y >= it.y - 14 && pt.y <= it.y + it.hpx + 14) return it;
      }
      return null;
    }
    function wordAt(sp, pt) {
      for (const pg of sp.pages) for (const w of pg.words) {
        const ox = offsetX(pg);
        if (pt.x >= ox + w.x - 4 && pt.x <= ox + w.x + w.w + 4 && pt.y >= w.y - BODY.size && pt.y <= w.y + BODY.size * 0.4) return w;
      }
      return null;
    }
    const interactive = it => it && ['reveal', 'spin', 'box'].includes(it.kind);
    let grab = null, tap = null;
    window.addEventListener('pointerdown', e => {
      if (e.target !== book.canvas || book.state.phase !== 'idle') return;
      const sp = current(), pt = sp && pagePoint(e);
      if (!pt) return;
      const it = itemAt(sp, pt);
      if (interactive(it)) {
        e.stopImmediatePropagation();                     // 按在插图上：交给插图，不翻页
        e.preventDefault();
        grab = { it, x: e.clientX, moved: 0, start: state.ill.get(it.id).angle };
        if (it.kind === 'spin') state.ill.get(it.id).dragging = true;
        return;
      }
      tap = { x: e.clientX, y: e.clientY, t: performance.now(), pt, sp };
    }, true);
    window.addEventListener('pointermove', e => {
      if (!grab) return;
      e.stopImmediatePropagation();
      const dx = e.clientX - grab.x;
      grab.moved = Math.max(grab.moved, Math.abs(dx));
      if (grab.it.kind === 'spin') {
        const st = state.ill.get(grab.it.id), next = grab.start - dx / 110;
        st.vel = (next - st.angle) * 30;
        st.angle = next;
        st.moved = true;
      }
    }, true);
    window.addEventListener('pointerup', e => {
      if (grab) {
        e.stopImmediatePropagation();
        const st = state.ill.get(grab.it.id), sp = current();
        if (grab.it.kind === 'spin') st.dragging = false;
        if (grab.moved < 6) {
          if (grab.it.kind === 'reveal') { st.revealed = !st.revealed; st.inviting = false; play('chime'); }
          if (grab.it.kind === 'box' && st.sheep) play(st.sleeping ? 'snore' : 'chime');
          if (grab.it.kind === 'spin') { st.vel = (st.vel || 0) + 4; st.moved = true; }
        }
        if (sp) refresh(sp, time);
        grab = null;
        return;
      }
      if (!tap) return;
      const quick = performance.now() - tap.t < 450 && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 8;
      const { pt, sp } = tap;
      tap = null;
      if (!quick || book.state.phase !== 'idle') return;
      const w = wordAt(sp, pt);
      if (!w) return;
      // 点一个词：读这个词，并用蓝色的笔划一下
      caption.sayWord(w.text.replace(/[^\p{L}\p{N}'’-]/gu, ''));
      state.tapMark = { passage: w.passage, start: w.start };
      compose(sp); upload(sp);
      setTimeout(() => { state.tapMark = null; compose(sp); upload(sp); }, 900);
    }, true);
  }

  return { attach };
}
