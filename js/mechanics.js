// mechanics.js — 纸的机关：让纸自己"演"出这一页的动词
//
// 立体书讲故事，靠的是"打开 / 拉动的那一刻发生了什么"。立起来的纸片（standee）只会一个动作，
// 所以每页真正的动词由这里的机关来演。机关写在书稿里：spread.mechanics = [{ kind, ... }]
//
//   flap      翻翻页：平躺在书页上的一块纸，铰链在远端；拖起来 / 点一下 → 掀开，露出下面的东西
//   drop      拉拉条：书页前沿伸出一条纸舌，往下拉 → 一个角色从高处（烟囱）"扑通"掉下来
//   turnHead  转头：一张两面的纸卡，正面侧脸、背面正脸；翻到这页自动转过来看着你，再眨眼
//
// 坐标（和 book3d 一致）：书页平面 y = 0；x：-1 左外沿 → 0 书脊 → 1 右外沿（乘以页宽）；
// z：-0.5 远（页顶）→ 0.5 近（页底，靠读者）。
//
// 机关只在"这一页翻好、静止"时出现；一开始翻页就藏起来，下次翻回来重新开始。
// 指针事件挂在 window 的捕获阶段：比书页拖动翻页（bindPageDrag）更早拿到，按到机关就不让翻页。

import * as THREE from 'three';
import { askOverlay, drawOverlay, loadSheep, saveSheep } from './magic-overlays.js';

const loader = new THREE.TextureLoader();
const textureCache = new Map();
function texture(url) {
  if (!textureCache.has(url)) {
    const t = loader.load(url);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    textureCache.set(url, t);
  }
  return textureCache.get(url);
}
const paper = (url, extra = {}) => new THREE.MeshStandardMaterial({
  map: texture(url), transparent: true, alphaTest: 0.4, roughness: 0.92, metalness: 0, ...extra
});
const ease = t => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const clamp01 = v => Math.max(0, Math.min(1, v));

export function createMechanics(book, data, { speakWord, isReading } = {}) {
  const scene = book.scene, pageW = book.pageW;
  book.renderer.localClippingEnabled = true;            // drop 机关要把"还在烟囱里"的部分裁掉

  // ---------------------------------------------------------------- 小音效（Web Audio 现场合成）
  let ctx = null;
  const audio = () => (ctx = ctx || new (window.AudioContext || window.webkitAudioContext)());
  function tone(freq, dur, { type = 'sine', gain = 0.12, slide = 0, delay = 0 } = {}) {
    try {
      const c = audio(), t0 = c.currentTime + delay;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t0);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(c.destination);
      o.start(t0); o.stop(t0 + dur + 0.05);
    } catch { /* 没声音也不影响 */ }
  }
  const SOUNDS = {
    snore: () => { tone(110, 0.9, { type: 'triangle', gain: 0.06, slide: 0.7 }); tone(150, 0.7, { type: 'triangle', gain: 0.05, slide: 1.3, delay: 1.0 }); },
    thud: () => { tone(90, 0.35, { gain: 0.35, slide: 0.4 }); tone(220, 0.12, { type: 'square', gain: 0.04, slide: 0.5 }); },
    chime: () => { [880, 1320].forEach((f, i) => tone(f, 0.6, { gain: 0.06, delay: i * 0.12 })); },
    paper: () => tone(600, 0.12, { type: 'sawtooth', gain: 0.015, slide: 0.5 }),
    giggle: () => [700, 820, 760].forEach((f, i) => tone(f, 0.09, { type: 'triangle', gain: 0.05, delay: i * 0.1 }))
  };
  const play = name => SOUNDS[name] && SOUNDS[name]();

  // ---------------------------------------------------------------- 每种机关的做法
  // 每个 build 返回 { root, hits: [mesh], reset(), update(dt, time), down(hit), drag(dx, dy), up(moved) }

  /** 翻翻页：铰链在远端（z - d/2），拖起近端 → 绕铰链往上翻。 */
  function buildFlap(m) {
    const w = m.w * pageW, d = m.d;
    const root = new THREE.Group();
    const hinge = new THREE.Group();                     // 铰链：rotation.x 负值 = 近端抬起
    hinge.position.set(m.x * pageW, 0.004, m.z - d / 2);
    const geo = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(0, 0, d / 2);
    const top = new THREE.Mesh(geo, paper(m.top, { side: THREE.FrontSide }));
    const back = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xe9dcc0, roughness: 0.95, side: THREE.BackSide }));
    top.castShadow = true;
    hinge.add(top, back);
    // 下面的东西：平平地印在书页上，掀开才看得见
    const under = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), paper(m.under));
    under.position.set(m.x * pageW, 0.002, m.z);
    root.add(under, hinge);

    let open = 0, target = 0, dragging = false, start = 0, everOpened = false, idleTime = 0;
    const MAX = 1.95;                                     // 最多翻开约 112°，靠在后面
    return {
      root, hits: [top, back],
      reset() { open = target = 0; everOpened = false; idleTime = 0; hinge.rotation.x = 0; },
      update(dt) {
        if (!dragging) open += (target - open) * Math.min(1, dt * 7);
        // 还没被掀开过：每隔几秒自己轻轻翘一下角，告诉孩子"这里可以掀"
        idleTime += dt;
        const invite = !everOpened && !dragging ? Math.max(0, Math.sin(idleTime * 2.4)) ** 8 * 0.08 : 0;
        hinge.rotation.x = -(open + invite) * MAX;
      },
      down() { dragging = true; start = open; },
      drag(dx, dy) { open = clamp01(start - dy / 160); },
      up(moved) {
        dragging = false;
        if (moved < 6) target = open > 0.5 ? 0 : 1;      // 点一下 = 开 / 关
        else target = open > 0.35 ? 1 : 0;               // 拖过三分之一就翻开
        open = moved < 6 ? open : open;
        if (target === 1 && !everOpened) { everOpened = true; setTimeout(() => { play('snore'); m.word && speakWord?.(m.word); }, 350); }
        play('paper');
      }
    };
  }

  /** 拉拉条：拉纸舌 → 角色从 clipY 以上（藏在烟囱里）落下来。 */
  function buildDrop(m) {
    const root = new THREE.Group();
    const figTex = texture(m.figure);
    const h = m.h, aspect = 600 / 900;                   // 贴图比例（m7-santa.png）
    const clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), m.clipY);   // 只画 y ≤ clipY 的部分
    const fig = new THREE.Mesh(new THREE.PlaneGeometry(h * aspect, h).translate(0, h / 2, 0),
      new THREE.MeshStandardMaterial({ map: figTex, transparent: true, alphaTest: 0.4, roughness: 0.9, clippingPlanes: [clip], side: THREE.DoubleSide }));
    fig.castShadow = true;
    fig.position.set(m.x * pageW, 0, m.z);
    // 纸舌：平躺着从右页前沿伸出去
    const tabW = 0.16, tabD = 0.14;
    const tab = new THREE.Mesh(new THREE.PlaneGeometry(tabW, tabD).rotateX(-Math.PI / 2), paper(m.tab, { side: THREE.DoubleSide }));
    const tabHome = new THREE.Vector3(m.tabX * pageW, 0.004, 0.5 + tabD / 2 - 0.03);
    tab.position.copy(tabHome);
    // 落地时扬起的煤灰：几团灰色的圆，散开、变淡
    const puffMat = new THREE.MeshBasicMaterial({ color: 0x55504c, transparent: true, opacity: 0, depthWrite: false });
    const puffs = Array.from({ length: 7 }, (_, i) => {
      const p = new THREE.Mesh(new THREE.CircleGeometry(0.05, 16), puffMat);
      p.userData.dir = new THREE.Vector3(Math.cos(i / 7 * Math.PI * 2) * 0.6, 0.25 + (i % 3) * 0.12, 0.2);
      p.position.set(m.x * pageW, 0.05, m.z + 0.02);
      return p;
    });
    root.add(fig, tab, ...puffs);

    const TOP = m.clipY + 0.02;                           // 完全藏起来时脚底的高度
    let pull = 0, dragging = false, start = 0, dropped = false, fall = null, puffT = -1, idleTime = 0;
    function drop() {
      if (dropped) return;
      dropped = true;
      fall = { t: 0, from: fig.position.y };
    }
    return {
      root, hits: [tab],
      reset() {
        pull = 0; dropped = false; fall = null; puffT = -1; idleTime = 0;
        fig.position.y = TOP; fig.scale.set(1, 1, 1); tab.position.copy(tabHome); puffMat.opacity = 0;
      },
      update(dt) {
        idleTime += dt;
        if (!dropped) {
          if (!dragging) pull += (0 - pull) * Math.min(1, dt * 6);       // 松手没拉够：弹回去
          const wiggle = !dragging ? Math.max(0, Math.sin(idleTime * 2.2)) ** 6 * 0.03 : 0;
          tab.position.z = tabHome.z + pull * 0.12 + wiggle;              // 纸舌跟着手往外走
          fig.position.y = TOP - pull * 0.22;                             // 拉一点：靴子先露出来
        } else if (fall) {
          // 自由落体（越落越快），落地压扁一下再弹回
          fall.t += dt;
          const t = Math.min(1, fall.t / 0.42);
          fig.position.y = fall.from * (1 - t * t);
          tab.position.z += (tabHome.z - tab.position.z) * Math.min(1, dt * 8);
          if (t >= 1 && puffT < 0) { puffT = 0; play('thud'); m.word && setTimeout(() => speakWord?.(m.word), 500); }
          if (puffT >= 0) {
            puffT += dt;
            const squash = Math.max(0, 1 - puffT / 0.25);
            fig.scale.set(1 + squash * 0.12, 1 - squash * 0.12, 1);
            const k = Math.min(1, puffT / 0.9);
            puffMat.opacity = 0.55 * (1 - k);
            puffs.forEach(p => {
              p.position.set(m.x * pageW + p.userData.dir.x * k * 0.35, 0.05 + p.userData.dir.y * k * 0.4, m.z + 0.04 + p.userData.dir.z * k * 0.2);
              p.scale.setScalar(1 + k * 2.2);
              p.lookAt(book.camera.position);
            });
          }
        }
      },
      down() { if (!dropped) { dragging = true; start = pull; } },
      drag(dx, dy) { if (!dropped) pull = clamp01(start + dy / 140); },
      up(moved) {
        dragging = false;
        if (dropped) return;
        if (moved < 6 || pull > 0.55) drop();             // 点一下也行（3 岁孩子不一定会拉）
        play('paper');
      }
    };
  }

  /** 转头：两面纸卡绕竖轴翻 180°。正面 = 侧脸，背面 = 正脸（看着你）。 */
  function buildTurnHead(m) {
    const root = new THREE.Group();
    const s = m.size;
    const card = new THREE.Group();
    card.position.set(m.x * pageW, m.y, m.z);
    const geo = new THREE.PlaneGeometry(s, s);
    const side = new THREE.Mesh(geo, paper(m.side, { side: THREE.FrontSide }));
    const frontMat = paper(m.front, { side: THREE.FrontSide });
    const front = new THREE.Mesh(geo, frontMat);
    front.rotation.y = Math.PI;                           // 背面朝后；整张卡转 180° 后它朝向读者
    side.castShadow = front.castShadow = true;
    card.add(side, front);
    root.add(card);
    const frontTex = texture(m.front), winkTex = texture(m.wink);

    let t = 0, turn = 0, winkUntil = 0, turned = false, winked = false;
    const wink = (now, giggle) => { winkUntil = now + 0.45; play(giggle ? 'giggle' : 'chime'); };
    return {
      root, hits: [side, front],
      reset() { t = 0; turn = 0; turned = false; winked = false; winkUntil = 0; card.rotation.y = 0; frontMat.map = frontTex; },
      update(dt) {
        t += dt;
        // 停一拍（delay）→ 用 1.3 秒慢慢转过来 → 再过 0.6 秒眨眼
        if (!turned && t > m.delay) turned = true;
        if (turned) turn = Math.min(1, turn + dt / 1.3);
        card.rotation.y = ease(turn) * Math.PI;
        card.position.y = m.y + Math.sin(ease(turn) * Math.PI) * 0.03;   // 转的时候微微抬一下头
        if (turn >= 1 && !winked && t > m.delay + 1.9) { winked = true; wink(t); m.word && setTimeout(() => speakWord?.(m.word), 600); }
        frontMat.map = t < winkUntil ? winkTex : frontTex;
      },
      down() {},
      drag() {},
      up() {
        if (!turned) { turned = true; return; }            // 还没转：点一下就让他转过来
        if (turn >= 1) { wink(t, true); }                  // 已经看着你：点他 = 你眨眼，他也眨眼回应
      }
    };
  }

  // ================================================================ 挂在原文段落上的机关（《小王子》起）
  // 这些机关多数带 cue = 原文段落 id（如 "c01-p06"）：朗读读到这一段时触发。
  // 规则：魔法服务这一行字——字读到了，魔法才发生。

  /** 一张立着的纸卡（正对读者），底边站在书页上。 */
  function standingCard(spec, h, opts = {}) {
    const w = h * (spec.aspect || 1);
    const mat = new THREE.MeshStandardMaterial({
      map: texture(spec.file), transparent: true, alphaTest: opts.fade ? 0.02 : 0.4,
      depthWrite: !opts.fade, roughness: 0.92, metalness: 0, side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0), mat);
    mesh.castShadow = true;
    return mesh;
  }
  const place = (obj, m, y = 0) => obj.position.set(m.x * pageW, y, m.z);
  const noop = () => {};

  /** 静止的纸卡。 */
  function buildCard(m) {
    const root = new THREE.Group();
    const card = standingCard(m.image, m.h);
    place(card, m);
    root.add(card);
    return { root, hits: [], reset: noop, update: noop, down: noop, drag: noop, up: noop };
  }

  /** 出现：读到 cue 那一段时，纸卡从书页上慢慢升起、显形；没有 cue 就一直在。 */
  function buildAppear(m) {
    const root = new THREE.Group();
    const card = standingCard(m.image, m.h, { fade: true });
    place(card, m);
    root.add(card);
    let t = 0, shown = false;
    const apply = () => {
      const e = ease(clamp01(t / 0.9));
      card.material.opacity = e;
      card.position.y = (1 - e) * -0.06;
      card.visible = e > 0.01;
    };
    return {
      root, hits: [],
      reset() { shown = !m.cue; t = shown ? 1 : 0; apply(); },
      cue() { if (!shown) { shown = true; play('paper'); } },
      update(dt) { if (shown && t < 1) { t += dt; apply(); } },
      down: noop, drag: noop, up: noop
    };
  }

  /** 揭晓：同一个位置两张纸卡（from → to）。auto = 读到 cue 自动揭晓；否则读到 cue 后发光邀请，孩子点一下才揭晓。 */
  function buildReveal(m) {
    const root = new THREE.Group();
    const a = standingCard(m.from, m.h, { fade: true });
    const b = standingCard(m.to, m.h, { fade: true });
    place(a, m); place(b, m);
    b.position.z += 0.002;
    // 揭晓时扫过的一圈光（魔杖的光）
    const glow = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.08, 48),
      new THREE.MeshBasicMaterial({ color: 0xfff1b8, transparent: true, opacity: 0, depthWrite: false }));
    place(glow, m, m.h / 2);
    glow.position.z += 0.01;
    root.add(a, b, glow);
    let t = 0, revealing = false, inviting = false, time = 0;
    const apply = () => {
      const e = ease(clamp01(t / 1.1));
      b.material.opacity = e;
      a.material.opacity = 1 - e * 0.95;
      b.visible = e > 0.01;
      const g = revealing && t < 1.2 ? Math.sin(Math.min(1, t / 1.2) * Math.PI) : 0;
      glow.material.opacity = g * 0.85;
      glow.scale.setScalar(1 + t * 6);
    };
    const go = () => { if (!revealing) { revealing = true; inviting = false; play('chime'); } };
    return {
      root, hits: [a, b],
      reset() { t = 0; revealing = false; inviting = false; time = 0; a.scale.setScalar(1); apply(); },
      cue() { if (m.auto) setTimeout(go, 600); else if (!revealing) inviting = true; },
      update(dt) {
        time += dt;
        if (revealing && t < 1.3) { t += dt; apply(); }
        // 邀请：纸卡轻轻"呼吸"，提示孩子点它
        const s = inviting ? 1 + Math.max(0, Math.sin(time * 3)) * 0.025 : 1;
        a.scale.setScalar(s);
      },
      down: noop, drag: noop,
      up() { if (!revealing) go(); else { revealing = false; t = 0; apply(); } }   // 再点一下 = 合上，可以反复看
    };
  }

  /** 提问：朗读停下来问孩子；选完（不评判）才接着读。返回 Promise。 */
  function buildAsk(m) {
    let asked = false;
    return {
      root: new THREE.Group(), hits: [],
      reset() { asked = false; },
      cue() {
        if (asked) return null;
        asked = true;
        return askOverlay(m, play);
      },
      update: noop, down: noop, drag: noop, up: noop
    };
  }

  /** 你的羊：箱子 +（第一次）孩子亲手画的羊；画好的羊存在这台设备里，之后每一页都是这只。 */
  function buildSheepBox(m) {
    const root = new THREE.Group();
    const box = standingCard(m.box, m.h);
    place(box, m);
    const sheepH = m.h * 0.75;
    const sheepMat = new THREE.MeshStandardMaterial({ transparent: true, alphaTest: 0.05, roughness: 0.9, side: THREE.DoubleSide, depthWrite: false });
    const sheepCard = new THREE.Mesh(new THREE.PlaneGeometry(sheepH * 4 / 3, sheepH).translate(0, sheepH / 2, 0), sheepMat);
    place(sheepCard, m, m.h * 0.55);
    sheepCard.position.z -= 0.004;                        // 在箱子后面一点：像从箱子里探出头
    const zzz = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture('Zzz'), transparent: true, opacity: 0, depthWrite: false }));
    zzz.scale.set(0.12, 0.06, 1);
    root.add(sheepCard, box, zzz);
    let peek = 0, showSheep = false, sleeping = false, time = 0;
    function useSheep() {
      const url = loadSheep();
      if (!url) return false;
      const t = loader.load(url);
      t.colorSpace = THREE.SRGBColorSpace;
      sheepMat.map = t; sheepMat.needsUpdate = true;
      return true;
    }
    return {
      root, hits: [box],
      reset() {
        sleeping = false; time = 0;
        showSheep = !m.cue && useSheep();                  // 后面的页：直接是你的羊
        peek = showSheep ? 1 : 0;
      },
      cue(passage) {
        if (m.sleepCue && passage.para === m.sleepCue) { sleeping = true; play('snore'); return null; }
        if (m.draw) {
          // 读到"你要的羊就在里面"：停下来，请孩子画
          return drawOverlay(play).then(url => { if (url) saveSheep(url); showSheep = useSheep(); });
        }
        showSheep = useSheep();
        return null;
      },
      update(dt) {
        time += dt;
        peek += ((showSheep ? 1 : 0) - peek) * Math.min(1, dt * 4);
        sheepCard.visible = peek > 0.02;
        sheepCard.scale.setScalar(Math.max(0.01, peek));
        sheepCard.position.y = m.h * 0.35 + Math.sin(time * (sleeping ? 1.2 : 2.4)) * 0.006;   // 睡着时呼吸更慢
        zzz.material.opacity = sleeping ? 0.5 + Math.sin(time * 1.6) * 0.4 : 0;
        zzz.position.set(m.x * pageW + 0.12, m.h + 0.12 + (time % 2) * 0.03, m.z);
      },
      down: noop, drag: noop,
      up() { if (showSheep) play(sleeping ? 'snore' : 'giggle'); }   // 点箱子：听听你的羊
    };
  }

  /** 笑声：读到 cue 那一段，一串小铃铛 + 金色的光点。 */
  function buildBells(m) {
    const root = new THREE.Group();
    const mat = new THREE.SpriteMaterial({ color: 0xffe6a0, transparent: true, opacity: 0, depthWrite: false });
    const sparks = Array.from({ length: 14 }, (_, i) => {
      const s = new THREE.Sprite(mat.clone());
      s.userData.a = i / 14 * Math.PI * 2;
      s.scale.setScalar(0.03);
      root.add(s);
      return s;
    });
    let t = -1;
    const ring = () => { [1568, 1976, 2349, 1976, 2637].forEach((f, i) => tone(f, 0.5, { gain: 0.05, delay: i * 0.09 })); t = 0; };
    return {
      root, hits: [],
      reset() { t = -1; sparks.forEach(s => { s.material.opacity = 0; }); },
      cue() { ring(); },
      update(dt) {
        if (t < 0) return;
        t += dt;
        const k = Math.min(1, t / 1.6);
        sparks.forEach((s, i) => {
          const r = 0.05 + k * 0.28;
          s.position.set(m.x * pageW + Math.cos(s.userData.a) * r, m.y + Math.sin(s.userData.a) * r * 0.6 + k * 0.1, m.z + 0.02);
          s.material.opacity = (1 - k) * (0.6 + 0.4 * Math.sin(t * 20 + i));
        });
        if (k >= 1) t = -1;
      },
      down: noop, drag: noop, up: noop
    };
  }

  /** 转动小星球：一颗立着的小星球 + 站在顶上的小王子；左右拖动 = 他往前走（星球在脚下转），走一圈回到原地。 */
  function buildSpin(m) {
    const root = new THREE.Group();
    const r = m.h / 2;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 64), new THREE.MeshStandardMaterial({ map: texture(m.planet.file), transparent: true, alphaTest: 0.3, roughness: 0.9, side: THREE.DoubleSide }));
    const hub = new THREE.Group();
    hub.position.set(m.x * pageW, r + 0.02, m.z);
    hub.add(disc);
    const walker = standingCard(m.walker, r * 0.55);
    walker.position.set(m.x * pageW, r * 2 + 0.02, m.z + 0.005);
    root.add(hub, walker);
    let angle = 0, start = 0, vel = 0, travelled = 0, dragging = false, time = 0, invite = false, cheered = false;
    return {
      root, hits: [disc, walker],
      reset() { angle = 0; vel = 0; travelled = 0; invite = false; cheered = false; time = 0; },
      cue() { invite = true; },
      update(dt) {
        time += dt;
        if (!dragging) { angle += vel * dt; vel *= Math.pow(0.15, dt); travelled += Math.abs(vel * dt); }
        const wiggle = invite && !travelled ? Math.sin(time * 3) * 0.06 : 0;
        disc.rotation.z = angle + wiggle;
        walker.position.y = r * 2 + 0.02 + Math.abs(Math.sin(time * 9)) * (Math.abs(vel) > 0.3 || dragging ? 0.012 : 0);   // 走路一颠一颠
        if (!cheered && travelled >= Math.PI * 2) { cheered = true; play('giggle'); }   // 走了一圈：又回到原地
      },
      down() { dragging = true; start = angle; },
      drag(dx) {
        const next = start - dx / 120;
        travelled += Math.abs(next - angle);
        vel = (next - angle) * 30;
        angle = next;
      },
      up() { dragging = false; }
    };
  }

  function textTexture(text) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const g = c.getContext('2d');
    g.font = 'italic 72px Georgia, serif';
    g.fillStyle = '#fff8e0';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 128, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  const BUILD = {
    flap: buildFlap, drop: buildDrop, turnHead: buildTurnHead,
    card: buildCard, appear: buildAppear, reveal: buildReveal, ask: buildAsk,
    sheepBox: buildSheepBox, bells: buildBells, spin: buildSpin
  };

  // ---------------------------------------------------------------- 按跨页建好，平时藏着
  const bySpread = new Map();
  const spreadOfPassage = new Map();                      // 字幕 id → 跨页 id（线索来时找对应的机关）
  for (const sp of data.spreads) {
    const list = (sp.mechanics || []).map(m => { const x = BUILD[m.kind]?.(m); if (x) x.spec = m; return x; }).filter(Boolean);
    list.forEach(x => { x.root.visible = false; scene.add(x.root); });
    if (list.length) bySpread.set(sp.id, list);
    (sp.passages || []).forEach(p => spreadOfPassage.set(p.id, sp.id));
  }

  let active = null, activeId = null, last = performance.now();
  const fired = new Set();                                // 这次停留在这一页时已经触发过的线索
  function activate(id) {
    if (id === activeId) return;
    active?.forEach(x => { x.root.visible = false; });
    activeId = id;
    fired.clear();
    active = id ? bySpread.get(id) || null : null;
    active?.forEach(x => { x.reset(); x.root.visible = true; });
  }
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    activate(book.state.phase === 'idle' ? book.current().spreadId : null);   // 翻好了一页 / 开始翻页
    active?.forEach(x => x.update(dt));
  }
  requestAnimationFrame(frame);

  /** 朗读读到一段原文：把线索交给这一页挂在这段上的机关。返回 Promise 时朗读等它。 */
  function cue(passage) {
    if (isReading && !isReading()) return null;
    const sid = spreadOfPassage.get(passage.id);
    if (!sid || book.state.phase !== 'idle' || book.current().spreadId !== sid) return null;
    activate(sid);
    const waits = [];
    for (const x of active || []) {
      const m = x.spec;
      const hit = m.cue === passage.para || m.sleepCue === passage.para;
      const key = `${m.kind}:${m.cue}:${passage.para}`;
      if (!hit || fired.has(key) || !x.cue) continue;
      fired.add(key);
      const w = x.cue(passage);
      if (w && typeof w.then === 'function') waits.push(w);
    }
    return waits.length ? Promise.all(waits) : null;
  }

  // ---------------------------------------------------------------- 指针：按到机关就由机关处理
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let grab = null;
  function pick(e) {
    if (!active) return null;
    const r = book.canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, book.camera);
    for (const mech of active) {
      if (ray.intersectObjects(mech.hits, false).length) return mech;
    }
    return null;
  }
  window.addEventListener('pointerdown', e => {
    if (e.target !== book.canvas) return;
    const mech = pick(e);
    if (!mech) return;
    e.stopImmediatePropagation();                         // 不让书页翻页 / 转视角
    e.preventDefault();
    grab = { mech, x: e.clientX, y: e.clientY, moved: 0 };
    mech.down();
  }, true);
  window.addEventListener('pointermove', e => {
    if (!grab) {
      if (e.target === book.canvas && active) book.canvas.style.cursor = pick(e) ? 'pointer' : '';
      return;
    }
    e.stopImmediatePropagation();
    const dx = e.clientX - grab.x, dy = e.clientY - grab.y;
    grab.moved = Math.max(grab.moved, Math.hypot(dx, dy));
    grab.mech.drag(dx, dy);
  }, true);
  const release = e => {
    if (!grab) return;
    e.stopImmediatePropagation();
    grab.mech.up(grab.moved);
    grab = null;
  };
  window.addEventListener('pointerup', release, true);
  window.addEventListener('pointercancel', release, true);

  return { cue, get activeId() { return activeId; } };
}
