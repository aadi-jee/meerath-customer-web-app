// Run: node --test tests/cx4-scroll.test.cjs. No database writes/network.
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
// `saved` is what this device has stored as its preview structure ('' = nothing).
function environment(saved = '', brandEdit = source => source) {
  const store = {};
  const c = vm.createContext({console, URL, Intl, Date: TestDate, setTimeout: () => 0,
    localStorage: {getItem: key => (key in store ? store[key] : null), setItem: (key, value) => { store[key] = String(value); }},
    window: {},
    document: {documentElement: {dataset: {}}, getElementById: () => ({parentElement: {scrollTop: 0}}), querySelectorAll: () => [], querySelector: () => null}});
  vm.runInContext(brandEdit(read('js/brand-config.js')), c);
  if (saved) vm.runInContext(`localStorage.setItem(appStorageKey("structure"), ${JSON.stringify(saved)})`, c);
  for (const file of ['js/data.js', 'js/ordering-hours.js', 'js/auth.js', 'js/content.js', 'js/delivery-location.js']) vm.runInContext(read(file), c);
  const app = read('js/app.js');
  vm.runInContext(app.slice(0, app.lastIndexOf('\napplyDir();')), c);
  vm.runInContext(`toast = () => {}; render = () => {}; renderKeepScroll = () => {};
    const I18N = {en:{sar:'SAR', todaysSpecial:'Today special', bestSeller:'Best seller'},ar:{sar:'ر.س'}};
    const R = MENU_CONFIG.restaurantId, B = '44444444-4444-4444-4444-444444444444';
    const C1 = '33333333-3333-3333-3333-333333333331', C2 = '33333333-3333-3333-3333-333333333332', C3 = '33333333-3333-3333-3333-333333333333';
    const S1 = '55555555-5555-5555-5555-555555555551';
    const I = n => '22222222-2222-2222-2222-22222222222' + n;
    const rows = [
      {id:I(1), category_id:C1, base_price:18, is_available:true, name_en:'Seekh', is_featured:true},
      {id:I(2), category_id:C1, subcategory_id:S1, base_price:20, is_available:true, name_en:'Tikka', is_best_seller:true},
      {id:I(3), category_id:C2, base_price:9, is_available:true, name_en:'Naan'}];
    const payload = {version:1,offers_version:1,restaurant_id:R,
      categories:[{id:C1,name_en:'Grill',sort_order:1,image_url:'https://img.test/grill.jpg'},{id:C2,name_en:'Bread',sort_order:2},{id:C3,name_en:'Empty',sort_order:3}],
      subcategories:[{id:S1,category_id:C1,name_en:'Chicken'}],items:rows,schedules:[],
      branches:[{id:B}],branch_items:rows.map(r => ({branch_id:B,menu_item_id:r.id,is_available:true}))};
    menuConnection.status='ready'; menuConnection.lastSuccess=Date.now(); menuConnection.payload=payload;
    { const m=mapMenu(payload,new Date('2026-09-08T12:00:00Z')); CATEGORIES=m.categories; ITEMS=m.items; OFFERS=m.offers; if (m.subcategories) SUBCATEGORIES=m.subcategories; }
    state.branchId = B; state.lang = 'en';`, c);
  return code => vm.runInContext(code, c);
}

test('classic stays the default; the scroll structure is only a preview on this device', () => {
  const run = environment();
  assert.deepEqual([...run('THEME_STRUCTURES')], ['classic', 'scroll']);
  assert.equal(run('brandTheme().structure'), 'classic');
  assert.equal(run('structureIs("scroll")'), false);
  assert.equal(run('home()').includes('cx-catbar'), false);            // classic Home is unchanged
  assert.ok(run('nav("home")').includes("go('menu')"));
  assert.equal(environment('scroll')('brandTheme().structure'), 'scroll');
  assert.equal(environment('nonsense')('brandTheme().structure'), 'classic');
  // with the preview switch off, a stored choice is ignored
  const off = environment('scroll', source => source.replace('themePreview: true', 'themePreview: false'));
  assert.equal(off('brandTheme().structure'), 'classic');
  assert.equal(off('appearanceSettingsPage()').includes('setPreviewStructure'), false);
  assert.ok(run('appearanceSettingsPage()').includes("setPreviewStructure('scroll')"));
});

test('scroll Home lists the whole menu in Admin order with one row of buttons', () => {
  const run = environment('scroll');
  assert.deepEqual([...run('menuSections().map(s => s.key)')], ['special', 'best', 'cat-' + run('C1'), 'cat-' + run('C2')]);   // empty category left out
  const groups = run('JSON.stringify(menuSections()[2].groups.map(g => [g.title, g.items.length]))');
  assert.equal(groups, '[["",1],["Chicken",1]]');
  const html = run('homeScroll()');
  assert.equal(html.split('data-chip=').length - 1, 4);
  assert.equal(html.split('data-sec=').length - 1, 4);
  for (const name of ['Seekh', 'Tikka', 'Naan', 'Grill', 'Bread', 'Chicken']) assert.ok(html.includes(name), name);
  assert.equal(html.includes('>Empty<'), false);
  // a category with its own photo gets a banner; one without keeps the plain heading
  assert.equal(html.split('class="cx-banner"').length - 1, 1);
  assert.match(html, /cx-banner-copy"><h3>Grill<\/h3><small>2 items/);
  assert.match(html, /<h3>Bread<\/h3><small class="cx-sec-count">1 item</);
  assert.match(html, /class="cx-sub"><span>Chicken<\/span><small>1</);
  assert.ok(html.includes('cx-cart-bar'));
  assert.equal(html.includes('cx-search-cart'), false);
  assert.match(html, /class="cx-catbar-cart " onclick="go\('cart'\)"[\s\S]*?<span>Cart<\/span>/);          // laptop: cart in the frozen row
  run(`state.cart = [{id: I(1), qty: 2, price: 18, extras: []}]`);
  assert.match(run('catbarCartMarkup()'), /cx-catbar-cart has-items[\s\S]*2 items · SAR 36\.00/);
  run(`state.cart = []`);
  assert.equal(html.includes('cx-again'), false);                      // no earlier order on this device
  assert.equal(html.includes("go('menu')"), false);
});

test('Menu and category links land on Home; Rewards takes the Menu tab', () => {
  const run = environment('scroll');
  run(`go('listing', {categoryId: C2})`);
  assert.equal(run('state.screen'), 'home');
  assert.equal(run('homeJumpTarget'), 'cat-' + run('C2'));
  run(`go('menu')`);
  assert.equal(run('state.screen') + '|' + run('homeJumpTarget'), 'home|menu');
  run(`go('listing', {categoryId: 'gone'})`);
  assert.equal(run('homeJumpTarget'), 'menu');
  // the second tab does not flip while the points rules are still loading
  run('var rewardsState = {rules: null}; var loadRewardsRules = () => {}; rewardsOn = () => !!(rewardsState.rules && rewardsState.rules.enabled)');
  const bar = run('nav("home")');
  assert.ok(bar.includes("go('rewards')"));                             // not known yet: Rewards
  assert.equal(bar.includes("go('menu')"), false);
  run('rewardsState.rules = {enabled: false}');
  assert.ok(run('nav("home")').includes("go('offers')"));               // the restaurant has points off
  run('rewardsState.rules = null');
  assert.ok(run('nav("home")').includes("go('offers')"));               // remembered on this device
  run('rewardsState.rules = {enabled: true}');
  assert.ok(run('nav("home")').includes("go('rewards')"));
  run(`state.screen = 'rewards'`);
  assert.match(run('nav("account")'), /class="active" onclick="go\('rewards'\)"/);
  run(`state.screen = 'home'`);
  assert.equal(run('navTabFor("detail")'), 'home');
  assert.equal(run('navTabFor("rewards")'), 'rewards');
  run(`go('cart')`);
  assert.equal(run('state.screen'), 'cart');                           // other screens are not redirected
});

test('Home carries no "Order again" or points card: those live under Orders and Rewards', () => {
  const run = environment('scroll');
  run(`state.orderHistory = [{id:'o1', orderType:'takeaway', items:[{id:I(1), qty:2}]}];`);
  const html = run('homeScroll()');
  for (const gone of ['cx-again', 'cx-points', 'reorderFromHistory']) assert.equal(html.includes(gone), false, gone);
});

test('the delivery line (every theme): shown without an address, a warning outside the area, gone when fine', () => {
  for (const saved of ['', 'scroll']) {
    const run = environment(saved), page = saved ? 'homeScroll()' : 'home()';
    run(`I18N.en.deliveryScope = 'Select your location at checkout'; homeDeliverySync = () => {};`);
    run(`state.orderType = 'dinein'`);
    assert.equal(run('homeDeliveryNoteText()'), '');
    run(`state.orderType = 'delivery'; homeDeliveryAddress = () => null;`);
    assert.equal(run('homeDeliveryNoteText()'), 'Select your location at checkout');
    assert.match(run(page), /id="homeOrderNote" class="mode-note"  style="">Select your location/);
    run(`homeDeliveryAddress = () => ({id:'a', updatedAt:'1'}); homeDelivery.key = 'a|1'; homeDelivery.status = 'ok';`);
    assert.equal(run('homeDeliveryNoteText()'), '');                                  // inside the area: no line
    assert.match(run(page), /id="homeOrderNote" class="mode-note"  style="display:none"><\/div>/);   // and no space
    run(`homeDelivery.status = 'checking'`);
    assert.equal(run('homeDeliveryNoteText()'), '');
    run(`homeDelivery.status = 'out'`);
    assert.match(run('homeDeliveryNoteText()'), /We do not deliver to this address yet/);
    assert.match(run(page), /class="mode-note mode-note-warn" role="status" style="">We do not deliver/);
    run(`homeDelivery.key = 'other|1'`);                                               // an answer about another address does not count
    assert.equal(run('homeDeliveryNoteText()'), '');
  }
});

test('address screen: no separate confirm step; Save is one pinned button that waits for a pin', () => {
  const run = environment();
  run(`state.isLoggedIn = true; state.addressDirections = ''; state.addressType = 'home'; state.editingAddressId = null;
       I18N.en.saveAddress = 'Save address'; I18N.en.updateAddress = 'Update address';`);
  run('resetDeliveryLocation()');
  let page = run('addAddressPage()');
  assert.equal(page.includes('confirm-delivery-pin'), false);
  assert.equal(page.includes('Confirm this pin'), false);
  assert.match(page, /class="cx-cta-bar cx-address-bar">\s*<button\s+id="cx-save-address"[\s\S]*?disabled\s*>Set your pin on the map</);
  assert.ok(page.indexOf('delivery-pin-map') < page.indexOf('address-type-toggle'));      // map first, then the type
  assert.ok(page.indexOf('address-type-toggle') < page.indexOf('rider-note'));
  run('resetDeliveryLocation({latitude: 24.7, longitude: 46.7, label: "King Fahd Rd"})');   // editing: the saved pin is enough
  page = run('addAddressPage()');
  assert.match(page, /id="cx-save-address"[\s\S]*?\n\s*>Save address</);
  assert.equal(/id="cx-save-address"[^>]*disabled/.test(page), false);
  assert.equal(read('js/app.js').includes('!deliveryLocation.confirmed'), false);
  assert.equal(run('MAX_SAVED_ADDRESSES'), 3);                                          // a fourth needs one edited or removed
  assert.equal(read('js/app.js').includes('length >= 10'), false);
  assert.ok(read('js/i18n.js').includes('You can save up to 3 addresses'));
});

test('checkout: the saved address is already chosen in one line; Change opens a sheet; nothing asks to confirm', () => {
  const run = environment();
  run(`var accountAddresses = {loaded: true, busy: false, mutating: false, error: false}; var loadAccountAddresses = async () => true;
    state.isLoggedIn = true; state.authUserId = 'u1'; state.orderType = 'delivery'; state.customerName = 'A'; state.customerPhone = '+9665';
    state.cart = [{id: I(1), qty: 2, price: 18, extras: []}];
    orderTypeOpen = () => true; restaurantAcceptingOrders = () => true; deliveryOffered = () => true; orderingNoticeMarkup = () => '';
    const AD1 = {id: 'a1', type: 'home', area: 'Al Olaya, Riyadh 12345', label: '8347 King Fahd Rd, Al Olaya, Riyadh 12345', latitude: 24.7, longitude: 46.7, updatedAt: 'v1', directions: ''};
    const AD2 = {id: 'b1', type: 'work', area: 'Al Muruj, Riyadh 12263', label: 'Tower 2, Al Muruj, Riyadh 12263', latitude: 24.8, longitude: 46.6, updatedAt: 'v1', directions: ''};
    state.savedAddresses = [AD1, AD2]; state.defaultAddressId = 'a1'; state.checkoutAddressId = null; state.lastDeliveryAddressId = null;
    state.checkoutPinConfirmedId = null;`);
  let page = run('checkout()');
  assert.equal(run('state.checkoutPinConfirmedId') + '|' + run('state.checkoutPinConfirmedVersion'), 'a1|v1');   // chosen for the customer
  assert.match(page, /class="cx-addr">[\s\S]*Deliver to<\/small><strong>Home · Al Olaya<\/strong>/);
  assert.ok(page.includes('onclick="openCheckoutAddressSheet()"'));
  for (const gone of ['Location confirmed', 'Deliver here', 'Choose / edit address', 'Confirm the map location', 'cx-sheet-panel'])
    assert.equal(page.includes(gone), false, gone);
  assert.match(page, /cx-co-line"><span><b>2×<\/b> Seekh<\/span>/);                    // what is being ordered
  assert.equal(page.split('onclick="placeOrder()"').length - 1, 1);
  // the sheet lists both addresses and choosing one keeps the customer on checkout
  run('state.checkoutAddressSheet = true');
  page = run('checkout()');
  assert.equal(page.split('class="cx-sheet-row').length - 1, 2);
  run(`state.screen = 'checkout'; pickCheckoutAddress('b1')`);
  assert.equal([run('state.checkoutAddressId'), run('state.checkoutPinConfirmedId'), run('state.checkoutAddressSheet')].join('|'), 'b1|b1|false');
  assert.match(run('checkout()'), /<strong>Work · Al Muruj<\/strong>/);
  // no saved address: one button; a closed restaurant: one notice, no times, the button says when it opens
  run(`state.savedAddresses = []; state.checkoutAddressId = null; state.defaultAddressId = null; state.checkoutPinConfirmedId = null;`);
  page = run('checkout()');
  assert.ok(page.includes('onclick="checkoutAddAddress()"') && page.includes('Add delivery address'));
  run(`orderTypeOpen = () => false; restaurantAcceptingOrders = () => false; orderingOpensText = () => 'today at 12:00 PM';
       orderingState = () => ({reason: 'closed', opens_at: 'x'});`);
  page = run('checkout()');
  for (const gone of ['type-closed', 'checkout-time-options']) assert.equal(page.includes(gone), false, gone);
  assert.match(page, /checkout-place-order"[\s\S]*?disabled[\s\S]*?Opens today at 12:00 PM/);
});

test('files changed in CX-4 have new cache keys and the classic rules are untouched', () => {
  const html = read('index.html'), css = read('css/theme.css'), spy = read('js/theme.js');
  assert.ok(html.includes('js/brand-config.js?v=20261006-cx4"'));
  for (const file of ['css/theme.css']) assert.ok(html.includes(`${file}?v=20261006-cx4i"`), file);
  assert.ok(html.includes('js/app.js?v=20261006-b1"'));   // Batch B1 (table mode) changed app.js
  assert.ok(css.includes('.cx-catbar-cart { display: none; }'));                       // phones keep the cart dock
  assert.match(css, /@media \(min-width: 1025px\) \{\n  html\[data-structure="scroll"\] #app > \.home-screen > \.cx-catbar \{\n    position: sticky;/);   // laptop too
  for (const file of ['js/delivery-location.js', 'js/i18n.js']) assert.ok(html.includes(`${file}?v=20261006-cx4f"`), file);
  assert.ok(html.includes('js/theme.js?v=20261006-cx4c"'));
  assert.ok(css.includes('#app > .home-screen > .home-topbar {\n    position: sticky;'));   // frozen header
  const added = css.slice(css.indexOf('18. STRUCTURE "scroll"'));
  // every rule that changes an existing element is scoped to the scroll structure
  for (const line of added.split('\n').filter(l => /\.(home-search-wrap|home-announcement|home-screen)/.test(l)))
    assert.ok(line.includes('html[data-structure="scroll"]'), line);
  assert.ok(spy.includes('data-sec') && spy.includes('cxMenuJump'));
});
