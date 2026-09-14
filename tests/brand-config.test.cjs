const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function environment() {
  const storage = new Map();
  const style = new Map();
  const description = {content: ''};
  const themeColor = {content: ''};
  const context = vm.createContext({
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
    document: {
      title: '',
      documentElement: {style: {setProperty: (key, value) => style.set(key, value)}, dataset: {}},
      querySelector: selector => selector.includes('description') ? description : themeColor,
    },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/brand-config.js'), 'utf8'), context);
  return {run: code => vm.runInContext(code, context), storage, style, description, themeColor};
}

test('brand config keeps restaurant identity and public backend contract together', () => {
  const {run} = environment();
  assert.equal(run('APP_CONFIG.tenant.restaurantId'), '11111111-1111-1111-1111-111111111111');
  assert.equal(run('APP_CONFIG.brand.name'), 'Meerath Kabab');
  assert.equal(run('APP_CONFIG.backend.rpc.menu'), 'meerath_customer_menu_v1');
  assert.equal(run('featureEnabled("catering")'), true);
});

test('brand storage is tenant namespaced and migrates legacy values', () => {
  const {run, storage} = environment();
  storage.set('mk-lang', 'ar');
  assert.equal(run('readAppStorage("language", ["mk-lang"])'), 'ar');
  assert.equal(storage.get('oracy:meerath-kabab:language:v1'), 'ar');
});

test('brand shell applies layout, metadata and theme palette', () => {
  const {run, style, description, themeColor} = environment();
  run('applyBrandShell("light")');
  assert.equal(run('document.title'), 'Meerath Kabab');
  assert.equal(run('document.documentElement.dataset.layout'), 'heritage');
  assert.equal(style.get('--orange'), '#c76600');
  assert.match(description.content, /Meerath Kabab/);
  assert.equal(themeColor.content, '#f6f6f4');
});
