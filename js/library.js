// library.js — 魔法书房（进入场景 + 悬浮书）
//
// 空间 = 信息架构：六面墙 = 六个书区（新书 / 正在读 / 科学 / 童话 / 冒险 / 语言）。
// 墙是画出来的，画里的书拿不下来；真正能点的书是"悬浮书"——一直漂在各自的墙前：
//   低处（视线高度）= 当前级别及以下，可以打开
//   高处（回廊高度）= 更高级别，被丝带和蜡封封住，升级后解封、飞下来
// 房间模式：拖动环顾，点任意一本书 → 它飞到面前、翻开 → 进入立体书
// 聚拢模式：点墙或墙脚铜牌 → 镜头走近，这面墙的书聚拢排好；左右滑动换墙；「回到书房」书再散开漂浮
//
// 第一次来：书房里藏着一本发光的书（新手引导）；以后来：壁炉前飘着"正在读"的书。
// 书封见 covers.js；孩子的进度见 profile.js。

import * as THREE from '../vendor/three.module.min.js';
import { loadProfile, markOpened, checkLevelUp, setLevel, resetProfile, setLang, markSecret } from './profile.js';
import { drawCover, TITLE_FONT, fontFor } from './covers.js';
import { createWand } from './wand.js';
import { createMusic } from './music.js';
import { createOwl } from './owl.js';
import { buildMoonSkin, SKINS, loadSkin, saveSkin } from './skins.js';

// ---------------------------------------------------------------- 视觉参数（改风格主要改这里）
const THEME = {
  night: 0x140f1f,
  amber: 0xffc27a,
  sealGlow: 0x9a8cff,       // 封印书的冷光：淡紫
  wallPlaceholder: '#5a3a24',
  pillar: '#2e1c12',
  dust: 0xffe6a8,
  ribbon: 0x9c2f3a,
  wax: 0x7a1e28,
  candleCount: 20,
  dustCount: 110,
  // 墙面压暗（线性色彩空间的乘数，约等于屏幕亮度 ×0.75，略偏冷）：背景退后，发光的书才跳得出来
  wallDim: [0.52, 0.5, 0.6]
};

const WALL_COUNT = 6;
const WALL_ASPECT = 2 / 3;                 // 每面墙板 1024×1536
const BOOK_SIZE = { W: 0.23, H: 0.315, T: 0.05 };
// 每面墙前两排悬浮书架：等距、同高、居中
const SHELF = {
  rows: { lower: 1.2, upper: 2.05 },        // 高度（米）：下排在视线高度，上排在回廊高度
  inset: { lower: 0.5, upper: 0.42 },       // 离墙多远（米）
  spacing: 0.3,                             // 相邻两本书的间距（米）
  focusStep: 0.5                            // 点墙时镜头往墙走多远
};
// 魔法棒碰到书时的反应
const HOVER = { pull: 0.13, scale: 1.12 };
const FOLLOW = 5;                           // 书跟随目标的速度（越大越快）

const $ = sel => document.querySelector(sel);
const canvas = $('#room');
const veil = $('#veil');

// ---------------------------------------------------------------- 基础场景
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(THEME.night);
const camera = new THREE.PerspectiveCamera(68, 1, 0.05, 50);
camera.rotation.order = 'YXZ';             // 先转左右（yaw）再转上下（pitch），像人转头
const hemi = new THREE.HemisphereLight(0xffe2b8, 0x2a1d3a, 0.7);
scene.add(hemi);

// 全局状态
let data = null;                            // library.json
let profile = null;                         // 孩子的进度
let room = null;                            // { radius, height, front, arc, wallMeshes, plaques }
let mode = 'room';                          // room | moving | focus | opening
let focusWall = null;                       // 聚拢模式下正对的墙（0 起）
let floating = [];                          // 所有悬浮书
let welcome = null;                         // 新手引导的那本（第一次来时）
let hints = {};
let justUnlockedLevel = null;
let lang = 'en';                            // 界面语言：'en' | 'zh'

/** 取当前语言的文字：{ en, zh } → 字符串；本来就是字符串的原样返回。 */
const t = text => (text && typeof text === 'object' ? (text[lang] ?? text.en) : text);

// ---------------------------------------------------------------- 贴图：真图优先，失败就用占位图
const loader = new THREE.TextureLoader();

/**
 * 背景柔焦：像多层摄影机里的背景层那样，略微失焦 + 降一点饱和度。
 * 墙画仍然完整，但不再和前景的书抢焦点。
 */
function softenForBackground(image, blurPx = 1.4) {
  const c = document.createElement('canvas');
  c.width = image.width; c.height = image.height;
  const g = c.getContext('2d');
  g.filter = `blur(${blurPx}px) saturate(0.82)`;
  g.drawImage(image, 0, 0);
  return c;
}

function loadOr(file, makePlaceholder, soften = false) {
  return new Promise(resolve => {
    loader.load(file, tex => {
      if (soften) tex = new THREE.CanvasTexture(softenForBackground(tex.image));
      tex.colorSpace = THREE.SRGBColorSpace;
      resolve({ texture: tex, real: true });
    }, undefined, () => {
      const tex = new THREE.CanvasTexture(makePlaceholder());
      tex.colorSpace = THREE.SRGBColorSpace;
      resolve({ texture: tex, real: false });
    });
  });
}

function loadImage(src) {
  return new Promise(resolve => {
    if (!src) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function wallPlaceholder(wall) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 768;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0, '#2a1a14');
  grad.addColorStop(1, THEME.wallPlaceholder);
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = THEME.pillar;
  g.fillRect(0, 0, 22, c.height);
  g.fillRect(c.width - 22, 0, 22, c.height);
  g.fillStyle = '#f6e7c8';
  g.font = '28px Georgia, serif';
  g.textAlign = 'center';
  g.fillText(wall.label, c.width / 2, 372);
  g.font = '16px sans-serif';
  g.fillText(`placeholder → ${wall.file.split('/').pop()}`, c.width / 2, 396);
  return c;
}

function roundPlaceholder(label, kind) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(256, 256, 20, 256, 256, 256);
  if (kind === 'ceiling') {
    r.addColorStop(0, '#2b2350'); r.addColorStop(1, '#0c0915');
  } else {
    r.addColorStop(0, '#3a3a6a'); r.addColorStop(0.5, '#2a2a4c'); r.addColorStop(1, '#141024');
  }
  g.fillStyle = r;
  g.fillRect(0, 0, 512, 512);
  if (kind === 'floor') {
    g.strokeStyle = 'rgba(217,178,95,0.35)';
    for (let rad = 40; rad < 256; rad += 36) { g.beginPath(); g.arc(256, 256, rad, 0, Math.PI * 2); g.stroke(); }
  }
  g.fillStyle = '#f6e7c8';
  g.font = '22px Georgia, serif';
  g.textAlign = 'center';
  g.fillText(label, 256, 250);
  return c;
}

// ---------------------------------------------------------------- 房间几何
// 圆柱角度 θ：x = sin θ, z = cos θ。正前方（-z）是 θ = π。墙按编号顺时针：向右转看到 1 → 2 → 3 …
const wallCenterAngle = i => Math.PI - (i - room.front) * room.arc;         // i 从 0 开始
const pointAt = (angle, dist, y) => new THREE.Vector3(Math.sin(angle) * dist, y, Math.cos(angle) * dist);
const wallDirection = i => pointAt(wallCenterAngle(i), 1, 0);
const yawForWall = i => -(i - room.front) * room.arc;

async function buildRoom(roomData) {
  const H = roomData.height;
  const radius = (H * WALL_ASPECT * WALL_COUNT) / (Math.PI * 2);   // 周长 = 6 块墙板的总宽
  const arc = (Math.PI * 2) / WALL_COUNT;
  const front = (roomData.frontWall || 1) - 1;
  const group = new THREE.Group();
  const wallMeshes = [];

  const walls = await Promise.all(roomData.walls.map(w => loadOr(w.file, () => wallPlaceholder(w), true)));
  walls.forEach(({ texture }, i) => {
    const center = Math.PI - (i - front) * arc;
    const geo = new THREE.CylinderGeometry(radius, radius, H, 32, 1, true, center - arc / 2, arc);
    texture.wrapS = THREE.RepeatWrapping;
    texture.repeat.x = -1;                 // 从圆筒内部看，贴图水平翻转回来
    texture.anisotropy = 8;
    // 墙是"画出来的"，光影已经画在图里，所以不受场景光照影响
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide, color: new THREE.Color().setRGB(...THEME.wallDim) }));
    mesh.position.y = H / 2;
    mesh.userData.wallIndex = i;
    wallMeshes.push(mesh);
    group.add(mesh);
  });

  const [ceil, floor] = await Promise.all([
    loadOr(roomData.ceiling.file, () => roundPlaceholder(roomData.ceiling.label, 'ceiling')),
    loadOr(roomData.floor.file, () => roundPlaceholder(roomData.floor.label, 'floor'))
  ]);
  ceil.texture.wrapS = THREE.RepeatWrapping;
  ceil.texture.repeat.x = -1;              // 从下往上看是镜像的，翻回来
  const ceiling = new THREE.Mesh(new THREE.CircleGeometry(radius, 64), new THREE.MeshBasicMaterial({ map: ceil.texture, color: new THREE.Color().setRGB(...THEME.wallDim) }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = H;
  const ground = new THREE.Mesh(new THREE.CircleGeometry(radius, 64), new THREE.MeshBasicMaterial({ map: floor.texture, color: new THREE.Color().setRGB(...THEME.wallDim) }));
  ground.rotation.x = -Math.PI / 2;
  group.add(ceiling, ground);

  scene.add(group);
  scene.fog = new THREE.Fog(THEME.night, radius * 1.6, radius * 4);
  return { radius, height: H, front, arc, wallMeshes, ceiling, ground, realCount: [...walls, ceil, floor].filter(x => x.real).length };
}

// ---------------------------------------------------------------- 墙脚铜牌：书区名字
function plaqueTexture(text) {   // text：已经是当前语言的字符串
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(40,24,16,0.88)';
  g.beginPath(); g.roundRect(8, 8, 496, 112, 56); g.fill();
  g.strokeStyle = '#d9b25f'; g.lineWidth = 5;
  g.beginPath(); g.roundRect(14, 14, 484, 100, 50); g.stroke();
  g.fillStyle = '#f6e7c8';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = 56;
  do { g.font = fontFor(lang, size); size -= 2; } while (g.measureText(text).width > 440 && size > 30);
  g.fillText(text, 256, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildPlaques() {
  return data.sections.map(section => {
    const i = section.wall - 1;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: plaqueTexture(t(section.name)), transparent: true, depthWrite: false }));
    sprite.scale.set(0.5, 0.125, 1);
    sprite.position.copy(wallDirection(i).multiplyScalar(room.radius - 0.12)).setY(0.62);
    sprite.userData.wallIndex = i;
    sprite.userData.section = section;
    scene.add(sprite);
    return sprite;
  });
}

// ---------------------------------------------------------------- 发光贴图（烛火、光晕、仙尘共用）
const GLOW = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,236,190,1)');
  r.addColorStop(0.25, 'rgba(255,210,140,0.55)');
  r.addColorStop(1, 'rgba(255,190,110,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const glowSprite = (color, opacity, size) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity }));
  s.scale.set(size, size, 1);
  return s;
};

// ---------------------------------------------------------------- 漂浮的蜡烛 & 金色仙尘
const candleLights = [];
function buildCandles() {
  const candles = [];
  const waxMat = new THREE.MeshStandardMaterial({ color: 0xf3e3c3, roughness: 0.8, emissive: 0x3a2410 });
  const waxGeo = new THREE.CylinderGeometry(0.018, 0.02, 0.12, 12);
  for (let i = 0; i < THEME.candleCount; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = 0.3 + Math.random() * 0.75;                     // 蜡烛在房间中部，书在墙前，互不遮挡
    const y = room.height * 0.8 + Math.random() * room.height * 0.14;
    const group = new THREE.Group();
    const flame = glowSprite(THEME.amber, 0.85, 0.14);
    flame.scale.y = 0.2;
    flame.position.y = 0.09;
    const wax = new THREE.Mesh(waxGeo, waxMat);
    group.add(wax, flame);
    group.position.set(Math.cos(a) * d, y, Math.sin(a) * d);
    scene.add(group);
    candles.push({ group, flame, wax, waxGeo, waxMat, baseY: y, phase: Math.random() * Math.PI * 2, speed: 0.5 + Math.random() * 0.5 });
  }
  for (let i = 0; i < 3; i++) {
    const light = new THREE.PointLight(THEME.amber, 1.5, room.radius * 2.4, 1.6);
    const a = (i / 3) * Math.PI * 2;
    light.position.set(Math.cos(a) * room.radius * 0.4, room.height * 0.72, Math.sin(a) * room.radius * 0.4);
    scene.add(light);
    candleLights.push(light);
  }
  return candles;
}

function buildDust() {
  const positions = new Float32Array(THEME.dustCount * 3);
  const seeds = new Float32Array(THEME.dustCount);
  for (let i = 0; i < THEME.dustCount; i++) {
    const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * (room.radius - 0.2);
    positions.set([Math.cos(a) * d, Math.random() * room.height, Math.sin(a) * d], i * 3);
    seeds[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    map: GLOW, color: THEME.dust, size: 0.045, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
  }));
  scene.add(points);
  return { points, seeds };
}

// ---------------------------------------------------------------- 壁炉：跳动的火苗 + 暖光 + 火星 + 闪烁的火光
// 叠在墙画里那团火的位置上（位置见 library.json 的 room.fireplace）。
// 火光是真光源，壁炉前的书会被映得忽明忽暗；大声的噼啪会同步迸出一团火星（music.onCrackle）。
const flameTexture = (() => {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 92, 2, 32, 80, 60);
  r.addColorStop(0, 'rgba(255,250,220,1)');
  r.addColorStop(0.25, 'rgba(255,210,120,0.9)');
  r.addColorStop(0.6, 'rgba(255,120,40,0.45)');
  r.addColorStop(1, 'rgba(200,40,10,0)');
  g.fillStyle = r;
  // 水滴形：下圆上尖
  g.beginPath();
  g.moveTo(32, 4);
  g.bezierCurveTo(52, 50, 60, 90, 32, 124);
  g.bezierCurveTo(4, 90, 12, 50, 32, 4);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();

/** 几个不同频率的正弦叠加：比单一正弦更像火的"不规则"跳动。 */
const flicker = (t, phase) => (Math.sin(t * 7.1 + phase) + Math.sin(t * 11.3 + phase * 2) * 0.6 + Math.sin(t * 3.7 + phase * 3) * 0.8) / 2.4;

let fire = null;
// 会随皮肤变化的参数（applySkin 设置）
let EMBER = [1, 0.55, 0.18];
let FIRE_VOLUME = 1;
const GRAV_CLASSIC = { bobAmp: 0.012, bobSpeed: 0.9, spin: 0 };
let GRAV = { ...GRAV_CLASSIC };

function buildFireplace() {
  const cfg = data.room.fireplace;
  if (!cfg) return null;
  const i = cfg.wall - 1;
  const panelW = room.height * WALL_ASPECT;
  const angle = wallCenterAngle(i) + (0.5 - cfg.u) * room.arc;       // 画面左 → 圆心角大
  const baseY = (1 - cfg.base) * room.height, topY = (1 - cfg.top) * room.height;
  const flameH = topY - baseY, width = cfg.width * panelW;
  const base = pointAt(angle, room.radius - 0.04, baseY);
  const side = new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle));   // 沿墙面的水平方向
  const group = new THREE.Group();
  scene.add(group);

  // 火舌：5 片水滴形的发光贴片，各自跳动
  const tongues = [-0.8, -0.4, 0, 0.4, 0.8].map((k, n) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: flameTexture, color: [0xffc46b, 0xffa040, 0xffe3a0, 0xffa040, 0xffc46b][n],
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55
    }));
    group.add(s);
    return { s, k, h: flameH * (n === 2 ? 1.05 : 0.7 + Math.random() * 0.2), w: width * (n === 2 ? 0.42 : 0.3), phase: Math.random() * 10 };
  });
  const core = glowSprite(0xfff0c0, 0.5, width * 0.9);                  // 火堆底部最亮的一团
  core.position.copy(base).y += flameH * 0.12;
  const aura = glowSprite(0xff8a3d, 0.3, width * 3.4);                  // 壁炉口的暖光
  aura.position.copy(base).y += flameH * 0.5;
  group.add(core, aura);

  // 真光源：往房间里挪一点，照到壁炉前的书
  const light = new THREE.PointLight(0xff8a3d, 1.2, 2.6, 1.6);
  light.position.copy(base).addScaledVector(pointAt(angle, 1, 0), -0.45).setY(baseY + flameH * 0.6);
  scene.add(light);

  // 火星：一群往上飘、渐渐熄灭的小光点（顶点颜色控制明暗，叠加混合）
  const COUNT = 60;
  const pos = new Float32Array(COUNT * 3), col = new Float32Array(COUNT * 3);
  const embers = Array.from({ length: COUNT }, () => ({ life: 0, age: 1, v: new THREE.Vector3() }));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    map: GLOW, size: 0.035, vertexColors: true, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
  }));
  group.add(points);
  const inward = pointAt(angle, -1, 0);                                  // 指向房间中央

  function spawn(e, strong) {
    e.p = base.clone().addScaledVector(side, (Math.random() - 0.5) * width * 0.8);
    e.p.y += flameH * (0.2 + Math.random() * 0.3);
    e.v.copy(side).multiplyScalar((Math.random() - 0.5) * (strong ? 0.5 : 0.12))
      .addScaledVector(inward, Math.random() * (strong ? 0.25 : 0.05));
    e.v.y = (strong ? 0.5 : 0.18) + Math.random() * (strong ? 0.5 : 0.2);
    e.life = (strong ? 0.8 : 1.4) + Math.random() * 1.2;
    e.age = 0;
  }
  embers.forEach(e => { spawn(e, false); e.age = Math.random() * e.life; });

  return { wall: i, group, base, side, flameH, tongues, core, aura, light, embers, points, spawn };
}

/** 大声噼啪：一口气迸出十来颗快火星。 */
function burstEmbers() {
  if (!fire) return;
  let n = 0;
  for (const e of fire.embers) if (e.age > e.life * 0.6 && n < 12) { fire.spawn(e, true); n++; }
}

function updateFire(dt, time) {
  if (!fire) return;
  for (const f of fire.tongues) {
    const k = 0.78 + 0.22 * flicker(time, f.phase);
    f.s.scale.set(f.w * (0.9 + 0.1 * flicker(time * 0.7, f.phase + 2)), f.h * k, 1);
    f.s.position.copy(fire.base)
      .addScaledVector(fire.side, f.k * fire.flameH * 0.22 + Math.sin(time * 1.7 + f.phase) * 0.008);
    f.s.position.y += f.h * k * 0.45;
  }
  const glow = 0.5 + 0.5 * flicker(time * 0.9, 1.3);
  fire.core.material.opacity = 0.4 + glow * 0.25;
  fire.aura.material.opacity = 0.22 + glow * 0.14;
  fire.light.intensity = 0.9 + glow * 0.7;

  const pos = fire.points.geometry.attributes.position, col = fire.points.geometry.attributes.color;
  fire.embers.forEach((e, n) => {
    e.age += dt;
    if (e.age > e.life) fire.spawn(e, false);
    e.v.y *= 0.995;
    e.p.addScaledVector(e.v, dt);
    e.p.addScaledVector(fire.side, Math.sin(time * 2 + n) * dt * 0.03);   // 飘的时候左右晃
    const k = Math.max(0, 1 - e.age / e.life);
    pos.setXYZ(n, e.p.x, e.p.y, e.p.z);
    col.setXYZ(n, EMBER[0] * k, EMBER[1] * k, EMBER[2] * k);              // 经典：橙色；月球：银蓝的月尘
  });
  pos.needsUpdate = true; col.needsUpdate = true;

  // 火声：越正对壁炉越响（转开时还留一点，像在房间另一头听见）
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).setY(0).normalize();
  const facing = forward.dot(wallDirection(fire.wall));
  music.setFire(FIRE_VOLUME * (0.15 + 0.85 * THREE.MathUtils.clamp((facing - 0.3) / 0.7, 0, 1)));
}

// ---------------------------------------------------------------- 书的待机魔法：呼吸波 + 烫金闪光 + 封印光点
const glintTexture = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,240,1)');
  r.addColorStop(0.2, 'rgba(255,230,160,0.6)');
  r.addColorStop(1, 'rgba(255,200,100,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(255,255,245,0.95)';
  // 细长的四角星芒
  g.beginPath(); g.moveTo(32, 0); g.lineTo(35, 29); g.lineTo(64, 32); g.lineTo(35, 35); g.lineTo(32, 64); g.lineTo(29, 35); g.lineTo(0, 32); g.lineTo(29, 29); g.closePath(); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
let nextGlintAt = 2;

/** 每隔几秒，挑一本在画面里、没被碰到的书，让它封面角上"叮"地闪一下，像烫金被光扫过。 */
function scheduleGlint(time) {
  if (time < nextGlintAt) return;
  nextGlintAt = time + 1.6 + Math.random() * 2.4;
  const candidates = floating.filter(b => !b.seal && b !== hovered && b.state === 'float' && inView(b));
  if (!candidates.length) return;
  const b = candidates[Math.floor(Math.random() * candidates.length)];
  b.glintAt = time;
  chime([2637], 0.012);                    // 极轻的"叮"
}

// ---------------------------------------------------------------- 一本 3D 书
let coverImages = new Map();               // 封面插画缓存：file → Image | null

function coverTexture(book) {
  const tex = new THREE.CanvasTexture(drawCover(book, t(book.title), lang, coverImages.get(book.cover)));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** 书芯（烫金书口）+ 封底 + 可绕书脊翻开的封面 + 书页里的光 + 背后的光晕。 */
function makeBook(book, scale = 1) {
  const { W, H, T } = BOOK_SIZE;
  // 封面和布面带一点自发光：房间的光从上往下照，书封正好背光，不补光就会发黑、烫金发闷
  const clothMat = new THREE.MeshStandardMaterial({ color: book.color, roughness: 0.75, emissive: book.color, emissiveIntensity: 0.35 });
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0xe9cf86, roughness: 0.35, metalness: 0.55, emissive: 0x2a1d0a });  // 烫金书口
  const cover = coverTexture(book);
  const coverMat = new THREE.MeshStandardMaterial({ map: cover, roughness: 0.5, metalness: 0.12, emissive: 0xffffff, emissiveMap: cover, emissiveIntensity: 0.6 });

  const root = new THREE.Group();
  const pages = new THREE.Mesh(new THREE.BoxGeometry(W - 0.012, H - 0.012, T), edgeMat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.008), clothMat);
  back.position.z = -T / 2 - 0.004;
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.008, H, T + 0.016), clothMat);
  spine.position.x = -W / 2;
  const hinge = new THREE.Group();          // 书脊上的轴，封面挂在上面
  hinge.position.set(-W / 2, 0, T / 2 + 0.004);
  const front = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.008), [clothMat, clothMat, clothMat, clothMat, coverMat, clothMat]);
  front.position.x = W / 2;
  hinge.add(front);
  const pageGlow = glowSprite(0xfff1c8, 0, W * 2.8);
  pageGlow.position.z = T;
  const halo = glowSprite(THEME.amber, 0.4, W * 2.6);
  halo.position.z = -0.06;
  const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTexture, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
  glint.position.set(W * 0.34, H * 0.4, T / 2 + 0.02);   // 封面右上角
  glint.scale.setScalar(0.001);
  root.add(pages, back, spine, hinge, pageGlow, halo, glint);
  root.scale.setScalar(scale);
  scene.add(root);
  return { book, root, hinge, pageGlow, halo, glint, coverMat, scale, state: 'float', t: 0, phase: Math.random() * Math.PI * 2 };
}

/** 封印：十字丝带 + 蜡封，光晕换成冷紫色。 */
function addSeal(b) {
  const { W, H, T } = BOOK_SIZE;
  const seal = new THREE.Group();
  const ribbonMat = new THREE.MeshStandardMaterial({ color: THEME.ribbon, roughness: 0.6 });
  const z = T / 2 + 0.014;
  const vertical = new THREE.Mesh(new THREE.BoxGeometry(0.028, H + 0.012, 0.006), ribbonMat);
  const horizontal = new THREE.Mesh(new THREE.BoxGeometry(W + 0.012, 0.028, 0.006), ribbonMat);
  vertical.position.z = horizontal.position.z = z;
  const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.038, 0.012, 20), new THREE.MeshStandardMaterial({ color: THEME.wax, roughness: 0.4, metalness: 0.1 }));
  wax.rotation.x = Math.PI / 2;
  wax.position.z = z + 0.008;
  seal.add(vertical, horizontal, wax);
  b.root.add(seal);
  b.seal = seal;
  // 两颗淡紫光点绕着封印的书慢慢转圈：暗示"这里有魔法锁着"
  b.sealMotes = [0, Math.PI].map(offset => {
    const m = glowSprite(THEME.sealGlow, 0.7, 0.05);
    b.root.add(m);
    return { m, offset };
  });
  b.halo.material.color.setHex(THEME.sealGlow);
}

function addBookmark(b) {
  const { H, T } = BOOK_SIZE;
  const mark = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.12, 0.003), new THREE.MeshStandardMaterial({ color: 0xd9b25f, metalness: 0.4, roughness: 0.4, emissive: 0x3a2a08 }));
  mark.position.set(0.05, H / 2 + 0.03, T / 2 + 0.01);
  b.root.add(mark);
}

// ---------------------------------------------------------------- 悬浮书：每面墙放哪些、漂在哪
function booksForSection(section) {
  const all = data.books;
  if (section.id === 'reading') return profile.opened.map(id => all.find(b => b.id === id)).filter(Boolean).slice(0, 6);
  if (section.id === 'new') return all.filter(b => b.new);
  return all.filter(b => b.theme === section.id);
}
const isUnlocked = book => book.level <= profile.level;

function buildFloatingBooks() {
  const list = [];
  for (const section of data.sections) {
    const i = section.wall - 1;
    const books = booksForSection(section);
    const rows = { lower: books.filter(isUnlocked), upper: books.filter(b => !isUnlocked(b)) };
    for (const [row, rowBooks] of Object.entries(rows)) {
      const radius = room.radius - SHELF.inset[row];
      const step = SHELF.spacing / radius;            // 相邻两本书之间的圆心角
      rowBooks.forEach((book, k) => {
        const isCurrent = section.id === 'reading' && book.id === profile.current;
        const b = makeBook(book, isCurrent ? 1.15 : 1);
        b.baseScale = b.scale;
        b.wall = i; b.row = row; b.slot = k;
        const angle = wallCenterAngle(i) + ((rowBooks.length - 1) / 2 - k) * step;   // 从左到右
        b.home = pointAt(angle, radius, SHELF.rows[row]);
        b.root.position.copy(b.home);
        tmpObj.position.copy(b.home);
        tmpObj.lookAt(0, SHELF.rows[row], 0);        // 封面朝向房间中央
        b.homeQuat = tmpObj.quaternion.clone();
        b.root.quaternion.copy(b.homeQuat);
        if (isCurrent) b.isCurrent = true;
        const unlocking = justUnlockedLevel && book.level === justUnlockedLevel;
        if (row === 'upper' || unlocking) addSeal(b);
        if (unlocking) {
          // 刚解封：先待在回廊那一排的高度，蜡封脱落后落到下排自己的位置
          b.unsealAt = 1.5 + k * 0.4;
          b.root.position.y = SHELF.rows.upper;
        }
        if (profile.finished.includes(book.id)) addBookmark(b);
        list.push(b);
      });
    }
  }
  return list;
}

// ---------------------------------------------------------------- 月球皮肤：书收进书柜（窗前留给风景）
// 月球图书馆的主角是窗外的置景，书不再漂在窗前挡视线，而是插在身后那段书柜里：
//   · 书脊朝外，印着书名；能读的书在视线高度那两层，封印的书在更高一层
//   · 魔法棒碰到 → 从书架上抽出一截 + 读出书名；点一下 → 从书架上取下来，飞到面前打开（沿用原来的开书动画）
// 同一本书可能在几个书区都出现过（"新书""正在读"和主题区），书柜里只放一本
const SHELF_BOOK_STEP = 0.074;              // 书柜里相邻两本真书的间距（米，沿书架弧线）
const SHELF_GROUP_GAP = 0.12;               // 不同主题之间空一截

function spineTexture(b) {
  const W = 96, H = 640;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const base = new THREE.Color(b.book.color);
  g.fillStyle = '#' + base.getHexString(); g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, 0, 6, H); g.fillRect(W - 6, 0, 6, H);   // 书脊两侧的圆角暗边
  g.fillStyle = '#e9cf86';                                                                 // 烫金横线（上下各两道）
  for (const y of [34, 44, H - 44, H - 34]) g.fillRect(10, y, W - 20, 3);
  // 书名：竖排，从上往下读（英文书脊的习惯；中文也这样排，孩子歪头就能读）
  g.save();
  g.translate(W / 2, H / 2); g.rotate(Math.PI / 2);
  g.fillStyle = '#f6e7c1'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const title = t(b.book.title);
  let size = 40;
  g.font = fontFor(lang, size);
  while (g.measureText(title).width > H - 150 && size > 18) { size -= 2; g.font = fontFor(lang, size); }
  g.fillText(title, 0, 0);
  g.restore();
  // 底部：封印的书画一把锁，能读的书画等级星星
  g.font = fontFor(lang, 34); g.textAlign = 'center'; g.fillStyle = '#e9cf86';
  g.fillText(b.seal ? '🔒' : '★'.repeat(Math.max(1, b.book.level || 1)), W / 2, H - 76);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function addSpineLabel(b) {
  const { W, H, T } = BOOK_SIZE;
  const tex = spineTexture(b);
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.45 });
  const label = new THREE.Mesh(new THREE.PlaneGeometry(T + 0.014, H * 0.98), mat);
  label.position.x = -W / 2 - 0.0045;
  label.rotation.y = -Math.PI / 2;                  // 面朝书的 -x（书脊那一侧）
  b.root.add(label);
  b.spineLabel = label;
}

let speakAt = 0;
function speakTitle(b) {                            // 魔法棒碰到书柜里的书：读出书名（浏览器自带的朗读）
  if (!window.speechSynthesis || performance.now() - speakAt < 700) return;
  speakAt = performance.now();
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(t(b.book.title));
  u.lang = lang === 'zh' ? 'zh-CN' : 'en-US';
  u.rate = 0.9;
  speechSynthesis.speak(u);
}

// 月球皮肤：书柜正对的是哪一面墙（书柜中心角度 ↔ 墙的中心角度，取最近的）
const angGap = (x, y) => Math.abs(Math.atan2(Math.sin(x - y), Math.cos(x - y)));
function shelfWall() {
  const S = moonSkin && moonSkin.shelves;
  if (!S) return null;
  const mid = (S.arc[0] + S.arc[1]) / 2;
  let best = 0;
  for (let i = 1; i < WALL_COUNT; i++) if (angGap(wallCenterAngle(i), mid) < angGap(wallCenterAngle(best), mid)) best = i;
  return best;
}
// 点到书柜边上的墙，也算"走近书柜"（书柜比一面墙宽）
function shelfWallFor(i) {
  const S = skinId === 'moon' && moonSkin && moonSkin.shelves;
  if (!S) return i;
  const mid = (S.arc[0] + S.arc[1]) / 2, half = (S.arc[1] - S.arc[0]) / 2;
  return angGap(wallCenterAngle(i), mid) < half + 0.35 ? shelfWall() : i;
}

function shelveBooks(on) {
  const S = on && moonSkin && moonSkin.shelves;
  if (!S) {                                         // 回到经典书房：书回到各自漂浮的位置
    for (const b of floating) {
      if (b.floatHome) { b.home = b.floatHome; b.homeQuat = b.floatQuat; }
      b.shelved = false;
      b.root.visible = true;
      if (b.spineLabel) b.spineLabel.visible = false;
    }
    return;
  }
  // 每本书只放一本：新手引导那本优先，其余取第一次出现的
  const chosen = new Map();
  if (welcome) chosen.set(welcome.book.id, welcome);
  for (const b of floating) if (!chosen.has(b.book.id)) chosen.set(b.book.id, b);
  // 按主题分组（主题顺序 = 书区顺序），组之间留空；能读的、封印的分开放
  const themeOrder = data.sections.map(x => x.id);
  const list = [...chosen.values()].sort((x, y) => themeOrder.indexOf(x.book.theme) - themeOrder.indexOf(y.book.theme) || data.books.indexOf(x.book) - data.books.indexOf(y.book));
  const { W, H } = BOOK_SIZE;
  const rc = S.R - 0.02 - W / 2;                    // 书中心离圆心的距离：书脊和隔板前沿齐平
  const mid = (S.arc[0] + S.arc[1]) / 2, span = (S.arc[1] - S.arc[0]) * rc - 0.2;
  const reserved = [];
  const place = (books, shelves) => {
    // 先排成一行（米为单位，含主题之间的空隙），再按书架长度分到几层；每层居中
    const rows = [[]];
    let used = 0, lastTheme = null;
    for (const b of books) {
      const need = SHELF_BOOK_STEP + (lastTheme && b.book.theme !== lastTheme ? SHELF_GROUP_GAP : 0);
      if (used + need > span && rows.length < shelves.length) { rows.push([]); used = 0; lastTheme = null; }
      const gap = lastTheme && b.book.theme !== lastTheme ? SHELF_GROUP_GAP : 0;
      rows[rows.length - 1].push({ b, x: used + gap });
      used += SHELF_BOOK_STEP + gap; lastTheme = b.book.theme;
    }
    rows.forEach((row, r) => {
      if (!row.length) return;
      const shelf = shelves[r], y = S.ys[shelf] + 0.028 + H / 2 + 0.002;
      const width = row[row.length - 1].x;
      for (const { b, x } of row) {
        const a = mid + (x - width / 2) / rc;
        const out = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));            // 朝外（指向玻璃/书柜背板）
        b.floatHome = b.floatHome || b.home; b.floatQuat = b.floatQuat || b.homeQuat;
        b.home = out.clone().multiplyScalar(rc).setY(y);
        // 书的坐标系：x = 朝外（书脊在 -x，于是朝向屋里）、y = 上、z = x × y
        b.homeQuat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(out, yAxis, new THREE.Vector3().crossVectors(out, yAxis)));
        b.inward = out.clone().negate();
        b.shelved = true;
        b.root.visible = true;
        if (!b.spineLabel) addSpineLabel(b);
        b.spineLabel.visible = true;
        reserved.push({ shelf, a, half: (SHELF_BOOK_STEP / 2) / rc });
      }
    });
  };
  const open = list.filter(b => !b.seal), locked = list.filter(b => b.seal);
  place(open, S.readable);
  place(locked, S.locked);
  for (const b of floating) if (!b.shelved || ![...chosen.values()].includes(b)) { b.shelved = false; b.root.visible = false; }
  S.setReserved(reserved);                          // 装饰书给真书让位
}

/** 点墙：镜头走近这面墙；这面墙的书转过来正对走近后的镜头。 */
function focusSpot(i) {
  const step = skinId === 'moon' && i === shelfWall() ? 0.85 : SHELF.focusStep;   // 月球书柜：走得更近，看得清书脊上的字
  const spot = wallDirection(i).multiplyScalar(step).setY(data.room.eyeHeight);
  floating.filter(b => b.wall === i).forEach(b => {
    tmpObj.position.copy(b.home);
    tmpObj.lookAt(spot.x, b.home.y, spot.z);
    b.focusQuat = tmpObj.quaternion.clone();
  });
  return spot;
}

// ---------------------------------------------------------------- 镜头移动 & 聚拢 / 散开
const view = { yaw: 0, pitch: 0.05, zoom: 1, zoomTarget: 1 };
// 缩放 = 改镜头视野角度（像相机变焦）：zoom < 1 拉近，> 1 拉远。镜头不移动，所以不会穿过书或墙
const ZOOM_MIN = 0.55, ZOOM_MAX = 1.25;
let baseFov = 68;
function zoomTo(z) { view.zoomTarget = THREE.MathUtils.clamp(z, ZOOM_MIN, ZOOM_MAX); look.lastInput = performance.now(); }
let move = null;

function moveCamera(toPos, toYaw, toPitch, dur, done) {
  let dy = toYaw - view.yaw;
  dy = Math.atan2(Math.sin(dy), Math.cos(dy));       // 走最短的转向
  move = { fromPos: camera.position.clone(), toPos, fromYaw: view.yaw, toYaw: view.yaw + dy, fromPitch: view.pitch, toPitch, t: 0, dur, done };
}

function focusOn(i) {
  const section = data.sections.find(s => s.wall === i + 1);
  focusWall = i;
  mode = 'moving';
  const spot = focusSpot(i);
  room.plaques.forEach(p => { p.visible = false; });
  $('#back').hidden = false;
  $('#section-title').textContent = t(section.name);
  // 书区名由缎带显示（renderWallName）
  moveCamera(spot, yawForWall(i), 0.1, 0.9, () => {
    mode = 'focus';
    const empty = !floating.some(b => b.wall === i);
    setHint(() => t(empty ? (section.id === 'reading' ? hints.emptyReading : hints.emptyShelf) : hints.shelf));
  });
}

function unfocus() {
  if (mode !== 'focus') return;
  mode = 'moving';
  focusWall = null;
  $('#back').hidden = true;
  $('#section-title').hidden = true;
  moveCamera(new THREE.Vector3(0, data.room.eyeHeight, 0), view.yaw, 0.05, 0.8, () => {
    mode = 'room';
    setHint(roomHint);
  });
}

function roomHint() {
  if (!profile.visited) return t(hints.seek);
  const current = data.books.find(b => b.id === profile.current);
  return current ? t(hints.continue).replace('{title}', t(current.title)) : t(hints.welcomeBack);
}

// ---------------------------------------------------------------- 魔法棒：杖尖光源
// 杖尖带着一盏暖金色的灯：书（受光材质）会被照亮；墙是画出来的不受光，
// 所以另外在墙上放一圈跟着移动的光晕，看起来像举着魔法棒照亮书架。
const wand = createWand($('#sparkles'));
const wandNdc = new THREE.Vector2();
let wandActive = false;
const wandLight = new THREE.PointLight(0xffe2a8, 0, 1.6, 1.6);
scene.add(wandLight);
const wandPool = glowSprite(THEME.amber, 0, 0.95);
scene.add(wandPool);
const wandRay = new THREE.Raycaster();

let hovered = null;                         // 魔法棒此刻碰到的书
let plaqueHover = false;                    // 魔法棒此刻指着铜牌
const wandScreen = { x: 0, y: 0 };
let lastTouchChime = 0;

function trackWand(e) {
  wandScreen.x = e.clientX; wandScreen.y = e.clientY;
  const rect = canvas.getBoundingClientRect();
  wandNdc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  wandActive = true;
  wand.trail(e.clientX, e.clientY);
}
window.addEventListener('pointermove', trackWand);
window.addEventListener('pointerdown', trackWand);
document.addEventListener('pointerleave', () => { wandActive = false; wand.lift(); });
window.addEventListener('blur', () => { wandActive = false; wand.lift(); });

function updateWandLight(dt) {
  const on = wandActive && (mode === 'room' || mode === 'focus');
  const k = 1 - Math.exp(-dt * 8);
  wandLight.intensity += ((on ? 2.6 : 0) - wandLight.intensity) * k;
  wandPool.material.opacity += ((on ? 0.3 : 0) - wandPool.material.opacity) * k;
  if (!on) return;
  wandRay.setFromCamera(wandNdc, camera);
  const { origin: o, direction: d } = wandRay.ray;
  wandLight.position.copy(o).addScaledVector(d, 0.9);
  // 光晕落在墙上：射线和圆柱墙面求交（只看水平方向）
  const a = d.x * d.x + d.z * d.z, b = 2 * (o.x * d.x + o.z * d.z), c = o.x * o.x + o.z * o.z - room.radius * room.radius;
  const tWall = a > 1e-6 ? (-b + Math.sqrt(Math.max(0, b * b - 4 * a * c))) / (2 * a) : 3;
  wandPool.position.copy(o).addScaledVector(d, Math.min(tWall, 4) - 0.08);
}

/** 魔法棒碰到了哪本书（每帧算，因为镜头在动时书也会"滑到"杖尖下面）。 */
function updateHover() {
  let next = null;
  if (wandActive && (mode === 'room' || mode === 'focus')) {
    wandRay.setFromCamera(wandNdc, camera);
    let best = Infinity;
    for (const b of floating) {
      if (!['float', 'hiding'].includes(b.state) || !b.root.visible) continue;
      const hit = wandRay.intersectObject(b.root, true).find(h => h.object.type === 'Mesh');
      if (hit && hit.distance < best) { best = hit.distance; next = b; }
    }
  }
  if (next !== hovered) {
    hovered = next;
    if (hovered) {
      // 碰到一本新书：一小撮仙尘 + 很轻的一声（限制频率，扫过一排书时不会吵）
      wand.burst(wandScreen.x, wandScreen.y, 8);
      const now = performance.now();
      if (now - lastTouchChime > 160) { if (hovered.seal) chime([660], 0.025); else moodSound(hovered.book.mood); lastTouchChime = now; }
    }
  }
  canvas.classList.toggle('over-book', !!hovered || plaqueHover);

  // 书区名缎带：聚拢时显示那面墙；魔法棒指着别的墙时临时显示那面；平时显示正对着的墙
  let wall = null;
  if (focusWall !== null) wall = focusWall;
  else if (mode === 'room') {
    if (!hovered && wandActive) {
      const hit = wandRay.intersectObjects(room.wallMeshes, false)[0];
      if (hit) wall = hit.object.userData.wallIndex;
    }
    if (wall === null) wall = facingWall();
  }
  if (wall !== hoveredWall) {
    hoveredWall = wall;
    renderWallName();
  }
}

/** 把缎带换成这面墙的书区：图标 + 名字 + 主题色。 */
function renderWallName() {
  const el = $('#wall-name');
  if (hoveredWall === null) { el.classList.remove('show'); return; }
  const section = data.sections.find(s => s.wall === hoveredWall + 1);
  const icon = document.createElement('span');
  icon.className = 'icon';
  icon.textContent = section.icon;
  const text = document.createElement('span');
  text.textContent = t(section.name);
  const icon2 = icon.cloneNode(true);
  el.replaceChildren(icon, text, icon2);
  el.style.setProperty('--section-color', section.color);
  el.classList.add('show');
}
let hoveredWall = null;

// ---------------------------------------------------------------- 输入：拖动 / 点击 / 滑动
const look = { vYaw: 0, vPitch: 0, pressed: false, x: 0, y: 0, startX: 0, moved: 0, downAt: 0, lastInput: performance.now() };
const PITCH_MIN = -0.55, PITCH_MAX = 1.1;

const pointers = new Map();                  // 当前按在屏幕上的手指 / 鼠标：id → {x, y}
let pinch = null;                            // 双指捏合：{ dist0, zoom0 }
const pointerDistance = () => { const [a, b] = [...pointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };

canvas.addEventListener('pointerdown', e => {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  if (pointers.size === 2) {
    // 第二根手指落下：从"拖动"切换成"捏合缩放"，这次手势不再算点击或转头
    pinch = { dist0: pointerDistance(), zoom0: view.zoomTarget };
    look.moved = 999;
    return;
  }
  look.pressed = true;
  look.x = look.startX = e.clientX; look.y = e.clientY; look.moved = 0;
  look.downAt = performance.now();
  canvas.classList.add('dragging');
});
canvas.addEventListener('pointermove', e => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && pointers.size >= 2) {
    // 两指张开 → 拉近（zoom 变小）；两指并拢 → 拉远
    zoomTo(pinch.zoom0 * pinch.dist0 / Math.max(20, pointerDistance()));
    return;
  }
  if (!look.pressed) { hover(e); return; }
  const dx = e.clientX - look.x, dy = e.clientY - look.y;
  look.x = e.clientX; look.y = e.clientY; look.moved += Math.abs(dx) + Math.abs(dy);
  look.lastInput = performance.now();
  if (mode !== 'room') return;              // 聚拢模式里不转头，拖动留给"滑到隔壁墙"
  // 拉近时转头也放慢，手感和画面一致
  look.vYaw = dx * 0.0042 * view.zoom; look.vPitch = dy * 0.0035 * view.zoom;
  view.yaw += look.vYaw;
  view.pitch = THREE.MathUtils.clamp(view.pitch + look.vPitch, PITCH_MIN, PITCH_MAX);
});
function releasePointer(e) {
  pointers.delete(e.pointerId);
  if (pinch && pointers.size < 2) {
    pinch = null;
    look.pressed = false;                     // 捏合结束：剩下那根手指也不接着转头，避免画面突然一跳
    canvas.classList.remove('dragging');
    return true;
  }
  return false;
}
canvas.addEventListener('pointercancel', releasePointer);
canvas.addEventListener('pointerup', e => {
  if (releasePointer(e)) return;
  if (!look.pressed) return;                // 只处理从画布上按下的那一次（避免拖动被误判成点击）
  look.pressed = false;
  canvas.classList.remove('dragging');
  if (look.moved < 6 && performance.now() - look.downAt < 500) { tap(e); return; }
  const swipe = e.clientX - look.startX;
  if (mode === 'focus' && Math.abs(swipe) > 60) {
    // 向左滑 = 去右边那面墙
    const next = (focusWall + (swipe < 0 ? 1 : -1) + WALL_COUNT) % WALL_COUNT;
    mode = 'room';                          // 让 focusOn 从当前状态开始
    focusOn(next);
  }
});
canvas.addEventListener('wheel', e => {
  // Mac 触控板双指捏合 = 带 ctrlKey 的 wheel 事件：拦下来做缩放（否则浏览器会放大整个网页）
  if (e.ctrlKey) {
    e.preventDefault();
    zoomTo(view.zoomTarget * Math.exp(e.deltaY * 0.01));
    return;
  }
  if (mode !== 'room') return;
  view.pitch = THREE.MathUtils.clamp(view.pitch - Math.sign(e.deltaY) * 0.08, PITCH_MIN, PITCH_MAX);
  look.lastInput = performance.now();
}, { passive: false });

$('#back').addEventListener('click', unfocus);

/** 当前正对的是第几面墙（按镜头朝向就近取整）。 */
function facingWall() {
  const steps = Math.round(-view.yaw / room.arc);            // yawForWall(i) = -(i - front) * arc
  return (((room.front + steps) % WALL_COUNT) + WALL_COUNT) % WALL_COUNT;
}

/** dir = +1 向右，-1 向左。 */
function turn(dir) {
  look.lastInput = performance.now();
  if (mode === 'focus') { mode = 'room'; focusOn((focusWall + dir + WALL_COUNT) % WALL_COUNT); return; }
  if (mode !== 'room') return;
  look.vYaw = 0; look.vPitch = 0;
  const target = (facingWall() + dir + WALL_COUNT) % WALL_COUNT;
  mode = 'moving';
  moveCamera(camera.position.clone(), yawForWall(target), view.pitch, 0.7, () => { mode = 'room'; });
}
$('#turn-left').addEventListener('click', () => turn(-1));
$('#turn-right').addEventListener('click', () => turn(1));
window.addEventListener('keydown', e => {
  if (e.key === 'Escape') unfocus();
  if (e.key === 'ArrowLeft') turn(-1);
  if (e.key === 'ArrowRight') turn(1);
  if (e.key === '+' || e.key === '=') zoomTo(view.zoomTarget * 0.9);
  if (e.key === '-' || e.key === '_') zoomTo(view.zoomTarget / 0.9);
  // 开发/家长调试：L = 切换级别，R = 清空进度（都会刷新页面）
  if (e.key === 'l' || e.key === 'L') { setLevel((profile.level % data.rules.maxLevel) + 1); location.reload(); }
  if (e.key === 'r' || e.key === 'R') { resetProfile(); location.reload(); }
});

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function pick(e) {
  const rect = canvas.getBoundingClientRect();
  pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  // 书优先：取离镜头最近的那本
  let best = null;
  for (const b of floating) {
    if (!b.root.visible) continue;
    const hit = raycaster.intersectObject(b.root, true).find(h => h.object.type === 'Mesh');
    if (hit && (!best || hit.distance < best.distance)) best = { book: b, distance: hit.distance };
  }
  if (best) return best;
  const ink = raycaster.intersectObjects(secrets.filter(x => x.reveal > 0.45).map(x => x.mesh), false)[0];
  if (ink) return { secret: secrets.find(x => x.mesh === ink.object) };
  if (mode === 'room') {
    const hit = raycaster.intersectObjects([...room.plaques, ...room.wallMeshes], false)[0];
    if (hit) return { wall: hit.object.userData.wallIndex, plaque: hit.object.isSprite };
  }
  return null;
}

function hover(e) {
  // 书的触碰在 updateHover() 里每帧算；这里只管铜牌
  const hit = mode === 'room' ? pick(e) : null;
  plaqueHover = !!hit && !!hit.plaque;
}

function tap(e) {
  wand.burst(e.clientX, e.clientY);
  if (mode !== 'room' && mode !== 'focus') return;
  const hit = pick(e);
  if (!hit) return;
  if (hit.secret) { findSecret(hit.secret, e); return; }
  if (hit.wall !== undefined) { focusOn(shelfWallFor(hit.wall)); return; }
  const b = hit.book;
  if (b.seal) { wiggle(b); toast(t(hints.sealed)); return; }
  if (!b.book.href) { wiggle(b); toast(t(hints.unwritten)); return; }
  openBook(b);
}

// ---------------------------------------------------------------- 提示 & 声音
let currentHint = () => '';                  // 当前提示（函数形式：切换语言时重新取一次）
let hintTimer = 0;
function setHint(getText) {
  currentHint = getText;
  const el = $('#hint');
  el.style.opacity = 0;
  clearTimeout(hintTimer);
  setTimeout(() => { el.textContent = currentHint(); el.style.opacity = 1; }, 350);
  // 7 秒后淡出：提示只在需要时出现，不常驻画面
  hintTimer = setTimeout(() => { el.style.opacity = 0; }, 7350);
}

let toastTimer = 0;
function toast(text, ms = 2600) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

const chime = (() => {
  let ctx = null;
  // 默认一串上行的铃音：C6 E6 G6 C7，像仙尘撒下来
  return (notes = [1046.5, 1318.5, 1568, 2093], volume = 0.08) => {
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      notes.forEach((freq, i) => {
        const t0 = ctx.currentTime + i * 0.09;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.2);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t0); osc.stop(t0 + 1.3);
      });
    } catch { /* 没有声音也不影响使用 */ }
  };
})();

// ---------------------------------------------------------------- 书的动画
const tmpObj = new THREE.Object3D();
const tmpVec = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const yAxis = new THREE.Vector3(0, 1, 0);
const spinQuat = new THREE.Quaternion();
const zAxis = new THREE.Vector3(0, 0, 1);
const projected = new THREE.Vector3();
const easeInOut = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

const SEEK_AFTER = 12;     // 秒：新手引导里这么久还没找到，书就自己飞过来
const DWELL = 0.4;         // 秒：书在画面中央停留这么久才算"找到"

function wiggle(b) { b.wiggleT = 0; chime([392, 330], 0.04); }

function openBook(b) {
  mode = 'opening';
  b.state = 'flying'; b.t = 0;
  b.fromPos = b.root.position.clone();
  b.fromQuat = b.root.quaternion.clone();
  b.fromScale = b.root.scale.x;
  $('#hint').style.opacity = 0;
  $('#back').hidden = true;
  markOpened(b.book.id);
  music.stop(2);
  chime();
}

function inView(b) {
  projected.copy(b.root.position).project(camera);
  return projected.z < 1 && Math.abs(projected.x) < 0.4 && Math.abs(projected.y) < 0.7;
}

/** 新手引导：书被找到 → 画个小圈打招呼。 */
function startGreeting(b) {
  b.state = 'greeting'; b.t = 0;
  chime([1568, 2093], 0.05);
  if (mode === 'room' && !b.presenting) setHint(() => t(hints.found));   // 书墙聚拢时不打断书墙提示
}

/** 新手引导：太久没找到 → 书飞到孩子正对的方向。 */
function startSeeking(b) {
  b.state = 'seeking'; b.t = 0;
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  forward.y = 0; forward.normalize();
  b.visit = forward.multiplyScalar(1.1).setY(camera.position.y + 0.1);
  tmpObj.position.copy(b.visit);
  tmpObj.lookAt(camera.position.x, b.visit.y, camera.position.z);
  b.visitQuat = tmpObj.quaternion.clone();
}

/**
 * 每帧：先算"这本书此刻该在哪、朝哪"（目标），再平滑地跟过去。
 * 漂浮 / 聚拢 / 散开都只是目标不同，所以切换时永远是顺滑的。
 */
function updateBook(b, dt, time) {
  b.t += dt;

  // --- 开书：完全接管位置
  if (b.state === 'flying') {
    const k = easeInOut(Math.min(b.t / 1.1, 1));
    const target = tmpVec.set(0, 0, -0.5).applyQuaternion(camera.quaternion).add(camera.position);
    tmpObj.position.copy(target);
    tmpObj.lookAt(camera.position);
    b.root.position.lerpVectors(b.fromPos, target, k);
    b.root.quaternion.slerpQuaternions(b.fromQuat, tmpObj.quaternion, k);
    b.root.scale.setScalar(b.fromScale + (1.4 - b.fromScale) * k);   // 飞到面前时放大，像被捧在手里
    if (k >= 1) { b.state = 'opening'; b.t = 0; }
    return;
  }
  if (b.state === 'opening') {
    const k = easeInOut(Math.min(b.t / 1.1, 1));
    b.hinge.rotation.y = -2.5 * k;
    b.pageGlow.material.opacity = k;
    b.pageGlow.scale.setScalar(BOOK_SIZE.W * (2.8 + k * 5));
    if (k >= 1) {
      b.state = 'entering';
      veil.classList.remove('hidden');
      veil.classList.add('to-book');
      $('#veil-text').textContent = '';
      setTimeout(() => { location.href = b.book.href; }, 900);
    }
    return;
  }
  if (b.state === 'entering') return;

  // --- 新手引导的状态切换
  if (b.state === 'hiding') {
    b.seen = (mode === 'room' && inView(b)) ? (b.seen || 0) + dt : 0;
    if (b.seen > DWELL) startGreeting(b);
    else if (b.t > SEEK_AFTER && mode === 'room') startSeeking(b);
  } else if (b.state === 'seeking' && b.root.position.distanceTo(b.visit) < 0.03) {
    startGreeting(b);
  } else if (b.state === 'greeting' && b.t > 1.6) {
    b.state = 'float';
    b.t = 0;
    if (!b.presenting) b.visit = null;       // 打完招呼，回到书架上自己的位置（被猫头鹰叫来的书先留着）
  } else if (b.presenting && b.state === 'float' && b.t > 10) {
    b.presenting = false;                    // 10 秒没点：飞回书架
    b.visit = null;
  }

  // --- 刚升级：蜡封脱落，书从回廊落到低处
  if (b.unsealAt !== undefined && b.seal && b.t > b.unsealAt) {
    const k = Math.min((b.t - b.unsealAt) / 0.8, 1);
    b.seal.position.y = -k * 0.25;
    b.seal.traverse(o => { if (o.material) { o.material.transparent = true; o.material.opacity = 1 - k; } });
    if (k >= 1) {
      b.root.remove(b.seal); b.seal = null;
      b.halo.material.color.setHex(THEME.amber);
      chime([1318.5, 1568, 2093], 0.05);
    }
  }

  // --- 书柜里的书（月球皮肤）：插在架子上不动；碰到就抽出一截，封印的只是轻轻晃一下
  if (b.shelved && !b.visit) {
    const touched = b === hovered;
    b.touchT = touched ? (b.touchT || 0) + dt : 0;
    if (touched && b.touchT === dt && !b.seal) speakTitle(b);
    const pos = tmpVec.copy(b.home).addScaledVector(b.inward, touched ? (b.seal ? 0.025 : 0.1) : 0);
    const quat = tmpQuat.copy(b.homeQuat);
    if (touched && b.seal) quat.multiply(new THREE.Quaternion().setFromAxisAngle(xAxisV, Math.sin(b.touchT * 18) * 0.05 * Math.max(0, 1 - b.touchT / 1.2)));
    if (b.wiggleT !== undefined) {
      b.wiggleT += dt;
      quat.multiply(new THREE.Quaternion().setFromAxisAngle(xAxisV, Math.sin(b.wiggleT * 30) * 0.08 * Math.max(0, 1 - b.wiggleT / 0.5)));
      if (b.wiggleT > 0.5) b.wiggleT = undefined;
    }
    const follow = 1 - Math.exp(-dt * 9);
    b.root.position.lerp(pos, follow);
    b.root.quaternion.slerp(quat, follow);
    b.root.scale.setScalar(b.root.scale.x + (1 - b.root.scale.x) * follow);
    b.halo.material.opacity += ((touched ? 0.35 : 0) - b.halo.material.opacity) * follow;
    b.spineLabel.material.emissiveIntensity += ((touched ? 1.1 : 0.45) - b.spineLabel.material.emissiveIntensity) * follow;
    if (b.sealMotes) b.sealMotes.forEach(({ m }) => { m.visible = false; });
    b.pageGlow.material.opacity *= 0.9;
    return;
  }

  // --- 目标位置、朝向、大小：平时静止在书架上，魔法棒碰到才"醒过来"
  const focused = focusWall === b.wall && b.focusQuat;
  const targetPos = tmpVec.copy(b.visit || b.home);
  const targetQuat = tmpQuat.copy(b.visit ? b.visitQuat : focused ? b.focusQuat : b.homeQuat);
  let targetScale = b.baseScale;
  if (b.seal && b.unsealAt !== undefined && !(b.t > b.unsealAt + 0.8)) targetPos.y = SHELF.rows.upper;
  const touched = b === hovered;
  b.touchT = touched ? (b.touchT || 0) + dt : 0;
  let moodHinge = 0;
  // 呼吸波：同一排的书按位次依次轻轻浮起、落下，像一道波慢慢传过去（整齐，不乱跳）
  const wave = Math.sin(time * GRAV.bobSpeed - (b.slot || 0) * 0.7 - b.wall * 1.3);
  if (!touched && !b.visit) targetPos.y += wave * GRAV.bobAmp;
  if (!touched && !b.visit && GRAV.spin) {            // 低重力：书在原地慢慢地转一点点，像在失重里漂
    targetQuat.multiply(spinQuat.setFromAxisAngle(yAxis, Math.sin(time * 0.35 + (b.slot || 0) * 1.7 + b.wall) * GRAV.spin));
  }
  if (touched && !b.seal) {
    // 往镜头方向探出一点，转过来正对你，稍微放大；然后按性格加戏
    const toCam = camera.position.clone().sub(targetPos).normalize();
    const side = new THREE.Vector3().crossVectors(yAxis, toCam).normalize();
    const facing = targetPos.clone().addScaledVector(toCam, HOVER.pull);
    tmpObj.position.copy(facing);
    tmpObj.lookAt(camera.position);
    targetQuat.copy(tmpObj.quaternion);
    const mood = applyMood(b, b.touchT, dt, targetPos, targetQuat, toCam, side);
    targetPos.addScaledVector(toCam, HOVER.pull * mood.pullScale);
    moodHinge = mood.hinge;
    targetScale = b.baseScale * HOVER.scale;
  } else if (touched && b.seal) {
    // 封印的书被碰到：拽拽丝带，像是想出来
    targetQuat.multiply(new THREE.Quaternion().setFromAxisAngle(zAxis, Math.sin(b.touchT * 18) * 0.06 * Math.max(0, 1 - b.touchT / 1.2)));
  }
  if (!touched && !b.seal && b.state === 'float') b.halo.material.color.setHex(THEME.amber);
  if (['float', 'hiding', 'seeking', 'greeting'].includes(b.state)) {
    b.hinge.rotation.y += (moodHinge - b.hinge.rotation.y) * Math.min(1, dt * 8);   // 封面开合（哈欠 / 炫耀）
    if (!touched || b.book.mood !== 'proud') b.pageGlow.material.opacity *= 0.9;
  }
  if (b.state === 'greeting') {
    // 打招呼：画一个小圆圈 + 自转一圈
    const e = easeInOut(Math.min(b.t / 1.6, 1));
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    targetPos.addScaledVector(right, Math.sin(e * Math.PI * 2) * 0.16);
    targetPos.y += (1 - Math.cos(e * Math.PI * 2)) * 0.08;
    targetQuat.multiply(new THREE.Quaternion().setFromAxisAngle(yAxis, e * Math.PI * 2));
  }
  if (b.wiggleT !== undefined) {
    b.wiggleT += dt;
    targetQuat.multiply(new THREE.Quaternion().setFromAxisAngle(zAxis, Math.sin(b.wiggleT * 30) * 0.14 * Math.max(0, 1 - b.wiggleT / 0.5)));
    if (b.wiggleT > 0.5) b.wiggleT = undefined;
  }

  const instant = b.state === 'greeting' || b.wiggleT !== undefined;
  const follow = instant ? 1 : 1 - Math.exp(-dt * (b.state === 'seeking' ? 1.6 : FOLLOW));
  b.root.position.lerp(targetPos, follow);
  b.root.quaternion.slerp(targetQuat, follow);
  b.root.scale.setScalar(b.root.scale.x + (targetScale - b.root.scale.x) * follow);

  // --- 光：平时是安静的暖光；碰到时亮起来；新手引导那本一直在呼吸（它要被找到）
  const glowTarget =
    b === welcome && ['hiding', 'seeking', 'greeting'].includes(b.state) ? 0.75 + Math.sin(time * 2.2) * 0.2
    : touched ? (b.seal ? 0.6 : 0.95)
    : b.isCurrent ? 0.5
    : b.seal ? 0.18 : 0.26;
  b.halo.material.opacity += (glowTarget - b.halo.material.opacity) * follow;
  const lit = touched && !b.seal ? 1.0 : 0.6 + wave * 0.05;       // 封面亮度也跟着呼吸
  b.coverMat.emissiveIntensity += (lit - b.coverMat.emissiveIntensity) * follow;

  // 烫金闪光：0.7 秒内星芒放大、旋转、消失
  if (b.glintAt !== undefined) {
    const k = (time - b.glintAt) / 0.7;
    if (k >= 1) { b.glintAt = undefined; b.glint.material.opacity = 0; b.glint.scale.setScalar(0.001); }
    else {
      const bell = Math.sin(k * Math.PI);
      b.glint.material.opacity = bell;
      b.glint.scale.setScalar(0.02 + bell * 0.1);
      b.glint.material.rotation = k * 1.2;
    }
  }
  // 封印光点绕圈
  if (b.sealMotes && b.seal) {
    b.sealMotes.forEach(({ m, offset }) => {
      const a = time * 1.1 + offset + b.phase;
      m.position.set(Math.cos(a) * BOOK_SIZE.W * 0.7, Math.sin(a * 0.8) * BOOK_SIZE.H * 0.45, Math.sin(a) * 0.05 + 0.03);
      m.material.opacity = 0.45 + Math.sin(a * 2) * 0.25;
    });
  } else if (b.sealMotes) {
    b.sealMotes.forEach(({ m }) => { m.visible = false; });           // 解封后光点消失
  }
}

// ---------------------------------------------------------------- 隐形墨水：只有被魔法棒的光照到才显形的秘密
// 每面墙藏一句话（library.json 的 secrets）。光圈离得越近越清楚；显形时点一下 = 找到一个秘密。
let secrets = [];

function inkTexture(secret) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  const g = c.getContext('2d');
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = 'rgba(120, 230, 255, 0.95)'; g.shadowBlur = 18;
  g.font = '96px "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  g.fillText(secret.icon, 512, 64);
  // 墨水字：青金色，发光的手写感（中文用楷体更像手写）
  g.font = lang === 'zh' ? 'bold 78px "Kaiti SC", "STKaiti", "Songti SC", serif' : `italic 76px ${TITLE_FONT}`;
  const grad = g.createLinearGradient(200, 0, 824, 0);
  grad.addColorStop(0, '#9ff4ff'); grad.addColorStop(0.5, '#fff2b0'); grad.addColorStop(1, '#9ff4ff');
  g.fillStyle = grad;
  g.fillText(t(secret.text), 512, 186, 1000);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildSecrets() {
  const panelW = room.height * WALL_ASPECT;
  return (data.secrets || []).map(secret => {
    const i = secret.wall - 1;
    const angle = wallCenterAngle(i) + (0.5 - secret.u) * room.arc;
    const pos = pointAt(angle, room.radius - 0.03, (1 - secret.v) * room.height);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(panelW * 0.82, panelW * 0.205),
      new THREE.MeshBasicMaterial({ map: inkTexture(secret), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    mesh.position.copy(pos);
    mesh.lookAt(0, pos.y, 0);                 // 贴在墙上，朝向房间中央
    mesh.userData.secret = secret;
    scene.add(mesh);
    return { secret, mesh, pos, found: profile.secrets.includes(secret.id), reveal: 0 };
  });
}

/** 每帧：按魔法棒光圈离得多近，决定墨水显形多少；找到过的留一层淡淡的痕迹。 */
function updateSecrets(dt) {
  const lit = wandPool.material.opacity / 0.3;                // 光圈本身有多亮（0~1）
  for (const s of secrets) {
    const d = s.pos.distanceTo(wandPool.position);
    const target = Math.max(s.found ? 0.18 : 0, Math.pow(THREE.MathUtils.clamp(1 - d / 0.55, 0, 1), 1.4) * lit);
    s.reveal += (target - s.reveal) * Math.min(1, dt * 6);
    s.mesh.material.opacity = s.reveal;
  }
}

function findSecret(s, e) {
  if (s.found) return;
  s.found = true;
  const n = markSecret(s.secret.id);
  const total = secrets.length;
  wand.burst(e.clientX, e.clientY, 24);
  chime([1318.5, 1568, 2093, 2637], 0.06);
  toast(n >= total ? t(hints.secretAll) : t(hints.secretFound).replace('{n}', n).replace('{total}', total), 3200);
}

// ---------------------------------------------------------------- 猫头鹰找书（有求必应）
let owl = null;

/**
 * 挑书：同一个标签里，优先"能打开 > 等级够 > 还没读过"，再加一点随机，每次不完全一样。
 * 以后接 AI 推荐时，替换的就是这个函数。
 */
function owlPick(tag) {
  const pool = data.books.filter(b => tag === '*' || (b.tags || []).includes(tag));
  if (!pool.length) return null;
  const score = b => (b.href ? 4 : 0) + (isUnlocked(b) ? 2 : 0) + (profile.finished.includes(b.id) ? 0 : 1) + Math.random() * 0.8;
  const best = pool.slice().sort((a, b) => score(b) - score(a))[0];
  if (isUnlocked(best)) return { book: best, sealed: false };
  // 这一类都还封着：退而求其次，从所有能读的书里挑一本
  const readable = data.books.filter(isUnlocked).sort((a, b) => score(b) - score(a))[0];
  return readable ? { book: readable, sealed: true } : null;
}

/** 把挑中的书从书架上叫到面前：沿弧线飞过来、打个招呼、停着等孩子点；10 秒没点就飞回去。 */
function presentBook(book) {
  const b = floating.find(x => x.book.id === book.id && data.sections[x.wall].id === x.book.theme)
    || floating.find(x => x.book.id === book.id);
  if (!b) return;
  floating.forEach(x => { if (x.presenting && x !== b) { x.presenting = false; x.visit = null; } });
  const go = () => {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    forward.y = 0; forward.normalize();
    b.visit = camera.position.clone().addScaledVector(forward, 1.0).setY(camera.position.y + 0.05);
    tmpObj.position.copy(b.visit);
    tmpObj.lookAt(camera.position.x, b.visit.y, camera.position.z);
    b.visitQuat = tmpObj.quaternion.clone();
    b.presenting = true;
    b.state = 'seeking'; b.t = 0;
  };
  if (mode === 'focus') { unfocus(); setTimeout(go, 900); } else go();
}

function owlChoose(tag) {
  const pick = owlPick(tag);
  if (!pick) { owl.report(t(data.owl.none)); return; }
  const title = t(pick.book.title);
  const line = pick.sealed ? data.owl.sealedOnly : pick.book.href ? data.owl.found : data.owl.foundUnwritten;
  owl.report(t(line).replace('{title}', title));
  presentBook(pick.book);
}

// ---------------------------------------------------------------- 书的性格：魔法棒碰到时，每本书反应不一样
// 罗琳的魔法书有脾气（会咬人、会尖叫）；这里是儿童版：害羞、瞌睡、活泼、倔脾气、好奇、骄傲、摇摇晃晃。
// 性格写在 library.json 每本书的 mood 字段里。

/** 小粒子：瞌睡的 z、倔脾气的烟团、骄傲的金星。 */
const puffTextures = {};
function puffTexture(kind) {
  if (puffTextures[kind]) return puffTextures[kind];
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (kind === 'z') {
    g.fillStyle = '#e8e2ff'; g.font = 'bold 44px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = 'rgba(160,140,255,0.8)'; g.shadowBlur = 8;
    g.fillText('z', 32, 34);
  } else if (kind === 'smoke') {
    const r = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    r.addColorStop(0, 'rgba(210,205,220,0.9)'); r.addColorStop(1, 'rgba(160,150,170,0)');
    g.fillStyle = r; g.beginPath(); g.arc(32, 32, 30, 0, Math.PI * 2); g.fill();
  } else {
    g.fillStyle = '#ffe39a'; g.shadowColor = '#ffd060'; g.shadowBlur = 10;
    g.beginPath();
    for (let k = 0; k < 8; k++) { const rr = k % 2 ? 7 : 26, a = (k / 8) * Math.PI * 2 - Math.PI / 2; g[k ? 'lineTo' : 'moveTo'](32 + Math.cos(a) * rr, 32 + Math.sin(a) * rr); }
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return (puffTextures[kind] = t);
}
const puffs = [];
function puff(b, kind) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTexture(kind), transparent: true, depthWrite: false, blending: kind === 'smoke' ? THREE.NormalBlending : THREE.AdditiveBlending }));
  const top = b.root.position.clone();
  top.y += BOOK_SIZE.H * 0.55 * b.root.scale.x;
  sprite.position.copy(top).add(new THREE.Vector3((Math.random() - 0.5) * 0.08, 0, (Math.random() - 0.5) * 0.04));
  sprite.scale.setScalar(kind === 'z' ? 0.06 : kind === 'smoke' ? 0.08 : 0.05);
  scene.add(sprite);
  puffs.push({ sprite, kind, age: 0, life: kind === 'z' ? 1.6 : kind === 'smoke' ? 1.1 : 0.9, drift: (Math.random() - 0.5) * 0.08 });
}
function updatePuffs(dt) {
  for (let i = puffs.length - 1; i >= 0; i--) {
    const p = puffs[i];
    p.age += dt;
    const k = p.age / p.life;
    if (k >= 1) { scene.remove(p.sprite); p.sprite.material.dispose(); puffs.splice(i, 1); continue; }
    p.sprite.position.y += dt * (p.kind === 'z' ? 0.12 : 0.18);
    p.sprite.position.x += dt * p.drift;
    p.sprite.material.opacity = Math.sin(Math.min(1, k * 1.4) * Math.PI) * (p.kind === 'smoke' ? 0.7 : 1);
    p.sprite.scale.multiplyScalar(1 + dt * (p.kind === 'smoke' ? 0.9 : 0.2));
  }
}

/** 每种性格的专属声音（很轻，用振荡器的音高滑动做出来）。 */
function moodSound(mood) {
  const glide = (from, to, dur, type = 'sine', vol = 0.04, delay = 0) => {
    try {
      const ctx = moodSound.ctx = moodSound.ctx || new (window.AudioContext || window.webkitAudioContext)();
      const t = ctx.currentTime + delay;
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(from, t);
      osc.frequency.exponentialRampToValueAtTime(to, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g).connect(ctx.destination);
      osc.start(t); osc.stop(t + dur + 0.05);
    } catch { /* 没声音也不影响 */ }
  };
  ({
    shy: () => glide(1800, 2400, 0.12, 'sine', 0.03),                                 // 细细的"咿"
    sleepy: () => { glide(520, 260, 0.9, 'triangle', 0.035); },                         // 往下滑的哈欠
    bouncy: () => { glide(300, 900, 0.12, 'sine', 0.05); glide(300, 900, 0.12, 'sine', 0.04, 0.18); },   // 嘣嘣
    grumpy: () => glide(160, 110, 0.35, 'sawtooth', 0.02),                              // 闷哼
    curious: () => glide(700, 1100, 0.25, 'sine', 0.035),                               // "嗯？"往上挑
    proud: () => { [1046.5, 1318.5, 1568].forEach((f, i) => glide(f, f, 0.3, 'triangle', 0.03, i * 0.08)); },   // 小号角
    wobbly: () => { glide(500, 700, 0.15, 'sine', 0.03); glide(700, 450, 0.2, 'sine', 0.03, 0.15); glide(450, 600, 0.2, 'sine', 0.03, 0.35); }
  }[mood] || (() => glide(1568, 1568, 0.2, 'sine', 0.025)))();
}

/**
 * 被魔法棒碰着时，按性格改写这本书的目标位置 / 朝向 / 大小 / 封面开合。
 * tt = 碰到了多久（秒）；toCam = 指向镜头的方向；side = 沿书架的水平方向。
 * 返回 { pullScale, hinge }：往前探出的比例、封面张开的角度。
 */
function applyMood(b, tt, dt, targetPos, targetQuat, toCam, side) {
  const decay = Math.max(0, 1 - tt / 1.6);
  switch (b.book.mood) {
    case 'shy': {
      // 先躲：往旁边挪、扭过头；1.2 秒后才慢慢探过来偷看
      const brave = THREE.MathUtils.clamp((tt - 1.2) / 0.6, 0, 1);
      targetPos.addScaledVector(side, 0.15 * (1 - brave));
      targetQuat.multiply(new THREE.Quaternion().setFromAxisAngle(yAxis, 0.7 * (1 - brave)));
      b.halo.material.color.setHex(brave < 1 ? 0xffa0b8 : THEME.amber);        // 害羞时光晕是粉色
      return { pullScale: 0.25 + 0.75 * brave, hinge: 0 };
    }
    case 'sleepy': {
      // 慢吞吞探出一半；打个哈欠（封面张开又合上）；之后不停冒 z
      b.puffT = (b.puffT || 0) + dt;
      if (tt > 0.9 && b.puffT > 0.7) { puff(b, 'z'); b.puffT = 0; }
      targetQuat.multiply(new THREE.Quaternion().setFromAxisAngle(zAxis, Math.sin(tt * 1.5) * 0.06));   // 打瞌睡似的晃
      const yawn = tt < 1.4 ? Math.sin((tt / 1.4) * Math.PI) : 0;
      return { pullScale: 0.5, hinge: -0.55 * yawn };
    }
    case 'bouncy': {
      // 蹦两下 + 转半圈
      targetPos.y += Math.abs(Math.sin(tt * 9)) * 0.06 * decay;
      targetQuat.multiply(new THREE.Quaternion().setFromAxisAngle(yAxis, Math.min(tt / 0.6, 1) * Math.PI * 2 * (tt < 0.6 ? 1 : 1)));
      return { pullScale: 1, hinge: 0 };
    }
    case 'grumpy': {
      // 不肯往前，抖着冒烟
      b.puffT = (b.puffT || 0) + dt;
      if (b.puffT > 0.35 && tt < 2.5) { puff(b, 'smoke'); b.puffT = 0; }
      targetQuat.multiply(new THREE.Quaternion().setFromAxisAngle(zAxis, Math.sin(tt * 40) * 0.05 * Math.max(0.3, decay)));
      b.halo.material.color.setHex(0xff8a6a);
      return { pullScale: 0.15, hinge: 0 };
    }
    case 'curious': {
      // 凑得特别近，歪着头跟着魔法棒转
      targetQuat.multiply(new THREE.Quaternion().setFromAxisAngle(yAxis, -wandNdc.x * 0.35))
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), wandNdc.y * 0.25))
        .multiply(new THREE.Quaternion().setFromAxisAngle(zAxis, 0.18));
      return { pullScale: 1.6, hinge: 0 };
    }
    case 'proud': {
      // 把封面大大翻开，亮出书页里的金光，再合上；撒几颗金星
      const show = tt < 2 ? Math.sin(Math.min(tt / 2, 1) * Math.PI) : 0;
      b.pageGlow.material.opacity = show * 0.8;
      b.puffT = (b.puffT || 0) + dt;
      if (show > 0.5 && b.puffT > 0.25) { puff(b, 'star'); b.puffT = 0; }
      return { pullScale: 1, hinge: -1.3 * show };
    }
    case 'wobbly': {
      // 左右大幅摇晃，像要摔下来，最后稳住
      targetQuat.multiply(new THREE.Quaternion().setFromAxisAngle(zAxis, Math.sin(tt * 7) * 0.4 * Math.max(0, 1 - tt / 2)));
      targetPos.y -= Math.abs(Math.sin(tt * 7)) * 0.02 * decay;
      return { pullScale: 0.8, hinge: 0 };
    }
  }
  return { pullScale: 1, hinge: 0 };
}

// ---------------------------------------------------------------- 主循环
let candles = [], dust = null;
let debugTimeScale = 1;
const clock = new THREE.Clock();

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  baseFov = w < h ? 82 : 68;                 // 竖屏时视野加宽
  camera.fov = baseFov * view.zoom;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

function updateDust(dt, time) {
  const pos = dust.points.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let y = pos.getY(i) + dt * (0.04 + dust.seeds[i] * 0.06);
    if (y > room.height) y = 0;
    pos.setY(i, y);
    pos.setX(i, pos.getX(i) + Math.sin(time * 0.6 + dust.seeds[i] * 20) * dt * 0.02);
  }
  pos.needsUpdate = true;
  dust.points.material.opacity = 0.7 + Math.sin(time * 3) * 0.15;
}

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.1);
  const time = clock.elapsedTime;

  if (move) {
    move.t += dt;
    const k = easeInOut(Math.min(move.t / move.dur, 1));
    camera.position.lerpVectors(move.fromPos, move.toPos, k);
    view.yaw = move.fromYaw + (move.toYaw - move.fromYaw) * k;
    view.pitch = move.fromPitch + (move.toPitch - move.fromPitch) * k;
    if (k >= 1) { const done = move.done; move = null; done && done(); }
  } else if (mode === 'room' && !look.pressed) {
    // 松手后惯性衰减；6 秒没操作就缓慢自转
    look.vYaw *= 0.92; look.vPitch *= 0.9;
    view.yaw += look.vYaw;
    view.pitch = THREE.MathUtils.clamp(view.pitch + look.vPitch, PITCH_MIN, PITCH_MAX);
    if (performance.now() - look.lastInput > 6000) view.yaw += dt * 0.04;
  }
  camera.rotation.set(view.pitch, view.yaw, 0);
  // 缩放平滑过渡
  if (Math.abs(view.zoomTarget - view.zoom) > 0.001) {
    view.zoom += (view.zoomTarget - view.zoom) * (1 - Math.exp(-dt * 10));
    camera.fov = baseFov * view.zoom;
    camera.updateProjectionMatrix();
  }

  for (const c of candles) {
    c.group.position.y = c.baseY + Math.sin(time * c.speed + c.phase) * 0.04;
    c.flame.material.opacity = 0.8 + Math.sin(time * 11 + c.phase) * 0.12;
  }
  updateDust(dt, time);
  const sdt = dt * debugTimeScale;
  scheduleGlint(time);
  updatePuffs(dt);
  updateSecrets(dt);
  floating.forEach(b => updateBook(b, sdt, time));
  updateFire(dt, time);
  updateWandLight(dt);
  if (moonSkin && moonSkin.group.visible) moonSkin.update(time);
  updateHover();
  wand.update(dt);

  renderer.render(scene, camera);
}

// ---------------------------------------------------------------- 背景音乐
// 默认开；浏览器要求先有一次用户操作才能出声，所以在第一次点击/拖动时淡入。开关状态存在本机。
const music = createMusic();
const MUSIC_KEY = 'magic-library/music';
const musicWanted = () => { try { return localStorage.getItem(MUSIC_KEY) !== 'off'; } catch { return true; } };

function refreshMusicButton() {
  const btn = $('#music');
  btn.classList.toggle('off', !musicWanted());
  btn.setAttribute('aria-pressed', String(musicWanted()));
}

window.addEventListener('pointerdown', () => { if (musicWanted() && mode !== 'opening') music.start(); }, { once: true });

$('#music').addEventListener('click', e => {
  e.stopPropagation();
  const on = !musicWanted();
  try { localStorage.setItem(MUSIC_KEY, on ? 'on' : 'off'); } catch { /* ignore */ }
  if (on) music.start(); else music.stop();
  refreshMusicButton();
});

// ---------------------------------------------------------------- 等级选择
// 第一版还没有定级问卷，这里就是"手动定级"：家长或孩子直接选一个等级。
// 选完当场重排书架：≤ 所选等级的书到下排（能读），更高的到上排（封印）。
function renderLevelMenu() {
  $('#level-menu-title').textContent = t(data.ui.chooseLevel);
  $('#level-options').replaceChildren(...data.ui.levels.map((name, k) => {
    const level = k + 1;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'level-option' + (level === profile.level ? ' current' : '');
    const stars = document.createElement('span');
    stars.className = 'stars';
    stars.textContent = '✦'.repeat(level);
    const label = document.createElement('span');
    label.textContent = `${t(data.ui.level)} ${level} · ${t(name)}`;
    btn.append(stars, label);
    btn.addEventListener('click', () => chooseLevel(level));
    return btn;
  }));
}

function toggleLevelMenu(open) {
  const menu = $('#level-menu');
  const show = open ?? menu.hidden;
  if (show) renderLevelMenu();
  menu.hidden = !show;
  $('#level').setAttribute('aria-expanded', String(show));
}

function chooseLevel(level) {
  toggleLevelMenu(false);
  if (level === profile.level) return;
  setLevel(level);
  profile = loadProfile();
  // 把所有悬浮书拿掉，按新等级重新摆
  floating.forEach(b => scene.remove(b.root));
  hovered = null;
  welcome = null;
  floating = buildFloatingBooks();
  if (focusWall !== null) focusSpot(focusWall);
  applyStaticText();
  toast(t(hints.levelSet).replace('{level}', level));
  chime([1046.5, 1318.5, 1568], 0.05);
}

$('#level').addEventListener('click', e => { e.stopPropagation(); toggleLevelMenu(); });
window.addEventListener('pointerdown', e => {
  if (!$('#level-menu').hidden && !e.target.closest('#level-menu, #level')) toggleLevelMenu(false);
});

// ---------------------------------------------------------------- 语言切换
/** 网页上的固定文字（标题、按钮、级别徽章）。 */
function applyStaticText() {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  document.body.classList.toggle('lang-zh', lang === 'zh');
  document.title = t(data.title);
  $('#title').textContent = t(data.title);
  $('#tagline').textContent = t(data.tagline);
  $('#back').textContent = t(data.ui.back);
  $('#lang').textContent = t(data.ui.switchTo);
  $('#level').textContent = `${t(data.ui.level)} ${profile.level}`;
  if (focusWall !== null) $('#section-title').textContent = t(data.sections.find(s => s.wall === focusWall + 1).name);
}

function switchLanguage(next) {
  lang = next;
  setLang(next);
  applyStaticText();
  refreshMusicButton();
  if (!$('#level-menu').hidden) renderLevelMenu();
  renderWallName();
  // 铭牌和书封是画在贴图里的，要重画
  room.plaques.forEach(p => {
    p.material.map.dispose();
    p.material.map = plaqueTexture(t(p.userData.section.name));
    p.material.needsUpdate = true;
  });
  floating.forEach(b => {
    const tex = coverTexture(b.book);
    b.coverMat.map.dispose();
    b.coverMat.map = tex;
    b.coverMat.emissiveMap = tex;
    b.coverMat.needsUpdate = true;
  });
  owl && owl.refresh();
  secrets.forEach(x => { x.mesh.material.map.dispose(); x.mesh.material.map = inkTexture(x.secret); x.mesh.material.needsUpdate = true; });
  setHint(currentHint);
  chime([1568, 1318.5], 0.04);
}

// ---------------------------------------------------------------- 图书馆皮肤（读书挣来的世界，可随时切回）
// 皮肤只换"环境"：天花板、地面、光、蜡烛、壁炉、浮尘、重力、猫头鹰头盔；书架上的书和分区不变。
// 原型阶段先全部开放（PROTOTYPE_OPEN），正式版按 skins.js 里的 unlock 规则（读完某本书）解锁。
const PROTOTYPE_OPEN = true;
let moonSkin = null, skinId = 'classic';
const xAxisV = new THREE.Vector3(1, 0, 0);
const CLASSIC = {
  background: THEME.night, fog: [THEME.night, 1.6, 4],
  hemi: { sky: 0xffe2b8, ground: 0x2a1d3a, intensity: 0.7 },
  candle: THEME.amber, candleLight: THEME.amber,
  fire: [0xffc46b, 0xffa040, 0xffe3a0, 0xffa040, 0xffc46b], fireLight: 0xff8a3d,
  ember: [1, 0.55, 0.18], fireVolume: 1, dust: THEME.dust, wand: 0xffe2a8, wallDim: THEME.wallDim, gravity: GRAV_CLASSIC
};
const skinUnlocked = sk => PROTOTYPE_OPEN || !sk.unlock || profile.finished.includes(sk.unlock.book);

function applySkin(id) {
  skinId = id;
  const moon = id === 'moon';
  if (moon && !moonSkin) { moonSkin = buildMoonSkin(room); scene.add(moonSkin.group); }
  if (moonSkin) moonSkin.group.visible = moon;
  const L = moon ? moonSkin.look : CLASSIC;
  room.ceiling.visible = !moon;                        // 月球：天花板换成玻璃穹顶（穹顶在 moonSkin.group 里）
  room.ground.visible = !moon;
  room.wallMeshes.forEach(m => { m.material.color.setRGB(...L.wallDim); m.visible = !L.hideWalls; });
  scene.background = new THREE.Color(L.background);
  scene.fog = new THREE.Fog(L.fog[0], room.radius * L.fog[1], room.radius * L.fog[2]);
  hemi.color.setHex(L.hemi.sky); hemi.groundColor.setHex(L.hemi.ground); hemi.intensity = L.hemi.intensity;
  candles.forEach(c => {                               // 蜡烛 ↔ 漂浮的月光水晶
    c.flame.material.color.setHex(L.candle);
    c.wax.geometry = moon ? moonSkin.crystalGeo : c.waxGeo;
    c.wax.material = moon ? moonSkin.crystal : c.waxMat;
    c.flame.visible = true;                            // 原子灯也带一圈柔光
  });
  candleLights.forEach(l => l.color.setHex(L.candleLight));
  if (fire) {
    fire.group.visible = !L.hideFire;
    fire.light.visible = !L.hideFire;
    fire.tongues.forEach((f, n) => f.s.material.color.setHex(L.fire[n]));
    fire.core.material.color.setHex(L.fire[2]);
    fire.aura.material.color.setHex(L.fireLight);
    fire.light.color.setHex(L.fireLight);
  }
  EMBER = L.ember;
  FIRE_VOLUME = L.fireVolume;
  dust.points.material.color.setHex(L.dust);
  wandLight.color.setHex(L.wand);
  GRAV = { ...L.gravity };
  shelveBooks(moon);                                   // 月球：书收进书柜；经典：书回到空中
  document.body.dataset.skin = id;                     // CSS：猫头鹰的宇航员头盔
  saveSkin(id);
}

function renderSkinMenu() {
  $('#skin-menu-title').textContent = lang === 'zh' ? '换一个图书馆' : 'Choose your library';
  $('#skin-options').replaceChildren(...SKINS.map(sk => {
    const open = skinUnlocked(sk);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'level-option' + (sk.id === skinId ? ' current' : '') + (open ? '' : ' locked');
    btn.disabled = !open;
    const icon = document.createElement('span');
    icon.className = 'stars';
    icon.textContent = sk.icon;
    const label = document.createElement('span');
    label.textContent = t(sk.name) + (sk.unlock && !profile.finished.includes(sk.unlock.book) ? ` · ${t(sk.unlock.hint)}` : '');
    btn.append(icon, label);
    btn.addEventListener('click', () => {
      toggleSkinMenu(false);
      if (sk.id === skinId) return;
      // 换世界：先蒙一层柔光，换好再揭开
      veil.classList.remove('hidden');
      $('#veil-text').textContent = sk.id === 'moon' ? (lang === 'zh' ? '图书馆正在飞向月亮…' : 'Flying the library to the Moon…') : (lang === 'zh' ? '回到烛光书房…' : 'Back to the candlelit library…');
      setTimeout(() => {
        applySkin(sk.id);
        chime(sk.id === 'moon' ? [1568, 2093, 2637] : [1046.5, 1318.5], 0.05);
        setTimeout(() => veil.classList.add('hidden'), 500);
      }, 700);
    });
    return btn;
  }));
}
function toggleSkinMenu(open) {
  const menu = $('#skin-menu');
  const show = open ?? menu.hidden;
  if (show) renderSkinMenu();
  menu.hidden = !show;
}
$('#skin').addEventListener('click', e => { e.stopPropagation(); toggleSkinMenu(); });
window.addEventListener('pointerdown', e => {
  if (!$('#skin-menu').hidden && !e.target.closest('#skin-menu, #skin')) toggleSkinMenu(false);
});

// ---------------------------------------------------------------- 启动
async function main() {
  data = await (await fetch('data/library.json')).json();
  hints = data.hints;
  profile = loadProfile();
  lang = profile.lang || data.languages.default;

  justUnlockedLevel = checkLevelUp(data.books, data.rules);   // 先判断升级，再读进度
  profile = loadProfile();
  applyStaticText();

  room = await buildRoom(data.room);
  camera.position.set(0, data.room.eyeHeight, 0);
  candles = buildCandles();
  fire = buildFireplace();
  music.onCrackle(burstEmbers);
  dust = buildDust();

  // 封面和铭牌是用 canvas 画字的：必须等网页字体加载完再画，否则会先用系统字体画死在贴图里
  try { await Promise.race([Promise.all([document.fonts.load(`40px ${TITLE_FONT}`), document.fonts.load(fontFor('zh', 40), '书')]), new Promise(r => setTimeout(r, 2500))]); } catch { /* 字体加载失败就用后备字体 */ }
  const coverFiles = [...new Set(data.books.map(b => b.cover).filter(Boolean))];
  const images = await Promise.all(coverFiles.map(loadImage));
  coverImages = new Map(coverFiles.map((f, i) => [f, images[i]]));
  room.plaques = buildPlaques();
  secrets = buildSecrets();
  owl = createOwl({ lines: data.owl, t, onChoose: owlChoose });
  room.plaques.forEach(p => { p.visible = false; });   // 铜牌只作点击目标的备用；平时用顶部墙名代替，画面更干净
  floating = buildFloatingBooks();

  // 第一次来：欢迎书（在它自己的主题墙前）进入"藏着"状态，等孩子转身找到
  if (!profile.visited) {
    // 用它主题墙前的那本（不是"新书到了"墙前的副本），因为主题墙在开场视线之外，孩子要转身才能找到
    welcome = floating.find(b => b.book.id === data.rules.welcomeBook && b.row === 'lower'
      && data.sections[b.wall].id === b.book.theme);
    if (welcome) { welcome.state = 'hiding'; welcome.baseScale = 1.2; }
  }

  applySkin(SKINS.some(sk => sk.id === loadSkin() && skinUnlocked(sk)) ? loadSkin() : 'classic');
  setHint(roomHint);
  if (justUnlockedLevel) setTimeout(() => toast(t(hints.levelUp).replace('{level}', justUnlockedLevel), 4200), 800);
  $('#lang').addEventListener('click', () => switchLanguage(lang === 'en' ? 'zh' : 'en'));
  const TIP_KEY = 'magic-library/secret-tip';
  const tipShown = (() => { try { return localStorage.getItem(TIP_KEY); } catch { return '1'; } })();
  if (!tipShown && !profile.secrets.length) {
    setTimeout(() => {
      if (mode !== 'room') return;
      toast(t(hints.secretTip), 5000);
      try { localStorage.setItem(TIP_KEY, '1'); } catch { /* ignore */ }
    }, 25000);
  }

  resize();
  frame();
  // 调试接口（只读 + 慢放），QA 用
  window.__library = {
    get mode() { return mode; },
    get welcomeState() { return welcome && welcome.state; },
    get facing() { return facingWall() + 1; },
    owlChoose,
    get secrets() { return secrets.map(x => `${x.secret.id}:${x.found ? 'found' : 'hidden'}:${x.reveal.toFixed(2)}`); },
    get musicPlaying() { return music.playing; },
    get books() { return floating.map(b => `${b.book.id}@wall${b.wall + 1}:${b.row}:${b.seal ? 'sealed' : 'open'}:${b.state}`); },
    focus(wallNumber) { focusOn(wallNumber - 1); },
    unfocus,
    screenPos(id, wallNumber) {
      const b = floating.find(x => x.book.id === id && (!wallNumber || x.wall === wallNumber - 1));
      if (!b) return null;
      const p = b.root.position.clone().project(camera);
      return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight, onScreen: p.z < 1 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1 };
    },
    set timeScale(v) { debugTimeScale = v; }
  };
  veil.classList.add('hidden');
  console.info(`[library] 真图 ${room.realCount}/8 张；悬浮书 ${floating.length} 本；Lv${profile.level}；来过：${profile.visited}`);
}

main().catch(err => {
  console.error(err);
  $('#veil-text').textContent = data ? t(data.ui.error) : 'The candles would not light. Please refresh and try again.';
});
