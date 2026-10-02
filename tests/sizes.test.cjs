// Batch V (238): full-price sizes, size hours and permanent ids.
// Run: node --test tests/sizes.test.cjs. No database writes / network.
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
function environment() {
  const c = vm.createContext({console, URL, Intl, Date: TestDate, setTimeout:()=>0,
    localStorage:{getItem:()=>null}, window:{}, document:{getElementById:()=>({parentElement:{scrollTop:0}})}});
  vm.runInContext(fs.readFileSync(path.join(root,'js/brand-config.js'),'utf8'),c);
  vm.runInContext(fs.readFileSync(path.join(root,'js/data.js'),'utf8'),c);
  vm.runInContext(fs.readFileSync(path.join(root,'js/ordering-hours.js'),'utf8'),c);
  vm.runInContext(fs.readFileSync(path.join(root,'js/auth.js'),'utf8'),c);
  vm.runInContext(fs.readFileSync(path.join(root,'js/content.js'),'utf8'),c);
  const app = fs.readFileSync(path.join(root,'js/app.js'),'utf8');
  vm.runInContext(app.slice(0, app.lastIndexOf('\napplyDir();')),c);
  vm.runInContext(`toast = () => {}; render = () => {}; renderKeepScroll = () => {}; updateCartButtons = () => {};
    const I18N = {en:{sar:'SAR'},ar:{sar:'ر.س'}};
    const id = '22222222-2222-2222-2222-222222222222';
    const cat = '33333333-3333-3333-3333-333333333333';
    const branch = '44444444-4444-4444-4444-444444444444';
    const row = {id, category_id:cat, base_price:18, is_available:true, name_en:'Test dish',
      offer:{has_offer:true,offer_active:true,offer_type:'percentage',offer_discount:20,
        offer_valid_from:'2026-09-08',offer_valid_to:'2026-09-08'}};
    const payload = {version:1,offers_version:1,restaurant_id:MENU_CONFIG.restaurantId,
      categories:[{id:cat}],subcategories:[],items:[row],schedules:[],
      branches:[{id:branch}],branch_items:[{branch_id:branch,menu_item_id:id,is_available:true}]};
    const now = new Date('2026-09-08T12:00:00Z');
    function ready() {
      menuConnection.status='ready'; menuConnection.lastSuccess=Date.now();
      menuConnection.payload=payload;
      const m=mapMenu(payload,now); ITEMS=m.items; OFFERS=m.offers;
    }
  `,c);
  return code => vm.runInContext(code,c);
}

// Test clock: 2026-09-08 12:00 UTC = Tuesday 15:00 in Riyadh.
const sizes = (quarterHours) => `row.base_price=45;row.offer.offer_active=false;row.options=[
  {id:'aaaaaaaa-0000-4000-8000-000000000001',name:'Quarter',name_ar:'ربع',type:'Variant',price:30,enabled:true,required:false,price_mode:'final',is_default:false,
   windows:[{days:[1,2,3,4,5,6,7],start:'${quarterHours[0]}',end:'${quarterHours[1]}'}]},
  {id:'aaaaaaaa-0000-4000-8000-000000000002',name:'Half',type:'Variant',price:45,enabled:true,required:false,price_mode:'final',is_default:true},
  {id:'aaaaaaaa-0000-4000-8000-000000000003',name:'1 KG',type:'Variant',price:75,enabled:true,required:false,price_mode:'final',is_default:false},
  {id:'aaaaaaaa-0000-4000-8000-000000000004',name:'Raita',type:'Add-on',price:3,enabled:true,required:false}
];ready();`;

test('menu shows the default size; the chosen size replaces the price; extras add', () => {
  const run = environment();
  run(sizes(['12:00', '16:00']));
  assert.equal(run('ITEMS[0].price'), 45);
  run('openItem(id)');
  assert.equal(run('state.size === ITEMS[0].options.find(x=>x.name==="Half").id'), true);
  assert.equal(run('addToCart(ITEMS[0]) && state.cart[0].price'), 45);
  run('openItem(id);selectVariant(ITEMS[0].options.find(x=>x.name==="1 KG").id);toggleExtra(ITEMS[0].options.find(x=>x.name==="Raita").id)');
  assert.equal(run('detailPriceMarkup(ITEMS[0]).includes("78.00")'), true);
  assert.equal(run('addToCart(ITEMS[0]) && state.cart[1].price'), 78);
  assert.equal(run('totals().total'), 123);
});

test('lunch-only size: open at 15:00, refused outside its hours', () => {
  const run = environment();
  run(sizes(['12:00', '16:00']));
  run('openItem(id);selectVariant(ITEMS[0].options[0].id)');
  assert.equal(run('state.size === ITEMS[0].options[0].id'), true);
  assert.equal(run('normalizeItemChoices(ITEMS[0], state).extraPrice'), -15);
  const closed = environment();
  closed(sizes(['16:00', '17:00']));
  closed('openItem(id);selectVariant(ITEMS[0].options[0].id)');
  assert.equal(closed('state.size === ITEMS[0].options.find(x=>x.name==="Half").id'), true);
  assert.equal(closed('itemChoiceMarkup(ITEMS[0]).includes("Not available now")'), true);
  assert.equal(closed('canOrderItem(ITEMS[0])'), true);
});

test('no size on sale now: the item cannot be ordered', () => {
  const run = environment();
  run(`row.base_price=30;row.offer.offer_active=false;row.options=[
    {id:'aaaaaaaa-0000-4000-8000-000000000001',name:'Quarter',type:'Variant',price:30,enabled:true,required:false,price_mode:'final',is_default:true,
     windows:[{days:[1],start:'03:00',end:'04:00'}]}];ready();`);
  assert.equal(run('canOrderItem(ITEMS[0])'), false);
});

test('item offer applies to the chosen full-price size', () => {
  const run = environment();
  run(sizes(['12:00', '16:00']) + 'row.offer.offer_active=true;ready();');
  assert.equal(run('ITEMS[0].price'), 36);   // Half 45 - 20 %
  run('openItem(id);selectVariant(ITEMS[0].options.find(x=>x.name==="1 KG").id);addToCart(ITEMS[0])');
  assert.equal(run('state.cart[0].price'), 60);  // 75 - 20 %
  assert.equal(run('state.cart[0].basePrice'), 75);
  assert.equal(run('totals().offerSavings'), 15);
});

test('the order sends the permanent id; Arabic names are shown in Arabic', () => {
  const run = environment();
  run(sizes(['12:00', '16:00']) + 'openItem(id);');
  assert.equal(run('selectedChoices(ITEMS[0], state)[0].rowId'), 'aaaaaaaa-0000-4000-8000-000000000002');
  assert.equal(run('state.lang="ar";itemChoiceMarkup(ITEMS[0]).includes("ربع")'), true);
  const source = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
  assert.equal(source.includes('...(choice.rowId ? {id: choice.rowId} : {})'), true);
});

test('old items (no full-price marker) still add the size to the item price', () => {
  const run = environment();
  run(`row.base_price=45;row.offer.offer_active=false;row.options=[
    {name:'Half',type:'Variant',price:0,enabled:true,required:false},
    {name:'1 KG',type:'Variant',price:30,enabled:true,required:false}];ready();
    openItem(id);selectVariant(ITEMS[0].options[1].id);addToCart(ITEMS[0]);`);
  assert.equal(run('state.cart[0].price'), 75);
});

// Batch V2 (247): default choice, group title, badge and note.
const gravy = `row.base_price=45;row.offer.offer_active=false;row.options=[
  {name:'Extra gravy',type:'Option',price:0,enabled:true,required:true,group:'Gravy',group_ar:'المرق',note:'More gravy'},
  {name:'Authentic',name_ar:'أصلي',type:'Option',price:0,enabled:true,required:true,is_default:true,
   badge:'Recommended',badge_ar:'موصى به',note:'Less gravy, the real karahi',note_ar:'مرق أقل',group:'Gravy',group_ar:'المرق'}];ready();`;

test('V2: the default choice starts selected, not the first one', () => {
  const run = environment();
  run(gravy + 'openItem(id);');
  assert.equal(run('ITEMS[0].options.find(x=>x.id===state.choice).name'), 'Authentic');
  run('selectChoice(ITEMS[0].options[0].id);addToCart(ITEMS[0]);');
  assert.equal(run('ITEMS[0].options.find(x=>x.id===state.cart[0].choice).name'), 'Extra gravy');
});

test('V2: title from Admin, Required once, badge and note shown (Arabic too)', () => {
  const run = environment();
  run(gravy + 'openItem(id);');
  const html = run('itemChoiceMarkup(ITEMS[0])');
  assert.equal(html.includes('<h4>Gravy <small class="choice-required">Required</small></h4>'), true);
  assert.equal(html.split('Required').length - 1, 1);
  assert.equal(html.includes('<em class="choice-badge">Recommended</em>'), true);
  assert.equal(html.includes('Less gravy, the real karahi'), true);
  assert.equal(html.includes('No option'), false);
  const ar = run('state.lang="ar";itemChoiceMarkup(ITEMS[0])');
  assert.equal(ar.includes('المرق') && ar.includes('موصى به') && ar.includes('مرق أقل'), true);
});

test('V2: an optional default is pre-selected but can be cleared; no default keeps the old behaviour', () => {
  const run = environment();
  run(`row.base_price=45;row.offer.offer_active=false;row.options=[
    {name:'A',type:'Option',price:0,enabled:true,required:false},
    {name:'B',type:'Option',price:2,enabled:true,required:false,is_default:true,badge:'<b>x</b>'}];ready();openItem(id);`);
  assert.equal(run('ITEMS[0].options.find(x=>x.id===state.choice).name'), 'B');
  // with a default choice there is no "No option" row
  assert.equal(run('itemChoiceMarkup(ITEMS[0]).includes("No option")'), false);
  assert.equal(run('itemChoiceMarkup(ITEMS[0]).includes("<b>x</b>")'), false);
  run('clearChoice()');
  assert.equal(run('state.choice'), null);
  run('row.options[1].is_default=false;ready();openItem(id);');
  assert.equal(run('state.choice'), null);
  assert.equal(run('itemChoiceMarkup(ITEMS[0]).includes("Choose an option")'), true);
  assert.equal(run('itemChoiceMarkup(ITEMS[0]).includes("No option")'), true);
});
