// 生成 5 个语言的静态页面：/（英）、/ja/、/ko/、/zh-cn/、/zh-tw/
// 每个页面：静态文案用对应语言（SEO 可抓取）+ hreflang 互认 + canonical
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const locales = JSON.parse(fs.readFileSync(path.join(root, 'src/locales.json'), 'utf8'));
const template = fs.readFileSync(path.join(root, 'src/template.html'), 'utf8');

// 站点根地址（部署后如有自有域名，改这里即可）
const SITE = 'https://glb-shrink.pages.dev';

const PAGES = [
  { lang: 'en', dir: '', htmlLang: 'en', href: `${SITE}/` },
  { lang: 'zh-CN', dir: 'zh-cn', htmlLang: 'zh-CN', href: `${SITE}/zh-cn/` },
  { lang: 'zh-TW', dir: 'zh-tw', htmlLang: 'zh-TW', href: `${SITE}/zh-tw/` },
  { lang: 'ja', dir: 'ja', htmlLang: 'ja', href: `${SITE}/ja/` },
  { lang: 'ko', dir: 'ko', htmlLang: 'ko', href: `${SITE}/ko/` },
];

const LABELS = { en: 'English', 'zh-CN': '简体中文', 'zh-TW': '繁體中文', ja: '日本語', ko: '한국어' };

for (const page of PAGES) {
  const $ = cheerio.load(template, { decodeEntities: false });
  const T = (key) => (locales[key] && locales[key][page.lang]) || (locales[key] && locales[key].en) || key;

  $('html').attr('lang', page.htmlLang);

  $('head title').text(T('meta.title'));
  $('meta[name="description"]').attr('content', T('meta.description'));
  $('meta[property="og:title"]').attr('content', T('meta.title'));
  $('meta[property="og:description"]').attr('content', T('meta.description'));
  $('meta[name="twitter:title"]').attr('content', T('meta.title'));
  $('meta[name="twitter:description"]').attr('content', T('meta.description'));

  $('link[rel="canonical"]').attr('href', page.href);
  $('meta[property="og:url"]').attr('content', page.href);

  // hreflang 全套互认
  $('link[rel="alternate"]').remove();
  const altLinks = PAGES.map(
    (p) => `    <link rel="alternate" hreflang="${p.htmlLang}" href="${p.href}" />`
  ).join('\n');
  const xDefault = `    <link rel="alternate" hreflang="x-default" href="${SITE}/" />`;
  $('link[rel="canonical"]').after(`\n${altLinks}\n${xDefault}`);

  // JSON-LD
  const ldText = $('script[type="application/ld+json"]').text();
  if (ldText.trim()) {
    const ld = JSON.parse(ldText);
    ld.url = page.href;
    ld.description = T('meta.description');
    ld.inLanguage = page.htmlLang;
    $('script[type="application/ld+json"]').text(JSON.stringify(ld, null, 2));
  }

  // 所有 data-i18n 元素按语言填充静态文案
  $('[data-i18n]').each((_, el) => {
    const key = $(el).attr('data-i18n');
    if (key) $(el).text(T(key));
  });
  $('[data-i18n-aria]').each((_, el) => {
    const key = $(el).attr('data-i18n-aria');
    if (key) $(el).attr('aria-label', T(key));
  });
  $('[data-i18n-placeholder]').each((_, el) => {
    const key = $(el).attr('data-i18n-placeholder');
    if (key) $(el).attr('placeholder', T(key));
  });

  // 语言下拉的初始状态（JS 未执行时也正确）
  $('#lang-current').text(LABELS[page.lang]);
  $('#lang-menu .lang-option').each((_, el) => {
    const active = $(el).attr('data-lang') === page.lang;
    $(el).toggleClass('active', active);
    $(el).attr('aria-selected', active ? 'true' : 'false');
  });

  const outPath = page.dir
    ? path.join(root, page.dir, 'index.html')
    : path.join(root, 'index.html');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, $.html(), 'utf8');
  console.log('generated:', path.relative(root, outPath));
}

console.log('done. pages:', PAGES.length);
