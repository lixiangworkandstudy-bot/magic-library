// profile.js — 孩子的阅读进度（图书馆和立体书页共用）
//
// 第一版只存在这台设备的浏览器里（localStorage）；以后做账号/多孩子时，替换这个文件即可，
// 其它代码只通过下面几个函数读写进度。
//
// 数据结构：
//   level      当前级别（1 起）。第一版不做定级，默认 1
//   visited    是否来过书房（决定是否播放"找发光的书"新手引导）
//   current    正在读的书 id
//   opened     打开过的书 id（最近的在前）
//   finished   读完的书 id
//   lang       界面语言（'en' | 'zh'），null = 用书房的默认语言
//   secrets    找到的隐形墨水秘密 id

const KEY = 'magic-library/profile/v1';

const DEFAULT_PROFILE = { level: 1, visited: false, current: null, opened: [], finished: [], lang: null, secrets: [] };

export function loadProfile() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_PROFILE, ...JSON.parse(raw) } : { ...DEFAULT_PROFILE };
  } catch {
    return { ...DEFAULT_PROFILE };        // 隐私模式等读不到存储时，当作第一次来
  }
}

export function saveProfile(profile) {
  try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch { /* 存不了就算了，不影响阅读 */ }
}

/** 打开一本书：记为"正在读"，并放到"打开过"的最前面。 */
export function markOpened(bookId) {
  const p = loadProfile();
  p.current = bookId;
  p.visited = true;
  p.opened = [bookId, ...p.opened.filter(id => id !== bookId)];
  saveProfile(p);
}

/** 读到最后一页：记为"读过"。 */
export function markFinished(bookId) {
  const p = loadProfile();
  if (!p.finished.includes(bookId)) p.finished.push(bookId);
  saveProfile(p);
}

/**
 * 升级规则（第一版）：当前级别读完 N 本 → 升一级。
 * 返回新解锁的级别，没升级返回 null。
 */
export function checkLevelUp(books, rules) {
  const p = loadProfile();
  if (p.level >= rules.maxLevel) return null;
  const finishedAtLevel = books.filter(b => b.level === p.level && p.finished.includes(b.id)).length;
  if (finishedAtLevel < rules.levelUpAfter) return null;
  p.level += 1;
  saveProfile(p);
  return p.level;
}

/** 找到一个隐形墨水秘密，返回已找到的总数。 */
export function markSecret(id) {
  const p = loadProfile();
  if (!p.secrets.includes(id)) p.secrets.push(id);
  saveProfile(p);
  return p.secrets.length;
}

/** 切换界面语言。 */
export function setLang(lang) { const p = loadProfile(); p.lang = lang; saveProfile(p); }

/** 开发/家长用：直接设置级别或清空进度（键盘 L / R，见 library.js）。 */
export function setLevel(level) { const p = loadProfile(); p.level = level; saveProfile(p); }
export function resetProfile() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
