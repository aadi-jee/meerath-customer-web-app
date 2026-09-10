// Run: node --test tests/offers.test.cjs (Node 18+). No database writes/network.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
function environment() {
  const c = vm.createContext({console, URL, Intl, Date, setTimeout:()=>0,
    localStorage:{getItem:()=>null}, window:{}, document:{getElementById:()=>({parentElement:{scrollTop:0}})}});
  vm.runInContext(fs.readFileSync(path.join(root,'js/data.js'),'utf8'),c);
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
function spendEnvironment() {
  const run = environment();
  run(`row.offer.offer_min_regular_spend=30;ready();addToCart(ITEMS[0]);
    function regular(price, qty=1) {
      const item={id:'regular-'+ITEMS.length, name:'Regular', price, basePrice:price, available:true, offer:null};
      ITEMS.push(item); addToCart(item,qty); return item;
    }`);
  return run;
}
test('cart cap has clickable plus, no permanent cap sentence, and popup on excess',()=> {
  const run=environment();
  run(`row.offer.offer_max_qty=1;ready();addToCart(ITEMS[0]);let message='';toast=m=>{message=m;};`);
  assert.equal(run(`cart().includes('Limit 1 per order')`),false);
  assert.equal(run(`/aria-label="Increase quantity"[^>]*disabled/.test(cart())`),false);
  assert.equal(run(`chgQty(0,1);message`),'Maximum limit is 1 for this offer.');
  assert.equal(run(`itemCartQty(id)`),1);
  assert.equal(run(`state.lang='ar';chgQty(0,1);message.includes('1') && message.includes('الحد')`),true);
});
test('offer only fails; water does not meet SAR 30 net minimum',()=> {
  const run=spendEnvironment();
  assert.equal(run(`checkOfferSpend()`),false);
  assert.equal(run(`offerSpendStatus().remaining`),30);
  assert.equal(run(`regular(2);offerSpendStatus().remaining`),28);
  assert.equal(run(`checkOfferSpend()`),false);
});
test('regular displayed-price spend includes VAT, excludes delivery, and exact boundary passes',()=> {
  const run=spendEnvironment();
  assert.equal(run(`regular(29.99);state.orderType='delivery';offerSpendStatus().remaining`),0.01);
  assert.equal(run(`ITEMS.at(-1).price=30;offerSpendStatus().qualifying`),30);
  assert.equal(run(`checkOfferSpend()`),true);
});
test('multiple offers are allowed and their per-unit requirements add together',()=> {
  const run=spendEnvironment();
  assert.equal(run(`const extra={...ITEMS[0],id:'second-offer',offer:{...ITEMS[0].offer,minRegularSpend:20}};
    ITEMS.push(extra);addToCart(extra)`),true);
  assert.equal(run(`offerSpendStatus().required`),50);
  assert.equal(run(`regular(49.99);offerSpendStatus().remaining`),0.01);
  assert.equal(run(`ITEMS.at(-1).price=50;checkOfferSpend()`),true);
  assert.equal(run(`addToCart(ITEMS[0]);offerSpendStatus().required`),80);
});
test('qualifying item removal or unavailability blocks again; removing offer removes requirement',()=> {
  const run=spendEnvironment();
  assert.equal(run(`regular(30);checkOfferSpend()`),true);
  assert.equal(run(`ITEMS.at(-1).available=false;checkOfferSpend()`),false);
  assert.equal(run(`ITEMS.at(-1).available=true;removeCartItem(1);checkOfferSpend()`),false);
  assert.equal(run(`removeCartItem(0);offerSpendStatus().required`),0);
});
test('blank/null/zero minimum unrestricted; malformed configuration unorderable',()=> {
  const run=environment();
  for (const value of ['null','0','undefined']) {
    assert.equal(run(`row.offer.offer_min_regular_spend=${value};ready();canOrderItem(ITEMS[0])`),true);
  }
  for (const value of ['-1','"30"','NaN','Infinity','1.111','100000','false']) {
    assert.equal(run(`row.offer.offer_min_regular_spend=${value};ready();canOrderItem(ITEMS[0])`),false);
  }
});
test('live changes recompute threshold; offer expiry removes its requirement',()=> {
  const run=spendEnvironment();
  assert.equal(run(`regular(30);checkOfferSpend()`),true);
  assert.equal(run(`ITEMS[0].offer.minRegularSpend=40;checkOfferSpend()`),false);
  assert.equal(run(`ITEMS[0].offer=null;offerSpendStatus().required`),0);
});
test('minimum wording visible before add and in cart/checkout summary in both languages',()=> {
  const run=spendEnvironment();
  assert.equal(run(`offerLimitMarkup(ITEMS[0]).includes('SAR 30.00')`),true);
  assert.equal(run(`cartSummaryMarkup().includes('regular-priced items')`),true);
  assert.equal(run(`state.lang='ar';cartSummaryMarkup().includes('بالسعر العادي')`),true);
  assert.equal(run(`state.lang='en';regular(30);cartSummaryMarkup().includes('Minimum regular-items spend met')`),false);
});
test('all three checkout/order entry points block unmet spend',async()=> {
  const run=spendEnvironment();
  run(`validateMenuCart=async()=>true;state.screen='cart';state.customer={name:'Test',mobile:'0500000000'};`);
  run(`go('checkout')`); await Promise.resolve();
  assert.equal(run(`state.screen`),'cart');
  await run(`placeOrder()`);
  assert.equal(run(`state.screen`),'cart');
  await run(`createOrderAfterVerification()`);
  assert.equal(run(`!!state.order`),false);
  run(`regular(30);go('checkout')`); await Promise.resolve();
  assert.equal(run(`state.screen`),'checkout');
});
test('failed menu refresh never advances checkout even when spend qualifies',async()=> {
  const run=spendEnvironment();
  run(`regular(30);validateMenuCart=async()=>false;state.screen='cart';go('checkout')`);
  await Promise.resolve();
  assert.equal(run(`state.screen`),'cart');
});
test('active offer badge appears in regular menu, home special and detail',()=> {
  const run=environment();
  assert.equal(run(`ready();state.categoryId=cat;listing().includes('20% off')`),true);
  assert.equal(run(`ITEMS[0].special=true;home().includes('20% off')`),true);
  assert.equal(run(`state.itemId=id;detail().includes('20% off')`),true);
  assert.equal(run(`ITEMS[0].offer=null;listing().includes('20% off')`),false);
});
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
test('cap counts same item across spice variants and blocks excess',()=> {
  const run=environment();
  assert.equal(run(`row.offer.offer_max_qty=2;ready();state.spice='mild';addToCart(ITEMS[0])`),true);
  assert.equal(run(`state.spice='spicy';addToCart(ITEMS[0])`),true);
  assert.equal(run(`state.spice='medium';addToCart(ITEMS[0])`),false);
  assert.equal(run(`itemCartQty(id)`),2);
});
test('bulk add and plus both obey cap; minus permits another addition',()=> {
  const run=environment();
  assert.equal(run(`row.offer.offer_max_qty=2;ready();addToCart(ITEMS[0],3)`),false);
  assert.equal(run(`addToCart(ITEMS[0],2);chgQty(0,1);itemCartQty(id)`),2);
  assert.equal(run(`chgQty(0,-1);addToCart(ITEMS[0]);itemCartQty(id)`),2);
});
test('absent/null cap unlimited; invalid cap fails closed',()=> {
  const run=environment();
  assert.equal(run(`ready();addToCart(ITEMS[0],20)`),true);
  assert.equal(run(`state.cart=[];row.offer.offer_max_qty=null;ready();addToCart(ITEMS[0],20)`),true);
  for (const cap of ['0','-1','1.5','1000','"2"','false']) {
    assert.equal(run(`row.offer.offer_max_qty=${cap};ready();canOrderItem(ITEMS[0])`),false);
  }
});
test('admin lowering cap trims across all variants and notifies a change',()=> {
  const run=environment();
  assert.equal(run(`ready();state.spice='mild';addToCart(ITEMS[0],2);state.spice='spicy';addToCart(ITEMS[0],2);
    row.offer.offer_max_qty=3;ready();reconcileMenuCart()`),true);
  assert.equal(run(`itemCartQty(id)`),3);
  assert.equal(run(`state.cart[0].qty === 2 && state.cart[1].qty === 1`),true);
});
test('inactive offer no longer caps regular price items',()=> {
  assert.equal(environment()(`row.offer.offer_max_qty=1;row.offer.offer_active=false;ready();addToCart(ITEMS[0],3)`),true);
});
test('cart click opens editor preserving quantity and choices; update does not add',()=> {
  const run=environment();
  assert.equal(run(`ready();state.spice='mild';addToCart(ITEMS[0],2);openCartItem(0);state.screen`),'detail');
  assert.equal(run(`state.spice`),'mild');
  assert.equal(run(`detail().includes('Update cart')`),true);
  assert.equal(run(`state.spice='spicy';addFromDetail();state.cart.length`),1);
  assert.equal(run(`state.cart[0].qty === 2 && state.cart[0].spice === 'spicy' && state.screen === 'cart'`),true);
});
test('cart edit merges identical spice choices without exceeding cap',()=> {
  const run=environment();
  assert.equal(run(`row.offer.offer_max_qty=2;ready();state.spice='mild';addToCart(ITEMS[0]);state.spice='spicy';addToCart(ITEMS[0]);
    openCartItem(0);state.spice='spicy';addFromDetail();state.cart.length`),1);
  assert.equal(run(`itemCartQty(id)`),2);
});
test('editor back abandons changes; removed editing line never edits its neighbour',()=> {
  const run=environment();
  assert.equal(run(`ready();state.spice='mild';addToCart(ITEMS[0]);openCartItem(0);state.spice='spicy';go('cart');state.cart[0].spice`),'mild');
  assert.equal(run(`openCartItem(0);state.cart=[];state.spice='medium';addToCart(ITEMS[0]);addFromDetail();state.cart[0].spice`),'medium');
});
test('control click does not navigate; card background click does',()=> {
  const run=environment();
  assert.equal(run(`ready();addToCart(ITEMS[0]);state.screen='cart';cartRowClick({target:{closest:()=>true}},0);state.screen`),'cart');
  assert.equal(run(`cartRowClick({target:{closest:()=>null}},0);state.screen`),'detail');
});
test('removing first line refreshes indices; last removal gives empty cart',()=> {
  const run=environment();
  assert.equal(run(`ready();state.spice='mild';addToCart(ITEMS[0]);state.spice='spicy';addToCart(ITEMS[0]);chgQty(0,-1);
    cart().includes('chgQty(0,1,this)')`),true);
  assert.equal(run(`chgQty(0,1);state.cart[0].qty`),2);
  assert.equal(run(`removeCartItem(0);cart().includes('empty')`),true);
});
test('mixed cart savings summary: 8 + 16 - 1.60 = 22.40, VAT included 2.92',()=> {
  const run=environment();
  assert.equal(run(`row.base_price=8;ready();addToCart(ITEMS[0]);state.cart.push({id:'other',price:16,basePrice:16,qty:1});totals().regularItemsTotal`),24);
  assert.equal(run(`totals().offerSavings`),1.6);
  assert.equal(run(`totals().total`),22.4);
  assert.equal(run(`totals().vat`),2.92);
  assert.equal(run(`cartSummaryMarkup().includes('Offer savings') && cartSummaryMarkup().includes('Includes VAT')`),true);
});
test('savings scale with quantity and regular price returns after toggle',()=> {
  const run=environment();
  assert.equal(run(`row.base_price=8;ready();addToCart(ITEMS[0],2);totals().offerSavings`),3.2);
  assert.equal(run(`row.offer.offer_active=false;ready();reconcileMenuCart();totals().offerSavings`),0);
  assert.equal(run(`totals().total`),16);
});
