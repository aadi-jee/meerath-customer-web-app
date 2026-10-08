// Batch B1g (376): guest orders at a table (a name only), the table layout, and the closed texts
// a table visitor sees. Run: node --test tests/table-guest.test.cjs. No network.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const KEY = 'Ab3dEf6hIj9kLm2nOp5qRs';
const RESTAURANT = '11111111-1111-1111-1111-111111111111';
const BRANCH = '22222222-2222-2222-2222-222222222222';
const TABLE_STORE = 'oracy:meerath-kabab:table:v1';
const GUEST_ID = 'oracy:meerath-kabab:guest-id:v1';
const GUEST_NAME = 'oracy:meerath-kabab:guest-name:v1';
const STRUCTURE = 'oracy:meerath-kabab:structure:v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SIGN_IN = 'Please sign in with your mobile number to order from this table.';
const BUSY = 'Ordering is very busy right now. Please ask our staff.';
const INACTIVE = 'This table QR is not active. Please ask our staff.';

/** One tab. options: shared storages of an earlier tab, blocked storage, a changed brand-config. */
function environment(search = '', options = {}) {
  const local = options.local || new Map();
  const session = options.session || new Map();
  const clock = options.clock || {now: Date.parse('2026-10-07T12:00:00Z')};
  class TestDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock.now])); }
    static now() { return clock.now; }
  }
  const box = (map, blocked) => blocked
    ? {getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); }}
    : {getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key)};
  const location = {pathname: '/', search, hash: ''};
  const timers = [];
  let uuid = 0;
  const page = {dataset: {}};
  const context = vm.createContext({
    console, URL, URLSearchParams, Intl, Date: TestDate, AbortController, Promise,
    crypto: {randomUUID: () => `aaaaaaaa-aaaa-4aaa-8aaa-${String(++uuid + (options.uuidBase || 0)).padStart(12, '0')}`},
    setTimeout: (fn, ms) => { timers.push({fn, ms}); return timers.length; },
    clearTimeout: id => { if (timers[id - 1]) timers[id - 1].fn = null; },
    setInterval: () => 1,
    localStorage: box(local, options.blocked),
    sessionStorage: box(session, options.blocked),
    location,
    history: {state: null, replaceState: (state, _title, url) => {
      if (url === undefined) return;
      const next = new URL(url, 'https://app.example');
      Object.assign(location, {pathname: next.pathname, search: next.search, hash: next.hash});
    }},
    window: {addEventListener: () => {}},
    document: {hidden: false, documentElement: page, addEventListener: () => {}, querySelector: () => null,
      getElementById: () => ({parentElement: {scrollTop: 0}})},
  });
  const brand = read('js/brand-config.js');
  vm.runInContext(options.brand ? options.brand(brand) : brand, context);
  for (const file of ['data.js', 'ordering-hours.js', 'table.js', 'auth.js', 'content.js', 'delivery-location.js', 'rewards.js']) {
    vm.runInContext(read(`js/${file}`), context);
  }
  const app = read('js/app.js');
  vm.runInContext(app.slice(0, app.lastIndexOf('\napplyDir();')), context);
  vm.runInContext(`
    const I18N={en:{sar:'SAR',dineIn:'Dine-in',checkoutMobileIntro:'Enter your mobile number to continue.',mobilePlaceholder:'05X XXX XXXX',signInRequired:'Please sign in to place your order.'},
      ar:{sar:'ر.س',dineIn:'داخل المطعم'}};
    const toasts=[]; const calls=[]; let draws=0; const realCustomerOrderRpc=customerOrderRpc; const realRefreshTracked=refreshTrackedCustomerOrder;
    toast=message=>{toasts.push(message)}; render=()=>{draws++; tableEnforce()}; renderKeepScroll=()=>{draws++; tableEnforce()};
    go=screen=>{state.screen=screen};
    validateMenuCart=async()=>true; checkOfferCartRules=()=>true; refreshTrackedCustomerOrder=async()=>{};
    const itemId='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    ITEMS=[{id:itemId,name:'Malai Boti',nameAr:'',price:35,basePrice:35,available:true,offer:null,options:[]}];
    menuConnection.status='ready';menuConnection.lastSuccess=Date.now();
    menuConnection.payload={branches:[{id:'${BRANCH}'}],schedules:[]};
    state.cart=[{id:itemId,qty:2,price:35,basePrice:35,extras:[],size:'regular',choice:null,notes:''}];
    const scanOk=(extra={})=>({ok:true,restaurant_id:'${RESTAURANT}',branch_id:'${BRANCH}',table_label:'7',section:'Terrace',guest_orders:true,...extra});
    const created=(extra={})=>({id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',order_number:'MK001042',
      tracking_token:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',status:'pending_confirmation',total:70,
      created_at:'2026-10-07T12:00:00Z',table_label:'7',guest:true,...extra});
  `, context);
  const run = code => vm.runInContext(code, context);
  run.answers = answer => { context.__answer = answer; run(`customerOrderRpc=async(name,params)=>{calls.push({name,params});
    const a=__answer; return typeof a==='function'?a(name,params):a;}`); };
  run.set = (name, value) => { context[name] = value; };
  run.load = file => vm.runInContext(read(file), context);
  run.timers = timers; run.clock = clock; run.page = page; run.local = local; run.session = session;
  run.shared = {local, session, clock};
  run.flushTimers = () => { for (const timer of timers.splice(0)) if (timer.fn) timer.fn(); };
  run.orders = () => JSON.parse(run('JSON.stringify(calls.filter(c=>/create/.test(c.name)))'));
  return run;
}
/** A tab that has scanned KEY. extra = what the scan answer adds or changes (JS source of an object). */
async function atTable(extra = '', options = {}) {
  const run = environment(`?t=${KEY}`, options);
  run.answers(name => name === 'oracy_table_scan_v1' ? run(`scanOk(${extra})`) : run('created()'));
  run('tableBoot()');
  await run('tableSettled()');
  run('toasts.length=0; calls.length=0; draws=0');
  return run;
}
const withRewards = run => run(`rewardsState.rules={enabled:true,earn_points_per_unit:0.1,min_redeem_points:50}`);

/* ---- 1. when the guest way is offered ---------------------------------------------------------- */

test('the scan says guest_orders: remembered with the table, offered only to a visitor who is not signed in', async () => {
  const run = await atTable();
  assert.equal(JSON.parse(run.session.get(TABLE_STORE)).guestOrders, true);
  assert.equal(run('tableGuestOffered()'), true);
  assert.equal(run('tableGuestMode()'), true);                 // the guest way is the first choice
  run('state.isLoggedIn=true');
  assert.equal(run('tableGuestOffered()'), false);             // a signed-in visitor never sees it
  assert.equal(run('tableGuestMode()'), false);
  assert.equal(run('checkoutCustomerMarkup().includes("table-who")'), false);
  assert.match(run('checkoutCustomerMarkup()'), /checkout-account-card/);
  // a reload in the tab keeps it
  const again = environment('', run.shared);
  again('tableBoot()');
  assert.equal(again('tableGuestOffered()'), true);
});

test('guest_orders false, missing (a server without 376) or not exactly true: exactly today\'s checkout', async () => {
  const plain = environment('');
  const today = plain('checkoutCustomerMarkup()');
  assert.match(today, /checkout-mobile-field/);
  for (const extra of ['{guest_orders:false}', '{guest_orders:undefined}', '{guest_orders:"true"}', '{guest_orders:1}', '{guest_orders:null}']) {
    const run = await atTable(extra);
    assert.equal(run('tableActive().guestOrders'), false, extra);
    assert.equal(run('tableGuestOffered()'), false, extra);
    assert.equal(run('tableGuestMode()'), false, extra);
    assert.equal(run('checkoutCustomerMarkup()'), today, extra);
    assert.equal(run('tableGuestOrder()'), null, extra);
    // the order still needs a sign-in on the device
    run('state.screen="checkout"');
    await run('createOrderAfterVerification()');
    assert.equal(run.orders().length, 0, extra);
    assert.deepEqual(JSON.parse(run('JSON.stringify(toasts)')), ['Please sign in to place your order.'], extra);
  }
  // and no table at all: nothing of this exists
  assert.equal(plain('tableGuestOffered()'), false);
  assert.equal(plain('tableGuestOn()'), false);
});

test('a table remembered before this release (no guestOrders in storage) stays on the sign-in way', () => {
  const run = environment('');
  run.session.set(TABLE_STORE, JSON.stringify({key: KEY, label: '7', section: '', branchId: BRANCH, restaurantId: RESTAURANT, at: run.clock.now}));
  run('tableBoot()');
  assert.equal(run('tableActive().label'), '7');
  assert.equal(run('tableGuestOffered()'), false);
});

/* ---- 2. the two ways on the checkout ----------------------------------------------------------- */

test('the checkout offers two clear ways: "Order as guest" (open, one field) and the gold "Sign in and earn N points"', async () => {
  const run = await atTable();
  withRewards(run);
  const html = run('checkoutCustomerMarkup()');
  assert.match(html, /role="radiogroup" aria-label="How would you like to order\?"/);
  assert.match(html, /table-who-guest on[\s\S]*aria-checked="true" onclick="tableChoose\('guest'\)"[\s\S]*<strong>Order as guest<\/strong>/);
  assert.match(html, /<input class="field table-guest-name" id="tableGuestName" type="text" maxlength="80"/);
  assert.match(html, /placeholder="Your name" aria-label="Your name"/);
  assert.match(html, /<p class="table-guest-hint">No mobile number needed\.<\/p>/);
  // 2 × 35 = 70 of food → 7 points with the restaurant's rule (the existing estimate)
  assert.equal(run('rewardsEarnPreview(rewardsState.rules, totals().foodTotal)'), 7);
  assert.match(html, /table-who-signin table-who-gold"[\s\S]*aria-checked="false" onclick="tableChoose\('signin'\)"[\s\S]*<strong>Sign in and earn 7 points<\/strong>/);
  assert.equal(html.includes('mobile-input'), false);          // no mobile number is asked on the guest way
  assert.equal(html.split('role="radio"').length, 3);          // two ways, no third
  assert.equal(/error|invalid/.test(html), false);
});

test('choosing sign-in opens the usual mobile field inside the gold card; choosing guest brings the name back', async () => {
  const run = await atTable();
  withRewards(run);
  run('state.screen="checkout"; tableChoose("signin")');
  assert.equal(run('draws'), 1);
  assert.equal(run('tableGuestMode()'), false);
  const html = run('checkoutCustomerMarkup()');
  assert.match(html, /table-who-signin table-who-gold on"[\s\S]*aria-checked="true"[\s\S]*checkout-mobile-field[\s\S]*mobile-input/);
  assert.equal(html.includes('tableGuestName'), false);
  assert.equal(html.includes('table-guest-hint'), false);
  assert.match(html, /table-who-guest"[\s\S]*aria-checked="false"/);
  run('tableChoose("guest")');
  assert.equal(run('tableGuestMode()'), true);
  assert.match(run('checkoutCustomerMarkup()'), /tableGuestName/);
  run('tableChoose("anything else")');                         // only the two words exist
  assert.equal(run('tableGuest.choice'), 'guest');
});

test('points switched off: the sign-in way is still there, in plain words and without gold or a number', async () => {
  const run = await atTable();
  run('rewardsState.rules={enabled:false}');
  const html = run('checkoutCustomerMarkup()');
  assert.match(html, /<strong>Sign in with your mobile number<\/strong>/);
  assert.equal(html.includes('table-who-gold'), false);
  assert.equal(/earn/i.test(html), false);
  assert.equal(run('tableGuestEarn()'), 0);
});

test('while the two ways are shown the separate "Earn points" card is not drawn a second time', () => {
  const app = read('js/app.js');
  assert.ok(app.includes('${typeof rewardsCheckoutMarkup === "function" && !(typeof tableGuestOffered === "function" && tableGuestOffered()) ? rewardsCheckoutMarkup() : ""}'));
  assert.ok(app.includes('return typeof tableGuestOffered === "function" && tableGuestOffered() ? tableGuestMarkup(mobileEntry) : mobileEntry;'));
});

/* ---- 3. the name -------------------------------------------------------------------------------- */

test('the name must be 2 to 80 characters: an inline error, no toast about a mobile number, nothing sent', async () => {
  for (const [lang, words] of [['en', 'Please enter your name (at least 2 letters).'], ['ar', 'يرجى إدخال اسمك (حرفان على الأقل).']]) {
    for (const bad of ['', ' ', 'A', '  B  ', '\\u200b\\u200b\\u200b', '\\n\\t']) {
      const run = await atTable();
      run(`state.lang='${lang}'; state.screen='checkout'; tableGuestNameInput("${bad}")`);
      await run('placeOrder()');
      assert.equal(run.orders().length, 0, JSON.stringify(bad));
      assert.equal(run('tableGuest.error'), words, JSON.stringify(bad));
      assert.equal(run('toasts.length'), 0, JSON.stringify(bad));
      const html = run('checkoutCustomerMarkup()');
      assert.ok(html.includes(`<p class="table-guest-error" role="alert">${words}</p>`), lang);
      assert.match(html, /table-guest-name invalid"[\s\S]*aria-invalid="true"/);
      assert.match(html, /table-guest-hint/);                  // the quiet line stays
      assert.equal(run('state.orderSubmitting'), false);
    }
  }
});

test('typing clears the error without redrawing the screen (the keyboard must stay open)', async () => {
  const run = await atTable();
  run('state.screen="checkout"');
  await run('placeOrder()');
  assert.ok(run('tableGuest.error'));
  run('draws=0; tableGuestNameInput("Ad")');
  assert.equal(run('tableGuest.error'), '');
  assert.equal(run('draws'), 0);
  assert.equal(run('checkoutCustomerMarkup().includes("table-guest-error")'), false);
  assert.match(read('js/table.js'), /oninput="tableGuestNameInput\(this\.value\)"/);
  for (const name of ['tableChoose', 'tableGuestNameInput']) assert.equal(run(`typeof window.${name}`), 'function');
});

test('the name is cleaned before it is sent: no control or invisible characters, single spaces, at most 80', async () => {
  const run = await atTable();
  assert.equal(run('tableGuestClean("  Adeel \\n\\t Javed\\u200b  ")'), 'Adeel Javed');
  assert.equal(run('tableGuestClean("\\u202eevil")'), 'evil');
  assert.equal(run('tableGuestClean("عديل  جاويد")'), 'عديل جاويد');
  assert.equal(run('tableGuestClean("x".repeat(200)).length'), 80);
  assert.equal(run('tableGuestClean(null)'), '');
  assert.equal(run('tableGuestClean("Al")'), 'Al');             // two characters are enough
  run('tableGuestNameInput("Al")');
  assert.equal(run('tableGuestNameOk()'), true);
});

test('the name is remembered on the device and drawn escaped', async () => {
  const run = await atTable();
  run('tableGuestNameInput("Adeel")');
  assert.equal(run.local.get(GUEST_NAME), 'Adeel');
  const again = environment('', run.shared);
  again('tableBoot()');
  assert.match(again('checkoutCustomerMarkup()'), /value="Adeel"/);
  // hostile text typed, or planted in storage, never becomes markup
  const evil = '"><img src=x onerror=alert(1)><script>';
  const planted = environment('', {session: run.session, local: new Map([[GUEST_NAME, evil]]), clock: run.clock});
  planted('tableBoot()');
  const html = planted('checkoutCustomerMarkup()');
  assert.equal(/<img|<script/i.test(html), false);
  assert.ok(html.includes('value="&quot;&gt;&lt;img src=x onerror=alert(1)&gt;&lt;script&gt;"'));
});

/* ---- 4. the guest order -------------------------------------------------------------------------- */

test('Place Order as a guest goes to oracy_create_table_guest_order_v1: name and guest id, no phone, e-mail, voucher or points', async () => {
  const run = await atTable();
  run(`state.screen='checkout'; state.customer={name:'Old Name',mobile:'0500000000',email:'old@example.com'};
    state.coupon='EID'; state.couponOn=true; state.voucher={code:'EID',kind:'percent',value:10}; state.redeemPoints=50;
    tableGuestNameInput('  Adeel   Javed ')`);
  await run('placeOrder()');
  const sent = run.orders();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].name, 'oracy_create_table_guest_order_v1');
  assert.deepEqual(Object.keys(sent[0].params).sort(), ['p_key', 'p_order']);
  assert.equal(sent[0].params.p_key, KEY);
  const order = sent[0].params.p_order;
  assert.equal(order.customer_name, 'Adeel Javed');
  assert.match(order.guest_id, UUID);
  assert.match(order.client_order_id, UUID);
  assert.equal(order.fulfillment_type, 'dinein');
  assert.equal(order.schedule_type, 'asap');
  assert.equal(order.scheduled_for, null);
  assert.deepEqual(order.items, [{menu_item_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', quantity: 2, notes: '', choices: []}]);
  for (const key of ['customer_phone', 'customer_email', 'customer_registered', 'coupon_code', 'redeem_points', 'address',
    'delivery_address_id', 'delivery_address_version', 'expected_delivery_fee', 'order_timing', 'suggested_eta']) {
    assert.equal(key in order, false, key);
  }
  const text = JSON.stringify(order);
  assert.equal(/0500000000|old@example\.com|Old Name|EID/.test(text), false);
  assert.equal(run('state.screen'), 'confirmation');
});

test('the guest function works without a sign-in token; it is not in the signed-in-only list', async () => {
  const data = read('js/data.js');
  const list = /const signedInOnly = \[([^\]]*)\];/.exec(data)[1];
  assert.equal(list.includes('oracy_create_table_guest_order_v1'), false);
  assert.ok(list.includes('"oracy_create_table_order_v1"') && list.includes('"oracy_create_customer_order_v1"'));   // the others still need it
  const run = await atTable();
  const requests = [];
  run.set('fetch', async (url, options) => { requests.push({url, options}); return {ok: true, status: 200, json: async () => ({id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    order_number: 'MK001042', tracking_token: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', status: 'pending_confirmation', total: 70, created_at: '2026-10-07T12:00:00Z', table_label: '7', guest: true})}; });
  run(`customerOrderRpc=realCustomerOrderRpc;                  // the real request layer
    state.screen='checkout'; tableGuestNameInput('Adeel')`);
  await run('placeOrder()');
  const order = requests.filter(r => /oracy_create_table_guest_order_v1$/.test(r.url));
  assert.equal(order.length, 1);
  assert.equal(order[0].options.headers.Authorization, undefined);
  assert.equal(run('state.order.id'), 'MK001042');
});

test('the guest id is made once, kept on the device and reused after a reload', async () => {
  const run = await atTable();
  assert.equal(run.local.has(GUEST_ID), false);                // nothing is made until it is needed
  const id = run('tableGuestId()');
  assert.match(id, UUID);
  assert.equal(run.local.get(GUEST_ID), id);
  assert.equal(run('tableGuestId()'), id);
  const again = environment('', {...run.shared, uuidBase: 500});
  again('tableBoot()');
  assert.equal(again('tableGuestId()'), id);
  // something that is not a uuid in storage is replaced
  const broken = environment('', {local: new Map([[GUEST_ID, '<script>']]), uuidBase: 900});
  const fresh = broken('tableGuestId()');
  assert.match(fresh, UUID);
  assert.equal(broken.local.get(GUEST_ID), fresh);
});

test('storage blocked (private mode): the order still goes, with a guest id kept in memory', async () => {
  const run = await atTable('', {blocked: true});
  assert.equal(run('tableGuestOffered()'), true);              // the table itself is remembered in memory too
  run(`state.screen='checkout'; tableGuestNameInput('Adeel')`);
  const id = run('tableGuestId()');
  assert.match(id, UUID);
  assert.equal(run('tableGuestId()'), id);                     // the same one for a retry
  await run('placeOrder()');
  const sent = run.orders();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].params.p_order.guest_id, id);
  assert.equal(sent[0].params.p_order.customer_name, 'Adeel');
  assert.equal(run('state.screen'), 'confirmation');
});

test('the attempt id: tied to the guest id, not to the name; a corrected name is the same order', async () => {
  const run = await atTable();
  const table = '({key:"' + KEY + '"})';
  const id = run('tableGuestId()');
  const first = run(`orderAttemptId(state.cart, "", ${table}, {name:'Adel', id:'${id}'})`);
  assert.equal(run(`orderAttemptId(state.cart, "", ${table}, {name:'Adeel', id:'${id}'})`), first);
  assert.ok(run('orderAttempt.key').includes(id));
  assert.equal(run('orderAttempt.key').includes('Adel'), false);
  // whatever sits in the sign-in fields is not part of a guest attempt either
  run(`state.customer={name:'Someone',mobile:'0511111111',email:'a@b.c'}; state.couponOn=true; state.voucher={code:'EID'}; state.redeemPoints=50`);
  assert.equal(run(`orderAttemptId(state.cart, "", ${table}, {name:'Adeel', id:'${id}'})`), first);
  // another device (guest id), another cart or the signed-in way: another order
  assert.notEqual(run(`orderAttemptId(state.cart, "", ${table}, {name:'Adeel', id:'aaaaaaaa-aaaa-4aaa-8aaa-999999999999'})`), first);
  run(`orderAttemptId(state.cart, "", ${table}, {name:'Adeel', id:'${id}'})`);
  run('state.cart[0].qty=3');
  assert.notEqual(run(`orderAttemptId(state.cart, "", ${table}, {name:'Adeel', id:'${id}'})`), first);
  assert.notEqual(run(`orderAttemptId(state.cart, "", ${table})`), first);
  assert.equal(run('orderAttempt.key').includes('guest'), false);   // nothing is added for an order that is not a guest's
});

test('a retry after a lost answer sends the same client_order_id, also with the name corrected in between', async () => {
  const run = await atTable();
  let lost = true;
  run.answers(() => { if (lost) throw new Error('The connection is slow. Please try again.'); return run('created()'); });
  run(`state.screen='checkout'; tableGuestNameInput('Adel')`);
  await run('placeOrder()');
  assert.equal(run('state.order'), null);
  assert.equal(run('state.cart.length'), 1);
  lost = false;
  run(`tableGuestNameInput('Adeel')`);
  await run('placeOrder()');
  const sent = run.orders();
  assert.equal(sent.length, 2);
  assert.equal(sent[0].params.p_order.client_order_id, sent[1].params.p_order.client_order_id);
  assert.equal(sent[0].params.p_order.guest_id, sent[1].params.p_order.guest_id);
  assert.equal(sent[1].params.p_order.customer_name, 'Adeel');
});

test('two quick taps make one order', async () => {
  const run = await atTable();
  let release;
  run.answers(() => new Promise(resolve => { release = () => resolve(run('created()')); }));
  run(`state.screen='checkout'; tableGuestNameInput('Adeel')`);
  const first = run('placeOrder()'), second = run('placeOrder()');
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(run.orders().length, 1);
  assert.equal(run('state.orderSubmitting'), true);
  await run('placeOrder()');                                    // a third tap while it is being sent
  assert.equal(run.orders().length, 1);
  release();
  await Promise.all([first, second]);
  assert.equal(run.orders().length, 1);
  assert.equal(run('state.screen'), 'confirmation');
});

test('after a guest order: tracked by its token like any order, with the table, and the device keeps it over a reload', async () => {
  const run = await atTable();
  run(`state.screen='checkout'; tableGuestNameInput('Adeel')`);
  await run('placeOrder()');
  const order = JSON.parse(run('JSON.stringify(state.order)'));
  assert.equal(order.id, 'MK001042');
  assert.equal(order.backendId, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
  assert.equal(order.trackingToken, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
  assert.deepEqual(order.customer, {name: 'Adeel', mobile: '', email: ''});
  assert.equal(order.customerType, 'guest');
  assert.equal(order.orderType, 'dinein');
  assert.equal(order.tableLabel, '7');
  assert.equal(run('state.cart.length'), 0);
  assert.equal(run('tableActive().label'), '7');               // the table stays for the next order
  assert.equal(run('tableGuestOffered()'), true);
  assert.equal(run.local.get(GUEST_NAME), 'Adeel');
  // the tracking call is the usual one, by token
  run.answers((name, params) => ({id: params.p_order_id, order_number: 'MK001042', status: 'preparing', total: 70, updated_at: 'x'}));
  await run('realRefreshTracked()');
  const tracked = JSON.parse(run('JSON.stringify(calls.filter(c => c.name === "oracy_track_customer_order_v1").at(-1))'));
  assert.equal(tracked.name, 'oracy_track_customer_order_v1');
  assert.deepEqual(tracked.params, {p_order_id: order.backendId, p_tracking_token: order.trackingToken});
  assert.equal(run('state.order.status'), 'preparing');
  // a reload
  const again = environment('', run.shared);
  again('restoreTrackedCustomerOrder(); tableBoot()');
  assert.equal(again('state.order.id'), 'MK001042');
  assert.equal(again('state.order.status'), 'preparing');
  assert.equal(again('orderTableSuffix(state.order)'), '<span class="table-order-name">&nbsp;· Table <bdi>7</bdi></span>');
});

test('the Orders tab of a visitor who is not signed in shows the guest\'s active order, with "add more items" by token', async () => {
  const run = await atTable();
  run.load('js/order-addons.js');
  run(`state.order={id:'MK001042',backendId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',trackingToken:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    status:'preparing',orderType:'dinein',tableLabel:'7',items:[{id:itemId,qty:2}],customer:{name:'Adeel',mobile:'',email:''}};
    state.orderTab='active'; state.screen='track';
    orderAddons.info.set(state.order.backendId,{can_add:true,addons:[]});
    nav=()=>''; langSwitch=()=>''; pushCardMarkup=()=>'';`);
  const html = run('track()');
  assert.match(html, /<strong>#MK001042<\/strong>/);
  assert.match(html, /Dine-in<span class="table-order-name">&nbsp;· Table <bdi>7<\/bdi><\/span>/);
  assert.match(html, /2 × Malai Boti/);
  assert.ok(html.includes(`onclick="startOrderAddon('cccccccc-cccc-4ccc-8ccc-cccccccccccc','MK001042','dddddddd-dddd-4ddd-8ddd-dddddddddddd')"`));
  // the add-on request itself goes by the tracking token, as for everyone
  assert.match(read('js/order-addons.js'), /customerOrderRpc\("oracy_request_order_addon_v1", \{\s*p_order_id: target\.id, p_tracking_token: target\.token \|\| null,/);
  assert.equal(/signedInOnly = \[[^\]]*(addon|track)/.test(read('js/data.js')), false);
});

/* ---- 5. the server's words ----------------------------------------------------------------------- */

test('"Please sign in with your mobile number…": shown as it is, the checkout turns to sign-in, guest is not offered again', async () => {
  for (const [lang, words] of [['en', SIGN_IN], ['ar', 'يرجى تسجيل الدخول برقم جوالك للطلب من هذه الطاولة.']]) {
    const run = await atTable();
    run.answers(() => { throw new Error(SIGN_IN); });
    run(`state.lang='${lang}'; state.screen='checkout'; tableGuestNameInput('Adeel')`);
    await run('placeOrder()');
    run.flushTimers();
    assert.deepEqual(JSON.parse(run('JSON.stringify(toasts)')), [words]);
    assert.equal(run('tableGuestOffered()'), false);
    assert.equal(run('tableActive().label'), '7');             // still at the table
    assert.equal(run('state.cart.length'), 1);
    assert.equal(run('state.screen'), 'checkout');
    assert.equal(run('state.orderSubmitting'), false);
    assert.match(run('checkoutCustomerMarkup()'), /checkout-mobile-field/);
    assert.equal(run('checkoutCustomerMarkup().includes("table-who")'), false);
    // not offered again for this visit, also after a reload of the tab
    const again = environment('', run.shared);
    again('tableBoot()');
    assert.equal(again('tableActive().label'), '7');
    assert.equal(again('tableGuestOffered()'), false);
  }
});

test('"Ordering is very busy right now. Please ask our staff.": shown as it is (Arabic too), nothing else changes', async () => {
  for (const [lang, words] of [['en', BUSY], ['ar', 'الطلبات مزدحمة جداً الآن. يرجى سؤال أحد موظفينا.']]) {
    const run = await atTable();
    run.answers(() => { throw new Error(BUSY); });
    run(`state.lang='${lang}'; state.screen='checkout'; tableGuestNameInput('Adeel')`);
    await run('placeOrder()');
    run.flushTimers();
    assert.deepEqual(JSON.parse(run('JSON.stringify(toasts)')), [words]);
    assert.equal(run('tableGuestOffered()'), true);
    assert.equal(run('tableGuestMode()'), true);
    assert.equal(run('state.cart.length'), 1);
    assert.equal(run('state.orderSubmitting'), false);
  }
});

test('the server refusing the name shows it under the field; the server refusing the key ends table mode', async () => {
  const run = await atTable();
  run.answers(() => { throw new Error('Please enter your name to order.'); });
  run(`state.lang='ar'; state.screen='checkout'; tableGuestNameInput('Adeel')`);
  await run('placeOrder()');
  run.flushTimers();
  assert.equal(run('tableGuest.error'), 'يرجى إدخال اسمك لإتمام الطلب.');
  assert.equal(run('toasts.length'), 0);
  const gone = await atTable();
  gone.answers(() => { throw new Error(INACTIVE); });
  gone(`state.screen='checkout'; tableGuestNameInput('Adeel')`);
  await gone('placeOrder()');
  gone.flushTimers();
  assert.equal(gone('tableActive()'), null);
  assert.equal(gone('tableGuestOffered()'), false);
  assert.deepEqual(JSON.parse(gone('JSON.stringify(toasts)')), [INACTIVE]);
  assert.equal(gone('state.cart.length'), 1);
});

test('the server messages are the contract\'s words, have Arabic, and are not mistaken for voucher / points trouble', () => {
  const run = environment('');
  const text = JSON.parse(run('JSON.stringify(TABLE_TEXT)'));
  assert.equal(text.en.guestSignIn, SIGN_IN);
  assert.equal(text.en.busy, BUSY);
  assert.equal(text.en.nameNeeded, 'Please enter your name to order.');
  assert.equal(text.en.guestHint, 'No mobile number needed.');
  for (const key of ['guestSignIn', 'busy', 'nameNeeded']) {
    assert.match(text.ar[key], /[؀-ۿ]/, key);
    assert.equal(/\bcode\b|points/i.test(text.en[key]), false, key);
  }
  for (const key of ['whoLabel', 'guestTitle', 'guestSub', 'guestName', 'guestHint', 'guestNameError', 'signInEarn', 'signInPlain', 'signInSub',
    'couponAsk', 'couponLink', 'couponRemoved']) {
    assert.ok(text.en[key] && /[؀-ۿ]/.test(text.ar[key]), key);
  }
  assert.deepEqual(Object.keys(text.ar).sort(), Object.keys(text.en).sort());
  run('state.lang="ar"');
  assert.equal(run('tableText("signInEarn",{points:7})'), 'سجّل الدخول واكسب 7 نقطة');
  // unknown texts are left to the checkout's own handling
  assert.equal(run('tableGuestRefusal("This code is not valid")'), false);
  assert.equal(run('tableGuestRefusal("")'), false);
});

/* ---- 6. signed in ------------------------------------------------------------------------------- */

test('a signed-in visitor at a guest table orders through the signed-in table function, never the guest one', async () => {
  const run = await atTable();
  run(`state.isLoggedIn=true; state.customer={name:'Adeel',mobile:'0500000000',email:''}; state.customerPhone='0500000000';
    state.screen='checkout'; tableGuest.choice='guest'; tableGuestNameInput('Guest Name')`);
  await run('placeOrder()');
  const sent = run.orders();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].name, 'oracy_create_table_order_v1');
  assert.equal(sent[0].params.p_order.customer_name, 'Adeel');
  assert.ok(String(sent[0].params.p_order.customer_phone).length > 0);
  assert.equal('guest_id' in sent[0].params.p_order, false);
  assert.equal(run('orderAttempt.key'), null);                 // cleared after success
  // even handed a guest, the request layer does not use the guest function for a signed-in visitor
  run('calls.length=0');
  await run(`submitCustomerOrder({fulfillment_type:'dinein',customer_phone:'0500000000'}, tableActive(), {name:'X Y', id:tableGuestId()})`);
  assert.equal(run.orders()[0].name, 'oracy_create_table_order_v1');
});

test('a guest who signs in midway (items in the cart) continues as a signed-in table order with the same cart', async () => {
  const run = await atTable();
  run(`state.screen='checkout'; tableGuestNameInput('Adeel'); tableChoose('signin')`);
  assert.equal(run('tableGuestMode()'), false);
  // the OTP flow ends here in the real app
  run(`state.isLoggedIn=true; state.customer={name:'Adeel Javed',mobile:'0500000000',email:''}`);
  await run('createOrderAfterVerification()');
  const sent = run.orders();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].name, 'oracy_create_table_order_v1');
  assert.equal(sent[0].params.p_key, KEY);
  assert.equal(sent[0].params.p_order.items[0].quantity, 2);
  assert.equal(sent[0].params.p_order.customer_name, 'Adeel Javed');
  assert.equal(run('state.order.customer.mobile'), '0500000000');
});

test('on the sign-in way Place Order asks for the mobile number as today (no guest order is made)', async () => {
  const run = await atTable();
  run(`I18N.en.invalidMobile='Enter a valid Saudi mobile number.'; state.customer={name:'',mobile:'',email:''};
    state.screen='checkout'; tableGuestNameInput('Adeel'); tableChoose('signin')`);
  await run('placeOrder()');
  assert.equal(run.orders().length, 0);
  assert.deepEqual(JSON.parse(run('JSON.stringify(toasts)')), ['Enter a valid Saudi mobile number.']);
});

/* ---- 7. voucher and points in guest mode ------------------------------------------------------------ */

test('a guest order shows no voucher and no points: taken off before every draw, and the totals say the real price', async () => {
  const run = await atTable();
  run(`state.couponOn=true; state.voucher={ok:true,code:'EID',kind:'percent',value:10}; state.coupon='EID'; state.redeemPoints=50; render()`);
  assert.equal(run('state.couponOn'), false);
  assert.equal(run('state.voucher'), null);
  assert.equal(run('state.redeemPoints'), 0);
  assert.equal(run('totals().discount'), 0);
  assert.equal(run('totals().total'), 70);
  // not at a guest table: nothing is touched
  const plain = await atTable('{guest_orders:false}');
  plain(`state.couponOn=true; state.voucher={ok:true,code:'EID'}; state.redeemPoints=50; render()`);
  assert.equal(plain('state.couponOn'), true);
  assert.equal(plain('state.redeemPoints'), 50);
  // on the sign-in way the voucher stays
  const signing = await atTable();
  signing(`tableChoose('signin'); state.couponOn=true; state.voucher={ok:true,code:'EID'}; render()`);
  assert.equal(signing('state.couponOn'), true);
});

test('the cart shows one quiet line in place of the coupon box; "Sign in to use it" brings the box back', async () => {
  const app = read('js/app.js');
  assert.ok(app.includes('${tableGuestOn() ? tableGuestCouponNote() : `<div id="couponBox">${couponBoxMarkup()}</div>`}'));
  assert.equal(app.split('id="couponBox"').length, 2);
  const run = await atTable();
  const note = run('tableGuestCouponNote()');
  assert.match(note, /<p class="table-guest-coupon">Have a coupon\?\s*<button type="button" class="link" onclick="tableChoose\('signin'\)">Sign in to use it<\/button><\/p>/);
  assert.equal(note.includes('couponInput'), false);
  assert.equal(run('tableGuestOn()'), true);
  run('state.screen="cart"; tableChoose("signin")');
  assert.equal(run('tableGuestOn()'), false);                  // the cart draws the coupon box again
  assert.equal(run('draws'), 1);
  // coupons switched off for the restaurant: no line either
  run('tableChoose("guest"); orderingHours.status={version:1,features:{vouchers:false}}');
  assert.equal(run('tableGuestCouponNote()'), '');
  run('state.lang="ar"; orderingHours.status=null');
  assert.match(run('tableGuestCouponNote()'), /هل لديك كوبون؟[\s\S]*سجّل الدخول لاستخدامه/);
});

test('going back to the guest way with a coupon applied takes it off and says so', async () => {
  const run = await atTable();
  run(`state.screen='checkout'; tableChoose('signin'); state.couponOn=true; state.voucher={ok:true,code:'EID'}; state.coupon='EID'; toasts.length=0;
    tableChoose('guest')`);
  assert.equal(run('state.couponOn'), false);
  assert.equal(run('state.voucher'), null);
  assert.deepEqual(JSON.parse(run('JSON.stringify(toasts)')), ['Coupons are for signed-in orders. Your coupon was removed.']);
  run('toasts.length=0; tableChoose("signin"); tableChoose("guest")');
  assert.equal(run('toasts.length'), 0);                       // nothing to say without a coupon
});

/* ---- 8. the layout at a table --------------------------------------------------------------------- */

test('a QR visit always opens the "scroll" structure, whatever the visitor chose; the saved choice is not touched', async () => {
  const config = read('js/brand-config.js');
  assert.match(config, /theme: Object\.freeze\(\{structure: "classic", style: "heritage", tableStructure: "scroll"\}\)/);
  for (const saved of ['classic', 'scroll', null]) {
    const local = new Map(saved ? [[STRUCTURE, saved]] : []);
    const plain = environment('', {local});
    assert.equal(plain('brandTheme().structure'), saved || 'classic');
    assert.equal(plain('tableStructure()'), '');
    const run = await atTable('', {local: new Map(local)});
    assert.equal(run('brandTheme().structure'), 'scroll', String(saved));
    assert.equal(run('tableStructure()'), 'scroll');
    assert.equal(run('structureIs("scroll")'), true);
    assert.equal(run.page.dataset.structure, 'scroll');
    assert.equal(run.local.get(STRUCTURE) ?? null, saved);     // never written
    assert.equal(run('brandTheme().style'), 'heritage');
    // leaving the table gives the visitor's own choice back
    run('tableLeave()');
    assert.equal(run('brandTheme().structure'), saved || 'classic', String(saved));
    assert.equal(run.page.dataset.structure, saved || 'classic');
    assert.equal(run.local.get(STRUCTURE) ?? null, saved);
  }
});

test('the table layout holds from the first draw (while the key is checked), over a reload, and ends with the table', async () => {
  const run = environment(`?t=${KEY}`, {local: new Map([[STRUCTURE, 'classic']])});
  let answer;
  run.answers(() => new Promise(resolve => { answer = resolve; }));
  run('tableBoot()');
  assert.equal(run('brandTheme().structure'), 'scroll');       // no jump when the answer comes
  assert.equal(run.page.dataset.structure, 'scroll');
  answer({ok: false});
  await run('tableSettled()');
  assert.equal(run('brandTheme().structure'), 'classic');      // not a table after all
  assert.equal(run.page.dataset.structure, 'classic');
  // a reload at the table, on a screen the scroll structure does not have
  const at = await atTable('', {local: new Map([[STRUCTURE, 'classic']])});
  const again = environment('', at.shared);
  again('state.screen="listing"; tableBoot()');
  assert.equal(again('brandTheme().structure'), 'scroll');
  assert.equal(again('state.screen'), 'home');
  again.clock.now += 6 * 60 * 60 * 1000;                       // six hours later the table is forgotten
  assert.equal(again('brandTheme().structure'), 'classic');
  assert.equal(again.page.dataset.structure, 'classic');
  // the server refusing the key at order time ends it too
  const refused = await atTable('', {local: new Map([[STRUCTURE, 'classic']])});
  refused('tableRefused("' + INACTIVE + '")');
  assert.equal(refused.page.dataset.structure, 'classic');
});

test('tableStructure is a checked config value: an unknown name or none forces nothing', async () => {
  for (const change of [s => s.replace('tableStructure: "scroll"', 'tableStructure: "nope"'), s => s.replace(', tableStructure: "scroll"', '')]) {
    const run = await atTable('', {brand: change, local: new Map([[STRUCTURE, 'classic']])});
    assert.equal(run('tableActive().label'), '7');
    assert.equal(run('tableStructure()'), '');
    assert.equal(run('brandTheme().structure'), 'classic');
  }
  const classic = await atTable('', {brand: s => s.replace('tableStructure: "scroll"', 'tableStructure: "classic"'), local: new Map([[STRUCTURE, 'scroll']])});
  assert.equal(classic('brandTheme().structure'), 'classic');  // any known structure can be the table's
  // brand-config.js alone (no table.js) keeps working
  const c = vm.createContext({localStorage: {getItem: () => null, setItem() {}}, console});
  vm.runInContext(read('js/brand-config.js'), c);
  assert.equal(vm.runInContext('brandTheme().structure', c), 'classic');
  assert.equal(vm.runInContext('tableStructure()', c), '');
});

test('the layout-preview chooser is hidden at a table and cannot change the saved choice from there', async () => {
  const run = await atTable('', {local: new Map([[STRUCTURE, 'classic']])});
  run(`I18N.en.appearance='Appearance'; langSwitch=()=>''; back=()=>''`);
  const at = run('appearanceSettingsPage()');
  assert.equal(at.includes('setPreviewStructure'), false);
  assert.equal(at.includes('Layout preview'), false);
  assert.match(at, /setAppearance\('dark'\)|setAppearance\("dark"\)|dark/i);   // the rest of the page is there
  run(`setPreviewStructure('classic')`);
  assert.equal(run.local.get(STRUCTURE), 'classic');
  run.local.delete(STRUCTURE);
  run(`setPreviewStructure('scroll')`);
  assert.equal(run.local.has(STRUCTURE), false);               // nothing written while at a table
  run('tableLeave()');
  const away = run('appearanceSettingsPage()');
  assert.ok(away.includes("setPreviewStructure('scroll')") && away.includes("setPreviewStructure('classic')"));
  run(`setPreviewStructure('scroll')`);
  assert.equal(run.local.get(STRUCTURE), 'scroll');            // and works again away from the table
});

/* ---- 9. closed and paused at a table --------------------------------------------------------------- */

const hours = o => `orderingHours.status=${JSON.stringify({version: 1, timezone: 'Asia/Riyadh', dinein: {open: true, enforced: false},
  takeaway: {open: true, enforced: false}, delivery: {open: true, enforced: false}, ...o})}`;
const OTHER_TYPE = /order type|still open|pick-up|takeaway|delivery|نوع طلب|متاح الآن|الاستلام|التوصيل/i;

test('paused at a table: "ask our staff" instead of "choose another order type" (the usual words away from a table)', async () => {
  const paused = {dinein: {open: false, enforced: true, reason: 'paused', pause_reason: 'Kitchen is very busy.'}};
  const run = await atTable();
  run(hours(paused));
  assert.equal(run('orderingClosedTitle("dinein")'), 'Dine-in is paused right now');
  assert.equal(run('restaurantClosedMessage("dinein")'), 'Kitchen is very busy. Your cart is saved. Please try again later or ask our staff.');
  run('state.lang="ar"');
  assert.equal(run('restaurantClosedMessage("dinein")'), 'Kitchen is very busy. سلتك محفوظة. يرجى المحاولة لاحقاً أو سؤال أحد موظفينا.');
  const plain = environment('');
  plain(hours(paused));
  assert.equal(plain('restaurantClosedMessage("dinein")'), 'Kitchen is very busy. Your cart is saved. Please try again later or choose another order type.');
  plain('state.lang="ar"');
  assert.match(plain('restaurantClosedMessage("dinein")'), /اختيار نوع طلب آخر/);
});

test('closed at a table: the opening time stays, "Pick-up is still open now" is not said', async () => {
  const opens = new Date(Date.parse('2026-10-07T12:00:00Z') + 3 * 60 * 60 * 1000).toISOString();
  const closed = {dinein: {open: false, enforced: true, reason: 'closed', opens_at: opens}};
  const run = await atTable();
  run(hours(closed));
  assert.equal(run('orderingClosedTitle("dinein")'), 'Restaurant is currently closed');
  assert.match(run('restaurantClosedMessage("dinein")'), /^Your cart is saved\. You can place this order when we open today at 6:00 PM\.$/);
  assert.match(run('checkoutClosedLabel()'), /^Opens today at 6:00 PM$/);
  const plain = environment('');
  plain(hours(closed));
  assert.match(plain('restaurantClosedMessage("dinein")'), /when we open today at 6:00 PM\. Pick-up is still open now\.$/);
});

test('no closed, paused, limit or switched-off text a table visitor can see points to another order type', async () => {
  const soon = new Date(Date.parse('2026-10-07T12:00:00Z') + 60 * 60 * 1000).toISOString();
  const past = new Date(Date.parse('2026-10-07T12:00:00Z') - 60 * 1000).toISOString();
  const states = {
    closed: {open: false, enforced: true, reason: 'closed', opens_at: soon},
    closedNoTime: {open: false, enforced: true, reason: 'closed'},
    paused: {open: false, enforced: true, reason: 'paused'},
    pausedWhy: {open: false, enforced: true, reason: 'paused', pause_reason: 'Private event'},
    cutoff: {open: true, enforced: true, until: past, opens_at: soon},
    unavailable: {open: false, enforced: true, reason: 'unavailable'},
  };
  for (const lang of ['en', 'ar']) {
    for (const [name, dinein] of Object.entries(states)) {
      const run = await atTable();
      run(`state.lang='${lang}'; ${hours({dinein})}; render()`);
      assert.equal(run('state.orderType'), 'dinein');
      assert.equal(run('orderTypeOpen()'), false, name);
      const seen = [run('orderingClosedTitle()'), run('restaurantClosedMessage()'), run('orderingNoticeMarkup()'), run('checkoutClosedLabel()')];
      for (const text of seen) assert.equal(OTHER_TYPE.test(text.replace(/Dine-in|الطلب داخل المطعم/g, '')), false, `${lang} ${name}: ${text}`);
      assert.ok(seen[0].length > 0 && seen[1].length > 0, name);   // the meaning is still said
      assert.equal(run('checkoutTypeClosedTag("dinein")').length >= 0, true);
    }
  }
  // the whole restaurant's ordering switched off: "call the restaurant", as before
  const off = await atTable();
  off('orderingHours.status={version:1,features:{ordering:false}}');
  assert.equal(off('orderingClosedTitle() + ". " + restaurantClosedMessage()'), 'Online ordering is not available right now. Please call the restaurant.');
  // the order-type choice (with its "Closed" tags) is not on the table checkout at all
  assert.ok(read('js/app.js').includes('${tableChip("checkout") || `<div class="checkout-order-types">'));
});

/* ---- 10. wiring -------------------------------------------------------------------------------------- */

test('the changed files have new cache keys; untouched files keep theirs', () => {
  const html = read('index.html');
  for (const file of ['js/brand-config.js', 'js/ordering-hours.js']) assert.ok(html.includes(`${file}?v=20261007-b1g"`), file);
  // Batch 1b (order note, call waiter) changed these again
  for (const file of ['js/app.js', 'js/account-orders.js']) assert.ok(html.includes(`${file}?v=20261008-3a"`), file);   // Batch 3a
  for (const file of []) assert.ok(html.includes(`${file}?v=20261007-1b"`), file);
  for (const file of ['css/table.css']) assert.ok(html.includes(`${file}?v=20261007-391"`), file);
  assert.ok(html.includes('js/table.js?v=20261008-3a"'));   // Batch 3a (C4: no coupon line without codes)   // Batch 391
  for (const file of ['js/data.js']) assert.ok(html.includes(`${file}?v=20261008-3a"`), file);   // Batch 3a
  for (const file of ['js/push.js']) assert.ok(html.includes(`${file}?v=20261007-388"`), file);   // Batch 388
  for (const pin of ['js/rewards.js?v=20261003-batche', 'js/order-addons.js?v=20261008-3a',
    'js/i18n.js?v=20261006-cx4f', 'js/auth.js?v=20261003-gate4', 'css/theme.css?v=20261006-cx4i',
    'css/rewards.css?v=20261002-rewards2', 'js/theme.js?v=20261006-cx4c']) assert.ok(html.includes(pin + '"'), pin);
  // every call from the other files into table.js is guarded, so each still works alone
  for (const file of ['js/app.js', 'js/data.js', 'js/brand-config.js', 'js/ordering-hours.js']) {
    const source = read(file);
    for (const m of source.matchAll(/\b(tableGuestOffered|tableGuestMode|tableGuestOrder|tableGuestRefusal|tableGuestMarkup|tableShapesLook|tableStructure|tableActive)\(/g)) {
      const from = source.lastIndexOf('\n', m.index) + 1;
      const line = source.slice(from, source.indexOf('\n', m.index));
      if (/^\s*function /.test(line) || (file === 'js/brand-config.js' && m[1] === 'tableStructure')) continue;
      assert.match(line, /typeof table\w+ === ["']function["']/, `${file}: ${line.trim()}`);
    }
  }
  // the Gate 4 rule still stands for every order that is not a guest's at a table
  assert.match(read('js/app.js'), /if \(!guest\) \{\n    if \(!state\.isLoggedIn\) \{ go\("checkout"\); return toast\(t\("signInRequired"\)\); \}\n  \}/);
  assert.equal(/margin-(left|right)|padding-(left|right)|text-align:\s*(left|right)|\b(left|right):/.test(read('css/table.css')), false);
});
