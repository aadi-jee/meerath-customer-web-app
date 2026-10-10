// Release A (412 + 415): the wallet (coupons and points), the cart's coupon line, the welcome sheet,
// the ?wallet=1 link, the coupon notification, and the kind words for an order nobody answered.
// Answers are the replica's own shapes (API-A-412-415.md). Run: node --test tests/release-a.test.cjs.
// No database writes / network.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const NOW = '2026-10-10T09:00:00Z';   // 12:00 in Riyadh
class TestDate extends Date {
  constructor(...args) { super(...(args.length ? args : [NOW])); }
  static now() { return Date.parse(NOW); }
}
const settle = () => new Promise(resolve => setImmediate(resolve));

/** A fake page: an element registry, a .phone host that takes inserted sheets, and real localStorage. */
function fakeDocument() {
  const elements = {};
  const inserted = [];
  const host = {
    insertAdjacentHTML: (_, html) => {
      const id = (html.match(/id="([^"]+)"/) || [])[1];
      inserted.push(html);
      if (id) elements[id] = {id, html, removed: false, remove() { this.removed = true; delete elements[id]; }};
    },
  };
  return {
    elements, inserted,
    getElementById: id => elements[id] || (id === 'app' ? {parentElement: {scrollTop: 0}, innerHTML: ''} : null),
    querySelector: sel => (sel === '.phone' ? host : sel === '#walletWelcome .wallet-welcome-use' && elements.walletWelcome ? {focus() { elements.walletWelcome.focused = true; }} : null),
    querySelectorAll: () => [],
    activeElement: null,
  };
}
function environment(options = {}) {
  const store = new Map(Object.entries(options.storage || {}));
  const localStorage = options.brokenStorage
    ? {getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() {}}
    : {getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k)};
  const document = fakeDocument();
  const calls = [];
  const timers = [];
  const c = vm.createContext({console, URL, URLSearchParams, Intl, Date: TestDate, Promise,
    setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout: () => {},
    localStorage, window: {addEventListener: () => {}}, document, navigator: {},
    location: {search: options.search || '', pathname: '/app/'},
    history: {state: null, replaceState: (...a) => calls.push({replace: a})}});
  for (const file of ['js/brand-config.js', 'js/data.js', 'js/ordering-hours.js', 'js/auth.js', 'js/content.js', 'js/rewards.js',
    'js/account-orders.js', 'js/wallet.js']) vm.runInContext(read(file), c);
  const app = read('js/app.js');
  vm.runInContext(app.slice(0, app.lastIndexOf('\napplyDir();')), c);
  vm.runInContext(read('js/push.js'), c);
  vm.runInContext(`toast = (m) => { toasts.push(m); }; render = () => {}; renderKeepScroll = () => {}; updateCartButtons = () => {};
    var toasts = [], went = [], applied = [];
    go = (screen) => { went.push(screen); state.screen = screen; };
    applyCoupon = () => { applied.push(state.coupon); };
    const I18N = {en:{sar:'SAR',rewards:'Rewards',signInCreate:'Sign in'},ar:{sar:'ر.س',rewards:'المكافآت',signInCreate:'تسجيل الدخول'}};
    back = () => ''; langSwitch = () => ''; nav = () => ''; brandedRewardsLabel = () => 'Meerath Rewards';
  `, c);
  c.__calls = calls;
  c.__rpc = options.rpc || (async () => WALLET());
  vm.runInContext(`customerOrderRpc = async (name, params) => { __calls.push({name, params}); return __rpc(name, params); };`, c);
  const run = code => vm.runInContext(code, c);
  const flush = async () => { for (let i = 0; i < 6; i++) { while (timers.length) await timers.shift()(); await settle(); } };
  return {run, document, store, calls, flush, ctx: c};
}
const FEATURES = on => `orderingHours.status = {version:1, features:{app:true, ordering:true, vouchers:true, rewards:true, push:true, wallet:${on}}};`;
const SIGNED_IN = `state.isLoggedIn = true; state.authUserId = 'user-1';`;
// The replica's answer (API-A 2.2), plus one used and one coupon closer to its end.
const WALLET = () => ({enabled: true, member: true, currency: 'SAR',
  coupons: [
    {code: 'WSC4SU33', source: 'welcome', kind: 'percent', value: 15.00, max_discount: 15.00, min_food: 40.00,
     starts_at: '2026-10-10T06:32:13.25499+03:00', ends_at: '2026-10-10T21:30:00+03:00', state: 'ready', used_at: null,
     title_en: 'Welcome gift: 15% off (up to SAR 15)', title_ar: 'هدية ترحيب: خصم 15% (حتى 15 ر.س)'},
    {code: 'SAB7KQ2M', source: 'second_order', kind: 'amount', value: 10.00, max_discount: null, min_food: 50.00,
     starts_at: '2026-10-08T06:32:13+03:00', ends_at: '2026-10-12T13:00:00+03:00', state: 'ready', used_at: null,
     title_en: 'Thank you: SAR 10 off', title_ar: 'شكراً لك: خصم 10 ر.س'},
    {code: 'THANKS5', source: 'restaurant', kind: 'amount', value: 5.00, max_discount: null, min_food: 0.00,
     starts_at: '2026-09-20T06:32:13.268697+03:00', ends_at: '2026-10-08T06:32:13.268697+03:00', state: 'expired', used_at: null,
     title_en: 'Your coupon: SAR 5 off', title_ar: 'قسيمتك: خصم 5 ر.س'},
    {code: 'OLDONE', source: 'restaurant', kind: 'amount', value: 8.00, max_discount: null, min_food: 0.00,
     starts_at: '2026-09-20T06:32:13+03:00', ends_at: '2026-10-30T06:32:13+03:00', state: 'used', used_at: '2026-10-05T19:00:00+03:00',
     title_en: 'Your coupon: SAR 8 off', title_ar: 'قسيمتك: خصم 8 ر.س'}],
  points: {enabled: true, balance: 230, usable_points: 200, usable_value: 10.00, next_step_points: 300, points_to_next: 70,
    next_step_value: 15.00, min_redeem_points: 100, redeem_step_points: 100, redeem_step_value: 5.00,
    valid_until: '2027-01-08T06:32:13.267957+03:00'}});
const RULES = `({enabled:true,currency:'SAR',earn_points_per_unit:1,redeem_step_points:100,redeem_step_value:5,
  min_redeem_points:100,max_redeem_share:0.5,expiry_days:60,allow_with_coupon:false,excluded_order_kinds:[]})`;

/* ---- the switch ---- */
test('features.wallet is the switch: absent (before 415) or false hides the wallet and never asks for it', async () => {
  const e = environment();
  e.run(SIGNED_IN);
  assert.equal(e.run('walletOn()'), false);                       // no status yet
  e.run(`orderingHours.status = {version:1, features:{app:true, vouchers:true}}`);
  assert.equal(e.run('walletOn()'), false);                       // a server without 415
  assert.equal(e.run('walletServerHas()'), false);
  assert.equal(e.run('walletProgressMarkup()'), '');
  await e.flush();
  assert.equal(e.calls.length, 0);
  e.run(FEATURES(false));
  assert.equal(e.run('walletOn()'), false);
  assert.equal(e.run('walletServerHas()'), true);                 // 415 present: the points bar may still be asked for
  e.run(FEATURES(true));
  assert.equal(e.run('walletOn()'), true);
  e.run(`orderingHours.status.features.vouchers = false`);
  assert.equal(e.run('walletOn()'), false);                       // codes switched off: nothing to use a coupon with
});

/* ---- the hub ---- */
test('wallet: ready coupons with big value, minimum, cap, ends text and Use now; used and expired greyed under Past', async () => {
  const e = environment();
  e.run(SIGNED_IN + FEATURES(true));
  e.run('walletScreenMarkup()');                                  // first draw asks once
  await e.flush();
  assert.equal(e.calls.filter(x => x.name === 'oracy_customer_wallet_v1').length, 1);
  assert.equal(JSON.stringify(e.calls[0].params), JSON.stringify({p_restaurant_id: e.run('MENU_CONFIG.restaurantId')}));
  const html = e.run('walletScreenMarkup()');
  await e.flush();
  assert.equal(e.calls.length, 1, 'a second draw within 20 s does not ask again');
  const ready = html.slice(html.indexOf('walletReadyTitle'), html.indexOf('walletPastTitle'));
  const past = html.slice(html.indexOf('walletPastTitle'));
  assert.ok(ready.includes('<strong>15% off</strong>') && ready.includes('Up to SAR 15'));
  assert.ok(ready.includes('On orders from SAR 40'));
  assert.ok(ready.includes('Ends today 9:30 PM'));                // 21:30 Riyadh, today
  assert.ok(ready.includes('<strong>SAR 10 off</strong>') && ready.includes('Ends in 2 days'));
  assert.ok(ready.includes('Welcome gift') && ready.includes('Thank you'));
  assert.equal((ready.match(/onclick="walletUseNow\(\d\)"/g) || []).length, 2);
  assert.ok(ready.includes('wallet-coupon is-urgent'));            // ends within 24 h
  assert.ok(ready.includes('<span class="wallet-count">2</span>'));
  assert.equal((past.match(/wallet-coupon is-past/g) || []).length, 2);
  assert.ok(!past.includes('walletUseNow'));
  assert.ok(past.includes('Expired') && past.includes('Ended on') && past.includes('Used on'));
});

test('wallet: Arabic words, RTL-safe code, and the tomorrow / later / ended texts', () => {
  const e = environment();
  e.run(SIGNED_IN + FEATURES(true) + `walletState.data = walletClean(${JSON.stringify(WALLET())}); walletState.for = 'user-1'; walletState.triedFor='user-1'; walletState.triedAt=Date.now(); state.lang = 'ar';`);
  const html = e.run('walletScreenMarkup()');
  assert.ok(html.includes('خصم 15%') && html.includes('حتى ر.س 15') && html.includes('للطلبات من ر.س 40'));
  assert.ok(html.includes('تنتهي اليوم') && html.includes('تنتهي خلال يومين'));
  assert.ok(html.includes('هدية ترحيب: خصم 15% (حتى 15 ر.س)'));   // the server's own Arabic title
  assert.ok(html.includes('استخدمها الآن') && html.includes('السابقة') && html.includes('منتهية') && html.includes('مستخدمة'));
  assert.ok(html.includes('<code dir="ltr"'));
  const ends = at => e.run(`walletEndsText({state:'ready', ends_at:'${at}'})`);
  e.run(`state.lang = 'en'`);
  assert.equal(ends('2026-10-11T13:00:00+03:00'), 'Ends tomorrow 1:00 PM');
  assert.equal(ends('2026-10-15T13:00:00+03:00'), 'Ends in 5 days');
  assert.match(ends('2026-11-30T13:00:00+03:00'), /^Ends 30 Nov 2026$/);
  assert.equal(e.run(`walletEndsText({state:'expired', ends_at:null})`), 'No longer available');
  e.run(`state.lang = 'ar'`);
  assert.match(ends('2026-10-11T13:00:00+03:00'), /^تنتهي غداً /);
  assert.equal(ends('2026-10-15T13:00:00+03:00'), 'تنتهي خلال 5 أيام');
  assert.equal(ends('2026-10-22T13:00:00+03:00'), 'تنتهي خلال 12 يوماً');
});

test('wallet: empty states (no coupons; only past ones; not signed in; a failed read with Try again)', async () => {
  const empty = environment({rpc: async () => ({enabled: true, member: true, coupons: [], points: null})});
  empty.run(SIGNED_IN + FEATURES(true));
  empty.run('walletScreenMarkup()');
  assert.ok(empty.run('walletScreenMarkup()').includes('aria-busy="true"'));   // loading: skeleton cards
  await empty.flush();
  let html = empty.run('walletScreenMarkup()');
  assert.ok(html.includes('No coupons right now') && html.includes('When the restaurant gives you a coupon'));
  assert.ok(!html.includes('walletPastTitle'));
  const pastOnly = environment({rpc: async () => ({...WALLET(), coupons: WALLET().coupons.slice(2)})});
  pastOnly.run(SIGNED_IN + FEATURES(true));
  pastOnly.run('walletScreenMarkup()');
  await pastOnly.flush();
  html = pastOnly.run('walletScreenMarkup()');
  assert.ok(html.includes('No coupons right now') && html.includes('Your new coupons will appear here.') && html.includes('walletPastTitle'));
  const visitor = environment();
  visitor.run(FEATURES(true));
  html = visitor.run('walletScreenMarkup()');
  assert.ok(html.includes('Your coupons and points live here') && html.includes("go('signInPage')"));
  await visitor.flush();
  assert.equal(visitor.calls.length, 0, 'a visitor is never asked for (the server would answer 42501)');
  const failing = environment({rpc: async () => { throw new Error('permission denied'); }});
  failing.run(SIGNED_IN + FEATURES(true));
  failing.run('walletScreenMarkup()');
  await failing.flush();
  html = failing.run('walletScreenMarkup()');
  assert.ok(html.includes('Could not load your coupons.') && html.includes('walletRetry()'));
  const nonMember = environment({rpc: async () => ({enabled: true, member: false, coupons: [], points: null})});
  nonMember.run(SIGNED_IN + FEATURES(true));
  nonMember.run('walletScreenMarkup()');
  await nonMember.flush();
  assert.ok(nonMember.run('walletScreenMarkup()').includes('No coupons right now'));
});

test('wallet: hostile or broken coupon rows are dropped or made safe', () => {
  const e = environment();
  const rows = [{code: "X');alert(1)//", state: 'ready', value: 5, kind: 'amount'}, {code: '<img>', state: 'ready', value: 5},
    {code: 'GOOD-1', state: 'weird', value: 5, kind: 'free', source: 'other', title_en: '<b>hi</b>‮'}, {code: 'ZERO', state: 'ready', value: 0}];
  const clean = e.run(`walletClean(${JSON.stringify({enabled: true, coupons: rows, points: null})})`);
  assert.equal(clean.coupons.length, 1);
  assert.equal(clean.coupons[0].code, 'GOOD-1');
  assert.equal(clean.coupons[0].state, 'expired');
  assert.equal(clean.coupons[0].kind, 'amount');
  assert.equal(clean.coupons[0].source, 'restaurant');
  e.run(SIGNED_IN + FEATURES(true) + `walletState.data = walletClean(${JSON.stringify({enabled: true, coupons: rows})}); walletState.for='user-1'; walletState.triedFor='user-1'; walletState.triedAt=Date.now();`);
  const html = e.run('walletScreenMarkup()');
  assert.ok(!html.includes('<b>hi</b>') && html.includes('&lt;b&gt;hi&lt;/b&gt;'));
  assert.equal(e.run('walletClean(null)'), null);
});

/* ---- points progress ---- */
test('points progress: "70 points to SAR 15 off" from points_to_next and next_step_value, bar from the last step', () => {
  const e = environment();
  const p = e.run(`walletProgress(walletClean(${JSON.stringify(WALLET())}).points)`);
  assert.equal(p.text, '70 points to SAR 15 off');
  assert.equal(p.pct, 30);                                        // 200 -> 300, at 230
  const first = e.run(`walletProgress({balance:60, usable_points:0, next_step_points:100, points_to_next:40, next_step_value:5, min_redeem_points:100, redeem_step_points:100})`);
  assert.equal(first.text, '40 points to SAR 5 off');
  assert.equal(first.pct, 60);                                    // no reward yet: from 0
  const odd = e.run(`walletProgress({balance:180, usable_points:100, next_step_points:200, points_to_next:20, next_step_value:7.5, min_redeem_points:150, redeem_step_points:100})`);
  assert.equal(odd.text, '20 points to SAR 7.50 off');
  assert.equal(odd.pct, 90);                                      // 100 is below the minimum, so the bar starts at 0
  const done = e.run(`walletProgress({balance:300, usable_points:300, next_step_points:300, points_to_next:0, next_step_value:15, min_redeem_points:100, redeem_step_points:100})`);
  assert.equal(done.pct, 100);
  assert.equal(e.run('walletProgress(null)'), null);
  assert.equal(e.run('walletProgress({balance:5, next_step_points:0, next_step_value:0})'), null);
  e.run(`state.lang = 'ar'`);
  assert.equal(e.run(`walletProgress(walletClean(${JSON.stringify(WALLET())}).points).text`), '70 نقطة متبقية لخصم ر.س 15');
});

test('points card: the bar sits in the points card; with the wallet off (415 present) it comes from the wallet answer', async () => {
  const e = environment({rpc: async () => ({enabled: false, member: true, coupons: [], points: WALLET().points})});
  e.run(SIGNED_IN + FEATURES(false) + `rewardsState.rules = ${RULES}; rewardsState.summaryFor = 'user-1'; rewardsState.summaryTried = 'user-1';
    rewardsState.summary = {enabled:true, member:true, balance:230, usable_value:10, rules: rewardsState.rules, history:[]};`);
  assert.equal(e.run('walletOn()'), false);
  let html = e.run('rewardsScreenMarkup()');                      // the points screen of before
  assert.ok(html.includes('rewards-screen') && !html.includes('wallet-screen') && !html.includes('wallet-progress'));
  await e.flush();
  html = e.run('rewardsScreenMarkup()');
  assert.ok(html.includes('role="progressbar"') && html.includes('aria-valuenow="30"') && html.includes('style="width:30%"'));
  assert.ok(html.includes('70 points to SAR 15 off'));
  assert.ok(html.indexOf('wallet-progress') > html.indexOf('class="points"') && html.indexOf('wallet-progress') < html.indexOf('How it works'));
  // the wallet on: the hub, coupons first, then the same points card and history
  const hub = environment();
  hub.run(SIGNED_IN + FEATURES(true) + `rewardsState.rules = ${RULES}; rewardsState.summaryFor = 'user-1'; rewardsState.summaryTried = 'user-1';
    rewardsState.summary = {enabled:true, member:true, balance:230, usable_value:10, rules: rewardsState.rules, history:[]};`);
  hub.run('rewardsScreenMarkup()');
  await hub.flush();
  html = hub.run('rewardsScreenMarkup()');
  assert.ok(html.includes('wallet-screen'));
  assert.ok(html.indexOf('walletReadyTitle') < html.indexOf('class="points"'));
  assert.ok(html.includes('70 points to SAR 15 off') && html.includes('How it works'));
});

/* ---- Use now ---- */
test('Use now: goes to the cart and applies the code through the existing field and Apply', async () => {
  const e = environment();
  e.run(SIGNED_IN + FEATURES(true) + `state.cart = [{id:'x', qty:2, price:30}]; state.screen = 'rewards';`);
  e.run('walletScreenMarkup()');
  await e.flush();
  e.run('walletUseNow(0)');
  assert.deepEqual([...e.run('went')], ['cart']);
  assert.equal(e.run('state.coupon'), 'WSC4SU33');
  assert.deepEqual([...e.run('applied')], ['WSC4SU33']);
  // past coupons and unknown indexes do nothing
  e.run('walletUseNow(2); walletUseNow(99); walletUseNow("0);alert(1)")');
  assert.deepEqual([...e.run('applied')], ['WSC4SU33']);
});

test('Use now with an empty cart: to the menu, and the code is applied once the cart has dishes', async () => {
  const e = environment();
  e.run(SIGNED_IN + FEATURES(true) + `state.cart = []; state.screen = 'rewards';`);
  e.run('walletScreenMarkup()');
  await e.flush();
  e.run('walletUseNow(1)');
  assert.deepEqual([...e.run('went')], ['menu']);
  assert.equal(e.run('toasts.length'), 1);
  assert.deepEqual([...e.run('applied')], []);
  e.run(`state.cart = [{id:'x', qty:1, price:60}]; state.screen = 'cart';`);
  assert.equal(e.run('walletCartMarkup()'), '<div id="walletNudge"></div>');   // no offer while the code waits
  await e.flush();
  assert.deepEqual([...e.run('applied')], ['SAB7KQ2M']);
  e.run('walletCartMarkup()');
  await e.flush();
  assert.deepEqual([...e.run('applied')], ['SAB7KQ2M'], 'applied once only');
});

test('Use now really applies it: the old voucher check runs with the code and the coupon is on', async () => {
  const e = environment({rpc: async (name) => name === 'oracy_voucher_check_v1'
    ? {ok: true, code: 'WSC4SU33', kind: 'percent', value: 15, max_discount: 15, min_food: 40, allow_with_offers: false} : WALLET()});
  e.run(SIGNED_IN + FEATURES(true) + `state.cart = [{id:'x', qty:2, price:30}]; state.screen = 'cart';`);
  const source = read('js/app.js');
  e.run(source.slice(source.indexOf('async function applyCoupon()'), source.indexOf('\n}\n', source.indexOf('async function applyCoupon()')) + 2));
  e.run('refreshCouponBox = () => {}; updateCartBreakdown = () => {}; itemById = () => ({});');
  e.run('walletScreenMarkup()');
  await e.flush();
  await e.run('walletUseNow(0)');
  const check = e.calls.find(x => x.name === 'oracy_voucher_check_v1');
  assert.equal(check.params.p_code, 'WSC4SU33');
  assert.equal(e.run('state.couponOn'), true);
  assert.equal(e.run('state.voucher.code'), 'WSC4SU33');
});

/* ---- the cart's coupon line ---- */
test('cart nudge: a fitting coupon is offered; below its minimum "Add SAR x more"; never while a code is in use', async () => {
  const e = environment();
  e.run(SIGNED_IN + FEATURES(true) + `state.cart = [{id:'x', qty:1, price:45}]; state.screen = 'cart'; itemById = () => ({});`);
  assert.equal(e.run('walletCartMarkup()'), '<div id="walletNudge"></div>');   // first: asks
  await e.flush();
  let html = e.run('walletCartMarkup()');
  assert.ok(html.includes('You have a coupon: 15% off.') && html.includes('walletUseNow(0)') && html.includes('>Use it<'));
  e.run(`state.cart = [{id:'x', qty:1, price:30}]`);                            // 30 < 40 and < 50
  html = e.run('walletCartMarkup()');
  assert.ok(html.includes('Add SAR 10.00 more to use your coupon') && html.includes('is-short') && !html.includes('walletUseNow'));
  e.run(`state.lang = 'ar'`);
  assert.ok(e.run('walletCartMarkup()').includes('أضف ر.س 10.00 لاستخدام قسيمتك'));
  e.run(`state.lang = 'en'; state.cart = [{id:'x', qty:1, price:55}]`);
  assert.ok(e.run('walletCartMarkup()').includes('You have a coupon: 15% off.'));   // soonest ending first
  e.run(`state.lang = 'ar'`);
  assert.ok(e.run('walletCartMarkup()').includes('لديك قسيمة: خصم 15%.') && e.run('walletCartMarkup()').includes('استخدمها'));
  e.run(`state.lang = 'en'`);
  for (const busy of [`state.couponOn = true`, `state.couponOn = false; state.coupon = 'TYPED'`]) {
    e.run(busy);
    assert.equal(e.run('walletCartMarkup()'), '<div id="walletNudge"></div>', busy);
  }
  e.run(`state.coupon = ''; itemById = () => ({offer: {}})`);                   // automatic coupons are not with item offers
  assert.equal(e.run('walletCartMarkup()'), '<div id="walletNudge"></div>');
  e.run(`itemById = () => ({}); state.isLoggedIn = false`);
  assert.equal(e.run('walletCartMarkup()'), '<div id="walletNudge"></div>');
  e.run(`state.isLoggedIn = true; orderingHours.status.features.wallet = false`);
  assert.equal(e.run('walletCartMarkup()'), '<div id="walletNudge"></div>');
  // the line follows the cart without a redraw of the screen
  e.run(`orderingHours.status.features.wallet = true; state.cart = [{id:'x', qty:1, price:45}]`);
  e.document.elements.walletNudge = {innerHTML: ''};
  e.run('walletNudgeRefresh()');
  assert.ok(e.document.elements.walletNudge.innerHTML.includes('You have a coupon'));
  assert.ok(read('js/app.js').includes('if (typeof walletNudgeRefresh === "function") walletNudgeRefresh();'));
});

/* ---- the welcome sheet ---- */
test('welcome sheet: shown once per account on this device, with Use now; not again after a reload', async () => {
  const e = environment();
  e.run(SIGNED_IN + FEATURES(true) + `state.screen = 'account';`);
  assert.equal(await e.run('walletWelcomeCheck()'), true);
  assert.equal(e.document.inserted.length, 1);
  const sheet = e.document.inserted[0];
  assert.ok(sheet.includes('role="dialog"') && sheet.includes('aria-modal="true"') && sheet.includes('A welcome gift for you'));
  assert.ok(sheet.includes('15% off') && sheet.includes('On orders from SAR 40 · Up to SAR 15') && sheet.includes('WSC4SU33'));
  assert.ok(sheet.includes('walletUseNow(0)') && sheet.includes("event.key==='Escape'"));
  assert.equal(e.document.elements.walletWelcome.focused, true);
  const key = e.run(`appStorageKey('walletWelcome.user-1')`);
  assert.equal(e.store.get(key), '1');
  assert.equal(await e.run('walletWelcomeCheck()'), false);
  assert.equal(e.document.inserted.length, 1);
  e.run('walletWelcomeClose()');
  assert.equal(e.document.elements.walletWelcome, undefined);
  // the same device later (storage kept): never again
  const again = environment({storage: {[key]: '1'}});
  again.run(SIGNED_IN + FEATURES(true));
  assert.equal(await again.run('walletWelcomeCheck()'), false);
  assert.equal(again.calls.length, 0);
  // blocked storage: still once in this visit
  const blocked = environment({brokenStorage: true});
  blocked.run(SIGNED_IN + FEATURES(true) + `state.screen = 'account';`);
  assert.equal(await blocked.run('walletWelcomeCheck()'), true);
  assert.equal(await blocked.run('walletWelcomeCheck()'), false);
  assert.equal(blocked.document.inserted.length, 1);
});

test('welcome sheet: not without a ready welcome coupon, with the wallet off, during checkout, and Arabic words', async () => {
  const none = environment({rpc: async () => ({...WALLET(), coupons: WALLET().coupons.slice(1)})});
  none.run(SIGNED_IN + FEATURES(true));
  assert.equal(await none.run('walletWelcomeCheck()'), false);
  const off = environment();
  off.run(SIGNED_IN + FEATURES(false));
  assert.equal(await off.run('walletWelcomeCheck()'), false);
  assert.equal(off.calls.length, 0);
  const busy = environment();
  busy.run(SIGNED_IN + FEATURES(true) + `state.screen = 'checkout';`);
  assert.equal(await busy.run('walletWelcomeCheck()'), false);
  assert.equal(busy.store.size, 0, 'not remembered: it may still be shown later');
  const ar = environment();
  ar.run(SIGNED_IN + FEATURES(true) + `state.lang = 'ar'; state.screen = 'account';`);
  await ar.run('walletWelcomeCheck()');
  assert.ok(ar.document.inserted[0].includes('هدية ترحيب لك') && ar.document.inserted[0].includes('استخدمها الآن') && ar.document.inserted[0].includes('لاحقاً'));
  // the app asks after sign-up, after sign-in, and at start for a session it already had
  const app = read('js/app.js');
  assert.equal((app.match(/walletWelcomeCheck\(\)/g) || []).length, 3);
  assert.ok(app.includes('Promise.resolve(bootstrapCustomerAuth()).then(ok => { if (ok && typeof walletWelcomeCheck === "function") walletWelcomeCheck(); })'));
});

/* ---- ?wallet=1 and the notification ---- */
test('deep link ?wallet=1: read at start like the other links, taken out of the address, opens Rewards', async () => {
  const e = environment({search: '?wallet=1'});
  e.run(FEATURES(true));
  e.run('pushOpenFromLink()');
  await e.flush();
  assert.deepEqual([...e.run('went')], ['rewards']);
  assert.deepEqual(e.calls.filter(x => x.replace).map(x => x.replace[2]), ['/app/']);
  for (const search of ['?wallet=0', '?wallet=yes', '']) {
    const other = environment({search});
    other.run('pushOpenFromLink()');
    await other.flush();
    assert.deepEqual([...other.run('went')], [], search);
    assert.equal(other.calls.length, 0, search);
  }
  // signed in: the wallet is read again on the way in
  const signed = environment({search: '?wallet=1'});
  signed.run(SIGNED_IN + FEATURES(true));
  signed.run('pushOpenFromLink()');
  await signed.flush();
  assert.equal(signed.calls.filter(x => x.name === 'oracy_customer_wallet_v1').length, 1);
  assert.ok(read('js/push.js').includes('else if (event.data?.type === "oracy-open-wallet") pushOpenWallet();'));
});

function worker(pages = []) {
  const handlers = {}, shown = [], windows = [], posted = [];
  const self = {addEventListener: (name, fn) => { handlers[name] = fn; }, skipWaiting: () => {},
    registration: {scope: 'https://shop.example/app/', showNotification: async (title, options) => { shown.push({title, options}); }},
    clients: {claim: async () => {}, matchAll: async () => pages, openWindow: async url => { windows.push(url); }}};
  vm.runInContext(read('sw.js'), vm.createContext({self, URL, console}));
  const push = async payload => { let work; handlers.push({data: {json: () => payload}, waitUntil: p => { work = p; }}); await work; return shown.at(-1); };
  const click = async (n, action = '') => { let work; handlers.notificationclick({action, notification: {data: n.options.data, close() {}}, waitUntil: p => { work = p; }}); await work; };
  return {push, click, windows, posted};
}
const GRANT = '56fc0932-1111-4222-8333-444455556666';

test('service worker: a coupon reminder opens ./?wallet=1 (never the message\'s own address), or tells an open page', async () => {
  const w = worker();
  const n = await w.push({kind: 'coupon', title: 'Meerath Kabab', body: 'Your coupon 15% off ends today at 9:30 PM. Use it before it\'s gone.',
    tag: `coupon-${GRANT}`, url: 'https://evil.example/'});
  assert.equal(n.options.tag, `coupon-${GRANT}`);
  assert.equal(n.options.renotify, false);
  assert.equal(JSON.stringify(n.options.data), JSON.stringify({kind: 'coupon', url: './?wallet=1'}));
  await w.click(n);
  assert.deepEqual(w.windows, ['https://shop.example/app/?wallet=1']);
  // without the kind, the tag alone says it is a coupon; a bad tag is replaced
  const v = worker();
  const m = await v.push({title: 'x', body: 'y', tag: 'coupon-<script>', url: './?orders=1'});
  assert.equal(m.options.tag, 'coupon');
  await v.click(m);
  assert.deepEqual(v.windows, ['https://shop.example/app/?wallet=1']);
  // an open app gets a message instead of a new window
  const posted = [];
  const page = {url: 'https://shop.example/app/', postMessage: msg => posted.push(msg), focus: async () => {}};
  const open = worker([page]);
  await open.click(await open.push({kind: 'coupon', tag: `coupon-${GRANT}`}));
  assert.equal(JSON.stringify(posted), JSON.stringify([{type: 'oracy-open-wallet'}]));
  assert.deepEqual(open.windows, []);
  // an order message is unchanged
  const order = worker();
  const o = await order.push({title: 'Order', body: 'Ready', tag: 'order-1', url: './?wallet=1'});
  assert.equal(JSON.stringify(o.options.data), JSON.stringify({url: './?orders=1'}));
  await order.click(o);
  assert.deepEqual(order.windows, ['https://shop.example/app/?orders=1']);
});

/* ---- 412: the order nobody answered ---- */
test('auto-reject: exactly "Restaurant did not respond" (or auto = timeout) gets the kind words, EN and AR', () => {
  const e = environment();
  const EN = 'The restaurant did not confirm your order in time, so it was cancelled. Anything you used (voucher, points) is back in your account.';
  assert.equal(e.run(`orderRejectionText('Restaurant did not respond')`), EN);
  assert.equal(e.run(`orderRejectionText('', 'timeout')`), EN);
  assert.equal(e.run(`orderRejectionText('We are out of kebab')`), 'We are out of kebab');
  assert.equal(e.run(`orderRejectionText('restaurant did not respond')`), 'restaurant did not respond');   // exactly the server's words only
  e.run(`state.lang = 'ar'`);
  assert.equal(e.run(`orderRejectionText('Restaurant did not respond')`),
    'لم يؤكد المطعم طلبك في الوقت المحدد، لذلك أُلغي الطلب. كل ما استخدمته (القسيمة أو النقاط) عاد إلى حسابك.');
});

test('auto-reject: the tracking page (guest) and the Orders screen (signed in) show it; a staff reason stays as it was', () => {
  const e = environment();
  e.run(`state.order = {id:'MK-0002', status:'rejected', rejectionReason:'Restaurant did not respond', orderType:'takeaway'}; waLink = () => '#';`);
  let html = e.run('confirmation()');
  assert.ok(html.includes('confirmation-message order-auto-reject') && html.includes('did not confirm your order in time'));
  assert.ok(!html.includes('>Restaurant did not respond<'));
  e.run(`state.order.rejectionReason = 'Closed early today'`);
  html = e.run('confirmation()');
  assert.ok(html.includes('Closed early today') && !html.includes('order-auto-reject'));
  e.run(`state.lang = 'ar'; state.order.rejectionReason = 'Restaurant did not respond'`);
  assert.ok(e.run('confirmation()').includes('لم يؤكد المطعم طلبك في الوقت المحدد'));
  // signed in: history card, and for a while a card on the active tab
  e.run(`state.lang = 'en'; state.isLoggedIn = true; state.orderTab = 'history';
    accountOrders.rows = [{id:'o1', order_number:'MK-0002', status:'rejected', rejection_reason:'Restaurant did not respond',
      fulfillment_type:'takeaway', created_at:'2026-10-10T08:20:00Z', total:46, items:[]},
     {id:'o2', order_number:'MK-0001', status:'rejected', rejection_reason:'Out of stock', fulfillment_type:'takeaway', created_at:'2026-10-09T08:20:00Z', total:20, items:[]}];`);
  html = e.run('accountOrdersPage()');
  assert.ok(html.includes('<p class="order-auto-reject" role="note">The restaurant did not confirm your order in time'));
  assert.ok(html.includes('<p>Out of stock</p>') && !html.includes('<p>Restaurant did not respond</p>'));
  e.run(`state.orderTab = 'active'`);
  html = e.run('accountOrdersPage()');
  assert.ok(html.includes('order-auto-reject-card') && html.includes('Order not confirmed') && html.includes('#MK-0002'));
  assert.ok(!html.includes('#MK-0001'));
  e.run(`state.lang = 'ar'`);
  assert.ok(e.run('accountOrdersPage()').includes('لم يُؤكَّد الطلب'));
  e.run(`accountOrders.rows[0].created_at = '2026-10-10T04:00:00Z'`);            // 5 hours ago: only in History
  assert.ok(!e.run('accountOrdersPage()').includes('order-auto-reject-card'));
});

/* ---- the Account screen and the tab ---- */
test('account: "My coupons" row with the ready count; the Rewards tab shows with the wallet on even without points', async () => {
  const e = environment();
  e.run(SIGNED_IN + FEATURES(true));
  e.run('walletAccountCardMarkup()');
  await e.flush();
  const html = e.run('walletAccountCardMarkup()');
  assert.ok(html.includes('My coupons') && html.includes('2 coupons ready to use') && html.includes("go('rewards')"));
  assert.ok(html.includes('Ends today 9:30 PM') && html.includes('rewards-expiring'));
  e.run(`orderingHours.status.features.wallet = false`);
  assert.equal(e.run('walletAccountCardMarkup()'), '');
  const app = read('js/app.js');
  assert.ok(app.includes('rewardsTabOn() || (typeof walletTabOn === "function" && walletTabOn())'));
  assert.ok(app.includes('${typeof walletAccountCardMarkup === "function" ? walletAccountCardMarkup() : ""}'));
  assert.ok(app.includes('${typeof walletGuestCardMarkup === "function" ? walletGuestCardMarkup() : ""}'));
});

/* ---- the files ---- */
test('files: wallet.js and wallet.css load in place, changed files have new cache keys, every new sentence has Arabic', () => {
  const html = read('index.html');
  const scripts = [...html.matchAll(/<script src="(js\/[^"?]+)\?v=([^"]+)"/g)].map(m => m[1]);
  assert.ok(scripts.indexOf('js/wallet.js') === scripts.indexOf('js/rewards.js') + 1);
  assert.ok(scripts.indexOf('js/wallet.js') < scripts.indexOf('js/app.js') && scripts.indexOf('js/wallet.js') < scripts.indexOf('js/push.js'));
  for (const pin of ['js/wallet.js?v=20261010-ra', 'css/wallet.css?v=20261010-ra', 'js/app.js?v=20261010-ra', 'js/account-orders.js?v=20261010-ra',
    'js/rewards.js?v=20261010-ra', 'js/push.js?v=20261010-ra']) assert.ok(html.includes(pin + '"'), pin);
  for (const pin of ['js/cart-quote.js?v=20261009-3b', 'js/data.js?v=20261008-3a', 'js/ordering-hours.js?v=20261007-b1g', 'js/auth.js?v=20261003-gate4',
    'css/theme.css?v=20261006-cx4i', 'js/i18n.js?v=20261006-cx4f']) assert.ok(html.includes(pin + '"'), pin);
  assert.equal(html.match(/<link rel="stylesheet" href="(css\/[^"?]+)/g).at(-1).endsWith('css/theme.css'), true);
  // every walletCopy has two sentences, the second Arabic
  const wallet = read('js/wallet.js');
  for (const m of wallet.matchAll(/walletCopy\(\s*(`[^`]*`|"[^"]*"|c\?\.title_en)\s*,\s*(`[^`]*`|"[^"]*"|c\?\.title_ar)\s*\)/g)) {
    if (m[1].startsWith('c?.')) continue;
    assert.match(m[2], /[؀-ۿ]/, m[0]);
  }
  assert.ok((wallet.match(/walletCopy\(/g) || []).length > 50);
  // every call from older files into wallet.js is guarded, so each still works alone
  for (const file of ['js/app.js', 'js/rewards.js', 'js/push.js', 'js/account-orders.js']) {
    const source = read(file);
    for (const m of source.matchAll(/\b(wallet[A-Z]\w*)\(/g)) {
      const line = source.slice(source.lastIndexOf('\n', m.index) + 1, source.indexOf('\n', m.index));
      if (/^\s*function /.test(line)) continue;
      assert.match(line, /typeof wallet\w+ === ["']function["']/, `${file}: ${line.trim()}`);
    }
  }
  // the service worker caches nothing (no cache version to bump)
  assert.ok(!/caches\.|CACHE_VERSION/.test(read('sw.js')));
});

test('Use now on a 394 database: the code goes with the cart to the price function, and its answer applies it', async () => {
  const e = environment();
  e.run(read('js/promo-reasons.js'));
  e.run(read('js/cart-quote.js'));
  const source = read('js/app.js');
  e.run(source.slice(source.indexOf('async function applyCoupon()'), source.indexOf('\n}\n', source.indexOf('async function applyCoupon()')) + 2));
  e.run(`refreshCouponBox = () => {}; updateCartBreakdown = () => {}; cartQuoteRedraw = () => {}; cartQuoteCodeBoxRefresh = () => {};
    var sent = [];
    cartQuote.support = 'yes';
    cartQuoteFresh = async () => { sent.push(cartQuote.code); const q = {code: {code: cartQuote.code, kind: 'voucher', applied: true, discount: 6.90}}; cartQuoteAfter(q); return q; };`);
  e.run(SIGNED_IN + FEATURES(true) + `state.cart = [{id:'x', qty:2, price:30}]; state.screen = 'rewards';`);
  e.run('walletScreenMarkup()');
  await e.flush();
  await e.run('walletUseNow(0)');
  assert.deepEqual([...e.run('sent')], ['WSC4SU33']);
  assert.equal(e.run('state.couponOn'), true);
  assert.equal(e.run('state.voucher.code'), 'WSC4SU33');
});

test('after an order the wallet is read again (a coupon just used is not offered again); the switch redraws once known', async () => {
  const e = environment();
  e.run(SIGNED_IN + FEATURES(true) + `state.cart = [{id:'x', qty:1, price:45}]; itemById = () => ({});`);
  e.run('walletCartMarkup()');
  await e.flush();
  assert.equal(e.calls.length, 1);
  e.run('walletStale()');
  assert.equal(e.run('walletData()'), null);
  e.run('walletCartMarkup()');
  await e.flush();
  assert.equal(e.calls.length, 2);
  assert.ok(read('js/app.js').includes('if (typeof walletStale === "function") walletStale();'));
  const w = environment();
  w.run(`var drawn = 0; renderKeepScroll = () => { drawn++; }; state.screen = 'rewards';`);
  w.run('walletWatchSwitch()');
  w.run(FEATURES(true));
  await w.flush();
  assert.equal(w.run('drawn'), 1);
});
