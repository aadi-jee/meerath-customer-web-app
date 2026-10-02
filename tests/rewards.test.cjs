// Batch R (241): loyalty points in the customer app.
// Run: node --test tests/rewards.test.cjs. No database writes / network.
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
  vm.runInContext(fs.readFileSync(path.join(root,'js/rewards.js'),'utf8'),c);
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


const RULES = `({enabled:true,currency:'SAR',earn_points_per_unit:1,redeem_step_points:100,redeem_step_value:5,
  min_redeem_points:100,max_redeem_share:0.5,expiry_days:60,allow_with_coupon:false,excluded_order_kinds:['catering','meal_distribution']})`;
const cart = (price, qty) => `row.base_price=${price};row.offer.offer_active=false;ready();
  state.cart=[{id, cartKey:'k1', qty:${qty}, price:${price}, basePrice:${price}, image:'', extras:[]}];`;
const signedIn = (balance) => `state.isLoggedIn=true;state.authUserId='u1';
  rewardsState.rules=${RULES};rewardsState.summaryFor='u1';rewardsState.summaryTried='u1';
  rewardsState.summary={enabled:true,member:true,balance:${balance},usable_value:0,rules:rewardsState.rules,history:[]};`;

test('earn preview: 1 point per SAR of food paid, whole points only', () => {
  const run = environment();
  assert.equal(run(`rewardsEarnPreview(${RULES}, 156)`), 156);
  assert.equal(run(`rewardsEarnPreview(${RULES}, 40.99)`), 40);
  assert.equal(run(`rewardsEarnPreview({enabled:false}, 100)`), 0);
});

test('redeem options follow the server rules (steps, minimum, balance, 50 %, coupon)', () => {
  const run = environment();
  assert.equal(run(`JSON.stringify(rewardsRedeemOptions(${RULES}, 351, 300, false))`), '[100,200,300]');
  assert.equal(run(`JSON.stringify(rewardsRedeemOptions(${RULES}, 1000, 45, false))`), '[100,200,300,400]');   // 22.50 cap
  assert.equal(run(`JSON.stringify(rewardsRedeemOptions(${RULES}, 99, 300, false))`), '[]');                   // below minimum
  assert.equal(run(`JSON.stringify(rewardsRedeemOptions(${RULES}, 500, 9, false))`), '[]');                    // cap 4.50 < 5
  assert.equal(run(`JSON.stringify(rewardsRedeemOptions(${RULES}, 500, 300, true))`), '[]');                   // coupon
  assert.equal(run(`JSON.stringify(rewardsRedeemOptions({...${RULES}, allow_with_coupon:true}, 500, 300, true))`), '[100,200,300,400,500]');
  assert.equal(run(`rewardsRedeemValue(${RULES}, 300)`), 15);
});

test('checkout total: points come off the food after the coupon; earn is on what is paid', () => {
  const run = environment();
  run(cart(45, 1) + signedIn(156));
  run('state.redeemPoints=100');
  assert.equal(run('totals().points'), 5);
  assert.equal(run('totals().total'), 40);
  assert.equal(run('totals().foodTotal'), 40);
  assert.equal(run('rewardsCheckoutMarkup().includes("You will earn 40 points")'), true);
  assert.equal(run('cartSummaryMarkup().includes("Points (100)")'), true);
});

test('a choice that is no longer allowed is reduced or dropped (cart smaller, coupon on)', () => {
  const run = environment();
  run(cart(45, 4) + signedIn(1000));
  run('state.redeemPoints=1000');
  assert.equal(run('totals().points'), 50);          // 50 % of 180 = 90 -> 1000 pts (50) is allowed by cap 1800? no: balance 1000 -> 1000 pts = 50
  run('state.cart[0].qty=1');
  assert.equal(run('totals().points'), 20);          // 22.50 cap -> 400 points = 20
  assert.equal(run('state.redeemPoints'), 400);
  run('state.couponOn=true;state.voucher={kind:"amount",value:10,min_food:0}');
  assert.equal(run('totals().points'), 0);
  assert.equal(run('state.redeemPoints'), 0);
});

test('the order sends redeem_points only when points are chosen', () => {
  const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
  assert.match(app, /\.\.\.\(state\.redeemPoints > 0 \? \{redeem_points: state\.redeemPoints\} : \{\}\)/);
  assert.doesNotMatch(app, /state\.points\s*-=/);   // the old fake redeem is gone
});

test('nothing shows while points are off on the server, or for guests without rules', () => {
  const run = environment();
  run(cart(45, 1));
  run(`rewardsState.rules={enabled:false}`);
  assert.equal(run('rewardsOn()'), false);
  assert.equal(run('totals().points'), 0);
  assert.equal(run('rewardsCheckoutMarkup().includes("hidden")'), true);
  assert.equal(run('rewardsAccountCardMarkup()'), '');
  run(`rewardsState.rules=${RULES};state.isLoggedIn=false`);
  assert.equal(run('rewardsCheckoutMarkup().includes("Sign in with your mobile")'), true);
  assert.equal(run('totals().points'), 0);
});

test('another customer on the same phone never sees the previous balance', () => {
  const run = environment();
  run(cart(45, 1) + signedIn(500));
  run(`state.authUserId='u2'`);
  assert.equal(run('rewardsBalance()'), 0);
  run('state.redeemPoints=100');
  assert.equal(run('totals().points'), 0);
});

// Batch R2 (250): each earning has its own expiry date, oldest first.
test('R2: the screen says which points expire next, and lists the dates', () => {
  const source = fs.readFileSync(path.join(root, 'js/rewards.js'), 'utf8');
  const c = vm.createContext({});
  vm.runInContext(`let state={lang:'en'}; const rewardsCopy=(en,ar)=>state.lang==='ar'?ar:en;
    const rewardsNumber=v=>Number(v)||0; const rewardsDate=v=>String(v).slice(0,10);` +
    source.slice(source.indexOf('function rewardsExpiryList'), source.indexOf('function rewardsAccountCardMarkup')), c);
  const run = code => vm.runInContext(code, c);
  run(`var s={balance:300,expiring_soon:false,valid_until:'2026-12-30T00:00:00Z',
    expiring:[{points:100,at:'2026-12-30T00:00:00Z'},{points:200,at:'2027-01-15T00:00:00Z'},{points:0,at:'x'}]}`);
  assert.equal(run('rewardsExpiryList(s).length'), 2);
  assert.equal(run('rewardsNextExpiryLine(s,true)'), '<p class="">100 points expire on 2026-12-30</p>');
  assert.equal(run('s.expiring_soon=true;rewardsNextExpiryLine(s,true)'),
    '<p class="rewards-expiring">Order soon — 100 points expire on 2026-12-30</p>');
  assert.equal(run('s.expiring_soon=false;s.expiring=[{points:300,at:"2026-12-30T00:00:00Z"}];rewardsNextExpiryLine(s,false)'),
    '<small class="">Valid until 2026-12-30</small>');
  assert.equal(run('s.expiring=undefined;rewardsNextExpiryLine(s,false)'), '<small>Valid until 2026-12-30</small>');
  assert.equal(run('rewardsNextExpiryLine({balance:0},true)'), '');
});

test('order history: points earned and used per order', () => {
  const source = fs.readFileSync(path.join(root, 'js/rewards.js'), 'utf8');
  const c = vm.createContext({});
  vm.runInContext('const rewardsNumber=v=>Number(v)||0;' +
    source.slice(source.indexOf('function rewardsOrderPoints'), source.indexOf('function rewardsOrderLine')), c);
  const history = [
    {kind: 'earn', points: 262, order_number: 'MK-0057'},
    {kind: 'redeem', points: -100, order_number: 'MK-0058'},
    {kind: 'earn', points: 60, order_number: 'MK-0058'},
    {kind: 'earn', points: 45, order_number: 'MK-0059'}, {kind: 'reverse_earn', points: -45, order_number: 'MK-0059'},
    {kind: 'adjust', points: 200, order_number: null},
  ];
  c.h = history;
  assert.equal(vm.runInContext('JSON.stringify(rewardsOrderPoints(h,"MK-0057"))', c), '{"earned":262,"used":0}');
  assert.equal(vm.runInContext('JSON.stringify(rewardsOrderPoints(h,"MK-0058"))', c), '{"earned":60,"used":100}');
  assert.equal(vm.runInContext('JSON.stringify(rewardsOrderPoints(h,"MK-0059"))', c), '{"earned":0,"used":0}');
  assert.equal(vm.runInContext('JSON.stringify(rewardsOrderPoints(h,null))', c), '{"earned":0,"used":0}');
});
