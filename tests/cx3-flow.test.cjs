// Run: node --test tests/cx3-flow.test.cjs. No database writes/network.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
class TestDate extends Date {
  constructor(...args) { super(...(args.length ? args : ['2026-09-08T12:00:00Z'])); }
  static now() { return Date.parse('2026-09-08T12:00:00Z'); }
}
function environment() {
  const c = vm.createContext({console, URL, Intl, Date: TestDate, setTimeout: () => 0,
    localStorage: {getItem: () => null}, window: {},
    document: {getElementById: () => ({parentElement: {scrollTop: 0}}), querySelectorAll: () => []}});
  for (const file of ['js/brand-config.js', 'js/data.js', 'js/ordering-hours.js', 'js/auth.js', 'js/content.js'])
    vm.runInContext(read(file), c);
  const app = read('js/app.js');
  vm.runInContext(app.slice(0, app.lastIndexOf('\napplyDir();')), c);
  vm.runInContext(`toast = () => {}; render = () => {}; renderKeepScroll = () => {};
    const I18N = {en:{sar:'SAR'},ar:{sar:'ر.س'}};
    const id = '22222222-2222-2222-2222-222222222222';
    const cat = '33333333-3333-3333-3333-333333333333';
    const branch = '44444444-4444-4444-4444-444444444444';
    const row = {id, category_id:cat, base_price:18, is_available:true, name_en:'Test dish'};
    const payload = {version:1,offers_version:1,restaurant_id:MENU_CONFIG.restaurantId,
      categories:[{id:cat,name_en:'Grill'}],subcategories:[],items:[row],schedules:[],
      branches:[{id:branch}],branch_items:[{branch_id:branch,menu_item_id:id,is_available:true}]};
    const now = new Date('2026-09-08T12:00:00Z');
    function ready() {
      menuConnection.status='ready'; menuConnection.lastSuccess=Date.now();
      menuConnection.payload=payload;
      const m=mapMenu(payload,now); CATEGORIES=m.categories; ITEMS=m.items; OFFERS=m.offers;
    }
  `, c);
  return code => vm.runInContext(code, c);
}

test('the item screen starts at quantity 1 and shows the amount on the Add button', () => {
  const run = environment();
  run(`ready(); state.screen='listing'; openItem(id);`);
  assert.equal(run('state.detailQty'), 1);
  const html = run('detail()');
  assert.ok(html.includes('id="cxAddQty"') && html.includes('id="cxAddTotal"'));
  assert.ok(html.includes(run('money(18)')));
  assert.ok(html.includes('>Grill<'));                       // the category, not a fixed line
  assert.equal(html.includes('style="margin-top:-48px'), false);
});

test('quantity goes up and down, never below 1, and the amount follows', () => {
  const run = environment();
  run(`ready(); state.screen='listing'; openItem(id); setDetailQty(1); setDetailQty(1);`);
  assert.equal(run('state.detailQty'), 3);
  assert.ok(run('detail()').includes(run('money(54)')));
  run(`setDetailQty(-1); setDetailQty(-1); setDetailQty(-1); setDetailQty(-1);`);
  assert.equal(run('state.detailQty'), 1);
});

test('Add puts that quantity in the cart at the unit price and returns to browsing', () => {
  const run = environment();
  run(`ready(); state.screen='listing'; openItem(id); setDetailQty(1); setDetailQty(1); addFromDetail();`);
  assert.equal(run('state.cart.length'), 1);
  assert.equal(run('state.cart[0].qty'), 3);
  assert.equal(run('state.cart[0].price'), 18);              // the line keeps the unit price; qty is separate
  assert.equal(run('state.screen'), 'listing');
  assert.equal(run('state.detailQty'), 1);
});

test('an item opened from the cart goes back to the cart after Add', () => {
  const run = environment();
  run(`ready(); addToCart(ITEMS[0]); state.screen='cart'; openItem(id); addFromDetail();`);
  assert.equal(run('state.screen'), 'cart');
  assert.equal(run('state.cart[0].qty'), 2);
});

test('an offer limit caps the quantity on the item screen', () => {
  const run = environment();
  run(`row.offer={has_offer:true,offer_active:true,offer_type:'percentage',offer_discount:20,
      offer_valid_from:'2026-09-08',offer_valid_to:'2026-09-08',offer_max_qty:2};
    ready(); state.screen='listing'; openItem(id); setDetailQty(1); setDetailQty(1); setDetailQty(1);`);
  assert.equal(run('state.detailQty'), 2);
  run('addFromDetail()');
  assert.equal(run('state.cart[0].qty'), 2);
});

test('editing a cart line has no quantity control and keeps the line quantity', () => {
  const run = environment();
  run(`ready(); addToCart(ITEMS[0], 2); openCartItem(0);`);
  const html = run('detail()');
  assert.equal(html.includes('id="cxAddQty"'), false);
  run(`setDetailQty(1); addFromDetail();`);
  assert.equal(run('state.cart.length === 1 && state.cart[0].qty === 2'), true);
});

test('the browsing cart bar is hidden when empty and shows count and items subtotal otherwise', () => {
  const run = environment();
  run('ready();');
  assert.ok(run('cartBarMarkup()').includes('hidden'));
  run('addToCart(ITEMS[0], 3);');
  const bar = run('cartBarMarkup()');
  assert.equal(bar.includes('hidden'), false);
  assert.ok(bar.includes('>3<') && bar.includes(run('money(54)')));
  for (const screen of ['home', 'menu', 'listing']) assert.ok(run(`${screen}()`).includes('cx-cart-bar'), screen);
  for (const screen of ['detail', 'cart']) assert.equal(run(`state.itemId=id;${screen}()`).includes('cx-cart-bar'), false, screen);
});

test('changed files have new cache keys; one Place Order button; a message stays clear of the main button', () => {
  const html = read('index.html'), app = read('js/app.js'), css = read('css/theme.css');
  for (const file of ['css/theme.css', 'js/theme.js', 'js/app.js']) assert.ok(html.includes(`${file}?v=20261006-cx3"`), file);
  assert.equal(app.split('onclick="placeOrder()"').length, 2);
  assert.ok(css.includes('.phone:has(.cx-cta-bar) .toast'));
  assert.ok(css.includes('.cx-cart-bar { display: none; }'));   // desktop website mode keeps its own layout
});
