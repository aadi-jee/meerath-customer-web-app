// Batch 1b: the order note ("Cooking instructions", 379) and calling staff from the table (382).
// Built to API-1B-CONTRACT.md. Run: node --test tests/batch-1b.test.cjs. No network.
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
  for (const file of ['brand-config.js', 'data.js', 'ordering-hours.js', 'table.js', 'table-calls.js', 'order-note.js', 'auth.js', 'content.js', 'delivery-location.js', 'rewards.js']) {
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

/* ======================= 1. the order note (379) ======================= */

test('the note is cleaned as the server cleans it: one line, no invisible characters, at most 300', () => {
  const run = environment('');
  assert.equal(run('orderNoteClean("  Less  spicy,\\n no\\tonions\\u200b \\u202e ")'), 'Less spicy, no onions');
  assert.equal(run('orderNoteClean("أقل حرارة،  بدون بصل")'), 'أقل حرارة، بدون بصل');
  assert.equal(run('orderNoteClean("x".repeat(500)).length'), 300);
  assert.equal(run('orderNoteClean("   ")'), '');
  for (const not of ['null', 'undefined', '42', '{}', '["a"]']) assert.equal(run(`orderNoteClean(${not})`), '', not);
  assert.equal(run('ORDER_NOTE_MAX'), 300);
});

test('the cart field: a label, an example as placeholder, 300 at most, the text escaped; bilingual', () => {
  const run = environment('');
  const empty = run('orderNoteFieldMarkup()');
  assert.match(empty, /<label class="order-note-label" for="orderNoteInput"><span>Cooking instructions<\/span>\s*<small>Optional<\/small><\/label>/);
  assert.match(empty, /<textarea class="field order-note-input" id="orderNoteInput" rows="2" maxlength="300" dir="auto"/);
  assert.deepEqual([0, 40, 100, 300].map(n => run(`orderNoteRows("x".repeat(${n}))`)), [2, 2, 3, 9]);   // grows with a long note
  assert.match(empty, /placeholder="Less spicy, no onions"/);
  assert.match(empty, /oninput="orderNoteInput\(this\)"><\/textarea>/);
  assert.match(empty, /id="orderNoteCount" aria-live="polite" hidden><\/span>/);   // no counter far from the limit
  run('state.notes=\'</textarea><img src=x onerror=alert(1)>"\'');
  const evil = run('orderNoteFieldMarkup()');
  assert.equal(/<img|<\/textarea><img/i.test(evil), false);
  assert.ok(evil.includes('&lt;/textarea&gt;&lt;img src=x onerror=alert(1)&gt;&quot;</textarea>'));
  run('state.lang="ar"; state.notes=""');
  const ar = run('orderNoteFieldMarkup()');
  assert.match(ar, /<span>ملاحظات الطبخ<\/span>\s*<small>اختياري<\/small>/);
  assert.match(ar, /placeholder="أقل حرارة، بدون بصل"/);
  // the cart draws this field (and still a plain one if the file were missing)
  assert.ok(read('js/app.js').includes('${typeof orderNoteFieldMarkup === "function" ? orderNoteFieldMarkup() : `<textarea class="field" rows="2"'));
});

test('a live counter appears near the limit and typing never redraws the screen', () => {
  const run = environment('');
  assert.equal(run('orderNoteCountText(0)'), '');
  assert.equal(run('orderNoteCountText(239)'), '');
  assert.equal(run('orderNoteCountText(240)'), '240/300');
  assert.equal(run('orderNoteCountText(300)'), '300/300');
  run('state.notes="x".repeat(260)');
  assert.match(run('orderNoteFieldMarkup()'), /id="orderNoteCount" aria-live="polite" >260\/300<\/span>/);
  run('state.notes="x".repeat(300)');
  assert.match(run('orderNoteFieldMarkup()'), /class="order-note-count full"[^>]*>300\/300</);
  // typing: the state and the counter change, nothing is drawn again
  const counter = run.page.nodes.set('orderNoteCount', {textContent: '', hidden: true, classList: {set: new Set(), toggle(n, on) { on ? this.set.add(n) : this.set.delete(n); }}}).get('orderNoteCount');
  const field = {value: 'y'.repeat(250), rows: 2};
  run.set('__field', field);
  run('draws=0; orderNoteInput(__field)');
  assert.equal(run('state.notes.length'), 250);
  assert.equal(field.rows, 8);
  assert.equal(counter.textContent, '250/300');
  assert.equal(counter.hidden, false);
  assert.equal(run('draws'), 0);
  field.value = 'z'.repeat(400);                                // a long paste
  run('orderNoteInput(__field)');
  assert.equal(field.value.length, 300);
  assert.equal(run('state.notes.length'), 300);
  assert.equal(counter.textContent, '300/300');
  assert.ok(counter.classList.set.has('full'));
  field.value = 'short';
  run('orderNoteInput(__field)');
  assert.equal(counter.hidden, true);
  assert.equal(run('typeof window.orderNoteInput'), 'function');
});

test('a normal order goes to oracy_create_customer_order_v2 with order_note; the rest of the body is as before', async () => {
  const run = environment('');
  run.answers(() => run('created({order_note:"Less spicy, no onions"})'));
  run(`state.isLoggedIn=true; state.orderType='takeaway'; state.notes='  Less spicy,\\n no onions  '`);
  await run('createOrderAfterVerification()');
  const sent = run.sent(/create/);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].name, 'oracy_create_customer_order_v2');
  assert.deepEqual(Object.keys(sent[0].params).sort(), ['p_branch_id', 'p_order', 'p_restaurant_id']);
  assert.equal(sent[0].params.p_order.order_note, 'Less spicy, no onions');
  assert.deepEqual(Object.keys(sent[0].params.p_order).sort(), ['address', 'client_order_id', 'coupon_code', 'customer_email', 'customer_name',
    'customer_phone', 'customer_registered', 'delivery_address_id', 'delivery_address_version', 'expected_delivery_fee', 'fulfillment_type',
    'items', 'order_note', 'order_timing', 'schedule_type', 'scheduled_for', 'suggested_eta']);
  assert.equal(sent[0].params.p_order.items[0].notes, '');      // line notes stay where they are
});

test('delivery goes to oracy_create_pin_delivery_order_v3; no note typed = no order_note key at all', async () => {
  const run = environment('');
  run.answers(() => run('created()'));
  run('state.isLoggedIn=true');
  await run(`submitCustomerOrder({fulfillment_type:'delivery', client_order_id:'x', order_note:'Ring the bell'})`);
  assert.equal(run.sent(/create/)[0].name, 'oracy_create_pin_delivery_order_v3');
  assert.equal(run.sent(/create/)[0].params.p_order.order_note, 'Ring the bell');
  run(`calls.length=0; state.orderType='takeaway'; state.notes='   \\n '`);
  await run('createOrderAfterVerification()');
  assert.equal(run.sent(/create/)[0].name, 'oracy_create_customer_order_v2');
  assert.equal('order_note' in run.sent(/create/)[0].params.p_order, false);
});

test('at a table the note rides in the same two functions: signed in and as a guest', async () => {
  const signedIn = await atTable();
  signedIn(`state.isLoggedIn=true; state.notes='No onions'`);
  await signedIn('createOrderAfterVerification()');
  let sent = signedIn.sent(/create/);
  assert.equal(sent[0].name, 'oracy_create_table_order_v1');
  assert.equal(sent[0].params.p_order.order_note, 'No onions');
  const guest = await atTable();
  guest(`state.screen='checkout'; tableGuestNameInput('Adeel'); state.notes='No onions'`);
  await guest('placeOrder()');
  sent = guest.sent(/create/);
  assert.equal(sent[0].name, 'oracy_create_table_guest_order_v1');
  assert.equal(sent[0].params.p_order.order_note, 'No onions');
  assert.equal('customer_phone' in sent[0].params.p_order, false);
});

test('a server without the new entries (404 / PGRST202): the old function, once, without the note, without a word', async () => {
  for (const [type, fresh, old] of [['takeaway', 'oracy_create_customer_order_v2', 'oracy_create_customer_order_v1'],
    ['delivery', 'oracy_create_pin_delivery_order_v3', 'oracy_create_pin_delivery_order_v2']]) {
    const run = environment('');
    run.answers(name => { if (/_v2$|_v3$/.test(name) && name === fresh) throw missing(); return run('created()'); });
    run('state.isLoggedIn=true');
    const answer = await run(`submitCustomerOrder({fulfillment_type:'${type}', client_order_id:'same-id', order_note:'No onions', items:[]})`);
    const sent = run.sent(/create/);
    assert.deepEqual(sent.map(call => call.name), [fresh, old], type);
    assert.equal(sent[0].params.p_order.order_note, 'No onions');
    assert.equal('order_note' in sent[1].params.p_order, false, type);
    assert.equal(sent[1].params.p_order.client_order_id, 'same-id');           // the same attempt: nothing can double
    assert.deepEqual(Object.keys(sent[1].params).sort(), ['p_branch_id', 'p_order', 'p_restaurant_id']);
    assert.equal(answer.order_number, 'MK001042');
  }
  // through the whole checkout: the order is placed, nothing is said, and no note is claimed on the card
  const run = environment('');
  run.answers(name => { if (name === 'oracy_create_customer_order_v2') throw missing(); return run('created()'); });
  run(`state.isLoggedIn=true; state.orderType='takeaway'; state.notes='No onions'`);
  await run('createOrderAfterVerification()');
  assert.equal(run('state.screen'), 'confirmation');
  assert.deepEqual(run.toasts(), []);
  assert.equal(run('state.order.note'), undefined);
  assert.equal(run('orderNoteLine(state.order)'), '');
  assert.equal(run.local.has(NOTES_STORE), false);
});

test('only "no such function" falls back: a refusal or a lost connection is never sent again to the old function', async () => {
  for (const error of [refuse('This code is not valid', {status: 400, code: 'P0001'}), refuse('Failed to fetch'),
    refuse('Order service is unavailable. Please try again.', {status: 500, code: 'XX000'}), refuse('Please sign in again to continue.', {status: 401})]) {
    const run = environment('');
    run.set('__error', error);
    run.answers(() => { throw error; });
    run('state.isLoggedIn=true');
    await assert.rejects(run(`submitCustomerOrder({fulfillment_type:'takeaway', client_order_id:'x', order_note:'n'})`), error);
    assert.deepEqual(run.sent(/create/).map(call => call.name), ['oracy_create_customer_order_v2']);
  }
});

test('the new entries need a sign-in on the device like the old ones', async () => {
  const list = /const signedInOnly = \[([^\]]*)\];/.exec(read('js/data.js'))[1];
  for (const name of ['oracy_create_customer_order_v1', 'oracy_create_pin_delivery_order_v2', 'oracy_create_table_order_v1',
    'oracy_create_customer_order_v2', 'oracy_create_pin_delivery_order_v3']) assert.ok(list.includes(`"${name}"`), name);
  for (const open of ['guest_order', 'table_call', 'table_scan', 'calls_status']) assert.equal(list.includes(open), false, open);
  const run = environment('');
  let fetched = 0;
  run.set('fetch', async () => { fetched++; return {ok: true, status: 200, json: async () => ({})}; });
  for (const name of ['oracy_create_customer_order_v2', 'oracy_create_pin_delivery_order_v3']) {
    await assert.rejects(run(`realCustomerOrderRpc('${name}', {})`), /Please sign in again to continue\./);
  }
  assert.equal(fetched, 0);
});

test('after the order: the field is empty, and the card shows the note as the server saved it (escaped)', async () => {
  for (const [lang, label] of [['en', 'Note:'], ['ar', 'ملاحظة:']]) {
    const run = environment('');
    run.answers(() => run(`created({order_note:'No onions <b>please</b>'})`));
    run(`state.lang='${lang}'; state.isLoggedIn=true; state.orderType='takeaway'; state.notes='No onions <b>please</b>'`);
    await run('createOrderAfterVerification()');
    assert.equal(run('state.notes'), '');
    assert.equal(run('state.order.note'), 'No onions <b>please</b>');
    assert.equal(run('orderNoteLine(state.order)'), `<p class="order-note"><strong>${label}</strong> <bdi>No onions &lt;b&gt;please&lt;/b&gt;</bdi></p>`);
    // kept with the tracked order, and by order id for the signed-in Orders screen
    assert.equal(JSON.parse(run.local.get('oracy:meerath-kabab:active-customer-order:v1')).note, 'No onions <b>please</b>');
    assert.equal(run(`orderNoteMarkup('${ORDER}')`), run('orderNoteLine(state.order)'));
    assert.equal(run(`orderNoteMarkup('${BRANCH}')`), '');
    run.clock.now += 25 * 60 * MIN;
    assert.equal(run(`orderNoteMarkup('${ORDER}')`), '');        // the device forgets it after a day
  }
});

test('a repeat is answered with the first note: that is what the card shows, whatever was typed since', async () => {
  const run = environment('');
  run.answers(() => run(`created({duplicate:true, order_note:'First note'})`));
  run(`state.isLoggedIn=true; state.orderType='takeaway'; state.notes='Second note'`);
  await run('createOrderAfterVerification()');
  assert.equal(run.sent(/create/)[0].params.p_order.order_note, 'Second note');
  assert.equal(run('state.order.note'), 'First note');
  // a server answer that is not a text is no note
  for (const odd of ['null', '42', '{a:1}', '""', '"   "']) {
    const other = environment('');
    other.answers(() => other(`created({order_note:${odd}})`));
    other(`state.isLoggedIn=true; state.orderType='takeaway'; state.notes='x y'`);
    await other('createOrderAfterVerification()');
    assert.equal(other('state.order.note'), undefined, odd);
    assert.equal(other('orderNoteLine(state.order)'), '', odd);
  }
});

test('the note is not part of the attempt id: a retry with an edited note is the same order', async () => {
  const run = environment('');
  run('state.notes="Less spicy"');
  const first = run('orderAttemptId(state.cart, "")');
  run('state.notes="Less spicy, no onions"');
  assert.equal(run('orderAttemptId(state.cart, "")'), first);
  run('state.notes=""');
  assert.equal(run('orderAttemptId(state.cart, "")'), first);
  run('state.cart[0].qty=3');
  assert.notEqual(run('orderAttemptId(state.cart, "")'), first);   // another cart is another order
  // through the checkout: a lost answer, the note edited, the same client_order_id again
  const flow = environment('');
  let lost = true;
  flow.answers(() => { if (lost) throw refuse('The connection is slow. Please try again.'); return flow(`created({duplicate:true, order_note:'Less spicy'})`); });
  flow(`state.isLoggedIn=true; state.orderType='takeaway'; state.screen='checkout'; state.notes='Less spicy'`);
  await flow('createOrderAfterVerification()');
  assert.equal(flow('state.order'), null);
  assert.equal(flow('state.notes'), 'Less spicy');               // a failed order keeps what was typed
  lost = false;
  flow(`state.notes='Less spicy, no onions'`);
  await flow('createOrderAfterVerification()');
  const sent = flow.sent(/create/);
  assert.equal(sent.length, 2);
  assert.equal(sent[0].params.p_order.client_order_id, sent[1].params.p_order.client_order_id);
  assert.equal(flow('state.order.note'), 'Less spicy');
});

test('"Note: …" is on the confirmation, the tracking card and the signed-in order card', () => {
  const app = read('js/app.js');
  assert.equal(app.split('${deliveryConfirmationMarkup(o)}${orderNoteLine(o)}').length, 3);   // both confirmation screens
  assert.match(app, /orderAddedItemsMarkup\(o\.backendId\) : ""\}\n\s*\$\{orderNoteLine\(o\)\}/);
  assert.ok(read('js/account-orders.js').includes("${typeof orderNoteMarkup === 'function' ? orderNoteMarkup(order.id) : ''}"));
  const run = environment('');
  run(`state.order={id:'MK001042',backendId:'${ORDER}',trackingToken:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',status:'preparing',
    orderType:'dinein',items:[{id:itemId,qty:2}],note:'No onions'}; state.orderTab='active'; nav=()=>''; langSwitch=()=>''; pushCardMarkup=()=>'';`);
  assert.match(run('track()'), /<p class="order-note"><strong>Note:<\/strong> <bdi>No onions<\/bdi><\/p>/);
  run('state.order.note=undefined');
  assert.equal(run('track()').includes('order-note'), false);
});

test('"add more items" is untouched: no order_note there, its notes stay per line', () => {
  const addons = read('js/order-addons.js');
  assert.equal(addons.includes('order_note'), false);
  assert.equal(addons.includes('orderNote'), false);
  assert.ok(addons.includes('notes: [line.notes || "", state.notes || ""].filter(Boolean).join(" · ").slice(0, 300),'));
  assert.ok(read('index.html').includes('js/order-addons.js?v=20261003-batche"'));
  const note = read('js/order-note.js');
  assert.equal(/addon/i.test(note.replace(/"Add more items"[^\n]*/g, '')), false);
});

/* ======================= 2. calling staff from the table (382) ======================= */

test('the scan says service_calls: remembered with the table; the bell sits inside the "Table N" card on Home and in the checkout', async () => {
  const run = await atTable();
  assert.equal(JSON.parse(run.session.get(TABLE_STORE)).serviceCalls, true);
  for (const place of ['home', 'checkout']) {
    const chip = run(`tableChip("${place}")`);
    assert.match(chip, new RegExp(`<div class="table-chip table-chip-${place} table-chip-calls" role="group">`), place);
    assert.match(chip, /<button type="button" class="table-call-bell" onclick="tableCallsOpen\(\)" aria-haspopup="dialog"\s+aria-label="Call staff">[\s\S]*<span>Call<\/span><\/button>/);
    // "Not at this table?" sits under the name, the running calls in their own row (hidden while empty)
    assert.match(chip, /<strong>Table <bdi>7<\/bdi><\/strong>\s*<button type="button" class="table-chip-leave" onclick="tableAskLeave\(\)">Not at this table\?<\/button>\s*<\/div>/);
    assert.match(chip, /<\/button><div class="table-call-states" data-table-calls><\/div>/);
    assert.equal(chip.split('table-chip-leave').length, 2);
    assert.equal(chip.split('table-call-bell').length, 2);
    assert.match(chip, /<strong>Table <bdi>7<\/bdi><\/strong>/);
  }
  run('state.lang="ar"');
  assert.match(run('tableChip("home")'), /aria-label="نداء الموظف">[\s\S]*<span>نداء<\/span>/);
  // both Home structures and the checkout draw the same card
  const app = read('js/app.js');
  assert.equal(app.split('${tableChip("home") ||').length, 3);
  assert.equal(app.split('${tableChip("checkout") ||').length, 2);
});

test('service_calls false, missing (a server without 382) or not exactly true: the card is exactly as before, no bell', async () => {
  for (const extra of ['{service_calls:false}', '{service_calls:undefined}', '{service_calls:"true"}', '{service_calls:1}']) {
    const run = await atTable(extra);
    assert.equal(run('tableActive().serviceCalls'), false, extra);
    assert.equal(run('tableCallsOn()'), null, extra);
    const chip = run('tableChip("home")');
    assert.equal(/table-call|table-chip-calls|table-chip-foot/.test(chip), false, extra);
    assert.match(chip, /<div class="table-chip table-chip-home" role="group">[\s\S]*<\/div>\s*<button type="button" class="table-chip-leave" onclick="tableAskLeave\(\)">Not at this table\?<\/button>/);
    run('tableCallsOpen()');
    assert.equal(run.sheet(), null, extra);
    await run('tableCallSend("waiter")');
    assert.equal(run.sent(/table_call/).length, 0, extra);       // nothing is ever asked of the server
  }
  // not at a table, and a table remembered before this release
  const plain = environment('');
  assert.equal(plain('tableCallsBellMarkup()'), '');
  assert.equal(plain('tableCallsStateMarkup()'), '');
  const old = environment('');
  old.session.set(TABLE_STORE, JSON.stringify({key: KEY, label: '7', section: '', branchId: BRANCH, restaurantId: RESTAURANT, at: old.clock.now, guestOrders: true}));
  old('tableBoot()');
  assert.equal(old('tableCallsOn()'), null);
});

test('the bell opens a bottom sheet (not a popup) with three large choices; closing removes it', async () => {
  const run = await atTable();
  run('tableCallsOpen()');
  const sheet = run.sheet();
  assert.ok(sheet);
  assert.equal(sheet.className, 'cx-sheet table-call-sheet');
  assert.deepEqual(sheet.attrs, {role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'tableCallTitle'});
  const html = sheet.innerHTML;
  assert.match(html, /<h3 id="tableCallTitle">How can we help\?<\/h3>\s*<span>Table <bdi>7<\/bdi><\/span>/);
  assert.match(html, /onclick="tableCallSend\('waiter'\)" >[\s\S]*<strong>Call waiter<\/strong><small>Someone will come to your table\.<\/small>/);
  assert.match(html, /onclick="tableCallSend\('bill'\)" >[\s\S]*<strong>Ask for the bill<\/strong><small>We will bring it to your table\.<\/small>/);
  assert.match(html, /onclick="tableCallOther\(\)" >[\s\S]*<strong>Something else<\/strong><small>Tell us what you need\.<\/small>/);
  assert.equal(html.split('class="table-call-choice"').length, 4);
  assert.match(html, /class="cx-sheet-backdrop" onclick="tableCallsClose\(\)" aria-label="Close"/);
  assert.equal(html.includes('tableCallNote'), false);          // the text field only after "Something else"
  assert.equal(/alert\(|confirm\(|prompt\(/.test(read('js/table-calls.js')), false);
  run('tableCallsOpen()');                                      // a second tap does not stack a second sheet
  assert.equal(run.page.nodes.size, 1);
  run('tableCallsClose()');
  assert.equal(run.sheet(), null);
  run('state.lang="ar"; tableCallsOpen()');
  const ar = run.sheet().innerHTML;
  for (const words of ['كيف نخدمك؟', 'نداء النادل', 'طلب الفاتورة', 'شيء آخر', 'طاولة <bdi>7</bdi>']) assert.ok(ar.includes(words), words);
  for (const name of ['tableCallsOpen', 'tableCallsClose', 'tableCallOther', 'tableCallNoteInput', 'tableCallSend', 'tableCallCancel']) {
    assert.equal(run(`typeof window.${name}`), 'function', name);
  }
});

test('"Call waiter" sends oracy_table_call_v1 with the kind and the device\'s guest id; the card then says so', async () => {
  const run = await atTable('', (name) => name === 'oracy_table_call_v1' ? {ok: true, call: run('aCall()'), rang: true, next_ring_at: null} : {ok: true, calls: [run('aCall()')]});
  run('tableCallsOpen(); calls.length=0');
  await run('tableCallSend("waiter")');
  const sent = run.sent(/oracy_table_call_v1/);
  assert.equal(sent.length, 1);
  assert.deepEqual(Object.keys(sent[0].params).sort(), ['p_key', 'p_request']);
  assert.equal(sent[0].params.p_key, KEY);
  assert.deepEqual(Object.keys(sent[0].params.p_request).sort(), ['guest_id', 'kind']);
  assert.equal(sent[0].params.p_request.kind, 'waiter');
  assert.match(sent[0].params.p_request.guest_id, UUID);
  assert.equal(sent[0].params.p_request.guest_id, run('tableGuestId()'));
  assert.deepEqual(run.toasts(), ['Waiter called']);
  assert.equal(run.sheet(), null);                               // the sheet closes
  assert.equal(run.page.buzz, 1);                                // a short buzz where the phone can
  const chip = run('tableChip("home")');
  assert.match(chip, /class="table-call-bell on"/);
  assert.match(chip, /<span class="table-call-state table-call-open" role="status">\s*<i aria-hidden="true"><\/i>Waiter called · just now<\/span>/);
  // and it is watched: one read planned, no faster than the contract's 10 seconds
  const planned = run.pending();
  assert.equal(planned.length, 1);
  assert.equal(planned[0].ms, 12000);
  assert.ok(run('TABLE_CALL_POLL_MS') >= 10000);
});

test('the three kinds, each state and the minutes read as the contract\'s life of a call (Arabic too)', async () => {
  const run = await atTable();
  const text = (extra, ago = 0) => run(`tableCallStateText(tableCallTidy(aCall({created_at:new Date(Date.now()-${ago}).toISOString(),${extra}})))`);
  assert.equal(text(`kind:'waiter'`), 'Waiter called · just now');
  assert.equal(text(`kind:'waiter'`, 59 * 1000), 'Waiter called · just now');
  assert.equal(text(`kind:'waiter'`, MIN), 'Waiter called · 1 min');
  assert.equal(text(`kind:'waiter'`, 7.9 * MIN), 'Waiter called · 7 min');
  assert.equal(text(`kind:'waiter',status:'seen'`, 3 * MIN), 'Waiter is on the way');
  assert.equal(text(`kind:'bill'`, 2 * MIN), 'Bill requested · 2 min');
  assert.equal(text(`kind:'bill',status:'seen'`), 'Your bill is on the way');
  assert.equal(text(`kind:'other'`, MIN), 'Request sent · 1 min');
  assert.equal(text(`kind:'other',status:'seen'`), 'We are on it');
  assert.equal(text(`kind:'waiter',created_at:'not a time'`), 'Waiter called · just now');
  assert.equal(text(`kind:'waiter'`, 500 * MIN), 'Waiter called · 99 min');
  run('state.lang="ar"');
  assert.equal(text(`kind:'waiter'`, MIN), 'تم نداء النادل · 1 د');
  assert.equal(text(`kind:'waiter',status:'seen'`), 'النادل في الطريق');
  assert.equal(text(`kind:'bill'`), 'تم طلب الفاتورة · الآن');
  // the server's clock is used when the app knows the difference
  run('state.lang="en"; orderingHours.skew=120000');
  assert.equal(text(`kind:'waiter'`), 'Waiter called · 2 min');
});

test('the card follows the status function: called → on the way → gone when done; the reading stops when nothing runs', async () => {
  let list = [];
  const run = await atTable('', name => name === 'oracy_table_call_v1' ? {ok: true, call: run('aCall()'), rang: true} : {ok: true, calls: list});
  await run('tableCallSend("waiter")');
  run('calls.length=0');
  list = [run('aCall()')];
  run.clock.now += MIN;
  run.flushTimers(); await run.settle();
  let read1 = run.sent(/calls_status/);
  assert.equal(read1.length, 1);
  assert.deepEqual(read1[0].params, {p_key: KEY, p_guest_id: run('tableGuestId()')});
  assert.match(run('tableCallsStateMarkup()'), /Waiter called · 1 min/);
  assert.equal(run.pending().length, 1);
  list = [run(`aCall({status:'seen', seen_at:new Date().toISOString()})`)];
  run.flushTimers(); await run.settle();
  assert.match(run('tableCallsStateMarkup()'), /class="table-call-state table-call-seen"[\s\S]*Waiter is on the way/);
  assert.equal(run.pending().length, 1);
  list = [run(`aCall({status:'done', done_at:new Date().toISOString()})`)];   // finished calls stay in the answer for 10 minutes
  run.flushTimers(); await run.settle();
  assert.equal(run('tableCallsStateMarkup()'), '<div class="table-call-states" data-table-calls></div>');
  assert.match(run('tableChip("home")'), /class="table-call-bell" /);          // the bell is ready again
  assert.equal(run.pending().length, 0);                         // nothing running: no more reading
  assert.equal(run.sent(/calls_status/).length, 3);
});

test('reading is gentle: nothing while the tab is hidden, one read when it comes back, slower after errors', async () => {
  let fail = false, list = [];
  const run = await atTable('', name => { if (name === 'oracy_table_calls_status_v1') { if (fail) throw refuse('Failed to fetch'); return {ok: true, calls: list}; } return {ok: true, call: run('aCall()'), rang: true}; });
  await run('tableCallSend("waiter")');
  list = [run('aCall()')];
  run('calls.length=0');
  // hidden: the planned read does nothing and plans nothing
  run.page.hidden = true;
  run.flushTimers(); await run.settle();
  assert.equal(run.sent(/calls_status/).length, 0);
  assert.equal(run.pending().length, 0);
  // back: one read at once
  run.page.hidden = false;
  assert.equal(run.page.listeners.visibilitychange.length, 1);
  run.page.listeners.visibilitychange[0](); await run.settle();
  assert.equal(run.sent(/calls_status/).length, 1);
  assert.equal(run.pending()[0].ms, 12000);
  // errors: 24 s, 48 s, then a minute at the most; one good answer and it is 12 s again
  fail = true;
  const waits = [];
  for (let i = 0; i < 4; i++) { run.flushTimers(); await run.settle(); waits.push(run.pending()[0].ms); assert.equal(run.pending().length, 1); }
  assert.deepEqual(waits, [24000, 48000, 60000, 60000]);
  assert.match(run('tableCallsStateMarkup()'), /Waiter called/);  // what was known stays on the card
  assert.deepEqual(run.toasts().slice(1), []);                    // and no error is shown for a missed read
  fail = false;
  run.flushTimers(); await run.settle();
  assert.equal(run.pending()[0].ms, 12000);
  assert.equal(run.page.listeners['window:online'].length, 1);
});

test('with no call running the app does not poll at all: one read when the table is entered, then silence', async () => {
  const run = environment(`?t=${KEY}`);
  run.answers(name => name === 'oracy_table_scan_v1' ? run('scanOk()') : {ok: true, calls: []});
  run('tableBoot()');
  await run('tableSettled()'); await run.settle();
  assert.equal(run.sent(/calls_status/).length, 1);
  assert.equal(run.pending().length, 0);
  for (let i = 0; i < 3; i++) { run.clock.now += MIN; run.flushTimers(); await run.settle(); }
  assert.equal(run.sent(/calls_status/).length, 1);
  // a status the server cannot give ({ok:false}) shows nothing and ends nothing
  const odd = await atTable('', name => name === 'oracy_table_calls_status_v1' ? {ok: false} : null);
  await odd('tableCallsRefresh()');
  assert.equal(odd('tableActive().label'), '7');
  assert.match(odd('tableChip("home")'), /table-call-bell/);
  assert.equal(odd('tableCallsRunning().length'), 0);
  assert.deepEqual(odd.toasts(), []);
});

test('"Something else" asks for a short note: needed (2 characters), cleaned, at most 80, sent as note', async () => {
  const run = await atTable('', (name, params) => name === 'oracy_table_call_v1'
    ? {ok: true, call: run(`aCall({kind:'other'})`), rang: true} : {ok: true, calls: []});
  run('tableCallsOpen(); tableCallOther()');
  let html = run.sheet().innerHTML;
  assert.match(html, /<input class="field table-call-note" id="tableCallNote" type="text" maxlength="80" dir="auto"/);
  assert.match(html, /placeholder="e\.g\. extra plates, water"/);
  assert.match(html, /class="btn btn-primary table-call-send" onclick="tableCallSend\('other'\)" >Send<\/button>/);
  run('calls.length=0');
  for (const bad of ['', ' ', 'a', '\\n\\t ']) {
    run(`tableCallNoteInput("${bad}")`);
    await run('tableCallSend("other")');
    assert.equal(run.sent(/oracy_table_call_v1/).length, 0, JSON.stringify(bad));
    assert.match(run.sheet().innerHTML, /table-call-note invalid"[\s\S]*<p class="table-call-error" role="alert">Please write what you need\.<\/p>/);
  }
  run('tableCallNoteInput("x")');
  assert.equal(run('tableCalls.error'), '');                     // typing takes the error away
  run(`tableCallNoteInput("  Extra   plates\\n and water " + "!".repeat(200))`);
  assert.equal(run('tableCalls.note.length'), 80);
  await run('tableCallSend("other")');
  const sent = run.sent(/oracy_table_call_v1/);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].params.p_request.kind, 'other');
  assert.ok(sent[0].params.p_request.note.startsWith('Extra plates and water !!!'));
  assert.ok(sent[0].params.p_request.note.length <= 80);
  assert.deepEqual(run.toasts(), ['Request sent']);
  assert.equal(run('tableCalls.note'), '');
  assert.equal(run('TABLE_CALL_NOTE_MAX'), 80);
});

test('the server asking for the note says it under the field, in the visitor\'s language', async () => {
  const run = await atTable('', name => { if (name === 'oracy_table_call_v1') throw refuse(WRITE, {status: 400, code: 'P0001'}); return {ok: true, calls: []}; });
  run('state.lang="ar"; tableCallsOpen(); tableCallOther(); tableCallNoteInput("ماء")');
  await run('tableCallSend("other")');
  assert.equal(run('tableCalls.error'), 'يرجى كتابة ما تحتاجه.');
  assert.ok(run.sheet());                                        // the sheet stays open for the correction
  assert.deepEqual(run.toasts(), []);
});

test('calling again follows the server: told when it rang again, and when it did not (with the wait when known)', async () => {
  let answer;
  const run = await atTable('', name => name === 'oracy_table_call_v1' ? answer : {ok: true, calls: [run('aCall()')]});
  await run('tableCallsRefresh()');
  run('tableCallsOpen()');
  const html = run.sheet().innerHTML;
  assert.match(html, /table-call-row running table-call-open[\s\S]*onclick="tableCallSend\('waiter'\)"[\s\S]*<strong>Waiter called · just now<\/strong><small>Tap to call again<\/small>/);
  answer = {ok: true, call: run('aCall()'), rang: false, next_ring_at: new Date(run.clock.now + 90 * 1000).toISOString()};
  await run('tableCallSend("waiter")');
  assert.deepEqual(run.toasts(), ['Our staff already know. You can call again in 2 min.']);
  assert.equal(run.page.buzz, 0);
  run('toasts.length=0');
  answer = {ok: true, call: run('aCall({rings:5})'), rang: false, next_ring_at: null};   // the fifth ring was the last
  await run('tableCallSend("waiter")');
  assert.deepEqual(run.toasts(), ['Our staff already know.']);
  run('toasts.length=0');
  answer = {ok: true, call: run('aCall({rings:2})'), rang: true, next_ring_at: null};
  await run('tableCallSend("waiter")');
  assert.deepEqual(run.toasts(), ['Called again']);
  assert.equal(run.page.buzz, 1);
  assert.equal(run('tableCallsRunning().length'), 1);            // still one call of that kind
  run('state.lang="ar"; toasts.length=0');
  answer = {ok: true, call: run('aCall()'), rang: false, next_ring_at: new Date(run.clock.now + 30 * 1000).toISOString()};
  await run('tableCallSend("waiter")');
  assert.deepEqual(run.toasts(), ['موظفونا على علم بذلك. يمكنك النداء مجدداً بعد 1 د.']);
});

test('two quick taps send one call', async () => {
  let release;
  const run = await atTable('', name => name === 'oracy_table_call_v1' ? new Promise(resolve => { release = () => resolve({ok: true, call: run('aCall()'), rang: true}); }) : {ok: true, calls: []});
  run('tableCallsOpen(); calls.length=0');
  const first = run('tableCallSend("waiter")'), second = run('tableCallSend("waiter")'), third = run('tableCallSend("bill")');
  await run.settle();
  assert.equal(run.sent(/oracy_table_call_v1/).length, 1);
  assert.match(run.sheet().innerHTML, /class="table-call-choice" onclick="tableCallSend\('waiter'\)" disabled>/);   // the choices rest while it is sent
  release();
  await Promise.all([first, second, third]);
  assert.equal(run.sent(/oracy_table_call_v1/).length, 1);
  assert.equal(run('tableCalls.sending'), false);
});

test('"Our staff have been told…" (muted, or a limit): said once, then the bell rests quietly for ten minutes', async () => {
  for (const [lang, words] of [['en', TOLD], ['ar', 'تم إبلاغ موظفينا. يرجى الانتظار قليلاً.']]) {
    const run = await atTable('', name => { if (name === 'oracy_table_call_v1') throw refuse(TOLD, {status: 400, code: 'P0001'}); return {ok: true, calls: []}; });
    run(`state.lang='${lang}'; state.screen='home'; tableCallsOpen()`);
    await run('tableCallSend("waiter")');
    assert.deepEqual(run.toasts(), [words]);
    assert.equal(run.sheet(), null);
    assert.equal(/table-call/.test(run('tableChip("home")')), false);
    assert.equal(run('tableActive().label'), '7');               // still at the table, ordering as ever
    assert.equal(run('tableActive().serviceCalls'), true);
    run('tableCallsOpen()');
    assert.equal(run.sheet(), null);
    run.clock.now += 10 * MIN - 1000;
    assert.equal(/table-call-bell/.test(run('tableChip("home")')), false);
    run.clock.now += 1000;
    assert.match(run('tableChip("home")'), /table-call-bell/);   // and comes back by itself
  }
});

test('"Calling staff is not available here…": said once; the bell is gone for the visit, also after a reload', async () => {
  for (const [lang, words] of [['en', OFF], ['ar', 'نداء الموظف غير متاح هنا. يرجى سؤال أحد موظفينا.']]) {
    const run = await atTable('', name => { if (name === 'oracy_table_call_v1') throw refuse(OFF, {status: 400, code: 'P0001'}); return {ok: true, calls: []}; });
    run(`state.lang='${lang}'; tableCallsOpen()`);
    await run('tableCallSend("bill")');
    assert.deepEqual(run.toasts(), [words]);
    assert.equal(run.sheet(), null);
    assert.equal(run('tableActive().serviceCalls'), false);
    assert.equal(JSON.parse(run.session.get(TABLE_STORE)).serviceCalls, false);
    assert.equal(/table-call/.test(run('tableChip("checkout")')), false);
    assert.equal(run('tableActive().guestOrders'), true);        // nothing else about the table changes
    const again = environment('', run.shared);
    again('tableBoot()');
    assert.equal(again('tableCallsOn()'), null);
  }
});

test('the sticker refused while calling ends table mode like anywhere else; a server without the function hides the bell without a word', async () => {
  const gone = await atTable('', name => { if (name === 'oracy_table_call_v1') throw refuse(INACTIVE, {status: 400, code: 'P0001'}); return {ok: true, calls: []}; });
  gone('tableCallsOpen()');
  await gone('tableCallSend("waiter")');
  assert.equal(gone('tableActive()'), null);
  assert.equal(gone.session.has(TABLE_STORE), false);
  assert.deepEqual(gone.toasts(), [INACTIVE]);
  assert.equal(gone.sheet(), null);
  assert.equal(gone('tableChip("home")'), '');
  for (const where of ['oracy_table_call_v1', 'oracy_table_calls_status_v1']) {
    const run = await atTable('', name => { if (name === where) throw missing(); return {ok: true, calls: []}; });
    if (where === 'oracy_table_call_v1') { run('tableCallsOpen()'); await run('tableCallSend("waiter")'); } else await run('tableCallsRefresh()');
    assert.deepEqual(run.toasts(), [], where);
    assert.equal(run('tableActive().label'), '7', where);
    assert.equal(run('tableActive().serviceCalls'), false, where);
    assert.equal(/table-call/.test(run('tableChip("home")')), false, where);
    assert.equal(run.pending().length, 0, where);
  }
});

test('no connection: one friendly line, the bell stays, and ordering is never held up by a call', async () => {
  const run = await atTable('', name => { if (name === 'oracy_table_call_v1') throw refuse('Failed to fetch'); if (/create/.test(name)) return run('created()'); return {ok: true, calls: []}; });
  run('state.lang="ar"; tableCallsOpen()');
  await run('tableCallSend("waiter")');
  assert.deepEqual(run.toasts(), ['تعذر الوصول إلى موظفينا. حاول مرة أخرى.']);
  assert.match(run('tableChip("home")'), /table-call-bell/);
  assert.ok(run.sheet());                                        // still open to try again
  assert.equal(run('tableCalls.sending'), false);
  for (const odd of ['Invalid request', 'Order service is unavailable. Please try again.', '']) {
    run(`toasts.length=0; tableCallRefused(new Error(${JSON.stringify(odd)}))`);
    assert.deepEqual(run.toasts(), ['تعذر الوصول إلى موظفينا. حاول مرة أخرى.'], odd);   // internal words are never shown
  }
  // a call that hangs does not stop an order
  let hang;
  const busy = await atTable('', name => { if (name === 'oracy_table_call_v1') return new Promise(resolve => { hang = resolve; }); if (/create/.test(name)) return busy('created()'); return {ok: true, calls: []}; });
  const calling = busy('tableCallSend("waiter")');
  await busy.settle();
  busy(`state.screen='checkout'; tableGuestNameInput('Adeel')`);
  await busy('placeOrder()');
  assert.equal(busy('state.screen'), 'confirmation');
  assert.equal(busy.sent(/create/).length, 1);
  hang({ok: true, call: busy('aCall()'), rang: true});
  await calling;
});

test('"Cancel request" is offered only for this device\'s own call and uses the cancel function', async () => {
  let list = [];
  const run = await atTable('', name => name === 'oracy_table_call_cancel_v1' ? {ok: true, status: 'done'} : {ok: true, calls: list});
  list = [run(`aCall({note:undefined})`), {kind: 'bill', status: 'open', created_at: new Date(run.clock.now).toISOString(), seen_at: null, done_at: null, mine: false}];
  await run('tableCallsRefresh()');
  run('tableCallsOpen()');
  const html = run.sheet().innerHTML;
  assert.equal(html.split('class="table-call-cancel"').length, 2);                    // one: mine
  assert.ok(html.includes(`onclick="tableCallCancel('${CALL}')" >Cancel request</button>`));
  assert.match(html, /<strong>Bill requested · just now<\/strong>/);                   // the other device's call is shown, not owned
  list = [list[1]];
  run('calls.length=0');
  await run(`tableCallCancel('${CALL}')`);
  const sent = run.sent(/cancel/);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].params, {p_key: KEY, p_call_id: CALL, p_guest_id: run('tableGuestId()')});
  assert.deepEqual(run.toasts(), ['Request cancelled']);
  assert.equal(run('tableCallRunning("waiter")'), null);
  assert.ok(run('tableCallRunning("bill")'));
  await run(`tableCallCancel('not-an-id')`);                     // only a real id is ever sent
  assert.equal(run.sent(/cancel/).length, 1);
});

test('everything from the server is treated as text: unknown kinds and states are dropped, notes are escaped', async () => {
  const run = await atTable();
  assert.equal(run(`tableCallTidy({kind:'<img>',status:'open'})`), null);
  assert.equal(run(`tableCallTidy({kind:'waiter',status:'<script>'})`), null);
  assert.equal(run(`tableCallTidy(null)`), null);
  assert.equal(run(`tableCallTidy('waiter')`), null);
  const other = run(`JSON.stringify(tableCallTidy({kind:'other',status:'open',mine:false,id:'${CALL}',note:'secret',created_at:'2026-10-07T12:00:00Z'}))`);
  assert.deepEqual(JSON.parse(other), {kind: 'other', status: 'open', at: Date.parse('2026-10-07T12:00:00Z'), mine: false, id: null, note: ''});   // not mine: no id, no note kept
  assert.equal(run(`tableCallTidy(aCall({id:'x" onclick="alert(1)'})).id`), null);
  run.server = () => ({ok: true, calls: [run(`aCall({kind:'other', note:'<img src=x onerror=alert(1)>"\\u202e'})`), {kind: '"><script>', status: 'open'}, 7, null]});
  await run('tableCallsRefresh()');
  assert.equal(run('tableCalls.calls.length'), 1);
  run('tableCallsOpen()');
  const html = run.sheet().innerHTML + run('tableChip("home")');
  assert.equal(/<img|<script/i.test(html), false);
  assert.ok(html.includes('<em><bdi>&lt;img src=x onerror=alert(1)&gt;&quot;</bdi></em>'));
  // what the visitor types is escaped in the field too
  run(`tableCallsClose(); tableCalls.calls=[]; tableCallsOpen(); tableCallOther(); tableCallNoteInput('"><b>x')`);
  run('tableCallsSheetPaint(true)');
  assert.ok(run.sheet().innerHTML.includes('value="&quot;&gt;&lt;b&gt;x"'));
});

test('a reload in the middle of a call: the card shows it again from the server', async () => {
  const first = await atTable();
  const run = environment('', first.shared);
  run.answers(name => name === 'oracy_table_calls_status_v1' ? {ok: true, calls: [run(`aCall({created_at:new Date(Date.now()-3*60000).toISOString()})`)]} : null);
  run('tableBoot()');
  assert.equal(run.sent(/scan/).length, 0);                      // no new scan, as before
  run.flushTimers(); await run.settle();
  assert.equal(run.sent(/calls_status/).length, 1);
  assert.match(run('tableChip("home")'), /class="table-call-bell on"[\s\S]*Waiter called · 3 min/);
  assert.equal(run.pending().length, 1);
});

test('another table (a new scan) starts clean; leaving the table takes the calls with it', async () => {
  const run = await atTable('', name => name === 'oracy_table_calls_status_v1' ? {ok: true, calls: [run('aCall()')]} : null);
  await run('tableCallsRefresh()');
  run('tableCallsOpen()');
  assert.equal(run('tableCallsRunning().length'), 1);
  const next = environment(`?t=${KEY2}`, run.shared);
  next.answers(name => name === 'oracy_table_scan_v1' ? next(`scanOk({table_label:'12'})`) : {ok: true, calls: []});
  next('tableBoot()');
  await next('tableSettled()'); await next.settle();
  assert.equal(next('tableCallsRunning().length'), 0);
  assert.equal(next.sent(/calls_status/)[0].params.p_key, KEY2);
  // in the same tab: the table is left
  run('tableLeave()');
  assert.equal(run('tableCallsBellMarkup()'), '');
  assert.equal(run('tableCalls.calls.length'), 0);
  assert.equal(run.sheet(), null);
  assert.equal(run.pending().length, 0);
  // an answer that arrives for the table that was left is dropped
  let late;
  const slow = await atTable('', name => name === 'oracy_table_call_v1' ? new Promise(resolve => { late = resolve; }) : {ok: true, calls: []});
  const sending = slow('tableCallSend("waiter")');
  await slow.settle();
  slow('tableLeave()');
  late({ok: true, call: slow('aCall()'), rang: true});
  await sending;
  assert.equal(slow('tableCalls.calls.length'), 0);
  assert.deepEqual(slow.toasts(), []);
});

test('it works for a guest and for a signed-in customer: no sign-in needed, the token goes along when there is one', async () => {
  for (const token of [null, 'tok-123']) {
    const run = await atTable();
    const requests = [];
    run.set('fetch', async (url, options) => { requests.push({url, options});
      return {ok: true, status: 200, json: async () => /calls_status/.test(url) ? {ok: true, calls: []} : {ok: true, call: run('aCall()'), rang: true}}; });
    run.set('__token', token);
    run(`activeAccessToken=async()=>__token; state.isLoggedIn=${token ? 'true' : 'false'}; customerOrderRpc=realCustomerOrderRpc`);
    await run('tableCallSend("waiter")');
    const call = requests.filter(r => /\/rpc\/oracy_table_call_v1$/.test(r.url));
    assert.equal(call.length, 1, String(token));
    assert.equal(call[0].options.headers.Authorization, token ? 'Bearer tok-123' : undefined);
    const body = JSON.parse(call[0].options.body);
    assert.match(body.p_request.guest_id, UUID);                 // always sent: the contract needs it also when signed in
    assert.deepEqual(run.toasts(), ['Waiter called']);
  }
});

test('every new English string has Arabic; the refusals are the contract\'s words', () => {
  const run = environment('');
  const text = JSON.parse(run('JSON.stringify(TABLE_CALL_TEXT)'));
  assert.deepEqual(Object.keys(text.ar).sort(), Object.keys(text.en).sort());
  assert.ok(Object.keys(text.en).length >= 28);
  for (const key of Object.keys(text.en)) {
    assert.ok(text.en[key].trim().length > 0, key);
    assert.match(text.ar[key], /[؀-ۿ]/, key);
    assert.deepEqual((text.ar[key].match(/\{\w+\}/g) || []).sort(), (text.en[key].match(/\{\w+\}/g) || []).sort(), key);
  }
  assert.equal(text.en.off, OFF);
  assert.equal(text.en.told, TOLD);
  assert.equal(text.en.write, WRITE);
  for (const key of ['off', 'told', 'write']) assert.equal(/\bcode\b|points/i.test(text.en[key]), false, key);
  // nothing is drawn in English only: every word in the markup comes through tableCallText / tableText / t
  const source = read('js/table-calls.js');
  const markup = source.slice(source.indexOf('function tableCallsBellMarkup'), source.indexOf('function tableCallsSheetNode'));
  assert.equal(/>\s*[A-Z][a-z]+ [a-z][^<$]*</.test(markup), false);
});

/* ======================= 3. wiring ======================= */

test('the new files load in the right place, the changed files have new cache keys, the untouched keep theirs', () => {
  const html = read('index.html');
  const scripts = [...html.matchAll(/<script src="([^"?]+)\?v=([^"]+)"/g)].map(m => m[1]);
  assert.ok(scripts.indexOf('js/table-calls.js') > scripts.indexOf('js/table.js'));
  assert.ok(scripts.indexOf('js/table-calls.js') < scripts.indexOf('js/app.js'));
  assert.ok(scripts.indexOf('js/order-note.js') > scripts.indexOf('js/data.js'));
  assert.ok(scripts.indexOf('js/order-note.js') < scripts.indexOf('js/account-orders.js'));
  for (const file of ['js/table.js', 'js/table-calls.js', 'js/order-note.js', 'js/data.js', 'js/app.js', 'js/account-orders.js', 'css/table.css', 'css/order-note.css']) {
    assert.ok(html.includes(`${file}?v=20261007-1b"`), file);
  }
  for (const pin of ['js/brand-config.js?v=20261007-b1g', 'js/ordering-hours.js?v=20261007-b1g', 'js/order-addons.js?v=20261003-batche', 'js/push.js?v=20261004-pc1',
    'js/i18n.js?v=20261006-cx4f', 'js/rewards.js?v=20261003-batche', 'js/auth.js?v=20261003-gate4', 'css/theme.css?v=20261006-cx4i', 'js/theme.js?v=20261006-cx4c']) {
    assert.ok(html.includes(pin + '"'), pin);
  }
  const sheets = [...html.matchAll(/<link rel="stylesheet" href="([^"?]+)\?v=/g)].map(m => m[1]);
  assert.ok(sheets.includes('css/order-note.css'));
  assert.equal(sheets.at(-1), 'css/theme.css');
  // every call from the older files into the two new ones is guarded, so each still works alone
  for (const file of ['js/app.js', 'js/data.js', 'js/table.js', 'js/account-orders.js']) {
    const source = read(file);
    for (const m of source.matchAll(/\b(orderNoteClean|orderNoteFieldMarkup|orderNoteMarkup|tableCallsStart|tableCallsBellMarkup)\(/g)) {
      const line = source.slice(source.lastIndexOf('\n', m.index) + 1, source.indexOf('\n', m.index));
      if (/^\s*function /.test(line)) continue;
      assert.match(line, /typeof (orderNote|tableCalls)\w+ === ["']function["']/, `${file}: ${line.trim()}`);
    }
  }
});

test('the styles mirror by themselves in Arabic and stand still for reduced motion', () => {
  for (const file of ['css/table.css', 'css/order-note.css']) {
    assert.equal(/margin-(left|right)|padding-(left|right)|text-align:\s*(left|right)|\b(left|right):/.test(read(file)), false, file);
  }
  const css = read('css/table.css');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\n  \.table-call-bell, \.table-call-bell\.on svg, \.table-call-state, \.table-call-state i \{ animation: none; transition: none; \}/);
  assert.match(css, /\.table-call-states:empty \{ display: none; \}/);
  assert.match(css, /\.table-call-choice \{[^}]*min-height: 72px;/);                   // large choices
  assert.match(css, /\.table-call-bell \{[^}]*min-height: 44px;/);                     // a full touch target
  assert.match(read('js/table-calls.js'), /node\.className = "cx-sheet table-call-sheet";/);   // the app's own bottom sheet
});

test('a table move by staff asks nothing of the customer app (contract §5): the tracked order keeps what the device saved', () => {
  for (const file of ['js/app.js', 'js/data.js', 'js/table.js', 'js/table-calls.js', 'js/order-note.js']) {
    assert.equal(/move_order|oracy_pos_/.test(read(file)), false, file);
  }
});
