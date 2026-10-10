// Batch 3a (394): the cart is priced by the server and shows promotions.
// Built to API-3A-CONTRACT.md (sections 2, 3, 4, 6, 7, 8, 9, 10). Run: node --test tests/batch-3a.test.cjs. No network.
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
const ORDER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const TOKEN = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const KABAB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const LASSI = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3';
const DRINKS = 'aaaaaaaa-0000-4000-8000-0000000000d1';
const GRILL = 'aaaaaaaa-0000-4000-8000-0000000000d2';
const P_DRINKS = 'f0000000-0000-4000-8000-000000000001';
const P_FIVE = 'f0000000-0000-4000-8000-000000000002';
const P_LUNCH = 'f0000000-0000-4000-8000-000000000003';
const P_FREE = 'f0000000-0000-4000-8000-000000000004';
const ADDRESS = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const K1 = '6b218f9034efb281bc00e6b7b9dbe123';
const K2 = '11118f9034efb281bc00e6b7b9dbe999';
const K3 = '22228f9034efb281bc00e6b7b9dbe777';
const QUOTE = 'oracy_price_quote_v1';
const FAIL = 'We could not confirm the price. Check your connection and try again.';
const TABLE_STORE = 'oracy:meerath-kabab:table:v1';

/** One tab. Every server call goes to run.server(name, params, options). */
function environment(search = '', options = {}) {
  const local = options.local || new Map();
  const session = options.session || new Map();
  const clock = options.clock || {now: Date.parse('2026-10-08T10:00:00Z')};   // Thursday 13:00 in Riyadh
  class TestDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock.now])); }
    static now() { return clock.now; }
  }
  const box = map => ({getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key)});
  const location = {pathname: '/', search, hash: ''};
  const timers = [];
  const page = {hidden: false, listeners: {}, nodes: new Map(), active: null};
  const node = id => ({id, innerHTML: '', outerHTML: '', hidden: false, textContent: '', value: '',
    classList: {toggle() {}, remove() {}, add() {}}, setAttribute() {}, removeAttribute() {}, remove() { page.nodes.delete(this.id); }});
  let uuid = 0;
  const document = {
    get hidden() { return page.hidden; }, get activeElement() { return page.active; }, documentElement: {dataset: {}}, body: null,
    addEventListener: (name, fn) => { (page.listeners[name] ||= []).push(fn); },
    createElement: () => node(''),
    getElementById: id => page.nodes.get(id) || (id === 'app' ? {parentElement: {scrollTop: 0}} : null),
    querySelector: selector => page.nodes.get(selector) || null,
    querySelectorAll: () => [],
  };
  const context = vm.createContext({
    console: {log() {}, warn() {}, error() {}}, URL, URLSearchParams, Intl, Date: TestDate, AbortController, Promise,
    crypto: {randomUUID: () => `aaaaaaaa-aaaa-4aaa-8aaa-${String(++uuid).padStart(12, '0')}`},
    setTimeout: (fn, ms) => { timers.push({fn, ms}); return timers.length; },
    clearTimeout: id => { if (timers[id - 1]) timers[id - 1].fn = null; },
    setInterval: () => 1,
    navigator: {}, localStorage: box(local), sessionStorage: box(session), location,
    history: {state: null, replaceState: (state, _title, url) => {
      if (url === undefined) return;
      const next = new URL(url, 'https://app.example');
      Object.assign(location, {pathname: next.pathname, search: next.search, hash: next.hash});
    }},
    window: {addEventListener: (name, fn) => { (page.listeners['window:' + name] ||= []).push(fn); }},
    document,
  });
  for (const file of ['brand-config.js', 'data.js', 'ordering-hours.js', 'table.js', 'table-calls.js', 'order-note.js', 'auth.js', 'account-orders.js', 'account-addresses.js',
    'content.js', 'delivery-location.js', 'rewards.js', 'promo-reasons.js', 'cart-quote.js', 'promotions.js', 'push.js']) {
    vm.runInContext(read(`js/${file}`), context);
  }
  const app = read('js/app.js');
  vm.runInContext(app.slice(0, app.lastIndexOf('\napplyDir();')), context);
  vm.runInContext(read('js/order-addons.js').replace(/\nif \(typeof setInterval[\s\S]*$/, '\n'), context);
  vm.runInContext(`
    const I18N={en:{sar:'SAR',dineIn:'Dine-in',takeaway:'Takeaway',delivery:'Delivery',total:'Total',coupon:'Coupon code',applyCoupon:'Apply code',couponOk:'Coupon applied',
      couponBad:'Invalid code',deliveryFee:'Delivery fee',signInRequired:'Please sign in to place your order.',placeOrder:'Place order',add:'Add',bestSeller:'Best Seller'},
      ar:{sar:'ر.س',dineIn:'داخل المطعم',total:'الإجمالي',coupon:'كود الخصم',deliveryFee:'رسوم التوصيل',couponOk:'تم تطبيق الكود'}};
    const toasts=[]; const calls=[]; let draws=0; const realCustomerOrderRpc=customerOrderRpc;
    toast=message=>{toasts.push(message)}; render=()=>{draws++; tableEnforce()}; renderKeepScroll=()=>{draws++; tableEnforce()};
    go=screen=>{state.screen=screen};
    validateMenuCart=async()=>true; refreshTrackedCustomerOrder=async()=>{}; refreshMenu=async()=>({ok:true});
    let summaries=0; updateCheckoutSummary=()=>{summaries++};
    loadRewardsSummary=async()=>null; loadCustomerProfile=async()=>{profileReads++}; let profileReads=0;
    CATEGORIES=[{id:'${GRILL}',name:'Grill',nameAr:'مشاوي'},{id:'${DRINKS}',name:'Drinks',nameAr:'مشروبات'}]; SUBCATEGORIES=[];
    ITEMS=[{id:'${KABAB}',category:'${GRILL}',subcategory:null,name:'Seekh Kabab',nameAr:'سيخ كباب',desc:'',descAr:'',price:23,basePrice:23,available:true,offer:null,options:[]},
           {id:'${LASSI}',category:'${DRINKS}',subcategory:null,name:'Lassi',nameAr:'لاسي',desc:'',descAr:'',price:15,basePrice:15,available:true,offer:null,options:[]}];
    menuConnection.status='ready';menuConnection.lastSuccess=Date.now();
    menuConnection.payload={branches:[{id:'${BRANCH}'}],schedules:[]};
    const cartOf=(kabab=2,lassi=1)=>[{id:'${KABAB}',cartKey:'l1',qty:kabab,price:23,basePrice:23,extras:[],size:'regular',choice:null,spice:'medium',notes:''},
      ...(lassi?[{id:'${LASSI}',cartKey:'l2',qty:lassi,price:15,basePrice:15,extras:[],size:'regular',choice:null,spice:'medium',notes:''}]:[])];
    state.cart=cartOf(); state.orderType='takeaway'; state.screen='cart';
    const signIn=()=>{Object.assign(state,{isLoggedIn:true,authUserId:'99999999-9999-4999-8999-999999999999',customerName:'Adeel',customerPhone:'0500000000',
      customer:{name:'Adeel',mobile:'0500000000',email:''}})};
    const created=(extra={})=>({ok:true,id:'${ORDER}',order_number:'MK-0031',tracking_token:'${TOKEN}',status:'pending_confirmation',duplicate:false,
      total:54,discount:7,delivery_fee:0,vat_amount:7.04,created_at:'2026-10-08T10:00:00Z',order_note:null,
      promotions:[{promotion_id:'${P_DRINKS}',name_en:'Drinks 20 %',name_ar:'مشروبات',text_en:'20 % off all drinks',text_ar:'',kind:'percent',value:20,level:'item',amount:2},
                  {promotion_id:'${P_FIVE}',name_en:'Five off',name_ar:'',text_en:'5.00 off your order',text_ar:'خصم ٥ على طلبك',kind:'amount',value:5,level:'order',amount:5}],
      quote_key:'${K1}',...extra});
    const scanOk=(extra={})=>({ok:true,restaurant_id:'${RESTAURANT}',branch_id:'${BRANCH}',table_label:'7',section:'Terrace',guest_orders:true,service_calls:false,...extra});
  `, context);
  const run = code => vm.runInContext(code, context);
  run.server = () => { throw Object.assign(new Error('Order service is unavailable. Please try again.'), {status: 404, code: 'PGRST202'}); };
  context.__server = (name, params, options) => run.server(name, params, options);
  run(`customerOrderRpc=async(name,params,options)=>{calls.push({name,params:JSON.parse(JSON.stringify(params))}); return __server(name,params,options);}`);
  run.set = (name, value) => { context[name] = value; };
  run.timers = timers; run.clock = clock; run.page = page; run.local = local; run.session = session;
  run.shared = {local, session, clock};
  run.settle = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };
  /** Runs the timers that are due (all of them), then lets the answers land; repeats while new timers of 0 ms appear. */
  run.tick = async (maxMs = 60000) => {   // the 15-minute life of a price (C1) is run by hand where a test needs it
    for (let round = 0; round < 6; round++) {
      const due = timers.filter(timer => timer.fn && timer.ms <= maxMs);
      if (!due.length) break;
      for (const timer of due) { const fn = timer.fn; timer.fn = null; fn(); }
      await run.settle();
    }
    await run.settle();
  };
  run.pending = () => timers.filter(timer => timer.fn && timer.ms < 60000);   // the life of a price (C1) is checked on its own
  run.lifeTimers = () => timers.filter(timer => timer.fn && timer.ms >= 60000);
  run.sent = pattern => JSON.parse(run('JSON.stringify(calls)')).filter(call => pattern.test(call.name));
  run.toasts = () => JSON.parse(run('JSON.stringify(toasts)'));
  run.json = code => JSON.parse(run(`JSON.stringify(${code})`));
  return run;
}
const refuse = (message, extra = {}) => Object.assign(new Error(message), extra);
const missing = () => refuse('Order service is unavailable. Please try again.', {status: 404, code: 'PGRST202'});
const offline = () => refuse('Failed to fetch');

/** The contract's own example (section 2), as a function of what was asked. */
function quoteFor(cart, extra = {}) {
  const prices = {[KABAB]: 23, [LASSI]: 15};
  const names = {[KABAB]: 'Seekh Kabab', [LASSI]: 'Lassi'};
  const lines = cart.items.map((line, n) => ({n, menu_item_id: line.menu_item_id, name: names[line.menu_item_id], quantity: line.quantity,
    unit_price: prices[line.menu_item_id], line_total: prices[line.menu_item_id] * line.quantity, item_offer: false, choices: [], reductions: [], net_total: prices[line.menu_item_id] * line.quantity}));
  const items = lines.reduce((n, l) => n + l.line_total, 0);
  const vat = total => Math.round(total * 15 / 115 * 100) / 100;
  return {ok: true, restaurant_id: RESTAURANT, branch_id: BRANCH, channel: cart.table_key ? 'table_qr' : 'app', order_type: cart.order_type || 'dinein', currency: 'SAR', signed_in: true,
    lines, items_total: items, applied: [], not_applied: [], code: cart.code ? {code: cart.code, applied: false, reason: 'code_not_valid'} : null, points: null,
    promotion_discount: 0, voucher_discount: 0, points_value: 0, discount_total: 0, delivery: null, delivery_fee: null,
    total: items, vat_amount: vat(items), total_is_final: true, quote_key: K1, ...extra};
}
const drinks = (amount = 2) => ({promotion_id: P_DRINKS, name_en: 'Drinks 20 %', name_ar: 'مشروبات', text_en: '20 % off all drinks', text_ar: '', kind: 'percent', value: 20, max_discount: null, level: 'item', amount, revision: 2});
const five = () => ({promotion_id: P_FIVE, name_en: 'Five off', name_ar: '', text_en: '5.00 off your order', text_ar: 'خصم ٥ على طلبك', kind: 'amount', value: 5, max_discount: null, level: 'order', amount: 5, revision: 2});
const lunch = (extra = {}) => ({promotion_id: P_LUNCH, name_en: 'Lunch 10 %', name_ar: 'خصم الغداء', text_en: '10 % off from 60.00, Sunday to Thursday 12-4 pm', text_ar: 'خصم ١٠٪', kind: 'percent', value: 10, max_discount: 25, level: 'order', ...extra});
/** 2 kabab + 1 lassi with the two promotions of the contract's example: 61.00 -> 54.00. */
function promoQuote(cart, extra = {}) {
  const q = quoteFor(cart);
  if (q.lines[0]) { q.lines[0].reductions = [{promotion_id: P_FIVE, amount: 3.9}]; q.lines[0].net_total = q.lines[0].line_total - 3.9; }
  if (q.lines[1]) { q.lines[1].reductions = [{promotion_id: P_DRINKS, amount: 2}, {promotion_id: P_FIVE, amount: 1.1}]; q.lines[1].net_total = q.lines[1].line_total - 3.1; }
  return {...q, applied: [drinks(), five()], promotion_discount: 7, discount_total: 7, total: q.items_total - 7, vat_amount: 7.04, ...extra};
}
/** A tab on a 394 database, signed in, with the cart open and its first price answered. */
async function priced(server, options = {}) {
  const run = environment(options.search || '', options);
  if (options.guest !== true) run('signIn()');
  run.server = server || ((name, params) => name === QUOTE ? quoteFor(params.p_cart) : run('created()'));
  if (options.before) run(options.before);
  run('cartSummaryMarkup()');          // the cart is drawn: the price is asked
  await run.tick();
  run('toasts.length=0; draws=0');
  return run;
}
const quotes = run => run.sent(/oracy_price_quote_v1/);
const orders = run => run.sent(/oracy_create_/);

/* ======================= A. which database: 394 or before ======================= */

test('a database without the price function is an old database for this visit: the cart, the code and the order are exactly those of before', async () => {
  for (const failure of [missing(), refuse('x', {status: 404}), refuse('x', {status: 400, code: '42883'})]) {
    const run = environment('');
    run('signIn()');
    run.server = (name, params) => {
      if (name === QUOTE) throw failure;
      if (name === 'oracy_voucher_check_v1') return {ok: true, code: 'SAVE10', kind: 'percent', value: 10, max_discount: null, min_food: 0, allow_with_offers: true};
      return run('created({total:54.9,promotions:undefined,discount:undefined,quote_key:undefined})');
    };
    const before = run('cartQuote.raw=true; const m=cartSummaryMarkup(); cartQuote.raw=false; m');
    run('cartSummaryMarkup()');
    await run.tick();
    assert.equal(run('cartQuote.support'), 'no');
    assert.equal(run('cartSummaryMarkup()'), before);                       // the breakdown of before, to the letter
    assert.doesNotMatch(run('cartSummaryMarkup()'), /pq-/);
    assert.equal(run('cartQuoteCodeBox()'), null);
    assert.match(run('couponBoxMarkup()'), /placeholder="Coupon code"/);     // the voucher field of before
    assert.equal(run('totals().quoted'), undefined);
    // the price function is not asked again on this visit
    run('state.cart[0].qty=3; cartSummaryMarkup()');
    await run.tick();
    assert.equal(quotes(run).length, 1);
    // the code is the voucher check of before
    run(`state.coupon='save10'`);
    await run('applyCoupon()');
    assert.equal(run.sent(/voucher_check/).length, 1);
    assert.equal(run('state.voucher.code'), 'SAVE10');
    assert.equal(run('totals().discount'), 8.4);                             // the app's own sum, as before (10 % of 84)
    // the order: the function of before, no key, the fee of before
    await run('createOrderAfterVerification()');
    const sent = orders(run);
    assert.deepEqual(sent.map(call => call.name), ['oracy_create_customer_order_v2']);
    assert.equal('quote_key' in sent[0].params.p_order, false);
    assert.equal(sent[0].params.p_order.coupon_code, 'SAVE10');
    assert.equal('expected_delivery_fee' in sent[0].params.p_order, true);
    assert.equal(run('state.screen'), 'confirmation');
    assert.equal(run('state.order.quoted'), undefined);
    assert.equal(run('orderNoteLine(state.order)'), '');                     // no new lines on the order's cards
  }
});

test('old database, at a table: the old table functions, signed in and as a guest', async () => {
  for (const guest of [false, true]) {
    const run = environment(`?t=${KEY}`);
    if (!guest) run('signIn()');
    run.server = name => { if (name === QUOTE) throw missing(); return name === 'oracy_table_scan_v1' ? run('scanOk()') : run('created({table_label:"7",promotions:undefined})'); };
    run('tableBoot()'); await run('tableSettled()'); await run.settle();
    if (guest) run(`tableGuest.name='Sara'`);
    run('cartSummaryMarkup()'); await run.tick();
    assert.equal(run('cartQuote.support'), 'no');
    await run('createOrderAfterVerification()');
    assert.deepEqual(orders(run).map(call => call.name), [guest ? 'oracy_create_table_guest_order_v1' : 'oracy_create_table_order_v1']);
    assert.equal('quote_key' in orders(run)[0].params.p_order, false);
  }
});

test('the database is found out by the price call itself, again after a reload, and never from memory', async () => {
  const first = environment('');
  first('signIn()');
  first.server = name => { if (name === QUOTE) throw missing(); return {}; };
  first('cartSummaryMarkup()'); await first.tick();
  assert.equal(first('cartQuote.support'), 'no');
  // the same device after a reload (the migration was applied in between)
  const again = environment('', first.shared);
  again('signIn()');
  assert.equal(again('cartQuote.support'), 'unknown');
  again.server = (name, params) => quoteFor(params.p_cart);
  again('cartSummaryMarkup()'); await again.tick();
  assert.equal(again('cartQuote.support'), 'yes');
  for (const map of [first.local, first.session]) for (const [key, value] of map) assert.doesNotMatch(`${key}${value}`, /quote|394|support/i);
});

test('no answer at all (no connection) and the database not known yet: no order is sent, and the customer is told why', async () => {
  const run = environment('');
  run('signIn()');
  run.server = name => { if (name === QUOTE) throw offline(); return run('created()'); };
  run('cartSummaryMarkup()'); await run.tick(0);
  assert.equal(run('cartQuote.support'), 'unknown');
  assert.doesNotMatch(run('cartSummaryMarkup()'), /pq-/);          // nothing new on the screen of an unknown database
  run(`state.screen='checkout'`);
  await run('createOrderAfterVerification()');
  assert.equal(orders(run).length, 0);
  assert.deepEqual(run.toasts().slice(-1), [FAIL]);
  assert.equal(run('state.cart.length'), 2);
  assert.equal(run('state.orderSubmitting'), false);
});

/* ======================= B. the price module ======================= */

test('what is asked: the lines of the order, the order type, the code, the points, the address — and nothing that names the customer', async () => {
  const run = await priced();
  let sent = quotes(run)[0].params;
  assert.deepEqual(sent, {p_restaurant_id: RESTAURANT, p_branch_id: BRANCH, p_cart: {order_type: 'takeaway',
    items: [{menu_item_id: KABAB, quantity: 2, choices: []}, {menu_item_id: LASSI, quantity: 1, choices: []}]}});
  // a choice goes with its permanent id, exactly as the order sends it
  run(`ITEMS[1].options=[{id:'c1',rowId:'77777777-7777-4777-8777-777777777777',name:'Mango',nameAr:'',type:'Add-on',price:5,enabled:true,required:false}];
    state.cart[1].extras=['c1']; state.redeemPoints=500; cartQuote.code='SUMMER'; cartSummaryMarkup()`);
  await run.tick();
  sent = quotes(run)[1].params.p_cart;
  assert.deepEqual(sent.items[1], {menu_item_id: LASSI, quantity: 1, choices: [{name: 'Mango', type: 'Add-on', id: '77777777-7777-4777-8777-777777777777'}]});
  assert.equal(sent.code, 'SUMMER');
  assert.equal(sent.redeem_points, 500);
  assert.equal(sent.customer_phone, '0500000000');     // only with a code, for the vouchers of before
  for (const key of Object.keys(sent)) assert.ok(['order_type', 'items', 'code', 'redeem_points', 'customer_phone'].includes(key), key);
  assert.deepEqual(run.json('cartQuoteItems(state.cart)'), sent.items);
});

test('delivery: the address goes with the cart only once it is the one on the checkout; before that the fee is "at the next step"', async () => {
  const run = environment('');
  run('signIn()');
  run(`state.orderType='delivery'; state.savedAddresses=[{id:'${ADDRESS}',updatedAt:'v1',latitude:24.7,longitude:46.7,type:'home'}]; state.defaultAddressId='${ADDRESS}';
    validDeliveryPin=()=>true; deliveryQuoteFingerprint=()=> 'k'; refreshDeliveryQuote=async()=>null;`);
  run.server = (name, params) => quoteFor(params.p_cart, params.p_cart.delivery_address_id
    ? {delivery: {known: true, eligible: true, fee_before: 15, reduction: 15, fee: 0, quote: {}}, delivery_fee: 0, total: 61,
       applied: [{promotion_id: P_FREE, name_en: 'Free delivery', text_en: 'Free delivery this week', text_ar: 'توصيل مجاني هذا الأسبوع', kind: 'delivery_percent', value: 100, level: 'delivery', amount: 15}]}
    : {delivery: {known: false, reason: 'address_needed'}, delivery_fee: null, total_is_final: false});
  run('cartSummaryMarkup()'); await run.tick();
  assert.equal('delivery_address_id' in quotes(run)[0].params.p_cart, false);
  let page = run('cartSummaryMarkup()');
  // C8: before an address: the food total, said to be the food total, and the fee to come — no fee line, never "0.00 delivery"
  assert.match(page, /class="total pq-food-total"><span>Food total<\/span><span>SAR 61\.00/);
  assert.match(page, /pq-pending" role="status">Delivery fee added when you choose your address\./);
  assert.doesNotMatch(page, /Delivery fee<\/span>/);
  assert.equal(run('totals().final'), false);
  assert.equal(run('cartQuoteTotalLabel()'), 'Food total');
  // the checkout shows the address: now it is part of the price
  run(`state.screen='checkout'; state.checkoutPinConfirmedId='${ADDRESS}'; state.checkoutPinConfirmedVersion='v1'; cartSummaryMarkup()`);
  await run.tick();
  assert.equal(quotes(run).at(-1).params.p_cart.delivery_address_id, ADDRESS);
  page = run('cartSummaryMarkup()');
  assert.match(page, /Delivery fee<\/span><span><s class="pq-was">SAR 15\.00<\/s> Free<\/span>/);
  assert.match(page, /pq-delivery-offer">Free delivery this week</);
  assert.doesNotMatch(page, /Offers applied/);          // the delivery offer is on the fee's own line, not counted twice
  assert.match(page, /class="total"><span>Total<\/span><span>SAR 61\.00/);
  // an order without a final total is not sent
  run(`state.checkoutPinConfirmedId=null; cartSummaryMarkup()`); await run.tick();
  const out = await run('cartQuoteForOrder()');
  assert.equal(out.stop, true);
  assert.match(run.toasts().at(-1), /Choose your delivery address/);
});

test('at a table the sticker key is sent and no ids; a guest carries no code and no points', async () => {
  for (const guest of [true, false]) {
    const run = environment(`?t=${KEY}`);
    if (!guest) run('signIn()');
    run.server = (name, params) => name === 'oracy_table_scan_v1' ? run('scanOk()') : quoteFor(params.p_cart);
    run('tableBoot()'); await run('tableSettled()'); await run.settle();
    run(`cartQuote.code='SUMMER'; state.redeemPoints=200; cartSummaryMarkup()`);
    await run.tick();
    const sent = quotes(run)[0].params;
    assert.equal(sent.p_restaurant_id, null);
    assert.equal(sent.p_branch_id, null);
    assert.equal(sent.p_cart.table_key, KEY);
    assert.equal('order_type' in sent.p_cart, false);
    assert.equal('code' in sent.p_cart, !guest);
    assert.equal('redeem_points' in sent.p_cart, !guest);
    if (guest) assert.deepEqual(Object.keys(sent.p_cart).sort(), ['items', 'table_key']);
  }
});

test('the first price is asked at once; a change waits 400 ms; several quick changes are one question', async () => {
  const run = await priced();
  assert.equal(quotes(run).length, 1);
  for (const qty of [3, 4, 5]) run(`state.cart[0].qty=${qty}; cartSummaryMarkup()`);
  const waiting = run.pending().filter(timer => timer.ms === 400);
  assert.equal(waiting.length, 1);                      // the earlier two were cancelled
  assert.equal(run('cartQuote.status'), 'updating');
  assert.equal(quotes(run).length, 1);                  // nothing sent while the customer is still tapping
  await run.tick();
  assert.equal(quotes(run).length, 2);
  assert.equal(quotes(run)[1].params.p_cart.items[0].quantity, 5);
  assert.equal(run('cartQuote.status'), 'fresh');
  // drawing the same cart again asks nothing
  run('cartSummaryMarkup(); cartSummaryMarkup(); totals()'); await run.tick();
  assert.equal(quotes(run).length, 2);
  assert.ok(Number(run('CART_QUOTE_DEBOUNCE_MS')) >= 300 && Number(run('CART_QUOTE_DEBOUNCE_MS')) <= 500);
});

test('one question in flight: a newer one stops the older, and an answer for an older cart never reaches the screen', async () => {
  const run = environment('');
  run('signIn()');
  const flights = [];
  run.server = (name, params, options) => new Promise((resolve, reject) => {
    const controller = new AbortController();
    if (options && options.onStart) options.onStart(controller);
    flights.push({params, resolve, reject, controller, timeout: options && options.timeoutMs});
  });
  run('cartSummaryMarkup()'); await run.tick();
  assert.equal(flights.length, 1);
  assert.equal(flights[0].timeout, 9000);
  run('state.cart[0].qty=5; cartSummaryMarkup()'); await run.tick();
  assert.equal(flights.length, 2);
  assert.equal(flights[0].controller.signal.aborted, true);       // the one in flight was stopped
  assert.equal(flights[1].controller.signal.aborted, false);
  // the old answer arrives late (and with a tempting price): dropped
  flights[0].resolve(quoteFor(flights[0].params.p_cart, {total: 1, quote_key: K3}));
  await run.settle();
  assert.equal(run('cartQuote.quote'), null);
  assert.equal(run('cartQuote.status'), 'updating');
  flights[1].resolve(quoteFor(flights[1].params.p_cart, {quote_key: K2}));
  await run.settle();
  assert.equal(run('cartQuote.quote.quote_key'), K2);
  assert.equal(run('totals().total'), 130);
  // an answer that is not the contract's shape is no answer
  for (const bad of [null, {ok: false}, {...quoteFor(flights[1].params.p_cart), quote_key: 'short'}, {...quoteFor(flights[1].params.p_cart), lines: []},
    {...quoteFor(flights[1].params.p_cart), total: 'x'}]) {
    assert.equal(run.json(`cartQuoteClean(${JSON.stringify(bad)}, 2)`), null);
  }
});

test('the server\'s numbers are the ones on the screen: lines, offers applied with their own words, total and VAT', async () => {
  const run = await priced((name, params) => promoQuote(params.p_cart));
  const tot = run.json('totals()');
  assert.equal(tot.total, 54);
  assert.equal(tot.vat, 7.04);
  assert.equal(tot.foodTotal, 54);
  assert.equal(tot.promotions, 7);
  assert.equal(tot.quoted, true);
  const page = run('cartSummaryMarkup()');
  assert.match(page, /Items total \(VAT included\)<\/span><span>SAR 61\.00/);
  assert.match(page, /Offers applied/);
  assert.match(page, /pq-applied"><span>20 % off all drinks<\/span><span>− SAR 2\.00/);
  assert.match(page, /pq-applied"><span>5\.00 off your order<\/span><span>− SAR 5\.00/);
  assert.match(page, /class="total"><span>Total<\/span><span>SAR 54\.00/);
  assert.match(page, /Includes VAT 15%<\/span><span>SAR 7\.04/);
  // the lines: the reduced amount with the regular one struck through
  assert.equal(run('cartQuoteLineInner(0)'), '<s class="pq-was">SAR 46.00</s> <span class="pq-now">SAR 42.10</span>');
  assert.equal(run('cartQuoteLineInner(1)'), '<s class="pq-was">SAR 15.00</s> <span class="pq-now">SAR 11.90</span>');
  assert.match(run('cart()'), /cart-line-total"><s class="pq-was">SAR 46\.00<\/s> <span class="pq-now">SAR 42\.10<\/span><\/strong>/);
  assert.match(run('checkoutOrderLinesMarkup()'), /Lassi<\/span><span><s class="pq-was">SAR 15\.00<\/s> <span class="pq-now">SAR 11\.90/);
  // Arabic: the server's Arabic text, and its English one where the Arabic is empty
  run(`state.lang='ar'`);
  const arabic = run('cartSummaryMarkup()');
  assert.match(arabic, /العروض المطبقة/);
  assert.match(arabic, /خصم ٥ على طلبك/);
  assert.match(arabic, /20 % off all drinks/);
  // a promotion's words are the server's: shown escaped
  const sharp = await priced((name, params) => promoQuote(params.p_cart, {applied: [{...five(), text_en: '<img src=x onerror=1>'}]}));
  assert.match(sharp('cartSummaryMarkup()'), /&lt;img src=x onerror=1&gt;/);
  assert.doesNotMatch(sharp('cartSummaryMarkup()'), /<img/);
});

test('a line without a promotion is shown as before; an item\'s own old offer keeps its "Offer savings" line', async () => {
  const run = await priced((name, params) => {
    const q = quoteFor(params.p_cart);
    q.lines[0].unit_price = 20; q.lines[0].line_total = 40; q.lines[0].net_total = 40; q.lines[0].item_offer = true;
    return {...q, items_total: 55, total: 55, vat_amount: 7.17};
  }, {before: `ITEMS[0].price=20; ITEMS[0].offer={type:'fixed',discount:3,maxQty:null,minRegularSpend:0}; state.cart[0].price=20;`});
  assert.equal(run('cartQuoteLineInner(0)'), '');
  const page = run('cartSummaryMarkup()');
  assert.match(page, /Items total \(VAT included\)<\/span><span>SAR 61\.00/);
  assert.match(page, /Offer savings<\/span><span>− SAR 6\.00/);
  assert.match(page, /Total<\/span><span>SAR 55\.00/);
  assert.doesNotMatch(page, /Offers applied/);
});

test('while a price is on its way: the app\'s own sum when the last answer equalled it, else the last price held — the total moves once', async () => {
  // 1. no promotion: the sum is right, so it is shown at once and the answer changes nothing
  const plain = await priced();
  plain('state.cart[0].qty=3; cartSummaryMarkup()');
  assert.equal(plain('cartQuote.status'), 'updating');
  assert.equal(plain('totals().total'), 84);                        // 3 × 23 + 15, at once
  assert.equal(plain('totals().quoted'), undefined);
  assert.match(plain('cartSummaryMarkup()'), /pq-state" role="status">Updating price…/);
  await plain.tick();
  assert.equal(plain('totals().total'), 84);                        // confirmed: no jump
  assert.match(plain('cartSummaryMarkup()'), /pq-state pq-state-ok/);
  // 2. a promotion is applied: the app's sum would be wrong, so the last price stays (dimmed) until the answer
  const promo = await priced((name, params) => promoQuote(params.p_cart, {quote_key: params.p_cart.items[0].quantity === 2 ? K1 : K2}));
  promo('state.cart[0].qty=3; cartSummaryMarkup()');
  assert.equal(promo('totals().total'), 54);                        // not 84 and then 77: it waits
  assert.equal(promo('totals().held'), true);
  const held = promo('cartSummaryMarkup()');
  assert.match(held, /class="total pq-wait"/);
  assert.match(held, /Updating price…/);
  assert.doesNotMatch(held, /pq-hint/);                              // no hint from a price that is not this cart's
  assert.equal(promo('cartQuoteLineInner(0)'), '');
  await promo.tick();
  assert.equal(promo('totals().total'), 77);                        // one move
  assert.equal(promo('totals().held'), false);
  assert.doesNotMatch(promo('cartSummaryMarkup()'), /pq-wait/);
});

test('an open cart asks again after 90 seconds, quietly: nothing on the screen changes while it does', async () => {
  const run = await priced((name, params) => promoQuote(params.p_cart));
  run.clock.now += 91000;
  run('cartSummaryMarkup()');
  assert.equal(run('cartQuote.status'), 'fresh');                   // not "updating"
  assert.doesNotMatch(run('cartSummaryMarkup()'), /Updating price|pq-wait/);
  await run.tick();
  assert.equal(quotes(run).length, 2);
  assert.equal(run('draws'), 0);                                    // the same price: nothing drawn again
  // a changed menu, a promotion's hour and coming back online make the price old at once
  run.server = (name, params) => promoQuote(params.p_cart, {total: 50, quote_key: K2});
  run('cartQuoteStale()'); await run.tick();
  assert.equal(quotes(run).length, 3);
  assert.equal(run('totals().total'), 50);
  assert.match(read('js/data.js'), /if \(changed && typeof cartQuoteStale === "function"\) cartQuoteStale\(\);/);
});

/* ======================= C. offline and slow ======================= */

test('no connection on a 394 database: the menu prices stay, "confirmed when you are online", two quiet retries, and Try again', async () => {
  const run = await priced();
  let online = false;
  run.server = (name, params) => { if (!online) throw offline(); return quoteFor(params.p_cart); };
  run('state.cart[0].qty=3; cartSummaryMarkup()');
  await run.tick(400);
  assert.equal(run('cartQuote.status'), 'failed');
  const page = run('cartSummaryMarkup()');
  assert.match(page, /class="total pq-estimate"><span>Estimated total<\/span><span>SAR 84\.00/);   // the cart with menu prices, said to be an estimate
  assert.equal(run('cartQuoteTotalLabel()'), 'Estimated total');
  assert.match(run('cart()'), /cx-cta-total"><span>Estimated total<\/span>/);
  assert.match(page, /Prices are confirmed when you are online\./);
  assert.match(page, /onclick="cartQuoteRetry\(\)">Try again/);
  assert.equal(run('totals().quoted'), undefined);
  // drawing again does not hammer the server
  run('cartSummaryMarkup(); cartSummaryMarkup()'); await run.tick(400);
  assert.equal(quotes(run).length, 2);
  // it tries again by itself after 5 s and after 15 s, then waits for the customer or the connection
  assert.deepEqual(run.pending().map(timer => timer.ms), [5000]);
  await run.tick(5000);
  assert.equal(quotes(run).length, 3);
  assert.deepEqual(run.pending().map(timer => timer.ms), [15000]);
  await run.tick(15000);
  assert.equal(quotes(run).length, 4);
  assert.deepEqual(run.pending(), []);
  // Place Order: no price, no order
  run(`state.screen='checkout'`);
  await run('createOrderAfterVerification()');
  assert.equal(orders(run).length, 0);
  assert.equal(run.toasts().at(-1), FAIL);
  run(`state.lang='ar'`);
  await run('createOrderAfterVerification()');
  assert.equal(run.toasts().at(-1), 'تعذر تأكيد السعر. تحقق من اتصالك وحاول مرة أخرى.');
  assert.equal(orders(run).length, 0);
  run(`state.lang='en'`);
  // back online: the browser says so, the price is asked, the notice goes
  online = true;
  for (const fn of run.page.listeners['window:online']) fn();
  await run.tick();
  assert.equal(run('cartQuote.status'), 'fresh');
  assert.doesNotMatch(run('cartSummaryMarkup()'), /confirmed when you are online|Estimated/);
  assert.equal(run('cartQuoteTotalLabel()'), 'Total');
  await run('createOrderAfterVerification()');
  assert.deepEqual(orders(run).map(call => call.name), ['oracy_create_customer_order_v3']);
});

test('a slow server: the question gives up after 9 seconds and is not left hanging; the real request passes its time limit and controller', async () => {
  const run = environment('');
  let seen = null;
  run.set('fetch', (url, init) => { seen = init; return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), {name: 'AbortError'})))); });
  let controller = null;
  const asked = run(`realCustomerOrderRpc('${QUOTE}', {}, {timeoutMs: 9000, onStart: c => { __c = c; }})`);
  run.set('__c', null);
  await run.settle();
  assert.equal(run.timers.filter(timer => timer.fn).at(-1).ms, 9000);
  run.timers.filter(timer => timer.fn).at(-1).fn();
  await assert.rejects(asked, /The connection is slow\. Please try again\./);
  assert.ok(seen.signal.aborted);
  // every other call keeps its 12 seconds
  run(`realCustomerOrderRpc('oracy_rewards_rules_v1', {})`);
  await run.settle();
  assert.equal(run.timers.filter(timer => timer.fn).at(-1).ms, 12000);
});

test('a sentence of the pricer (an item went off the menu) is a refusal, not a lost connection: the menu is read again, no retries', async () => {
  const run = await priced();
  let menuReads = 0;
  run.set('__menu', () => { menuReads++; });
  run('refreshMenu=async()=>{__menu(); return {ok:true}}');
  run.server = () => { throw refuse('An item is no longer available', {status: 400, code: 'P0001'}); };
  run('state.cart[0].qty=4; cartSummaryMarkup()'); await run.tick(400);
  assert.equal(run('cartQuote.status'), 'failed');
  assert.equal(run('cartQuote.refusal'), true);
  assert.equal(menuReads, 1);
  assert.deepEqual(run.pending(), []);
  // a server without the word (C6) still gets the customer's words for its sentence
  assert.match(run('cartSummaryMarkup()'), /An item in your cart is no longer available\. Please review your cart\./);
  run(`state.lang='ar'`);
  assert.match(run('cartSummaryMarkup()'), /أحد أصناف سلتك لم يعد متاحاً/);
});

/* ======================= D. reasons and the one hint ======================= */

const REASONS = ['minimum_not_met', 'outside_hours', 'not_started', 'ended', 'wrong_order_type', 'wrong_branch', 'wrong_channel', 'no_matching_items',
  'item_offer_applies', 'sign_in_needed', 'not_first_order', 'used_already', 'limit_reached', 'better_offer_applied', 'not_with_code', 'nothing_to_reduce',
  'would_be_free', 'address_needed', 'no_delivery_fee', 'code_not_valid', 'not_with_item_offer', 'too_many_tries', 'points_refused', 'not_in_test'];

test('all 24 reasons of the contract are worded in one table, in English and Arabic, with no word left unfilled', () => {
  const run = environment('');
  const contract = fs.existsSync('/mnt/user-data/outputs/batch-3a/API-3A-CONTRACT.md') ? fs.readFileSync('/mnt/user-data/outputs/batch-3a/API-3A-CONTRACT.md', 'utf8') : '';
  assert.equal(REASONS.length, 24);
  assert.deepEqual(run.json('Object.keys(PROMO_REASONS)').sort(), [...REASONS].sort());
  if (contract) for (const reason of REASONS) assert.ok(contract.includes('`' + reason + '`'), reason);
  const words = {amount: 'SAR 12.00', offer: '10% off', name: 'Lunch 10 %', code: 'SUMMER', types: 'pick-up and dine-in', time: '18:00'};
  for (const reason of REASONS) {
    for (const kind of ['offer', 'code']) {
      const en = run(`promoReasonText('${reason}','${kind}',${JSON.stringify(words)},'en')`);
      const ar = run(`promoReasonText('${reason}','${kind}',${JSON.stringify(words)},'ar')`);
      assert.ok(en.length > 8 && !/[{}]|undefined/.test(en), `${reason} ${kind} en: ${en}`);
      assert.ok(/[؀-ۿ]/.test(ar) && !/[{}]|undefined/.test(ar), `${reason} ${kind} ar: ${ar}`);
    }
    assert.ok(['hint', 'quiet'].includes(run(`PROMO_REASONS['${reason}'].show`)), reason);
  }
  assert.equal(run(`promoReasonText('would_be_free','offer',{},'en')`), 'This offer cannot make the whole order free. Add another item to use it.');
  assert.equal(run(`promoReasonText('minimum_not_met','offer',${JSON.stringify(words)},'en')`), 'Add SAR 12.00 more to get 10% off');
  assert.equal(run(`promoReasonText('code_not_valid','code',${JSON.stringify(words)},'en')`), 'This code is not valid');   // the server's own sentence of today
  // a reason this app does not know yet still gets a calm sentence
  assert.equal(run(`promoReasonText('something_new','offer',{},'en')`), 'This offer is not applied to your order');
  assert.match(run(`promoReasonText('something_new','offer',{},'ar')`), /[؀-ۿ]/);
  // the table file is words only: it makes no request and reads no storage
  assert.doesNotMatch(read('js/promo-reasons.js'), /fetch|customerOrderRpc|localStorage|sessionStorage/);
});

test('the hint: one line, the best promotion that is close — never a list of everything that did not apply', async () => {
  const notApplied = [
    lunch({reason: 'minimum_not_met', min_order: 73, missing: 12}),                                         // 10 % of 73 = 7.30
    {promotion_id: P_FIVE, name_en: 'Big spender', text_en: 'x', kind: 'amount', value: 30, level: 'order', reason: 'minimum_not_met', min_order: 400, missing: 339},   // far away
    {promotion_id: P_DRINKS, name_en: 'Three off', text_en: 'y', kind: 'amount', value: 3, level: 'order', reason: 'minimum_not_met', min_order: 65, missing: 4},     // closer, but gives less
    lunch({promotion_id: P_FREE, reason: 'outside_hours', hours: [{day: 7, from: '12:00', to: '16:00'}]}),
    lunch({promotion_id: P_FREE, reason: 'not_first_order'}), lunch({promotion_id: P_FREE, reason: 'limit_reached'}), lunch({promotion_id: P_FREE, reason: 'ended'}),
  ];
  const run = await priced((name, params) => quoteFor(params.p_cart, {not_applied: notApplied}));
  const page = run('cartSummaryMarkup()');
  assert.equal(page.split('pq-hint').length, 2);                               // exactly one
  assert.match(page, /<p class="pq-hint" role="status">Add SAR 12\.00 more to get 10% off<\/p>/);
  for (const never of ['Big spender', 'Three off', 'not on right now', 'first order', 'fully used', 'has ended', 'Lunch 10']) assert.equal(page.includes(never), false, never);
  run(`state.lang='ar'`);
  assert.match(run('cartSummaryMarkup()'), /أضف ر\.س 12\.00 للحصول على خصم 10%/);
  // nothing close and nothing to act on: no hint at all
  const none = await priced((name, params) => quoteFor(params.p_cart, {not_applied: notApplied.slice(3).concat([notApplied[1]])}));
  assert.doesNotMatch(none('cartSummaryMarkup()'), /pq-hint/);
  // a promotion that would give less than the one already applied is not dangled
  const worse = await priced((name, params) => promoQuote(params.p_cart, {not_applied: [notApplied[2]]}));
  assert.doesNotMatch(worse('cartSummaryMarkup()'), /pq-hint/);
});

test('the hint, when no minimum is close: the one reason the customer can act on', async () => {
  const cases = [
    [{...five(), reason: 'would_be_free'}, 'This offer cannot make the whole order free. Add another item to use it.', ''],
    [lunch({reason: 'not_with_code'}), '10 % off from 60.00, Sunday to Thursday 12-4 pm is not applied: your code gives more, and they cannot be combined', ''],
    [{promotion_id: P_FREE, name_en: 'Free delivery', text_en: 'Free delivery', kind: 'delivery_percent', value: 100, level: 'delivery', reason: 'address_needed'}, 'Choose your address to see free delivery', ''],
    [lunch({reason: 'wrong_order_type', order_types: ['dinein', 'delivery']}), '10 % off from 60.00, Sunday to Thursday 12-4 pm is for dine-in and delivery orders', ''],
    [lunch({reason: 'sign_in_needed'}), 'Sign in to get 10% off', 'state.isLoggedIn=false;'],
  ];
  for (const [row, words, before] of cases) {
    const run = await priced((name, params) => quoteFor(params.p_cart, {not_applied: [row]}), {before});
    assert.ok(run('cartSummaryMarkup()').includes(`<p class="pq-hint" role="status">${words}</p>`), words + '\n' + run('cartSummaryMarkup()'));
  }
  // signed in already: "sign in" is no help
  const signed = await priced((name, params) => quoteFor(params.p_cart, {not_applied: [lunch({reason: 'sign_in_needed'})]}));
  assert.doesNotMatch(signed('cartSummaryMarkup()'), /pq-hint/);
  // would_be_free comes before the softer ones, a close minimum before everything
  const both = await priced((name, params) => quoteFor(params.p_cart, {not_applied: [lunch({reason: 'wrong_order_type', order_types: ['delivery']}), {...five(), reason: 'would_be_free'}]}));
  assert.match(both('cartSummaryMarkup()'), /cannot make the whole order free/);
  assert.equal(both('cartSummaryMarkup()').split('pq-hint').length, 2);
});

/* ======================= E. one field: coupon or promo code ======================= */

const withCode = (decide, base = promoQuote) => (name, params) => {
  if (name !== QUOTE) return null;
  const code = params.p_cart.code;
  return code ? {...base(params.p_cart), ...decide(code, params.p_cart)} : quoteFor(params.p_cart);
};

test('one field "Coupon or promo code": a promotion code is applied by the price function, not by the voucher check', async () => {
  const run = await priced(withCode(code => ({code: {code, applied: true, kind: 'promotion'}, quote_key: K2})));
  const box = run('couponBoxMarkup()');
  assert.match(box, /id="couponInput" placeholder="Coupon or promo code"/);
  assert.equal(box.split('<input').length, 2);                       // one field
  run(`state.coupon=' summer '`);
  await run('applyCoupon()');
  await run.tick();
  assert.equal(run.sent(/voucher_check/).length, 0);
  assert.equal(quotes(run).at(-1).params.p_cart.code, 'SUMMER');     // trimmed, capitals
  assert.equal(quotes(run).length, 2);                               // the cart's first price, and one question for the code
  assert.equal(run('state.couponOn'), true);
  assert.equal(run('cartQuote.code'), 'SUMMER');
  assert.deepEqual(run.toasts(), ['Coupon applied']);
  const applied = run('couponBoxMarkup()');
  assert.match(applied, /✓ Applied <b dir="ltr">SUMMER<\/b>/);
  assert.match(applied, /onclick="removeCoupon\(\)">Remove</);
  assert.doesNotMatch(applied, /couponInput/);
  assert.equal(run('totals().total'), 54);
  // the code stays with the cart as it changes
  run('state.cart[0].qty=3; cartSummaryMarkup()'); await run.tick();
  assert.equal(quotes(run).at(-1).params.p_cart.code, 'SUMMER');
  // Remove: the next price is asked without it
  run('removeCoupon()'); await run.tick();
  assert.equal('code' in quotes(run).at(-1).params.p_cart, false);
  assert.equal(run('state.couponOn'), false);
  assert.match(run('couponBoxMarkup()'), /couponInput/);
});

test('an old voucher typed in the same field: its discount has its own line with the code', async () => {
  const run = await priced(withCode(code => ({code: {code, applied: true, kind: 'voucher', discount: 6.1}, applied: [], promotion_discount: 0,
    voucher_discount: 6.1, discount_total: 6.1, total: 54.9, vat_amount: 7.16, quote_key: K2}), quoteFor));
  run(`state.coupon='SAVE10'`);
  await run('applyCoupon()'); await run.tick();
  const page = run('cartSummaryMarkup()');
  assert.match(page, /Coupon code <b dir="ltr">SAVE10<\/b><\/span><span>− SAR 6\.10/);
  assert.match(page, /Total<\/span><span>SAR 54\.90/);
  assert.equal(run('totals().discount'), 6.1);
  assert.doesNotMatch(page, /Offers applied/);
});

test('a code that will not work is said so under the field and is NOT sent again with the next change of the cart', async () => {
  for (const [reason, words] of [['code_not_valid', 'This code is not valid'], ['too_many_tries', 'Too many tries. Please try again in a few minutes'],
    ['used_already', 'You have already used this code'], ['sign_in_needed', 'Sign in to use this code'], ['a_new_reason', 'This offer is not applied to your order']]) {
    const run = await priced(withCode(code => ({code: {code, applied: false, reason}}), quoteFor));
    run(`state.coupon='NOPE'`);
    await run('applyCoupon()'); await run.tick();
    assert.equal(run('cartQuote.code'), '', reason);
    assert.equal(run('state.couponOn'), false);
    const box = run('couponBoxMarkup()');
    assert.ok(box.includes(`role="alert">${words}`), reason + box);
    assert.match(box, /id="couponInput"[^>]*value="NOPE"/);           // the words stay in the field, to correct them
    const withIt = quotes(run).filter(call => call.params.p_cart.code).length;
    assert.equal(withIt, 1, reason);                                    // sent once
    assert.equal(quotes(run).length, 3, reason);                        // first price, the code, and the cart without it
    run('state.cart[0].qty=5; cartSummaryMarkup()'); await run.tick();
    run('state.cart[0].qty=6; cartSummaryMarkup()'); await run.tick();
    assert.equal(quotes(run).filter(call => call.params.p_cart.code).length, 1, reason);   // never again: a wrong code is counted by the server
    assert.equal(run('totals().total'), 6 * 23 + 15);
  }
});

test('F4: a code that cannot be combined, or has not reached its minimum, is said so in the cart and stays — never dropped silently', async () => {
  const cases = [
    ['not_with_item_offer', {}, 'It cannot be used together with an item offer in your cart.'],
    ['better_offer_applied', {}, 'The offer on your order already gives more, and the two cannot be combined.'],
    ['minimum_not_met', {min_order: 80, missing: 19}, 'Add SAR 19.00 more to use SAVE10'],
    ['would_be_free', {}, 'This offer cannot make the whole order free. Add another item to use SAVE10.'],
    ['nothing_to_reduce', {}, 'There is nothing left on this order to take it off.'],
  ];
  for (const [reason, extra, words] of cases) {
    let apply = false;
    const run = await priced(withCode(code => apply ? {code: {code, applied: true, kind: 'voucher', discount: 5}, voucher_discount: 5, discount_total: 12, total: 49, quote_key: K3}
      : {code: {code, applied: false, kind: 'voucher', reason, ...extra}}));
    run(`state.coupon='save10'`);
    await run('applyCoupon()'); await run.tick();
    assert.equal(run('cartQuote.code'), 'SAVE10', reason);
    const box = run('couponBoxMarkup()');
    assert.match(box, /<b dir="ltr">SAVE10<\/b> · not applied/);
    assert.ok(box.includes(`<p class="pq-code-note">${words}</p>`), box);
    assert.match(box, /removeCoupon\(\)/);
    assert.doesNotMatch(run('cartSummaryMarkup()'), /Coupon code <b/);      // no discount line for a code that gives nothing
    assert.equal(run('totals().discount'), 0);
    // it starts to apply by itself when the cart allows it
    apply = true;
    run('state.cart[0].qty=3; cartSummaryMarkup()'); await run.tick();
    assert.equal(quotes(run).at(-1).params.p_cart.code, 'SAVE10');
    assert.match(run('couponBoxMarkup()'), /✓ Applied <b dir="ltr">SAVE10/);
    assert.equal(run('state.couponOn'), true);
    // Arabic
    apply = false;
    run(`state.lang='ar'; state.cart[0].qty=2; cartSummaryMarkup()`); await run.tick();
    assert.match(run('couponBoxMarkup()'), /غير مطبق/);
    assert.match(run('couponBoxMarkup()'), /pq-code-note">[^<]*[؀-ۿ]/);
  }
  // the voucher wins over a promotion that does not go with it: that is said too (one hint)
  const run = await priced(withCode(code => ({applied: [], promotion_discount: 0, voucher_discount: 9, discount_total: 9, total: 52, quote_key: K2,
    code: {code, applied: true, kind: 'voucher', discount: 9}, not_applied: [{...five(), reason: 'not_with_code'}]}), quoteFor));
  run(`state.coupon='BIG9'`);
  await run('applyCoupon()'); await run.tick();
  assert.match(run('cartSummaryMarkup()'), /pq-hint" role="status">5\.00 off your order is not applied: your code gives more, and they cannot be combined/);
});

test('the code could not be checked (no connection): it is not kept, the words stay in the field, the customer is told', async () => {
  const run = await priced();
  run.server = () => { throw offline(); };
  run(`state.coupon='SUMMER'`);
  await run('applyCoupon()');
  assert.equal(run('cartQuote.code'), '');
  assert.equal(run('state.coupon'), 'SUMMER');
  assert.equal(run.toasts().at(-1), 'Could not check the code. Please try again.');
  assert.match(run('couponBoxMarkup()'), /couponInput/);
});

test('a guest at a table has no code field: "Have a coupon? Sign in to use it" stays, and the signed-in customer at the table has the one field', async () => {
  const guest = environment(`?t=${KEY}`);
  guest.server = (name, params) => name === 'oracy_table_scan_v1' ? guest('scanOk()') : name === 'oracy_ordering_status_v1' ? {} : quoteFor(params.p_cart);
  guest('tableBoot()'); await guest('tableSettled()'); await guest.settle();
  guest('cartSummaryMarkup()'); await guest.tick();
  assert.equal(guest('cartQuote.support'), 'yes');
  const cart = guest('cart()');
  assert.doesNotMatch(cart, /couponInput|id="couponBox"/);
  assert.match(cart, /table-guest-coupon/);
  assert.match(cart, /Have a coupon\?/);
  // even a code left over from before the table is not sent for a guest
  guest(`cartQuote.code='SUMMER'; state.cart[0].qty=4; cartSummaryMarkup()`); await guest.tick();
  assert.equal('code' in quotes(guest).at(-1).params.p_cart, false);
  const signed = environment(`?t=${KEY}`);
  signed('signIn()');
  signed.server = (name, params) => name === 'oracy_table_scan_v1' ? signed('scanOk()') : quoteFor(params.p_cart);
  signed('tableBoot()'); await signed('tableSettled()'); await signed.settle();
  signed('cartSummaryMarkup()'); await signed.tick();
  assert.match(signed('cart()'), /id="couponBox"><input class="field" id="couponInput" placeholder="Coupon or promo code"/);
});

test('points go with the cart; a refusal of the points programme is shown in its own words and the choice is taken back', async () => {
  const run = await priced((name, params) => {
    const pts = params.p_cart.redeem_points;
    if (pts === 500) return quoteFor(params.p_cart, {points: {requested: 500, applied: 500, value: 5}, points_value: 5, discount_total: 5, total: 56, vat_amount: 7.3, quote_key: K2});
    if (pts) return quoteFor(params.p_cart, {points: {requested: pts, applied: false, reason: 'points_refused', message: 'You do not have enough points'}});
    return quoteFor(params.p_cart);
  });
  run('state.redeemPoints=500; cartSummaryMarkup()'); await run.tick();
  assert.match(run('cartSummaryMarkup()'), /rewards-line"><span>Points \(500\)<\/span><span>− SAR 5\.00/);
  assert.equal(run('totals().points'), 5);
  assert.equal(run('totals().foodTotal'), 56);
  run('state.redeemPoints=900; cartSummaryMarkup()'); await run.tick();
  assert.equal(run('state.redeemPoints'), 0);
  assert.deepEqual(run.toasts(), ['You do not have enough points']);
  assert.equal('redeem_points' in quotes(run).at(-1).params.p_cart, false);
  assert.equal(run('totals().total'), 61);
});

test('signed in but not yet a customer of this restaurant: the profile is read once (as the sign-in does) and the price asked again', async () => {
  let customer = false;
  const run = environment('');
  run('signIn()');
  run.server = (name, params) => quoteFor(params.p_cart, {signed_in: customer});
  run('loadCustomerProfile=async()=>{profileReads++; __made()}');
  run.set('__made', () => { customer = true; });
  run('cartSummaryMarkup()'); await run.tick();
  assert.equal(run('profileReads'), 1);
  assert.equal(quotes(run).length, 2);
  assert.equal(run('cartQuote.quote.signed_in'), true);
  // a server that keeps saying "not signed in" does not make a loop
  const stuck = environment('');
  stuck('signIn()');
  stuck.server = (name, params) => quoteFor(params.p_cart, {signed_in: false});
  stuck('cartSummaryMarkup()'); await stuck.tick(); await stuck.tick();
  assert.equal(stuck('profileReads'), 1);
  assert.equal(quotes(stuck).length, 2);
});

/* ======================= F. the order ======================= */

test('the four paths on a 394 database: the new function, today\'s body plus the key of the price that was shown', async () => {
  // app, pick-up
  const app = await priced((name, params) => name === QUOTE ? promoQuote(params.p_cart) : app('created()'));
  app(`state.screen='checkout'; state.notes='No onions'`);
  await app('createOrderAfterVerification()');
  let sent = orders(app);
  assert.deepEqual(sent.map(call => call.name), ['oracy_create_customer_order_v3']);
  let body = sent[0].params.p_order;
  assert.equal(body.quote_key, K1);
  assert.equal(sent[0].params.p_restaurant_id, RESTAURANT);
  assert.equal(sent[0].params.p_branch_id, BRANCH);
  assert.equal('expected_delivery_fee' in body, false);            // the server sets the fee from the price
  assert.equal(body.coupon_code, '');
  assert.equal(body.order_note, 'No onions');
  assert.equal(body.fulfillment_type, 'takeaway');
  assert.deepEqual(body.items.map(l => [l.menu_item_id, l.quantity]), quotes(app).at(-1).params.p_cart.items.map(l => [l.menu_item_id, l.quantity]));
  for (const key of ['client_order_id', 'customer_name', 'customer_phone', 'schedule_type', 'items']) assert.ok(key in body, key);
  assert.equal(app('state.screen'), 'confirmation');
  assert.equal(app('state.order.total'), 54);
  assert.equal(app('state.cart.length'), 0);
  assert.equal(app('cartQuote.quote'), null);                      // the next cart starts clean
  // table, signed in and guest
  for (const guest of [false, true]) {
    const run = environment(`?t=${KEY}`);
    if (!guest) run('signIn()');
    run.server = (name, params) => name === 'oracy_table_scan_v1' ? run('scanOk()') : name === QUOTE ? promoQuote(params.p_cart) : run('created({table_label:"7"})');
    run('tableBoot()'); await run('tableSettled()'); await run.settle();
    if (guest) run(`tableGuest.name='Sara'`);
    run(`state.screen='checkout'; state.redeemPoints=0; cartSummaryMarkup()`); await run.tick();
    await run('createOrderAfterVerification()');
    sent = orders(run);
    assert.deepEqual(sent.map(call => call.name), [guest ? 'oracy_create_table_guest_order_v2' : 'oracy_create_table_order_v2']);
    assert.equal(sent[0].params.p_key, KEY);
    body = sent[0].params.p_order;
    assert.equal(body.quote_key, K1);
    assert.equal(body.fulfillment_type, 'dinein');
    if (guest) {
      assert.equal(body.customer_name, 'Sara');
      assert.match(body.guest_id, /^[0-9a-f-]{36}$/);
      for (const never of ['coupon_code', 'redeem_points', 'customer_phone', 'customer_email']) assert.equal(never in body, false, never);
    }
    assert.equal(run('state.order.tableLabel'), '7');
    assert.equal(run('state.screen'), 'confirmation');
  }
});

test('delivery goes through the one app function with the address and the key; the fee of before is not sent', async () => {
  const run = environment('');
  run('signIn()');
  run(`state.orderType='delivery'; state.screen='checkout'; state.savedAddresses=[{id:'${ADDRESS}',updatedAt:'v1',latitude:24.7,longitude:46.7,type:'home'}]; state.defaultAddressId='${ADDRESS}';
    state.checkoutPinConfirmedId='${ADDRESS}'; state.checkoutPinConfirmedVersion='v1';
    validDeliveryPin=()=>true; pinAddressText=()=>'Olaya St'; loadAccountAddresses=async()=>true; accountAddresses.loaded=true;
    refreshDeliveryQuote=async()=>({eligible:true,fee:15}); currentDeliveryQuote=()=>({eligible:true,fee:15});`);
  run.server = (name, params) => name === QUOTE ? quoteFor(params.p_cart, {delivery: {known: true, eligible: true, fee_before: 15, reduction: 0, fee: 15, quote: {}}, delivery_fee: 15, total: 76})
    : run('created({total:76,delivery_fee:15,promotions:[],discount:0})');
  run('cartSummaryMarkup()'); await run.tick();
  await run('createOrderAfterVerification()');
  const sent = orders(run);
  assert.deepEqual(sent.map(call => call.name), ['oracy_create_customer_order_v3']);
  const body = sent[0].params.p_order;
  assert.equal(body.fulfillment_type, 'delivery');
  assert.equal(body.delivery_address_id, ADDRESS);
  assert.equal(body.delivery_address_version, 'v1');
  assert.equal(body.quote_key, K1);
  assert.equal('expected_delivery_fee' in body, false);
  assert.equal(quotes(run).at(-1).params.p_cart.delivery_address_id, ADDRESS);
  assert.equal(run('state.order.deliveryFee'), 15);
});

test('never mixed: a key only goes to the new functions, the new functions are never called without a good key, and there is no way back', async () => {
  const run = environment('');
  run('signIn()');
  const order = extra => `submitCustomerOrder({fulfillment_type:'takeaway',client_order_id:'x',items:[],${extra}})`;
  // a key that is not 32 hex characters: nothing is sent at all
  for (const bad of [`quote_key:''`, `quote_key:null`, `quote_key:'abc'`, `quote_key:undefined`, `quote_key:'${K1.toUpperCase()}'`, `quote_key:'${K1}0'`]) {
    await assert.rejects(run(order(bad)), new RegExp(FAIL.replace(/\./g, '\\.')));
  }
  assert.equal(run.sent(/./).length, 0);
  // with a key and a server that has no v3: refused, NOT sent to an older function
  run.server = () => { throw missing(); };
  await assert.rejects(run(order(`quote_key:'${K1}'`)));
  assert.deepEqual(orders(run).map(call => call.name), ['oracy_create_customer_order_v3']);
  // without a key: the functions of before, with their own fallback, and never a new one
  run('calls.length=0');
  await assert.rejects(run(order(`order_note:'n'`)));
  assert.deepEqual(orders(run).map(call => call.name), ['oracy_create_customer_order_v2', 'oracy_create_customer_order_v1']);
  // the new entries need the sign-in on the device like the old ones; the guest one does not
  const list = /const signedInOnly = \[([^\]]*)\];/.exec(read('js/data.js'))[1];
  for (const name of ['oracy_create_customer_order_v3', 'oracy_create_table_order_v2']) assert.ok(list.includes(`"${name}"`), name);
  assert.equal(list.includes('guest_order'), false);
  assert.equal(list.includes('price_quote'), false);          // a visitor may ask for a price
  assert.equal(list.includes('promotions_live'), false);
});

test('"The price has changed": nothing was saved, the cart stays, the new total and one sentence are shown, and only a new tap sends it — once', async () => {
  let ended = false, saved = 0;
  const run = await priced((name, params) => {
    if (name === QUOTE) return ended ? quoteFor(params.p_cart, {quote_key: K2}) : promoQuote(params.p_cart);
    if (params.p_order.quote_key === K1) { ended = true; return {ok: false, code: 'price_changed', message: 'The price has changed. Please check the new total.', quote: quoteFor(quotes(run)[0].params.p_cart, {quote_key: K2})}; }
    saved++;
    return run('created({total:61,discount:0,promotions:[],quote_key:"' + K2 + '"})');
  });
  run(`state.screen='checkout'; cartSummaryMarkup()`);
  await run('createOrderAfterVerification()');
  await run.tick();
  assert.equal(saved, 0);
  assert.equal(orders(run).length, 1);                          // not sent again by itself, although the app has the new key
  assert.equal(run('state.screen'), 'checkout');
  assert.equal(run('state.cart.length'), 2);
  assert.equal(run('state.order'), null);
  assert.equal(run('state.orderSubmitting'), false);
  const sheet = run('cartQuoteChangedMarkup()');
  assert.match(sheet, /role="alertdialog"/);
  assert.match(sheet, /The price has changed/);
  assert.match(sheet, /“20 % off all drinks” is no longer applied\.|Some offers are no longer applied\./);
  assert.match(sheet, /Before<\/span><s>SAR 54\.00<\/s>/);
  assert.match(sheet, /New total<\/span><strong>SAR 61\.00/);
  assert.match(sheet, /Your order has not been sent yet\./);
  assert.match(sheet, /onclick="cartQuoteConfirmChange\(\)">Place order · SAR 61\.00/);
  assert.ok(run('checkout()').includes('pq-sheet'));           // it is part of the checkout
  assert.equal(run('totals().total'), 61);                     // and the summary behind it already shows the new price
  // the customer says yes: the same client_order_id (no order exists), the new key
  run('cartQuoteConfirmChange()');
  await run.settle(); await run.tick();
  const sent = orders(run);
  assert.equal(sent.length, 2);
  assert.equal(sent[1].params.p_order.quote_key, K2);
  assert.equal(sent[1].params.p_order.client_order_id, sent[0].params.p_order.client_order_id);
  assert.equal(saved, 1);
  assert.equal(run('state.screen'), 'confirmation');
  assert.equal(run('cartQuoteChangedMarkup()'), '');
});

test('a LOWER price is shown and confirmed too; "Back to cart" sends nothing; Arabic', async () => {
  let cheaper = false;
  const run = await priced((name, params) => {
    if (name === QUOTE) return cheaper ? promoQuote(params.p_cart, {quote_key: K2}) : quoteFor(params.p_cart);
    cheaper = true;
    return {ok: false, code: 'price_changed', message: 'x', quote: promoQuote(quotes(run)[0].params.p_cart, {quote_key: K2})};
  });
  run(`state.screen='checkout'; cartSummaryMarkup()`);
  await run('createOrderAfterVerification()'); await run.tick();
  assert.equal(orders(run).length, 1);
  let sheet = run('cartQuoteChangedMarkup()');
  assert.match(sheet, /“20 % off all drinks” is now applied\./);
  assert.match(sheet, /Before<\/span><s>SAR 61\.00<\/s>/);
  assert.match(sheet, /New total<\/span><strong>SAR 54\.00/);
  run(`state.lang='ar'`);
  sheet = run('cartQuoteChangedMarkup()');
  assert.match(sheet, /تغيّر السعر/);
  assert.match(sheet, /الإجمالي الجديد/);
  assert.match(sheet, /لم يُرسل طلبك بعد/);
  run('cartQuoteCloseChange(true)');
  await run.tick();
  assert.equal(run('state.screen'), 'cart');
  assert.equal(orders(run).length, 1);
  assert.equal(run('state.cart.length'), 2);
  assert.equal(run('cartQuoteChangedMarkup()'), '');
});

test('the sentence says what changed: an offer ended, an item\'s price, the delivery fee, the coupon, the points', async () => {
  const run = await priced();
  const cart = quotes(run)[0].params.p_cart;
  const sentence = (before, after) => run(`cartQuoteChangeSentence(cartQuoteClean(${JSON.stringify(before)},2), cartQuoteClean(${JSON.stringify(after)},2))`);
  assert.equal(sentence(promoQuote(cart, {applied: [five()]}), quoteFor(cart)), '“5.00 off your order” is no longer applied.');
  assert.equal(sentence(promoQuote(cart), quoteFor(cart)), 'Some offers are no longer applied.');
  const dearer = quoteFor(cart); dearer.lines[0].line_total = 50; dearer.lines[0].net_total = 50;
  assert.equal(sentence(quoteFor(cart), dearer), 'The price of Seekh Kabab has changed.');
  assert.equal(sentence(quoteFor(cart), promoQuote(cart, {applied: [five()]})), '“5.00 off your order” is now applied.');
  assert.equal(sentence(promoQuote(cart, {applied: [five()]}), promoQuote(cart, {applied: [{...five(), amount: 3}]})), 'An offer on your order has changed.');
  assert.equal(sentence(quoteFor(cart, {voucher_discount: 5}), quoteFor(cart, {voucher_discount: 2})), 'Your coupon discount has changed.');
  assert.equal(sentence(quoteFor(cart, {points_value: 5}), quoteFor(cart)), 'The value of your points has changed.');
  assert.equal(sentence(quoteFor(cart, {delivery_fee: 15}), quoteFor(cart, {delivery_fee: 10})), 'The delivery fee has changed.');
  assert.equal(sentence(quoteFor(cart), quoteFor(cart, {total: 99})), 'The total of your order has changed.');
  assert.equal(run(`cartQuoteChangeSentence(null, cartQuoteClean(${JSON.stringify(quoteFor(cart))},2))`), 'This is the confirmed price of your order.');
  run(`state.lang='ar'`);
  assert.match(sentence(promoQuote(cart, {applied: [five()]}), quoteFor(cart)), /لم يعد عرض «خصم ٥ على طلبك» مطبقاً/);
});

test('Place Order asks first when the price on screen is old or was only the app\'s own sum; a different answer is shown before anything is sent', async () => {
  // the price on screen is 3 minutes old and the happy hour has ended meanwhile
  let ended = false;
  const run = await priced((name, params) => name === QUOTE ? (ended ? quoteFor(params.p_cart, {quote_key: K2}) : promoQuote(params.p_cart)) : run('created({total:61,promotions:[],discount:0})'));
  run(`state.screen='checkout'; cartSummaryMarkup()`);
  ended = true; run.clock.now += 180000;
  await run('createOrderAfterVerification()'); await run.tick();
  assert.equal(orders(run).length, 0);                           // nothing sent at the old price, nothing sent at the new one unseen
  assert.match(run('cartQuoteChangedMarkup()'), /Before<\/span><s>SAR 54\.00<\/s>[\s\S]*New total<\/span><strong>SAR 61\.00/);
  run('cartQuoteConfirmChange()'); await run.settle(); await run.tick();
  assert.equal(orders(run).length, 1);
  assert.equal(orders(run)[0].params.p_order.quote_key, K2);
  // a young price that is the one on screen: no extra question, straight to the order
  const quick = await priced((name, params) => name === QUOTE ? promoQuote(params.p_cart) : quick('created()'));
  quick(`state.screen='checkout'; cartSummaryMarkup()`);
  await quick('createOrderAfterVerification()');
  assert.equal(quotes(quick).length, 1);
  assert.equal(orders(quick).length, 1);
  // offline while the cart was open (the app's own sum 61.00 on screen), online at Place Order, and the server says 54.00
  let online = false;
  const est = environment('');
  est('signIn()');
  est.server = (name, params) => { if (name !== QUOTE) return est('created()'); if (!online) throw refuse('x', {status: 400, code: 'P0001'}); return promoQuote(params.p_cart); };
  est(`state.screen='checkout'; cartSummaryMarkup()`); await est.tick(0);
  est('cartSummaryMarkup()');                                     // the screen is drawn again with the notice
  assert.equal(est('cartQuote.support'), 'yes');
  assert.equal(est('cartQuote.shownTotal'), 61);
  online = true;
  await est('createOrderAfterVerification()'); await est.tick();
  assert.equal(orders(est).length, 0);
  assert.match(est('cartQuoteChangedMarkup()'), /New total<\/span><strong>SAR 54\.00/);
});

test('no double order: a retry after a lost answer carries the same client_order_id, and a busy Place Order does nothing', async () => {
  let attempt = 0;
  const run = await priced((name, params) => {
    if (name === QUOTE) return promoQuote(params.p_cart);
    attempt++;
    if (attempt === 1) throw refuse('The connection is slow. Please try again.');
    return run('created({duplicate:true})');
  });
  run(`state.screen='checkout'; cartSummaryMarkup()`);
  await run('createOrderAfterVerification()');
  assert.equal(run('state.screen'), 'checkout');
  assert.equal(run('state.cart.length'), 2);
  await run('createOrderAfterVerification()');
  const sent = orders(run);
  assert.equal(sent.length, 2);
  assert.equal(sent[0].params.p_order.client_order_id, sent[1].params.p_order.client_order_id);
  assert.equal(sent[1].params.p_order.quote_key, K1);
  assert.equal(run('state.screen'), 'confirmation');
  // two taps at once: one order
  const twice = await priced((name, params) => name === QUOTE ? promoQuote(params.p_cart) : twice('created()'));
  twice(`state.screen='checkout'; cartSummaryMarkup()`);
  await Promise.all([twice('createOrderAfterVerification()'), twice('createOrderAfterVerification()')]);
  assert.equal(orders(twice).length, 1);
});

test('a code that is not applied is not sent with the order; an applied one is, exactly as it went to the price', async () => {
  const held = await priced(withCode(code => ({code: {code, applied: false, kind: 'voucher', reason: 'better_offer_applied'}})));
  held(`state.coupon='SAVE10'`);
  await held('applyCoupon()'); await held.tick();
  held.server = (name, params) => name === QUOTE ? (params.p_cart.code ? promoQuote(params.p_cart, {code: {code: params.p_cart.code, applied: false, reason: 'better_offer_applied'}}) : promoQuote(params.p_cart)) : held('created()');
  held(`state.screen='checkout'; cartSummaryMarkup()`); await held.tick();
  await held('createOrderAfterVerification()');
  assert.equal(orders(held).length, 1);
  assert.equal(orders(held)[0].params.p_order.coupon_code, '');
  assert.equal('code' in quotes(held).at(-1).params.p_cart, false);     // the price of the order was asked without it too
  const on = await priced(withCode(code => ({code: {code, applied: true, kind: 'promotion'}})));
  on.server = (name, params) => name === QUOTE ? promoQuote(params.p_cart, params.p_cart.code ? {code: {code: params.p_cart.code, applied: true, kind: 'promotion'}} : {}) : on('created()');
  on(`state.coupon='summer'`);
  await on('applyCoupon()'); await on.tick();
  on(`state.screen='checkout'; cartSummaryMarkup()`);
  await on('createOrderAfterVerification()');
  assert.equal(orders(on)[0].params.p_order.coupon_code, 'SUMMER');
  assert.equal(quotes(on).at(-1).params.p_cart.code, 'SUMMER');
  assert.equal(on('cartQuote.code'), '');                                 // gone with the order
});

test('refusals of the order: a missing or unreconciled key asks the price again; the voucher\'s own refusal takes the code off', async () => {
  for (const hint of ['quote_key_required', 'quote_mismatch']) {
    const run = await priced((name, params) => { if (name === QUOTE) return promoQuote(params.p_cart); throw refuse('Order service is unavailable. Please try again.', {status: 400, code: hint === 'quote_mismatch' ? 'P0001' : '22023', hint}); });
    run(`state.screen='checkout'; cartSummaryMarkup()`);
    await run('createOrderAfterVerification()');
    assert.equal(run.toasts().at(-1), FAIL, hint);
    assert.equal(run('cartQuote.stale'), true);
    assert.equal(run('state.cart.length'), 2);
    assert.equal(run('state.screen'), 'checkout');
  }
  assert.match(read('js/data.js'), /\["P0001", "22023"\]\.includes\(detail\.code\) && typeof detail\.hint === "string" && \/\^\[a-z_\]\{2,40\}\$\/\.test\(detail\.hint\)\) refusal\.hint = detail\.hint/);
  const run = await priced(withCode(code => ({code: {code, applied: true, kind: 'voucher', discount: 5}})));
  run(`state.coupon='SAVE10'`);
  await run('applyCoupon()'); await run.tick();
  run.server = (name, params) => { if (name === QUOTE) return promoQuote(params.p_cart, params.p_cart.code ? {code: {code: 'SAVE10', applied: true, kind: 'voucher'}} : {}); throw refuse('This code is not valid', {status: 400, code: 'P0001'}); };
  run(`state.screen='checkout'; cartSummaryMarkup()`); await run.tick();
  await run('createOrderAfterVerification()');
  assert.equal(run('cartQuote.code'), '');
  assert.equal(run('state.couponOn'), false);
  assert.equal(run.toasts().at(-1), 'This code is not valid');
});

/* ======================= G. the running promotions: strip, Offers screen, badges ======================= */

const LIVE = 'oracy_promotions_live_v1';
const liveRow = (extra = {}) => ({promotion_id: P_LUNCH, name_en: 'Happy hour', name_ar: 'ساعة السعادة', text_en: '20 % off all drinks', text_ar: 'خصم ٢٠٪ على المشروبات', kind: 'percent', value: 20,
  max_discount: null, level: 'item', min_order: 0, order_types: ['dinein', 'takeaway'], hours: [{day: 4, from: '12:00', to: '18:00'}], ends_at: null,
  target: 'categories', target_ids: [DRINKS], first_order_only: false, sign_in_needed: false, on_now: true, ...extra});
async function withLive(rows, options = {}) {
  const run = environment(options.search || '', options);
  if (!options.guest) run('signIn()');
  run.rows = rows;
  run.server = (name, params) => name === LIVE ? run.rows : name === 'oracy_table_scan_v1' ? run('scanOk()') : name === QUOTE ? quoteFor(params.p_cart) : {};
  if (options.search) { run('tableBoot()'); await run('tableSettled()'); await run.settle(); }
  run(`state.screen='home'`);
  await run('promoLiveLoad(true)');
  run('draws=0');
  return run;
}

test('the list is asked for this branch and channel ("app", or "table_qr" at a table), kept a few minutes, and switched off on an old database', async () => {
  const run = await withLive([liveRow()]);
  assert.deepEqual(run.sent(/promotions_live/)[0].params, {p_restaurant_id: RESTAURANT, p_branch_id: BRANCH, p_channel: 'app'});
  run('promoStripMarkup(); promoOffersMarkup()'); await run.tick(0);
  assert.equal(run.sent(/promotions_live/).length, 1);              // young: not asked again
  run.clock.now += 3 * 60 * 1000 + 1;
  run('promoStripMarkup()'); await run.tick(0);
  assert.equal(run.sent(/promotions_live/).length, 2);
  const table = await withLive([liveRow()], {search: `?t=${KEY}`, guest: true});
  assert.equal(table.sent(/promotions_live/).at(-1).params.p_channel, 'table_qr');
  assert.match(table('promoStripMarkup()'), /20 % off all drinks/);  // a guest sees the automatic ones
  const old = environment('');
  old.server = () => { throw missing(); };
  await old('promoLiveLoad(true)');
  assert.equal(old('promoLive.off'), true);
  old('promoStripMarkup(); promoOffersMarkup()'); await old.tick(0);
  assert.equal(old.sent(/promotions_live/).length, 1);
  assert.equal(old('promoStripMarkup()'), '');
  assert.equal(old(`promoItemBadge(ITEMS[1])`), '');
  // a lost connection keeps the list of before and asks again in half a minute
  run.server = () => { throw offline(); };
  run.clock.now += 3 * 60 * 1000 + 1;
  await run('promoLiveLoad(false)');
  assert.equal(run('promoLive.rows.length'), 1);
  run.clock.now += 31000;
  run('calls.length=0; promoStripMarkup()'); await run.tick(0);
  assert.equal(run.sent(/promotions_live/).length, 1);
});

test('Home shows a quiet strip with the promotion\'s own words and its time ("Today until 18:00"); Offers lists every running one', async () => {
  const run = await withLive([liveRow(), liveRow({promotion_id: P_FIVE, text_en: 'Lunch: 10 % off', text_ar: '', kind: 'percent', value: 10, level: 'order', target: 'menu', target_ids: [],
    min_order: 60, max_discount: 25, on_now: false, hours: [{day: 5, from: '12:00', to: '16:00'}], sign_in_needed: true, first_order_only: true}),
    liveRow({promotion_id: P_FREE, text_en: 'Free delivery', kind: 'delivery_percent', value: 100, level: 'delivery', order_types: ['delivery'], hours: [], target: 'menu', target_ids: [], ends_at: '2026-10-12T20:59:00Z'})]);
  const strip = run('promoStripMarkup()');
  assert.match(strip, /class="pq-card on"[\s\S]*?On now<\/span>\s*<strong>20 % off all drinks<\/strong>\s*<small>Today until 18:00<\/small>/);
  assert.match(strip, /Coming up<\/span>\s*<strong>Lunch: 10 % off<\/strong>\s*<small>Tomorrow \u206612:00–16:00\u2069 · Orders from SAR 60\.00 · Up to SAR 25\.00 off · First order<\/small>/);
  assert.doesNotMatch(strip, /Free delivery/);                       // pick-up was chosen: the delivery offer is not dangled on Home
  assert.equal(strip.split('pq-card-tag').length, 3);
  assert.ok(run('home()').includes('pq-strip') && run('homeScroll()').includes('pq-strip'));
  const offers = run('promoOffersMarkup()');
  assert.equal(offers.split('pq-card-tag').length, 4);                 // all three
  assert.match(offers, /Free delivery<\/strong>\s*<small>Until 12 Oct · For delivery<\/small>/);
  assert.match(offers, /Offers are applied in your cart when your order qualifies\./);
  assert.ok(run('offers()').includes('pq-list'));
  // signed out: "Sign in to get it" on the ones that need it
  run('state.isLoggedIn=false');
  assert.match(run('promoStripMarkup()'), /First order · Sign in to get it/);
  // Arabic: the server's Arabic words, the English ones where there are none, the time in Arabic
  run(`state.lang='ar'`);
  const arabic = run('promoStripMarkup()');
  assert.match(arabic, /متاح الآن<\/span>\s*<strong>خصم ٢٠٪ على المشروبات<\/strong>\s*<small>اليوم حتى 18:00/);
  assert.match(arabic, /<strong>Lunch: 10 % off<\/strong>\s*<small>غداً \u206612:00–16:00\u2069/);
  // the words are the restaurant's: escaped
  const sharp = await withLive([liveRow({text_en: '<b onclick=x>Hi</b>'})]);
  assert.match(sharp('promoStripMarkup()'), /&lt;b onclick=x&gt;Hi&lt;\/b&gt;/);
  // nothing running: nothing on Home, and the Offers screen keeps its "no offers" line
  const none = await withLive([]);
  assert.equal(none('promoStripMarkup()'), '');
  assert.equal(none('promoOffersMarkup()'), '');
});

test('the time of a promotion: overnight windows, later this week, the branch\'s own clock', async () => {
  const run = await withLive([]);
  const text = row => run(`promoWindowText(promoLiveClean(${JSON.stringify(row)}))`);
  // Thursday 13:00 in Riyadh (day 4)
  assert.equal(text(liveRow({hours: [{day: 4, from: '12:00', to: '18:00'}]})), 'Today until 18:00');
  assert.equal(text(liveRow({hours: [{day: 4, from: '10:00', to: '24:00'}]})), 'Today until 00:00');
  assert.equal(text(liveRow({hours: [{day: 4, from: '12:00', to: '02:00'}]})), 'Until 02:00');                 // ends after midnight
  assert.equal(text(liveRow({hours: [{day: 3, from: '22:00', to: '14:00'}]})), 'Today until 14:00');           // began yesterday
  assert.equal(text(liveRow({on_now: false, hours: [{day: 4, from: '17:00', to: '19:00'}]})), 'Today \u206617:00–19:00\u2069');
  assert.equal(text(liveRow({on_now: false, hours: [{day: 5, from: '17:00', to: '19:00'}]})), 'Tomorrow \u206617:00–19:00\u2069');
  assert.equal(text(liveRow({on_now: false, hours: [{day: 7, from: '12:00', to: '16:00'}, {day: 1, from: '12:00', to: '16:00'}]})), 'Sunday \u206612:00–16:00\u2069');
  assert.equal(text(liveRow({hours: []})), '');
  // rows that are not the contract's shape are left out, not half-shown
  for (const bad of [{...liveRow(), promotion_id: 'x'}, {...liveRow(), kind: 'bogo'}, {...liveRow(), value: 0}, null, 'x']) assert.equal(run.json(`promoLiveClean(${JSON.stringify(bad)})`), null);
  assert.deepEqual(run.json(`promoLiveClean(${JSON.stringify(liveRow({hours: [{day: 9, from: '12:00', to: '13:00'}, {day: 1, from: '25:00', to: '13:00'}, {day: 1, from: '12:00', to: '12:00'}]}))}).hours`), []);
});

test('a quiet badge on the items and the category of a running promotion — not on an item with its own offer, not for another order type, not when it is not on', async () => {
  const run = await withLive([liveRow()]);
  assert.equal(run('promoItemBadge(ITEMS[1])'), '<span class="pq-badge" title="20 % off all drinks">20% off</span>');
  assert.equal(run('promoItemBadge(ITEMS[0])'), '');
  assert.match(run('itemCardMarkup(ITEMS[1])'), /pq-badge/);
  assert.doesNotMatch(run('itemCardMarkup(ITEMS[0])'), /pq-badge/);
  assert.equal(run(`promoCategoryBadge('${DRINKS}')`), '<span class="pq-badge pq-badge-cat">20% off</span>');
  assert.equal(run(`promoCategoryBadge('${GRILL}')`), '');
  assert.match(run('itemCardMarkup(ITEMS[1])'), /price">[\s\S]*SAR 15\.00/);     // the price on the tile is not changed: the cart confirms it
  run(`ITEMS[1].offer={type:'fixed',discount:2,maxQty:null,minRegularSpend:0}`);
  assert.equal(run('promoItemBadge(ITEMS[1])'), '');                              // an item gets one reduction: its own offer
  run(`ITEMS[1].offer=null; state.orderType='delivery'`);
  assert.equal(run('promoItemBadge(ITEMS[1])'), '');
  run(`state.orderType='takeaway'`);
  const item = await withLive([liveRow({target: 'items', target_ids: [KABAB], kind: 'amount', value: 5})]);
  assert.match(item('promoItemBadge(ITEMS[0])'), />SAR 5\.00 off</);
  const off = await withLive([liveRow({on_now: false})]);
  assert.equal(off('promoItemBadge(ITEMS[1])'), '');
  const order = await withLive([liveRow({level: 'order', target: 'menu', target_ids: []})]);
  assert.equal(order('promoItemBadge(ITEMS[1])'), '');                            // a promotion on the order has no item badge
  const signIn = await withLive([liveRow({sign_in_needed: true})], {guest: true});
  assert.equal(signIn('promoItemBadge(ITEMS[1])'), '');                           // no promise a visitor cannot get
});

test('a happy hour that starts or ends while the app is open: the list is read again at that minute, the screen is drawn again and the cart re-priced — no reload', async () => {
  const run = await withLive([liveRow()]);
  // Thursday 13:00; the window ends at 18:00 -> one timer, 5 hours and 2 seconds from now
  assert.equal(run('promoLiveBoundary()'), 5 * 3600);
  const timer = run.timers.find(t => t.fn && t.ms === (5 * 3600 + 2) * 1000);
  assert.ok(timer, JSON.stringify(run.timers.filter(t => t.fn).map(t => t.ms)));
  assert.match(run('promoItemBadge(ITEMS[1])'), /pq-badge/);
  // the cart is open and priced with the promotion
  run.server = (name, params) => name === LIVE ? run.rows : promoQuote(params.p_cart);
  run(`state.screen='cart'; cartSummaryMarkup()`); await run.tick(0);
  assert.equal(run('totals().total'), 54);
  // 18:00: the server's list says "not on", the price function says 61.00
  run.clock.now += (5 * 3600 + 2) * 1000;
  run.rows = [liveRow({on_now: false})];
  run.server = (name, params) => name === LIVE ? run.rows : quoteFor(params.p_cart, {quote_key: K2});
  const before = quotes(run).length;
  timer.fn(); timer.fn = null;
  await run.settle(); await run.tick(0);
  assert.equal(run('promoItemBadge(ITEMS[1])'), '');
  assert.equal(quotes(run).length, before + 1);                    // the cart was re-priced by the change itself
  assert.equal(run('totals().total'), 61);
  // on Home the strip is drawn again
  run(`state.screen='home'; draws=0`);
  run.rows = [liveRow()];
  await run('promoLiveLoad(true)');
  assert.equal(run('draws'), 1);
  // an unchanged list draws nothing
  await run('promoLiveLoad(true)');
  assert.equal(run('draws'), 1);
  // the next boundary: an end date counts too
  const dated = await withLive([liveRow({hours: [], ends_at: '2026-10-08T10:30:00Z'})]);
  assert.equal(dated('promoLiveBoundary()'), 1800);
});

/* ======================= H. the saved order, and items added to an order ======================= */

test('the confirmation, the tracking card and the Orders screen show the total and the promotions the server saved with the order', async () => {
  const run = await priced((name, params) => name === QUOTE ? promoQuote(params.p_cart) : run('created()'));
  run(`state.screen='checkout'; cartSummaryMarkup()`);
  await run('createOrderAfterVerification()');
  assert.equal(run('state.order.quoted'), true);
  assert.equal(run('state.order.discount'), 7);
  const block = run('orderNoteLine(state.order)');
  assert.match(block, /pq-order-row"><span>20 % off all drinks<\/span><span>− SAR 2\.00/);
  assert.match(block, /pq-order-row"><span>5\.00 off your order<\/span><span>− SAR 5\.00/);
  assert.match(block, /pq-order-total"><span>Total<\/span><strong>SAR 54\.00/);
  assert.ok(run('confirmation()').includes('pq-order-total'));
  // kept on the device for the signed-in Orders screen (the server's list has no promotion line)
  const again = environment('', run.shared);
  again('signIn()');
  assert.match(again(`promoOrderRows('${ORDER}')`), /5\.00 off your order/);
  again(`accountOrders.rows=[{id:'${ORDER}',order_number:'MK-0031',status:'preparing',fulfillment_type:'takeaway',total:54,items:[{quantity:2,name:'Seekh Kabab'}],created_at:'2026-10-08T10:00:00Z'}]; state.orderTab='active'`);
  const card = again('accountOrdersPage()');
  assert.match(card, /pq-order-row"><span>5\.00 off your order<\/span><span>− SAR 5\.00<\/span><\/div><\/div>\s*<div class="account-order-total">/);
  again(`state.lang='ar'`);
  assert.match(again(`promoOrderRows('${ORDER}')`), /خصم ٥ على طلبك/);
  // another order, or after three days: nothing
  assert.equal(again(`promoOrderRows('${TOKEN}')`), '');
  again.clock.now += 3 * 24 * 3600 * 1000 + 1;
  assert.equal(again(`promoOrderRows('${ORDER}')`), '');
  // an order without promotions made with a key: the total only; an order of an old database: nothing new
  assert.equal(run(`promoOrderBlock({quoted:true,backendId:'${ORDER}',total:61,promotions:[]})`), '<div class="pq-order-total"><span>Total</span><strong>SAR 61.00</strong></div>');
  assert.equal(run(`promoOrderBlock({backendId:'${ORDER}',total:61})`), '');
  // what the server sent is cleaned before it is kept
  assert.deepEqual(run.json(`promoOrderClean([{promotion_id:'x',text_en:'<i>',amount:'3',level:'weird'},{amount:0},null,'x'])`).map(p => [p.text_en, p.amount, p.level]), [['<i>', 3, 'order']]);
});

test('"add more items" is the old path in 3a: no price is asked, the old function is called, and the sheet says plainly that offers are not applied', async () => {
  const run = await priced((name, params) => name === QUOTE ? promoQuote(params.p_cart) : run('created()'));
  run(`state.screen='checkout'; cartSummaryMarkup()`);
  await run('createOrderAfterVerification()');
  run(`state.cart=cartOf(1,0); state.addonFor={id:'${ORDER}',number:'MK-0031',token:'${TOKEN}'}; state.screen='cart'; calls.length=0`);
  assert.equal(run('cartQuoteWanted()'), false);
  assert.doesNotMatch(run('cart()'), /pq-addon-note/);              // 3b: said only once the server has told which rule applies
  await run.tick();
  const cart = run('cart()');
  assert.equal(quotes(run).length, 0);
  assert.match(cart, /<p class="addon-cart-hint pq-addon-note" role="note">Offers are not applied to added items\.<\/p>/);   // an answer without the 3b key: the rule of before
  assert.doesNotMatch(cart, /couponInput|pq-hint|Offers applied/);
  assert.equal(run('totals().quoted'), undefined);
  run(`state.lang='ar'`);
  assert.match(run('addonCartMarkup()'), /لا تُطبَّق العروض على الأصناف المضافة/);
  run(`state.lang='en'`);
  run.server = () => ({ok: true, order_total: 77});
  await run('sendOrderAddon()');
  assert.deepEqual(run.sent(/addon|create|quote/).map(call => call.name), ['oracy_request_order_addon_v1']);
  assert.equal('quote_key' in run.sent(/addon/)[0].params.p_request, false);
  // an order without a promotion and nothing running: the sheet is the one of before
  const plain = environment('');
  plain(`state.addonFor={id:'${TOKEN}',number:'MK-9',token:null}`);
  assert.doesNotMatch(plain('addonCartMarkup()'), /pq-addon-note/);
  // a promotion is running (badges on the menu): said too, so the badge is not a promise for added items
  const live = await withLive([liveRow()]);
  live(`state.addonFor={id:'${TOKEN}',number:'MK-9',token:null}`);
  live('addonCartMarkup()'); await live.tick(0);
  assert.match(live('addonCartMarkup()'), /Offers are not applied to added items\./);
});

/* ======================= I. the files ======================= */

test('the new files load before app.js, every changed file has a new cache key, and the new words have Arabic', () => {
  const html = read('index.html');
  const scripts = [...html.matchAll(/<script src="(js\/[^"?]+)\?v=([^"]+)"/g)].map(m => m[1]);
  for (const file of ['js/promo-reasons.js', 'js/cart-quote.js', 'js/promotions.js']) {
    assert.ok(scripts.indexOf(file) > scripts.indexOf('js/rewards.js') && scripts.indexOf(file) < scripts.indexOf('js/app.js'), file);
  }
  assert.ok(scripts.indexOf('js/promo-reasons.js') < scripts.indexOf('js/cart-quote.js'));
  for (const file of ['js/promo-reasons.js', 'js/data.js', 'js/table.js', 'js/order-addons.js']) {
    assert.ok(html.includes(`${file}?v=20261008-3a"`), file);
  }
  for (const file of ['js/app.js', 'js/account-orders.js']) assert.ok(html.includes(`${file}?v=20261010-ra"`), file);   // Release A
  assert.ok(html.includes('css/promotions.css?v=20261009-3al"'));   // Licence round
  for (const file of ['js/cart-quote.js', 'js/promotions.js']) assert.ok(html.includes(`${file}?v=20261009-3b"`), file);   // 3b
  for (const pin of ['js/table.js?v=20261008-3a', 'css/table.css?v=20261007-391', 'js/push.js?v=20261010-ra', 'js/table-calls.js?v=20261007-1b', 'js/rewards.js?v=20261010-ra',
    'js/i18n.js?v=20261006-cx4f', 'js/auth.js?v=20261003-gate4', 'css/theme.css?v=20261006-cx4i', 'js/theme.js?v=20261006-cx4c']) assert.ok(html.includes(pin + '"'), pin);
  assert.equal(html.match(/<link rel="stylesheet" href="(css\/[^"?]+)/g).at(-1).endsWith('css/theme.css'), true);
  // every customer sentence of the new files is written in both languages
  for (const file of ['js/cart-quote.js', 'js/promotions.js']) {
    const source = read(file);
    const pairs = [...source.matchAll(/(?:cartQuoteCopy|promoCopy)\(\s*(["`])((?:(?!\1)[\s\S])*)\1,\s*(["`])((?:(?!\3)[\s\S])*)\3\)/g)];
    assert.ok(pairs.length > 20, `${file}: ${pairs.length}`);
    for (const pair of pairs) assert.match(pair[4], /[؀-ۿ]/, pair[2]);
  }
  // the switches of the owner are not touched
  const config = read('js/brand-config.js');
  const base = fs.existsSync('/mnt/user-data/outputs/batch-391/customer-app/js/brand-config.js') ? fs.readFileSync('/mnt/user-data/outputs/batch-391/customer-app/js/brand-config.js', 'utf8') : config;
  assert.equal(config, base);
  // the app never adds a promotion up: no percentage of a promotion is computed on the device
  assert.doesNotMatch(read('js/cart-quote.js').replace(/function cartQuoteHintGain[\s\S]*?\n}\n/, ''), /\* *p\.value *\/ *100|value *\/ *100/);
});

/* ======================= J. Reconciliation round (9 Oct): C1–C9 ======================= */

test('C1: the price is asked again when its valid_seconds run out (a happy hour starts or ends) — counted from the server, not the device clock', async () => {
  let n = 0;
  const run = await priced((name, params) => promoQuote(params.p_cart, {valid_seconds: 300, valid_until: '2026-10-08T10:05:00Z', quote_key: (++n % 2 ? K1 : K2)}));
  assert.deepEqual(run.lifeTimers().map(t => t.ms), [301000]);
  assert.equal(run.json('cartQuote.quote').valid_seconds, 300);
  // the device clock jumps (a wrong phone clock): nothing happens until the server's seconds have run
  run.clock.now += 10 * 3600 * 1000;
  run('cartSummaryMarkup()'); await run.tick();
  assert.equal(quotes(run).length, 2);                         // a draw after the life ran out asks once…
  run.clock.now -= 10 * 3600 * 1000;
  const timer = run.lifeTimers().at(-1);
  timer.fn(); timer.fn = null; await run.tick();
  assert.equal(quotes(run).length, 3);                          // …and the life timer asks by itself
  assert.equal(run('cartQuote.status'), 'fresh');
  // an answer without valid_seconds: 90 s, as before; a broken one (0) is never sooner than 5 s
  const old = await priced();
  assert.deepEqual(old.lifeTimers().map(t => t.ms), [91000]);
  const zero = await priced((name, params) => quoteFor(params.p_cart, {valid_seconds: 0}));
  assert.equal(zero('cartQuoteLife(cartQuote.quote)'), 5000);
  assert.ok(quotes(zero).length <= 7);                              // the test's own clock ran its timers: no storm
  // only on the cart and the checkout: elsewhere the price is just marked old
  const away = await priced((name, params) => quoteFor(params.p_cart, {valid_seconds: 120}));
  away(`state.screen='home'`);
  const life = away.lifeTimers()[0]; life.fn(); life.fn = null; await away.tick();
  assert.equal(quotes(away).length, 1);
  assert.equal(away('cartQuote.stale'), true);
  // the price inside "price_changed" gets its own life too
  assert.match(read('js/cart-quote.js'), /cartQuoteAfter\(quote\);\n  cartQuoteValidity\(quote\);\n  \/\/ Nothing was saved/);
});

test('C2: a real code that is only not applicable now stays and is sent again; the ones that cannot change with the cart are taken off', async () => {
  const kept = ['minimum_not_met', 'better_offer_applied', 'not_with_item_offer', 'nothing_to_reduce', 'would_be_free', 'outside_hours', 'wrong_order_type'];
  const dropped = ['code_not_valid', 'sign_in_needed', 'too_many_tries', 'used_already', 'not_first_order', 'a_new_reason'];
  assert.deepEqual(environment('').json('PROMO_CODE_KEPT').sort(), [...kept].sort());
  for (const reason of [...kept, ...dropped]) {
    const run = await priced(withCode(code => ({code: {code, applied: false, reason, order_types: ['delivery'], missing: 4}})));
    run(`state.coupon='LUNCH'`);
    await run('applyCoupon()'); await run.tick();
    run('state.cart[0].qty=4; cartSummaryMarkup()'); await run.tick();
    const resent = quotes(run).filter(call => call.params.p_cart.code === 'LUNCH').length;
    assert.equal(resent, kept.includes(reason) ? 2 : 1, reason);
  }
  const run = await priced(withCode(code => ({code: {code, applied: false, reason: 'wrong_order_type', order_types: ['dinein', 'delivery']}})));
  run(`state.coupon='LUNCH'`);
  await run('applyCoupon()'); await run.tick();
  assert.match(run('couponBoxMarkup()'), /pq-code-note">This code is for dine-in and delivery orders\.</);
});

test('C3/C4: a visitor is asked to sign in before typing a code; no field at all where the restaurant has no code; a typed code always keeps its field', async () => {
  // visitor away from a table, codes exist
  const visitor = await priced((name, params) => quoteFor(params.p_cart, {codes_available: true, signed_in: false}), {guest: true});
  let box = visitor('couponBoxMarkup()');
  assert.doesNotMatch(box, /couponInput/);
  assert.match(box, /Have a coupon or promo code\?\s+<button type="button" class="link" onclick="go\('signInPage'\)">Sign in to use it/);
  visitor(`state.lang='ar'`);
  assert.match(visitor('couponBoxMarkup()'), /سجّل الدخول لاستخدامه/);
  // signed in, no code and no voucher running: nothing
  const none = await priced((name, params) => quoteFor(params.p_cart, {codes_available: false}));
  assert.equal(none('couponBoxMarkup()'), '');
  assert.doesNotMatch(none('cart()'), /couponInput|Have a coupon/);
  // …but a code the customer already typed keeps its place
  none(`state.coupon='X'`);
  assert.match(none('couponBoxMarkup()'), /couponInput/);
  // codes exist: the one field
  const some = await priced((name, params) => quoteFor(params.p_cart, {codes_available: true}));
  assert.match(some('couponBoxMarkup()'), /placeholder="Coupon or promo code"/);
  // not told yet (a server before the reconciliation): the field, as before
  assert.match((await priced())('couponBoxMarkup()'), /couponInput/);
  // a guest at a table: the coupon line goes too when nothing can be signed in for
  const guest = environment(`?t=${KEY}`);
  guest.server = (name, params) => name === 'oracy_table_scan_v1' ? guest('scanOk()') : quoteFor(params.p_cart, {codes_available: false});
  guest('tableBoot()'); await guest('tableSettled()'); await guest.settle();
  guest('cartSummaryMarkup()'); await guest.tick();
  assert.doesNotMatch(guest('cart()'), /Have a coupon/);
  guest.server = (name, params) => name === 'oracy_table_scan_v1' ? guest('scanOk()') : quoteFor(params.p_cart, {codes_available: true});
  guest('cartQuoteStale()'); await guest.tick();
  assert.match(guest('cart()'), /Have a coupon\?/);
  // the server answers a visitor's code without looking it up (C3): the words are "Sign in to use this code" with a link
  const typed = await priced(withCode(code => ({code: {code, applied: false, reason: 'sign_in_needed'}}), quoteFor), {guest: true});
  typed(`state.coupon='SUMMER'`);
  await typed('applyCoupon()'); await typed.tick();
  assert.match(typed('couponBoxMarkup()'), /Sign in to use this code <button type="button" class="link" onclick="go\('signInPage'\)">Sign in/);
});

test('C5: the Orders screen, the tracking card and the add-on note read what an order was given from the server, on any device', async () => {
  const ORDER_PROMOS = 'oracy_order_promotions_v1';
  const answer = {order_id: ORDER, order_number: 'MK-0031', status: 'preparing', currency: 'SAR', items_total: 33, discount: 5, delivery_fee: 0, total: 28, vat_amount: 3.65,
    has_promotions: true, promotions: [{promotion_id: P_DRINKS, name_en: 'Lassi 20', name_ar: 'لاسي', text_en: '', text_ar: '', kind: 'percent', value: 20, level: 'item', amount: 2},
      {promotion_id: P_FIVE, name_en: 'Three off', name_ar: '', text_en: '', text_ar: '', kind: 'amount', value: 3, level: 'order', amount: 3}],
    lines: [], promotion_discount: 5, other_discount: 0, still_counts: true, added_items_in_full: true};
  // another device: nothing kept locally; signed in, own order by id
  const run = environment('');
  run('signIn()');
  run.server = (name, params) => name === ORDER_PROMOS ? answer : null;
  run(`accountOrders.rows=[{id:'${ORDER}',order_number:'MK-0031',status:'preparing',fulfillment_type:'takeaway',total:28,items:[{quantity:1,name:'Lassi'}],created_at:'2026-10-08T10:00:00Z'}]; state.orderTab='active'; state.screen='track'`);
  assert.doesNotMatch(run('accountOrdersPage()'), /pq-order-row/);
  await run.tick(0);
  assert.deepEqual(run.sent(/order_promotions/).map(c => c.params), [{p_order_id: ORDER, p_tracking_token: null}]);
  assert.equal(run('draws'), 1);                                      // drawn again when the answer came
  const page = run('accountOrdersPage()');
  assert.match(page, /pq-order-row"><span>Lassi 20<\/span><span>− SAR 2\.00/);
  assert.match(page, /pq-order-row"><span>Three off<\/span><span>− SAR 3\.00/);
  run(`state.lang='ar'`);
  assert.match(run('accountOrdersPage()'), /pq-order-row"><span>لاسي/);
  // asked again at most once a minute
  run('accountOrdersPage(); accountOrdersPage()'); await run.tick(0);
  assert.equal(run.sent(/order_promotions/).length, 1);
  // the add-on sheet of that order says it plainly, from the server's added_items_in_full
  run(`state.lang='en'; state.addonFor={id:'${ORDER}',number:'MK-0031',token:null}`);
  assert.match(run('addonCartMarkup()'), /Offers are not applied to added items\./);
  // a visitor's own order: by its tracking token; the server's total wins over the device's
  const mine = environment('');
  mine.server = (name, params) => name === ORDER_PROMOS ? answer : null;
  mine(`state.order={id:'MK-0031',backendId:'${ORDER}',trackingToken:'${TOKEN}',quoted:true,total:30,promotions:[],status:'preparing',orderType:'takeaway',items:[]}; state.screen='track'`);
  mine('orderNoteLine(state.order)'); await mine.tick(0);
  assert.equal(mine.sent(/order_promotions/)[0].params.p_tracking_token, TOKEN);
  const block = mine('orderNoteLine(state.order)');
  assert.match(block, /Three off/);
  assert.match(block, /pq-order-total"><span>Total<\/span><strong>SAR 28\.00/);
  // the server says "no promotion": the device's copy is not shown against it
  const none = environment('');
  none.server = () => ({...answer, has_promotions: false, promotions: [], discount: 0});
  none(`promoOrderRemember('${ORDER}', {total:28, discount:5, promotions:[{promotion_id:'x',name_en:'Old copy',amount:5,level:'order'}]})`);
  assert.match(none(`promoOrderRows('${ORDER}')`), /Old copy/);             // first draw: the device's copy
  await none.tick(0);
  assert.equal(none(`promoOrderRows('${ORDER}')`), '');                      // then the server's word
  // no access / unknown order (null) or no connection: the device's copy stays the fallback
  for (const failing of [() => null, () => { throw offline(); }]) {
    const off = environment('');
    off.server = failing;
    off(`promoOrderRemember('${ORDER}', {total:28, discount:5, promotions:[{promotion_id:'x',name_en:'Kept here',amount:5,level:'order'}]})`);
    off(`promoOrderRows('${ORDER}')`); await off.tick(0);
    assert.match(off(`promoOrderRows('${ORDER}')`), /Kept here/);
  }
  // a database without it: asked once on this visit, then never again
  const old = environment('');
  old.server = () => { throw missing(); };
  old(`promoOrderRows('${ORDER}')`); await old.tick(0);
  old.clock.now += 120000;
  old(`promoOrderRows('${ORDER}'); promoOrderRows('${TOKEN}')`); await old.tick(0);
  assert.equal(old.sent(/order_promotions/).length, 1);
  // an order that was not made with a price key never asks (the cards of before stay exactly as they were)
  const plain = environment('');
  plain(`orderNoteLine({id:'MK-1',backendId:'${ORDER}',trackingToken:'${TOKEN}',status:'preparing'})`); await plain.tick(0);
  assert.equal(plain.sent(/order_promotions/).length, 0);
});

test('C6: every stable error word is worded in English and Arabic from one table; "other" keeps the server\'s sentence; an unknown word is the generic one', async () => {
  const words = ['item_unavailable', 'choice_changed', 'item_outside_hours', 'item_offer_limit', 'branch_closed', 'table_inactive', 'invalid_cart', 'sign_in_needed',
    'name_needed', 'phone_needed', 'delivery_fee_changed', 'location_changed', 'invalid_points', 'order_id_conflict', 'quote_key_required', 'invalid_order_type', 'quote_mismatch'];
  const run = environment('');
  assert.deepEqual(run.json('Object.keys(PROMO_ERRORS)').sort(), [...words].sort());
  const contract = fs.existsSync('/mnt/user-data/outputs/batch-3a/API-3A-CONTRACT.md') ? fs.readFileSync('/mnt/user-data/outputs/batch-3a/API-3A-CONTRACT.md', 'utf8') : '';
  for (const word of words) {
    if (contract) assert.ok(contract.includes('`' + word + '`'), word);
    assert.ok(run(`promoErrorText('${word}','en')`).length > 10, word);
    assert.match(run(`promoErrorText('${word}','ar')`), /[؀-ۿ]/, word);
  }
  assert.equal(run(`promoErrorText('other','en')`), '');
  assert.equal(run(`promoErrorText(undefined,'en')`), '');
  assert.equal(run(`promoErrorText('brand_new_word','en')`), 'Could not place order. Try again.');
  assert.match(run(`promoErrorText('brand_new_word','ar')`), /تعذر/);
  // the request keeps the word only for the functions' own errors
  run.set('fetch', async () => ({ok: false, status: 400, json: async () => ({code: 'P0001', message: 'This branch is not accepting orders', hint: 'branch_closed'})}));
  await assert.rejects(run(`realCustomerOrderRpc('${QUOTE}', {})`), error => error.hint === 'branch_closed');
  run.set('fetch', async () => ({ok: false, status: 400, json: async () => ({code: 'XX000', message: 'x', hint: 'branch_closed'})}));
  await assert.rejects(run(`realCustomerOrderRpc('${QUOTE}', {})`), error => error.hint === undefined);
  // the price function refuses with a word: the cart says it in the customer's language
  const priced1 = await priced();
  priced1.server = () => { throw refuse('This branch is not accepting orders', {status: 400, code: 'P0001', hint: 'branch_closed'}); };
  priced1('state.cart[0].qty=4; cartSummaryMarkup()'); await priced1.tick();
  assert.match(priced1('cartSummaryMarkup()'), /This branch is not taking orders right now\./);
  priced1(`state.lang='ar'`);
  assert.match(priced1('cartSummaryMarkup()'), /هذا الفرع لا يستقبل الطلبات الآن/);
  // the order function refuses with a word: the toast says it in the customer's language, the cart stays
  for (const [hint, en] of [['item_unavailable', 'An item in your cart is no longer available. Please review your cart.'], ['brand_new_word', 'Could not place order. Try again.'],
    ['other', 'A sentence only the server knows']]) {
    const order = await priced((name, params) => { if (name === QUOTE) return promoQuote(params.p_cart); throw refuse(hint === 'other' ? 'A sentence only the server knows' : 'x', {status: 400, code: 'P0001', hint}); });
    order(`state.screen='checkout'; cartSummaryMarkup()`);
    await order('createOrderAfterVerification()');
    assert.equal(order.toasts().at(-1), en, hint);
    assert.equal(order('state.cart.length'), 2);
  }
});

test('C7/C8: per-reason fields are used; before an address a promotion waiting for the fee is said so, never "cannot make the order free", and never a 0.00 total', async () => {
  const waiting = {...five(), reason: 'would_be_free', pending: 'delivery_fee'};
  const run = environment('');
  run('signIn()');
  run(`state.orderType='delivery'`);
  run.server = (name, params) => quoteFor(params.p_cart, {delivery: {known: false, reason: 'address_needed'}, delivery_fee: null, total_is_final: false, delivery_pending: true,
    not_applied: [waiting, lunch({reason: 'minimum_not_met', min_order: 70, missing: 9})]});
  run('cartSummaryMarkup()'); await run.tick();
  const page = run('cartSummaryMarkup()');
  assert.match(page, /pq-hint" role="status">5\.00 off your order is added when you choose your delivery address\.</);
  assert.doesNotMatch(page, /cannot make the whole order free/);
  assert.equal(page.split('pq-hint').length, 2);                      // still one hint: the waiting offer comes first
  assert.match(page, /Food total<\/span><span>SAR 61\.00/);
  run(`state.lang='ar'`);
  assert.match(run('cartSummaryMarkup()'), /يُضاف عرض «خصم ٥ على طلبك» عند اختيار عنوان التوصيل/);
  assert.match(run('cartSummaryMarkup()'), /إجمالي الطعام/);
  // the same reason without "pending" is the plain sentence
  const plain = await priced((name, params) => quoteFor(params.p_cart, {not_applied: [{...five(), reason: 'would_be_free'}]}));
  assert.match(plain('cartSummaryMarkup()'), /This offer cannot make the whole order free\. Add another item to use it\./);
  // C7: fields arrive with their reason and are kept
  const fields = run.json(`cartQuoteClean(${JSON.stringify(quoteFor({items: [{menu_item_id: KABAB, quantity: 1}]}, {not_applied: [waiting, lunch({reason: 'wrong_order_type', order_types: ['dinein']})],
    code: {code: 'X', applied: false, reason: 'wrong_order_type', order_types: ['delivery']}}))}, 1)`);
  assert.equal(fields.not_applied[0].pending, 'delivery_fee');
  assert.deepEqual(fields.not_applied[1].order_types, ['dinein']);
  assert.deepEqual(fields.code.order_types, ['delivery']);
});

test('C9: one number style everywhere — "20%", "12.5%", "SAR 5.00"; the server never sends a symbol and the app never shows "20.00%"', async () => {
  const run = await withLive([]);
  const label = row => run(`cartQuoteOfferLabel(${JSON.stringify(row)})`);
  const live = row => run(`promoLabel(promoLiveClean(${JSON.stringify(liveRow(row))}))`);
  assert.equal(label({kind: 'percent', value: 20.00}), '20% off');
  assert.equal(label({kind: 'percent', value: 12.50}), '12.5% off');
  assert.equal(label({kind: 'amount', value: 5.00}), 'SAR 5.00 off');
  assert.equal(label({kind: 'delivery_percent', value: 100.00}), 'free delivery');
  assert.equal(live({kind: 'percent', value: 20.00}), '20% off');
  assert.equal(live({kind: 'percent', value: 12.5}), '12.5% off');
  assert.equal(live({kind: 'amount', value: 5}), 'SAR 5.00 off');
  run(`state.lang='ar'`);
  assert.equal(label({kind: 'percent', value: 12.5}), 'خصم 12.5%');
  assert.equal(live({kind: 'percent', value: 20}), 'خصم 20%');
  for (const file of ['js/cart-quote.js', 'js/promotions.js']) assert.doesNotMatch(read(file), /toFixed\(2\)\}%|% off`/);
});

/* ======================= K. Licence round (9 Oct): licence number and link ======================= */

const LINK = 'https://mc.gov.sa/ar/eservices/Pages/permit.aspx?no=42&t=1';

test('L2: the licence keys are kept only when well-formed; the link only when it is https with the contract\'s characters', () => {
  const run = environment('');
  const keep = row => run.json(`promoLicence(${JSON.stringify(row)})`);
  assert.deepEqual(keep({licence_number: ' MC-2026-0042 ', licence_link: LINK}), {licence_number: 'MC-2026-0042', licence_link: LINK});
  assert.deepEqual(keep({}), {});
  assert.deepEqual(keep({licence_number: null, licence_link: null}), {});
  assert.deepEqual(keep({licence_number: '', licence_link: ''}), {});
  for (const bad of ['http://mc.gov.sa/p/1', 'javascript:alert(1)', 'data:text/html,x', 'HTTPS://mc.gov.sa/p', 'https://mc.gov.sa/p 1', 'https://mc.gov.sa/"><img', 'https://mc.gov.sa/<x>',
    "https://mc.gov.sa/p'1", 'https://user@evil.com/p', 'https://', 'https:///p', '//mc.gov.sa/p', 'mc.gov.sa/p', 'https://mc.gov.sa/' + 'a'.repeat(300), 12]) {
    assert.deepEqual(keep({licence_link: bad}), {}, String(bad));
  }
  for (const good of ['https://mc.gov.sa', 'https://mc.gov.sa/', 'https://mc.gov.sa:8443/p/1', 'https://mc.gov.sa/p/1?no=42&t=1', 'https://a-b.example.sa/x_y~z/(1)*+,;=%20']) {
    assert.equal(keep({licence_link: good}).licence_link, good, good);
  }
  for (const bad of ['a'.repeat(61), 'MC‮42', 'MC\n42', 42, {}]) assert.deepEqual(keep({licence_number: bad}), {}, JSON.stringify(bad));
  // every place that cleans a promotion keeps them: the quote's rows, the order's rows, the banners
  const q = run.json(`cartQuoteClean(${JSON.stringify(quoteFor({items: [{menu_item_id: KABAB, quantity: 1}]}, {applied: [{...five(), licence_number: 'MC-1', licence_link: LINK}],
    not_applied: [lunch({reason: 'outside_hours', licence_link: 'http://x.sa'})]}))}, 1)`);
  assert.equal(q.applied[0].licence_number, 'MC-1');
  assert.equal(q.applied[0].licence_link, LINK);
  assert.equal('licence_link' in q.not_applied[0], false);
  assert.equal(run.json(`promoOrderClean([{promotion_id:'x',amount:3,level:'order',licence_number:'MC-9'}])`)[0].licence_number, 'MC-9');
  assert.equal(run.json(`promoLiveClean(${JSON.stringify(liveRow({licence_number: 'MC-2026-0042', licence_link: LINK}))})`).licence_link, LINK);
});

test('the Offers card shows "Licence no. … · Verify" (opens outside, noopener); nothing when the keys are absent; not on the Home strip or the cart line', async () => {
  const run = await withLive([liveRow({licence_number: 'MC-2026-0042', licence_link: LINK}), liveRow({promotion_id: P_FIVE, text_en: 'No licence here'}),
    liveRow({promotion_id: P_FREE, text_en: 'Link only', licence_link: 'https://mc.gov.sa/p/7'}), liveRow({promotion_id: P_DRINKS, text_en: 'Bad link', licence_link: 'javascript:alert(1)'})]);
  const offers = run('promoOffersMarkup()');
  assert.match(offers, /<article class="pq-card pq-card-wide pq-card-licensed on">\s*<button type="button" class="pq-card-open" onclick="promoOpen\('[0-9a-f-]+'\)">/);
  assert.ok(offers.includes('<p class="pq-licence"><span>Licence no. <bdi dir="ltr">MC-2026-0042</bdi></span> · <a href="https://mc.gov.sa/ar/eservices/Pages/permit.aspx?no=42&amp;t=1" target="_blank" rel="noopener noreferrer">Verify</a></p>'));
  assert.ok(offers.includes('<p class="pq-licence"><a href="https://mc.gov.sa/p/7" target="_blank" rel="noopener noreferrer">Verify the licence</a></p>'));
  assert.equal(offers.split('pq-licence"').length, 3);                      // two cards with a licence; none for the others
  assert.doesNotMatch(offers, /javascript:|Licence no\. <bdi dir="ltr"><\/bdi>/);
  assert.doesNotMatch(offers, /<button[^>]*>(?:(?!<\/button>)[\s\S])*<a /);    // never a link inside a button
  run(`state.lang='ar'`);
  assert.match(run('promoOffersMarkup()'), /رقم الترخيص <bdi dir="ltr">MC-2026-0042<\/bdi><\/span> · <a [^>]+>تحقق<\/a>/);
  run(`state.lang='en'`);
  assert.doesNotMatch(run('promoStripMarkup()'), /pq-licence|Licence/);
  // the cart's "Offers applied" lines stay as they are (too crowded for it)
  const cart = await priced((name, params) => promoQuote(params.p_cart, {applied: [{...drinks(), licence_number: 'MC-1', licence_link: LINK}, five()]}));
  assert.doesNotMatch(cart('cartSummaryMarkup()'), /pq-licence|Licence/);
});

test('the order\'s promotion lines (Orders screen, confirmation) carry the licence written on the order', async () => {
  const run = environment('');
  run('signIn()');
  run.server = (name) => name === 'oracy_order_promotions_v1' ? {order_id: ORDER, has_promotions: true, total: 28, discount: 5, added_items_in_full: true,
    promotions: [{promotion_id: P_FIVE, name_en: 'Three off', kind: 'amount', value: 3, level: 'order', amount: 3, licence_number: 'MC-2026-0042', licence_link: LINK},
                 {promotion_id: P_DRINKS, name_en: 'Lassi 20', kind: 'percent', value: 20, level: 'item', amount: 2}]} : null;
  run(`promoOrderRows('${ORDER}')`); await run.tick(0);
  const rows = run(`promoOrderRows('${ORDER}')`);
  assert.match(rows, /Three off<\/span><span>− SAR 3\.00<\/span><\/div><p class="pq-licence"><span>Licence no\. <bdi dir="ltr">MC-2026-0042<\/bdi><\/span> · <a href="https:\/\/mc\.gov\.sa[^"]+" target="_blank" rel="noopener noreferrer">Verify<\/a><\/p>/);
  assert.match(rows, /Lassi 20<\/span><span>− SAR 2\.00<\/span><\/div><\/div>$/);       // no licence: nothing under it
  // the device's own copy keeps them too (fallback)
  const own = environment('');
  own(`promoOrderRemember('${ORDER}', {total:28, discount:3, promotions:[{promotion_id:'x',name_en:'Kept',amount:3,level:'order',licence_number:'MC-7'}]})`);
  own.server = () => { throw offline(); };
  assert.match(own(`promoOrderRows('${ORDER}')`), /Licence no\. <bdi dir="ltr">MC-7<\/bdi>/);
});
