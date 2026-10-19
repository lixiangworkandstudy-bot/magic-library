// music.js — 书房的背景音乐：用 Web Audio 实时合成，不需要任何音频文件
//
// 四层声音，都很轻：
//   1. 音乐盒旋律：F 大调五声音阶上的即兴（每次听都略有不同，不会腻）
//   2. 铺底和弦：F → Dm → B♭ → C，慢起慢落
//   3. 低音：每小节一个根音
//   4. 壁炉：燃烧的呼呼声 + 噼啪声，走独立的「火声通道」——越正对壁炉越响（setFire）
//      每一声大的噼啪都会回调 onCrackle，画面上同步迸出火星
// 浏览器不允许网页自动出声，所以要在孩子第一次点击/拖动之后才能 start()。

const BPM = 66;
const BEAT = 60 / BPM;                       // 一拍多少秒
const BAR = BEAT * 4;

// 音名 → 频率（A4 = 440Hz）
const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);   // n 是 MIDI 编号
// F 大调和弦进行（MIDI 编号）：每个和弦给出根音 + 三个和弦音
const CHORDS = [
  { root: 41, tones: [65, 69, 72] },        // F   (F A C)
  { root: 38, tones: [62, 65, 69] },        // Dm  (D F A)
  { root: 46, tones: [65, 70, 74] },        // B♭  (B♭ D F)
  { root: 48, tones: [64, 67, 72] }         // C   (C E G)
];
// 旋律用 F 大调五声音阶（F G A C D），任何音配任何和弦都不刺耳
const PENTATONIC = [77, 79, 81, 84, 86, 89, 91, 93];

export function createMusic() {
  let ctx = null, master = null, reverb = null, noiseBuffer = null, fireBus = null;
  let fireLevel = 0.3, crackleListener = null;
  let playing = false, timer = 0, nextBarTime = 0, barIndex = 0, melodyIndex = 3;

  function setup() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    // 混响：用一段指数衰减的噪声当"房间"的回声（像在木头书房里）
    reverb = ctx.createConvolver();
    const len = ctx.sampleRate * 2.6;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    reverb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    reverb.connect(wet).connect(master);

    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = noiseBuffer.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    // 火声通道：音量由 setFire() 按镜头朝向实时调节
    fireBus = ctx.createGain();
    fireBus.gain.value = fireLevel;
    fireBus.connect(master);
    fireplaceRumble();
  }

  /** 一个音符：接到主输出（干声）和混响（湿声）。 */
  function out(node, dry = 1) {
    const d = ctx.createGain();
    d.gain.value = dry;
    node.connect(d).connect(master);
    node.connect(reverb);
  }

  /** 音乐盒：正弦波 + 高两个八度的泛音，敲一下就慢慢消失。 */
  function musicBox(midi, time, velocity = 1) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.09 * velocity, time + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 2.4);
    for (const [mult, amp] of [[1, 1], [4, 0.12], [2.01, 0.2]]) {
      const osc = ctx.createOscillator();
      const og = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = NOTE(midi) * mult;
      og.gain.value = amp;
      osc.connect(og).connect(g);
      osc.start(time); osc.stop(time + 2.5);
    }
    out(g, 0.8);
  }

  /** 铺底和弦：两个略微走音的锯齿波过低通滤波，听起来像远处的风琴。 */
  function pad(chord, time) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(0.022, time + BAR * 0.4);
    g.gain.linearRampToValueAtTime(0.0001, time + BAR * 1.05);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    filter.connect(g);
    for (const midi of chord.tones) {
      for (const detune of [-6, 6]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = NOTE(midi - 12);
        osc.detune.value = detune;
        osc.connect(filter);
        osc.start(time); osc.stop(time + BAR * 1.1);
      }
    }
    out(g, 0.6);
  }

  function bass(chord, time) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.06, time + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, time + BAR * 0.9);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = NOTE(chord.root);
    osc.connect(g);
    osc.start(time); osc.stop(time + BAR);
    out(g, 1);
  }

  /** 旋律：在五声音阶上小步游走，偶尔休止，句尾落在和弦音上。 */
  function melodyBar(chord, time) {
    const rhythm = [[0, 1], [1, 0.5], [1.5, 0.5], [2, 1], [3, 1]];   // [第几拍, 长度]
    rhythm.forEach(([beat], i) => {
      if (Math.random() < 0.28 && i !== 0) return;                     // 留白：不是每拍都响
      melodyIndex = Math.max(0, Math.min(PENTATONIC.length - 1, melodyIndex + [-2, -1, -1, 0, 1, 1, 2][Math.floor(Math.random() * 7)]));
      let midi = PENTATONIC[melodyIndex];
      if (i === 0) midi = chord.tones[Math.floor(Math.random() * 3)] + 12;   // 每小节第一个音落在和弦音上
      musicBox(midi, time + beat * BEAT, i === 0 ? 1 : 0.7);
    });
  }

  /** 燃烧声：低通噪声（闷闷的轰）+ 带通噪声（呼呼的火舌），火舌的音量慢慢起伏。 */
  function fireplaceRumble() {
    const low = ctx.createBufferSource();
    low.buffer = noiseBuffer; low.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 160;
    const lg = ctx.createGain();
    lg.gain.value = 0.05;
    low.connect(lp).connect(lg).connect(fireBus);
    low.start();

    const whoosh = ctx.createBufferSource();
    whoosh.buffer = noiseBuffer; whoosh.loop = true; whoosh.playbackRate.value = 0.7;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = 0.7;
    const wg = ctx.createGain();
    wg.gain.value = 0.02;
    // 慢速起伏（LFO）：火苗一阵大一阵小
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.23;
    const lfoAmount = ctx.createGain();
    lfoAmount.gain.value = 0.012;
    lfo.connect(lfoAmount).connect(wg.gain);
    lfo.start();
    whoosh.connect(bp).connect(wg).connect(fireBus);
    whoosh.start();
  }

  /** 一声噼啪：极短的带通噪声。big = 大声的那种，会通知画面迸火星。 */
  function crackle(time, big) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1500 + Math.random() * 2800;
    bp.Q.value = 2.5;
    const g = ctx.createGain();
    const peak = big ? 0.22 + Math.random() * 0.1 : 0.05 + Math.random() * 0.06;
    g.gain.setValueAtTime(peak, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.03 + Math.random() * 0.06);
    src.connect(bp).connect(g).connect(fireBus);
    src.start(time, Math.random()); src.stop(time + 0.12);
    if (big && crackleListener) setTimeout(crackleListener, Math.max(0, (time - ctx.currentTime) * 1000));
  }

  /** 调度器：每 200ms 看一眼，把接下来要响的小节提前排好（Web Audio 的标准做法，节奏不会抖）。 */
  function schedule() {
    while (nextBarTime < ctx.currentTime + 0.6) {
      const chord = CHORDS[barIndex % CHORDS.length];
      pad(chord, nextBarTime);
      bass(chord, nextBarTime);
      if (barIndex >= 1) melodyBar(chord, nextBarTime);               // 第一小节只有和弦，慢慢进入
      for (let k = 0; k < 7; k++) if (Math.random() < 0.7) crackle(nextBarTime + Math.random() * BAR, Math.random() < 0.25);
      nextBarTime += BAR;
      barIndex++;
    }
  }

  function fade(to, seconds) {
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(to, now + seconds);
  }

  return {
    get playing() { return playing; },
    start() {
      if (playing) return;
      if (!ctx) setup();
      if (ctx.state === 'suspended') ctx.resume();
      playing = true;
      nextBarTime = ctx.currentTime + 0.1;
      schedule();
      timer = setInterval(schedule, 200);
      fade(0.7, 3);                          // 3 秒淡入
    },
    /** 火声音量 0~1（按镜头是否正对壁炉），平滑过渡。 */
    setFire(level) {
      fireLevel = level;
      if (fireBus) fireBus.gain.setTargetAtTime(level, ctx.currentTime, 0.3);
    },
    /** 大声噼啪时的回调（画面迸火星）。 */
    onCrackle(fn) { crackleListener = fn; },
    stop(seconds = 1.2) {
      if (!playing) return;
      playing = false;
      clearInterval(timer);
      fade(0, seconds);
    }
  };
}
