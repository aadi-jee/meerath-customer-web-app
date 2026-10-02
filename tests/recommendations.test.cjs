// Batch C (244): smart recommendations in the customer app.
// Run: node --test tests/recommendations.test.cjs. No database writes / network.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
class TestDate extends Date {
  constructor(...args) { super(...(args.length ? args : ['2026-09-08T12:00:00Z'])); }
  static now() { return Date.parse('2026-09-08T12:00:00Z'); }
}
const ids = {karahi:'a1000000-0000-4000-8000-000000000001', naan:'a1000000-0000-4000-8000-000000000002',
  lassi:'a1000000-0000-4000-8000-000000000003', kheer:'a1000000-0000-4000-8000-000000000004',
  tikka:'a1000000-0000-4000-8000-000000000005', salad:'a1000000-0000-4000-8000-000000000006'};
const cats = {main:'c1000000-0000-4000-8000-000000000001', side:'c1000000-0000-4000-8000-000000000002',
  drink:'c1000000-0000-4000-8000-000000000003', dessert:'c1000000-0000-4000-8000-000000000004'};
function environment() {
  const sent = [];
  const c = vm.createContext({console, URL, Intl, AbortController, Date: TestDate, setTimeout:()=>0, clearTimeout:()=>{},
    fetch:(url, opts) => { sent.push({url, body: JSON.parse(opts.body)}); return Promise.resolve({ok:true, json:async()=>({})}); },
    localStorage:{getItem:()=>null}, window:{}, document:{getElementById:()=>({parentElement:{scrollTop:0}})}});
  for (const f of ['js/brand-config.js','js/data.js','js/ordering-hours.js','js/auth.js','js/content.js','js/recommendations.js'])
    vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),c);
  const app = fs.readFileSync(path.join(root,'js/app.js'),'utf8');
  vm.runInContext(app.slice(0, app.lastIndexOf('\napplyDir();')),c);
  vm.runInContext(`toast = () => {}; render = () => {}; renderKeepScroll = () => {}; updateCartButtons = () => {}; refreshMenuUI = () => {};
    const I18N = {en:{sar:'SAR',add:'Add'},ar:{sar:'ر.س',add:'أضف'}};
    const ids = ${JSON.stringify(ids)}, cats = ${JSON.stringify(cats)};
    const branch = '44444444-4444-4444-4444-444444444444';
    const row = (id, cat, price, name) => ({id, category_id:cat, base_price:price, is_available:true, name_en:name, offer:null});
    const rows = [row(ids.karahi,cats.main,45,'Karahi'), row(ids.naan,cats.side,2,'Naan'), row(ids.lassi,cats.drink,8,'Lassi'),
      row(ids.kheer,cats.dessert,10,'Kheer'), row(ids.tikka,cats.main,30,'Tikka'), row(ids.salad,cats.side,6,'Salad')];
    const payload = {version:1,offers_version:1,restaurant_id:MENU_CONFIG.restaurantId,
      categories:Object.values(cats).map(id=>({id})),subcategories:[],items:rows,schedules:[],
      branches:[{id:branch}],branch_items:rows.map(r=>({branch_id:branch,menu_item_id:r.id,is_available:true}))};
    menuConnection.status='ready'; menuConnection.lastSuccess=Date.now(); menuConnection.payload=payload;
    const m=mapMenu(payload,new Date('2026-09-08T12:00:00Z')); ITEMS=m.items; OFFERS=m.offers;
    function line(id){ return {id, cartKey:'k'+id, qty:1, price:itemById(id).price, basePrice:itemById(id).price, image:'', extras:[]}; }
  `,c);
  const run = code => vm.runInContext(code,c);
  run.sent = sent;
  return run;
}
const RECO = (extra = '') => `RECO = {version:1, restaurant_id:MENU_CONFIG.restaurantId, max_shown:5, smart_fill:true,
  for_item:{[ids.karahi]:[{id:ids.tikka,source:'manual'},{id:ids.naan,source:'auto'}], [ids.tikka]:[{id:ids.naan,source:'manual'},{id:ids.salad,source:'auto'}]},
  roles:{[cats.main]:'main',[cats.side]:'side',[cats.drink]:'drink',[cats.dessert]:'dessert'},
  popular:[ids.karahi, ids.naan, ids.salad, ids.lassi, ids.kheer, ids.tikka], never_auto:[] ${extra}}; recoLastSuccess = Date.now();`;

test('cart: manual first, then automatic, then complete-the-meal (drink, dessert)', () => {
  const run = environment();
  run(RECO());
  run('state.cart=[line(ids.karahi)]');
  assert.equal(run('JSON.stringify(cartRecommendations().map(i=>i.name+":"+i.recoSource))'),
    '["Tikka:manual","Naan:auto","Lassi:fill","Kheer:fill"]');
});

test('two cart items: each one\'s manual picks before any automatic one; no repeats; nothing already in the cart', () => {
  const run = environment();
  run(RECO());
  run('state.cart=[line(ids.karahi), line(ids.tikka)]');
  assert.equal(run('JSON.stringify(cartRecommendations().map(i=>i.name+":"+i.recoSource))'),
    '["Naan:manual","Salad:auto","Lassi:fill","Kheer:fill"]');
});

test('limits: max shown, smart fill off, no main in the cart, never-auto items', () => {
  const run = environment();
  run(RECO(", max_shown: 2"));
  run('state.cart=[line(ids.karahi)]');
  assert.equal(run('cartRecommendations().length'), 2);
  run(RECO(", smart_fill: false"));
  assert.equal(run('JSON.stringify(cartRecommendations().map(i=>i.name))'), '["Tikka","Naan"]');
  run(RECO(", never_auto:[ids.lassi]"));
  assert.equal(run('cartRecommendations().some(i=>i.name==="Lassi")'), false);
  run(RECO());
  run('state.cart=[line(ids.lassi)]');
  assert.equal(run('cartRecommendations().length'), 0);
});

test('without the new data the old manual pairings still work (and accept places 4-5)', () => {
  const run = environment();
  run('RECO=null');
  run(`contentLastSuccess=Date.now(); applyContentPayload({version:1,restaurant_id:MENU_CONFIG.restaurantId,banners:[],
    recommendations:[{source_item_id:ids.karahi,recommended_item_id:ids.kheer,priority:5}]})`);
  run('state.cart=[line(ids.karahi)]');
  assert.equal(run('JSON.stringify(cartRecommendations().map(i=>i.name))'), '["Kheer"]');
});

test('item screen: "Goes well with" from the server list, only orderable items', () => {
  const run = environment();
  run(RECO());
  assert.equal(run('itemRecommendationsMarkup(itemById(ids.karahi)).includes("Goes well with")'), true);
  assert.equal(run('itemRecommendations(itemById(ids.karahi)).map(i=>i.name).join()'), 'Tikka,Naan');
  run('ITEMS.find(i=>i.id===ids.tikka).available=false; ITEMS.find(i=>i.id===ids.tikka).isAvailable=false');
  run('state.cartEditKey="x"');
  assert.equal(run('itemRecommendationsMarkup(itemById(ids.karahi))'), '');
});

test('counts are anonymous: only source, place, kind and value are sent', () => {
  const run = environment();
  run(RECO());
  run('state.cart=[line(ids.karahi)]; cartRecommendationsMarkup(); cartRecommendationsMarkup(); recoFlush()');
  const body = run.sent.at(-1).body;
  assert.equal(body.p_events.length, 4);   // each suggestion counted once per visit
  assert.deepEqual(Object.keys(body.p_events[0]).sort(), ['kind','placement','source']);
  assert.equal(JSON.stringify(body).includes(run('state.customer.mobile') || 'NO-PHONE'), false);
  run('addRecommended(ids.naan)');
  run('recoFlush()');
  assert.deepEqual(run.sent.at(-1).body.p_events[0], {source:'auto', placement:'cart', kind:'added', value:2});
});

test('next time, try: suggestions for the order just placed', () => {
  const run = environment();
  run(RECO());
  assert.equal(run('nextTimeRecommendationsMarkup({items:[{id:ids.karahi}]}).includes("Next time, try")'), true);
});

test('no order history yet: complete-the-meal still works, in menu order', () => {
  const run = environment();
  run(RECO(", popular: [], for_item: {}"));
  run('state.cart=[line(ids.karahi)]');
  assert.equal(run('JSON.stringify(cartRecommendations().map(i=>i.name+":"+i.recoSource))'),
    '["Naan:fill","Lassi:fill","Kheer:fill"]');
});

test('adding a suggestion from an item screen keeps that item\'s choices', () => {
  const run = environment();
  run(RECO());
  run('state.itemId=ids.karahi; state.size="half-id"; state.choice="bone"; state.extras=["raita"]; state.spice="spicy"; state.cart=[]');
  run('addRecommended(ids.naan, "item")');
  assert.equal(run('state.cart.length'), 1);
  assert.equal(run('JSON.stringify([state.size, state.choice, state.extras, state.spice])'), '["half-id","bone",["raita"],"spicy"]');
});

test('an item opened from a suggestion counts as added only when it reaches the cart', () => {
  const run = environment();
  run(RECO());
  run(`ITEMS.find(i=>i.id===ids.tikka).options=[{id:'o1',name:'Half',type:'Variant',price:30,enabled:true,required:false}]`);
  run('state.cart=[line(ids.karahi)]; recoQueue.length=0');
  run('addRecommended(ids.tikka)');
  assert.equal(run('recoQueue.filter(e=>e.kind==="added").length'), 0);
  run('recoAddedFromDetail(ids.naan)');   // a different item: not counted
  assert.equal(run('recoQueue.filter(e=>e.kind==="added").length'), 0);
  run('state.cart.push(line(ids.tikka)); recoAddedFromDetail(ids.tikka)');
  assert.equal(run('JSON.stringify(recoQueue.filter(e=>e.kind==="added"))'), '[{"source":"manual","placement":"cart","kind":"added","value":30}]');
});

test('the list is fetched again only when 5+ minutes old', () => {
  const run = environment();
  run(RECO());
  run('requestCustomerContent()');
  assert.equal(run.sent.filter(x => x.url.includes('oracy_customer_recommendations_v1')).length, 0);
  run('recoLastSuccess = Date.now() - 6*60*1000; requestCustomerContent()');
  assert.equal(run.sent.filter(x => x.url.includes('oracy_customer_recommendations_v1')).length, 1);
});
