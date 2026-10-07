const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function brand() {
  const style = new Map();
  const context = vm.createContext({
    localStorage: {getItem: () => null, setItem: () => {}},
    document: {
      title: '',
      documentElement: {style: {setProperty: (key, value) => style.set(key, value)}, dataset: {}},
      querySelector: () => ({content: ''}),
    },
  });
  vm.runInContext(read('js/brand-config.js'), context);
  return code => vm.runInContext(code, context);
}

test('a theme is a structure plus a style, taken from the brand config', () => {
  const run = brand();
  run('applyBrandShell("dark")');
  assert.equal(run('document.documentElement.dataset.structure'), 'classic');
  assert.equal(run('document.documentElement.dataset.style'), 'heritage');
  assert.equal(run('document.documentElement.dataset.layout'), 'heritage');   // the earlier setting still stands
});

test('an unknown theme name falls back instead of leaving the app unstyled', () => {
  const run = brand();
  assert.deepEqual({...run('brandTheme()')}, {structure: 'classic', style: 'heritage'});
  const source = read('js/brand-config.js').replace('structure: "classic", style: "heritage"', 'structure: "nope", style: "nope"');
  const context = vm.createContext({localStorage: {getItem: () => null, setItem: () => {}}});
  vm.runInContext(source, context);
  assert.deepEqual({...vm.runInContext('brandTheme()', context)}, {structure: 'classic', style: 'heritage'});
});

test('the theme layer loads last and every changed file has a new cache key', () => {
  const html = read('index.html');
  const sheets = [...html.matchAll(/<link rel="stylesheet" href="(css\/[^"?]+)/g)].map(m => m[1]);
  const scripts = [...html.matchAll(/<script src="(js\/[^"?]+)/g)].map(m => m[1]);
  assert.equal(sheets.at(-1), 'css/theme.css');
  assert.equal(scripts.at(-1), 'js/theme.js');
  for (const file of ['js/customer-updates.js']) assert.ok(html.includes(`${file}?v=20261006-cx1"`), file);
  assert.ok(html.includes('js/account-orders.js?v=20261007-1b"'));   // Batch 1b (order note on the card) changed account-orders.js
  assert.ok(html.includes('user-scalable=no'));   // owner decision: pinch-zoom stays off
});

test('theme.js is presentation only', () => {
  const js = read('js/theme.js');
  for (const banned of ['fetch(', 'localStorage', 'sessionStorage', 'state.', 'innerHTML', 'supabase'])
    assert.equal(js.includes(banned), false, banned);
});

test('the frozen bars are limited to phone and tablet widths and respect reduced motion', () => {
  const css = read('css/theme.css');
  // remove every phone/tablet block; what is left is what the desktop website mode gets
  let desktop = css;
  for (let at; (at = desktop.indexOf('@media (max-width: 1024px)')) >= 0;) {
    let depth = 0, end = desktop.indexOf('{', at);
    for (; end < desktop.length; end++) {
      if (desktop[end] === '{') depth++;
      else if (desktop[end] === '}' && --depth === 0) break;
    }
    desktop = desktop.slice(0, at) + desktop.slice(end + 1);
  }
  assert.ok(desktop.length < css.length);
  // on desktop nothing freezes in the classic structure; the scroll structure may freeze its category row
  for (const rule of desktop.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (rule[2].includes('position: sticky')) assert.ok(rule[1].includes('html[data-structure="scroll"]'), rule[1].trim());
  }
  assert.equal(/position: absolute;[^}]*z-index: 25/.test(desktop), false);
  assert.ok(css.includes('prefers-reduced-motion: reduce'));
});

test('the Home tab and the Home address have separate labels', () => {
  const context = vm.createContext({});
  vm.runInContext(read('js/i18n.js') + '\n;globalThis.__i18n = typeof I18N !== "undefined" ? I18N : (typeof translations !== "undefined" ? translations : null);', context);
  const dict = context.__i18n;
  assert.ok(dict && dict.en && dict.ar);
  assert.equal(dict.en.home, 'Home');
  assert.equal(dict.ar.home, 'الرئيسية');
  assert.equal(dict.en.homeAddress, 'Home');
  assert.equal(dict.ar.homeAddress, 'المنزل');
  const app = read('js/app.js');
  assert.equal(app.includes('${t("home")}'), false);
  assert.ok(app.includes('t(address.type === "home" ? "homeAddress" : address.type)'));
});

test('order lists say "1 item", hide Load more on an empty tab, and totals stay on screen', () => {
  const app = read('js/app.js'), orders = read('js/account-orders.js');
  assert.ok(app.includes('function itemsCountLabel(count)'));
  assert.ok(orders.includes('itemsCountLabel(count)'));
  assert.ok(orders.includes('accountOrders.more&&(history||visible.length)'));
  assert.equal(app.split('class="cx-cta-bar"').length, 3);          // cart and checkout
  assert.equal(app.split('data-cx-total').length, 3);
  assert.equal(app.split('onclick="placeOrder()"').length, 2);      // still exactly one Place Order button
});

test('the logo is a sensible size for a phone', () => {
  const png = fs.readFileSync(path.join(__dirname, '../assets/images/meerath-logo.png'));
  assert.ok(png.length < 400 * 1024, `logo is ${png.length} bytes`);
  assert.ok(png.readUInt32BE(16) <= 1024 && png.readUInt32BE(20) <= 1024);   // pixel width and height
});
