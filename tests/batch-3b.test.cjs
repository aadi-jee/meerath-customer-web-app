// Batch 3b (400): what changes for the customer app. Built to API-3B-CONTRACT.md:
//  section 6 (items added to an app order are priced again; added_items_in_full false + adjustments) and
//  rule 0.4 (channel "pos" = the till; never an app offer). Section 3 (0.00 app orders) is the till's only.
// Run: node --test tests/batch-3b.test.cjs. No network. Reuses the 3a test environment.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const ORDER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const TOKEN = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const P1 = 'f0000000-0000-4000-8000-000000000001';
const P2 = 'f0000000-0000-4000-8000-000000000002';
const P3 = 'f0000000-0000-4000-8000-000000000003';
const BRANCH = '22222222-2222-2222-2222-222222222222';

/** A light tab: the files that read promotions, with every server call going to run.server. */
function environment() {
  const local = new Map(), timers = [];
  const box = map => ({getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key)});
  const context = vm.createContext({
    console: {log() {}, warn() {}, error() {}}, URL, URLSearchParams, Intl, Date, AbortController, Promise,
    crypto: {randomUUID: () => 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001'},
    setTimeout: (fn, ms) => { timers.push({fn, ms}); return timers.length; }, clearTimeout: () => {}, setInterval: () => 1,
    localStorage: box(local), sessionStorage: box(new Map()), location: {pathname: '/', search: '', hash: ''},
    history: {state: null, replaceState() {}}, navigator: {},
    window: {addEventListener() {}}, document: {hidden: false, addEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => []},
  });
  for (const file of ['brand-config.js', 'data.js', 'ordering-hours.js', 'table.js', 'promo-reasons.js', 'cart-quote.js', 'promotions.js']) vm.runInContext(read(`js/${file}`), context);
  vm.runInContext(`
    const I18N={en:{sar:'SAR',total:'Total'},ar:{sar:'ر.س',total:'الإجمالي'}};
    const state={lang:'en',screen:'cart',cart:[],orderType:'takeaway',isLoggedIn:true,customer:{},order:null,addonFor:null};
    function t(k){return (I18N[state.lang]||{})[k]||k}
    function money(n){return t('sar')+' '+Number(n).toFixed(2)}
    let draws=0; function renderKeepScroll(){draws++}
    function addonTarget(){return state.addonFor}
    menuConnection.payload={branches:[{id:'${BRANCH}'}]};
  `, context);
  const run = code => vm.runInContext(code, context);
  run.server = () => null;
  context.__server = (name, params) => run.server(name, params);
  run(`customerOrderRpc=async(name,params)=>__server(name,params)`);
  run.json = code => JSON.parse(run(`JSON.stringify(${code})`));
  run.tick = async () => { for (let i = 0; i < 4; i++) { for (const t of timers.splice(0)) if (t.fn) t.fn(); for (let j = 0; j < 6; j++) await new Promise(r => setImmediate(r)); } };
  return run;
}
const promo = (id, name, amount, extra = {}) => ({promotion_id: id, name_en: name, name_ar: '', text_en: '', text_ar: '', kind: 'percent', value: 15, max_discount: 50, level: 'order', amount, ...extra});
/** The contract's example (section 6) as the replica answers it (INTEGRATION-3B.md row 18): 3 × 23.00, 15 % up to 50 = 10.35;
 *  2 Lassi added -> promotions[0].amount 13.35 (current, already including the difference); adjustments +3.00 is history. */
const read400 = (extra = {}) => ({order_id: ORDER, order_number: 'MK-0031', status: 'preparing', currency: 'SAR', items_total: 89, discount: 13.35, delivery_fee: 0, total: 75.65,
  vat_amount: 9.87, has_promotions: true, promotions: [promo(P1, 'Fifteen', 13.35)], lines: [], promotion_discount: 13.35, delivery_fee_before: 0, delivery_reduction: 0,
  total_reduction: 13.35, other_discount: 0, still_counts: true, added_items_in_full: false,
  adjustments: [{promotion_id: P1, discount_delta: 3.00, addon_id: 'aaaaaaaa-0000-4000-8000-000000000009', at: '2026-10-09T12:00:00+03:00'}], ...extra});

test('section 6: the add-on sheet says the 400 rule — offers checked again for the whole order, never more for what was ordered (EN and AR)', async () => {
  const run = environment();
  run.server = name => name === 'oracy_order_promotions_v1' ? read400() : null;
  run(`state.addonFor={id:'${ORDER}',number:'MK-0031',token:'${TOKEN}'}`);
  assert.equal(run(`promoAddonNote('${ORDER}')`), '');                     // not told yet: no claim either way
  await run.tick();
  const note = run(`promoAddonNote('${ORDER}')`);
  assert.equal(note, '<p class="addon-cart-hint pq-addon-note" role="note">When the restaurant accepts these items, offers are checked again for the whole order. You never pay more for what you already ordered.</p>');
  assert.doesNotMatch(note, /not applied/);
  run(`state.lang='ar'`);
  assert.match(run(`promoAddonNote('${ORDER}')`), /تُحتسب العروض من جديد على الطلب كاملاً، ولن تدفع أكثر مقابل ما طلبته سابقاً/);
});

test('section 6: a 394 server (added_items_in_full true), an answer without the key, or a server without the order read keep the 3a sentence', async () => {
  for (const answer of [read400({added_items_in_full: true, adjustments: undefined, promotions: [promo(P1, 'Fifteen', 10.35)], promotion_discount: 10.35, total_reduction: 10.35}),
    read400({added_items_in_full: undefined, adjustments: undefined})]) {
    const run = environment();
    run.server = () => answer;
    run(`promoAddonNote('${ORDER}')`); await run.tick();
    assert.equal(run(`promoAddonNote('${ORDER}')`), '<p class="addon-cart-hint pq-addon-note" role="note">Offers are not applied to added items.</p>');
  }
  const old = environment();
  old.server = () => { throw Object.assign(new Error('x'), {status: 404, code: 'PGRST202'}); };
  old(`promoOrderRemember('${ORDER}', {total:58.65, discount:10.35, promotions:[{promotion_id:'${P1}',name_en:'Fifteen',amount:10.35,level:'order'}]})`);
  old(`promoAddonNote('${ORDER}')`); await old.tick();
  assert.match(old(`promoAddonNote('${ORDER}')`), /Offers are not applied to added items\./);
  // an order without a promotion and nothing running: no note on any server
  const none = environment();
  none.server = () => read400({has_promotions: false, promotions: [], adjustments: [], promotion_discount: 0, total_reduction: 0});
  none(`promoAddonNote('${ORDER}')`); await none.tick();
  assert.equal(none(`promoAddonNote('${ORDER}')`), '');
});

test('section 6: the order\'s promotion lines are the server\'s current amounts; adjustments are history and never added', async () => {
  const run = environment();
  run.server = () => read400();
  run(`promoOrderRows('${ORDER}')`); await run.tick();
  const rows = run(`promoOrderRows('${ORDER}')`);
  assert.match(rows, /<span>Fifteen<\/span><span>− SAR 13\.35<\/span>/);       // as answered, not 13.35 + 3.00
  assert.doesNotMatch(rows, /16\.35|Offer on added items/);
  assert.equal(rows.split('pq-order-row').length, 2);
  // a promotion that counts only after the add-on (replica row 19): its own row with its amount, by its name; no adjustments row
  const first = environment();
  first.server = () => read400({promotions: [promo(P2, 'Five from 80', 5, {kind: 'amount', value: 5})], adjustments: [], discount: 5, promotion_discount: 5, total_reduction: 5});
  first(`promoOrderRows('${ORDER}')`); await first.tick();
  const one = first(`promoOrderRows('${ORDER}')`);
  assert.match(one, /<span>Five from 80<\/span><span>− SAR 5\.00/);
  assert.equal(one.split('pq-order-row').length, 2);
  // both at once: the 15 % grew (+3.00, history) and the 5 off counts for the first time
  const both = environment();
  both.server = () => read400({promotions: [promo(P1, 'Fifteen', 13.35), promo(P2, 'Five from 80', 5, {kind: 'amount', value: 5})], promotion_discount: 18.35, total_reduction: 18.35});
  both(`promoOrderRows('${ORDER}')`); await both.tick();
  const amounts = [...both(`promoOrderRows('${ORDER}')`).matchAll(/− SAR ([0-9.]+)/g)].map(m => Number(m[1]));
  assert.deepEqual(amounts, [13.35, 5]);
  // the order kept what it had (promotion paused, nothing bigger): no adjustment, the line as answered
  const kept = environment();
  kept.server = () => read400({promotions: [promo(P2, 'Ten off', 10, {kind: 'amount', value: 10})], adjustments: [], promotion_discount: 10, total_reduction: 10});
  kept(`promoOrderRows('${ORDER}')`); await kept.tick();
  assert.match(kept(`promoOrderRows('${ORDER}')`), /Ten off<\/span><span>− SAR 10\.00/);
  // nonsense in adjustments changes nothing
  const junk = environment();
  junk.server = () => read400({adjustments: [null, 'x', {promotion_id: P1, discount_delta: 'abc'}, {discount_delta: 2}]});
  junk(`promoOrderRows('${ORDER}')`); await junk.tick();
  assert.match(junk(`promoOrderRows('${ORDER}')`), /Fifteen<\/span><span>− SAR 13\.35/);
});

test('section 6: deltas that cancel out (two add-ons, +3.00 and −3.00 on one promotion, +2.00 / −2.00 across two) do not move the split', async () => {
  const run = environment();
  run.server = () => read400({promotions: [promo(P1, 'Fifteen', 10.35), promo(P2, 'Five from 80', 5, {kind: 'amount', value: 5})], promotion_discount: 15.35, total_reduction: 15.35,
    adjustments: [{promotion_id: P1, discount_delta: 3}, {promotion_id: P1, discount_delta: -3}, {promotion_id: P2, discount_delta: 2}, {promotion_id: P1, discount_delta: -2}]});
  run(`promoOrderRows('${ORDER}')`); await run.tick();
  const amounts = [...run(`promoOrderRows('${ORDER}')`).matchAll(/− SAR ([0-9.]+)/g)].map(m => Number(m[1]));
  assert.deepEqual(amounts, [10.35, 5]);                                         // exactly as answered, whatever the history says
});

test('section 6: safety cap — rows that add up to more than the server\'s promotion total are shown as one line with that total', async () => {
  const run = environment();
  run.server = () => read400({promotions: [promo(P1, 'Fifteen', 13.35), promo(P2, 'Five', 5)], promotion_discount: 13.35, total_reduction: 13.35});
  run(`promoOrderRows('${ORDER}')`); await run.tick();
  const rows = run(`promoOrderRows('${ORDER}')`);
  assert.match(rows, /<span>Offers applied<\/span><span>− SAR 13\.35/);
  assert.equal(rows.split('pq-order-row').length, 2);
  run(`state.lang='ar'`);
  assert.match(run(`promoOrderRows('${ORDER}')`), /العروض المطبقة/);
  // rows below the total (a delivery reduction in total_reduction) are shown as answered
  const under = environment();
  under.server = () => read400({promotion_discount: 13.35, delivery_reduction: 15, total_reduction: 28.35});
  under(`promoOrderRows('${ORDER}')`); await under.tick();
  assert.match(under(`promoOrderRows('${ORDER}')`), /Fifteen<\/span><span>− SAR 13\.35/);
  // no total in the answer: the rows as answered
  const none = environment();
  none.server = () => read400({promotion_discount: undefined, total_reduction: undefined});
  none(`promoOrderRows('${ORDER}')`); await none.tick();
  assert.match(none(`promoOrderRows('${ORDER}')`), /Fifteen<\/span><span>− SAR 13\.35/);
});

test('rule 0.4: a promotion for the till only (channels ["pos"]) is never an app offer; with app or table_qr beside it, it stays', async () => {
  const run = environment();
  const row = extra => ({promotion_id: P3, name_en: 'Till ten', name_ar: '', text_en: 'Ten at the till', text_ar: '', kind: 'percent', value: 10, max_discount: null, level: 'order',
    min_order: 0, order_types: [], hours: [], ends_at: null, target: 'menu', target_ids: [], first_order_only: false, sign_in_needed: false, on_now: true, ...extra});
  assert.equal(run.json(`promoLiveClean(${JSON.stringify(row({channels: ['pos']}))})`), null);
  assert.equal(run.json(`promoLiveClean(${JSON.stringify(row({channels: []}))})`), null);
  assert.equal(run.json(`promoLiveClean(${JSON.stringify(row({channels: ['app', 'pos']}))})`).promotion_id, P3);
  assert.equal(run.json(`promoLiveClean(${JSON.stringify(row({channels: ['table_qr', 'pos']}))})`).promotion_id, P3);
  assert.equal(run.json(`promoLiveClean(${JSON.stringify(row({}))})`).promotion_id, P3);       // no channels key (as 394 and 400 answer the app): kept
  // a list that (wrongly) carries a till-only row: it is not on the strip or the Offers screen
  run.server = name => name === 'oracy_promotions_live_v1' ? [row({channels: ['pos']}), row({promotion_id: P1, text_en: 'For the app', channels: ['app', 'pos']})] : null;
  await run('promoLiveLoad(true)');
  const offers = run('promoOffersMarkup()');
  assert.doesNotMatch(offers, /Ten at the till/);
  assert.match(offers, /For the app/);
});

test('3b changes nothing else the app reads: no other new key is needed, and the files that changed have new cache keys', () => {
  const html = read('index.html');
  for (const file of ['js/cart-quote.js', 'js/promotions.js']) assert.ok(html.includes(`${file}?v=20261009-3b"`), file);
  assert.ok(html.includes('css/promotions.css?v=20261009-3al"'));
  // the till's words never reach a customer: unknown reasons are quiet in the cart, a code refused for an unknown reason is said in the generic words
  const run = environment();
  for (const reason of ['needs_customer', 'voucher_in_app_only', 'complimentary']) {
    assert.equal(run(`PROMO_REASONS['${reason}']`), undefined, reason);
    assert.equal(run(`promoReasonText('${reason}','code',{},'en')`), 'This offer is not applied to your order');
  }
});
