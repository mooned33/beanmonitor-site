import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';

const html = await readFile('index.html', 'utf8');
const code = html.slice(html.indexOf('var I18N ='), html.indexOf("document.getElementById('year')"));
function render(search = '', saved = '', browserLanguage = 'fr-BE') {
  const elements = new Map();
  const storage = new Map(saved ? [['beanmonitor-language', saved]] : []);
  let current = new URL('https://www.beanmonitor.coffee/' + search);
  const document = {
    documentElement: {}, body: { setAttribute() {} },
    querySelectorAll: () => [],
    getElementById(id) { if (!elements.has(id)) elements.set(id, { addEventListener() {} }); return elements.get(id); },
  };
  const context = { document, URL, URLSearchParams, navigator: { language: browserLanguage },
    location: current, localStorage: { getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v) },
    history: { replaceState(_a,_b,url) { current = new URL(url, current); } },
  };
  runInNewContext(code, context);
  return { document, context, url: () => current, storage };
}
const clean = render();
assert.equal(clean.document.documentElement.lang || 'en', 'en', 'canonical homepage must not vary with browser language');
clean.context.setLang('fr');
assert.equal(clean.document.documentElement.lang, 'fr');
assert.equal(clean.url().search, '', 'language selection must not create duplicate query URLs');
assert.equal(clean.storage.get('beanmonitor-language'), 'fr');
const legacy = render('?lang=es&utm_source=email#pricing');
assert.equal(legacy.document.documentElement.lang, 'es');
assert.equal(legacy.url().search, '?utm_source=email');
assert.equal(legacy.url().hash, '#pricing');
assert.equal(render('', 'ja').document.documentElement.lang, 'ja');
assert.equal(render('?lang=invalid').url().search, '');
console.log('Homepage language canonicalization checks passed.');
