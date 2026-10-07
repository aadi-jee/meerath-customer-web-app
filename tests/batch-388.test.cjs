// Batch 388: what a guest at a table is asked for (name / mobile number, per restaurant), no notification
// card at a table, and the "Menu could not be updated" banner that stayed on a working menu.
// Built to API-388-CONTRACT.md (as built). Run: node --test tests/batch-388.test.cjs. No network.
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
const guestOrder = run => run.sent(/oracy_create_table_guest_order_v1/);

/* ======================= 1. what a guest is asked for ======================= */

test('the scan says what a guest is asked for; a database without 388 says nothing and it is as before', async () => {
  const cases = [['', 'required', 'hidden'], [`{guest_name_mode:'optional', guest_phone_mode:'hidden'}`, 'optional', 'hidden'],
    [`{guest_name_mode:'required', guest_phone_mode:'optional'}`, 'required', 'optional'],
    [`{guest_name_mode:'optional', guest_phone_mode:'required'}`, 'optional', 'required'],
    [`{guest_name_mode:'OPTIONAL', guest_phone_mode:'yes'}`, 'required', 'hidden'], [`{guest_name_mode:null, guest_phone_mode:1}`, 'required', 'hidden']];
  for (const [extra, name, phone] of cases) {
    const run = await atTable(extra);
    assert.equal(run('tableActive().guestNameMode'), name, extra);
    assert.equal(run('tableActive().guestPhoneMode'), phone, extra);
    const saved = JSON.parse(run.session.get(TABLE_STORE));
    assert.deepEqual([saved.guestNameMode, saved.guestPhoneMode], [name, phone], extra);
  }
  // a table remembered before this release
  const old = environment('');
  old.session.set(TABLE_STORE, JSON.stringify({key: KEY, label: '7', section: '', branchId: BRANCH, restaurantId: RESTAURANT, at: old.clock.now, guestOrders: true}));
  old('tableBoot()');
  assert.deepEqual([old('tableGuestNameMode()'), old('tableGuestPhoneMode()')], ['required', 'hidden']);
  // not at a table
  const plain = environment('');
  assert.deepEqual([plain('tableGuestNameMode()'), plain('tableGuestPhoneMode()')], ['required', 'hidden']);
});

test('without the two keys the guest card is exactly the one of today: name needed, no number, the same words', async () => {
  const run = await atTable();
  const html = run('checkoutCustomerMarkup()');
  assert.match(html, /<strong>Order as guest<\/strong><small>Just your name\. Quick and easy\.<\/small>/);
  assert.match(html, /placeholder="Your name" aria-label="Your name"/);
  assert.match(html, /<p class="table-guest-hint">No mobile number needed\.<\/p>/);
  assert.equal(html.includes('tableGuestPhone'), false);
  assert.equal(html.includes('type="tel"'), false);
  run(`state.screen='checkout'`);
  await run('placeOrder()');
  assert.equal(guestOrder(run).length, 0);
  assert.equal(run('tableGuest.error'), 'Please enter your name (at least 2 letters).');
});

test('name optional: the field says so, an empty name is no error, and the order goes without a name', async () => {
  const run = await atTable(`{guest_name_mode:'optional'}`);
  const html = run('checkoutCustomerMarkup()');
  assert.match(html, /placeholder="Your name \(optional\)" aria-label="Your name \(optional\)"/);
  assert.match(html, /<small>No sign-in needed\. Quick and easy\.<\/small>/);
  assert.match(html, /<p class="table-guest-hint">No mobile number needed\.<\/p>/);   // the number is still not asked
  assert.equal(/error|invalid/.test(html), false);
  run(`state.screen='checkout'`);
  await run('placeOrder()');
  const sent = guestOrder(run);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].params.p_order.customer_name, '');
  assert.equal('guest_phone' in sent[0].params.p_order, false);
  assert.match(sent[0].params.p_order.guest_id, UUID);
  assert.equal(run('tableGuest.error'), '');
  assert.equal(run('state.screen'), 'confirmation');
  assert.equal(run('state.order.customer.name'), '');
  assert.equal(run.local.has('oracy:meerath-kabab:guest-name:v1'), false);     // nothing made up is remembered
  run('state.lang="ar"');
  const ar = run('checkoutCustomerMarkup()');
  assert.match(ar, /placeholder="اسمك \(اختياري\)"/);
  assert.match(ar, /<small>بدون تسجيل دخول\. سريع وسهل\.<\/small>/);
});

test('name optional: a name that IS given must still be a real one (the server\'s rule), and a good one is sent', async () => {
  const run = await atTable(`{guest_name_mode:'optional'}`);
  run(`state.screen='checkout'; tableGuestNameInput('A')`);
  await run('placeOrder()');
  assert.equal(guestOrder(run).length, 0);
  assert.equal(run('tableGuest.error'), 'Please enter your name (at least 2 letters).');
  run(`tableGuestNameInput('  Adeel  ')`);
  await run('placeOrder()');
  assert.equal(guestOrder(run)[0].params.p_order.customer_name, 'Adeel');
  assert.equal(run.local.get('oracy:meerath-kabab:guest-name:v1'), 'Adeel');
  // a remembered name survives a later order without one
  const again = await atTable(`{guest_name_mode:'optional'}`, null, {local: run.local});
  again(`state.screen='checkout'; tableGuestNameInput('')`);
  again.local.set('oracy:meerath-kabab:guest-name:v1', 'Adeel');
  await again('placeOrder()');
  assert.equal(guestOrder(again)[0].params.p_order.customer_name, '');
  assert.equal(again.local.get('oracy:meerath-kabab:guest-name:v1'), 'Adeel');
});

test('number hidden: no field at all, and nothing is sent whatever sits in memory', async () => {
  const run = await atTable(`{guest_name_mode:'required', guest_phone_mode:'hidden'}`);
  assert.equal(run('checkoutCustomerMarkup().includes("tableGuestPhone")'), false);
  run(`state.screen='checkout'; tableGuestNameInput('Adeel'); tableGuest.phone='0501234567'; state.customer.mobile='0509999999'`);
  await run('placeOrder()');
  const order = guestOrder(run)[0].params.p_order;
  assert.equal('guest_phone' in order, false);
  assert.equal(JSON.stringify(order).includes('050'), false);
});

test('number optional: one tel field under the name, labelled optional, never prefilled; empty is fine, a given one is sent', async () => {
  const run = await atTable(`{guest_name_mode:'required', guest_phone_mode:'optional'}`);
  run(`state.customer={name:'Old',mobile:'0509999999',email:''}; state.customerPhone='0508888888'; state.loginMobile='0507777777'`);
  run.local.set('oracy:meerath-kabab:guest-phone:v1', '0506666666');
  const html = run('checkoutCustomerMarkup()');
  assert.match(html, /id="tableGuestName"[\s\S]*<input class="field table-guest-name table-guest-phone" id="tableGuestPhone" type="tel" inputmode="tel" maxlength="40"\s+autocomplete="off"/);
  assert.match(html, /placeholder="Mobile number \(optional\)" aria-label="Mobile number \(optional\)"/);
  assert.match(html, /value="" oninput="tableGuestPhoneInput\(this\.value\)"/);          // not prefilled from anything
  assert.equal(/050\d{7}/.test(html), false);
  assert.match(html, /<p class="table-guest-hint">Only used to reach you about this order\.<\/p>/);
  assert.equal(html.includes('No mobile number needed.'), false);
  assert.match(html, /<small>Just your name\. Quick and easy\.<\/small>/);
  assert.equal(html.split('type="tel"').length, 2);              // one field
  run(`state.screen='checkout'; tableGuestNameInput('Adeel')`);
  await run('placeOrder()');
  assert.equal('guest_phone' in guestOrder(run)[0].params.p_order, false);
  // with a number
  const withNumber = await atTable(`{guest_phone_mode:'optional'}`);
  withNumber(`state.screen='checkout'; tableGuestNameInput('Adeel'); tableGuestPhoneInput('  +966 (50) 123-4567 ')`);
  await withNumber('placeOrder()');
  const order = guestOrder(withNumber)[0].params.p_order;
  assert.equal(order.guest_phone, '+966 (50) 123-4567');         // as typed; the server saves it in its own form
  assert.equal('customer_phone' in order, false);                // the order itself still has no phone
  assert.equal(typeof withNumber('window.tableGuestPhoneInput'), 'function');
});

test('number required: said in the card, an empty or wrong one is refused at the field, in both languages', async () => {
  for (const [lang, words, label, sub] of [['en', PHONE, 'Mobile number', 'Your name and mobile number. Quick and easy.'],
    ['ar', 'يرجى إدخال رقم جوال صحيح.', 'رقم الجوال', 'اسمك ورقم جوالك. سريع وسهل.']]) {
    const run = await atTable(`{guest_name_mode:'required', guest_phone_mode:'required'}`);
    run(`state.lang='${lang}'; state.screen='checkout'; tableGuestNameInput('Adeel')`);
    const html = run('checkoutCustomerMarkup()');
    assert.ok(html.includes(`placeholder="${label}" aria-label="${label}"`), lang);
    assert.ok(html.includes(`<small>${sub}</small>`), lang);
    for (const bad of ['', '   ', '12345678', 'abc', '05012345x7']) {
      run(`tableGuestPhoneInput(${JSON.stringify(bad)})`);
      await run('placeOrder()');
      assert.equal(guestOrder(run).length, 0, bad);
      assert.equal(run('tableGuest.phoneError'), words, bad);
      assert.equal(run('tableGuest.error'), '', bad);              // the name is fine: the error sits at the number
      const drawn = run('checkoutCustomerMarkup()');
      assert.match(drawn, /table-guest-phone invalid" id="tableGuestPhone"[\s\S]*aria-invalid="true"/);
      assert.ok(drawn.includes(`<p class="table-guest-error table-guest-phone-error" role="alert">${words}</p>`), lang);
      assert.equal(run.toasts().length, 0);
    }
    run(`tableGuestPhoneInput('0501234567')`);
    assert.equal(run('tableGuest.phoneError'), '');              // typing takes the error away
    await run('placeOrder()');
    assert.equal(guestOrder(run)[0].params.p_order.guest_phone, '0501234567');
  }
  // name optional + number required: "Just your mobile number."
  const only = await atTable(`{guest_name_mode:'optional', guest_phone_mode:'required'}`);
  assert.match(only('checkoutCustomerMarkup()'), /<small>Just your mobile number\. Quick and easy\.<\/small>/);
  only(`state.screen='checkout'; tableGuestPhoneInput('0501234567')`);
  await only('placeOrder()');
  const order = guestOrder(only)[0].params.p_order;
  assert.deepEqual([order.customer_name, order.guest_phone], ['', '0501234567']);
});

test('the number is judged as the server judges it: spaces, dashes, dots, brackets out; optional +; 9 to 15 digits; 40 as typed', () => {
  const run = environment('');
  const clean = value => run(`tableGuestPhoneClean(${JSON.stringify(value)})`);
  assert.equal(clean(' +966 (50) 123-4567 '), '+966501234567');
  assert.equal(clean('0501234567'), '0501234567');
  assert.equal(clean('050.123.4567'), '0501234567');
  assert.equal(clean('123456789'), '123456789');                 // 9 digits
  assert.equal(clean('123456789012345'), '123456789012345');     // 15 digits
  assert.equal(clean('+123456789'), '+123456789');
  for (const bad of ['', ' ', '12345678', '1234567890123456', '++966501234567', '966+501234567', '+', 'abcdefghij', '0501234567a',
    '٠٥٠١٢٣٤٥٦٧', '050/123/4567', '[050]1234567', '0501234567'.split('').join('     ')]) assert.equal(clean(bad), '', JSON.stringify(bad));
  assert.equal(run('tableGuestPhoneClean(null)'), '');
  assert.equal(run('tableGuestPhoneClean(501234567)'), '501234567');
  assert.equal(clean(' ' + '0501234567'.padEnd(38, ' ') + ' '), '0501234567');   // spaces around do not count against the 40
});

test('the server\'s "Please enter a valid mobile number." is shown at the field; an old "hidden" in memory cannot hide it', async () => {
  for (const [lang, words] of [['en', PHONE], ['ar', 'يرجى إدخال رقم جوال صحيح.']]) {
    // remembered: no number asked. The restaurant has since made it required.
    const run = await atTable(`{guest_name_mode:'required', guest_phone_mode:'hidden'}`, (name) => {
      if (/guest_order/.test(name)) throw refuse(PHONE, {status: 400, code: 'P0001'});
      return {ok: true, calls: []};
    });
    run(`state.lang='${lang}'; state.screen='checkout'; tableGuestNameInput('Adeel')`);
    await run('placeOrder()');
    run.flushTimers();
    assert.equal(guestOrder(run).length, 1);                       // nothing on the device stopped the order: the server decided
    assert.equal(run('tableGuest.phoneError'), words);
    assert.equal(run('tableActive().guestPhoneMode'), 'required');
    assert.equal(JSON.parse(run.session.get(TABLE_STORE)).guestPhoneMode, 'required');
    const html = run('checkoutCustomerMarkup()');
    assert.match(html, /id="tableGuestPhone"/);                     // the field is there now, with the message
    assert.ok(html.includes(`role="alert">${words}</p>`));
    assert.equal(run('state.cart.length'), 1);
    assert.equal(run('state.orderSubmitting'), false);
    assert.deepEqual(run.toasts(), []);
  }
  // remembered optional, left empty, server says it is needed → needed from now on; a wrong one typed → stays optional
  const empty = await atTable(`{guest_phone_mode:'optional'}`, name => { if (/guest_order/.test(name)) throw refuse(PHONE, {status: 400, code: 'P0001'}); return {ok: true, calls: []}; });
  empty(`state.screen='checkout'; tableGuestNameInput('Adeel')`);
  await empty('placeOrder()'); empty.flushTimers();
  assert.equal(empty('tableActive().guestPhoneMode'), 'required');
  const typed = await atTable(`{guest_phone_mode:'optional'}`, name => { if (/guest_order/.test(name)) throw refuse(PHONE, {status: 400, code: 'P0001'}); return {ok: true, calls: []}; });
  typed(`state.screen='checkout'; tableGuestNameInput('Adeel'); tableGuestPhoneInput('0501234567')`);
  await typed('placeOrder()'); typed.flushTimers();
  assert.equal(typed('tableActive().guestPhoneMode'), 'optional');
  assert.equal(typed('tableGuest.phoneError'), PHONE);
});

test('an old "name optional" in memory: the server\'s "Please enter your name to order." makes the field a needed one', async () => {
  const run = await atTable(`{guest_name_mode:'optional'}`, name => { if (/guest_order/.test(name)) throw refuse(NAME, {status: 400, code: 'P0001'}); return {ok: true, calls: []}; });
  run(`state.screen='checkout'`);
  await run('placeOrder()');
  run.flushTimers();
  assert.equal(guestOrder(run).length, 1);
  assert.equal(run('tableGuest.error'), NAME);
  assert.equal(run('tableActive().guestNameMode'), 'required');
  assert.match(run('checkoutCustomerMarkup()'), /placeholder="Your name" aria-label="Your name"/);
  run('calls.length=0');
  await run('placeOrder()');                                       // now the device asks for it too
  assert.equal(guestOrder(run).length, 0);
});

test('an old "required" in memory cannot keep refusing: a refused tap asks the server again and the next tap goes', async () => {
  let now = `{guest_name_mode:'required', guest_phone_mode:'required'}`;
  const run = environment(`?t=${KEY}`);
  run.answers(name => name === 'oracy_table_scan_v1' ? run(`scanOk(${now})`) : /status/.test(name) ? {ok: true, calls: []} : run('created()'));
  run('tableBoot()'); await run('tableSettled()'); await run.settle();
  now = `{guest_name_mode:'optional', guest_phone_mode:'hidden'}`;   // the restaurant changed its mind
  run(`toasts.length=0; calls.length=0; state.screen='checkout'`);
  await run('placeOrder()');
  await run.settle();
  assert.equal(guestOrder(run).length, 0);                         // this tap was refused by the old rule…
  assert.equal(run.sent(/oracy_table_scan_v1/).length, 1);         // …and the settings were read again
  assert.deepEqual([run('tableGuestNameMode()'), run('tableGuestPhoneMode()')], ['optional', 'hidden']);
  assert.deepEqual([run('tableGuest.error'), run('tableGuest.phoneError')], ['', '']);   // the old error is gone with the old rule
  await run('placeOrder()');
  assert.equal(guestOrder(run).length, 1);
  assert.equal(run('state.screen'), 'confirmation');
});

test('a reload reads the table\'s settings once more and takes over what changed; it never ends table mode by itself', async () => {
  const first = await atTable(`{guest_name_mode:'required', guest_phone_mode:'hidden', service_calls:true}`);
  const remembered = new Map(first.session);
  const run = environment('', first.shared);
  run.answers(name => name === 'oracy_table_scan_v1'
    ? run(`scanOk({guest_name_mode:'optional', guest_phone_mode:'optional', service_calls:false, guest_orders:true, table_label:'7A', section:'Garden'})`) : {ok: true, calls: []});
  run('state.screen="checkout"; tableBoot()');
  assert.equal(run('tableGuestNameMode()'), 'required');           // at once: what was remembered
  run.flushTimers(); await run.settle();
  const scans = run.sent(/oracy_table_scan_v1/);
  assert.equal(scans.length, 1);
  assert.deepEqual(scans[0].params, {p_key: KEY});
  assert.deepEqual([run('tableGuestNameMode()'), run('tableGuestPhoneMode()')], ['optional', 'optional']);
  assert.equal(run('tableActive().serviceCalls'), false);
  assert.equal(run('tableActive().label'), '7A');
  assert.equal(run('tableActive().section'), 'Garden');
  assert.equal(run('tableActive().at'), first('tableActive().at'));   // the six hours are not started again by a reload
  assert.deepEqual(JSON.parse(run.session.get(TABLE_STORE)).guestPhoneMode, 'optional');
  assert.deepEqual(run.toasts(), []);                              // no greeting, no message
  assert.ok(run('draws') >= 1);                                    // the checkout shows the new fields
  // answers that change nothing: {ok:false} (also what a rate limit says), another restaurant or branch, no answer
  for (const answer of [`({ok:false})`, `scanOk({restaurant_id:'33333333-3333-3333-3333-333333333333', guest_phone_mode:'required'})`,
    `scanOk({branch_id:'33333333-3333-3333-3333-333333333333', guest_phone_mode:'required'})`, `scanOk({table_label:'', guest_phone_mode:'required'})`, null]) {
    const again = environment('', {session: new Map(remembered), local: first.local, clock: first.clock});
    again.answers(name => { if (name !== 'oracy_table_scan_v1') return {ok: true, calls: []}; if (answer === null) throw refuse('Failed to fetch'); return again(answer); });
    again('tableBoot()'); again.flushTimers(); await again.settle();
    assert.equal(again('tableActive().label'), '7', String(answer));
    assert.equal(again('tableGuestPhoneMode()'), 'hidden', String(answer));
    assert.deepEqual(again.toasts(), [], String(answer));
  }
});

test('a new scan of the table takes the settings of that moment', async () => {
  const first = await atTable(`{guest_name_mode:'required', guest_phone_mode:'hidden'}`);
  const run = environment(`?t=${KEY}`, first.shared);
  run.answers(name => name === 'oracy_table_scan_v1' ? run(`scanOk({guest_name_mode:'optional', guest_phone_mode:'required'})`) : {ok: true, calls: []});
  run('tableBoot()'); await run('tableSettled()');
  assert.deepEqual([run('tableGuestNameMode()'), run('tableGuestPhoneMode()')], ['optional', 'required']);
});

test('the number is not kept anywhere: not in storage, not with the tracked order, not in the attempt, gone with the table', async () => {
  const run = await atTable(`{guest_phone_mode:'required'}`);
  run(`state.screen='checkout'; tableGuestNameInput('Adeel'); tableGuestPhoneInput('0501234567')`);
  const attempt = run(`orderAttemptId(state.cart, "", tableActive(), tableGuestOrder())`);
  assert.equal(run('orderAttempt.key').includes('0501234567'), false);
  run(`tableGuestPhoneInput('0507654321')`);
  assert.equal(run(`orderAttemptId(state.cart, "", tableActive(), tableGuestOrder())`), attempt);   // a corrected number is the same order
  await run('placeOrder()');
  assert.equal(guestOrder(run)[0].params.p_order.guest_phone, '0507654321');
  for (const store of [run.local, run.session]) for (const [key, value] of store) assert.equal(/0507654321|0501234567/.test(value), false, key);
  assert.equal(JSON.stringify(run('state.order')).includes('0507654321'), false);
  assert.equal(run('state.customer.mobile'), '0500000000');        // the sign-in fields are not touched
  run('tableLeave()');
  assert.equal(run('tableGuest.phone'), '');
  // a reload starts with an empty field
  const again = await atTable(`{guest_phone_mode:'required'}`, null, {local: run.local});
  assert.match(again('checkoutCustomerMarkup()'), /id="tableGuestPhone"[\s\S]*value="" oninput="tableGuestPhoneInput/);
  assert.match(read('js/table.js'), /autocomplete="off" enterkeyhint="done" dir="ltr"/);
});

test('hostile text in the number is drawn as text; a signed-in visitor is never asked and nothing of this is sent for him', async () => {
  const run = await atTable(`{guest_phone_mode:'optional'}`);
  run(`tableGuestPhoneInput('"><img src=x onerror=alert(1)>')`);
  const html = run('checkoutCustomerMarkup()');
  assert.equal(/<img/i.test(html), false);
  assert.ok(html.includes('value="&quot;&gt;&lt;img src=x onerror=alert(1)&gt;"'));
  run(`tableGuestPhoneInput('0501234567'); state.isLoggedIn=true; state.customerPhone='0500000000'; state.screen='checkout'`);
  assert.equal(run('checkoutCustomerMarkup().includes("tableGuestPhone")'), false);
  await run('placeOrder()');
  const sent = run.sent(/create/);
  assert.equal(sent[0].name, 'oracy_create_table_order_v1');
  assert.equal('guest_phone' in sent[0].params.p_order, false);
});

test('the new words have Arabic, the server\'s sentence is the contract\'s, and none says "code" or "points"', () => {
  const run = environment('');
  const text = JSON.parse(run('JSON.stringify(TABLE_TEXT)'));
  for (const key of ['guestSubFree', 'guestSubPhone', 'guestSubBoth', 'guestNameOptional', 'guestPhone', 'guestPhoneOptional', 'guestPhoneHint', 'phoneNeeded']) {
    assert.ok(text.en[key], key);
    assert.match(text.ar[key], /[؀-ۿ]/, key);
    assert.equal(/\bcode\b|points/i.test(text.en[key]), false, key);
  }
  assert.equal(text.en.phoneNeeded, PHONE);
  assert.equal(text.en.guestNameOptional, 'Your name (optional)');
  assert.equal(text.en.guestPhoneOptional, 'Mobile number (optional)');
  assert.equal(text.en.guestPhone, 'Mobile number');
  assert.equal(run('tableGuestRefusal("Please enter a valid mobile number")'), false);   // only the exact sentence
});

/* ======================= 2. no notification card at a table ======================= */

test('at a table the "Get a notification when your order is ready" card is not drawn; away from a table it is as before', async () => {
  const order = `{id:'${ORDER}', token:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'}`;
  for (const lang of ['en', 'ar']) {
    const plain = environment('');
    // an iPhone in Safari (not installed): the card that explains "Add to Home Screen"
    plain(`state.lang='${lang}'; pushSupported=()=>false; pushIsIos=()=>true; pushStandalone=()=>false; pushDismissed=()=>false; pushAllowed=()=>true`);
    const before = plain(`pushCardMarkup(${order})`);
    assert.match(before, /class="push-card" data-push-card="1"/);
    assert.ok(before.includes(lang === 'ar' ? 'احصل على إشعار عند جاهزية طلبك' : 'Get a notification when your order is ready'));
    const run = await atTable();
    run(`state.lang='${lang}'; pushSupported=()=>false; pushIsIos=()=>true; pushStandalone=()=>false; pushDismissed=()=>false; pushAllowed=()=>true`);
    assert.equal(run(`pushCardMarkup(${order})`), '');
    assert.equal(run(`pushCardMarkup({id:'${ORDER}', token:null})`), '');
    run('tableLeave()');
    assert.equal(run(`pushCardMarkup(${order})`), before);       // the same card again away from the table
  }
  // every screen takes the card from that one function: order received / thank you, tracking, the signed-in order card
  const push = read('js/push.js');
  assert.match(push, /function pushCardMarkup\(order\) \{[\s\S]{0,420}if \(typeof tableActive === "function" && tableActive\(\)\) return "";/);
  assert.match(push, /box\.insertAdjacentHTML\("beforeend", pushCardMarkup\(/);
  assert.ok(read('js/app.js').includes('? pushCardMarkup({id: o.backendId, token: o.trackingToken}) : ""}'));
  assert.ok(read('js/account-orders.js').includes("pushCardMarkup({id: order.id, token: null})"));
  assert.equal(push.split('Get a notification when your order is ready').length, push.split('pushCopy("Get a notification when your order is ready"').length);
});

test('the tracking card of a guest at a table has no notification card, and still has "add more items"', async () => {
  const run = await atTable();
  run.load('js/order-addons.js');
  run(`pushSupported=()=>false; pushIsIos=()=>true; pushStandalone=()=>false; pushDismissed=()=>false; pushAllowed=()=>true;
    state.order={id:'MK001042',backendId:'${ORDER}',trackingToken:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',status:'preparing',orderType:'dinein',
      tableLabel:'7',items:[{id:itemId,qty:2}]}; state.orderTab='active'; state.screen='track'; nav=()=>''; langSwitch=()=>'';
    orderAddons.info.set(state.order.backendId,{can_add:true,addons:[]});`);
  const at = run('track()');
  assert.equal(at.includes('push-card'), false);
  assert.match(at, /startOrderAddon\(/);
  run('tableLeave()');
  assert.match(run('track()'), /push-card/);
});

/* ======================= 3. "Menu could not be updated" on a working menu ======================= */

/** The menu request layer with a fetch the test controls; applyMenuPayload is the real one unless replaced. */
function menuEnvironment() {
  const run = environment('');
  const requests = [];
  run.set('fetch', (url, options) => new Promise((resolve, reject) => { requests.push({url, options, resolve, reject}); }));
  run(`applyMenuPayload=()=>({changed:false, cartChanged:false}); requestCustomerContent=()=>{}; loadOrderingHours=()=>{};
    orderingHours.status={version:1}; state.screen='home'; draws=0;
    menuConnection.status='ready'; menuConnection.lastSuccess=Date.now(); menuConnection.payload={branches:[]};`);
  const menuCalls = () => requests.filter(r => /meerath_customer_menu_v1$/.test(r.url));
  const ok = request => request.resolve({ok: true, status: 200, json: async () => ({version: 1})});
  return {run, menuCalls, ok};
}

test('the banner condition: the menu is "not ready" as soon as its last good answer is older than 90 seconds', () => {
  const {run} = menuEnvironment();
  assert.equal(run('MENU_CONFIG.maxAgeMs'), 90000);
  assert.equal(run('menuStatusMarkup()'), '');
  run.clock.now += 90001;                                          // the phone was locked for a minute and a half
  assert.match(run('menuStatusMarkup()'), /<div class="menu-status" role="status">Menu could not be updated\. Please try again\. <button class="link" onclick="refreshMenu\(\)">Retry<\/button><\/div>/);
  assert.equal(run('menuConnection.status'), 'ready');             // nothing failed: it is only old
});

test('THE DEFECT: a screen drawn while the menu was too old kept its banner after a good refresh with an unchanged menu — now it is drawn again', async () => {
  const {run, menuCalls, ok} = menuEnvironment();
  run.clock.now += 5 * 60 * 1000;                                  // back at the table after five minutes
  run('renderKeepScroll()');                                       // anything draws the screen (a tap, the call state, the hours)
  assert.match(run('menuStatusMarkup()'), /Menu could not be updated/);   // …and that drawing carried the banner
  run('draws=0');
  const refresh = run('refreshMenu()');
  await run.settle();
  ok(menuCalls()[0]);
  assert.deepEqual(JSON.parse(JSON.stringify(await refresh)), {ok: true, cartChanged: false});
  assert.equal(run('menuStatusMarkup()'), '');                     // the menu is fresh again
  assert.equal(run('draws'), 1);                                   // and the screen is drawn again, so the banner goes
  // a refresh of a menu that was never too old still draws nothing (no flicker every 30 seconds)
  run.clock.now += 30000;
  run('draws=0');
  const next = run('refreshMenu()');
  await run.settle();
  ok(menuCalls()[1]);
  await next;
  assert.equal(run('draws'), 0);
  assert.match(read('js/data.js'), /if \(result\.changed \|\| result\.cartChanged \|\| previous !== "ready" \|\| tooOld\) refreshMenuUI\(\);/);
});

test('a request frozen with the page does not block the refresh on return, and its late failure cannot undo the fresh answer', async () => {
  const {run, menuCalls, ok} = menuEnvironment();
  const frozen = run('refreshMenu()');                             // sent, then the phone is locked
  await run.settle();
  assert.equal(menuCalls().length, 1);
  const same = run('refreshMenu()');                               // while it is really running: no second request
  await run.settle();
  assert.equal(menuCalls().length, 1);
  run.clock.now += 4 * 60 * 1000;                                  // minutes later the page is back; the old request never answered
  const fresh = run('refreshMenu()');
  await run.settle();
  assert.equal(menuCalls().length, 2);                             // a new one goes out (before: the frozen one was awaited)
  ok(menuCalls()[1]);
  assert.equal((await fresh).ok, true);
  assert.equal(run('menuConnection.status'), 'ready');
  menuCalls()[0].reject(new TypeError('Load failed'));             // now the frozen one dies
  assert.equal((await frozen).ok, false);
  await same;
  assert.equal(run('menuConnection.status'), 'ready');             // …without turning the menu to "error"
  assert.equal(run('menuStatusMarkup()'), '');
  assert.equal(run('menuConnection.pending'), null);
  assert.equal(run('MENU_STUCK_MS') > 12000, true);                // longer than the request's own 12 s limit
});

test('a refresh that fails is tried again once after 3 seconds (a phone just unlocked often loses its first request)', async () => {
  const {run, menuCalls, ok} = menuEnvironment();
  const retries = () => run.pending().filter(timer => timer.ms === 3000);
  const first = run('refreshMenu()');
  await run.settle();
  menuCalls()[0].reject(new TypeError('Load failed'));
  assert.equal((await first).ok, false);
  assert.equal(run('menuConnection.status'), 'error');
  assert.equal(retries().length, 1);
  retries()[0].fn(); retries().forEach(timer => { timer.fn = null; });
  await run.settle();
  assert.equal(menuCalls().length, 2);
  menuCalls()[1].reject(new TypeError('Load failed'));
  await run.settle();
  assert.equal(retries().length, 0);                               // one quick try only; then the usual 30 seconds
  const third = run('refreshMenu()');
  await run.settle();
  ok(menuCalls()[2]);
  assert.equal((await third).ok, true);
  assert.equal(run('menuStatusMarkup()'), '');
  // after a good answer the next failure gets its quick try again
  run.clock.now += 30000;
  const fourth = run('refreshMenu()');
  await run.settle();
  menuCalls()[3].reject(new TypeError('Load failed'));
  await fourth;
  assert.equal(retries().length, 1);
  // not while the page is hidden
  const hidden = menuEnvironment();
  hidden.run.page.hidden = true;
  const quiet = hidden.run('refreshMenu()');
  await hidden.run.settle();
  hidden.menuCalls()[0].reject(new TypeError('Load failed'));
  await quiet;
  assert.equal(hidden.run.pending().filter(timer => timer.ms === 3000).length, 0);
});

test('the pieces around it are independent: own abort timers, no shared controller, a service worker that fetches nothing', () => {
  const data = read('js/data.js'), calls = read('js/table-calls.js'), sw = read('sw.js');
  // the 10-second check does not call the menu "error" while a refresh is already on its way
  assert.match(data, /if \(menuConnection\.status === "ready" && !\(menuConnection\.pending && Date\.now\(\) - menuConnection\.pendingAt < MENU_STUCK_MS\)\) \{/);
  // each request makes its own AbortController; none is kept in a shared place
  assert.equal(data.split('new AbortController()').length, 3);     // the menu, and one per order-service call
  assert.equal(/AbortController|\.abort\(/.test(calls), false);    // calling staff aborts nothing
  assert.equal(/menuConnection|refreshMenu/.test(calls), false);   // and never touches the menu
  assert.equal(/addEventListener\("fetch"/.test(sw), false);       // the service worker serves no request
  assert.match(sw, /It caches nothing/);
  // the ticker ("Menu is coming very soon…") is the restaurant's own announcement text, not a state of the app
  for (const file of fs.readdirSync(path.join(root, 'js'))) assert.equal(/coming very soon/i.test(read(`js/${file}`)), false, file);
});

test('cache keys: the changed files are new, the others keep theirs', () => {
  const html = read('index.html');
  for (const file of ['js/table.js', 'js/data.js', 'js/push.js', 'css/table.css']) assert.ok(html.includes(`${file}?v=20261007-388"`), file);
  for (const pin of ['js/app.js?v=20261007-1b', 'js/table-calls.js?v=20261007-1b', 'js/order-note.js?v=20261007-1b', 'js/account-orders.js?v=20261007-1b',
    'css/order-note.css?v=20261007-1b', 'js/brand-config.js?v=20261007-b1g', 'js/ordering-hours.js?v=20261007-b1g', 'js/order-addons.js?v=20261003-batche',
    'js/i18n.js?v=20261006-cx4f', 'css/theme.css?v=20261006-cx4i']) assert.ok(html.includes(pin + '"'), pin);
  const orig = read('js/app.js');
  assert.ok(orig.includes('if (tableGuestOn()) return tableGuestNameOk() ? createOrderAfterVerification() : undefined;'));   // app.js needed no change
});
