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

test('the smart cart dock is hidden when empty and shows the last items, count and items subtotal otherwise', () => {
  const run = environment();
  run('ready();');
  assert.ok(run('cartBarMarkup()').includes('class="cx-cart-bar" hidden'));
  run('addToCart(ITEMS[0], 3);');
  const bar = run('cartBarMarkup()');
  assert.equal(bar.includes('class="cx-cart-bar" hidden'), false);
  assert.ok(bar.includes('data-count="3"') && bar.includes('data-total="54"') && bar.includes(run('money(54)')));
  assert.equal(bar.split('class="cx-dock-thumb"').length - 1, 1);            // one line in the cart, one thumbnail
  assert.equal(bar.split('onclick=').length - 1, 1);                           // one way in
  assert.equal(/price|unit/i.test(bar.replace(/cx-[\w-]+/g, '')), false);
  for (const screen of ['home', 'menu', 'listing']) assert.ok(run(`${screen}()`).includes('cx-cart-bar'), screen);
  for (const screen of ['detail', 'cart']) assert.equal(run(`state.itemId=id;${screen}()`).includes('cx-cart-bar'), false, screen);
});

test('changed files have new cache keys; one Place Order button; a message stays clear of the main button', () => {
  const html = read('index.html'), app = read('js/app.js'), css = read('css/theme.css');
  for (const file of ['js/data.js']) assert.ok(html.includes(`${file}?v=20261007-1b"`), file);   // Batch 1b (order note) changed data.js
  assert.equal(app.split('onclick="placeOrder()"').length, 2);
  assert.ok(css.includes('.phone:has(.cx-cta-bar) .toast'));
  assert.ok(css.includes('.cx-cart-bar { display: none; }'));   // desktop website mode keeps its own layout
});

test('the dock shows at most three thumbnails, newest first', () => {
  const run = environment();
  run(`ready(); for (let n = 0; n < 5; n++) { const item = {id:'extra-'+n, name:'Extra '+n, price:10, basePrice:10, available:true, offer:null, image:'https://img.test/'+n+'.png', options:[]}; ITEMS.push(item); addToCart(item); }`);
  const bar = run('cartBarMarkup()');
  assert.equal(bar.split('class="cx-dock-thumb"').length - 1, 3);
  assert.ok(bar.indexOf('img.test/4.png') < bar.indexOf('img.test/3.png') && bar.indexOf('img.test/3.png') < bar.indexOf('img.test/2.png'));
  assert.equal(bar.includes('img.test/0.png'), false);
});

test('the short "added" message is kept wherever there is no dock', () => {
  const run = environment();
  assert.equal(run(`ready(); state.screen='home'; cartDockAnswers()`), false);     // no phone-width check available: keep the message
  run(`window.matchMedia = () => ({matches: true});`);
  assert.equal(run(`state.screen='home'; cartDockAnswers()`), true);
  assert.equal(run(`state.screen='listing'; cartDockAnswers()`), true);
  assert.equal(run(`state.screen='offers'; cartDockAnswers()`), false);
  assert.equal(run(`state.screen='cart'; cartDockAnswers()`), false);
  run(`window.matchMedia = () => ({matches: false});`);
  assert.equal(run(`state.screen='home'; cartDockAnswers()`), false);              // desktop website mode has no dock
});

test('the dock animates in the theme layer only; the amount shown always ends as the app wrote it', () => {
  const theme = read('js/theme.js'), css = read('css/theme.css');
  assert.ok(theme.includes('p >= 1 ? finalText'));
  assert.ok(theme.includes('prefers-reduced-motion: reduce'));
  assert.ok(css.includes(':has(> .cx-cart-bar:not([hidden])) > .topbar .cart-icon-btn'));
  assert.ok(css.includes('.cx-cart-bar, .cx-dock-thumb { animation: none !important; }'));
});

test('an item with no regular price can be seen but not ordered, and never stays in a cart', () => {
  const run = environment();
  run(`row.base_price = 0; ready();`);
  assert.equal(run('canOrderItem(ITEMS[0])'), false);
  assert.equal(run('addToCart(ITEMS[0])'), false);
  assert.equal(run('state.cart.length'), 0);
  assert.ok(run('itemPriceMarkup(ITEMS[0])').includes('Price coming soon'));
  assert.equal(run('itemPriceMarkup(ITEMS[0])').includes(run('money(0)')), false);
  run(`state.screen='listing'; openItem(id);`);
  const html = run('detail()');
  assert.ok(html.includes('Price coming soon') && html.includes('disabled'));
  assert.equal(html.includes('id="cxAddQty"'), false);
  // priced when added, price removed afterwards: the line leaves the cart on the next menu update
  run(`row.base_price = 18; ready(); addToCart(ITEMS[0]); row.base_price = 0; ready(); reconcileMenuCart();`);
  assert.equal(run('state.cart.length'), 0);
});

test('a full-discount offer on a priced item is still orderable', () => {
  const run = environment();
  run(`row.offer={has_offer:true,offer_active:true,offer_type:'percentage',offer_discount:100,
      offer_valid_from:'2026-09-08',offer_valid_to:'2026-09-08'}; ready();`);
  assert.equal(run('ITEMS[0].price'), 0);
  assert.equal(run('canOrderItem(ITEMS[0])'), true);
});

test('a sub-category with no items is not offered', () => {
  const run = environment();
  run(`payload.subcategories=[{id:'55555555-5555-5555-5555-555555555555',category_id:cat,name_en:'Full'},
      {id:'66666666-6666-6666-6666-666666666666',category_id:cat,name_en:'Empty'}];
    row.subcategory_id='55555555-5555-5555-5555-555555555555';
    ready(); SUBCATEGORIES=mapMenu(payload,now).subcategories; state.categoryId=cat;`);
  let html = run('listing()');
  assert.ok(html.includes('>Full<'));
  assert.equal(html.includes('>Empty<'), false);
  run(`state.subcategoryId='66666666-6666-6666-6666-666666666666';`);
  html = run('listing()');
  assert.equal(run('state.subcategoryId'), '');
  assert.ok(html.includes('Test dish'));
});

test('bars are pinned to the bottom on short screens and the item photo is edge to edge', () => {
  const css = read('css/theme.css');
  const part = css.slice(css.indexOf('15b. Bars stay at the bottom'), css.indexOf('16. A message never covers'));
  assert.ok(part.includes('flex-direction: column') && part.includes('flex-shrink: 0'));
  assert.ok(part.includes('.cx-cart-bar:not([hidden]) { margin-top: auto;'));
  assert.ok(part.includes('.sticky-actions.cx-add-bar { margin-top: auto; }'));
  assert.ok(part.includes('margin-top: calc(-1 * var(--cx-pad-t, 20px));'));
});

test('type: no text style in the theme layer is below 11px, the floor is 12px and Arabic keeps its letters joined', () => {
  const css = read('css/theme.css');
  const part = css.slice(css.indexOf('17. Type:'), css.indexOf('12. Light theme'));
  assert.ok(part.includes('--cx-type-label: 12px') && part.includes('--cx-type-body: 14px'));
  for (const m of css.matchAll(/font-size:\s*([\d.]+)px/g)) assert.ok(Number(m[1]) >= 11, m[0]);
  assert.ok(part.includes('body.is-ar') && part.includes('letter-spacing: 0;'));
  assert.ok(part.includes('#app .item p { font-size: var(--cx-type-body)'));
  assert.ok(read('index.html').includes('user-scalable=no'));     // the reason the floor exists
});
