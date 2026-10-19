// sets.js — 阅读地点的 3D 置景（海边 / 月亮上 / 外太空），标准和「家里的书桌」一样：
// 书真的放在一个空间里——有接住书和道具投影的地面、真光源、会动的远景。
// 原则：背景只负责氛围，要简洁——光、天空、一两件标志性的小东西，不堆道具，不抢书的注意力。
//
// 每个置景返回 { group, update(time), look }：
//   look 是这个地方的"光照配方"（app.js 的 useSet 用它调环境光 / 主光 / 雾 / 背景色）
// 坐标和书桌一致：书页 y = 0，书底（地面）y = TABLE_Y；书宽约 ±0.93、纵深约 ±0.53，镜头从 +z 上方看。
// 道具围着书摆在 x ∈ [-2.3, 2.3]、z ∈ [-1.4, 1.1]，不挡书；远景放在 z < -3。

import * as THREE from '../vendor/three.module.min.js';
import { buildDeskSet, canvasTexture, rand, shadowy, TABLE_Y } from './environment.js';

// ---------------------------------------------------------------- 共用的小东西

/**
 * 由"高度图"算出法线贴图：地面的沙纹、颗粒、陨石坑不再是画上去的颜色，而是真有起伏——
 * 侧光一照就有明暗（精致感的来源之一）。drawHeight(g, W, H) 用灰度画高度（白 = 高）。
 */
function normalMap(size, drawHeight, strength = 2.5, repeat = null) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, size, size);
  drawHeight(g, size, size);
  const src = g.getImageData(0, 0, size, size).data;
  const out = g.createImageData(size, size);
  const h = (x, y) => src[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;   // 四方连续：边缘接得上
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (h(x + 1, y) - h(x - 1, y)) * strength, dy = (h(x, y + 1) - h(x, y - 1)) * strength;
    const len = Math.hypot(dx, dy, 1), i = (y * size + x) * 4;
    out.data[i] = (-dx / len * 0.5 + 0.5) * 255;
    out.data[i + 1] = (dy / len * 0.5 + 0.5) * 255;
    out.data[i + 2] = (1 / len * 0.5 + 0.5) * 255;
    out.data[i + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}

/** 柔和的接触阴影：书（或道具）和地面接触的地方一圈暗，东西才"坐"在地上，不像浮着。 */
function contactShadow(w, d, opacity = 0.5) {
  const tex = canvasTexture(256, 256, (g) => {
    const r = g.createRadialGradient(128, 128, 20, 128, 128, 128);
    r.addColorStop(0, 'rgba(0,0,0,1)'); r.addColorStop(0.55, 'rgba(0,0,0,0.55)'); r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, 256, 256);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  return m;
}

/** 大气光圈：球体边缘一圈柔和的光（地球、小星球）。菲涅尔：越靠边越亮。 */
function atmosphere(radius, color, power = 3, intensity = 1.2) {
  return new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 48), new THREE.ShaderMaterial({
    uniforms: { glow: { value: new THREE.Color(color) }, power: { value: power }, intensity: { value: intensity } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 glow; uniform float power; uniform float intensity; varying vec3 vN; varying vec3 vV;
      void main() { float f = pow(1.0 - abs(dot(vN, vV)), power) * intensity; gl_FragColor = vec4(glow * f, f); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide
  }));
}

/** 水彩感的云：一团团叠起来的软圆，顶上亮、底下带一点蓝灰。 */
function paintedCloud() {
  return canvasTexture(512, 256, (g, W, H) => {
    const puffs = Array.from({ length: 14 }, () => [rand(80, W - 80), rand(H * 0.45, H * 0.7), rand(34, 70)]);
    for (const [x, y, r] of puffs) {                          // 底部的阴影层
      const s = g.createRadialGradient(x, y + r * 0.35, 0, x, y + r * 0.35, r);
      s.addColorStop(0, 'rgba(176,196,220,0.55)'); s.addColorStop(1, 'rgba(176,196,220,0)');
      g.fillStyle = s; g.beginPath(); g.arc(x, y + r * 0.35, r, 0, Math.PI * 2); g.fill();
    }
    for (const [x, y, r] of puffs) {                          // 亮面
      const s = g.createRadialGradient(x - r * 0.2, y - r * 0.3, 0, x, y, r);
      s.addColorStop(0, 'rgba(255,255,255,0.95)'); s.addColorStop(0.7, 'rgba(250,250,252,0.6)'); s.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = s; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
  });
}

/** 满天星星：一层很远的点。 */
function starField(count = 1400, radius = 26, minY = 0.05) {
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = rand(minY, 1), a = rand(0, Math.PI * 2), r = Math.sqrt(1 - u * u);
    pos.set([Math.cos(a) * r * radius, u * radius * 0.8 + TABLE_Y, Math.sin(a) * r * radius - 4], i * 3);
    const c = new THREE.Color().setHSL(rand(0.55, 0.15 + 0.55), rand(0.2, 0.6), rand(0.75, 1));
    col.set([c.r, c.g, c.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const dot = canvasTexture(32, 32, (g) => {
    const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.4, 'rgba(255,255,255,0.5)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 32, 32);
  });
  const mat = new THREE.PointsMaterial({ size: 0.12, map: dot, vertexColors: true, transparent: true, depthWrite: false, fog: false, sizeAttenuation: true });
  return new THREE.Points(geo, mat);
}

/** 一团柔光（太阳、星云、火山口的光）：加法混合的贴图精灵。 */
function glowSprite(color, size, opacity = 1) {
  const tex = canvasTexture(128, 128, (g) => {
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  s.scale.setScalar(size);
  return s;
}

/** 天空穹顶：一个从里面看的大球，竖直方向的渐变。 */
function skyDome(stops, radius = 40) {
  const tex = canvasTexture(16, 512, (g, W, H) => {
    const grad = g.createLinearGradient(0, 0, 0, H);
    stops.forEach(([t, c]) => grad.addColorStop(t, c));
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 24), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false }));
  m.position.y = TABLE_Y;
  return m;
}

/** 一块平铺在地上的布（毛巾 / 野餐毯）：书垫在上面。 */
function cloth(tex, w, d) {
  const geo = new THREE.PlaneGeometry(w, d, 24, 16);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 5) * 0.004 + Math.cos(p.getY(i) * 6) * 0.004);   // 一点点褶皱
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  return m;
}

// ================================================================ 海边：爱尔兰的海——稍微深沉一点，不是亚热带的海
// 北大西洋的海岸：柔和的阴天、冷光；海是带一点绿的深石板蓝（参考 "Irish Sea" #5F8582、"Atlantic Sea" #477190），
// 近岸灰绿 → 中间深石板蓝 → 远处融进灰色的天；浪花是偏灰的白；
// 深色的沙夹着卵石、几块湿漉漉的黑礁石；远处一道绿顶灰崖的海岬，上面一座小白灯塔；
// 书下面垫一块奶白色的阿兰针织毯（爱尔兰的麻花针）。简洁，只给氛围。
function buildSeasideSet() {
  const set = new THREE.Group();
  // 海的颜色：近 → 远（用顶点颜色按距离渐变，不随贴图重复）
  const SEA_NEAR = new THREE.Color('#5f8582'), SEA_MID = new THREE.Color('#3d6070'), SEA_FAR = new THREE.Color('#34505f');

  // 地面：深灰褐色的沙 + 卵石（卵石用法线贴图做出圆鼓鼓的起伏）
  const shoreTex = canvasTexture(1024, 1024, (g, W, H) => {
    g.fillStyle = '#7d7468'; g.fillRect(0, 0, W, H);
    for (let k = 0; k < 16000; k++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '200,190,175' : '40,36,32'},${rand(0.08, 0.22)})`; g.fillRect(rand(0, W), rand(0, H), rand(1, 2.5), rand(1, 2.5)); }
    for (let k = 0; k < 2600; k++) {                           // 卵石：小、密、颜色和沙子接近（不要一个个白点）
      const x = rand(0, W), y = rand(0, H), r = rand(2, 6);
      g.fillStyle = ['#8a8379', '#958d80', '#6f727a', '#7f786d', '#a09787'][k % 5];
      g.beginPath(); g.ellipse(x, y, r, r * rand(0.6, 0.9), rand(0, 3), 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.08)'; g.beginPath(); g.ellipse(x - r * 0.25, y - r * 0.3, r * 0.45, r * 0.3, 0, 0, Math.PI * 2); g.fill();
    }
  }, { repeat: [8, 4] });
  const pebbles = normalMap(512, (g, W, H) => {
    for (let k = 0; k < 900; k++) {
      const x = rand(0, W), y = rand(0, H), r = rand(2, 5);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
  }, 3, [12, 6]);
  const shoreGeo = new THREE.PlaneGeometry(16, 8, 64, 32);
  const sp = shoreGeo.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i), y = sp.getY(i);
    sp.setZ(i, Math.sin(x * 0.9) * 0.02 + Math.cos(y * 1.3 + x * 0.4) * 0.02 - Math.max(0, y - 1.5) ** 1.5 * 0.12);   // 远处沉到海面以下
  }
  shoreGeo.computeVertexNormals();
  const shore = new THREE.Mesh(shoreGeo, new THREE.MeshStandardMaterial({ map: shoreTex, normalMap: pebbles, normalScale: new THREE.Vector2(1, 1), roughness: 0.9 }));
  shore.rotation.x = -Math.PI / 2;
  shore.position.set(0, TABLE_Y - 0.02, 0);
  shore.receiveShadow = true;
  set.add(shore);

  // 海：深石板蓝，近处偏灰绿、远处更深更灰；细浪的法线让它有一点光泽（阴天：光泽很弱）
  const seaTex = canvasTexture(512, 512, (g, W, H) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);           // 中性底：颜色交给顶点颜色
    for (let k = 0; k < 4000; k++) { g.fillStyle = `rgba(0,0,0,${rand(0.02, 0.07)})`; g.fillRect(rand(0, W), rand(0, H), rand(2, 8), 1); }
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 2;
    for (let k = 0; k < 70; k++) { const x = rand(0, W), y = rand(0, H); g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 16, y - 4, x + 32, y); g.stroke(); }
  }, { repeat: [6, 4] });
  const waveBump = normalMap(512, (g, W, H) => {
    for (let k = 0; k < 240; k++) {
      const x = rand(0, W), y = rand(0, H), w = rand(30, 100);
      const s2 = g.createLinearGradient(0, y - 4, 0, y + 4);
      s2.addColorStop(0, 'rgba(0,0,0,0)'); s2.addColorStop(0.5, 'rgba(255,255,255,0.5)'); s2.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = s2; g.beginPath(); g.ellipse(x, y, w, 4, 0, 0, Math.PI * 2); g.fill();
    }
  }, 4, [10, 6]);
  const seaGeo = new THREE.PlaneGeometry(60, 24, 80, 40);
  {
    const q = seaGeo.attributes.position, cols = new Float32Array(q.count * 3), c = new THREE.Color();
    for (let k = 0; k < q.count; k++) {
      const t = (q.getY(k) + 12) / 24;                           // 0 = 岸边，1 = 地平线
      if (t < 0.25) c.copy(SEA_NEAR).lerp(SEA_MID, t / 0.25); else c.copy(SEA_MID).lerp(SEA_FAR, (t - 0.25) / 0.75);
      cols.set([c.r, c.g, c.b], k * 3);
    }
    seaGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  }
  const sea = new THREE.Mesh(seaGeo, new THREE.MeshStandardMaterial({ map: seaTex, vertexColors: true, normalMap: waveBump, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.32, metalness: 0.02 }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, TABLE_Y - 0.13, -14.6);
  set.add(sea);
  const seaBase = Float32Array.from(seaGeo.attributes.position.array);

  // 湿沙：浪退下去后留下的一圈深色、发亮的沙（低粗糙度 → 反一点天光），跟着潮水进退
  const wetTex = canvasTexture(16, 128, (g, W, H) => {
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, 'rgba(58,56,54,0)'); gr.addColorStop(0.35, 'rgba(58,56,54,0.75)'); gr.addColorStop(1, 'rgba(58,56,54,0.9)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  });
  const wet = new THREE.Mesh(new THREE.PlaneGeometry(22, 1.6), new THREE.MeshStandardMaterial({ map: wetTex, transparent: true, depthWrite: false, roughness: 0.18, metalness: 0.1, color: '#9aa4aa' }));
  wet.rotation.x = -Math.PI / 2;
  wet.position.set(0, TABLE_Y - 0.085, -3.0);
  set.add(wet);

  // 浪花：蕾丝一样的白沫（前沿不规则，后面渐渐散开），三层错开节奏
  const laceTex = () => canvasTexture(1024, 128, (g, W, H) => {
    for (let x = 0; x < W; x += 3) {
      const edge = H * (0.18 + (Math.sin(x / 31) * 0.5 + Math.sin(x / 11 + 2) * 0.3 + Math.sin(x / 5) * 0.2) * 0.12);
      const gr = g.createLinearGradient(0, edge, 0, H);
      gr.addColorStop(0, 'rgba(236,240,240,0.95)'); gr.addColorStop(0.18, 'rgba(236,240,240,0.55)'); gr.addColorStop(1, 'rgba(236,240,240,0)');
      g.fillStyle = gr; g.fillRect(x, edge, 3, H - edge);
    }
    g.globalCompositeOperation = 'destination-out';          // 打出一个个小洞：泡沫的蕾丝感
    for (let k = 0; k < 900; k++) { g.fillStyle = `rgba(0,0,0,${rand(0.4, 0.9)})`; g.beginPath(); g.ellipse(rand(0, W), rand(H * 0.25, H), rand(2, 9), rand(1, 4), 0, 0, Math.PI * 2); g.fill(); }
  }, { repeat: [3, 1] });
  const foams = [0, 1, 2].map(k => {
    const tex = laceTex();
    const m = new THREE.Mesh(new THREE.PlaneGeometry(22, 0.9), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, TABLE_Y - 0.075 + k * 0.002, -3.0);
    m.userData = { tex, phase: k * 2.1, speed: 0.78 - k * 0.07 };
    set.add(m);
    return m;
  });

  // 天：北大西洋柔和的阴天——上面浅灰蓝，地平线一层亮的薄雾；几道又长又薄的云
  set.add(skyDome([[0, '#9fb0c2'], [0.4, '#c8d3dd'], [0.5, '#e4e9ee'], [1, '#e4e9ee']]));
  const streakTex = canvasTexture(512, 64, (g, W, H) => {
    const gr = g.createLinearGradient(0, 0, W, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.3, 'rgba(250,252,255,0.75)'); gr.addColorStop(0.7, 'rgba(236,242,248,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.ellipse(W / 2, H / 2, W / 2, H * 0.32, 0, 0, Math.PI * 2); g.fill();
  });
  const clouds = [[-8, 4.6, -24, 16], [5, 5.6, -26, 20], [14, 3.8, -22, 12], [-2, 3.2, -23, 10]].map(([x, y, z, w]) => {
    const c = new THREE.Sprite(new THREE.SpriteMaterial({ map: streakTex, transparent: true, depthWrite: false, fog: false }));
    c.position.set(x, y, z); c.scale.set(w, w / 9, 1);
    set.add(c);
    return c;
  });
  // 低低压着的云层：一团团灰白的云，肚子是灰蓝的
  const bankTex = () => canvasTexture(768, 256, (g, W, H) => {
    for (let k = 0; k < 26; k++) {
      const x = rand(60, W - 60), y = rand(H * 0.35, H * 0.7), r = rand(40, 90);
      const sh = g.createRadialGradient(x, y + r * 0.4, 0, x, y + r * 0.4, r);
      sh.addColorStop(0, 'rgba(128,142,158,0.55)'); sh.addColorStop(1, 'rgba(128,142,158,0)');
      g.fillStyle = sh; g.beginPath(); g.arc(x, y + r * 0.4, r, 0, Math.PI * 2); g.fill();
      const lt = g.createRadialGradient(x, y - r * 0.2, 0, x, y, r);
      lt.addColorStop(0, 'rgba(244,246,248,0.85)'); lt.addColorStop(0.7, 'rgba(226,232,238,0.5)'); lt.addColorStop(1, 'rgba(226,232,238,0)');
      g.fillStyle = lt; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
  });
  [[-14, 6.2, -27, 22], [6, 7.2, -28, 26], [20, 5.4, -26, 18], [-2, 4.6, -26, 16]].forEach(([x, y, z, w]) => {
    const c = new THREE.Sprite(new THREE.SpriteMaterial({ map: bankTex(), transparent: true, depthWrite: false, fog: false }));
    c.position.set(x, y, z); c.scale.set(w, w / 3, 1);
    set.add(c);
  });
  // 云缝里漏下来的光（几道很淡的光柱）+ 被照亮的一片海
  const rayTex = canvasTexture(64, 256, (g, W, H) => {
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, 'rgba(255,248,226,0.9)'); gr.addColorStop(1, 'rgba(255,248,226,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'destination-in';
    const side = g.createLinearGradient(0, 0, W, 0);
    side.addColorStop(0, 'rgba(0,0,0,0)'); side.addColorStop(0.5, 'rgba(0,0,0,1)'); side.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = side; g.fillRect(0, 0, W, H);
  });
  const rays = [[3.2, 0.9, 0.16], [4.6, 1.4, 0.11], [6.0, 0.7, 0.13]].map(([x, w, o]) => {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(w, 6.5), new THREE.MeshBasicMaterial({ map: rayTex, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    r.position.set(x, TABLE_Y + 3.1, -18);
    r.rotation.z = -0.22;
    r.userData.o = o;
    set.add(r);
    return r;
  });
  const sunPatch = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ map: canvasTexture(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(220,232,236,0.9)'); gr.addColorStop(1, 'rgba(220,232,236,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  }), transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  sunPatch.rotation.x = -Math.PI / 2;
  sunPatch.scale.set(4.5, 1.6, 1);
  sunPatch.position.set(4.8, TABLE_Y - 0.05, -15);
  set.add(sunPatch);

  const haze = new THREE.Mesh(new THREE.PlaneGeometry(80, 3), new THREE.MeshBasicMaterial({
    map: canvasTexture(16, 128, (g, W, H) => { const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(232,238,244,0)'); gr.addColorStop(0.55, 'rgba(232,238,244,0.8)'); gr.addColorStop(1, 'rgba(232,238,244,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); }),
    transparent: true, depthWrite: false, fog: false }));
  haze.position.set(0, TABLE_Y + 0.5, -26);
  set.add(haze);

  // 远处的海岬：灰色的崖壁 + 绿色的顶（像莫赫悬崖），上面一座小白灯塔
  const cliffShape = new THREE.Shape();
  cliffShape.moveTo(-1, 0);
  [[0, 1.4], [1.2, 1.7], [2.6, 1.65], [3.8, 1.9], [5.2, 1.75], [6.4, 1.5], [7.6, 0]].forEach(([x, y]) => cliffShape.lineTo(x, y));
  cliffShape.lineTo(-1, 0);
  const cliffTex = canvasTexture(512, 256, (g, W, H) => {
    g.fillStyle = '#5f6670'; g.fillRect(0, 0, W, H);
    for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '40,44,50' : '140,146,152'},0.35)`; g.fillRect(rand(0, W), rand(H * 0.15, H), rand(2, 6), rand(30, 120)); }   // 竖直的岩层
    g.fillStyle = '#5f8a4e'; g.fillRect(0, 0, W, H * 0.16);                       // 崖顶的草
    g.fillStyle = '#7aa362'; g.fillRect(0, 0, W, H * 0.06);
  });
  const cliffGeo = new THREE.ShapeGeometry(cliffShape);
  const uv = cliffGeo.attributes.uv, cp = cliffGeo.attributes.position;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, (cp.getX(k) + 1) / 8.6, cp.getY(k) / 1.9);
  const cliff = new THREE.Mesh(cliffGeo, new THREE.MeshStandardMaterial({ map: cliffTex, roughness: 1, color: '#c8ccd4' }));
  cliff.position.set(-12.5, TABLE_Y - 0.1, -20);
  cliff.scale.set(1.6, 1.4, 1);
  set.add(cliff);
  const lighthouse = new THREE.Group();
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 0.7, 16), new THREE.MeshStandardMaterial({ color: '#f4f2ec', roughness: 0.7 }));
  tower.position.y = 0.35;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.12, 16), new THREE.MeshStandardMaterial({ color: '#2e3440' }));
  top.position.y = 0.76;
  const beacon = glowSprite('#fff2c8', 0.9, 0);
  beacon.position.y = 0.76;
  lighthouse.add(tower, top, beacon);
  lighthouse.position.set(-12.5 + 3.8 * 1.6, TABLE_Y - 0.1 + 1.9 * 1.4, -20);
  set.add(lighthouse);

  // 几块被海水打湿的黑礁石（近处两侧，不挡书）
  const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.05 });   // 湿：粗糙度低，有一点反光；颜色在顶点上（底部海藻绿）
  for (const [x, z, s] of [[-2.2, -1.1, 0.34], [-1.75, -1.25, 0.18], [2.3, -1.2, 0.28], [2.05, -0.95, 0.14]]) {
    const geo = new THREE.IcosahedronGeometry(s, 5);          // 细分高一点：颜色过渡是柔的，不是一块块三角
    const q = geo.attributes.position;
    for (let k = 0; k < q.count; k++) { const f = 1 + (Math.sin(q.getX(k) * 17) + Math.cos(q.getZ(k) * 13)) * 0.06; q.setXYZ(k, q.getX(k) * f, q.getY(k) * f * 0.7, q.getZ(k) * f); }
    geo.computeVertexNormals();
    const cols = new Float32Array(q.count * 3), cc = new THREE.Color();
    for (let k = 0; k < q.count; k++) {
      const h = q.getY(k) / (s * 0.7);                          // -1 底 … 1 顶
      cc.set('#3b3e44');
      if (h < -0.15) cc.lerp(new THREE.Color('#3f4a2c'), Math.min(1, (-0.15 - h) * 2.2));   // 海藻
      if (Math.random() < 0.025 && h > -0.2) cc.lerp(new THREE.Color('#8d8a80'), 0.6);       // 零星的藤壶（淡淡的，不抢眼）
      cols.set([cc.r, cc.g, cc.b], k * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const rock = new THREE.Mesh(geo, rockMat);
    rock.position.set(x, TABLE_Y + s * 0.25, z);
    rock.rotation.y = rand(0, 3);
    set.add(shadowy(rock));
  }

  // 阿兰针织毯：奶白色，一道道麻花纹（法线贴图做出凹凸）
  const aranTex = canvasTexture(1024, 640, (g, W, H) => {
    g.fillStyle = '#ece4d3'; g.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 4) { g.fillStyle = 'rgba(120,100,70,0.05)'; g.fillRect(0, y, W, 2); }
  });
  const aranBump = normalMap(512, (g, W, H) => {
    const col = W / 8;
    for (let c = 0; c < 8; c++) {
      const cx = c * col + col / 2;
      if (c % 2 === 0) {                                     // 麻花：两股交叉的绞绳
        for (let y = 0; y < H; y += 2) {
          const t = y / 40;
          for (const sgn of [1, -1]) {
            const x = cx + Math.sin(t) * col * 0.22 * sgn;
            const gr = g.createRadialGradient(x, y, 0, x, y, col * 0.18);
            gr.addColorStop(0, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = gr; g.fillRect(x - col * 0.2, y - 2, col * 0.4, 4);
          }
        }
      } else {                                               // 菱形纹（钻石针）
        for (let y = 0; y < H; y += 24) {
          g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 4;
          g.beginPath(); g.moveTo(cx - col * 0.35, y); g.lineTo(cx, y + 12); g.lineTo(cx + col * 0.35, y); g.stroke();
        }
      }
      g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(c * col, 0, 3, H);                    // 列与列之间的凹槽
    }
  }, 3);
  const blanket = cloth(aranTex, 2.3, 1.42);
  blanket.material.normalMap = aranBump;
  blanket.material.normalScale = new THREE.Vector2(1.2, 1.2);
  blanket.position.set(0, TABLE_Y + 0.004, 0.06);
  blanket.rotation.z = -0.04;
  set.add(blanket);
  const under = contactShadow(2.3, 1.45, 0.45);
  under.position.set(0, TABLE_Y + 0.006, 0.02);
  set.add(under);

  // 风：近处两丛滨草（爱尔兰沙丘上常见的那种），细长、淡黄绿，在海风里一直轻轻摇
  const grassMat = new THREE.MeshStandardMaterial({ color: '#a8a670', roughness: 0.8, side: THREE.DoubleSide });
  const blades = [];
  for (const [cx, cz, n] of [[-2.15, 0.78, 26], [2.25, 0.62, 20]]) {
    for (let k = 0; k < n; k++) {
      const h = rand(0.22, 0.42), geo = new THREE.PlaneGeometry(0.012, h, 1, 6).translate(0, h / 2, 0);
      const blade = new THREE.Mesh(geo, grassMat);
      blade.position.set(cx + rand(-0.12, 0.12), TABLE_Y, cz + rand(-0.08, 0.08));
      blade.rotation.y = rand(0, Math.PI);
      blade.userData = { base: Float32Array.from(geo.attributes.position.array), h, lean: rand(0.1, 0.35), phase: rand(0, 6) };
      blade.castShadow = true;
      set.add(blade);
      blades.push(blade);
    }
  }

  // 海鸥
  const gullTex = canvasTexture(64, 32, (g) => {
    g.strokeStyle = '#3a4250'; g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath(); g.moveTo(4, 18); g.quadraticCurveTo(16, 4, 32, 18); g.quadraticCurveTo(48, 4, 60, 18); g.stroke();
  });
  const gulls = Array.from({ length: 2 }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: gullTex, transparent: true, depthWrite: false, fog: false }));
    s.scale.set(0.5, 0.25, 1);
    s.userData = { r: rand(5, 9), y: rand(2.2, 3.6), speed: rand(0.04, 0.08), phase: rand(0, 6), z: rand(-12, -9) };
    set.add(s);
    return s;
  });

  return {
    group: set,
    // 阴天的冷光：环境光足、主光弱一点偏冷；雾是灰蓝色
    // cameraPitch：海边的默认镜头低一点（更接近平视），打开就能看到海、云层和光柱
    look: { background: '#dfe5eb', hemi: 1.05, key: 0.9, keyColor: '#e9eef6', fog: ['#dfe6ee', 6, 30], shadowExtent: 2.6, cameraPitch: 1.26 },
    update(time) {
      const a = seaGeo.attributes.position;
      for (let i = 0; i < a.count; i++) {
        const x = seaBase[i * 3], y = seaBase[i * 3 + 1];
        const near = Math.max(0, 1 - (y + 12) / 14);           // 离岸越近，涌浪越明显
        a.setZ(i, Math.sin(x * 0.6 + time * 1.2) * 0.05 + Math.sin(y * 1.7 + time * 1.5) * (0.04 + near * 0.07) + Math.sin(y * 0.6 - x * 0.2 + time * 0.7) * 0.05);   // 北大西洋的涌浪
      }
      a.needsUpdate = true;
      seaTex.offset.set(time * 0.004, time * 0.012);
      waveBump.offset.set(time * 0.007, time * 0.02);
      // 潮水：湿沙跟着进退；三层浪花一层推上来（变亮、往岸边走）、一层退下去（变淡）
      const tide = Math.sin(time * 0.78);
      wet.position.z = -2.95 + tide * 0.3;
      foams.forEach(f => {
        const u = f.userData, ph = (time * u.speed + u.phase) % (Math.PI * 2);
        const k = (Math.sin(ph) + 1) / 2;                          // 0 = 退到最远，1 = 推到最近
        f.position.z = -3.45 + k * 0.75;
        f.material.opacity = Math.sin(ph) > 0 ? 0.25 + k * 0.7 : k * 0.5;   // 推上来时亮，退下去时淡
        u.tex.offset.x = time * 0.01 + u.phase;
      });
      clouds.forEach((c, k) => { c.position.x += 0.002 * (k + 1); if (c.position.x > 22) c.position.x = -22; });
      beacon.material.opacity = Math.max(0, Math.sin(time * 0.9)) ** 12;   // 灯塔每 7 秒左右扫过来一次
      rays.forEach((r, k) => { r.material.opacity = r.userData.o * (0.7 + 0.3 * Math.sin(time * 0.3 + k * 1.7)); });   // 云在走，光柱忽明忽暗
      sunPatch.material.opacity = 0.35 + 0.12 * Math.sin(time * 0.3);
      blades.forEach(b => {                                       // 草：越往上弯得越多，跟着阵风摆
        const u = b.userData, pos = b.geometry.attributes.position;
        const gust = u.lean + Math.sin(time * 1.3 + u.phase) * 0.12 + Math.sin(time * 0.37) * 0.1;
        for (let k = 0; k < pos.count; k++) {
          const y = u.base[k * 3 + 1], t = y / u.h;
          pos.setX(k, u.base[k * 3] + gust * t * t * u.h);
          pos.setY(k, y - Math.abs(gust) * t * t * u.h * 0.25);
        }
        pos.needsUpdate = true;
      });
      gulls.forEach(s => {
        const u = s.userData, t = time * u.speed + u.phase;
        s.position.set(Math.cos(t) * u.r, u.y + Math.sin(time * 1.5 + u.phase) * 0.15, u.z + Math.sin(t) * 2);
        s.scale.set(0.5, 0.25 * (0.6 + 0.4 * Math.abs(Math.sin(time * 4 + u.phase))), 1);
      });
    }
  };
}

// ================================================================ 月亮上
function buildMoonSet() {
  const set = new THREE.Group();

  // 月面：灰色的土 + 陨石坑（贴图 + 真的凹下去）
  const craters = Array.from({ length: 26 }, () => ({ x: rand(-7, 7), y: rand(-4, 4), r: rand(0.15, 0.7) }))
    .filter(c => Math.abs(c.x) > 1.3 || Math.abs(c.y) > 0.9);                  // 书下面别有坑
  craters.push({ x: -1.9, y: 0.4, r: 0.45 }, { x: 2.0, y: -0.2, r: 0.32 });
  const groundTex = canvasTexture(1024, 1024, (g, W, H) => {
    g.fillStyle = '#9a9aa2'; g.fillRect(0, 0, W, H);
    for (let k = 0; k < 20000; k++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '230,230,240' : '60,60,70'},${rand(0.05, 0.2)})`; g.fillRect(rand(0, W), rand(0, H), rand(1, 3), rand(1, 3)); }
    for (let k = 0; k < 60; k++) {
      const x = rand(0, W), y = rand(0, H), r = rand(4, 22);
      g.strokeStyle = 'rgba(70,70,80,0.35)'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
      g.fillStyle = 'rgba(70,70,80,0.15)'; g.beginPath(); g.arc(x + 2, y + 2, r * 0.8, 0, Math.PI * 2); g.fill();
    }
  }, { repeat: [4, 2] });
  const geo = new THREE.PlaneGeometry(16, 8, 128, 64);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    let z = Math.sin(x * 0.7) * 0.03 + Math.cos(y * 0.9) * 0.03;
    for (const c of craters) {
      const d = Math.hypot(x - c.x, y - c.y) / c.r;
      if (d < 1) z -= (1 - d * d) * c.r * 0.22;                                  // 坑
      else if (d < 1.35) z += Math.sin((d - 1) / 0.35 * Math.PI) * c.r * 0.06;   // 坑边隆起的一圈
    }
    p.setZ(i, z);
  }
  geo.computeVertexNormals();
  const regolith = normalMap(512, (g, W, H) => {
    for (let k = 0; k < 14000; k++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)'; g.fillRect(rand(0, W), rand(0, H), rand(1, 2.5), rand(1, 2.5)); }
    for (let k = 0; k < 70; k++) {                           // 小坑：中间低、边缘一圈高
      const x = rand(0, W), y = rand(0, H), r = rand(5, 26);
      const cr = g.createRadialGradient(x, y, 0, x, y, r * 1.3);
      cr.addColorStop(0, 'rgba(0,0,0,0.6)'); cr.addColorStop(0.7, 'rgba(0,0,0,0.1)'); cr.addColorStop(0.82, 'rgba(255,255,255,0.55)'); cr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = cr; g.beginPath(); g.arc(x, y, r * 1.3, 0, Math.PI * 2); g.fill();
    }
  }, 3.5, [5, 3]);
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: groundTex, normalMap: regolith, normalScale: new THREE.Vector2(1.1, 1.1), roughness: 1, color: '#c8c8d0' }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, TABLE_Y - 0.01, -1.5);
  ground.receiveShadow = true;
  set.add(ground);

  // 星空 + 地球（会慢慢转，带一圈大气光）
  set.add(starField(1600, 26, 0.02));
  const earthTex = canvasTexture(1024, 512, (g, W, H) => {
    g.fillStyle = '#2b6cb0'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#5c9a5a';
    for (let k = 0; k < 9; k++) { const x = rand(0, W), y = rand(H * 0.2, H * 0.8); g.beginPath(); g.ellipse(x, y, rand(40, 130), rand(30, 80), rand(0, 3), 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#c9b27a';
    for (let k = 0; k < 5; k++) { g.beginPath(); g.ellipse(rand(0, W), rand(H * 0.3, H * 0.7), rand(20, 50), rand(15, 30), 0, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = 'rgba(255,255,255,0.75)';
    for (let k = 0; k < 40; k++) { g.beginPath(); g.ellipse(rand(0, W), rand(0, H), rand(30, 90), rand(6, 14), rand(-0.3, 0.3), 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#f2f6fa'; g.fillRect(0, 0, W, H * 0.07); g.fillRect(0, H * 0.93, W, H * 0.07);   // 两极
  });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1.1, 48, 32), new THREE.MeshStandardMaterial({ map: earthTex, roughness: 0.7, emissive: '#1a3a66', emissiveIntensity: 0.25, fog: false }));
  earth.position.set(3.0, 2.5, -11);
  earth.rotation.z = 0.4;
  const atmo = atmosphere(1.22, '#8cc4ff', 2.6, 1.5);
  atmo.position.copy(earth.position);
  const halo = glowSprite('#6fa8ff', 3.2, 0.28);
  halo.position.copy(earth.position);
  set.add(halo, earth, atmo);
  const earthLight = new THREE.DirectionalLight('#9cc4ff', 0.35);              // 地球反射的蓝光（地照）
  earthLight.position.copy(earth.position);
  set.add(earthLight);

  // 野餐毯（在月亮上读书也要舒服）+ 一盏暖色小灯笼
  const rugTex = canvasTexture(1024, 640, (g, W, H) => {
    g.fillStyle = '#3f4f7a'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(242,193,78,0.45)'; g.lineWidth = 10;
    for (let x = 0; x < W; x += 80) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let y = 0; y < H; y += 80) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    g.fillStyle = '#f2c14e';
    for (let k = 0; k < 18; k++) { const x = rand(40, W - 40), y = rand(40, H - 40); g.beginPath(); for (let j = 0; j < 10; j++) { const r = j % 2 ? 5 : 12, a = j / 10 * Math.PI * 2 - Math.PI / 2; g[j ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r); } g.fill(); }
  });
  const rug = cloth(rugTex, 2.3, 1.4);
  rug.position.set(0, TABLE_Y + 0.004, 0.06);
  set.add(rug);
  const under = contactShadow(2.3, 1.45, 0.5);
  under.position.set(0, TABLE_Y + 0.006, 0.02);
  set.add(under);
  const lantern = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.072, 0.18, 6, 1, true), new THREE.MeshStandardMaterial({ color: '#fff0d0', transparent: true, opacity: 0.28, roughness: 0.05, side: THREE.DoubleSide, emissive: '#ffb766', emissiveIntensity: 0.4 }));
  frame.position.y = 0.12;
  const metal = new THREE.MeshStandardMaterial({ color: '#2c2a30', metalness: 0.7, roughness: 0.35 });
  for (let k = 0; k < 6; k++) {                              // 六根细细的金属框
    const a = k / 6 * Math.PI * 2, bar = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.18, 5), metal);
    bar.position.set(Math.cos(a) * 0.066, 0.12, Math.sin(a) * 0.066);
    lantern.add(bar);
  }
  const ringBase = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.082, 0.025, 24), metal);
  ringBase.position.y = 0.0125;
  const lanternShadow = contactShadow(0.4, 0.4, 0.55);
  lanternShadow.position.y = 0.004;
  lantern.add(ringBase, lanternShadow);
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffcf7a').multiplyScalar(3) }));
  flame.position.y = 0.12;
  const lid = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.07, 6), metal);
  lid.position.y = 0.24;
  const warm = new THREE.PointLight('#ffb766', 1.6, 2.6, 1.6);
  warm.position.y = 0.14;
  lantern.add(frame, flame, lid, warm);
  lantern.position.set(1.3, TABLE_Y, -0.6);
  set.add(lantern);
  [frame, flame].forEach(m => { m.castShadow = false; });
  lid.castShadow = true;

  return {
    group: set,
    look: { background: '#04050c', hemi: 0.28, key: 1.25, keyColor: '#eef2ff', fog: ['#04050c', 9, 24], shadowExtent: 2.4 },
    update(time) {
      earth.rotation.y = time * 0.04;
      warm.intensity = 1.6 + Math.sin(time * 6.3) * 0.1 + Math.sin(time * 13.1) * 0.06;
    }
  };
}

// ================================================================ 外太空：书放在一颗小星球的顶上
function buildSpaceSet() {
  const set = new THREE.Group();
  const R = 3.4;                                              // 小星球的半径：地平线明显是弯的

  // 小星球：沙色的土 + 一点点绿
  const planetTex = canvasTexture(1024, 512, (g, W, H) => {
    g.fillStyle = '#c9a77c'; g.fillRect(0, 0, W, H);
    for (let k = 0; k < 18000; k++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '250,230,200' : '120,85,60'},${rand(0.06, 0.2)})`; g.fillRect(rand(0, W), rand(0, H), 2, 2); }
    g.fillStyle = 'rgba(110,150,90,0.35)';
    for (let k = 0; k < 30; k++) { g.beginPath(); g.ellipse(rand(0, W), rand(0, H), rand(10, 40), rand(6, 20), rand(0, 3), 0, Math.PI * 2); g.fill(); }
  });
  const soil = normalMap(512, (g, W, H) => {
    for (let k = 0; k < 12000; k++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'; g.fillRect(rand(0, W), rand(0, H), 2, 2); }
    for (let k = 0; k < 40; k++) { const x = rand(0, W), y = rand(0, H), r = rand(10, 40); const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  }, 3, [8, 4]);
  const planet = new THREE.Mesh(new THREE.SphereGeometry(R, 128, 96), new THREE.MeshStandardMaterial({ map: planetTex, normalMap: soil, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.95 }));
  planet.position.set(0, TABLE_Y - R, -0.2);
  planet.receiveShadow = true;
  set.add(planet);
  const rim = atmosphere(R * 1.012, '#b9a6ff', 6, 0.55);   // 小星球边缘的一圈淡紫色的光：地平线不再是一刀切
  rim.position.copy(planet.position);
  set.add(rim);
  const under = contactShadow(2.3, 1.4, 0.5);
  under.position.set(0, TABLE_Y + 0.004, 0.02);
  set.add(under);
  const onPlanet = (obj, x, z, lift = 0) => {
    // 把东西"种"在球面上：算出球面高度，并让它垂直于球面
    const dx = x, dz = z + 0.2, y = Math.sqrt(Math.max(0, R * R - dx * dx - dz * dz)) - R + TABLE_Y;
    obj.position.set(x, y + lift, z);
    obj.lookAt(planet.position.clone().multiplyScalar(-1).add(new THREE.Vector3(x * 2, 0, z * 2 + 0.4)));
    obj.rotation.x = Math.atan2(dz, R) ; obj.rotation.z = -Math.atan2(dx, R);
    obj.rotation.y = 0;
    return obj;
  };

  // 星空、星云、一颗带环的远方行星
  set.add(starField(1800, 28, -0.3));
  [['#8a6bff', -9, 4, -20, 12, 0.35], ['#ff8fb8', 8, 6, -22, 10, 0.28], ['#5fd0ff', 2, 9, -24, 9, 0.2],
   ['#c9a0ff', -3, 6, -26, 16, 0.14], ['#ffb3c8', 12, 3, -24, 7, 0.16]].forEach(([c, x, y, z, s, o]) => {   // 几层不同大小的星云叠起来更有纵深
    const n = glowSprite(c, s, o); n.position.set(x, y, z); set.add(n);
  });
  const ringed = new THREE.Group();
  const giant = new THREE.Mesh(new THREE.SphereGeometry(1.4, 48, 32), new THREE.MeshStandardMaterial({ color: '#e0a86a', roughness: 0.8, emissive: '#5a3418', emissiveIntensity: 0.3, fog: false }));
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.9, 2.8, 64), new THREE.MeshBasicMaterial({ color: '#f3d9a8', transparent: true, opacity: 0.55, side: THREE.DoubleSide, fog: false }));
  ring.rotation.x = Math.PI / 2.4;
  const giantAtmo = atmosphere(1.5, '#ffd2a0', 3, 0.9);
  ringed.add(giant, giantAtmo, ring);
  ringed.position.set(-6, 3.4, -14);
  ringed.rotation.z = 0.3;
  set.add(ringed);

  // 玻璃罩里的一朵玫瑰
  const rose = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.18, 6), new THREE.MeshStandardMaterial({ color: '#4f7f4a' }));
  stem.position.y = 0.09;
  const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), new THREE.MeshStandardMaterial({ color: '#d0344a', roughness: 0.5 }));
  bloom.position.y = 0.19; bloom.scale.set(1, 1.15, 1);
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), new THREE.MeshStandardMaterial({ color: '#5f8f55' }));
  leaf.position.set(0.02, 0.09, 0); leaf.scale.set(1.4, 0.4, 0.8);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#e8f4ff', transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1, side: THREE.DoubleSide }));
  dome.scale.set(1, 2.4, 1);
  rose.add(stem, bloom, leaf, dome);
  set.add(shadowy(onPlanet(rose, -1.15, 0.5)));
  dome.castShadow = false;

  // 一盏路灯（给读书的人照亮）
  const lamp = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.75, 10), new THREE.MeshStandardMaterial({ color: '#2f3442', metalness: 0.6, roughness: 0.4 }));
  post.position.y = 0.375;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd68a').multiplyScalar(3) }));
  head.position.y = 0.78;
  const lampLight = new THREE.PointLight('#ffc070', 2.2, 3.2, 1.5);
  lampLight.position.y = 0.78;
  lamp.add(post, head, lampLight);
  set.add(onPlanet(lamp, 1.15, -0.75));
  post.castShadow = true;
  // 一颗慢慢划过的流星
  const meteor = glowSprite('#ffffff', 0.25, 0);
  set.add(meteor);

  return {
    group: set,
    look: { background: '#090820', hemi: 0.45, key: 0.85, keyColor: '#e6e0ff', fog: null, shadowExtent: 2.4 },
    update(time) {
      lampLight.intensity = 2.2 + Math.sin(time * 1.4) * 0.08;
      ringed.rotation.y = time * 0.02;
      const m = (time % 9) / 9;                                 // 每 9 秒一颗流星
      meteor.position.set(8 - m * 16, 6 - m * 3, -16);
      meteor.material.opacity = m < 0.25 ? Math.sin(m / 0.25 * Math.PI) : 0;
    }
  };
}

// ---------------------------------------------------------------- 入口
const BUILD = { desk: buildDeskSet, seaside: buildSeasideSet, moon: buildMoonSet, space: buildSpaceSet };

/** 造一个地点的置景。书桌没有 look，用默认的"傍晚灯下"配方。 */
export function buildSet(id) {
  const make = BUILD[id];
  if (!make) return null;
  const set = make();
  if (!set.look) set.look = { background: '#2b2019', hemi: 0.32, key: 0.45, keyColor: null, fog: ['#1e1510', 3.5, 8.5], shadowExtent: 1.4 };
  return set;
}
