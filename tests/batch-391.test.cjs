// Batch 391: the guest's name may be "hidden" (not asked at all), and the order's cards follow an order
// that staff moved to another table. Built to API-391-CONTRACT.md (as built, parts A and E).
// Run: node --test tests/batch-391.test.cjs. No network.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const KEY = 'Ab3dEf6hIj9kLm2nOp5qRs';
const KEY2 = 'Zy8xWv7uTs6rQp5oNm4lKj';
const RESTAURANT = '11111111-1111-1111-1111-111111111111';
const BRANCH = '22222222-2222-2222-2222-222222222222';
const ORDER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CALL = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const TABLE_STORE = 'oracy:meerath-kabab:table:v1';
const NOTES_STORE = 'oracy:meerath-kabab:order-notes:v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const INACTIVE = 'This table QR is not active. Please ask our staff.';
const OFF = 'Calling staff is not available here. Please ask our staff.';
const TOLD = 'Our staff have been told. Please wait a moment.';
const WRITE = 'Please write what you need.';
const MIN = 60 * 1000;

/** One tab with a small page: enough of a document for the sheet and the counter. */
function environment(search = '', options = {}) {
  const local = options.local || new Map();
  const session = options.session || new Map();
  const clock = options.clock || {now: Date.parse('2026-10-07T12:00:00Z')};
  class TestDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock.now])); }
    static now() { return clock.now; }
  }
  const box = map => ({getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key)});
  const location = {pathname: '/', search, hash: ''};
  const timers = [];
  const page = {hidden: false, listeners: {}, nodes: new Map(), buzz: 0, focus: null};
  const node = id => ({id, attrs: {}, innerHTML: '', hidden: false, textContent: '', value: '',
    classList: {set: new Set(), toggle(name, on) { on ? this.set.add(name) : this.set.delete(name); }, remove(name) { this.set.delete(name); }, add(name) { this.set.add(name); }},
    setAttribute(name, value) { this.attrs[name] = value; }, removeAttribute(name) { delete this.attrs[name]; },
    focus() { page.focus = id; }, remove() { page.nodes.delete(this.id); }, scrollIntoView() {}});
  let uuid = 0;
  const document = {
    get hidden() { return page.hidden; }, documentElement: {dataset: {}}, activeElement: null, body: null,
    addEventListener: (name, fn) => { (page.listeners[name] ||= []).push(fn); },
    createElement: () => node(''),
    getElementById: id => page.nodes.get(id) || (id === 'app' ? {parentElement: {scrollTop: 0}} : null),
    querySelector: selector => selector === '.phone' ? {appendChild: child => { page.nodes.set(child.id, child); }} : null,
    querySelectorAll: () => [],
  };
  const context = vm.createContext({
    console, URL, URLSearchParams, Intl, Date: TestDate, AbortController, Promise,
    crypto: {randomUUID: () => `aaaaaaaa-aaaa-4aaa-8aaa-${String(++uuid + (options.uuidBase || 0)).padStart(12, '0')}`},
    setTimeout: (fn, ms) => { timers.push({fn, ms}); return timers.length; },
    clearTimeout: id => { if (timers[id - 1]) timers[id - 1].fn = null; },
    setInterval: () => 1,
    navigator: {vibrate: () => { page.buzz++; return true; }},
    localStorage: box(local), sessionStorage: box(session), location,
    history: {state: null, replaceState: (state, _title, url) => {
      if (url === undefined) return;
      const next = new URL(url, 'https://app.example');
      Object.assign(location, {pathname: next.pathname, search: next.search, hash: next.hash});
    }},
    window: {addEventListener: (name, fn) => { (page.listeners['window:' + name] ||= []).push(fn); }},
    document,
  });
  for (const file of ['brand-config.js', 'data.js', 'ordering-hours.js', 'table.js', 'table-calls.js', 'order-note.js', 'auth.js', 'content.js', 'delivery-location.js', 'rewards.js', 'push.js']) {
    vm.runInContext(read(`js/${file}`), context);
  }
  const app = read('js/app.js');
  vm.runInContext(app.slice(0, app.lastIndexOf('\napplyDir();')), context);
  vm.runInContext(`
    const I18N={en:{sar:'SAR',dineIn:'Dine-in',cookingNotes:'Cooking instructions',signInRequired:'Please sign in to place your order.'},
      ar:{sar:'ر.س',dineIn:'داخل المطعم',cookingNotes:'ملاحظات الطبخ'}};
    const toasts=[]; const calls=[]; let draws=0; const realCustomerOrderRpc=customerOrderRpc;
    toast=message=>{toasts.push(message)}; render=()=>{draws++; tableEnforce()}; renderKeepScroll=()=>{draws++; tableEnforce()};
    go=screen=>{state.screen=screen};
    validateMenuCart=async()=>true; checkOfferCartRules=()=>true; refreshTrackedCustomerOrder=async()=>{};
    const itemId='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    ITEMS=[{id:itemId,name:'Malai Boti',nameAr:'',price:35,basePrice:35,available:true,offer:null,options:[]}];
    menuConnection.status='ready';menuConnection.lastSuccess=Date.now();
    menuConnection.payload={branches:[{id:'${BRANCH}'}],schedules:[]};
    state.customer={name:'Adeel',mobile:'0500000000',email:''};
    state.cart=[{id:itemId,qty:2,price:35,basePrice:35,extras:[],size:'regular',choice:null,notes:''}];
    const scanOk=(extra={})=>({ok:true,restaurant_id:'${RESTAURANT}',branch_id:'${BRANCH}',table_label:'7',section:'Terrace',guest_orders:true,service_calls:true,...extra});
    const created=(extra={})=>({id:'${ORDER}',order_number:'MK001042',tracking_token:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      status:'pending_confirmation',total:70,created_at:'2026-10-07T12:00:00Z',...extra});
    const aCall=(extra={})=>({id:'${CALL}',kind:'waiter',status:'open',created_at:new Date(Date.now()).toISOString(),seen_at:null,done_at:null,rings:1,mine:true,...extra});
  `, context);
  const run = code => vm.runInContext(code, context);
  /** answers(fn): every server call goes to fn(name, params); it may return, or throw to refuse. */
  run.answers = answer => { context.__answer = answer; run(`customerOrderRpc=async(name,params)=>{calls.push({name,params});
    const a=__answer; return typeof a==='function'?a(name,params):a;}`); };
  run.set = (name, value) => { context[name] = value; };
  run.load = file => vm.runInContext(read(file), context);
  run.timers = timers; run.clock = clock; run.page = page; run.local = local; run.session = session;
  run.shared = {local, session, clock};
  run.flushTimers = () => { for (const timer of timers.splice(0)) if (timer.fn) timer.fn(); };
  run.pending = () => timers.filter(timer => timer.fn);
  run.sent = pattern => JSON.parse(run('JSON.stringify(calls)')).filter(call => pattern.test(call.name));
  run.toasts = () => JSON.parse(run('JSON.stringify(toasts)'));
  run.sheet = () => page.nodes.get('tableCallSheet') || null;
  run.settle = async () => { for (let i = 0; i < 6; i++) await new Promise(resolve => setImmediate(resolve)); };
  return run;
}
const refuse = (message, extra = {}) => Object.assign(new Error(message), extra);
const missing = () => refuse('Order service is unavailable. Please try again.', {status: 404, code: 'PGRST202'});
/** A tab at the table. server(name, params) answers everything except the scan. */
async function atTable(extra = '', server = null, options = {}) {
  const run = environment(`?t=${KEY}`, options);
  run.server = server || (name => name === 'oracy_table_calls_status_v1' ? {ok: true, calls: []} : run('created()'));
  run.answers((name, params) => name === 'oracy_table_scan_v1' ? run(`scanOk(${extra})`) : run.server(name, params));
  run('tableBoot()');
  await run('tableSettled()');
  await run.settle();
  run('toasts.length=0; calls.length=0; draws=0');
  return run;
}



const PHONE = 'Please enter a valid mobile number.';
const NAME = 'Please enter your name to order.';
const TOKEN = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const guestOrder = run => run.sent(/oracy_create_table_guest_order_v1/);
const tracked = (extra = '') => `state.order={id:'MK001042',backendId:'${ORDER}',trackingToken:'${TOKEN}',status:'preparing',orderType:'dinein',
  tableLabel:'7',items:[{id:itemId,qty:2}],customer:{name:'',mobile:'',email:''}${extra}};`;

/* ======================= A. the name of a guest: hidden ======================= */

test('the scan may say the name is hidden; an unknown future value is the mild one (optional); no value at all is as before 388', async () => {
  const cases = [[`{guest_name_mode:'hidden'}`, 'hidden'], [`{guest_name_mode:'optional'}`, 'optional'], [`{guest_name_mode:'required'}`, 'required'],
    [`{guest_name_mode:'something-new'}`, 'optional'], [`{guest_name_mode:'HIDDEN'}`, 'optional'], [`{guest_name_mode:42}`, 'optional'], [`{guest_name_mode:''}`, 'optional'],
    [`{guest_name_mode:undefined}`, 'required'], [`{guest_name_mode:null}`, 'required'], ['', 'required']];
  for (const [extra, mode] of cases) {
    const run = await atTable(extra);
    assert.equal(run('tableGuestNameMode()'), mode, extra);
    assert.equal(JSON.parse(run.session.get(TABLE_STORE)).guestNameMode, mode, extra);
  }
  // remembered over a reload; a table remembered before 388 stays "needed"
  const first = await atTable(`{guest_name_mode:'hidden'}`);
  const again = environment('', first.shared);
  again('tableBoot()');
  assert.equal(again('tableGuestNameMode()'), 'hidden');
  const old = environment('');
  old.session.set(TABLE_STORE, JSON.stringify({key: KEY, label: '7', section: '', branchId: BRANCH, restaurantId: RESTAURANT, at: old.clock.now, guestOrders: true}));
  old('tableBoot()');
  assert.equal(old('tableGuestNameMode()'), 'required');
});

test('name hidden and no number asked: the guest card is its title and one line — nothing to fill in', async () => {
  const run = await atTable(`{guest_name_mode:'hidden', guest_phone_mode:'hidden'}`);
  const html = run('checkoutCustomerMarkup()');
  assert.match(html, /table-who-guest on[\s\S]*<strong>Order as guest<\/strong><small>No sign-in needed\. Quick and easy\.<\/small><\/span>\s*<\/button>\s*<\/div>/);
  assert.equal(/<input|tableGuestName|tableGuestPhone|table-who-body|table-guest-hint/.test(html.slice(0, html.indexOf('table-who-signin'))), false);
  assert.match(html, /table-who-signin/);                         // the sign-in way is still offered beside it
  run('state.lang="ar"');
  assert.match(run('checkoutCustomerMarkup()'), /<strong>اطلب كضيف<\/strong><small>بدون تسجيل دخول\. سريع وسهل\.<\/small>/);
});

test('name hidden: Place Order goes at once; the name is sent as an empty text, also when the device remembers one', async () => {
  const run = await atTable(`{guest_name_mode:'hidden', guest_phone_mode:'hidden'}`, null, {local: new Map([['oracy:meerath-kabab:guest-name:v1', 'Adeel']])});
  run(`state.screen='checkout'`);
  await run('placeOrder()');
  const sent = guestOrder(run);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].params.p_order.customer_name, '');          // the key is there, empty; the server saves "Guest"
  assert.equal(JSON.stringify(sent[0].params.p_order).includes('Adeel'), false);
  assert.equal('guest_phone' in sent[0].params.p_order, false);
  assert.match(sent[0].params.p_order.guest_id, UUID);
  assert.equal(run('state.screen'), 'confirmation');
  assert.equal(run('state.order.customer.name'), '');
  assert.equal(run.local.get('oracy:meerath-kabab:guest-name:v1'), 'Adeel');   // what was remembered is left alone
  assert.deepEqual(run.toasts(), []);
});

test('name hidden + number optional or required: only the number field, and the card says what is asked', async () => {
  const optional = await atTable(`{guest_name_mode:'hidden', guest_phone_mode:'optional'}`);
  let html = optional('checkoutCustomerMarkup()');
  assert.equal(html.includes('tableGuestName'), false);
  assert.match(html, /<div class="table-who-body">\s*<input class="field table-guest-name table-guest-phone table-guest-only" id="tableGuestPhone" type="tel"/);
  assert.match(html, /placeholder="Mobile number \(optional\)"/);
  assert.match(html, /<small>No sign-in needed\. Quick and easy\.<\/small>/);
  assert.equal(html.split('<input').length, 2);                    // one field in the whole chooser
  optional(`state.screen='checkout'`);
  await optional('placeOrder()');
  assert.deepEqual([guestOrder(optional)[0].params.p_order.customer_name, 'guest_phone' in guestOrder(optional)[0].params.p_order], ['', false]);

  const required = await atTable(`{guest_name_mode:'hidden', guest_phone_mode:'required'}`);
  html = required('checkoutCustomerMarkup()');
  assert.equal(html.includes('tableGuestName'), false);
  assert.match(html, /placeholder="Mobile number" aria-label="Mobile number"/);
  assert.match(html, /<small>Just your mobile number\. Quick and easy\.<\/small>/);
  required(`state.screen='checkout'`);
  await required('placeOrder()');
  assert.equal(guestOrder(required).length, 0);
  assert.equal(required('tableGuest.phoneError'), PHONE);
  assert.equal(required('tableGuest.error'), '');
  required(`tableGuestPhoneInput('0501234567')`);
  await required('placeOrder()');
  const order = guestOrder(required)[0].params.p_order;
  assert.deepEqual([order.customer_name, order.guest_phone], ['', '0501234567']);
  // with a name asked the number field keeps its place under it (no "only" look)
  const both = await atTable(`{guest_name_mode:'optional', guest_phone_mode:'optional'}`);
  assert.equal(both('checkoutCustomerMarkup()').includes('table-guest-only'), false);
});

test('an old "hidden" in memory: the server asking for the name makes the field appear and needed; a reload takes "hidden" over', async () => {
  const run = await atTable(`{guest_name_mode:'hidden'}`, name => { if (/guest_order/.test(name)) throw refuse(NAME, {status: 400, code: 'P0001'}); return {ok: true, calls: []}; });
  run(`state.screen='checkout'`);
  await run('placeOrder()');
  run.flushTimers();
  assert.equal(guestOrder(run).length, 1);                         // the device did not stop it: the server decided
  assert.equal(run('tableGuestNameMode()'), 'required');
  assert.equal(run('tableGuest.error'), NAME);
  assert.match(run('checkoutCustomerMarkup()'), /id="tableGuestName"[\s\S]*role="alert">Please enter your name to order\.<\/p>/);
  // the other way round: remembered "required", the restaurant now hides the name
  const first = await atTable(`{guest_name_mode:'required'}`);
  const again = environment('', first.shared);
  again.answers(name => name === 'oracy_table_scan_v1' ? again(`scanOk({guest_name_mode:'hidden'})`) : /status/.test(name) ? {ok: true, calls: []} : again('created()'));
  again('state.screen="checkout"; tableBoot()');
  again.flushTimers(); await again.settle();
  assert.equal(again('tableGuestNameMode()'), 'hidden');
  await again('placeOrder()');
  assert.equal(guestOrder(again).length, 1);
});

/* ======================= E. an order moved to another table ======================= */

test('after a good tracking answer the app asks where the order is now: oracy_track_order_table_v1(order id, tracking secret)', async () => {
  const run = await atTable('', name => name === 'oracy_track_order_table_v1' ? {ok: true, table_label: '7', section: 'Terrace'} : {ok: true, calls: []});
  run(tracked());
  await run('tableFollowOrder(state.order)');
  const asked = run.sent(/oracy_track_order_table_v1/);
  assert.equal(asked.length, 1);
  assert.deepEqual(asked[0].params, {p_order_id: ORDER, p_tracking_token: TOKEN});   // no table key: the phone's key is the OLD table's
  assert.equal(run('state.order.tableLabel'), '7');                // the same table: nothing changes, nothing is said
  assert.equal(run('state.order.tableMoved'), undefined);
  assert.deepEqual(run.toasts(), []);
  // it rides on the tracking refresh that already runs — no timer of its own
  const data = read('js/data.js');
  assert.match(data, /saveTrackedCustomerOrder\(\);\n\s*\/\/ Batch 391:[^\n]*\n\s*if \(typeof tableFollowOrder === "function"\) tableFollowOrder\(order\);/);
  const follow = read('js/table.js'); const part = follow.slice(follow.indexOf('async function tableFollowOrder'), follow.indexOf('function tableSameAsOrder'));
  assert.equal(/setTimeout|setInterval/.test(part), false);
  assert.equal(/signedInOnly = \[[^\]]*track_order_table/.test(data), false);   // a visitor may ask
});

test('moved: the order\'s chip, the tracking card and the saved order show the NEW table, and the guest is told once', async () => {
  for (const [lang, said] of [['en', 'Your order is now at Table 9'], ['ar', 'طلبك الآن على طاولة 9']]) {
    const run = await atTable('', name => name === 'oracy_track_order_table_v1' ? {ok: true, table_label: '9', section: 'Hall'} : {ok: true, calls: []});
    run(`state.lang='${lang}'; state.screen='track'; ${tracked()} draws=0`);
    await run('tableFollowOrder(state.order)');
    assert.equal(run('state.order.tableLabel'), '9');
    assert.equal(run('state.order.tableMoved'), true);
    assert.deepEqual(run.toasts(), [said]);
    assert.equal(run('draws'), 1);                                 // the card on the screen is drawn again
    assert.ok(run('orderTableSuffix(state.order)').includes(lang === 'ar' ? 'طاولة <bdi>9</bdi>' : 'Table <bdi>9</bdi>'));
    assert.equal(run(`tableOrderSuffix('${ORDER}')`), run('orderTableSuffix(state.order)'));   // by id too (signed-in Orders list)
    const map = JSON.parse(run.local.get('oracy:meerath-kabab:order-tables:v1'));
    assert.deepEqual([map[0].id, map[0].label, map[0].moved], [ORDER, '9', true]);
    run.clock.now += 25000;
    await run('tableFollowOrder(state.order)');                    // asked again later, still at 9: not said twice
    assert.deepEqual(run.toasts(), [said]);
  }
  // kept over a reload with the tracked order
  const run = await atTable('', name => name === 'oracy_track_order_table_v1' ? {ok: true, table_label: '9', section: ''} : {ok: true, calls: []});
  run.load('js/order-addons.js');
  run(`${tracked()} saveTrackedCustomerOrder()`);
  await run('tableFollowOrder(state.order)');
  const again = environment('', run.shared);
  again('restoreTrackedCustomerOrder(); tableBoot()');
  assert.equal(again('state.order.tableLabel'), '9');
  assert.equal(again('state.order.tableMoved'), true);
});

test('{ok:false}, an empty answer or a database without the function: the table saved with the order stays, nothing is said', async () => {
  for (const answer of [{ok: false}, {ok: true}, {ok: true, table_label: ''}, {ok: true, table_label: 7}, {ok: 'true', table_label: '9'}, null, 'x']) {
    const run = await atTable('', name => name === 'oracy_track_order_table_v1' ? answer : {ok: true, calls: []});
    run(tracked());
    await run('tableFollowOrder(state.order)');
    assert.equal(run('state.order.tableLabel'), '7', JSON.stringify(answer));
    assert.equal(run('state.order.tableMoved'), undefined, JSON.stringify(answer));
    assert.deepEqual(run.toasts(), [], JSON.stringify(answer));
  }
  // 404 / PGRST202 (no 391 on the server): asked once, then never again on this page
  const run = await atTable('', name => { if (name === 'oracy_track_order_table_v1') throw missing(); return {ok: true, calls: []}; });
  run(tracked());
  await run('tableFollowOrder(state.order)');
  run.clock.now += 5 * 60 * 1000;
  await run('tableFollowOrder(state.order)');
  assert.equal(run.sent(/oracy_track_order_table_v1/).length, 1);
  assert.equal(run('state.order.tableLabel'), '7');
  assert.deepEqual(run.toasts(), []);
  // a lost connection is only a missed read: asked again next time
  const weak = await atTable('', name => { if (name === 'oracy_track_order_table_v1') throw refuse('Failed to fetch'); return {ok: true, calls: []}; });
  weak(tracked());
  await weak('tableFollowOrder(state.order)');
  weak.clock.now += 21000;
  await weak('tableFollowOrder(state.order)');
  assert.equal(weak.sent(/oracy_track_order_table_v1/).length, 2);
});

test('asked gently and only for a dine-in order that has a table: at most every 20 seconds, never for other orders', async () => {
  const run = await atTable('', name => name === 'oracy_track_order_table_v1' ? {ok: true, table_label: '7'} : {ok: true, calls: []});
  run(tracked());
  for (let i = 0; i < 4; i++) { await run('tableFollowOrder(state.order)'); run.clock.now += 5000; }   // the tracking refresh runs every 5 s
  assert.equal(run.sent(/oracy_track_order_table_v1/).length, 1);
  run.clock.now += 1000;
  await run('tableFollowOrder(state.order)');
  assert.equal(run.sent(/oracy_track_order_table_v1/).length, 2);
  assert.ok(run('TABLE_FOLLOW_MS') >= 20000);
  for (const other of [`{orderType:'takeaway',tableLabel:'7'}`, `{orderType:'delivery'}`, `{orderType:'dinein'}`, `{orderType:'dinein',tableLabel:''}`,
    `{orderType:'dinein',tableLabel:'7',trackingToken:'nope'}`, `{orderType:'dinein',tableLabel:'7',backendId:'nope'}`]) {
    const plain = environment('');
    plain.answers(() => { throw new Error('must not be asked'); });
    plain(`state.order={backendId:'${ORDER}',trackingToken:'${TOKEN}',status:'preparing',...${other}}`);
    await plain('tableFollowOrder(state.order)');
    assert.equal(plain('calls.length'), 0, other);
  }
  await environment('')('tableFollowOrder(null)');
});

test('an answer that arrives for an order that is no longer the tracked one is dropped', async () => {
  let answer;
  const run = await atTable('', name => name === 'oracy_track_order_table_v1' ? new Promise(resolve => { answer = resolve; }) : {ok: true, calls: []});
  run(tracked());
  const asking = run('tableFollowOrder(state.order)');
  await run.settle();
  run('const old=state.order; state.order=null');
  answer({ok: true, table_label: '9'});
  await asking;
  assert.equal(run('old.tableLabel'), '7');
  assert.deepEqual(run.toasts(), []);
});

test('the phone still holds the OLD table\'s QR: the move is said with what to do, and the key is never switched silently', async () => {
  const run = await atTable('', name => name === 'oracy_track_order_table_v1' ? {ok: true, table_label: '9', section: 'Hall'}
    : name === 'oracy_table_call_v1' ? {ok: true, call: run('aCall()'), rang: true} : {ok: true, calls: []});
  run(`state.screen='home'; ${tracked()}`);
  await run('tableFollowOrder(state.order)');
  // the order's card
  assert.equal(run('orderNoteLine(state.order)'),
    '<p class="table-move-note" role="status"><strong>Your order is now at Table <bdi>9</bdi>.</strong> To call staff or order again, scan the QR on that table.</p>');
  // the card of the table the phone scanned (where the bell is)
  for (const place of ['home', 'checkout']) {
    assert.match(run(`tableChip("${place}")`), /<strong>Table <bdi>7<\/bdi><\/strong>[\s\S]*<p class="table-chip-note table-move-note" role="status"><strong>Your order is now at Table <bdi>9<\/bdi>\.<\/strong> To call staff or order again, scan the QR on that table\.<\/p>/);
  }
  // nothing about the phone's own table changed
  assert.equal(run('tableActive().key'), KEY);
  assert.equal(run('tableActive().label'), '7');
  assert.equal(JSON.parse(run.session.get(TABLE_STORE)).label, '7');
  run('calls.length=0');
  await run('tableCallSend("waiter")');
  assert.equal(run.sent(/oracy_table_call_v1/)[0].params.p_key, KEY);          // the bell still rings the table of this QR
  run(`state.cart=[{id:itemId,qty:1,price:35,basePrice:35,extras:[],size:'regular',choice:null,notes:''}]; state.screen='checkout'; tableGuestNameInput('Adeel')`);
  run.server = name => /guest_order/.test(name) ? run('created()') : {ok: true, calls: []};
  await run('placeOrder()');
  assert.equal(run.sent(/guest_order/)[0].params.p_key, KEY);                   // and a new order goes there too — as the guest was told
  run('state.lang="ar"; state.order.tableLabel="9"; state.order.tableMoved=true');
  assert.ok(run('tableMoveNote(state.order.backendId, state.order)').includes('لنداء الموظف أو لطلب جديد، امسح رمز QR على تلك الطاولة.'));
});

test('once the guest scans the new table the instruction goes; without a table on the phone only the fact is said', async () => {
  const run = await atTable(`{table_label:'9'}`);                  // the phone is now at Table 9
  run(tracked(`,tableMoved:true`).replace("tableLabel:'7'", "tableLabel:'9'"));
  assert.equal(run('orderNoteLine(state.order)'), '<p class="table-move-note" role="status"><strong>Your order is now at Table <bdi>9</bdi>.</strong></p>');
  assert.equal(run('tableChip("home").includes("table-move-note")'), false);
  run('tableLeave()');
  assert.equal(run('orderNoteLine(state.order)'), '<p class="table-move-note" role="status"><strong>Your order is now at Table <bdi>9</bdi>.</strong></p>');
  // an order that was never moved has no such line; a finished order no longer marks the old table's card
  const calm = await atTable();
  calm(tracked());
  assert.equal(calm('orderNoteLine(state.order)'), '');
  assert.equal(calm('tableChip("home").includes("table-move-note")'), false);
  calm('state.order.tableLabel="9"; state.order.tableMoved=true; state.order.status="completed"');
  assert.equal(calm('tableChip("home").includes("table-move-note")'), false);
});

test('the note is on the confirmation, the tracking card and the signed-in order card; the table name is drawn as text', async () => {
  const app = read('js/app.js');
  assert.match(app, /function orderNoteLine\(order\) \{[\s\S]{0,260}tableMoveNote\(order\.backendId, order\)/);
  assert.equal(app.split('${deliveryConfirmationMarkup(o)}${orderNoteLine(o)}').length, 3);
  assert.ok(read('js/account-orders.js').includes("${typeof tableMoveNote === 'function' ? tableMoveNote(order.id) : ''}"));
  const run = await atTable('', name => name === 'oracy_track_order_table_v1' ? {ok: true, table_label: '<img src=x>', section: '<b>'} : {ok: true, calls: []});
  run.load('js/order-addons.js');
  run(`${tracked()} state.orderTab='active'; state.screen='track'; nav=()=>''; langSwitch=()=>''; orderAddons.info.set(state.order.backendId,{can_add:true,addons:[]});`);
  await run('tableFollowOrder(state.order)');
  const html = run('track()') + run('tableChip("home")') + run(`tableMoveNote('${ORDER}')`);
  assert.equal(/<img|<b>/i.test(html), false);
  assert.ok(html.includes('Your order is now at Table <bdi>&lt;img src=x&gt;</bdi>.'));
  assert.match(run('track()'), /table-order-name[\s\S]*table-move-note[\s\S]*startOrderAddon\(/);   // chip, note, and "add more items" still there
  // by id alone (the signed-in list): from what the device remembered
  assert.match(run(`tableMoveNote('${ORDER}')`), /^<p class="table-move-note" role="status">/);
  assert.equal(run(`tableMoveNote('${BRANCH}')`), '');
  // long names are cut like every table label
  const long = await atTable('', name => name === 'oracy_track_order_table_v1' ? {ok: true, table_label: 'ABCDEFGHIJKLMNOP'} : {ok: true, calls: []});
  long(tracked());
  await long('tableFollowOrder(state.order)');
  assert.equal(long('state.order.tableLabel'), 'ABCDEFGHIJKL');
});

test('the new words have Arabic and say neither "code" nor "points"; cache keys of the changed files are new', () => {
  const run = environment('');
  const text = JSON.parse(run('JSON.stringify(TABLE_TEXT)'));
  for (const key of ['movedNow', 'movedScan']) {
    assert.ok(text.en[key], key);
    assert.match(text.ar[key], /[؀-ۿ]/, key);
    assert.equal(/\bcode\b|points/i.test(text.en[key]), false, key);
  }
  assert.deepEqual(Object.keys(text.ar).sort(), Object.keys(text.en).sort());
  const html = read('index.html');
  for (const file of ['css/table.css']) assert.ok(html.includes(`${file}?v=20261007-391"`), file);
  assert.ok(html.includes('js/table.js?v=20261008-3a"'));   // Batch 3a (C4: no coupon line without codes)
  for (const file of ['js/data.js']) assert.ok(html.includes(`${file}?v=20261008-3a"`), file);   // Batch 3a
  for (const file of ['js/app.js', 'js/account-orders.js']) assert.ok(html.includes(`${file}?v=20261010-ra"`), file);   // Release A
  for (const pin of ['js/push.js?v=20261010-ra', 'js/table-calls.js?v=20261007-1b', 'js/order-note.js?v=20261007-1b', 'css/order-note.css?v=20261007-1b',
    'js/brand-config.js?v=20261007-b1g', 'js/ordering-hours.js?v=20261007-b1g', 'js/order-addons.js?v=20261008-3a', 'css/theme.css?v=20261006-cx4i']) {
    assert.ok(html.includes(pin + '"'), pin);
  }
  assert.equal(/margin-(left|right)|padding-(left|right)|text-align:\s*(left|right)|\b(left|right):/.test(read('css/table.css')), false);
});
