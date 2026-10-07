// Batch B1 (373): QR table ordering ("table mode"). A link <app>/?t=<key> makes this tab order
// dine-in for one table through oracy_create_table_order_v1; without ?t= nothing changes.
// Run: node --test tests/table-mode.test.cjs. No network.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const KEY = 'Ab3dEf6hIj9kLm2nOp5qRs';          // 22 characters, letters and digits
const KEY2 = 'Zy8xWv7uTs6rQp5oNm4lKj';
const RESTAURANT = '11111111-1111-1111-1111-111111111111';
const BRANCH = '22222222-2222-2222-2222-222222222222';
const OTHER = '33333333-3333-3333-3333-333333333333';
const TABLE_STORE = 'oracy:meerath-kabab:table:v1';
const INACTIVE = 'This table QR is not active. Please ask our staff.';
const HOUR = 60 * 60 * 1000;

/** One tab. `shared` carries the storages of an earlier tab so a reload can be played. */
function environment(search = '', shared = {}) {
  const local = shared.local || new Map();
  const session = shared.session || new Map();
  const clock = shared.clock || {now: Date.parse('2026-10-06T12:00:00Z')};
  class TestDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock.now])); }
    static now() { return clock.now; }
  }
  const box = map => ({
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key),
  });
  const location = {pathname: '/', search, hash: ''};
  const replaced = [];
  const timers = [];
  let uuid = 0;
  const context = vm.createContext({
    console, URL, URLSearchParams, Intl, Date: TestDate, AbortController, Promise,
    crypto: {randomUUID: () => `aaaaaaaa-aaaa-4aaa-8aaa-${String(++uuid).padStart(12, '0')}`},
    setTimeout: (fn, ms) => { timers.push({fn, ms}); return timers.length; },
    clearTimeout: id => { if (timers[id - 1]) timers[id - 1].fn = null; },
    setInterval: () => 1,
    localStorage: box(local),
    sessionStorage: box(session),
    location,
    history: {state: null, replaceState: (state, _title, url) => {
      replaced.push(url);
      if (url === undefined) return;
      const next = new URL(url, 'https://app.example');
      Object.assign(location, {pathname: next.pathname, search: next.search, hash: next.hash});
    }},
    window: {addEventListener: () => {}},
    document: {hidden: false, addEventListener: () => {}, getElementById: () => ({parentElement: {scrollTop: 0}})},
  });
  for (const file of ['brand-config.js', 'data.js', 'ordering-hours.js', 'table.js', 'auth.js', 'content.js', 'delivery-location.js']) {
    vm.runInContext(read(`js/${file}`), context);
  }
  const app = read('js/app.js');
  vm.runInContext(app.slice(0, app.lastIndexOf('\napplyDir();')), context);
  vm.runInContext(`
    const I18N={en:{sar:'SAR',dineIn:'Dine-in'},ar:{sar:'ر.س',dineIn:'داخل المطعم'}};
    const toasts=[]; const scans=[]; let draws=0;
    toast=message=>{toasts.push(message)}; render=()=>{draws++; tableEnforce()}; renderKeepScroll=()=>{draws++; tableEnforce()};
    go=screen=>{state.screen=screen};
    validateMenuCart=async()=>true; checkOfferCartRules=()=>true; refreshTrackedCustomerOrder=async()=>{};
    const itemId='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    ITEMS=[{id:itemId,name:'Malai Boti',nameAr:'',price:35,basePrice:35,available:true,offer:null,options:[]}];
    menuConnection.status='ready';menuConnection.lastSuccess=Date.now();
    menuConnection.payload={branches:[{id:'${BRANCH}'}],schedules:[]};
    state.customer={name:'Adeel',mobile:'0500000000',email:''};
    state.cart=[{id:itemId,qty:1,price:35,basePrice:35,extras:[],size:'regular',choice:null,notes:''}];
    const scanOk=(extra={})=>({ok:true,restaurant_id:'${RESTAURANT}',branch_id:'${BRANCH}',table_label:'7',section:'Terrace',...extra});
    const created=(extra={})=>({id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',order_number:'MK001001',
      tracking_token:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',status:'pending_confirmation',total:35,
      created_at:'2026-10-06T12:00:00Z',...extra});
  `, context);
  const run = code => vm.runInContext(code, context);
  /** Answers the scan with `answer` (a value, or a function that may throw). */
  run.scanAnswers = answer => { context.__answer = answer; run(`customerOrderRpc=async(name,params)=>{scans.push({name,params});
    const a=__answer; return typeof a==='function'?a(name,params):a;}`); };
  run.timers = timers; run.replaced = replaced; run.location = location; run.clock = clock;
  run.shared = {local, session, clock};
  run.set = (name, value) => { context[name] = value; };
  run.load = file => vm.runInContext(read(file), context);
  run.flushTimers = () => { for (const timer of timers.splice(0)) if (timer.fn) timer.fn(); };
  return run;
}
/** A tab that has scanned KEY and is in table mode. */
async function atTable(extra = '') {
  const run = environment(`?t=${KEY}`);
  run.scanAnswers(run(`scanOk(${extra})`));
  run('tableBoot()');
  await run('tableSettled()');
  run('toasts.length=0; scans.length=0');
  return run;
}

/* ---- the link ---------------------------------------------------------- */

test('?t=<key> is read and taken out of the address bar; nothing else is left behind', () => {
  const run = environment(`?t=${KEY}`);
  assert.equal(run('tableTakeKeyFromUrl()'), KEY);
  assert.deepEqual(run.replaced, ['/']);
  assert.equal(run.location.search, '');
  assert.equal(run('tableTakeKeyFromUrl()'), null);   // a second read finds no table link
});

test('the other parameters stay for the push deep links (orders, go/id/c) and the hash stays', () => {
  const a = environment(`?t=${KEY}&orders=1`);
  assert.equal(a('tableTakeKeyFromUrl()'), KEY);
  assert.equal(a.location.search, '?orders=1');
  const b = environment(`?go=item&id=${OTHER}&t=${KEY}&c=${BRANCH}`);
  b.location.hash = '#x';
  assert.equal(b('tableTakeKeyFromUrl()'), KEY);
  assert.deepEqual(b.replaced, [`/?go=item&id=${OTHER}&c=${BRANCH}#x`]);
  // what pushOpenFromLink reads afterwards is untouched
  const left = new URLSearchParams(b.location.search);
  assert.deepEqual([left.get('go'), left.get('id'), left.get('c'), left.has('t')], ['item', OTHER, BRANCH, false]);
});

test('a visit without ?t= touches neither the address nor the server', async () => {
  for (const search of ['', '?orders=1', '?go=offers', '?offers=manage', '?table=7', '?tt=x']) {
    const run = environment(search);
    run.scanAnswers(() => { throw new Error('must not be called'); });
    run('state.orderType="takeaway"; tableBoot()');
    await run('tableSettled()');
    assert.deepEqual(run.replaced, [], search);
    assert.equal(run('scans.length'), 0, search);
    assert.equal(run('tableActive()'), null, search);
    assert.equal(run('state.orderType'), 'takeaway', search);
    assert.equal(run('state.screen'), 'splash', search);
    assert.equal(run('tableChip("home")'), '', search);
    assert.equal(run.timers.length, 0, search);
  }
});

test('the shape of the key is checked on the device: a damaged link never reaches the server', () => {
  for (const bad of ['', 'short', KEY + 'x', KEY.slice(0, 21) + '-', KEY.slice(0, 21) + '%3C', `${KEY}&t=other`.slice(0, 21) + ' ']) {
    const run = environment(`?t=${bad}`);
    run.scanAnswers(() => { throw new Error('must not be called'); });
    run('tableBoot()');
    assert.equal(run('scans.length'), 0, bad);
    assert.equal(run.location.search, '', bad);
    assert.equal(run('tableActive()'), null, bad);
    run.flushTimers();
    assert.deepEqual(run('JSON.stringify(toasts)'), JSON.stringify([INACTIVE]), bad);   // one friendly message
  }
});

/* ---- the scan ---------------------------------------------------------- */

test('a good scan enters table mode: remembered for this tab, dine-in, no welcome screen, one toast', async () => {
  const run = environment(`?t=${KEY}`);
  run.scanAnswers(run('scanOk()'));
  run('state.orderType="delivery"; state.orderTiming="60"; tableBoot()');
  assert.equal(run.location.search, '');                       // stripped before the answer
  assert.equal(run('state.screen'), 'home');                   // not the splash
  assert.match(run('tableChip("home")'), /table-chip-wait/);   // "Finding your table…"
  await run('tableSettled()');
  assert.equal(run('JSON.stringify(scans)'), JSON.stringify([{name: 'oracy_table_scan_v1', params: {p_key: KEY}}]));
  const saved = JSON.parse(run.shared.session.get(TABLE_STORE));
  assert.deepEqual(saved, {key: KEY, label: '7', section: 'Terrace', branchId: BRANCH, restaurantId: RESTAURANT, at: run.clock.now, guestOrders: false});
  assert.equal(run.shared.local.has(TABLE_STORE), false);      // this tab only: gone when the tab closes
  assert.equal(run('state.orderType'), 'dinein');
  assert.equal(run('state.orderTiming'), 'asap');
  assert.deepEqual(run('JSON.stringify(toasts)'), JSON.stringify(['You are ordering for Table 7']));
  assert.match(run('tableChip("home")'), /<strong>Table <bdi>7<\/bdi><\/strong>/);
});

test('a key that is switched off or unknown ({ok:false}) is an ordinary visit with one friendly message', async () => {
  const run = environment(`?t=${KEY}`);
  run.scanAnswers({ok: false});
  run('state.orderType="takeaway"; tableBoot()');
  await run('tableSettled()');
  assert.equal(run('scans.length'), 1);                        // never asked again: no loop
  assert.equal(run('tableActive()'), null);
  assert.equal(run.shared.session.has(TABLE_STORE), false);
  assert.equal(run('state.orderType'), 'takeaway');
  assert.equal(run('tableChip("home")'), '');
  assert.deepEqual(run('JSON.stringify(toasts)'), JSON.stringify([INACTIVE]));
  assert.equal(run.timers.length, 0);
});

test('a key of another restaurant, of another branch, or an answer without a label is not accepted', async () => {
  for (const extra of [`{restaurant_id:'${OTHER}'}`, `{branch_id:'${OTHER}'}`, `{branch_id:null}`, `{table_label:''}`, `{table_label:7}`, `{ok:'true'}`]) {
    const run = environment(`?t=${KEY}`);
    run.scanAnswers(run(`scanOk(${extra})`));
    run('tableBoot()');
    await run('tableSettled()');
    assert.equal(run('tableActive()'), null, extra);
    assert.equal(run.shared.session.has(TABLE_STORE), false, extra);
    assert.deepEqual(run('JSON.stringify(toasts)'), JSON.stringify([INACTIVE]), extra);
  }
});

test('a server without migration 373 (HTTP 404 / PGRST202) is an ordinary visit and shows nothing', async () => {
  const run = environment(`?t=${KEY}`);
  const calls = [];
  run('state.orderType="takeaway"');
  run.set('fetch', async (url, options) => {
    calls.push({url, options});
    return {ok: false, status: 404, json: async () => ({code: 'PGRST202', message: 'Could not find the function public.oracy_table_scan_v1(p_key) in the schema cache'})};
  });
  run('tableBoot()');
  await run('tableSettled()');
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/rest\/v1\/rpc\/oracy_table_scan_v1$/);
  assert.equal(calls[0].options.headers.Authorization, undefined);   // works without sign-in
  assert.equal(calls[0].options.body, JSON.stringify({p_key: KEY}));
  assert.equal(run('tableActive()'), null);
  assert.equal(run('toasts.length'), 0);
  assert.equal(run('state.orderType'), 'takeaway');
  assert.equal(run.timers.filter(timer => timer.fn && timer.ms !== 12000).length, 0);   // no retry
  assert.equal(run('tableChip("home")'), '');
});

test('no answer at all is tried again quietly (twice), never shown as an error', async () => {
  const run = environment(`?t=${KEY}`);
  let fail = true;
  run.scanAnswers(() => { if (fail) throw new TypeError('Failed to fetch'); return run('scanOk()'); });
  run('tableBoot()');
  await run('tableSettled()');
  assert.equal(run('toasts.length'), 0);
  assert.equal(run('tableChip("home")'), '');                  // the usual choice is back meanwhile
  assert.equal(run.timers.length, 1);
  run.flushTimers();
  await run('tableSettled()');
  assert.equal(run('scans.length'), 2);
  fail = false;
  run.flushTimers();
  await run('tableSettled()');
  assert.equal(run('scans.length'), 3);
  assert.equal(run('tableActive().label'), '7');
  // and when it never answers: three tries, then an ordinary visit
  const dead = environment(`?t=${KEY}`);
  dead.scanAnswers(() => { throw new TypeError('Failed to fetch'); });
  dead('tableBoot()');
  for (let i = 0; i < 5; i++) { await dead('tableSettled()'); dead.flushTimers(); }
  assert.equal(dead('scans.length'), 3);
  assert.equal(dead('toasts.length'), 0);
  assert.equal(dead('tableActive()'), null);
});

test('the branch is checked again once the menu has said which branch the app serves', async () => {
  const run = environment(`?t=${KEY}`);
  run('menuConnection.payload=null');                          // the menu has not loaded yet
  run.scanAnswers(run(`scanOk({branch_id:'${OTHER}'})`));
  run('tableBoot()');
  await run('tableSettled()');
  assert.equal(run('tableMode.table.branchId'), OTHER);        // cannot be judged yet
  run(`menuConnection.payload={branches:[{id:'${BRANCH}'}],schedules:[]}; toasts.length=0`);
  assert.equal(run('tableActive()'), null);                    // this app serves another branch
  assert.equal(run.shared.session.has(TABLE_STORE), false);
  run.flushTimers();
  assert.deepEqual(run('JSON.stringify(toasts)'), JSON.stringify([INACTIVE]));
});

/* ---- forced dine-in ---------------------------------------------------- */

test('dine-in stays forced after the saved cart is restored', async () => {
  const run = await atTable();
  run.shared.local.set('oracy:meerath-kabab:cart:v1', JSON.stringify({version: 1, restaurantId: RESTAURANT, branchId: '',
    orderType: 'delivery', items: [{id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', qty: 2, size: 'regular', choice: null, extras: [], spice: 'medium'}]}));
  run('state.cart=[]; restoreCartDraft()');
  assert.equal(run('state.cart.length'), 1);                   // the cart itself is restored
  assert.equal(run('state.orderType'), 'dinein');
  // the same draft without a table is restored as it was saved
  const plain = environment('');
  plain.shared.local.set('oracy:meerath-kabab:cart:v1', run.shared.local.get('oracy:meerath-kabab:cart:v1'));
  plain('state.cart=[]; restoreCartDraft()');
  assert.equal(plain('state.orderType'), 'delivery');
});

test('the pickers, a reorder, a features change and every draw keep dine-in, now', async () => {
  const run = await atTable();
  const button = '({closest:()=>null,classList:{add(){},remove(){}}})';
  run(`setHomeOrderType('delivery', ${button})`);
  assert.equal(run('state.orderType'), 'dinein');
  run(`setCheckoutOrderType('takeaway', ${button})`);
  assert.equal(run('state.orderType'), 'dinein');
  run(`state.orderHistory=[{id:'H1',orderType:'delivery',items:[{id:itemId,qty:1,price:35,basePrice:35,extras:[]}]}];
    reconcileMenuCart=()=>{}; reorderFromHistory('H1')`);
  assert.equal(run('state.orderType'), 'dinein');
  assert.equal(run('state.screen'), 'cart');
  run('state.orderType="delivery"; state.orderTiming="90"; orderingApplyFeatures(); render()');
  assert.equal(run('state.orderType'), 'dinein');
  assert.equal(run('state.orderTiming'), 'asap');
  // the real render() and the cart restore enforce it in the source too
  const app = read('js/app.js');
  assert.match(app, /function render\(\) \{\n  if \(typeof tableEnforce === "function"\) tableEnforce\(\);/);
  assert.match(app, /function setHomeOrderType\(type, button\) \{\n  if \(tableOn\(\)\) return;/);
  assert.match(app, /function setCheckoutOrderType\(type, button\) \{\n  if \(tableOn\(\)\) return;/);
});

test('the order-type choice is replaced on Home (both structures) and in the checkout; no "when" at a table', () => {
  const app = read('js/app.js');
  assert.equal(app.split('${tableChip("home") || `<div class="toggle home-order-toggle">').length, 3);   // classic + scroll
  assert.equal(app.split('<div class="toggle home-order-toggle">').length, 3);                            // and no third, unguarded one
  assert.ok(app.includes('${tableChip("checkout") || `<div class="checkout-order-types">'));
  assert.equal(app.split('<div class="checkout-order-types">').length, 2);
  // the address / pick-up card belongs to the replaced part; the times are not offered
  const from = app.indexOf('${tableChip("checkout") ||');
  const until = app.indexOf('${orderTypeOpen() && !tableChip("checkout") ? `', from);
  assert.ok(until > from);
  const replacedPart = app.slice(from, until);
  assert.ok(replacedPart.includes('checkout-location-card') && replacedPart.trimEnd().endsWith('</div>`}'));
  assert.ok(app.slice(until, until + 400).includes('checkout-time-title'));
});

/* ---- the order --------------------------------------------------------- */

test('the order goes to oracy_create_table_order_v1 with the key; dine-in, now, no address', async () => {
  const run = await atTable();
  run(`state.isLoggedIn=true; customerOrderRpc=async(name,params)=>{scans.push({name,params}); return created({table_label:'7'})}`);
  run('state.orderType="delivery"; state.orderTiming="60"');   // whatever the screen state says
  await run('createOrderAfterVerification()');
  const sent = JSON.parse(run('JSON.stringify(scans)'));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].name, 'oracy_create_table_order_v1');
  assert.deepEqual(Object.keys(sent[0].params).sort(), ['p_key', 'p_order']);   // no restaurant or branch from the device
  assert.equal(sent[0].params.p_key, KEY);
  const order = sent[0].params.p_order;
  assert.equal(order.fulfillment_type, 'dinein');
  assert.equal(order.schedule_type, 'asap');
  assert.equal(order.order_timing, 'asap');
  assert.equal(order.scheduled_for, null);
  assert.equal(order.address, '');
  assert.equal(order.delivery_address_id, null);
  assert.equal(order.expected_delivery_fee, null);
  assert.equal(order.items.length, 1);
  assert.equal(JSON.stringify(order).includes(KEY), false);    // the key is not copied into the order itself
  assert.equal(run('state.screen'), 'confirmation');
});

test('the table function needs a sign-in on the device too; the scan does not', async () => {
  const data = read('js/data.js');
  assert.match(data, /const signedInOnly = \[[^\]]*"oracy_create_table_order_v1"[^\]]*\];/);
  assert.equal(/signedInOnly = \[[^\]]*oracy_table_scan_v1/.test(data), false);
  const run = environment('');
  let fetched = 0;
  run.set('fetch', async () => { fetched++; return {ok: true, status: 200, json: async () => ({ok: false})}; });
  await assert.rejects(run(`customerOrderRpc('oracy_create_table_order_v1',{p_key:'${KEY}',p_order:{}})`), /Please sign in again to continue\./);
  assert.equal(fetched, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(await run(`customerOrderRpc('oracy_table_scan_v1',{p_key:'${KEY}'})`))), {ok: false});
  assert.equal(fetched, 1);
});

test('without a table the order goes where it always went, unchanged', async () => {
  const run = environment('');
  run(`state.isLoggedIn=true; state.orderType='takeaway'; customerOrderRpc=async(name,params)=>{scans.push({name,params}); return created()}`);
  await run('createOrderAfterVerification()');
  const sent = JSON.parse(run('JSON.stringify(scans)'));
  assert.equal(sent[0].name, 'oracy_create_customer_order_v1');
  assert.deepEqual(Object.keys(sent[0].params).sort(), ['p_branch_id', 'p_order', 'p_restaurant_id']);
  assert.equal(sent[0].params.p_order.fulfillment_type, 'takeaway');
  assert.equal(run('state.order.tableLabel'), undefined);
  assert.equal(run.shared.local.has('oracy:meerath-kabab:order-tables:v1'), false);
});

test('a table of another branch is never sent', async () => {
  const run = await atTable();
  run(`tableMode.table.branchId='${OTHER}'; menuConnection.payload=null`);   // judged only when the order is built
  const table = run('tableMode.table');
  run(`menuConnection.payload={branches:[{id:'${BRANCH}'}],schedules:[]}; customerOrderRpc=async()=>{scans.push(1)}`);
  run.set('__table', table);
  await assert.rejects(run('submitCustomerOrder({fulfillment_type:"dinein"}, __table)'), new RegExp(INACTIVE.replace(/\./g, '\\.')));
  assert.equal(run('scans.length'), 0);
});
test('the attempt id (client_order_id) changes with the table and is the old one without a table', async () => {
  const run = environment('');
  const none = run('orderAttemptId(state.cart, "")');
  assert.equal(run('orderAttemptId(state.cart, "", null)'), none);                    // no table = the key as before
  assert.equal(run('orderAttempt.key.includes("table")'), false);
  const first = run(`orderAttemptId(state.cart, "", {key:'${KEY}'})`);
  assert.notEqual(first, none);
  assert.equal(run(`orderAttemptId(state.cart, "", {key:'${KEY}'})`), first);          // a retry at the same table: same id
  assert.notEqual(run(`orderAttemptId(state.cart, "", {key:'${KEY2}'})`), first);      // the same cart at another table
  // and the id that is sent is the one made with the table
  const at = await atTable();
  at(`state.isLoggedIn=true; customerOrderRpc=async(name,params)=>{scans.push(params.p_order.client_order_id); throw new Error('The connection is slow. Please try again.')}`);
  await at('createOrderAfterVerification()');
  assert.equal(at('JSON.stringify(orderAttempt.key).includes("' + KEY + '")'), true);
  await at('createOrderAfterVerification()');
  assert.equal(at('scans.length'), 2);
  assert.equal(at('scans[0]'), at('scans[1]'));                                       // a retry does not make a second order
  assert.equal(at('state.orderSubmitting'), false);
});

test('an order waits for a scan that is still on its way', async () => {
  const run = environment(`?t=${KEY}`);
  let answer;
  run.scanAnswers((name) => name === 'oracy_table_scan_v1' ? new Promise(resolve => { answer = resolve; }) : run('created({table_label:"7"})'));
  run('state.isLoggedIn=true; tableBoot()');
  const placing = run('createOrderAfterVerification()');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(run('scans.length'), 1);                        // only the scan so far
  answer(run('scanOk()'));
  await placing;
  assert.deepEqual(JSON.parse(run('JSON.stringify(scans.map(s=>s.name))')), ['oracy_table_scan_v1', 'oracy_create_table_order_v1']);
});

test('the server refusing the key ends table mode, keeps the cart and says so (Arabic too)', async () => {
  for (const lang of ['en', 'ar']) {
    const run = await atTable();
    run(`state.lang='${lang}'; state.isLoggedIn=true; state.screen='checkout';
      customerOrderRpc=async()=>{ throw new Error('${INACTIVE}') }`);
    await run('createOrderAfterVerification()');
    assert.equal(run('tableActive()'), null);
    assert.equal(run.shared.session.has(TABLE_STORE), false);
    assert.equal(run('state.cart.length'), 1);
    assert.equal(run('state.order'), null);
    assert.equal(run('state.screen'), 'checkout');
    assert.equal(run('state.orderSubmitting'), false);
    assert.equal(run('tableChip("checkout")'), '');            // the usual choice is back
    run.flushTimers();
    assert.deepEqual(run('JSON.stringify(toasts)'), JSON.stringify([run(`TABLE_TEXT['${lang}'].inactive`)]));
    assert.equal(run('state.couponOn'), false);                // not mistaken for a voucher problem
  }
  // the words are not caught by the voucher ("code") or points handling
  assert.equal(/\bcode\b/i.test(INACTIVE) || /points/i.test(INACTIVE), false);
});

test('"Dine-in · Table 7" is kept with the order and survives a reload; table mode stays for the next order', async () => {
  const run = await atTable();
  run(`state.isLoggedIn=true; customerOrderRpc=async()=>created({table_label:'7'})`);
  await run('createOrderAfterVerification()');
  assert.equal(run('state.order.tableLabel'), '7');
  assert.equal(run('state.order.orderType'), 'dinein');
  assert.equal(run('orderTableSuffix(state.order)'), '<span class="table-order-name">&nbsp;· Table <bdi>7</bdi></span>');
  assert.equal(run('tableActive().label'), '7');               // people order again at the same table
  assert.equal(JSON.parse(run.shared.local.get('oracy:meerath-kabab:active-customer-order:v1')).tableLabel, '7');
  // a reload of the tab
  const again = environment('', run.shared);
  again('restoreTrackedCustomerOrder(); tableBoot()');
  assert.equal(again('orderTableSuffix(state.order)'), '<span class="table-order-name">&nbsp;· Table <bdi>7</bdi></span>');
  // the signed-in Orders screen knows an order only by its id
  assert.equal(again(`tableOrderSuffix('cccccccc-cccc-4ccc-8ccc-cccccccccccc')`), '<span class="table-order-name">&nbsp;· Table <bdi>7</bdi></span>');
  assert.equal(again(`tableOrderSuffix('${OTHER}')`), '');
  again.clock.now += 25 * HOUR;
  assert.equal(again(`tableOrderSuffix('cccccccc-cccc-4ccc-8ccc-cccccccccccc')`), '');   // forgotten after a day
  for (const [file, marker] of [['js/account-orders.js', "tableOrderSuffix(order.id)"], ['js/app.js', '${t(typeKey)}${orderTableSuffix(o)}']]) {
    assert.equal(read(file).split(marker).length, 3, file);    // two cards each
  }
});

/* ---- staying and leaving ----------------------------------------------- */

test('a reload in the same tab stays at the table without asking the server or greeting again', async () => {
  const first = await atTable();
  const run = environment('', first.shared);
  run.scanAnswers(() => { throw new Error('must not be called'); });
  run('state.orderType="takeaway"; tableBoot()');
  assert.equal(run('scans.length'), 0);
  assert.equal(run('toasts.length'), 0);
  assert.equal(run('tableActive().key'), KEY);
  assert.equal(run('state.orderType'), 'dinein');
  assert.equal(run('state.screen'), 'home');
  // a new tab (new session storage) is an ordinary visit
  const other = environment('', {local: first.shared.local, clock: first.shared.clock});
  other('tableBoot()');
  assert.equal(other('tableActive()'), null);
});

test('the table is forgotten after 6 hours, also while the app stays open', async () => {
  const run = await atTable();
  run.clock.now += 6 * HOUR - 1000;
  assert.equal(run('tableActive().label'), '7');
  run.clock.now += 1000;
  assert.equal(run('tableActive()'), null);
  assert.equal(run.shared.session.has(TABLE_STORE), false);
  assert.equal(run('tableChip("home")'), '');
  run('state.orderType="takeaway"; render()');
  assert.equal(run('state.orderType'), 'takeaway');            // no longer forced
  assert.equal(run('toasts.length'), 0);
  // and a remembered table that is too old is not restored after a reload
  const old = await atTable();
  old.clock.now += 7 * HOUR;
  const reloaded = environment('', old.shared);
  reloaded('tableBoot()');
  assert.equal(reloaded('tableActive()'), null);
  assert.equal(reloaded('state.screen'), 'splash');
});

test('"Not at this table?" asks first; Stay keeps the table, Leave goes back to an ordinary visit', async () => {
  const run = await atTable();
  assert.match(run('tableChip("home")'), /onclick="tableAskLeave\(\)">Not at this table\?<\/button>/);
  run('tableAskLeave()');
  const ask = run('tableChip("checkout")');
  assert.match(ask, /Leave Table <bdi>7<\/bdi>\?/);
  assert.match(ask, /onclick="tableStay\(\)">Stay<\/button>/);
  assert.match(ask, /onclick="tableLeave\(\)">Leave table<\/button>/);
  assert.equal(run('tableActive().label'), '7');               // asking changes nothing
  run('tableStay()');
  assert.match(run('tableChip("home")'), /Not at this table\?/);
  run('tableAskLeave(); tableLeave()');
  assert.equal(run('tableActive()'), null);
  assert.equal(run.shared.session.has(TABLE_STORE), false);
  assert.equal(run('tableChip("home")'), '');
  assert.equal(run('tableMode.confirming'), false);
  run(`try { setHomeOrderType('takeaway', {closest:()=>null,classList:{add(){},remove(){}}}) } catch (_) { /* no page here */ }`);
  assert.equal(run('state.orderType'), 'takeaway');            // the choice works again
  for (const name of ['tableAskLeave', 'tableStay', 'tableLeave']) assert.equal(run(`typeof window.${name}`), 'function');
});

test('a new scan replaces the remembered table; a bad new scan leaves no table at all', async () => {
  const first = await atTable();
  const run = environment(`?t=${KEY2}`, first.shared);
  let answer;
  run.scanAnswers(() => new Promise(resolve => { answer = resolve; }));
  run('tableBoot()');
  assert.equal(run('tableMode.table'), null);                  // the old table is dropped at once
  answer(run(`scanOk({table_label:'12',section:''})`));
  await run('tableSettled()');
  assert.equal(run('tableActive().key'), KEY2);
  assert.equal(run('tableActive().label'), '12');
  assert.equal(JSON.parse(run.shared.session.get(TABLE_STORE)).key, KEY2);
  const bad = environment(`?t=${KEY}`, run.shared);
  bad.scanAnswers({ok: false});
  bad('tableBoot()');
  await bad('tableSettled()');
  assert.equal(bad('tableActive()'), null);
  assert.equal(bad.shared.session.has(TABLE_STORE), false);
  // scanning the same table again keeps it through a moment without signal
  const same = await atTable();
  const rescan = environment(`?t=${KEY}`, same.shared);
  rescan.scanAnswers(() => { throw new TypeError('Failed to fetch'); });
  rescan('tableBoot()');
  await rescan('tableSettled()');
  assert.equal(rescan('tableActive().key'), KEY);
});

test('a scan while "add more items" is in progress leaves that flow and the cart alone', async () => {
  const run = environment(`?t=${KEY}`);
  run.load('js/order-addons.js');
  run(`state.addonFor={id:'${OTHER}',number:'MK001000',token:null,restaurant:'${RESTAURANT}',clientId:'x',clientKey:'k'};
    addonRemember(); state.screen='cart'`);
  const before = run('JSON.stringify([state.addonFor, state.cart, state.screen])');
  run.scanAnswers(run('scanOk()'));
  run('tableBoot()');
  await run('tableSettled()');
  assert.equal(run('JSON.stringify([state.addonFor, state.cart, state.screen])'), before);
  assert.equal(run('addonTarget().number'), 'MK001000');
  assert.equal(run.shared.session.get('oracy_addon_for'), JSON.stringify(run('state.addonFor')));
  assert.equal(run('draws'), 0);                               // the cart screen is not redrawn under the customer
  // and the add-on request itself never carries a table key
  assert.equal(read('js/order-addons.js').includes('table'), false);
});

/* ---- words and safety -------------------------------------------------- */

test('every new English string has Arabic; the refusal is the contract\'s wording', () => {
  const run = environment('');
  const text = JSON.parse(run('JSON.stringify(TABLE_TEXT)'));
  assert.deepEqual(Object.keys(text.ar).sort(), Object.keys(text.en).sort());
  assert.ok(Object.keys(text.en).length >= 10);
  for (const key of Object.keys(text.en)) {
    assert.ok(text.en[key].trim().length > 0, key);
    assert.match(text.ar[key], /[؀-ۿ]/, key);
    assert.notEqual(text.ar[key], text.en[key], key);
    assert.deepEqual((text.ar[key].match(/\{\w+\}/g) || []).sort(), (text.en[key].match(/\{\w+\}/g) || []).sort(), key);
    // the server's own messages must not look like a voucher / points problem to the checkout
    if (['inactive', 'guestSignIn', 'busy', 'nameNeeded'].includes(key)) assert.equal(/\bcode\b|points/i.test(text.en[key]), false, key);
  }
  assert.equal(text.en.inactive, INACTIVE);
  assert.equal(run('TABLE_INACTIVE_EN'), INACTIVE);
  run('state.lang="ar"');
  assert.equal(run('tableText("ordering",{label:"7"})'), 'أنت تطلب لطاولة 7');
  assert.equal(run('tableText("inactive")'), text.ar.inactive);
  // no English left in the table source outside TABLE_TEXT: every drawn string goes through tableText / t
  const source = read('js/table.js');
  const markup = source.slice(source.indexOf('function tableChipMarkup'), source.indexOf('/* Which table an order'));
  assert.equal(/>\s*[A-Z][a-z]+[^<$]*</.test(markup), false);
});

test('Arabic draws the same card with the label kept in its own direction', async () => {
  const run = await atTable();
  run('state.lang="ar"');
  const chip = run('tableChip("checkout")');
  assert.match(chip, /<strong>طاولة <bdi>7<\/bdi><\/strong>/);
  assert.match(chip, /داخل المطعم · <bdi>Terrace<\/bdi>/);
  assert.match(chip, /سنحضر طلبك إلى هذه الطاولة\./);
  assert.match(chip, />لست على هذه الطاولة؟<\/button>/);
  assert.equal(run('tableOrderSuffix(null, "7")'), '<span class="table-order-name">&nbsp;· طاولة <bdi>7</bdi></span>');
  // layout uses logical properties only, so right-to-left mirrors by itself
  const css = read('css/table.css');
  assert.equal(/margin-(left|right)|padding-(left|right)|text-align:\s*(left|right)|\b(left|right):/.test(css), false);
});

test('the label and the section come from the server and are escaped wherever they are drawn', async () => {
  const run = await atTable(`{table_label:'<img src=x>',section:'"><script>alert(1)</script>'}`);
  for (const markup of [run('tableChip("home")'), run('tableChip("checkout")'), (run('tableAskLeave()'), run('tableChip("home")')),
    run('tableOrderSuffix(null, tableMode.table.label)')]) {
    assert.equal(/<img|<script/i.test(markup), false, markup);
    assert.ok(markup.includes('&lt;img src=x&gt;'), markup);
  }
  // text that would be special to String.replace is drawn as it is; control characters are dropped; length is capped
  const odd = await atTable(`{table_label:'$&$1 \\u0001\\n9',section:'x'.repeat(90)}`);
  assert.equal(odd('tableMode.table.label'), '$&$1   9');
  assert.ok(odd('tableChip("home")').includes('<bdi>$&amp;$1   9</bdi>'));
  assert.equal(odd('tableMode.table.section.length'), 40);
  assert.equal((await atTable(`{table_label:'ABCDEFGHIJKLMNOP'}`))('tableMode.table.label'), 'ABCDEFGHIJKL');
  // what the device stored is not trusted either
  const tampered = environment('');
  tampered.shared.session.set(TABLE_STORE, JSON.stringify({key: KEY, label: '<b>7</b>', section: '<i>', branchId: BRANCH, restaurantId: RESTAURANT, at: tampered.clock.now}));
  tampered('tableBoot()');
  assert.equal(/<b>|<i>/.test(tampered('tableChip("home")')), false);
  for (const broken of ['{', 'null', '[]', JSON.stringify({key: 'short', label: '7', branchId: BRANCH, restaurantId: RESTAURANT, at: 1}),
    JSON.stringify({key: KEY, label: '7', branchId: BRANCH, restaurantId: OTHER, at: tampered.clock.now}),
    JSON.stringify({key: KEY, label: '7', branchId: 'x', restaurantId: RESTAURANT, at: tampered.clock.now}),
    JSON.stringify({key: KEY, label: '7', branchId: BRANCH, restaurantId: RESTAURANT, at: 'now'})]) {
    const run2 = environment('');
    run2.shared.session.set(TABLE_STORE, broken);
    run2('tableBoot()');
    assert.equal(run2('tableActive()'), null, broken);
  }
});

/* ---- wiring ------------------------------------------------------------ */

test('table.js is loaded before app.js, started before the first draw, and the changed files have new cache keys', () => {
  const html = read('index.html'), app = read('js/app.js');
  const scripts = [...html.matchAll(/<script src="([^"?]+)\?v=([^"]+)"/g)].map(m => m[1]);
  assert.ok(scripts.indexOf('js/table.js') > scripts.indexOf('js/ordering-hours.js'));
  assert.ok(scripts.indexOf('js/table.js') > scripts.indexOf('js/data.js'));
  assert.ok(scripts.indexOf('js/table.js') < scripts.indexOf('js/app.js'));
  assert.ok(html.includes('js/account-orders.js?v=20261006-b1"'));
  for (const file of ['js/table.js', 'js/app.js', 'js/data.js', 'css/table.css', 'js/brand-config.js', 'js/ordering-hours.js']) {
    assert.ok(html.includes(`${file}?v=20261007-b1g"`), file);   // Batch B1g (guest orders, table layout, closed texts)
  }
  const sheets = [...html.matchAll(/<link rel="stylesheet" href="([^"?]+)\?v=/g)].map(m => m[1]);
  assert.ok(sheets.includes('css/table.css'));
  assert.equal(sheets.at(-1), 'css/theme.css');                // the theme layer stays last
  // untouched files keep their keys
  for (const pin of ['js/push.js?v=20261004-pc1', 'js/order-addons.js?v=20261003-batche',
    'js/i18n.js?v=20261006-cx4f', 'css/theme.css?v=20261006-cx4i', 'js/theme.js?v=20261006-cx4c']) assert.ok(html.includes(pin + '"'), pin);
  const start = app.slice(app.lastIndexOf('\napplyDir();'));
  const boot = start.indexOf('tableBoot()'), draw = start.indexOf('\nrender();');
  assert.ok(boot > 0 && boot < draw);
  assert.ok(boot > start.indexOf('appStorageKey("welcomed")'));   // after the welcome decision, so the table wins
  assert.ok(boot > start.indexOf('history.state.oracy'));
  // every use of table.js from the other files is guarded, so they still work without it
  for (const file of ['js/app.js', 'js/data.js', 'js/account-orders.js']) {
    const source = read(file);
    for (const m of source.matchAll(/\b(tableEnforce|tableSettled|tableRefused|tableRecheck|tableBoot|tableOrderSuffix|tableActive|tableChipMarkup)\(/g)) {
      const line = source.slice(source.lastIndexOf('\n', m.index) + 1, source.indexOf('\n', m.index));
      assert.match(line, /typeof table\w+ === ["']function["']/, `${file}: ${line.trim()}`);
    }
  }
  assert.equal(read('js/push.js').includes('table'), false);    // the push link reader is untouched
});
