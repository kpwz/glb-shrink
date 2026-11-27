// 多语言运行时：文案来自 locales.json（单一数据源），语言由 URL 路径决定
import dict from './locales.json';

export type Lang = 'en' | 'zh-CN' | 'zh-TW' | 'ja' | 'ko';

export const LANGS: Lang[] = ['en', 'zh-CN', 'zh-TW', 'ja', 'ko'];

/** 语言下拉里显示的语言名（各语言用母语写法） */
export const LANG_LABELS: Record<Lang, string> = {
  en: 'English',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  ja: '日本語',
  ko: '한국어',
};

const LANG_HTML: Record<Lang, string> = {
  en: 'en',
  'zh-CN': 'zh-CN',
  'zh-TW': 'zh-TW',
  ja: 'ja',
  ko: 'ko',
};

/** 每种语言对应的独立网址（SEO 用） */
export const LANG_PATH: Record<Lang, string> = {
  en: '/',
  'zh-CN': '/zh-cn/',
  'zh-TW': '/zh-tw/',
  ja: '/ja/',
  ko: '/ko/',
};

type Entry = Record<Lang, string>;
const DICT = dict as Record<string, Entry>;

let current: Lang = 'en';

export function getLang(): Lang {
  return current;
}

export function t(key: string, params?: Record<string, string | number>): string {
  const entry = DICT[key];
  let text = entry ? entry[current] : key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}

export function setLang(lang: Lang) {
  current = lang;
  document.documentElement.lang = LANG_HTML[lang];
  applyStatic();
}

/** 从 URL 路径解析语言；根路径返回 null */
export function langFromPath(pathname: string): Lang | null {
  const p = pathname.toLowerCase();
  if (p.startsWith('/zh-cn/') || p === '/zh-cn') return 'zh-CN';
  if (p.startsWith('/zh-tw/') || p === '/zh-tw') return 'zh-TW';
  if (p.startsWith('/ja/') || p === '/ja') return 'ja';
  if (p.startsWith('/ko/') || p === '/ko') return 'ko';
  return null;
}

/** 根据浏览器语言自动匹配（用于根路径跳转） */
export function detectBrowserLang(): Lang {
  const list =
    typeof navigator !== 'undefined' && navigator.languages?.length
      ? navigator.languages
      : [typeof navigator !== 'undefined' ? navigator.language : 'en'];
  for (const raw of list) {
    const l = String(raw || '').toLowerCase();
    if (l.startsWith('zh')) {
      if (l.includes('tw') || l.includes('hk') || l.includes('mo') || l.includes('hant')) return 'zh-TW';
      return 'zh-CN';
    }
    if (l.startsWith('ja')) return 'ja';
    if (l.startsWith('ko')) return 'ko';
    if (l.startsWith('en')) return 'en';
  }
  return 'en';
}

/** 初始化：优先按 URL 路径锁定语言；根路径用「会话内手动选择 > 浏览器语言」 */
export function initLang(picked?: Lang | null): Lang {
  const fromPath = langFromPath(location.pathname);
  if (fromPath) {
    current = fromPath;
  } else {
    current = picked ?? detectBrowserLang();
  }
  document.documentElement.lang = LANG_HTML[current];
  return current;
}

/** 把所有 [data-i18n] 元素的文案更新为当前语言 */
export function applyStatic() {
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n;
    if (key) el.textContent = t(key);
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-placeholder]').forEach((el) => {
    const key = el.dataset.i18nPlaceholder;
    if (key) el.setAttribute('placeholder', t(key));
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach((el) => {
    const key = el.dataset.i18nAria;
    if (key) el.setAttribute('aria-label', t(key));
  });
}
