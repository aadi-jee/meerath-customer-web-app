// Run: node --test tests/offers.test.cjs (Node 18+). No database writes/network.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
function environment() {
  const c = vm.createContext({console, URL, Intl, Date, setTimeout:()=>0,
    localStorage:{getItem:()=>null}, window:{}, document:{}});
  vm.runInContext(fs.readFileSync(path.join(root,'js/data.js'),'utf8'),c);
  const app = fs.readFileSync(path.join(root,'js/app.js'),'utf8');
  vm.runInContext(app.slice(0, app.lastIndexOf('\napplyDir();')),c);
  vm.runInContext(`toast = () => {}; render = () => {}; updateCartButtons = () => {};
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
test('percentage: 18 minus 20% is exactly 14.40',()=> {
  assert.equal(environment()('activeItemOffer(row,now).price'),14.4);
});
test('fixed offer subtracts money, not percentage',()=> {
  assert.equal(environment()(`row.offer.offer_type='fixed'; row.offer.offer_discount=5; activeItemOffer(row,now).price`),13);
});
test('start is inclusive at Saudi midnight',()=> {
  const run=environment();
  assert.equal(run(`activeItemOffer(row,new Date('2026-09-07T20:59:59Z'))`),null);
  assert.equal(run(`activeItemOffer(row,new Date('2026-09-07T21:00:00Z')).price`),14.4);
});
test('end includes the whole final Saudi day',()=> {
  const run=environment();
  assert.equal(run(`activeItemOffer(row,new Date('2026-09-08T20:59:59Z')).price`),14.4);
  assert.equal(run(`activeItemOffer(row,new Date('2026-09-08T21:00:00Z'))`),null);
});
test('disabled and removed offers rejected',()=> {
  const run=environment();
  assert.equal(run(`row.offer.offer_active=false; activeItemOffer(row,now)`),null);
  assert.equal(run(`row.offer.offer_active=true; row.offer.has_offer=false; activeItemOffer(row,now)`),null);
});
test('invalid numeric discounts fail closed',()=> {
  const run=environment();
  for(const value of ['0','-1','101','NaN','Infinity','null','"20"']) {
    assert.equal(run(`row.offer.offer_discount=${value}; activeItemOffer(row,now)`),null,value);
  }
});
test('oversized fixed discount and unknown type rejected',()=> {
  const run=environment();
  assert.equal(run(`row.offer.offer_type='fixed'; activeItemOffer(row,now)`),null);
  assert.equal(run(`row.offer.offer_type='bogus'; activeItemOffer(row,now)`),null);
});
test('invalid, missing and reversed dates rejected; legacy ISO accepted',()=> {
  const run=environment();
  assert.equal(run(`row.offer.offer_valid_from='2026-02-30'; activeItemOffer(row,now)`),null);
  assert.equal(run(`row.offer.offer_valid_from=null; activeItemOffer(row,now)`),null);
  assert.equal(run(`row.offer.offer_valid_from='2026-09-09'; activeItemOffer(row,now)`),null);
  assert.equal(run(`row.offer.offer_valid_from='2026-09-08T00:00:00.000'; activeItemOffer(row,now).price`),14.4);
});
test('100% offer allows zero price',()=> {
  assert.equal(environment()(`row.offer.offer_discount=100; activeItemOffer(row,now).price`),0);
});
test('unavailable item, branch and schedule hide offer',()=> {
  const run=environment();
  assert.equal(run(`row.is_available=false; mapMenu(payload,now).offers.length`),0);
  assert.equal(run(`row.is_available=true; payload.branch_items[0].is_available=false; mapMenu(payload,now).offers.length`),0);
  assert.equal(run(`payload.branch_items[0].is_available=true; payload.schedules=[{menu_item_id:id,day_of_week:2,is_available:false}]; mapMenu(payload,now).offers.length`),0);
});
test('empty inactive restaurant payload does not throw',()=> {
  assert.equal(environment()(`payload.branches=[];payload.items=[];payload.categories=[];mapMenu(payload,now).offers.length`),0);
});
test('legacy RPC has no offer; root columns not used',()=> {
  const run=environment();
  assert.equal(run(`delete row.offer; row.offer_active=true; row.offer_discount=20;mapMenu(payload,now).items[0].price`),18);
});
test('cart gets discount and toggle restores base price',()=> {
  const run=environment();
  assert.equal(run(`ready(); addToCart(ITEMS[0],2); totals().total`),28.8);
  assert.equal(run(`row.offer.offer_active=false;ready();reconcileMenuCart();totals().total`),36);
});
test('base price edits recalculate offer and existing cart',()=> {
  const run=environment();
  assert.equal(run(`ready();addToCart(ITEMS[0]);row.base_price=20;ready();reconcileMenuCart();totals().total`),16);
});
test('offer expiry updates existing cart',()=> {
  const run=environment();
  assert.equal(run(`ready();addToCart(ITEMS[0]);ITEMS=mapMenu(payload,new Date('2026-09-09T12:00:00Z')).items;reconcileMenuCart();totals().total`),18);
});
test('coupon cannot stack with live item offer',()=> {
  assert.equal(environment()(`ready();addToCart(ITEMS[0]);state.couponOn=true;totals().discount`),0);
});
test('Offers rendering escapes names and shows both precise prices',()=> {
  const run=environment();
  assert.equal(run(`ready();ITEMS[0].name='<img onerror=x>';offers().includes('&lt;img onerror=x&gt;')`),true);
  assert.equal(run(`offers().includes('SAR 18.00') && offers().includes('SAR 14.40')`),true);
  assert.equal(run(`offers().includes('myOffers')`),false);
});
test('network error is not reported as no offers',()=> {
  const run=environment();
  assert.equal(run(`ready();menuConnection.status='error';offers().includes('No offers available right now.')`),false);
  assert.equal(run(`offers().includes('SAR 14.40')`),false);
});
test('money preserves decimals; Arabic offer text renders',()=> {
  const run=environment();
  assert.equal(run(`money(14.4)`),'SAR 14.40');
  assert.equal(run(`ready();state.lang='ar';offers().includes('خصم 20%')`),true);
});
