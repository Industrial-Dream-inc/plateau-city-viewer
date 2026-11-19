// English / Japanese UI text. Picks the browser language, ?lang=ja|en
// overrides it, and the toggle button remembers the choice.

const TEXT = {
  en: {
    broken: 'Broken buildings',
    cta: 'Photoreal version of this block →',
    ctaName: 'BunCho City API',
    stomp: 'Stomp (E)',
    rebuild: 'Rebuild',
    jump: 'Jump',
    introTitle: 'Walk a real block of Ginza, Tokyo',
    introBody: 'Every building is a separate PLATEAU building with its own hit box. Shoot one until it falls.',
    keys: '<kbd>W A S D</kbd> walk · <kbd>Shift</kbd> run · <kbd>Space</kbd> jump · <kbd>F</kbd> fly<br><kbd>Left click</kbd> shoot · <kbd>Right click</kbd>/<kbd>E</kbd> stomp · <kbd>Esc</kbd> release mouse',
    touch: 'Left side: drag to walk · Right side: drag to look, tap to shoot',
    start: 'Start',
    loading: 'Loading city…',
    toggle: '日本語',
  },
  ja: {
    broken: '壊した建物',
    cta: 'この区画の高精細版 →',
    ctaName: 'BunCho 街の API',
    stomp: '踏みつけ (E)',
    rebuild: '建て直す',
    jump: 'ジャンプ',
    introTitle: '東京・銀座の実在の1区画を歩く',
    introBody: '建物は PLATEAU の1棟ずつで、当たり判定も1棟ずつ。撃ち続けると崩れます。',
    keys: '<kbd>W A S D</kbd> 歩く · <kbd>Shift</kbd> 走る · <kbd>Space</kbd> ジャンプ · <kbd>F</kbd> 飛ぶ<br><kbd>左クリック</kbd> 撃つ · <kbd>右クリック</kbd>/<kbd>E</kbd> 踏みつけ · <kbd>Esc</kbd> マウスを戻す',
    touch: '左半分をドラッグで歩く · 右半分をドラッグで見回す · タップで撃つ',
    start: 'はじめる',
    loading: '街を読み込み中…',
    toggle: 'English',
  },
};

const KEY = 'pcv-lang';

function initial() {
  const q = new URLSearchParams(location.search).get('lang');
  if (q === 'ja' || q === 'en') return q;
  try { const s = localStorage.getItem(KEY); if (s === 'ja' || s === 'en') return s; } catch {}
  return (navigator.languages?.[0] || navigator.language || 'en').toLowerCase().startsWith('ja') ? 'ja' : 'en';
}

export let lang = initial();
export const t = (k) => TEXT[lang][k] ?? TEXT.en[k] ?? k;

const listeners = [];
export function onLangChange(fn) { listeners.push(fn); }

export function apply() {
  document.documentElement.lang = lang;
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
  const btn = document.getElementById('btn-lang');
  if (btn) btn.textContent = t('toggle');
  for (const fn of listeners) fn(lang);
}

export function setLang(l) {
  lang = l;
  try { localStorage.setItem(KEY, l); } catch {}
  apply();
}

export function toggle() { setLang(lang === 'ja' ? 'en' : 'ja'); }
