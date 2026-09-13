const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function env() {
  const context = vm.createContext({console, AbortController, setTimeout, clearTimeout, setInterval:()=>0,
    window:{addEventListener(){}}, requestAnimationFrame:fn=>fn()});
  vm.runInContext(`const state={lang:'en', screen:'listing', categoryId:'bbq', subcategoryId:'chicken', extras:[], itemId:'tikka'};
    const MENU_CONFIG={url:'https://example.test',publicKey:'public'};
    const element={scrollTop:650}; const parent={scrollTop:25};
    const document={querySelector:()=>element}; const $app=()=>({parentElement:parent});
    const render=()=>{element.scrollTop=0}; const renderKeepScroll=()=>{};
    const nav=()=>''; const go=screen=>{state.screen=screen};
    const escapeHtml=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');`,context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/customer-updates.js'),'utf8'),context);
  return code=>vm.runInContext(code,context);
}
test('announcement uses new API, language fallback and escapes HTML',()=>{
  const r=env(); assert.equal(r('announcementMarkup()'),'');
  r(`applyAnnouncements({version:1,announcements:[{id:'one',text_en:'<img src=x onerror=alert(1)>',text_ar:'',action:'none',ends_at:null}]},null)`);
  assert.match(r('announcementMarkup()'),/&lt;img/);
  r(`state.lang='ar'`); assert.match(r('announcementMarkup()'),/&lt;img/);
  r(`appAnnouncements=[]`); assert.equal(r('announcementMarkup()'),'');
});
test('expired and stale announcements disappear and cannot be tapped',()=>{
  const r=env(); r(`applyAnnouncements({version:1,announcements:[{id:'one',text_en:'Past',text_ar:'',action:'menu',ends_at:'2020-01-01T00:00:00Z'}]},null)`);
  assert.equal(r('announcementMarkup()'),'');
  r(`appAnnouncements[0].ends_at=null;announcementsLoadedAt=1`);
  assert.equal(r('announcementMarkup()'),'');
});
test('wrong branch cache and malformed server actions fail closed',()=>{
  const r=env(); r(`applyAnnouncements({version:1,announcements:[{id:'one',text_en:'Hello',text_ar:'',action:'none',ends_at:null}]},'another-branch')`);
  assert.equal(r('announcementMarkup()'),'');
  r(`applyAnnouncements({version:1,announcements:[{id:'one',text_en:'Hello',text_ar:'',action:'javascript:evil',ends_at:null}]},null)`);
  assert.equal(r('announcementMarkup()'),'');
});
test('cart restores category, subcategory and both scroll containers',()=>{
  const r=env(); r(`captureCartOrigin('cart');state.screen='cart';state.categoryId='other';element.scrollTop=0;parent.scrollTop=0;returnFromCart()`);
  assert.equal(r('state.screen'),'listing'); assert.equal(r('state.categoryId'),'bbq');
  assert.equal(r('state.subcategoryId'),'chicken'); assert.equal(r('element.scrollTop'),650);
  assert.equal(r('parent.scrollTop'),25);
});
test('returning from checkout does not overwrite original cart destination',()=>{
  const r=env(); r(`captureCartOrigin('cart');state.screen='checkout';captureCartOrigin('cart');returnFromCart()`);
  assert.equal(r('state.screen'),'listing');
});
test('content API failure clears announcement without blocking menu',async()=>{
  const r=env(); r(`websiteContent={announcement_enabled:true,announcement_en:'Old'};fetch=async()=>{throw new Error('offline')}`);
  await r('loadWebsiteContent()'); assert.equal(r('announcementMarkup()'),'');
});
test('website RPC sends JSON payload to existing catering endpoint',async()=>{
  const r=env(); r(`let received;fetch=async(url,options)=>{received={url,options};return {ok:true,json:async()=> 'ok'}}`);
  await r(`websiteRpc('submit_meerath_catering_enquiry_v2',{payload:{name:'Guest',consent:true}})`);
  assert.match(r('received.url'),/submit_meerath_catering_enquiry_v2$/);
  assert.equal(JSON.parse(r('received.options.body')).payload.consent,true);
});
test('catering payload clears autofilled trap and Meerath location',()=>{
  const r=env();
  r(`state.lang='en';cateringDraft={name:'Aqeel',venue_type:'meerath',area:'Browser autofill',company_website:'filled'}`);
  assert.equal(r(`buildCateringPayload().company_website`),'');
  assert.equal(r(`buildCateringPayload().area`),'');
});
test('optional child counts submit zero when omitted and preserve supplied counts',()=>{
  const r=env();
  r(`cateringDraft={adult_count:'25',kids_5_11_count:''}`);
  assert.equal(r('buildCateringPayload().kids_5_11_count'),'0');
  assert.equal(r('buildCateringPayload().kids_under_5_count'),'0');
  assert.equal(r('buildCateringPayload().adult_count'),'25');
  r(`cateringDraft.kids_5_11_count='4'`);
  assert.equal(r('buildCateringPayload().kids_5_11_count'),'4');
});
test('calendar offers exactly the next 60 Saudi dates',()=>{
  const r=env();
  assert.equal(r(`cateringDays().length`),60);
  assert.equal(r(`(cateringDays()[59]-cateringDays()[0])/86400000`),59);
  assert.doesNotMatch(r(`cateringDateLabel(cateringIso(cateringDays()[0]))`),/\b20\d{2}\b/);
});
test('signed-in catering form seeds account name and mobile',()=>{
  const r=env();
  r(`state.isLoggedIn=true;state.customerName='Aqeel';state.customerPhone='+966 500000000';state.customer={};seedCateringCustomer()`);
  assert.equal(r(`cateringDraft.name`),'Aqeel');
  assert.equal(r(`cateringDraft.mobile`),'+966 500000000');
});
test('Meerath venue disables location and outside catering requires it',()=>{
  const r=env();
  r(`cateringDraft={venue_type:'meerath',area:''}`);
  assert.match(r(`cateringAreaMarkup()`),/disabled/);
  r(`cateringDraft={venue_type:'outside',area:''}`);
  assert.match(r(`cateringAreaMarkup()`),/required/);
});
test('food distribution payload maps meals, pickup and privacy without child counts',()=>{
  const r=env();
  r(`state.lang='en';cateringDraft={event_type:'food_distribution',meal_count:'100',estimated_budget_sar:'2500',recipient_group:'workers',distribution_mode:'pickup',meal_timing:'dinner',area:'remove me',donor_private:true,private_update_requested:true}`);
  assert.equal(r('buildCateringPayload().guest_count'),'100');
  assert.equal(r('buildCateringPayload().venue_type'),'meerath');
  assert.equal(r('buildCateringPayload().area'),'');
  assert.equal(r('buildCateringPayload().donor_private'),true);
  assert.equal(r('buildCateringPayload().private_update_requested'),false);
  assert.equal(r(`'adult_count' in buildCateringPayload()`),false);
  assert.equal(r(`'kids_5_11_count' in buildCateringPayload()`),false);
});
test('food distribution form replaces guest breakdown with meal service fields',()=>{
  const r=env();
  r(`state.lang='en';cateringDraft={event_type:'food_distribution',distribution_mode:'delivery'}`);
  const html=r('cateringServiceFields()');
  assert.match(html,/Approximate number of meals/);
  assert.match(html,/Estimated budget \(SAR\)/);
  assert.match(html,/Who should receive the meals/);
  assert.doesNotMatch(html,/Pakistan|Country of distribution/);
  assert.match(html,/Meerath-managed distribution/);
  assert.match(html,/Distribution location/);
  assert.match(html,/Meal Distribution/);
  assert.doesNotMatch(html,/Children aged/);
});
test('managed distribution keeps private update request and requires a location',()=>{
  const r=env();
  r(`state.lang='en';cateringDraft={event_type:'food_distribution',meal_count:'80',estimated_budget_sar:'1800',recipient_group:'families',distribution_mode:'managed',meal_timing:'lunch',area:'Olaya',private_update_requested:true}`);
  assert.equal(r('buildCateringPayload().private_update_requested'),true);
  assert.match(r('distributionAreaMarkup()'),/required/);
  assert.match(r('distributionAreaMarkup()'),/Area, street, mosque or distribution point/);
});
test('successful catering confirmation replaces the form with personalised request summary',()=>{
  const r=env();
  r(`state.lang='en';cateringConfirmation={name:'Aqeel',mobile:'0500000000',event_type:'corporate',event_date:'',adult_count:'40',meal_count:''}`);
  const html=r('cateringPage()');
  assert.match(html,/Thank you, Aqeel!/);
  assert.match(html,/considering Meerath Kabab for your corporate event/);
  assert.match(html,/Approximately 40 adults/);
  assert.match(html,/Submit another request/);
  assert.doesNotMatch(html,/<form class="catering-form"/);
});
test('meal distribution confirmation mentions meals and chosen date',()=>{
  const r=env();
  r(`state.lang='en';cateringConfirmation={name:'Guest',mobile:'0500000000',event_type:'food_distribution',event_date:'2026-09-20',adult_count:'',meal_count:'120'}`);
  const html=r('cateringConfirmationPage()');
  assert.match(html,/Meal Distribution/);
  assert.match(html,/Approximately 120 meals/);
  assert.match(html,/20 September/);
});
