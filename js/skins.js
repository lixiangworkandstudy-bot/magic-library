// skins.js — 图书馆皮肤（读书挣来的"世界"，可以随时切换回经典书房）
//
// 第一套：月球图书馆（读完《纸月亮》解锁）——整座图书馆搬到了月亮上：
//   · 天花板换成 3D 玻璃穹顶：银色金属肋拱，外面是真星空、正在"升起"的地球（会转、带大气光）、淡淡的星云、偶尔一颗流星
//   · 地面换成月面土壤（颗粒 + 小坑的真实起伏）+ 一串小脚印
//   · 其余（墙色、蜡烛 → 月光水晶、壁炉 → 冰蓝水晶光、浮尘、低重力、猫头鹰头盔）由 library.js 的 applySkin 按 look 参数调整
//
// 这里只负责"造东西"；切换、还原在 library.js。所有新东西都在一个 group 里，切回经典时整组隐藏。

import * as THREE from '../vendor/three.module.min.js';
import { RoundedBoxGeometry } from '../vendor/addons/geometries/RoundedBoxGeometry.js';

const rand = (a, b) => a + Math.random() * (b - a);

function canvasTexture(w, h, draw, repeat = null) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}

/** 由灰度高度图算法线贴图（白 = 高）：地面的颗粒和小坑在侧光下有真实的明暗。 */
function normalMap(size, drawHeight, strength = 3, repeat = null) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, size, size);
  drawHeight(g, size, size);
  const src = g.getImageData(0, 0, size, size).data, out = g.createImageData(size, size);
  const h = (x, y) => src[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (h(x + 1, y) - h(x - 1, y)) * strength, dy = (h(x, y + 1) - h(x, y - 1)) * strength;
    const len = Math.hypot(dx, dy, 1), i = (y * size + x) * 4;
    out.data.set([(-dx / len * 0.5 + 0.5) * 255, (dy / len * 0.5 + 0.5) * 255, (1 / len * 0.5 + 0.5) * 255, 255], i);
  }
  g.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}

/** 一团柔光贴图。 */
const softGlow = canvasTexture(128, 128, (g) => {
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,0.45)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
});
const glow = (color, size, opacity) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softGlow, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  s.scale.setScalar(size);
  return s;
};

// ================================================================ 月球图书馆 · 未来复古（Retro-futurism）
// 风格参考：1950–60 年代"太空时代"的未来想象——迪士尼 1955 年的 Tomorrowland、原子时代的星芒装饰、
// Googie 建筑的圆润曲线、复古科幻海报的配色（青绿 / 焦橙 / 芥末黄 / 奶油 / 藏青）、黄铜与柚木。
// 和图书馆原本的"复古迪士尼"一脉相承：不是冷冰冰的科幻，而是温暖、乐观的"昨天想象的明天"。
//
// 整个房间用 3D 重新搭（原来的墙画是画死的，换不了）：
//   · 1.5 米高的环形书墙：奶油 + 青绿面板、柚木书架、几百本复古配色的书、黄铜饰条、墙顶的原子星芒
//   · 书墙以上整面玻璃穹顶（黄铜肋拱），看出去：月面、远处的环形山、天上的地球、一枚停着的复古火箭
//   · 地面：奶油色水磨石 + 黄铜星芒镶嵌
// ---------------------------------------------------------------- 噪声（造地形、大陆、云用）
// 值噪声：在整数格点上放随机数，中间平滑插值；fbm = 几层不同尺度的噪声叠加（大起伏 + 小细节）
const hash3 = (i, j, k) => {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};
const smooth = t => t * t * (3 - 2 * t);
function noise3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = smooth(x - ix), fy = smooth(y - iy), fz = smooth(z - iz);
  const lerp = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash3(ix + dx, iy + dy, iz + dz);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), fx), lerp(c(0, 1, 0), c(1, 1, 0), fx), fy),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), fx), lerp(c(0, 1, 1), c(1, 1, 1), fx), fy), fz);
}
function fbm3(x, y, z, oct = 5) {
  let sum = 0, amp = 0.5, f = 1, norm = 0;
  for (let o = 0; o < oct; o++) { sum += noise3(x * f, y * f, z * f) * amp; norm += amp; amp *= 0.5; f *= 2.03; }
  return sum / norm;
}
// 山脊噪声：把噪声折一下（1 - |2n-1|）再平方，波峰就成了尖尖的山脊线——雪山的形状
function ridged(x, z, oct = 5) {
  let sum = 0, amp = 0.55, f = 1, weight = 1, norm = 0;
  for (let o = 0; o < oct; o++) {
    let n = 1 - Math.abs(noise3(x * f, 0.5, z * f) * 2 - 1);
    n = n * n * weight;
    weight = Math.min(1, n * 1.6);                            // 山脊上叠更多细节，谷底保持平滑
    sum += n * amp; norm += amp; amp *= 0.5; f *= 2.1;
  }
  return sum / norm;
}

const RETRO = { teal: '#2f6f73', orange: '#e07a3f', mustard: '#e9b949', cream: '#f2e2c0', red: '#c8553d', navy: '#34477a', teak: '#8a5a3a', brass: '#c9a14a' };

export function buildMoonSkin(room) {
  const group = new THREE.Group();
  const R = room.radius, H = room.height;
  // 布局（2026-10 第三版，参考：恢弘的观景落地窗 + 木框多面玻璃 + 一侧书柜 + 窗前的休息椅）
  // 主角是窗外的置景；书只用来烘托气氛：
  //   · 12 面平板玻璃围成一圈（多面体，不是圆柱，木框是直的，更像建筑），从很矮的窗台一直落到 2.4 米，
  //     再斜着往里收成玻璃屋顶，顶上一圈天窗——抬头、平视、低头都是太空
  //   · 身后 3 面换成满墙的胡桃木书柜（BOOK_ARC）
  //   · 窗台上散放书和小台灯；一段窗台铺了软垫和橙色靠枕；窗前两把皮质休息椅、几盆植物
  //   · 室内偏暗偏暖（让窗外显得更亮更大）
  const N = 12;                                               // 玻璃面数
  const SILL = 0.3;                                           // 窗台高度（很矮 = 落地窗）
  const WALL = 2.4;                                           // 竖直玻璃的顶；以上斜着往里收
  const TOP_Y = 3.6, TOP_R = R * 0.5;                         // 屋顶天窗的高度和半径
  const BOOK_A = 0, BOOK_HALF = Math.PI / 4;                  // 书柜在身后（+z 方向），正好占 3 面
  const STEP = Math.PI * 2 / N, FACET0 = BOOK_A + BOOK_HALF;  // 第 k 根竖框在 FACET0 + k*STEP
  const inBookArc = a => Math.abs(((a - BOOK_A + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < BOOK_HALF - 1e-3;
  const at = (a, r, y) => new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r);   // 角度约定：x = sin, z = cos（和 three.js 的圆柱一致）

  const brass = new THREE.MeshStandardMaterial({ color: RETRO.brass, metalness: 0.9, roughness: 0.28, emissive: '#3a2a10', emissiveIntensity: 0.35 });
  const teak = new THREE.MeshStandardMaterial({ color: RETRO.teak, roughness: 0.55, metalness: 0.05 });
  const walnut = new THREE.MeshStandardMaterial({ color: '#4a2e1e', roughness: 0.6, emissive: '#24120a', emissiveIntensity: 0.35 });
  const palette = [RETRO.teal, RETRO.orange, RETRO.mustard, RETRO.cream, RETRO.red, RETRO.navy, '#5e8b6f', '#d9a679', '#7a3b2e', '#e8dcc4'].map(c => new THREE.Color(c));
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  // ---- 1a. 身后的书柜：胡桃木背板 + 柚木隔板 + 两侧立柱，一直到 2.4 米
  const A0 = BOOK_A - BOOK_HALF, ARC = BOOK_HALF * 2;
  const back = new THREE.Mesh(new THREE.CylinderGeometry(R, R, WALL, 48, 1, true, A0, ARC), new THREE.MeshStandardMaterial({ color: '#3a271b', roughness: 0.8, side: THREE.BackSide }));
  back.position.y = WALL / 2;
  group.add(back);
  const SHELF_Y = [0.06, 0.42, 0.78, 1.14, 1.5, 1.86];
  const shelfGeo = new THREE.LatheGeometry([new THREE.Vector2(R - 0.26, 0), new THREE.Vector2(R, 0), new THREE.Vector2(R, 0.028), new THREE.Vector2(R - 0.26, 0.028), new THREE.Vector2(R - 0.26, 0)], 48, A0, ARC);
  for (const y of [...SHELF_Y, WALL - 0.03]) { const m = new THREE.Mesh(shelfGeo, teak); m.position.y = y; group.add(m); }
  for (const a of [A0, A0 + ARC]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, WALL, 0.28), walnut);
    post.position.copy(at(a, R - 0.13, WALL / 2)); post.rotation.y = a;
    group.add(post);
  }

  // 书柜里的装饰书（InstancedMesh：一次画完）；真正能读的书由 library.js 插进来（setReserved 让出位置）
  const FILL_SHELVES = [0, 1, 2, 3, 4, 5];
  const fillSeed = [];                                          // 先把每本装饰书的样子定下来（每次重排位置不变）
  for (const si of FILL_SHELVES) {
    let a = A0 + 0.04;
    const y = SHELF_Y[si];
    while (a < A0 + ARC - 0.07) {
      const w = rand(0.028, 0.055), h = rand(0.2, 0.3);
      if (Math.random() < 0.05) { a += 0.09; continue; }       // 偶尔空一截：书柜不塞满更有生活感
      fillSeed.push({ si, a: a + w / (2 * R), w, h, y: y + 0.028 + h / 2, lean: Math.random() < 0.05 ? rand(-0.25, 0.25) : 0, c: pick(palette) });
      a += (w + 0.004) / (R - 0.1);
    }
  }
  let books = null;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p3 = new THREE.Vector3(), sc = new THREE.Vector3();
  function fillShelves(reserved = []) {
    if (books) { group.remove(books); books.dispose(); }
    const angDist = (x, y) => Math.abs(((x - y + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    const slots = fillSeed.filter(b => !reserved.some(r => r.shelf === b.si && angDist(r.a, b.a) < r.half + b.w / (2 * R) + 0.004));
    books = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.75 }), slots.length);
    slots.forEach((b, k) => {
      p3.set(Math.sin(b.a) * (R - 0.12), b.y, Math.cos(b.a) * (R - 0.12));
      e.set(0, b.a, b.lean);
      q.setFromEuler(e);
      sc.set(b.w, b.h, 0.17);
      books.setMatrixAt(k, m4.compose(p3, q, sc));
      books.setColorAt(k, b.c);
    });
    group.add(books);
  }
  fillShelves();

  // ---- 1b. 玻璃：竖直的 9 面 + 斜屋顶 12 面 + 顶上天窗；玻璃只在掠射角带一点暖色反光，正面几乎透明
  const glassMat = new THREE.ShaderMaterial({
    uniforms: { tint: { value: new THREE.Color('#ffe6c4') } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 tint; varying vec3 vN; varying vec3 vV;
      void main() { float f = pow(1.0 - abs(dot(vN, vV)), 3.0); gl_FragColor = vec4(tint * f * 0.45, f * 0.3 + 0.015); }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide
  });
  const SA0 = BOOK_A + BOOK_HALF, SARC = Math.PI * 2 - ARC;
  const panes = [
    [new THREE.CylinderGeometry(R, R, WALL - SILL, N - 3, 1, true, SA0, SARC), (WALL + SILL) / 2],   // 竖直落地窗
    [new THREE.CylinderGeometry(TOP_R, R, TOP_Y - WALL, N, 1, true, FACET0), (WALL + TOP_Y) / 2],      // 斜屋顶
    [new THREE.CylinderGeometry(TOP_R, TOP_R, 0.001, N, 1, false, FACET0), TOP_Y]                      // 天窗
  ];
  for (const [geo, y] of panes) { const m = new THREE.Mesh(geo, glassMat); m.position.y = y; m.renderOrder = 2; group.add(m); }

  // 木框：直的方木梁（参考图里那种粗壮的木结构，给"恢弘"一个尺度感）
  const beam = (p, q2, t = 0.07) => {
    const d = new THREE.Vector3().subVectors(q2, p), m = new THREE.Mesh(new THREE.BoxGeometry(t, d.length(), t * 1.4), walnut);
    m.position.copy(p).add(q2).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    m.castShadow = true;
    group.add(m);
  };
  for (let k = 0; k < N; k++) {
    const a = FACET0 + k * STEP, a2 = a + STEP;
    const inBooks = inBookArc(a + STEP / 2);                   // 这一面是书柜
    if (!inBookArc(a)) beam(at(a, R, 0), at(a, R, WALL));       // 竖框（书柜内部那两根不要）
    beam(at(a, R, TOP_Y - (TOP_Y - WALL)), at(a, TOP_R, TOP_Y), 0.06);   // 斜屋顶的梁
    beam(at(a, R, WALL), at(a2, R, WALL), 0.06);                // 竖窗顶的横梁
    beam(at(a, TOP_R, TOP_Y), at(a2, TOP_R, TOP_Y), 0.05);      // 天窗一圈
    if (!inBooks) beam(at(a, R * 0.985, SILL + 0.02), at(a2, R * 0.985, SILL + 0.02), 0.045);   // 窗台沿
  }

  // ---- 1c. 窗台：书柜以外一整圈矮柜（胡桃木），台面柚木
  const SILL_IN = R * 0.8;                                    // 窗台内沿半径
  const sillFace = new THREE.Mesh(new THREE.CylinderGeometry(SILL_IN, SILL_IN, SILL, 96, 1, true, SA0, SARC), new THREE.MeshStandardMaterial({ color: '#5a3824', roughness: 0.7, side: THREE.BackSide }));
  sillFace.position.y = SILL / 2;
  const sillTop = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(SILL_IN - 0.02, 0), new THREE.Vector2(R * 0.955, 0), new THREE.Vector2(R * 0.955, 0.03), new THREE.Vector2(SILL_IN - 0.02, 0.03), new THREE.Vector2(SILL_IN - 0.02, 0)], 96, SA0, SARC), teak);
  sillTop.position.y = SILL;
  group.add(sillFace, sillTop);

  const deco = new THREE.Group();
  const bookMat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 });
  const pageMat = new THREE.MeshStandardMaterial({ color: '#f1e6cc', roughness: 0.9 });
  const lampLights = [];
  const SEAT_A = Math.PI - STEP * 2;                         // 铺软垫的那一面窗台（左前方）
  const nearSeat = a => Math.abs(((a - SEAT_A + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < STEP * 0.7;

  // 一摞平放的书：越往上越小、每本歪一点；封皮彩色，里面略小一圈的奶白纸页从三边露出来
  const pile = (n, scale = 1) => {
    const g = new THREE.Group();
    let y = 0;
    for (let j = 0; j < n; j++) {
      const w = rand(0.15, 0.22) * scale * (1 - j * 0.05), d = rand(0.11, 0.15) * scale, t = rand(0.025, 0.045) * scale;
      const bk = new THREE.Mesh(new THREE.BoxGeometry(w, t, d), bookMat(pick(palette)));
      const pages = new THREE.Mesh(new THREE.BoxGeometry(w * 0.96, t * 0.8, d * 0.94), pageMat);
      pages.position.x = 0.006; bk.add(pages);
      bk.position.y = y + t / 2; bk.rotation.y = rand(-0.35, 0.35); bk.castShadow = true;
      g.add(bk); y += t;
    }
    return g;
  };
  const SLOTS = 15;
  for (let k = 0; k < SLOTS; k++) {
    const a = SA0 + (k + 0.5) / SLOTS * SARC + rand(-0.04, 0.04);
    if (nearSeat(a)) continue;
    const holder = new THREE.Group();
    holder.position.copy(at(a, (SILL_IN + R * 0.95) / 2, SILL + 0.03)); holder.rotation.y = a + Math.PI;
    const kind = k % 5 === 2 ? 'lamp' : k % 3 === 0 ? 'row' : 'pile';
    if (kind === 'pile') holder.add(pile(2 + Math.floor(Math.random() * 4)));
    else if (kind === 'row') {                                 // 立着的一排：最后一本斜靠着
      let xx = -0.1;
      const n = 3 + Math.floor(Math.random() * 4);
      for (let j = 0; j < n; j++) {
        const w = rand(0.025, 0.045), h = rand(0.17, 0.25);
        const bk = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.13), bookMat(pick(palette)));
        const lean = j === n - 1 ? -0.35 : 0;
        bk.position.set(xx + w / 2 + (lean ? h * 0.17 : 0), h / 2 * Math.cos(lean), 0); bk.rotation.z = lean; bk.castShadow = true;
        holder.add(bk); xx += w + 0.003;
      }
    } else {                                                   // 原子时代的小台灯 + 一本摊开的书
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.015, 24), brass);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.22, 8), brass); pole.position.y = 0.11;
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.075, 0.08, 32, 1, true), new THREE.MeshStandardMaterial({ color: '#f4e2bd', emissive: '#ffb860', emissiveIntensity: 0.9, side: THREE.DoubleSide, roughness: 0.8 }));
      shade.position.y = 0.24;
      const bulb = glow('#ffc070', 0.35, 0.8); bulb.position.y = 0.22;
      const poolGlow = glow('#ffb35a', 0.7, 0.35); poolGlow.position.y = 0.03;
      holder.add(base, pole, shade, bulb, poolGlow);
      if (lampLights.length < 1) { const L = new THREE.PointLight('#ffb866', 0.8, 1.6, 2); L.position.y = 0.2; holder.add(L); lampLights.push(L); }
      const open = new THREE.Group();
      for (const sgn of [-1, 1]) { const pg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.006, 0.12), pageMat); pg.position.set(sgn * 0.046, 0.006, 0); pg.rotation.z = sgn * 0.08; open.add(pg); }
      open.position.set(0.15, 0, 0.02); open.rotation.y = 0.3;
      holder.add(open);
    }
    deco.add(holder);
  }

  // 窗台软垫（参考：舱室里的读书角）：一张白色绗缝软垫 + 两个橙色靠枕 + 一摞书
  {
    const seat = new THREE.Group();
    seat.position.copy(at(SEAT_A, (SILL_IN + R * 0.95) / 2, SILL + 0.03)); seat.rotation.y = SEAT_A + Math.PI;
    const quilt = canvasTexture(256, 256, (g, W, Hh) => {      // 绗缝：一格格的浅凹痕
      g.fillStyle = '#f3efe6'; g.fillRect(0, 0, W, Hh);
      g.strokeStyle = 'rgba(150,140,125,0.35)'; g.lineWidth = 3;
      for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(k * W / 4, 0); g.lineTo(k * W / 4, Hh); g.stroke(); g.beginPath(); g.moveTo(0, k * Hh / 4); g.lineTo(W, k * Hh / 4); g.stroke(); }
      g.fillStyle = 'rgba(120,110,95,0.5)';
      for (let i = 1; i < 4; i++) for (let j = 1; j < 4; j++) { g.beginPath(); g.arc(i * W / 4, j * Hh / 4, 4, 0, Math.PI * 2); g.fill(); }
    }, [2, 1]);
    const pad = new THREE.Mesh(new RoundedBoxGeometry(0.88, 0.09, 0.32, 4, 0.04), new THREE.MeshStandardMaterial({ map: quilt, roughness: 0.95 }));
    pad.position.y = 0.045; seat.add(pad);
    const cushion = new THREE.MeshStandardMaterial({ color: '#d9532b', roughness: 0.9 });
    for (const [x, rz] of [[-0.3, 0.25], [-0.12, -0.15]]) {
      const c = new THREE.Mesh(new RoundedBoxGeometry(0.24, 0.24, 0.08, 4, 0.04), cushion);
      c.position.set(x, 0.2, 0.1); c.rotation.set(-0.35, 0, rz); c.castShadow = true; seat.add(c);
    }
    const pillow = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.2, 0.09, 4, 0.045), new THREE.MeshStandardMaterial({ color: '#f6f2ea', roughness: 0.95 }));
    pillow.position.set(0.3, 0.17, 0.1); pillow.rotation.set(-0.4, 0, -0.1); seat.add(pillow);
    const ps = pile(3, 0.8); ps.position.set(0.1, 0.09, -0.04); seat.add(ps);
    deco.add(seat);
  }

  // 窗前两把复古皮质休息椅 + 一张小圆桌（背对我们、面朝窗外：给画面一个"有人在这里看星星"的故事）
  const leather = new THREE.MeshStandardMaterial({ color: '#7a3e24', roughness: 0.45, metalness: 0.05 });
  const chair = () => {
    const c = new THREE.Group();
    const seatC = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.11, 0.46, 4, 0.04), leather); seatC.position.y = 0.3; c.add(seatC);
    const backC = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.48, 0.1, 4, 0.04), leather); backC.position.set(0, 0.56, -0.22); backC.rotation.x = -0.28; c.add(backC);
    for (const sx of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.5), teak); arm.position.set(sx * 0.27, 0.45, -0.02); c.add(arm);
      for (const sz of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.01, 0.46, 8), teak); leg.position.set(sx * 0.25, 0.22, sz * 0.2); leg.rotation.set(sz * 0.12, 0, sx * -0.08); c.add(leg); }
    }
    c.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return c;
  };
  for (const da of [-0.42, 0.42]) {
    const a = Math.PI + da, c = chair();
    c.position.copy(at(a, R * 0.62, 0)); c.rotation.y = a;   // 椅子朝外（面向窗）
    deco.add(c);
  }
  {
    const table = new THREE.Group();
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.025, 32), teak); top.position.y = 0.42;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.42, 8), brass); stem.position.y = 0.21;
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.015, 24), brass);
    const ps = pile(3, 0.75); ps.position.y = 0.435;
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.022, 0.06, 16), new THREE.MeshStandardMaterial({ color: '#f2ebe0', roughness: 0.4 })); cup.position.set(0.09, 0.465, 0.05);
    table.add(top, stem, foot, ps, cup);
    table.position.copy(at(Math.PI, R * 0.66, 0));
    deco.add(table);
  }

  // 几盆植物（让太空站有"人住着"的温度）：陶盆 + 一丛长叶
  const leafMat = new THREE.MeshStandardMaterial({ color: '#4d7a45', roughness: 0.7, side: THREE.DoubleSide });
  const leafGeo = new THREE.SphereGeometry(1, 10, 6); leafGeo.scale(0.05, 0.005, 0.2); leafGeo.translate(0, 0, 0.18);
  const plant = (h) => {
    const p = new THREE.Group();
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.2, 24), new THREE.MeshStandardMaterial({ color: '#b5653f', roughness: 0.8 })); pot.position.y = 0.1; p.add(pot);
    for (let k = 0; k < 22; k++) {
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      const y = 0.2 + rand(0.05, h);
      leaf.position.y = y; leaf.rotation.set(rand(-0.9, -0.2), rand(0, Math.PI * 2), 0, 'YXZ');
      leaf.scale.setScalar(rand(0.7, 1.3) * (1 - (y - 0.2) / h * 0.4));
      p.add(leaf);
    }
    p.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return p;
  };
  for (const [a, rr, h] of [[A0 - 0.13, R * 0.82, 0.75], [A0 + ARC + 0.13, R * 0.82, 0.6], [Math.PI + 0.95, R * 0.7, 0.5]]) {
    const pl = plant(h); pl.position.copy(at(a, rr, 0)); deco.add(pl);
  }
  // 书柜脚边的两摞书
  for (const a of [A0 + 0.2, A0 + ARC - 0.2]) { const ps = pile(6); ps.position.copy(at(a, R - 0.45, 0.004)); deco.add(ps); }
  group.add(deco);

  // ---- 3. 窗外：一整片 3D 月面地形（近处平缓、有坑；远处隆起成尖锐的雪白山脉）
  // 参考：60 年代太空海报——受光面奶白、背光面青蓝，明暗交界很"利"，像水粉平涂
  // 光照用自己的着色器算（固定的太阳方向），不受室内灯光影响：室内暗，窗外照样亮
  const SUN = new THREE.Vector3(0.8, 0.32, -0.12).normalize();     // 太阳在右前方、很低：山的右侧亮、左侧沉在青蓝影子里
  {
    const NR = 150, NS = 420, R_IN = 1.7, R_OUT = 48;
    // 陨石坑：位置随机，但避开火箭和窗前
    const craters = [];
    for (let k = 0; k < 26; k++) {
      const ang = rand(0, Math.PI * 2), rr = rand(4, 19), rad = rand(0.5, 2.6);
      const cx = Math.sin(ang) * rr, cz = Math.cos(ang) * rr;
      if (Math.hypot(cx - 7, cz + 10) < rad + 2) continue;
      craters.push([cx, cz, rad]);
    }
    const heightAt = (x, z) => {
      const r = Math.hypot(x, z);
      let h = (fbm3(x * 0.22, 0.3, z * 0.22, 3) - 0.5) * 0.35 * smooth(THREE.MathUtils.clamp((r - 2.2) / 3, 0, 1));   // 近处的小起伏（房间下面保持平）
      for (const [cx, cz, rad] of craters) {                    // 坑：中间凹、边上一圈隆起的坑唇
        const d = Math.hypot(x - cx, z - cz) / rad;
        if (d < 1.45) h += rad * 0.32 * (d < 1 ? (d * d - 1) * 0.5 + 0.1 : 0.1 * (1 - (d - 1) / 0.45));
      }
      const mask = smooth(THREE.MathUtils.clamp((r - 13) / 10, 0, 1));          // 13 米以外才开始起山
      if (mask > 0) {
        const range = 0.45 + 0.75 * fbm3(x * 0.035, 7.1, z * 0.035, 3);           // 山脉有高有低，中间留出几个"山口"能看到更远
        const peaks = Math.pow(ridged(x * 0.075, z * 0.075, 5), 1.5);
        h += mask * range * peaks * (6 + 10 * smooth(THREE.MathUtils.clamp((r - 20) / 22, 0, 1)));
      }
      if (r > 44) h += (r - 44) * 1.2;                          // 最外圈翘起来，藏住地形的边
      return h - 0.02;
    };
    const pos = new Float32Array(NR * NS * 3), tone = new Float32Array(NR * NS);
    for (let i = 0; i < NR; i++) {
      const r = R_IN + (R_OUT - R_IN) * Math.pow(i / (NR - 1), 1.7);          // 近处格子密、远处稀
      for (let j = 0; j < NS; j++) {
        const t = j / NS * Math.PI * 2, x = Math.sin(t) * r, z = Math.cos(t) * r, k = i * NS + j;
        pos.set([x, heightAt(x, z), z], k * 3);
        tone[k] = fbm3(x * 0.7, 3.3, z * 0.7, 3);                // 岩石的深浅斑驳
      }
    }
    const idx = [];
    for (let i = 0; i < NR - 1; i++) for (let j = 0; j < NS; j++) {
      const a0 = i * NS + j, a1 = i * NS + (j + 1) % NS, b0 = a0 + NS, b1 = a1 + NS;   // (j+1)%NS：首尾相接，没有接缝
      idx.push(a0, b0, a1, a1, b0, b1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('tone', new THREE.BufferAttribute(tone, 1));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const terrain = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: { sun: { value: SUN } },
      vertexShader: `attribute float tone; varying vec3 vN; varying vec3 vW; varying float vTone;
        void main() { vTone = tone; vN = normalize(mat3(modelMatrix) * normal); vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `uniform vec3 sun; varying vec3 vN; varying vec3 vW; varying float vTone;
        void main() {
          vec3 N = normalize(vN);
          float ndl = dot(N, sun);
          float flatness = smoothstep(0.55, 0.92, N.y);                    // 平的地方积"雪"（月尘），陡的地方露岩石
          vec3 lit   = mix(vec3(0.60, 0.66, 0.71), vec3(0.74, 0.75, 0.74), flatness);   // 着色器输出是线性色，最后会被提亮，所以这里给得比看上去暗
          vec3 shade = mix(vec3(0.06, 0.12, 0.18), vec3(0.16, 0.25, 0.33), flatness);
          float l = smoothstep(-0.03, 0.22, ndl);                          // 明暗交界收得很窄 = 海报感
          vec3 c = mix(shade, lit, l);
          c *= 0.7 + 0.6 * vTone;                                        // 斑驳更明显：月尘的深浅
          float dist = length(vW.xz);
          c = mix(c, vec3(0.42, 0.52, 0.62), smoothstep(14.0, 46.0, dist) * 0.35);   // 远处淡一点、蓝一点（空气透视，画家的手法）
          gl_FragColor = vec4(c, 1.0);
        }`,
      fog: false
    }));
    group.add(terrain);
  }

  const starCount = 2400, pos = new Float32Array(starCount * 3), col = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const u = rand(0.04, 1), a = rand(0, Math.PI * 2), r = Math.sqrt(1 - u * u), D = 45;
    pos.set([Math.cos(a) * r * D, u * D, Math.sin(a) * r * D], i * 3);
    const c = new THREE.Color().setHSL(rand(0.08, 0.62), rand(0.1, 0.45), rand(0.75, 1));
    col.set([c.r, c.g, c.b], i * 3);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 0.22, map: softGlow, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  group.add(stars);

  // 银河：沿一条斜着的大圆带，挤满细小的星点（参考：落地窗外"星星多到像撒了一把盐"）
  {
    const n = 9000, mp = new Float32Array(n * 3), mc = new Float32Array(n * 3);
    const axis = new THREE.Vector3(0.35, 0.55, -0.76).normalize();          // 银河带的法线（决定它在天上怎么斜）
    const u = new THREE.Vector3().crossVectors(axis, new THREE.Vector3(0, 1, 0)).normalize(), v = new THREE.Vector3().crossVectors(axis, u);
    const tmpV = new THREE.Vector3(), c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const t = rand(0, Math.PI * 2);
      const spread = (Math.random() + Math.random() + Math.random() - 1.5) * 0.16;   // 近似高斯：越靠中线越密
      tmpV.copy(u).multiplyScalar(Math.cos(t)).addScaledVector(v, Math.sin(t)).addScaledVector(axis, spread).normalize().multiplyScalar(46);
      if (tmpV.y < 0.5) { tmpV.y = Math.abs(tmpV.y) + 0.5; }                // 只要地平线以上
      mp.set([tmpV.x, tmpV.y, tmpV.z], i * 3);
      c.setHSL(rand(0.06, 0.6), rand(0.1, 0.35), rand(0.55, 0.9));
      mc.set([c.r, c.g, c.b], i * 3);
    }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
    mg.setAttribute('color', new THREE.BufferAttribute(mc, 3));
    // 光带：沿银河摆几十团极淡的柔光（暖白为主，夹一点青），星点之下垫一层"雾"
    for (let k = 0; k < 46; k++) {
      const t = k / 46 * Math.PI * 2 + rand(-0.05, 0.05);
      tmpV.copy(u).multiplyScalar(Math.cos(t)).addScaledVector(v, Math.sin(t)).addScaledVector(axis, rand(-0.05, 0.05)).normalize().multiplyScalar(47);
      if (tmpV.y < 2) continue;
      const neb = new THREE.Sprite(new THREE.SpriteMaterial({ map: softGlow, color: k % 5 === 0 ? '#7fb6c4' : '#e8d9c0', transparent: true, opacity: rand(0.05, 0.1), blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      neb.scale.setScalar(rand(7, 12)); neb.position.copy(tmpV);
      group.add(neb);
    }
    group.add(new THREE.Points(mg, new THREE.PointsMaterial({ size: 0.16, map: softGlow, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })));
  }

  // 十字闪光星（参考图里最"复古海报"的元素）：四芒长光 + 两短斜芒，暖橙 / 奶白 / 冰蓝
  const sparkleTex = canvasTexture(256, 256, (g) => {
    g.translate(128, 128);
    const ray = (len, w, rot) => { g.save(); g.rotate(rot); const lg = g.createLinearGradient(-len, 0, len, 0); lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,1)'); lg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = lg; g.beginPath(); g.moveTo(-len, 0); g.lineTo(0, -w); g.lineTo(len, 0); g.lineTo(0, w); g.fill(); g.restore(); };
    ray(126, 3.2, 0); ray(126, 3.2, Math.PI / 2); ray(46, 2, Math.PI / 4); ray(46, 2, -Math.PI / 4);
    const core = g.createRadialGradient(0, 0, 0, 0, 0, 22); core.addColorStop(0, 'rgba(255,255,255,1)'); core.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = core; g.beginPath(); g.arc(0, 0, 22, 0, Math.PI * 2); g.fill();
  });
  const sparkles = [];
  for (let k = 0; k < 34; k++) {
    const u = rand(0.12, 0.85), a = rand(0, Math.PI * 2), r = Math.sqrt(1 - u * u), D = 44;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkleTex, color: ['#ffd9a0', '#ffb070', '#fff4e0', '#a8e4ff'][k % 4], transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    const size = k < 6 ? rand(3.2, 4.6) : rand(1.1, 2.4);                       // 少数几颗特别大
    sp.scale.setScalar(size);
    sp.position.set(Math.cos(a) * r * D, u * D, Math.sin(a) * r * D);
    sp.userData = { size, phase: rand(0, 6.3), speed: rand(0.6, 1.6) };
    group.add(sp); sparkles.push(sp);
  }
  // 几缕极淡的星云：拉长的柔光，青绿 + 一点暖橙（只给天空一点"画出来的"层次，不抢戏）
  for (const [x, y, z, sx, sy, rot, c, o] of [[10, 26, -30, 34, 7, 0.5, '#3d8f9a', 0.16], [24, 20, -14, 26, 5, -0.3, '#c87a4a', 0.09], [-6, 32, 22, 30, 6, 0.9, '#4a7fa8', 0.12]]) {
    const neb = new THREE.Sprite(new THREE.SpriteMaterial({ map: softGlow, color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, rotation: rot }));
    neb.scale.set(sx, sy, 1); neb.position.set(x, y, z);
    group.add(neb);
  }

  // 地球：用 3D 噪声画大陆和云（在球面上取样，所以经线 0° 那里没有接缝）
  // 配色是低饱和的"老海报"版本：青绿的海、灰绿和土黄的陆地、奶白的云
  const EW = 768, EH = 384;
  const sphereAt = (px, py) => { const lon = px / EW * Math.PI * 2, lat = (0.5 - py / EH) * Math.PI; return [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon), lat]; };
  const earthTex = canvasTexture(EW, EH, (g) => {
    const img = g.createImageData(EW, EH), d = img.data;
    const deep = new THREE.Color('#3f7b8a'), shallow = new THREE.Color('#74b0b0'), sage = new THREE.Color('#87a07a'), ochre = new THREE.Color('#c4a877'), ice = new THREE.Color('#eef1ee'), c = new THREE.Color();
    for (let py = 0; py < EH; py++) for (let px = 0; px < EW; px++) {
      const [x, y, z, lat] = sphereAt(px, py);
      const n = fbm3(x * 1.7 + 3, y * 1.7, z * 1.7, 6);
      const SEA = 0.53;
      if (n < SEA) c.copy(deep).lerp(shallow, Math.pow(THREE.MathUtils.clamp(1 - (SEA - n) / 0.08, 0, 1), 2));   // 越靠岸越浅
      else {
        const dry = THREE.MathUtils.clamp(1 - Math.abs(Math.abs(lat) - 0.4) / 0.25, 0, 1) * fbm3(x * 4, y * 4, z * 4, 3) * 1.6;   // 南北纬 20° 附近有沙漠
        c.copy(sage).lerp(ochre, THREE.MathUtils.clamp(dry, 0, 1));
      }
      if (Math.abs(lat) > 1.2 + (fbm3(x * 5, y * 5, z * 5, 2) - 0.5) * 0.25) c.copy(ice);   // 极地冰盖
      const k = (py * EW + px) * 4;
      d[k] = c.r * 255; d[k + 1] = c.g * 255; d[k + 2] = c.b * 255; d[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
  earthTex.wrapS = THREE.RepeatWrapping;
  // 云：顺着纬度拉长的旋涡（y 方向放大 = 横向的云带），只存透明度
  const cloudTex = canvasTexture(EW, EH, (g) => {
    const img = g.createImageData(EW, EH), d = img.data;
    for (let py = 0; py < EH; py++) for (let px = 0; px < EW; px++) {
      const [x, y, z] = sphereAt(px, py);
      const warp = fbm3(x * 2, y * 2, z * 2, 3) * 1.5;                   // 扭一下坐标 = 旋涡感
      const n = fbm3(x * 2.6 + warp, y * 6 + warp, z * 2.6, 6);
      const a = THREE.MathUtils.clamp((n - 0.5) / 0.2, 0, 1);
      const k = (py * EW + px) * 4;
      d[k] = d[k + 1] = d[k + 2] = 255; d[k + 3] = a * a * 235;
    }
    g.putImageData(img, 0, 0);
  });
  cloudTex.wrapS = THREE.RepeatWrapping;
  const sunDir = new THREE.Vector3(0.55, 0.3, 0.78).normalize();   // 地球的光更朝向我们一点：大半个亮面，左边留一弯暗
  const earth = new THREE.Mesh(new THREE.SphereGeometry(9, 96, 64), new THREE.ShaderMaterial({
    uniforms: { map: { value: earthTex }, clouds: { value: cloudTex }, sun: { value: sunDir }, spin: { value: 0 } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main() { vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 wp = modelMatrix * vec4(position, 1.0); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `uniform sampler2D map; uniform sampler2D clouds; uniform vec3 sun; uniform float spin; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main() {
        vec3 c = texture2D(map, vec2(vUv.x + spin, vUv.y)).rgb;
        c = mix(vec3(dot(c, vec3(0.3, 0.55, 0.15))), c, 0.8);                     // 稍微去饱和：褪色的老海报感
        float cl = texture2D(clouds, vec2(vUv.x + spin * 1.35, vUv.y)).a;      // 云比地面转得快一点
        c = mix(c, vec3(0.97, 0.96, 0.93), cl);
        float d = dot(normalize(vN), sun);
        float day = smoothstep(-0.15, 0.35, d);
        float rim = pow(1.0 - max(dot(normalize(vN), vV), 0.0), 2.5);
        gl_FragColor = vec4(c * (0.1 + 1.0 * day) + vec3(0.55, 0.85, 0.95) * rim * (0.25 + 0.75 * day), 1.0);
      }`
  }));
  earth.position.set(-18.9, 11, -30.7);            // 大而低：下缘藏在远山后面，像参考图里压着地平线的巨大星球
  earth.rotation.z = 0.35;
  const halo = glow('#8fd0e0', 26, 0.22);
  halo.position.copy(earth.position);
  group.add(halo, earth);

  // 复古火箭：银色机身、红色尖顶和三片尾翼、一圈圆舷窗，停在窗外的月面上
  const rocket = new THREE.Group();
  const bodyProfile = [];
  for (let k = 0; k <= 20; k++) { const t = k / 20; bodyProfile.push(new THREE.Vector2(Math.sin(Math.PI * Math.min(1, t * 1.05)) * 0.55 * (1 - t * 0.25) + 0.02, t * 3.2)); }
  const chrome = new THREE.MeshStandardMaterial({ color: '#dfe4ea', metalness: 0.9, roughness: 0.22 });
  const redPaint = new THREE.MeshStandardMaterial({ color: '#d0453a', roughness: 0.45, metalness: 0.2 });
  rocket.add(new THREE.Mesh(new THREE.LatheGeometry(bodyProfile, 40), chrome));
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.7, 40), redPaint); nose.position.y = 3.45; rocket.add(nose);
  for (let k = 0; k < 3; k++) {
    const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.75, -0.35), new THREE.Vector2(0.7, 0.35), new THREE.Vector2(0, 1.2)]), { depth: 0.05, bevelEnabled: false }), redPaint);
    fin.position.y = 0.35;
    const holder = new THREE.Group(); fin.position.x = 0.4; holder.add(fin); holder.rotation.y = k / 3 * Math.PI * 2;
    rocket.add(holder);
  }
  const port = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 10, 32), brass);
  port.position.set(0, 2.2, 0.53); rocket.add(port);
  const portGlass = new THREE.Mesh(new THREE.CircleGeometry(0.15, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd27a').multiplyScalar(1.6) }));
  portGlass.position.set(0, 2.2, 0.52); rocket.add(portGlass);
  rocket.position.set(7, -0.02, -10);
  rocket.rotation.y = -0.4;
  rocket.traverse(o => { if (o.isMesh) o.castShadow = true; });
  group.add(rocket);

  const meteor = glow('#ffffff', 0.7, 0);
  group.add(meteor);

  // ---- 4. 地面：暖米色石板（12 边形，正好贴着玻璃）+ 中间一块圆形焦橙地毯
  const floorTex = canvasTexture(1024, 1024, (g, W, Hh) => {
    g.fillStyle = '#cbbda4'; g.fillRect(0, 0, W, Hh);
    for (let k = 0; k < 6000; k++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,250,240' : '90,75,55'},${rand(0.03, 0.08)})`; g.fillRect(rand(0, W), rand(0, Hh), rand(2, 8), rand(2, 8)); }
    g.strokeStyle = 'rgba(80,65,48,0.25)'; g.lineWidth = 2;
    for (let k = 1; k < 8; k++) { g.beginPath(); g.moveTo(k * W / 8, 0); g.lineTo(k * W / 8, Hh); g.stroke(); g.beginPath(); g.moveTo(0, k * Hh / 8); g.lineTo(W, k * Hh / 8); g.stroke(); }
  });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(R, N, Math.PI / 12), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.6 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.003;
  floor.receiveShadow = true;
  group.add(floor);
  const rugTex = canvasTexture(512, 512, (g, W) => {
    const c = W / 2;
    for (const [r, col] of [[1, '#b9532e'], [0.9, '#d9783f'], [0.84, '#b9532e'], [0.55, '#e3a24f'], [0.5, '#b9532e'], [0.18, '#e3a24f']]) { g.fillStyle = col; g.beginPath(); g.arc(c, c, c * r, 0, Math.PI * 2); g.fill(); }
    for (let k = 0; k < 4000; k++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,230,200' : '60,25,10'},0.08)`; g.fillRect(rand(0, W), rand(0, W), 1.5, 4); }   // 毛绒纤维
  });
  const rug = new THREE.Mesh(new THREE.CircleGeometry(R * 0.42, 64), new THREE.MeshStandardMaterial({ map: rugTex, roughness: 1 }));
  rug.rotation.x = -Math.PI / 2; rug.position.y = 0.006; rug.receiveShadow = true;
  group.add(rug);

  // 地球照下来的蓝光
  const earthLight = new THREE.DirectionalLight('#9cc0ff', 0.45);
  earthLight.position.copy(earth.position);
  group.add(earthLight);

  // 原子灯（代替蜡烛的发光球）
  const crystal = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd9a0').multiplyScalar(1.8) });
  const crystalGeo = new THREE.OctahedronGeometry(0.012);      // 漂浮的小光点：做得很小，像屋里飘着的几颗萤火，不抢窗外的戏

  return {
    group, crystal, crystalGeo,
    // 书架信息：library.js 把真书插进去（shelves = 每层书架板的高度；depth = 书架深度）
    shelves: { R, ys: SHELF_Y, depth: 0.26, arc: [A0, A0 + ARC], readable: [3, 2], locked: [4], setReserved: fillShelves },
    look: {
      hideWalls: true,                      // 原来的墙画整个换掉（12 面落地窗 + 玻璃屋顶 + 一段书柜）
      wallDim: [0.52, 0.5, 0.6],
      background: 0x04050b,
      fog: [0x04050b, 12, 30],              // 远处的月面和环形山沉进黑暗（乘以房间半径）
      hemi: { sky: 0xc9d4ec, ground: 0x7a5c44, intensity: 0.6 },   // 室内偏暗：窗外显得更亮更大
      candle: 0xffcf8a,                     // 室内暖光：和窗外冷蓝的太空形成对比（复古海报的配色）
      candleLight: 0xffc98a,
      fire: [0xffc46b, 0xffa040, 0xffe3a0, 0xffa040, 0xffc46b], fireLight: 0xff8a3d,
      hideFire: true,                       // 没有墙画上的壁炉了
      ember: [1, 0.55, 0.18],
      fireVolume: 0,
      dust: 0xffe6b8,
      wand: 0xfff0d0,
      gravity: { bobAmp: 0.034, bobSpeed: 0.5, spin: 0.25 }   // 低重力：飘得更高、更慢，还会轻轻自转
    },
    update(time) {
      earth.material.uniforms.spin.value = time * 0.004;
      stars.material.opacity = 0.85 + Math.sin(time * 0.7) * 0.1;
      sparkles.forEach(sp => { const d = sp.userData, tw = 0.75 + 0.25 * Math.sin(time * d.speed + d.phase); sp.scale.setScalar(d.size * tw); sp.material.opacity = 0.6 + 0.4 * tw; });
      const m = (time % 11) / 11;
      meteor.position.set(20 - m * 40, 22 - m * 8, -18 + m * 6);
      meteor.material.opacity = m < 0.18 ? Math.sin(m / 0.18 * Math.PI) * 0.9 : 0;
    }
  };
}

// ---------------------------------------------------------------- 皮肤目录（菜单用）
export const SKINS = [
  { id: 'classic', icon: '🕯️', name: { en: 'Candlelit Library', zh: '烛光书房' }, unlock: null },
  { id: 'moon', icon: '🌙', name: { en: 'Moon Library', zh: '月球图书馆' }, unlock: { book: 'paper-moon', hint: { en: 'Finish “The Paper Moon” to unlock', zh: '读完《纸月亮》解锁' } } }
];
const SKIN_KEY = 'magic-library/skin';
export const loadSkin = () => { try { return localStorage.getItem(SKIN_KEY) || 'classic'; } catch { return 'classic'; } };
export const saveSkin = id => { try { localStorage.setItem(SKIN_KEY, id); } catch { /* ignore */ } };
