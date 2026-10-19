// app.js — reading UI, navigation, bookmarks and failure surface around the paper book.
import { PopupBook } from './book3d.js';
import { PaperAudio } from './audio.js';
import { configureStore, loadBookmark, saveBookmark } from './store.js';
import { markFinished, loadProfile, setLang } from './profile.js';
import { SPOTS, loadSpot, saveSpot, loadSpotImage, createAmbience, getAnimatedSpot } from './spots.js';
import * as THREE from '../vendor/three.module.min.js';
import { createCaption } from './caption.js';
import { EffectComposer } from '../vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/addons/postprocessing/OutputPass.js';
import { BokehPass } from '../vendor/addons/postprocessing/BokehPass.js';
import { RoomEnvironment } from '../vendor/addons/environments/RoomEnvironment.js';
import { buildSet } from './sets.js';
import { createMechanics } from './mechanics.js';
import { prepareIllustratedBook } from './pagebook.js';

// 从图书馆进来时，URL 带着 ?book=<id>；读到最后一页就在图书馆里记为"读过"
const libraryBookId = new URLSearchParams(location.search).get('book');

const $ = sel => document.querySelector(sel);
const audio = new PaperAudio();

const dom = {
  canvas: $('#view'),
  gate: $('#gate'),
  gateBtn: $('#gate-open'),
  gateNote: $('#gate-note'),
  gateTitle: $('#gate-title'),
  chapter: $('#hud-chapter'),
  spread: $('#hud-spread'),
  counter: $('#hud-counter'),
  passages: $('#passages'),
  readerTitle: $('#reader-spread'),
  prev: $('#nav-prev'),
  next: $('#nav-next'),
  dots: $('#nav-dots'),
  index: $('#index'),
  indexList: $('#index-list'),
  indexBtn: $('#btn-index'),
  indexClose: $('#index-close'),
  sound: $('#btn-sound'),
  reset: $('#btn-reset'),
  banner: $('#banner')
};

let book = null;
let data = null;
let turning = false;
let pending = null;
let bookmark = null;

function fail(message) {
  dom.banner.textContent = message;
  dom.banner.hidden = false;
}

function chapterOf(spread) {
  const c = data.chapters.find(ch => ch.id === spread.chapterId);
  return c ? c.title : '';
}

function renderReader(state) {
  const chapterIndex = data.chapters.findIndex(c => c.id === state.chapterId);
  const chapterSpreads = data.spreads.filter(s => s.chapterId === state.chapterId);
  const chapterLabel = `第${['一','二','三','四','五','六','七','八'][chapterIndex] || chapterIndex + 1}章`;
  dom.chapter.textContent = `${chapterLabel} · ${state.chapterTitle}`;
  dom.spread.textContent = state.title;
  dom.counter.textContent = `${state.index + 1} / ${state.count}`;
  dom.readerTitle.textContent = state.title;
  dom.passages.replaceChildren(...state.passages.map(p => {
    const li = document.createElement('li');
    li.className = 'passage';
    const who = document.createElement('span');
    who.className = 'speaker';
    who.textContent = p.speaker;
    const body = document.createElement('p');
    body.textContent = p.text;
    li.append(who, body);
    return li;
  }));
  [...dom.dots.children].forEach((dot, i) => dot.classList.toggle('on', data.chapters[i].id === state.chapterId));
  dom.readerTitle.title = `${chapterLabel} · ${chapterSpreads.findIndex(s => s.id === state.spreadId) + 1} / ${chapterSpreads.length}`;
  dom.prev.disabled = state.index === 0 || turning;
  dom.next.disabled = state.index === state.count - 1 || turning;
  // 英文朗读时，左上角的章节名和页标题也换成英文
  if (readLang === 'en') {
    const spread = data.spreads.find(sp => sp.id === state.spreadId);
    const chapter = data.chapters.find(c => c.id === state.chapterId);
    dom.chapter.textContent = `Chapter ${chapterIndex + 1} · ${chapter?.titleEn || state.chapterTitle}`;
    dom.spread.textContent = spread?.titleEn || state.title;
  }
  // 灰盒样书：左上角显示这一页的设计要点（景别 · 视角 · 形状 · 光），翻的时候对照脚本检查
  if (data.greybox) {
    const spread = data.spreads.find(sp => sp.id === state.spreadId);
    if (spread?.greyboxNote) dom.chapter.textContent = `灰盒 · ${spread.greyboxNote}`;
  }
  applySpreadCamera(state.spreadId);
}

// ---------------------------------------------------------------- 每页默认镜头
// book.json 里跨页可以写 camera: { pitch, zoom }。翻到这一页时镜头平滑转过去（0.9 秒）；
// 孩子仍然可以用刻度盘 / 拖动手动调，翻到下一页再回到那一页的预设。
let cameraTween = 0, cameraSpreadId = null;
function applySpreadCamera(spreadId) {
  if (!book || spreadId === cameraSpreadId) return;
  cameraSpreadId = spreadId;
  const preset = data.spreads.find(sp => sp.id === spreadId)?.camera;
  if (!preset) return;
  tweenCamera(preset);
}

/** 镜头平滑转到 { pitch, zoom }（0.9 秒，慢进慢出）。 */
function tweenCamera(preset) {
  const from = { pitch: book.drag.pitch, zoom: book.drag.zoom };
  const to = { pitch: preset.pitch ?? from.pitch, zoom: preset.zoom ?? from.zoom };
  const start = performance.now(), my = ++cameraTween;
  const ease = t => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;      // 慢进慢出，避免晕
  (function step() {
    if (my !== cameraTween) return;
    const t = Math.min(1, (performance.now() - start) / 900);
    book.drag.pitch = from.pitch + (to.pitch - from.pitch) * ease(t);
    book.drag.zoom = from.zoom + (to.zoom - from.zoom) * ease(t);
    if (t < 1) requestAnimationFrame(step);
  })();
}

function persist() {
  saveBookmark({ spreadId: book.current().spreadId, spreadOrder: data.spreadOrder, muted: !audio.enabled });
}

// ---------------------------------------------------------------- 字幕条
// 朗读语言：和书房共用同一个语言设置（profile.lang），字幕条上的 EN / 中 可以切换
let readLang = loadProfile().lang === 'en' ? 'en' : 'zh';
/** 这一页的句子，换成当前语言的文字和说话人。 */
const localized = passages => (passages || []).map(p => readLang === 'en'
  ? { ...p, text: p.textEn || p.text, speaker: p.speakerEn || p.speaker }
  : p);

const caption = createCaption({
  root: document.getElementById('caption'),
  lang: readLang,
  onLang: next => {
    readLang = next;
    setLang(next);
    caption.setLang(next);
    caption.setPassages(localized(book.current().passages), reading);
    renderReader(book.current());
  },
  onNeedNext: () => {
    // 这一页读完：下一页箭头跳两下提示（不自动翻页）
    const next = document.getElementById('nav-next');
    if (next.disabled) return;
    next.classList.remove('nudge'); void next.offsetWidth; next.classList.add('nudge');
  }
});
caption.onFull(() => {
  document.body.classList.toggle('reader-collapsed');
  window.dispatchEvent(new Event('resize'));  // 画面尺寸变了，让 3D 和背景重新适配
});

// ---------------------------------------------------------------- 渲染升级：阴影 / 环境光照 / 色调映射 / 辉光
// 置景的"光"：纸片在书页上投下柔和的影子（立起来最强的视觉线索），
// 纸和书皮有细微的真实反光，亮的东西（月亮、灯）自然晕开一圈光。
const RENDER = {
  exposure: 0.82,
  environment: 0.18,        // 环境光照强度：太高会发灰，太低没有质感
  bloom: { strength: 0.35, radius: 0.6, threshold: 0.86 },   // 只让最亮的东西发光
  shadowMap: 2048,
  cameraPitch: 1.08,         // 默认镜头更低一点（原来 0.98）：更接近平视，纵深更强
  dof: { aperture: 0.0045, maxblur: 0.009 }   // 景深：光圈越大，远处越虚
};
let composer = null, bokeh = null;

function upgradeRendering() {
  const r = book.renderer, scene = book.scene;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = RENDER.exposure;

  // 1. 柔和阴影：主光源投影；带透明镂空的纸片（alphaTest）投影，受光的纸面接收阴影
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  const key = book.keyLight;
  key.castShadow = true;
  key.shadow.mapSize.set(RENDER.shadowMap, RENDER.shadowMap);
  Object.assign(key.shadow.camera, { left: -1.4, right: 1.4, top: 1.4, bottom: -1.4, near: 0.5, far: 10 });
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.02;
  scene.traverse(o => {
    if (!o.isMesh || !o.material) return;
    const m = o.material;
    if (m.alphaTest > 0) o.castShadow = true;                     // 立起来的纸片
    if (m.isMeshStandardMaterial) o.receiveShadow = true;         // 书页、书芯、纸片本身
    m.needsUpdate = true;
  });

  // 2. 环境光照：用一个"虚拟房间"给材质提供柔和的反光
  const pmrem = new THREE.PMREMGenerator(r);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = RENDER.environment;

  // 3. 后期处理：正常渲染 → 辉光 → 输出（色调映射和色彩空间在最后一步做）
  const w = dom.canvas.clientWidth, h = dom.canvas.clientHeight;
  composer = new EffectComposer(r);
  composer.addPass(new RenderPass(scene, book.camera));
  // 景深：对焦在书上，远处的海、月面、星空柔和地虚掉——像用相机近拍一本书（"精致感"最大的来源）
  bokeh = new BokehPass(scene, book.camera, { focus: 3, aperture: RENDER.dof.aperture, maxblur: RENDER.dof.maxblur });
  composer.addPass(bokeh);
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), RENDER.bloom.strength, RENDER.bloom.radius, RENDER.bloom.threshold));
  composer.addPass(new OutputPass());
  composer.setSize(w, h);
  book.composer = composer;

  // 4. 镜头默认更低一点
  book.drag.pitch = RENDER.cameraPitch;
}

// ---------------------------------------------------------------- 自适应布局：书和文字按屏幕比例排
// 屏幕分三层：上 = 漂浮文字，中 = 书，下 = 底栏。
//
// 1) 文字大小（fitTextSize）：跟着"舞台宽度"走 —— 舞台宽 = min(屏宽, 屏高 × 1.5)，
//    横屏时被高度限制、竖屏时被宽度限制，和书实际能占到的宽度基本成正比，所以字和书始终是一个比例。
// 2) 书（fitBookAboveCaption）：像照片"适应边框"（contain）一样放进文字和底栏之间的矩形里。
//    做法：把镜头的完整视野（frustum）精确映射到这个矩形 ——
//      camera.aspect = 矩形宽高比；setViewOffset 把矩形放到画布上的对应位置。
//    book3d 的 _frameCamera 本来就是"按 aspect 算出能完整装下书的距离"，所以书自动填满矩形，
//    矩形外面（背景、桌子）照常渲染，不会被裁掉。
const LAYOUT = {
  stageRatio: 1.5,        // 舞台宽 ≤ 屏高 × 1.5
  textScale: 0.028,       // 字号 = 舞台宽 × 2.8%
  textMin: 20, textMax: 40,
  bookAspect: 1.26,       // 打开的书（含立起来的纸片）大约的宽高比；比这更"瘦"的矩形就收紧高度
  gap: 10,                // 书和文字 / 底栏之间留的空
  fill: 0.94              // 书占可用矩形的比例（留 6% 呼吸空间）
};

function fitTextSize() {
  const W = window.innerWidth, H = window.innerHeight;
  const stage = Math.min(W, H * LAYOUT.stageRatio);
  const size = Math.round(Math.min(LAYOUT.textMax, Math.max(LAYOUT.textMin, stage * LAYOUT.textScale)));
  const root = document.documentElement.style;
  root.setProperty('--caption-size', `${size}px`);
  root.setProperty('--caption-width', `${Math.round(Math.min(W - 40, stage * 0.78))}px`);   // 一行不超过书的宽度
}

function fitBookAboveCaption() {
  if (!book || !book.camera) return;
  const cam = book.camera, canvas = dom.canvas;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  if (!W || !H) return;
  const capEl = document.getElementById('caption');
  const dockEl = document.querySelector('.dock');
  const canvasTop = canvas.getBoundingClientRect().top;
  // 可用矩形：文字下沿 → 底栏上沿，左右各留 16px
  const top = capEl.childElementCount ? Math.max(0, capEl.getBoundingClientRect().bottom - canvasTop + LAYOUT.gap) : 0;
  const bottom = dockEl ? Math.min(H, dockEl.getBoundingClientRect().top - canvasTop - LAYOUT.gap) : H;
  const left = 16, width = Math.max(100, W - 32);
  let height = Math.max(100, bottom - top), y = top;
  // 竖屏：矩形又高又窄，书按宽度装满后上下会空一大截 → 把矩形收到书需要的高度，
  // 放在偏上的位置（上下空白 15:85），书就贴近文字，不会"字在天上、书在地下"
  const need = width / LAYOUT.bookAspect;
  if (height > need * 1.08) { y = top + (height - need) * 0.15; height = need; }

  // 量一下书在这个视野里实际占多大：book3d 的取景留了很宽的余量（要照顾各种角度），
  // 默认斜看时书只占矩形的一半左右。用书的"包围盒"（页面 + 最高的立体纸片）投影到屏幕，
  // 算出还能放大几倍（fill），再把书的中心对准矩形中心。
  // 用 zoom = 1 来量：孩子自己捏合缩放的倍数照样叠加在上面，不会被这里抵消。
  cam.clearViewOffset();
  cam.aspect = width / height;
  cam.updateProjectionMatrix();
  const savedZoom = book.drag.zoom;
  book.drag.zoom = 1;
  book._frameCamera();
  cam.updateMatrixWorld();
  const focus = book.drag.focus === undefined ? 1 : book.drag.focus;   // 合上的书只有右半边
  const xs = [-BOOK_BOUNDS.halfW * focus, BOOK_BOUNDS.halfW], ys = [0, data?.format === 'illustrated' ? 0.02 : BOOK_BOUNDS.popH], zs = [-BOOK_BOUNDS.halfD, BOOK_BOUNDS.halfD];
  let minX = 1, maxX = -1, minY = 1, maxY = -1;
  const v = new THREE.Vector3();
  for (const bx of xs) for (const by of ys) for (const bz of zs) {
    v.set(bx, by, bz).project(cam);
    minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
    minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
  }
  book.drag.zoom = savedZoom;
  book._frameCamera();
  const fill = Math.min(1.9, Math.max(0.7, LAYOUT.fill * Math.min(2 / (maxX - minX), 2 / (maxY - minY))));
  // 书的包围盒中心，在"矩形像素坐标"里的位置
  const px = ((minX + maxX) / 2 + 1) / 2 * width, py = (1 - (minY + maxY) / 2) / 2 * height;
  // 完整视野放大 fill 倍 = (width·fill)×(height·fill) 的大画面；从中截取画布大小 W×H 的一块，
  // 截取位置让书的中心正好落在矩形中心（left + width/2, y + height/2）
  cam.setViewOffset(width * fill, height * fill, px * fill - (left + width / 2), py * fill - (y + height / 2), W, H);
  cam.updateProjectionMatrix();
}
// 书的包围盒（书的本地坐标）：半宽含封面边、半深、立体纸片最高大约多高
const BOOK_BOUNDS = { halfW: 0.93, halfD: 0.53, popH: 0.45 };

function step(dir) {
  caption.stop();
  if (!book || turning) return;
  const ok = book.turn(dir);
  if (ok) { audio.turn(); turning = true; }
}

// ---------------------------------------------------------------- 拖着书页翻
// 在右页外侧按住往左拖 = 往后翻；左页外侧往右拖 = 往回翻。书页跟着手指走（拖多远翻多远）。
// 松手：翻过 30% 或甩得够快 → 翻过去；否则书页轻轻落回原位。只点一下（没拖）= 直接翻页。
// 书以外的地方拖动，仍然是旋转视角。
const PAGE_DRAG = { zone: 0.35, commit: 0.3, flick: 1.2, startPx: 8 };

function bindPageDrag() {
  const canvas = dom.canvas;
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let drag = null;

  /** 手指按在哪一页的外侧：1 = 右页（往后翻），-1 = 左页（往回翻），0 = 不在可翻的区域。 */
  const pageSide = e => {
    if (!book || book.state.phase !== 'idle') return 0;
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, book.camera);
    const hit = ray.intersectObjects([book.rightSurface, book.leftSurface], false)[0];
    if (!hit) return 0;
    if (hit.point.x > book.pageW * PAGE_DRAG.zone) return 1;
    if (hit.point.x < -book.pageW * PAGE_DRAG.zone) return -1;
    return 0;
  };
  /** 一整本书（两页）在屏幕上有多宽：用来把"拖了多少像素"换算成"翻了多少"。 */
  const bookWidthPx = () => {
    const a = new THREE.Vector3(-book.pageW, 0, 0).project(book.camera);
    const b = new THREE.Vector3(book.pageW, 0, 0).project(book.camera);
    return Math.max(120, Math.abs(b.x - a.x) / 2 * canvas.clientWidth);
  };
  /** 拖动进度（0~1）→ 翻页动画里的时间点（动画开头有一小段延迟要跳过）。 */
  const seek = u => {
    const { delay, duration } = book.turnTiming;
    book.seekTurn((delay + u * duration) / (delay + duration));
  };
  const startTurn = dir => {
    if (turning) return false;
    caption.stop();
    if (!book.turn(dir)) return false;
    audio.turn();
    turning = true;
    book.timeScale = 0;                        // 冻住自动播放：进度完全由手指决定
    return true;
  };

  // 用捕获阶段抢在"旋转视角"之前处理：按在书页外侧时，这次拖动就是翻页
  canvas.addEventListener('pointerdown', e => {
    if (!reading || turning) return;
    const dir = pageSide(e);
    if (!dir) return;
    e.stopImmediatePropagation();
    try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    drag = { dir, startX: e.clientX, width: bookWidthPx(), u: 0, started: false, lastX: e.clientX, lastT: performance.now(), v: 0 };
    canvas.style.cursor = 'grabbing';
  }, { capture: true });

  canvas.addEventListener('pointermove', e => {
    if (!drag) {                                 // 没在拖：鼠标移到书页外侧时，光标变成"抓手"
      if (reading && !turning) canvas.style.cursor = pageSide(e) ? 'grab' : '';
      return;
    }
    const moved = (drag.startX - e.clientX) * drag.dir;   // 朝翻页方向移动了多少像素
    if (!drag.started) {
      if (moved < PAGE_DRAG.startPx) return;
      if (!startTurn(drag.dir)) { drag = null; canvas.style.cursor = ''; return; }
      drag.started = true;
    }
    drag.u = Math.min(1, Math.max(0, moved / (drag.width * 1.1)));
    seek(drag.u);
    // 速度（每秒翻过多少）：用来判断"甩一下"
    const now = performance.now(), dt = (now - drag.lastT) / 1000;
    if (dt > 0.01) {
      drag.v = ((drag.lastX - e.clientX) * drag.dir) / (drag.width * 1.1) / dt;
      drag.lastX = e.clientX; drag.lastT = now;
    }
  });

  const release = () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    canvas.style.cursor = '';
    // 只点了一下：直接翻页。插图书例外——纸上全是字，点一下是"读这个词"，翻页要拖或用箭头
    if (!d.started) { if (data.format !== 'illustrated') step(d.dir); return; }
    if (d.u > PAGE_DRAG.commit || d.v > PAGE_DRAG.flick) {
      // 翻过去：从当前进度接着播完，稍微快一点
      book.timeScale = 1.5;
      setTimeout(() => { book.timeScale = 1; }, (1 - d.u) * book.turnTiming.duration / 1.5 + 400);
      return;
    }
    // 没翻够：书页轻轻落回去，然后取消这次翻页
    const from = d.u, t0 = performance.now(), dur = 260;
    const back = now => {
      const k = Math.min((now - t0) / dur, 1);
      seek(from * (1 - k * (2 - k)));
      if (k < 1) { requestAnimationFrame(back); return; }
      book.cancelTurn();
      book.timeScale = 1;
      turning = false;
      renderReader(book.current());
      caption.setPassages(localized(book.current().passages), reading);
    };
    requestAnimationFrame(back);
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
}

function buildIndex() {
  const entries = book.spreads.map((spread, i) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'index-item';
    const thumb = document.createElement('span');
    thumb.className = 'index-thumb';
    thumb.style.backgroundImage = `url("${spread.thumbnail || assetFile(spread.focalSubject)}")`;
    const meta = document.createElement('span');
    meta.className = 'index-meta';
    const t = document.createElement('strong');
    t.textContent = spread.title;
    const s = document.createElement('em');
    s.textContent = `${chapterOf(spread)} · ${i + 1} / ${book.spreads.length}`;
    meta.append(t, s);
    item.append(thumb, meta);
    item.addEventListener('click', () => {
      if (!book.goTo(spread.id) && book.current().spreadId !== spread.id) return;
      audio.blip();
      persist();
      renderReader(book.current());
      closeIndex();
    });
    return item;
  });
  const sections = data.chapters.flatMap((chapter, index) => {
    const heading = document.createElement('h2');
    heading.className = 'index-chapter';
    heading.textContent = `第${'一二三四五六七八九十'[index] || index + 1}章 · ${chapter.title}`;
    return [heading, ...entries.filter((_, i) => book.spreads[i].chapterId === chapter.id)];
  });
  dom.indexList.replaceChildren(...sections);
}

function assetFile(assetId) {
  const a = data.assets.find(x => x.id === assetId);
  return a ? a.file : '';
}

function openIndex() { dom.index.hidden = false; dom.indexBtn.setAttribute('aria-expanded', 'true'); }
function closeIndex() { dom.index.hidden = true; dom.indexBtn.setAttribute('aria-expanded', 'false'); }

function buildDots() {
  dom.dots.replaceChildren(...data.chapters.map(chapter => {
    const d = document.createElement('span');
    d.className = 'dot';
    d.title = chapter.title;
    return d;
  }));
}

function bind() {
  dom.prev.addEventListener('click', () => step(-1));
  dom.next.addEventListener('click', () => step(1));
  dom.indexBtn.addEventListener('click', () => (dom.index.hidden ? openIndex() : closeIndex()));
  dom.indexClose.addEventListener('click', closeIndex);
  dom.sound.addEventListener('click', () => {
    audio.unlock();
    audio.enabled = !audio.enabled;
    dom.sound.textContent = audio.enabled ? '纸声 开' : '纸声 关';
  dom.sound.dataset.icon = audio.enabled ? 'sound' : 'mute';
    dom.sound.dataset.icon = audio.enabled ? 'sound' : 'mute';
    dom.sound.setAttribute('aria-pressed', String(audio.enabled));
    if (audio.enabled) audio.blip();
    persist();
  });
  dom.reset.addEventListener('click', () => {
    book.goTo(data.spreadOrder[0]);
    renderReader(book.current());
    audio.blip();
    persist();
    closeIndex();
  });
  window.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { step(1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { step(-1); e.preventDefault(); }
    else if (e.key === 'Escape') closeIndex();
  });
  window.addEventListener('error', () => fail('这一页出了点问题，刷新后可以继续阅读。'));
  window.addEventListener('resize', () => book && book.resize());
}

// ---------------------------------------------------------------- 阅读地点：背景图 + 环境音
const ambience = createAmbience();
let spotId = loadSpot();
let reading = false;                         // 翻开书之后才出声（浏览器要求先有用户操作）
let spotTexture = null;
// 立体书页目前是中文界面（书的内容以后会重写），地点菜单跟随页面语言，避免中英混排
const uiLang = document.documentElement.lang.startsWith('zh') ? 'zh' : 'en';

/** 背景图按"铺满裁切"贴到 3D 场景背景上（和 CSS 的 background-size: cover 一样）。 */
function fitSpotBackground() {
  if (!spotTexture || !book) return;
  const img = spotTexture.image;
  const view = dom.canvas.clientWidth / Math.max(1, dom.canvas.clientHeight);
  const pic = img.width / img.height;
  spotTexture.repeat.set(1, 1);
  spotTexture.offset.set(0, 0);
  if (view < pic) { spotTexture.repeat.x = view / pic; spotTexture.offset.x = (1 - spotTexture.repeat.x) / 2; }
  else { spotTexture.repeat.y = pic / view; spotTexture.offset.y = 0; }   // 太高时保留画面下方（桌面 / 毯子）
}

// ---------------------------------------------------------------- 3D 置景（有 set 的地点：书真的放在一个空间里）
// 每个置景（js/environment.js 的书桌、js/sets.js 的海边 / 月亮 / 外太空）自带一份"光照配方" look：
// 环境光和主光调到多少、主光什么颜色、雾、背景色、阴影要覆盖多大范围。
const sets = new Map();
let activeSet = null, lightsSaved = null;

function useSet(id) {
  const scene = book.scene;
  if (!lightsSaved) {
    const hemi = scene.children.find(o => o.isHemisphereLight);
    lightsSaved = { hemi, hemiI: hemi ? hemi.intensity : 0, keyI: book.keyLight.intensity, keyColor: book.keyLight.color.clone(), cam: { ...book.keyLight.shadow.camera } };
  }
  if (id && !sets.has(id)) { const s = buildSet(id); if (s) { sets.set(id, s); scene.add(s.group); } }
  activeSet = id ? sets.get(id) || null : null;
  for (const [key, s] of sets) s.group.visible = s === activeSet;
  const look = activeSet?.look;
  if (lightsSaved.hemi) lightsSaved.hemi.intensity = lightsSaved.hemiI * (look ? look.hemi : 1);
  book.keyLight.intensity = lightsSaved.keyI * (look ? look.key : 1);
  book.keyLight.color.copy(look?.keyColor ? new THREE.Color(look.keyColor) : lightsSaved.keyColor);
  scene.fog = look?.fog ? new THREE.Fog(...look.fog) : null;
  // 阴影范围：道具离书远的场景（海边）要把主光的阴影罩大一点
  const ext = look?.shadowExtent || 1.4, cam = book.keyLight.shadow.camera;
  Object.assign(cam, { left: -ext, right: ext, top: ext, bottom: -ext });
  cam.updateProjectionMatrix();
}

(function tickSet() {
  requestAnimationFrame(tickSet);
  if (activeSet) activeSet.update(performance.now() / 1000);
  // 景深对焦：镜头到书中心的距离（孩子缩放、转动时一直跟着）
  if (bokeh && book) bokeh.uniforms.focus.value = book.camera.position.length();
})();

async function applySpot(id) {
  spotId = id;
  saveSpot(id);
  const spot = SPOTS.find(s => s.id === id) || SPOTS[0];
  if (spot.set) {
    // 3D 置景：不用平面背景图，背景用暖暗色（被墙和雾挡住）
    if (spotTexture) { spotTexture.dispose(); spotTexture = null; }
    useSet(spot.set);
    book.scene.background = new THREE.Color(activeSet?.look?.background || '#2b2019');
    // 地点的默认镜头：只在书的这一页没有自己设计镜头时生效（书的设计优先）
    const pagePreset = book && data.spreads.find(sp => sp.id === book.current().spreadId)?.camera;
    if (book && !pagePreset) tweenCamera({ pitch: activeSet?.look?.cameraPitch ?? RENDER.cameraPitch });
    document.body.dataset.spot = id;
    cancelAnimationFrame(spotAnim);
    if (reading) ambience.play(id);
    return;
  }
  useSet(null);
  const img = await loadSpotImage(spot);
  if (spotTexture) spotTexture.dispose();
  spotTexture = img ? new THREE.Texture(img) : null;
  if (spotTexture) { spotTexture.colorSpace = THREE.SRGBColorSpace; spotTexture.needsUpdate = true; }
  book.scene.background = spotTexture;      // null = 回到原来的米色
  document.body.dataset.spot = id;          // 深色场景（月亮）里，左上角的章节标题换成浅色字
  fitSpotBackground();
  animateSpot(spot);
  if (reading) ambience.play(id);
}

/** 动态地点（月亮上）：大约每秒 20 帧重画背景，星星闪烁、流星划过。 */
let spotAnim = 0;
function animateSpot(spot) {
  cancelAnimationFrame(spotAnim);
  const scene = spot.animated ? getAnimatedSpot(spot.id) : null;
  if (!scene || !spotTexture) return;
  let last = 0;
  const tick = now => {
    spotAnim = requestAnimationFrame(tick);
    if (now - last < 50) return;
    last = now;
    scene.frame(now / 1000);
    spotTexture.needsUpdate = true;
  };
  spotAnim = requestAnimationFrame(tick);
}

async function renderSpotMenu() {
  const title = document.getElementById('spot-menu-title');
  title.textContent = uiLang === 'en' ? 'Where do you want to read?' : '在哪里读？';
  const options = await Promise.all(SPOTS.map(async spot => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'spot-option' + (spot.id === spotId ? ' current' : '');
    const thumb = document.createElement('span');
    thumb.className = 'spot-thumb';
    const img = await loadSpotImage(spot);
    if (img) thumb.style.backgroundImage = `url("${img.toDataURL ? img.toDataURL('image/jpeg', 0.6) : img.src}")`;
    const label = document.createElement('span');
    label.textContent = `${spot.icon} ${spot.label[uiLang]}`;
    btn.append(thumb, label);
    btn.addEventListener('click', () => { toggleSpotMenu(false); applySpot(spot.id); });
    return btn;
  }));
  document.getElementById('spot-options').replaceChildren(...options);
}

function toggleSpotMenu(open) {
  const menu = document.getElementById('spot-menu');
  const show = open ?? menu.hidden;
  if (show) renderSpotMenu();
  menu.hidden = !show;
  document.getElementById('btn-spot').setAttribute('aria-expanded', String(show));
}

// ---------------------------------------------------------------- 缩放：按钮 / 双指捏合 / 触控板 / 键盘
// book3d.js 自带鼠标滚轮缩放（book.drag.zoom，数值越小越近）；这里补上其它几种方式，范围和它一致。
const ZOOM_MIN = 0.48, ZOOM_MAX = 1.9;
function setZoom(z) { if (book) book.drag.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z)); }

function bindZoom() {
  document.getElementById('btn-zoom-in').addEventListener('click', () => setZoom(book.drag.zoom * 0.85));
  document.getElementById('btn-zoom-out').addEventListener('click', () => setZoom(book.drag.zoom / 0.85));
  window.addEventListener('keydown', e => {
    if (e.key === '+' || e.key === '=') setZoom(book.drag.zoom * 0.9);
    if (e.key === '-' || e.key === '_') setZoom(book.drag.zoom / 0.9);
  });
  // 双指捏合（触屏）：两指张开 → 拉近
  const fingers = new Map();
  let pinch = null;
  const spread = () => { const [a, b] = [...fingers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  dom.canvas.addEventListener('pointerdown', e => {
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (fingers.size === 2) pinch = { d0: spread(), z0: book.drag.zoom };
  });
  dom.canvas.addEventListener('pointermove', e => {
    if (!fingers.has(e.pointerId)) return;
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && fingers.size >= 2) {
      book.drag.active = false;              // 捏合时不要同时转书
      setZoom(pinch.z0 * pinch.d0 / Math.max(20, spread()));
    }
  });
  const lift = e => { fingers.delete(e.pointerId); if (fingers.size < 2) pinch = null; };
  window.addEventListener('pointerup', lift);
  window.addEventListener('pointercancel', lift);
  // Safari 的触控板捏合走 gesture 事件
  let gestureZoom = 1;
  dom.canvas.addEventListener('gesturestart', e => { e.preventDefault(); gestureZoom = book.drag.zoom; });
  dom.canvas.addEventListener('gesturechange', e => { e.preventDefault(); setZoom(gestureZoom / e.scale); });
}

// ---------------------------------------------------------------- 书的角度刻度盘（像阅读架的角度调节器）
// 指针角度 = 书"立起来"的程度：90° 竖直 = 镜头在书正上方、页面正对你（读字最正）；越往下放倒越是斜看的立体效果。
// 换算：book.drag.pitch（镜头偏离正上方的角度）= 90° − 指针角度。
// 手感：每转 5° 一声轻"咔哒"；靠近两个常用角度会吸附并"咔"一声；点两端标签会平滑转过去；拖书时指针同步。
const DIAL = { min: 8, max: 88, presets: [{ deg: 88, icon: '📖', label: '读字' }, { deg: 28, icon: '✨', label: '立体' }], snap: 3 };
const R = 118, PIVOT = { x: 16, y: 134 };                         // 刻度盘半径、圆心（SVG 坐标，左下角）
const SVGNS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs, parent) => { const n = document.createElementNS(SVGNS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); parent && parent.append(n); return n; };
const polar = (deg, r) => ({ x: PIVOT.x + Math.cos(deg * Math.PI / 180) * r, y: PIVOT.y - Math.sin(deg * Math.PI / 180) * r });

let dialDeg = 34, dialDragging = false, lastTickDeg = null, dialTween = 0, needleGroup = null;
const pitchToDeg = pitch => 90 - pitch * 180 / Math.PI;
const degToPitch = deg => (90 - deg) * Math.PI / 180;

/** 很轻的机械"咔哒"（strong = 吸附到常用角度时稍重的一声）。 */
let clickCtx = null;
function dialClick(strong) {
  if (!audio.enabled) return;
  try {
    clickCtx = clickCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t = clickCtx.currentTime;
    const osc = clickCtx.createOscillator(), g = clickCtx.createGain();
    osc.type = 'square'; osc.frequency.value = strong ? 900 : 1900;
    g.gain.setValueAtTime(strong ? 0.05 : 0.02, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (strong ? 0.05 : 0.02));
    osc.connect(g).connect(clickCtx.destination);
    osc.start(t); osc.stop(t + 0.06);
  } catch { /* 没声音也不影响 */ }
}

function buildDial() {
  const host = document.getElementById('tilt-dial');
  const svg = el('svg', { viewBox: '0 0 150 150' }, host);
  // 表盘：深色底 + 黄铜外圈
  el('path', { d: `M${PIVOT.x},${PIVOT.y} L${PIVOT.x + R + 12},${PIVOT.y} A${R + 12},${R + 12} 0 0 0 ${PIVOT.x},${PIVOT.y - R - 12} Z`, fill: 'rgba(46,30,20,0.86)', stroke: '#c8964a', 'stroke-width': 2.5 }, svg);
  // 刻度：每 5° 一短线，每 30° 一长线
  for (let d = 0; d <= 90; d += 5) {
    const long = d % 30 === 0, a = polar(d, R + 6), b = polar(d, R + 6 - (long ? 14 : 7));
    el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: '#e9cf86', 'stroke-width': long ? 2 : 1, opacity: long ? 0.9 : 0.55 }, svg);
  }
  // 两个常用角度的标签（点一下平滑转过去）
  for (const p of DIAL.presets) {
    const at = polar(p.deg, R - 30);
    const g = el('g', { class: 'preset', transform: `translate(${at.x},${at.y})` }, svg);
    el('circle', { r: 15, fill: 'rgba(233,207,134,0.16)', stroke: '#e9cf86', 'stroke-width': 1 }, g);
    const text = el('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 14 }, g);
    text.textContent = p.icon;
    const label = el('text', { y: 25, 'text-anchor': 'middle', 'font-size': 10, fill: '#f3e6c8' }, g);
    label.textContent = p.label;
    g.addEventListener('pointerdown', e => { e.stopPropagation(); animateDial(p.deg); });
  }
  // 指针：一根黄铜杆 + 末端一本小书（像书架上的书，跟着立起、放倒）
  needleGroup = el('g', { class: 'needle' }, svg);
  el('line', { x1: 0, y1: 0, x2: R - 8, y2: 0, stroke: '#d9b25f', 'stroke-width': 4, 'stroke-linecap': 'round' }, needleGroup);
  const miniBook = el('g', { transform: `translate(${R - 20},0)` }, needleGroup);
  el('rect', { x: -2, y: -20, width: 12, height: 26, rx: 2, fill: '#3a4f8c', stroke: '#e9cf86', 'stroke-width': 1.5 }, miniBook);
  el('rect', { x: 10, y: -20, width: 3, height: 26, fill: '#f1e2c0' }, miniBook);
  el('circle', { cx: 0, cy: 0, r: 8, fill: '#c8964a', stroke: '#6b4a1e', 'stroke-width': 1.5 }, needleGroup);   // 转轴
  // 拖动：算手指相对圆心的角度
  const toDeg = e => {
    const rect = svg.getBoundingClientRect(), k = 150 / rect.width;
    const x = (e.clientX - rect.left) * k - PIVOT.x, y = PIVOT.y - (e.clientY - rect.top) * k;
    return Math.atan2(y, x) * 180 / Math.PI;
  };
  host.addEventListener('pointerdown', e => {
    if (e.target.closest('.preset')) return;
    dialDragging = true; host.classList.add('dragging');
    cancelAnimationFrame(dialTween);
    host.setPointerCapture(e.pointerId);
    setDial(toDeg(e), true);
  });
  host.addEventListener('pointermove', e => { if (dialDragging) setDial(toDeg(e), true); });
  const end = () => { dialDragging = false; host.classList.remove('dragging'); scheduleCollapse(); };
  host.addEventListener('pointerup', end);
  host.addEventListener('pointercancel', end);
  // 键盘：↑↓ 每次 5°
  host.addEventListener('keydown', e => {
    if (e.key === 'ArrowUp') { setDial(dialDeg + 5, true); e.preventDefault(); }
    if (e.key === 'ArrowDown') { setDial(dialDeg - 5, true); e.preventDefault(); }
  });
  document.getElementById('tilt-toggle').addEventListener('click', e => { e.stopPropagation(); openDial(true); });
  window.addEventListener('pointerdown', e => {
    if (!e.target.closest('#tilt-dial, #tilt-toggle') && !host.classList.contains('collapsed')) openDial(false);
  });
  // 拖书转角度时，指针也跟着动
  const sync = () => {
    requestAnimationFrame(sync);
    if (!dialDragging && book && !dialTween) drawNeedle(pitchToDeg(book.drag.pitch));
  };
  requestAnimationFrame(sync);
}

function drawNeedle(deg) {
  dialDeg = Math.max(DIAL.min, Math.min(DIAL.max, deg));
  needleGroup.setAttribute('transform', `translate(${PIVOT.x},${PIVOT.y}) rotate(${-dialDeg})`);
  // 收起时小圆钮里的迷你指针也跟着转
  const a = dialDeg * Math.PI / 180;
  const mini = document.getElementById('tilt-mini');
  mini.setAttribute('x2', 8 + Math.cos(a) * 22); mini.setAttribute('y2', 32 - Math.sin(a) * 22);
  document.getElementById('tilt-dial').setAttribute('aria-valuenow', String(Math.round(dialDeg)));
}

// ---- 展开 / 收起：平时只露一个小圆钮，点开像折扇一样展开；松手 4 秒后自动收回
let collapseTimer = 0;
function openDial(open) {
  const dial = document.getElementById('tilt-dial');
  if (open) {
    // 让刻度盘的转轴正好落在底栏圆钮的正上方：像从按钮里展开的扇子
    const btn = document.getElementById('tilt-toggle').getBoundingClientRect();
    const stage = dial.parentElement.getBoundingClientRect();
    const size = dial.offsetWidth, pivotX = size * PIVOT.x / 150, pivotY = size * PIVOT.y / 150;
    const left = btn.left + btn.width / 2 - pivotX - stage.left;
    dial.style.left = `${Math.min(left, stage.width - size - 8)}px`;
    dial.style.top = `${btn.top - pivotY - 10 - stage.top}px`;
  }
  dial.classList.toggle('collapsed', !open);
  document.getElementById('tilt-toggle').setAttribute('aria-expanded', String(open));
  clearTimeout(collapseTimer);
  if (open) { dialClick(true); scheduleCollapse(); }
}
function scheduleCollapse() {
  clearTimeout(collapseTimer);
  collapseTimer = setTimeout(() => { if (!dialDragging) openDial(false); else scheduleCollapse(); }, 4000);
}

/** 设定角度：带吸附和咔哒声（fromUser = 手在拖）。 */
function setDial(deg, fromUser) {
  let d = Math.max(DIAL.min, Math.min(DIAL.max, deg));
  const preset = DIAL.presets.find(p => Math.abs(p.deg - d) < DIAL.snap);
  if (preset) d = preset.deg;
  if (fromUser) {
    const bucket = Math.round(d / 5);
    if (lastTickDeg !== null && bucket !== lastTickDeg) dialClick(false);
    if (preset && Math.abs(dialDeg - preset.deg) > 0.5) dialClick(true);
    lastTickDeg = bucket;
  }
  drawNeedle(d);
  if (book) book.drag.pitch = degToPitch(dialDeg);
  scheduleCollapse();                         // 每次操作都重新计时，停手 4 秒才收回
}

/** 点常用角度：指针平滑转过去。 */
function animateDial(target) {
  cancelAnimationFrame(dialTween);
  const from = dialDeg, t0 = performance.now(), dur = 600;
  const step = now => {
    const k = Math.min((now - t0) / dur, 1), e = 1 - Math.pow(1 - k, 3);
    setDial(from + (target - from) * e, false);
    if (k < 1) dialTween = requestAnimationFrame(step); else { dialTween = 0; dialClick(true); }
  };
  dialTween = requestAnimationFrame(step);
}

function begin() {
  audio.unlock();
  reading = true;
  ambience.play(spotId);
  dom.gate.classList.add('gone');
  const target = bookmark && data.spreadOrder.includes(bookmark.spreadId) ? bookmark.spreadId : null;
  pending = target && target !== data.spreadOrder[0] ? target : null;
  book.open();
}

// ---------------------------------------------------------------- 机关触发时读出单词
// 用浏览器朗读读一个词（以后可换成配音文件）。中文模式读中文，英文模式读英文。
function speakVocab(word) {
  const synth = window.speechSynthesis;
  if (!synth || !word) return;
  const entry = data.vocab?.[word];
  const text = readLang === 'zh' ? (entry?.zh || word) : (entry?.en || word);
  const u = new SpeechSynthesisUtterance(text);
  u.lang = readLang === 'zh' ? 'zh-CN' : 'en-US';
  u.rate = 0.85;
  synth.speak(u);
}

// ---------------------------------------------------------------- 短版 / 完整版
// 跨页可以写 levels: [1, 2, 3]，表示哪些等级会读到这一页。按图书馆里孩子当前的等级过滤；
// 网址加 ?version=short / ?version=full 可以强制看某个版本（检查样书时用）。
function applyVersion(book) {
  if (!book.spreads.some(s => Array.isArray(s.levels))) return;
  const forced = new URLSearchParams(location.search).get('version');
  const level = forced === 'short' ? 1 : forced === 'full' ? 3 : (loadProfile().level || 1);
  const keep = new Set(book.spreads.filter(s => !s.levels || s.levels.includes(level)).map(s => s.id));
  book.spreads = book.spreads.filter(s => keep.has(s.id));
  book.spreadOrder = book.spreadOrder.filter(id => keep.has(id));
  book.version = level === 1 ? 'short' : 'full';
}

async function main() {
  try {
    // 每本书一个书稿：data/books/<书 id>.json；没有就用样片 data/book.json（纸月亮）
    let response = libraryBookId ? await fetch(`data/books/${encodeURIComponent(libraryBookId)}.json`) : null;
    if (!response || !response.ok) response = await fetch('data/book.json');
    data = await response.json();
  } catch {
    fail('书稿没有加载成功。');
    return;
  }
  applyVersion(data);
  // 会动的插图书：先按真实字体把原文排进书页（生成每个跨页的 canvas），再建书
  let pagebook = null;
  if (data.format === 'illustrated') {
    pagebook = await prepareIllustratedBook(data);
    document.body.classList.add('illustrated');
  }
  // 只有一种语言的书（比如读英文原文的《小王子》）：朗读语言跟着书走，藏起语言切换
  if (Array.isArray(data.languages) && !data.languages.includes(readLang)) {
    readLang = data.languages[0];
    caption.setLang(readLang);
  }
  caption.setLanguages(data.languages || ['zh', 'en']);
  configureStore(data.bookmarks?.storageKey || `paper-storybook:${location.pathname}`);
  bookmark = loadBookmark();
  document.title = data.title || "Paper Storybook";
  book = new PopupBook(dom.canvas, data, {
    onStart: kind => { if (kind === 'open') audio.open(); if (kind === 'turn') audio.fold(); },
    onSettled: state => {
      turning = false;
      renderReader(state);
      caption.setPassages(localized(state.passages), reading);   // 翻开书之后，每翻到一页就从第一句开始读
      persist();
      if (libraryBookId && state.index === state.count - 1) markFinished(libraryBookId);
      if (pending) {
        const target = pending;
        pending = null;
        setTimeout(() => { book.goTo(target); renderReader(book.current()); }, 380);
      }
    }
  });
  audio.enabled = !bookmark?.muted;
  dom.sound.textContent = audio.enabled ? '纸声 开' : '纸声 关';
  dom.sound.setAttribute('aria-pressed', String(audio.enabled));
  book.bindDrag(dom.canvas);
  dom.gateBtn.disabled = true;
  dom.gateTitle.textContent = data.title || '纸艺立体书';

  const sub = document.querySelector('[data-book-sub]');
  if (sub) sub.textContent = data.language === 'zh' ? '纸艺 · 立体书' : 'paper storybook';
  document.querySelector('.gate-sub').textContent = `${data.chapters.length} 章 · ${data.spreadOrder.length} 跨页`;

  try {
    await book.load((done, total) => {
      dom.gateNote.textContent = done < total ? `装订中 ${done}/${total}` : '可以翻开了';
      if (done === total) dom.gateBtn.disabled = false;
    });
  } catch {
    fail('纸本书没能装订完成，刷新后再试。');
    return;
  }
  if (bookmark && data.spreadOrder.includes(bookmark.spreadId)) {
    dom.gateNote.textContent = '上次翻到的地方已经记下';
  }
  buildDots();
  buildIndex();
  renderReader(book.current());
  dom.gateBtn.addEventListener('click', begin);
  bind();
  bindZoom();
  bindPageDrag();
  buildDial();
  // 阅读地点
  document.getElementById('btn-spot').textContent = uiLang === 'en' ? 'Place' : '地点';
  document.getElementById('btn-spot').addEventListener('click', e => { e.stopPropagation(); toggleSpotMenu(); });
  window.addEventListener('pointerdown', e => {
    const menu = document.getElementById('spot-menu');
    if (!menu.hidden && !e.target.closest('#spot-menu, #btn-spot')) toggleSpotMenu(false);
  });
  window.addEventListener('resize', fitSpotBackground);
  upgradeRendering();
  // 纸的机关（翻翻页 / 拉拉条 / 转头）：书稿里写了 mechanics 的跨页才有
  const mechanics = createMechanics(book, data, { speakWord: speakVocab, isReading: () => reading });
  // 读到哪一段，就把"线索"交给机关：魔法挂在原文段落上
  caption.onPassage(passage => mechanics.cue(passage));
  if (pagebook) pagebook.attach(book, caption);   // 插图书：字在纸上高亮，魔法挂在原文上（会接管上面的线索）
  window.addEventListener('resize', () => composer && composer.setSize(dom.canvas.clientWidth, dom.canvas.clientHeight));
  // 字幕条高度会变（一行 / 两行 / 收起），跟着重新让位
  // book.resize() 会把 camera.aspect 改回整个画布的比例，所以要在它之后（下一帧）重新布局
  fitTextSize();
  window.addEventListener('resize', () => { fitTextSize(); requestAnimationFrame(fitBookAboveCaption); });
  // 书的角度（刻度盘）或开合程度变了，书在画面里的形状就变了 → 重新装框
  // （左右转动 yaw 不触发：转着看的时候书忽大忽小会很怪）
  let fitted = { pitch: NaN, focus: NaN };
  (function watchPose() {
    requestAnimationFrame(watchPose);
    if (!book) return;
    const pitch = book.drag.pitch, focus = book.drag.focus === undefined ? 1 : book.drag.focus;
    if (Math.abs(pitch - fitted.pitch) > 0.004 || Math.abs(focus - fitted.focus) > 0.004) {
      fitted = { pitch, focus };
      fitBookAboveCaption();
    }
  })();
  new ResizeObserver(() => fitBookAboveCaption()).observe(document.getElementById('caption'));
  await applySpot(spotId);

  // read-only hooks used by the project's own QA script
  window.__neta = {
    get state() { return book.current(); },
    get book() { return book; },
    THREE,
    /** 书页上一点（x：-1 左外沿 ~ 1 右外沿，z：-0.5 远 ~ 0.5 近）在屏幕上的位置，测试拖动翻页用。 */
    pageScreen(x, z = 0) {
      const v = new THREE.Vector3(x * book.pageW, 0, z).project(book.camera), r = dom.canvas.getBoundingClientRect();
      return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
    },
    get phase2() { return { phase: book.state.phase, p: book.state.p, anim: book.anim && book.anim.kind, index: book.state.index }; },
    get phase() { return book.state.phase; },
    get failedAssets() { return book.failedAssets || []; },
    get leafSample() { return book.leafSample(); },
    get standeeStates() { return book.standeeStates(); },
    attachmentSnapshot() { return book.attachmentSnapshot(); },
    pageSurfaceAudit() { return book.pageSurfaceAudit(); },
    get collisions() { return book.collisions(); },
    get spreadCount() { return book.spreads.length; },
    get spreadIds() { return book.spreads.map(s => s.id); },
    seekTurn(u) { return book.seekTurn(u); },
    goTo(id) { const ok = book.goTo(id); renderReader(book.current()); return ok; },
    set timeScale(v) { book.timeScale = v; }
  };
}

main();
