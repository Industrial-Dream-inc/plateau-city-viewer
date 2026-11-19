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
    helpTitle: 'CONTROLS',
    helpDesk: '<dt><kbd>W A S D</kbd> / <kbd>↑↓←→</kbd></dt><dd>Move</dd><dt>Mouse</dt><dd>Look (click the view first)</dd><dt><kbd>Shift</kbd></dt><dd>Run</dd><dt><kbd>Space</kbd></dt><dd>Jump</dd><dt><kbd>F</kbd></dt><dd>Fly on/off (<kbd>Space</kbd> up, <kbd>C</kbd> down)</dd><dt>Left click</dt><dd>Shoot</dd><dt>Right click / <kbd>E</kbd></dt><dd>Stomp</dd><dt><kbd>Esc</kbd></dt><dd>Free the mouse</dd><dt>日本語</dt><dd>Language (button, bottom left)</dd>',
    helpTouch: '<dt>Drag left half</dt><dd>Move (drag far to run)</dd><dt>Drag right half</dt><dd>Look</dd><dt>Tap right half</dt><dd>Shoot</dd><dt>Jump / Stomp</dt><dd>Buttons</dd><dt>日本語</dt><dd>Language (bottom left)</dd>',
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
    helpTitle: '操作',
    helpDesk: '<dt><kbd>W A S D</kbd> / <kbd>↑↓←→</kbd></dt><dd>移動</dd><dt>マウス</dt><dd>見回す（先に画面をクリック）</dd><dt><kbd>Shift</kbd></dt><dd>走る</dd><dt><kbd>Space</kbd></dt><dd>ジャンプ</dd><dt><kbd>F</kbd></dt><dd>飛ぶ／戻る（<kbd>Space</kbd> 上・<kbd>C</kbd> 下）</dd><dt>左クリック</dt><dd>撃つ</dd><dt>右クリック / <kbd>E</kbd></dt><dd>踏みつけ</dd><dt><kbd>Esc</kbd></dt><dd>マウスを戻す</dd><dt>English</dt><dd>言語（左下のボタン）</dd>',
    helpTouch: '<dt>左半分をドラッグ</dt><dd>移動（大きく動かすと走る）</dd><dt>右半分をドラッグ</dt><dd>見回す</dd><dt>右半分をタップ</dt><dd>撃つ</dd><dt>ジャンプ・踏みつけ</dt><dd>ボタン</dd><dt>English</dt><dd>言語（左下のボタン）</dd>',
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
