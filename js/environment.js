// environment.js — 阅读地点的 3D 置景：书"真的放在"一个空间里，而不是漂在一张背景图前面
//
// 「家里的书桌」在这里；海边 / 月亮上 / 外太空在 sets.js（共用这里的小工具）。
// 书桌：木头桌面（接收书和纸片的阴影）+ 一盏会发光的台灯（真光源）
// + 字母积木、马克杯、一小摞书、彩色铅笔 + 身后虚化的墙（墙纸、孩子的画、傍晚的窗、纸星星串）。
// 道具先用代码建模、贴图用 canvas 画（零出图成本）；以后可以逐个换成插画纸片或 CC0 的 3D 模型。
// 坐标：书页在 y = 0，书底（桌面）在 y = TABLE_Y；书宽约 1.8、纵深约 1.0，镜头默认从 +z 方向看。

import * as THREE from '../vendor/three.module.min.js';
import { RoundedBoxGeometry } from '../vendor/addons/geometries/RoundedBoxGeometry.js';

export const TABLE_Y = -0.084;           // = -(书芯厚 0.062 + 书板 0.022)

// ---------------------------------------------------------------- 画贴图的小工具
export function canvasTexture(w, h, draw, { repeat = null, blur = 0 } = {}) {
  let c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  if (blur) {                                    // 虚化（远处的墙：模拟景深）
    const b = document.createElement('canvas');
    b.width = w; b.height = h;
    const g = b.getContext('2d');
    g.filter = `blur(${blur}px) saturate(0.9)`;
    g.drawImage(c, 0, 0);
    c = b;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}

export const rand = (a, b) => a + Math.random() * (b - a);

/** 木头桌面：几块长木板，每块有自己的深浅和弯弯的木纹。 */
function woodTexture() {
  return canvasTexture(1024, 1024, (g, W, H) => {
    const plank = H / 4;
    for (let p = 0; p < 4; p++) {
      const y0 = p * plank;
      const base = [[122, 80, 50], [112, 72, 45], [128, 86, 54], [116, 76, 48]][p];   // 胡桃木：深一点更温馨
      g.fillStyle = `rgb(${base})`;
      g.fillRect(0, y0, W, plank);
      // 木纹：一条条缓慢起伏的细线
      for (let k = 0; k < 38; k++) {
        const y = y0 + rand(4, plank - 4), amp = rand(2, 7), wl = rand(120, 320), ph = rand(0, 6);
        g.strokeStyle = Math.random() < 0.5 ? 'rgba(90,55,28,0.18)' : 'rgba(230,190,140,0.12)';
        g.lineWidth = rand(0.8, 2.2);
        g.beginPath();
        for (let x = 0; x <= W; x += 16) g.lineTo(x, y + Math.sin(x / wl + ph) * amp);
        g.stroke();
      }
      // 偶尔一个木节
      if (Math.random() < 0.8) {
        const kx = rand(100, W - 100), ky = y0 + plank / 2;
        for (let r = 22; r > 2; r -= 4) {
          g.strokeStyle = `rgba(95,58,30,${0.08 + (22 - r) * 0.012})`;
          g.beginPath(); g.ellipse(kx, ky, r * 1.8, r * 0.7, 0, 0, Math.PI * 2); g.stroke();
        }
      }
      // 木板之间的缝
      g.fillStyle = 'rgba(60,35,18,0.55)';
      g.fillRect(0, y0, W, 3);
    }
  }, { repeat: [2, 2] });
}

/** 身后的墙：暖色墙纸 + 孩子的画 + 傍晚的窗 + 一串纸星星，整体虚化（景深）。 */
function wallTexture() {
  return canvasTexture(2048, 1024, (g, W, H) => {
    // 墙纸：奶油色底 + 小碎花菱格
    g.fillStyle = '#eadcc0'; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(190,140,110,0.18)';
    for (let y = 20; y < H; y += 56) for (let x = (y / 56) % 2 ? 28 : 0; x < W; x += 56) {
      g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 6, y); g.lineTo(x, y + 6); g.lineTo(x - 6, y); g.fill();
    }
    // 下半截护墙板
    g.fillStyle = '#b98f66'; g.fillRect(0, H * 0.72, W, H * 0.28);
    g.fillStyle = '#9c7450'; g.fillRect(0, H * 0.72, W, 10);
    for (let x = 60; x < W; x += 180) { g.strokeStyle = 'rgba(80,50,30,0.35)'; g.lineWidth = 3; g.strokeRect(x, H * 0.76, 140, H * 0.2); }
    // 傍晚的窗（右边）：橘粉色的天，一弯月亮
    const wx = W * 0.64, wy = H * 0.12, ww = W * 0.26, wh = H * 0.5;
    const sky = g.createLinearGradient(0, wy, 0, wy + wh);
    sky.addColorStop(0, '#5b5a9c'); sky.addColorStop(0.55, '#e59a8a'); sky.addColorStop(1, '#f6c987');
    g.fillStyle = sky; g.fillRect(wx, wy, ww, wh);
    g.fillStyle = '#fff3cf'; g.beginPath(); g.arc(wx + ww * 0.7, wy + wh * 0.25, 26, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#5b5a9c'; g.beginPath(); g.arc(wx + ww * 0.7 + 12, wy + wh * 0.25 - 6, 24, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#8a5f3e'; g.lineWidth = 22; g.strokeRect(wx, wy, ww, wh);
    g.lineWidth = 12; g.beginPath(); g.moveTo(wx + ww / 2, wy); g.lineTo(wx + ww / 2, wy + wh); g.moveTo(wx, wy + wh / 2); g.lineTo(wx + ww, wy + wh / 2); g.stroke();
    // 窗帘
    g.fillStyle = 'rgba(245,232,210,0.95)';
    g.beginPath(); g.moveTo(wx - 40, wy - 30); g.quadraticCurveTo(wx + 30, wy + wh * 0.5, wx - 10, wy + wh + 40); g.lineTo(wx - 70, wy + wh + 40); g.lineTo(wx - 70, wy - 30); g.fill();
    g.beginPath(); g.moveTo(wx + ww + 40, wy - 30); g.quadraticCurveTo(wx + ww - 30, wy + wh * 0.5, wx + ww + 10, wy + wh + 40); g.lineTo(wx + ww + 70, wy + wh + 40); g.lineTo(wx + ww + 70, wy - 30); g.fill();
    // 孩子的画：三张用和纸胶带贴着的蜡笔画
    const drawing = (x, y, w, h, tilt, doodle) => {
      g.save(); g.translate(x, y); g.rotate(tilt);
      g.fillStyle = '#fbf6ea'; g.fillRect(-w / 2, -h / 2, w, h);
      doodle(g, w, h);
      g.fillStyle = 'rgba(230,150,150,0.75)'; g.fillRect(-26, -h / 2 - 12, 52, 22);
      g.restore();
    };
    drawing(W * 0.16, H * 0.33, 220, 170, -0.06, (g, w, h) => {                  // 太阳和房子
      g.fillStyle = '#f2b632'; g.beginPath(); g.arc(-w * 0.25, -h * 0.2, 26, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#d6604a'; g.beginPath(); g.moveTo(0, -h * 0.15); g.lineTo(w * 0.3, h * 0.05); g.lineTo(-w * 0.1, h * 0.05); g.fill();
      g.fillStyle = '#6d8fc2'; g.fillRect(-w * 0.05, h * 0.05, w * 0.3, h * 0.28);
      g.strokeStyle = '#6aa05a'; g.lineWidth = 6; g.beginPath(); g.moveTo(-w * 0.45, h * 0.35); g.lineTo(w * 0.45, h * 0.35); g.stroke();
    });
    drawing(W * 0.34, H * 0.28, 190, 150, 0.05, (g, w, h) => {                   // 一只橘色小狐狸
      g.fillStyle = '#e07a3a';
      g.beginPath(); g.ellipse(0, h * 0.08, 46, 34, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(-30, -20); g.lineTo(-20, -52); g.lineTo(-8, -24); g.fill();
      g.beginPath(); g.moveTo(30, -20); g.lineTo(20, -52); g.lineTo(8, -24); g.fill();
      g.fillStyle = '#2a2020'; g.beginPath(); g.arc(-14, 0, 4, 0, Math.PI * 2); g.arc(14, 0, 4, 0, Math.PI * 2); g.fill();
    });
    drawing(W * 0.5, H * 0.36, 170, 200, -0.03, (g, w, h) => {                   // 满天星星
      g.fillStyle = '#2f3a6b'; g.fillRect(-w / 2 + 10, -h / 2 + 10, w - 20, h - 20);
      g.fillStyle = '#ffd96b';
      for (let k = 0; k < 12; k++) { g.beginPath(); g.arc(rand(-w / 2 + 20, w / 2 - 20), rand(-h / 2 + 20, h / 2 - 20), rand(3, 7), 0, Math.PI * 2); g.fill(); }
    });
    // 一串纸星星（横穿墙顶）
    g.strokeStyle = 'rgba(120,90,60,0.6)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, H * 0.06); g.quadraticCurveTo(W / 2, H * 0.2, W, H * 0.05); g.stroke();
    for (let k = 1; k < 14; k++) {
      const x = (k / 14) * W, y = H * 0.06 + Math.sin((k / 14) * Math.PI) * H * 0.1 + 20;
      g.fillStyle = ['#f2c14e', '#e98a6e', '#9fc3e6', '#f2c14e'][k % 4];
      g.beginPath();
      for (let j = 0; j < 10; j++) { const r = j % 2 ? 9 : 22, a = (j / 10) * Math.PI * 2 - Math.PI / 2; g[j ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r); }
      g.fill();
    }
  }, { blur: 3 });
}

/** 字母积木的一面：彩色底 + 奶油色描边 + 大字母。 */
function blockFace(letter, color) {
  return canvasTexture(256, 256, (g, W) => {
    g.fillStyle = color; g.fillRect(0, 0, W, W);
    g.strokeStyle = 'rgba(255,248,230,0.9)'; g.lineWidth = 14; g.strokeRect(18, 18, W - 36, W - 36);
    g.fillStyle = '#fff8e6'; g.font = 'bold 150px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(letter, W / 2, W / 2 + 8);
  });
}

// ---------------------------------------------------------------- 道具
const paint = (color, rough = 0.7, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });
export const shadowy = o => { o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; };

function letterBlock(letter, color, size = 0.13) {
  const faces = ['A', 'B', 'C', 'D', 'E', 'F'].map((_, k) => new THREE.MeshStandardMaterial({ map: blockFace(k === 2 ? letter : 'ABCXYZ'[k], color), roughness: 0.6 }));
  const m = new THREE.Mesh(new RoundedBoxGeometry(size, size, size, 3, size * 0.12), faces);
  return shadowy(m);
}

function mug() {
  const g = new THREE.Group();
  const glaze = paint('#6f9ec9', 0.35);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.068, 0.16, 32, 1, true), glaze);
  body.material.side = THREE.DoubleSide;
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.068, 32), glaze);
  bottom.rotation.x = -Math.PI / 2; bottom.position.y = -0.079;
  const milk = new THREE.Mesh(new THREE.CircleGeometry(0.07, 32), paint('#f3e7d2', 0.3));
  milk.rotation.x = -Math.PI / 2; milk.position.y = 0.05;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 12, 24, Math.PI), glaze);
  handle.rotation.z = -Math.PI / 2; handle.position.x = 0.075;
  g.add(body, bottom, milk, handle);
  return shadowy(g);
}

function bookStack() {
  const g = new THREE.Group();
  const specs = [['#8c3b2e', 0.46, 0.34, 0.05], ['#2f4a6a', 0.42, 0.3, 0.045], ['#5f7a45', 0.38, 0.28, 0.04]];
  let y = 0;
  specs.forEach(([color, w, d, h], k) => {
    const cloth = paint(color, 0.8), pages = paint('#f2e6c8', 0.9);
    const book = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [cloth, pages, cloth, cloth, pages, pages]);
    book.position.y = y + h / 2;
    book.rotation.y = [0.08, -0.12, 0.2][k];
    y += h;
    g.add(book);
  });
  return shadowy(g);
}

function pencils() {
  const g = new THREE.Group();
  ['#e0473a', '#f2b632', '#4d8fcf', '#5aa55a'].forEach((color, k) => {
    const p = new THREE.Group();
    const wood = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.32, 6), paint(color, 0.5));
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.04, 6), paint('#e9cfa0', 0.8));
    tip.position.y = 0.18;
    const lead = new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.012, 6), paint('#333', 0.6));
    lead.position.y = 0.2;
    p.add(wood, tip, lead);
    p.rotation.z = Math.PI / 2;
    p.rotation.y = rand(-0.5, 0.5);
    p.position.set(0, 0.012, k * 0.035);
    g.add(p);
  });
  return shadowy(g);
}

/** 台灯：底座 + 灯杆 + 灯罩 + 发光的灯泡 + 真光源（聚光灯，照向书，会投影）。 */
function deskLamp() {
  const g = new THREE.Group();
  const brass = new THREE.MeshStandardMaterial({ color: '#c9a45a', roughness: 0.35, metalness: 0.8 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.03, 32), brass);
  base.position.y = 0.015;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.55, 12), brass);
  stem.position.y = 0.3;
  const shadeMat = new THREE.MeshStandardMaterial({ color: '#3f6a5a', roughness: 0.6, side: THREE.DoubleSide, emissive: '#ffcf8a', emissiveIntensity: 0.05 });
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.17, 0.16, 32, 1, true), shadeMat);
  shade.position.set(0.05, 0.6, 0.05);
  shade.rotation.z = -0.35;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 20, 16), new THREE.MeshBasicMaterial({ color: '#fff4d6' }));
  bulb.position.set(0.07, 0.56, 0.06);
  // 灯泡用 MeshBasic（不受光）+ 足够亮 → 后期的辉光会让它晕开
  bulb.material.color.multiplyScalar(3);
  const light = new THREE.SpotLight('#ffc98a', 4, 0, 0.95, 0.9, 1.4);   // 太亮会把书页照白
  light.position.copy(bulb.position);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.bias = -0.0008;
  light.shadow.radius = 6;
  g.add(base, stem, shade, bulb, light);
  [base, stem, shade].forEach(m => { m.castShadow = true; m.receiveShadow = true; });
  return { group: g, light, bulb };
}

// ---------------------------------------------------------------- 温馨的东西：布料、小灯串、蜡烛、曲奇、绿植

/** 刺绣亚麻桌旗：垫在书下面，米白色亚麻底 + 红蓝十字绣花边。 */
function tableRunner() {
  const tex = canvasTexture(1024, 640, (g, W, H) => {
    g.fillStyle = '#d8c4a0'; g.fillRect(0, 0, W, H);   // 暖一点、深一点的亚麻色：不能比书还亮
    for (let y = 0; y < H; y += 3) { g.fillStyle = y % 6 ? 'rgba(255,255,255,0.05)' : 'rgba(120,90,60,0.05)'; g.fillRect(0, y, W, 1); }
    for (let x = 0; x < W; x += 3) { g.fillStyle = x % 6 ? 'rgba(255,255,255,0.04)' : 'rgba(120,90,60,0.04)'; g.fillRect(x, 0, 1, H); }
    // 十字绣花边：一圈小十字 + 转角的小花
    const cross = (x, y, c) => { g.strokeStyle = c; g.lineWidth = 3; g.beginPath(); g.moveTo(x - 5, y - 5); g.lineTo(x + 5, y + 5); g.moveTo(x + 5, y - 5); g.lineTo(x - 5, y + 5); g.stroke(); };
    for (let x = 40; x < W - 30; x += 16) { cross(x, 36, '#b8453a'); cross(x, H - 36, '#b8453a'); cross(x, 60, '#3f5f8c'); cross(x, H - 60, '#3f5f8c'); }
    for (let y = 36; y < H - 30; y += 16) { cross(36, y, '#b8453a'); cross(W - 36, y, '#b8453a'); }
    for (const [cx, cy] of [[90, 110], [W - 90, 110], [90, H - 110], [W - 90, H - 110]]) {
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; cross(cx + Math.cos(a) * 16, cy + Math.sin(a) * 16, '#b8453a'); }
      cross(cx, cy, '#e0a93a');
    }
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.28), new THREE.MeshStandardMaterial({ map: tex, roughness: 1, color: '#e6dccb' }));
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = 0.03;
  m.receiveShadow = true;
  return m;
}

/** 针织毯：搭在桌角，粗针的麻花纹 + 一点点起伏。 */
function knitBlanket() {
  const tex = canvasTexture(512, 512, (g, W, H) => {
    g.fillStyle = '#c96f5a'; g.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += 32) for (let y = 0; y < H; y += 20) {
      g.fillStyle = 'rgba(255,220,200,0.18)'; g.beginPath(); g.ellipse(x + 8, y + 10, 7, 10, 0.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(90,30,20,0.18)'; g.beginPath(); g.ellipse(x + 24, y + 10, 7, 10, -0.5, 0, Math.PI * 2); g.fill();
    }
  }, { repeat: [3, 2] });
  const geo = new THREE.PlaneGeometry(0.7, 0.5, 24, 16);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 9) * 0.012 + Math.cos(pos.getY(i) * 7) * 0.01);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
  m.rotation.x = -Math.PI / 2;
  m.castShadow = m.receiveShadow = true;
  return m;
}

/** 一串暖黄色的小灯（沿着桌子后方挂一条弧线），灯泡够亮 → 被辉光晕开。 */
function fairyLights() {
  const g = new THREE.Group();
  const pts = [];
  for (let k = 0; k <= 40; k++) {
    const t = k / 40;
    pts.push(new THREE.Vector3(-2.4 + t * 4.8, 0.35 + Math.sin(t * Math.PI * 3) * 0.08 - Math.sin(t * Math.PI) * 0.12, -1.25 - Math.sin(t * Math.PI) * 0.1));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const wire = new THREE.Mesh(new THREE.TubeGeometry(curve, 120, 0.004, 6), new THREE.MeshStandardMaterial({ color: '#3a2a1e', roughness: 0.8 }));
  g.add(wire);
  const bulbs = [];
  for (let k = 0; k < 22; k++) {
    const p = curve.getPoint((k + 0.5) / 22);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd49a').multiplyScalar(2.6) }));
    bulb.position.copy(p).add(new THREE.Vector3(0, -0.02, 0));
    g.add(bulb);
    bulbs.push({ bulb, phase: Math.random() * 10 });
  }
  const glow = new THREE.PointLight('#ffb870', 1.2, 3.5, 1.8);          // 灯串给墙和桌子后沿一点暖光
  glow.position.set(0, 0.3, -1.1);
  g.add(glow);
  return { group: g, bulbs };
}

/** 玻璃罐里的蜡烛：蜡身 + 摇曳的火苗 + 一盏会闪的小暖光。 */
function jarCandle() {
  const g = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.16, 32, 1, true),
    new THREE.MeshStandardMaterial({ color: '#f3e3c8', roughness: 0.1, metalness: 0, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
  glass.position.y = 0.08;
  const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.066, 0.11, 32), new THREE.MeshStandardMaterial({ color: '#f6e7cf', roughness: 0.6, emissive: '#ffb060', emissiveIntensity: 0.15 }));
  wax.position.y = 0.055;
  const flameTex = canvasTexture(64, 128, (c, W, H) => {
    const r = c.createRadialGradient(32, 90, 2, 32, 76, 56);
    r.addColorStop(0, 'rgba(255,250,220,1)'); r.addColorStop(0.35, 'rgba(255,200,110,0.9)'); r.addColorStop(1, 'rgba(255,120,40,0)');
    c.fillStyle = r;
    c.beginPath(); c.moveTo(32, 6); c.bezierCurveTo(52, 50, 58, 96, 32, 124); c.bezierCurveTo(6, 96, 12, 50, 32, 6); c.fill();
  });
  const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  flame.scale.set(0.035, 0.07, 1);
  flame.position.y = 0.145;
  const light = new THREE.PointLight('#ffad5c', 0.9, 1.6, 1.8);
  light.position.y = 0.2;
  g.add(glass, wax, flame, light);
  wax.castShadow = wax.receiveShadow = true;
  return { group: g, flame, light };
}

/** 一碟曲奇：白瓷碟 + 几块带巧克力豆的饼干。 */
function cookiePlate() {
  const g = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.018, 40), new THREE.MeshStandardMaterial({ color: '#f7f1e6', roughness: 0.25 }));
  plate.position.y = 0.009;
  g.add(plate);
  const chip = canvasTexture(128, 128, (c, W) => {
    c.fillStyle = '#c98b4a'; c.beginPath(); c.arc(64, 64, 62, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(120,70,30,0.35)'; for (let k = 0; k < 30; k++) { c.beginPath(); c.arc(rand(10, 118), rand(10, 118), rand(1, 3), 0, Math.PI * 2); c.fill(); }
    c.fillStyle = '#4a2a18'; for (let k = 0; k < 7; k++) { c.beginPath(); c.arc(rand(24, 104), rand(24, 104), rand(5, 8), 0, Math.PI * 2); c.fill(); }
  });
  [[-0.05, 0.03, 0], [0.05, -0.02, 0.4], [0.0, 0.0, 0.2]].forEach(([x, z, tilt], k) => {
    const cookie = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.014, 28),
      [new THREE.MeshStandardMaterial({ color: '#b97a3e', roughness: 0.9 }), new THREE.MeshStandardMaterial({ map: chip, roughness: 0.9 }), new THREE.MeshStandardMaterial({ map: chip, roughness: 0.9 })]);
    cookie.position.set(x, 0.026 + k * 0.012, z);
    cookie.rotation.set(tilt * 0.3, rand(0, 3), tilt * 0.2);
    g.add(cookie);
  });
  return shadowy(g);
}

/** 一小盆绿植：陶土盆 + 一簇圆圆的叶子。 */
function pottedPlant() {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.055, 0.12, 24), new THREE.MeshStandardMaterial({ color: '#b8674a', roughness: 0.85 }));
  pot.position.y = 0.06;
  const soil = new THREE.Mesh(new THREE.CircleGeometry(0.07, 24), new THREE.MeshStandardMaterial({ color: '#4a3326', roughness: 1 }));
  soil.rotation.x = -Math.PI / 2; soil.position.y = 0.115;
  g.add(pot, soil);
  const leafMat = new THREE.MeshStandardMaterial({ color: '#5f8f55', roughness: 0.6 });
  for (let k = 0; k < 9; k++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), leafMat);
    const a = (k / 9) * Math.PI * 2;
    leaf.scale.set(1, 0.35, 0.7);
    leaf.position.set(Math.cos(a) * 0.05, 0.16 + (k % 3) * 0.04, Math.sin(a) * 0.05);
    leaf.rotation.set(rand(-0.6, 0.6), a, rand(-0.5, 0.5));
    g.add(leaf);
  }
  return shadowy(g);
}

// ---------------------------------------------------------------- 组装书桌场景
export function buildDeskSet() {
  const set = new THREE.Group();

  // 桌面：比画面大得多，边缘沉进雾里
  const table = new THREE.Mesh(new THREE.PlaneGeometry(9, 6), new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.55, metalness: 0 }));
  table.rotation.x = -Math.PI / 2;
  table.position.set(0, TABLE_Y, -0.6);
  table.receiveShadow = true;
  set.add(table);

  // 身后的墙
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(9, 4.5), new THREE.MeshBasicMaterial({ map: wallTexture() }));
  wall.position.set(0, TABLE_Y + 1.6, -2.9);
  set.add(wall);

  // 书下面垫一条刺绣桌旗；桌角搭一块针织毯
  const runner = tableRunner();
  runner.position.set(0, TABLE_Y + 0.001, 0.05);
  set.add(runner);
  const blanket = knitBlanket();
  blanket.position.set(1.9, TABLE_Y + 0.012, 0.95);   // 只在右下角露出一角
  blanket.rotation.z = -0.7;
  set.add(blanket);

  const lights = fairyLights();
  lights.group.position.y = TABLE_Y;
  set.add(lights.group);

  const candle = jarCandle();
  candle.group.position.set(0.95, TABLE_Y, -0.72);
  set.add(candle.group);

  const cookies = cookiePlate();
  cookies.position.set(-0.95, TABLE_Y, 0.78);
  set.add(cookies);

  const plant = pottedPlant();
  plant.position.set(-0.8, TABLE_Y, -0.85);
  set.add(plant);

  // 道具（围着书摆，不挡书）
  const lamp = deskLamp();
  lamp.group.position.set(-1.35, TABLE_Y, -0.75);
  lamp.light.target.position.set(1.35, -0.6, 0.8);           // 照向书（相对灯的位置）
  lamp.group.add(lamp.light.target);
  set.add(lamp.group);

  const blocks = new THREE.Group();
  const b1 = letterBlock('A', '#d6604a'); b1.position.set(0, 0.065, 0); b1.rotation.y = 0.3;
  const b2 = letterBlock('B', '#4d8fcf'); b2.position.set(0.15, 0.065, 0.04); b2.rotation.y = -0.2;
  const b3 = letterBlock('C', '#e9b33e'); b3.position.set(0.07, 0.195, 0.02); b3.rotation.y = 0.7;
  blocks.add(b1, b2, b3);
  blocks.position.set(1.2, TABLE_Y, 0.45);
  set.add(blocks);

  const cup = mug();
  cup.position.set(1.25, TABLE_Y + 0.08, -0.45);
  cup.rotation.y = -0.6;
  set.add(cup);

  const stack = bookStack();
  stack.position.set(-1.3, TABLE_Y, 0.35);
  set.add(stack);

  const pens = pencils();
  pens.position.set(-0.55, TABLE_Y, 0.75);
  pens.rotation.y = 0.15;
  set.add(pens);

  return {
    group: set,
    lamp,
    /** 灯光轻微闪烁（像真的暖光灯，不是死板的常亮）。 */
    update(time) {
      lamp.light.intensity = 4 + Math.sin(time * 1.7) * 0.15 + Math.sin(time * 7.3) * 0.08;
      // 蜡烛火苗摇曳，光跟着闪
      const f = 0.85 + 0.15 * Math.sin(time * 9.1) * Math.sin(time * 3.7 + 1);
      candle.flame.scale.set(0.035 * (0.9 + 0.1 * Math.sin(time * 5)), 0.07 * f, 1);
      candle.light.intensity = 0.9 * f;
      // 小灯串：每颗灯慢慢呼吸，节奏各不相同
      lights.bulbs.forEach(({ bulb, phase }) => bulb.material.color.setScalar(1).set('#ffd49a').multiplyScalar(2 + Math.sin(time * 1.3 + phase) * 0.7));
    }
  };
}
