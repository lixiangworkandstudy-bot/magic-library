// caption.js — 漂浮在书上方的文字：一次一句，朗读到哪个词，哪个词放大 + 荧光笔底（样式见 style.css「儿童阅读字幕」）
//
// 为什么不滚动：刚学认字的孩子眼睛需要停在一个地方逐字辨认，移动的文字会让认字更难。
// 所以这里是"整句静止显示 + 读到哪个词亮哪个词"，一句读完，下一句淡入替换。
//
// 朗读先用浏览器自带的 TTS（speechSynthesis）：
//   · 浏览器给出词边界事件（boundary）时，按事件精确高亮；
//   · 不给时，按字数估算节奏高亮（基本跟得上，但不是逐字精准）。
// 以后换真人 / AI 配音文件时，给每句加词级时间戳即可（passage.audio + passage.timings）。

const SPEAK_KEY = 'magic-library/narrate';
const CHAR_SECONDS = { zh: 0.27, en: 0.068 };   // 估算：每个字符大约多少秒（中文一个字 / 英文一个字母，语速 0.9 左右）
const PAUSE_AFTER = /[，。！？、；：,.!?;:]/;   // 标点后多停一下

export function createCaption({ root, lang = 'zh', onNeedNext, onLang }) {
  const synth = window.speechSynthesis;
  const makeSegmenter = l => (typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(l, { granularity: 'word' }) : null);
  let segmenter = makeSegmenter(lang);
  let voice = null;
  let passages = [], index = 0, token = 0, timers = [];
  let passageHook = null;
  let wordHook = null;             // (passage, charStart) => void，-1 = 没有正在读的词          // (passage, index) => Promise | void，见 show()
  let narrate = (() => { try { return localStorage.getItem(SPEAK_KEY) !== 'off'; } catch { return true; } })();

  // 选一个对应语言、音质最好的嗓音（嗓音列表是异步加载的）
  // 排序：名字里带 Premium / Enhanced / Neural 的高质量声音 > Google 在线声音 > 常见的好听声音 > 其它
  const PREFERRED = {
    en: ['Samantha', 'Ava', 'Allison', 'Zoe', 'Karen', 'Serena', 'Moira', 'Daniel'],
    zh: ['Tingting', 'Meijia', 'Lili', 'Yu-shu']
  };
  const score = v => {
    const n = v.name;
    let s = 0;
    if (/Premium|Enhanced|Neural|Natural/i.test(n)) s += 100;
    if (/Google/i.test(n)) s += 60;
    const i = PREFERRED[lang].findIndex(p => n.includes(p));
    if (i >= 0) s += 40 - i;
    if (lang === 'en' && /en[-_]US/i.test(v.lang)) s += 10;
    if (lang === 'zh' && /zh[-_]CN/i.test(v.lang)) s += 10;
    return s;
  };
  const pickVoice = () => {
    const voices = (synth ? synth.getVoices() : []).filter(v => v.lang.toLowerCase().startsWith(lang));
    voice = voices.sort((a, b) => score(b) - score(a))[0] || null;
  };
  if (synth) { pickVoice(); synth.addEventListener?.('voiceschanged', pickVoice); }

  // ---- DOM：[🔊 开关] [说话人 + 这一句] [📜 全文]
  root.innerHTML = '';
  const toggle = Object.assign(document.createElement('button'), { type: 'button', className: 'caption-btn caption-speak' });
  const body = Object.assign(document.createElement('div'), { className: 'caption-body' });
  const speaker = Object.assign(document.createElement('span'), { className: 'caption-speaker' });
  const line = Object.assign(document.createElement('p'), { className: 'caption-line' });
  body.append(speaker, line);
  const full = Object.assign(document.createElement('button'), { type: 'button', className: 'caption-btn caption-full', textContent: '全文' });
  full.dataset.icon = 'scroll';
  const langBtn = Object.assign(document.createElement('button'), { type: 'button', className: 'caption-btn caption-lang' });
  root.append(toggle, body, langBtn, full);
  const renderLang = () => {
    langBtn.textContent = lang === 'zh' ? 'EN' : '中';
    langBtn.setAttribute('aria-label', lang === 'zh' ? 'Switch to English' : '切换到中文');
    full.textContent = lang === 'zh' ? '全文' : 'Text';
  };
  renderLang();
  langBtn.addEventListener('click', e => { e.stopPropagation(); onLang && onLang(lang === 'zh' ? 'en' : 'zh'); });
  const renderToggle = () => {
    toggle.textContent = '';
    toggle.dataset.icon = 'sound';   // 关掉时的静音图标由 CSS 按 aria-pressed 切换
    toggle.setAttribute('aria-label', narrate ? '朗读：开' : '朗读：关');
    toggle.setAttribute('aria-pressed', String(narrate));
  };
  renderToggle();

  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };

  /** 把一句话切成词（中文用 Intl.Segmenter 按词切；没有就按字）。每个词一个 <span>，记住它在原句里的位置。 */
  function renderLine(text) {
    const pieces = segmenter
      ? [...segmenter.segment(text)].map(s => ({ text: s.segment, start: s.index }))
      : [...text].map((ch, i) => ({ text: ch, start: i }));
    line.classList.toggle('zh', lang === 'zh');   // 中文换楷体字形
    // 标点粘到旁边的词上：每个词是一个 inline-block，浏览器的"标点不放行首"规则管不到跨 span，
    // 不粘的话"！"会单独掉到下一行开头。收尾标点粘前一个词，开头的引号粘后一个词。
    const CLOSING = /^[，。！？、；：,.!?;:”’」』）)…—]+$/, OPENING = /^[“‘「『（(]+$/;
    const spans = [];
    let carry = '';
    for (const p of pieces) {
      const prev = spans[spans.length - 1];
      if (CLOSING.test(p.text) && prev && prev.className === 'caption-word') { prev.textContent += p.text; continue; }
      if (OPENING.test(p.text)) { carry += p.text; continue; }
      const span = document.createElement('span');
      // 空格单独一类：词是 inline-block（才能放大），纯空格做成 inline-block 会被压成 0 宽
      span.className = p.text.trim() ? 'caption-word' : 'caption-space';
      span.textContent = (p.text.trim() ? carry : '') + p.text;
      if (p.text.trim()) carry = '';
      span.dataset.start = p.start;
      if (!PAUSE_AFTER.test(p.text) && p.text.trim()) {
        span.addEventListener('click', e => { e.stopPropagation(); speakWord(p.text, p.start); });   // 点一个词：单独再读一遍
      }
      spans.push(span);
    }
    line.replaceChildren(...spans);
    return [...line.children];
  }

  const GROW = 1.42;   // 当前词放大倍数（和 style.css 里 .caption-word.now 的 scale 保持一致）
  function highlight(words, i) {
    reportWord(words, i);
    words.forEach((w, k) => {
      w.classList.toggle('read', k < i);
      const isNow = k === i && w.classList.contains('caption-word');
      w.classList.toggle('now', isNow);
      // 放大是 transform，不占位置；按这个词自己的宽度算出"多出来的半边"，用 margin 给邻居让位
      // 这样长词（close）不会盖住旁边的标点，短词也不会让出一大块空白
      w.style.margin = isNow ? `0 ${Math.ceil(w.offsetWidth * (GROW - 1) / 2) + 2}px` : '';
    });
  }
  // 插图书：字印在书页上，朗读到哪个词由书页自己高亮（js/pagebook.js）
  function reportWord(words, i) {
    if (!wordHook) return;
    const w = words[i];
    wordHook(passages[index], w && w.classList.contains('caption-word') ? Number(w.dataset.start) : -1);
  }

  // ---- 配音文件（tools/make_voice.py 生成）：assets/voice/<lang>/<句子id>.json + .mp3
  // 有就用神经网络配音 + 精确的词级时间；没有就回退到浏览器朗读。
  const audioEl = new Audio();
  const timingCache = new Map();
  let currentTiming = null, rafId = 0;

  async function loadTiming(id) {
    const key = `${lang}/${id}`;
    if (!timingCache.has(key)) {
      timingCache.set(key, fetch(`assets/voice/${key}.json`).then(r => (r.ok ? r.json() : null)).catch(() => null));
    }
    return timingCache.get(key);
  }

  function stopAudio() {
    audioEl.pause();
    cancelAnimationFrame(rafId);
  }

  /** 一句读完：标记全部读过，停一下接下一句；这一页读完交给外面（提示翻页）。 */
  function finish(my, words) {
    if (my !== token) return;
    highlight(words, words.length);
    timers.push(setTimeout(() => {
      if (my !== token) return;
      if (index < passages.length - 1) show(index + 1);
      else onNeedNext && onNeedNext();
    }, 700));
  }

  /** 播放配音：每一帧看播到第几秒，找到对应的词，高亮它。 */
  function playAudio(timing, words, my) {
    audioEl.src = timing.audio;
    audioEl.currentTime = 0;
    audioEl.onended = () => { cancelAnimationFrame(rafId); finish(my, words); };
    const follow = () => {
      if (my !== token) return;
      const t = audioEl.currentTime;
      const w = timing.words.findLast(x => x.start <= t + 0.03);
      if (w) highlight(words, words.findLastIndex(span => Number(span.dataset.start) <= w.index));
      rafId = requestAnimationFrame(follow);
    };
    audioEl.play().then(() => { rafId = requestAnimationFrame(follow); })
      .catch(() => speakTTS(passages[index], words, my));      // 播放失败（比如被浏览器拦下）→ 回退到浏览器朗读
  }

  /** 点一个词：有配音就只播原音频里这个词的那一小段；没有就用浏览器读这个词。 */
  function speakWord(text, charStart) {
    const w = currentTiming && currentTiming.words.find(x => charStart >= x.index && charStart < x.index + x.text.length);
    token++;
    clearTimers();
    if (synth) synth.cancel();
    stopAudio();
    if (w) {
      const my = token;
      audioEl.src = currentTiming.audio;
      audioEl.onended = null;
      audioEl.currentTime = Math.max(0, w.start - 0.03);
      audioEl.play().catch(() => {});
      const stopAt = () => {
        if (my !== token) return;
        if (audioEl.currentTime >= w.end + 0.06) { audioEl.pause(); return; }
        rafId = requestAnimationFrame(stopAt);
      };
      rafId = requestAnimationFrame(stopAt);
      return;
    }
    if (!synth) return;
    const u = new SpeechSynthesisUtterance(text.slice(charStart).split(/[\s，。！？,.!?]/)[0] || text);
    u.lang = lang === 'zh' ? 'zh-CN' : 'en-US';
    if (voice) u.voice = voice;
    u.rate = lang === 'zh' ? 0.8 : 0.85;
    synth.speak(u);
  }

  /** 显示并（可选）朗读第 i 句。 */
  function show(i) {
    const my = ++token;
    clearTimers();
    if (synth) synth.cancel();
    stopAudio();
    index = i;
    const p = passages[i];
    if (!p) return;
    root.classList.remove('swap');
    void root.offsetWidth;                    // 重新触发淡入动画
    root.classList.add('swap');
    speaker.textContent = p.speaker || '';
    const words = renderLine(p.text);
    highlight(words, -1);
    currentTiming = null;
    // 读到这一段之前先问一下"线索"：书里的魔法可以挂在原文段落上（js/mechanics.js）。
    // 返回 Promise 的线索（比如"先问孩子：你看到了什么？"）会让朗读等它完成再开始。
    const hold = Promise.resolve(passageHook ? passageHook(p, i) : null);
    Promise.all([loadTiming(p.id), hold]).then(([timing]) => {
      if (my !== token) return;
      currentTiming = timing;
      if (!narrate) return;
      if (timing) playAudio(timing, words, my);
      else if (synth) speakTTS(p, words, my);
    });
  }

  /** 浏览器朗读（没有配音文件时的后备）。 */
  function speakTTS(p, words, my) {
    const u = new SpeechSynthesisUtterance(p.text);
    u.lang = lang === 'zh' ? 'zh-CN' : 'en-US';
    if (voice) u.voice = voice;
    u.rate = 0.9;
    u.pitch = lang === 'en' ? 1.08 : 1;
    let gotBoundary = false;
    // 精确模式：浏览器报告"读到第几个字了"
    u.onboundary = e => {
      if (my !== token || e.name === 'sentence') return;
      gotBoundary = true;
      clearTimers();
      highlight(words, words.findLastIndex(w => Number(w.dataset.start) <= e.charIndex));
    };
    // 估算模式：没有词边界事件时，按字数排一个节奏
    u.onstart = () => {
      if (my !== token) return;
      let t = 0;
      words.forEach((w, k) => {
        timers.push(setTimeout(() => { if (!gotBoundary && my === token) highlight(words, k); }, t * 1000));
        t += [...w.textContent].length * CHAR_SECONDS[lang] + (PAUSE_AFTER.test(w.textContent) ? 0.25 : 0);
      });
    };
    u.onend = () => finish(my, words);
    synth.speak(u);
  }

  // 点字幕空白处：关着朗读时 = 下一句；开着时 = 重读这一句
  body.addEventListener('click', () => {
    if (!narrate && index < passages.length - 1) show(index + 1);
    else show(index);
  });
  toggle.addEventListener('click', () => {
    narrate = !narrate;
    try { localStorage.setItem(SPEAK_KEY, narrate ? 'on' : 'off'); } catch { /* ignore */ }
    renderToggle();
    if (narrate) show(index); else { token++; clearTimers(); if (synth) synth.cancel(); stopAudio(); }
  });

  return {
    /** 换一页：显示这一页的第一句（autoplay = 是否开始朗读）。 */
    setPassages(list, autoplay) {
      passages = list || [];
      const was = narrate;
      if (!autoplay) narrate = false;
      show(0);
      narrate = was;
    },
    play() { show(index); },
    stop() { token++; clearTimers(); if (synth) synth.cancel(); stopAudio(); },
    onFull(fn) { full.addEventListener('click', e => { e.stopPropagation(); fn(); }); },
    /** 切换朗读语言：换嗓音、换分词方式；外面接着调用 setPassages 换成这种语言的文字。 */
    setLang(next) {
      lang = next;
      segmenter = makeSegmenter(lang);
      pickVoice();
      renderLang();
    },
    get voiceName() { return voice ? `${voice.name} (${voice.lang})` : 'default'; },
    /** 每读到一段就调用 fn(passage, index)；返回 Promise 时朗读等它完成。 */
    onPassage(fn) { passageHook = fn; },
    /** 每读到一个词就调用 fn(passage, charStart)。 */
    onWord(fn) { wordHook = fn; },
    /** 用浏览器朗读单独读一个词（点书页上的词时用）。 */
    sayWord(text) {
      // 不能复用 speakWord：它会去当前句子的配音里找"第 0 个字"。这里直接用浏览器朗读这个词
      if (!synth) return;
      token++; clearTimers(); synth.cancel(); stopAudio();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang === 'zh' ? 'zh-CN' : 'en-US';
      if (voice) u.voice = voice;
      u.rate = 0.8;
      synth.speak(u);
    },
    /** 这本书只有一种语言时，藏起语言切换按钮。 */
    setLanguages(list) { langBtn.hidden = !list || list.length < 2; }
  };
}
