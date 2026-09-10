// Offline logic/integration tests. Run alongside tests/offers.test.cjs.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function environment() {
  const context = vm.createContext({console:{warn(){}},URL,Intl,Date,AbortController,setTimeout,clearTimeout,
    localStorage:{getItem:()=>null},window:{},document:{getElementById:()=>null}});
  for (const file of ['data.js','content.js','app.js']) {
    let source=fs.readFileSync(path.join(__dirname,'../js',file),'utf8');
    if(file==='app.js') source=source.slice(0,source.lastIndexOf('\napplyDir();'));
    vm.runInContext(source,context);
  }
  const run = code => vm.runInContext(code,context);
  run(`const I18N={en:{sar:'SAR',add:'Add'},ar:{sar:'ر.س',add:'إضافة'}};
    let message='',renders=0;
    toast=m=>{message=m}; renderKeepScroll=()=>{renders++};updateCartButtons=()=>{};
    function uid(n){return '22222222-2222-2222-2222-'+String(n).padStart(12,'0')}
    const category=uid(99);
    ITEMS=Array.from({length:7},(_,n)=>({id:uid(n+1),name:'Dish '+(n+1),nameAr:'طبق '+(n+1),
      category,price:10,basePrice:10,image:'assets/images/meerath-logo.png',available:true,offer:null}));
    CATEGORIES=[{id:category,name:'Food'}];
    menuConnection.status='ready';menuConnection.lastSuccess=Date.now();menuConnection.payload={schedules:[]};
    const content={version:1,restaurant_id:MENU_CONFIG.restaurantId,recommendations:[],banners:[]};
    function edge(a,b,p=1){return {source_item_id:uid(a),recommended_item_id:uid(b),priority:p}}
    function banner(slot,kind='menu',id=null){return {slot,target_kind:kind,target_id:id,title_en:'Fresh food',title_ar:'طعام طازج',button_en:'Explore',button_ar:'تصفح',subtitle_en:'Today',image_url:''}}
    function apply(){return applyContentPayload(content)}
    state.screen='cart'; state.spice='medium';addToCart(ITEMS[0]);
  `);
  return run;
}
test('content validates tenant/version and drops malformed edges and duplicate slots',()=>{
  const r=environment();
  assert.throws(()=>r(`applyContentPayload({...content,restaurant_id:'other'})`),/Invalid content/);
  assert.throws(()=>r(`applyContentPayload({...content,version:2})`),/Invalid content/);
  assert.equal(r(`content.recommendations=[edge(1,1),edge(1,2,4),edge(1,2),{source_item_id:'bad'}];
    content.banners=[banner(1),banner(1),banner(4),banner(2,'item','bad')];apply();CUSTOMER_CONTENT.recommendations.length`),1);
  assert.equal(r(`CUSTOMER_CONTENT.banners.length`),1);
});
test('pairings are one-way and only originate from current cart',()=>{
  const r=environment();
  assert.equal(r(`content.recommendations=[edge(2,1)];apply();cartRecommendations().length`),0);
  assert.equal(r(`content.recommendations=[edge(1,2)];apply();cartRecommendations()[0].id`),r('uid(2)'));
  assert.equal(r(`state.cart=[];cartRecommendationsMarkup()`),'');
});
test('recommendations de-duplicate, hide items already in cart and cap at three',()=>{
  const r=environment();
  assert.equal(r(`addToCart(ITEMS[1]);content.recommendations=[edge(1,2),edge(1,3),edge(2,3),edge(1,4,2),edge(2,5,2),edge(2,6,3)];apply();cartRecommendations().length`),3);
  assert.equal(r(`new Set(cartRecommendations().map(i=>i.id)).size`),3);
  assert.equal(r(`cartRecommendations().some(i=>i.id===uid(2))`),false);
});
test('missing, unavailable and schedule-blocked recommendations stay hidden',()=>{
  const r=environment();
  assert.equal(r(`content.recommendations=[edge(1,2),edge(1,3),edge(1,99)];ITEMS[1].available=false;
    menuConnection.payload.schedules=Array.from({length:7},(_,day)=>({menu_item_id:uid(3),day_of_week:day,is_available:false}));
    apply();cartRecommendations().length`),0);
});
test('unmet offer minimum prioritizes regular-price pairings without adding discounts to qualifying spend',()=>{
  const r=environment();
  assert.equal(r(`ITEMS[0].offer={minRegularSpend:30};ITEMS[1].offer={discount:10,type:'percentage',minRegularSpend:0};
    content.recommendations=[edge(1,2,1),edge(1,3,2)];apply();cartRecommendations()[0].id`),r('uid(3)'));
  assert.equal(r(`addRecommended(uid(3));offerSpendStatus().remaining`),20);
  assert.equal(r(`cartRecommendations().some(i=>i.id===uid(3))`),false);
});
test('recommendation add uses current discounted price, renders and cannot double-add stale card',()=>{
  const r=environment();
  assert.equal(r(`ITEMS[1].price=8;ITEMS[1].offer={type:'percentage',discount:20,maxQty:1};
    content.recommendations=[edge(1,2)];apply();addRecommended(uid(2));state.cart[1].price`),8);
  assert.equal(r(`addRecommended(uid(2));itemCartQty(uid(2))`),1);
  assert.equal(r(`renders>0`),true);
});
test('stale menu or stale content suppresses all optional content',()=>{
  const r=environment();
  assert.equal(r(`content.recommendations=[edge(1,2)];content.banners=[banner(1)];apply();contentLastSuccess=1;
    cartRecommendations().length+visibleHomeBanners().length`),0);
  assert.equal(r(`apply();menuConnection.status='error';homeBannersMarkup()`),'');
});
test('banner order is controlled by slots and absent content leaves no hardcoded banner',()=>{
  const r=environment();
  assert.equal(r(`apply();homeBannersMarkup()`),'');
  assert.equal(r(`content.banners=[banner(3),banner(1),banner(2)];apply();visibleHomeBanners().map(b=>b.slot).join(',')`),'1,2,3');
  assert.equal(r(`(homeBannersMarkup().match(/onclick="scrollHomeBanner/g)||[]).length`),3);
});
test('item/category/offer banners require eligible current targets',()=>{
  const r=environment();
  assert.equal(r(`content.banners=[banner(1,'item',uid(2)),banner(2,'category',category),banner(3,'offers')];apply();visibleHomeBanners().length`),2);
  assert.equal(r(`ITEMS[1].available=false;visibleHomeBanners().length`),1);
  assert.equal(r(`ITEMS.forEach(i=>i.available=false);visibleHomeBanners().length`),0);
});
test('banner price is live; names and banner copy escape HTML; Arabic uses configured translation',()=>{
  const r=environment();
  assert.equal(r(`content.banners=[{...banner(1,'item',uid(2)),title_en:'<img onerror=bad>',image_url:'javascript:bad'}];
    ITEMS[1].name='<script>bad</script>';content.recommendations=[edge(1,2)];apply();homeBannersMarkup().includes('&lt;img')`),true);
  assert.equal(r(`homeBannersMarkup().includes('src="javascript:')`),false);
  assert.equal(r(`ITEMS[1].price=7.25;homeBannersMarkup().includes('7.25')`),true);
  assert.equal(r(`cartRecommendationsMarkup().includes('&lt;script&gt;')`),true);
  assert.equal(r(`state.lang='ar';homeBannersMarkup().includes('طعام طازج')`),true);
});
test('banner routes are fixed destinations, with unavailable targets rechecked on click',()=>{
  const r=environment();
  assert.equal(r(`let route='';go=(screen,extra)=>{route=screen+':'+(extra?.categoryId||'')};openItem=id=>{route=id};
    content.banners=[banner(1,'item',uid(2)),banner(2,'category',category),banner(3,'offers')];apply();openHomeBanner(1);route`),r('uid(2)'));
  assert.equal(r(`openHomeBanner(2);route`),r(`'listing:'+category`));
  assert.equal(r(`ITEMS[1].available=false;route='';openHomeBanner(1);route`),'');
});
test('optional content network failure clears stale promotions without changing menu readiness',async()=>{
  const r=environment();
  r(`content.banners=[banner(1)];apply();fetch=async()=>{throw new Error('offline')}`);
  await r(`refreshCustomerContent()`);
  assert.equal(r(`menuReady()`),true);
  assert.equal(r(`CUSTOMER_CONTENT.banners.length`),0);
});
test('content-only admin changes trigger customer rerender',async()=>{
  const r=environment();
  r(`content.banners=[banner(1)];fetch=async()=>({ok:true,json:async()=>content});refreshMenuUI=()=>{renders++}`);
  await r(`refreshCustomerContent()`);
  const before=r('renders');
  r(`content.banners[0].title_en='New title'`);
  await r(`refreshCustomerContent()`);
  assert.equal(r('renders'),before+1);
  assert.equal(r(`CUSTOMER_CONTENT.banners[0].title_en`),'New title');
});
