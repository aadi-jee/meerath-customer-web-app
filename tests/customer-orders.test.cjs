const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

function environment() {
  const storage = new Map();
  const context = vm.createContext({
    console,
    URL,
    Intl,
    Date,
    AbortController,
    crypto: {randomUUID: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'},
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 1,
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key),
    },
    window: {addEventListener: () => {}},
    document: {hidden:false, addEventListener:()=>{}, getElementById:()=>({parentElement:{scrollTop:0}})},
  });
  for (const file of ['brand-config.js', 'data.js', 'auth.js', 'content.js', 'delivery-location.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'js', file), 'utf8'), context);
  }
  const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
  vm.runInContext(app.slice(0, app.lastIndexOf('\napplyDir();')), context);
  vm.runInContext(`
    const I18N={en:{sar:'SAR'},ar:{sar:'ر.س'}};
    toast=()=>{}; render=()=>{}; renderKeepScroll=()=>{}; go=screen=>{state.screen=screen};
    validateMenuCart=async()=>true; checkOfferCartRules=()=>true;
    const itemId='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    ITEMS=[{id:itemId,name:'Malai Boti',nameAr:'',price:35,basePrice:35,available:true,offer:null,options:[]}];
    menuConnection.status='ready';menuConnection.lastSuccess=Date.now();
    menuConnection.payload={branches:[{id:'22222222-2222-2222-2222-222222222222'}],schedules:[]};
    state.customer={name:'Adeel',mobile:'0500000000',email:''};
    state.cart=[{id:itemId,qty:1,price:35,basePrice:35,extras:[],size:'regular',choice:null,notes:''}];
  `, context);
  return code => vm.runInContext(code, context);
}

test('checkout submits a stable backend order and only clears cart after success', async () => {
  const run = environment();
  run(`submitCustomerOrder=async request=>({id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    order_number:'MK001001',tracking_token:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    status:'pending_confirmation',total:35,created_at:'2026-09-11T12:00:00Z'});
    refreshTrackedCustomerOrder=async()=>{};`);
  await run('createOrderAfterVerification()');
  assert.equal(run('state.order.id'), 'MK001001');
  assert.equal(run('state.order.backendId'), 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
  assert.equal(run('state.cart.length'), 0);
  assert.equal(run('state.screen'), 'confirmation');
});

test('real POS status controls tracking and survives local refresh', async () => {
  const run = environment();
  run(`state.order={id:'MK001001',backendId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    trackingToken:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',status:'pending_confirmation',items:[]};
    customerOrderRpc=async()=>({id:state.order.backendId,order_number:'MK001001',status:'preparing',
      total:35,updated_at:'2026-09-11T12:05:00Z'});`);
  await run('refreshTrackedCustomerOrder()');
  assert.equal(run('state.order.status'), 'preparing');
  assert.equal(run('state.order.step'), 2);
  run('saveTrackedCustomerOrder();state.order=null;restoreTrackedCustomerOrder()');
  assert.equal(run('state.order.status'), 'preparing');
});

test('temporary customer-side Next status control is removed', () => {
  const source = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
  assert.equal(source.includes('advanceOrderStatus'), false);
  assert.equal(source.includes('orders-test-status'), false);
});

test('completed POS order leaves active tracking and persists in history', async () => {
  const run = environment();
  run(`state.order={id:'MK001001',backendId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    trackingToken:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',status:'ready',items:[],createdAt:1};
    customerOrderRpc=async()=>({id:state.order.backendId,order_number:'MK001001',status:'completed',
      total:35,updated_at:'2026-09-11T12:30:00Z'});`);
  await run('refreshTrackedCustomerOrder()');
  assert.equal(run('state.order'), null);
  assert.equal(run('state.orderHistory.length'), 1);
  assert.equal(run('state.orderHistory[0].status'), 'completed');
  assert.equal(run('state.orderTab'), 'history');
});

test('guest checkout asks for OTP when this device has no trusted session', async () => {
  const run = environment();
  run(`state.isLoggedIn=false;state.customer={name:'',mobile:'0500000000',email:''};let requested=0;let submitted=0;
    restaurantAcceptingOrders=()=>true;resumeTrustedCustomerForPhone=async()=>false;
    startOtp=async()=>{requested++};createOrderAfterVerification=async()=>{submitted++};`);
  await run('placeOrder()');
  assert.equal(run('requested'), 1);
  assert.equal(run('submitted'), 0);
  assert.equal(run('state.customer.mobile'), '+966500000000');
  assert.equal(run('state.loginMobile'), '+966500000000');
  assert.equal(run('state.otpPurpose'), 'guestOrder');
});

test('trusted device restores returning customer and submits without OTP', async () => {
  const run = environment();
  run(`state.isLoggedIn=false;state.customer={name:'',mobile:'0500000000',email:''};let requested=0;let submitted=0;
    restaurantAcceptingOrders=()=>true;
    resumeTrustedCustomerForPhone=async()=>{state.isLoggedIn=true;state.customerName='Adeel';state.customerPhone='+966500000000';state.customer={name:'Adeel',mobile:'+966500000000',email:'a@example.com'};return true};
    startOtp=async()=>{requested++};createOrderAfterVerification=async()=>{submitted++};`);
  await run('placeOrder()');
  assert.equal(run('requested'), 0);
  assert.equal(run('submitted'), 1);
  assert.equal(run('state.isLoggedIn'), true);
});

test('verified returning customer resumes the pending order automatically', async () => {
  const run = environment();
  run(`state.otpPurpose='guestOrder';state.loginMobile='0500000000';state.otpCode='123456';let submitted=0;
    verifyPhoneOtp=async()=>{};loadCustomerProfile=async()=>({full_name:'Adeel'});
    loadAccountAddresses=async()=>{};createOrderAfterVerification=async()=>{submitted++};`);
  await run('verifyOtp()');
  assert.equal(run('submitted'), 1);
  assert.equal(run('state.otpPurpose'), 'login');
});

test('new verified customer saves profile then resumes the pending order', async () => {
  const run = environment();
  run(`state.isLoggedIn=true;state.otpPurpose='guestOrder';state.customerName='New Customer';state.customerEmail='';let submitted=0;
    saveCustomerProfile=async()=>{};createOrderAfterVerification=async()=>{submitted++};`);
  await run('completeProfile()');
  assert.equal(run('submitted'), 1);
  assert.equal(run('state.otpPurpose'), 'login');
});

test('guest checkout starts mobile-first and hides name and email fields', () => {
  const run = environment();
  run(`state.isLoggedIn=false;state.customer={name:'',mobile:'',email:''}`);
  const html = run('checkoutCustomerMarkup()');
  assert.match(html, /checkout-mobile-field/);
  assert.doesNotMatch(html, /placeholder="Name"/);
  assert.doesNotMatch(html, /type="email"/);
});

function deliveryEnvironment() {
  const run = environment();
  run(`const accountAddresses={busy:false,mutating:false};state.isLoggedIn=true;state.authUserId='user-a';
    state.orderType='delivery';let submissions=[];
    loadAccountAddresses=async()=>true;
    requestCustomerDeliveryQuote=async()=>({eligible:true,zone:'Askaan',fee:0,free_at:30,distance_km:0.5,version:1});
    submitCustomerOrder=async request=>{submissions.push(request);return {id:'order-id',order_number:'MK001',tracking_token:'tracking',status:'pending_confirmation',total:35,created_at:'2026-09-15T12:00:00Z'}};
    refreshTrackedCustomerOrder=async()=>{};
    state.savedAddresses=[{id:'home',area:'Olaya',street:'Main',building:'1',unit:'',directions:''},{id:'work',latitude:24.7,longitude:46.7,updatedAt:'v1',label:'Office, Second, 2, 3',area:'Office',street:'Second',building:'2',unit:'3',directions:'Reception'}];
    state.defaultAddressId='home';state.checkoutAddressId='work';state.checkoutPinConfirmedId='work';state.checkoutPinConfirmedVersion='v1';`);
  return run;
}
test('delivery submits chosen address instead of default and snapshots it',async()=>{
 const run=deliveryEnvironment();await run('createOrderAfterVerification()');
 assert.equal(run('submissions[0].address'),'Office, Second, 2, 3 · Reception');
 assert.equal(run('state.order.address'),'Office, Second, 2, 3 · Reception');
 assert.equal(run('state.screen'),'confirmation');
});
test('missing or deleted delivery selection preserves cart and requires reselection',async()=>{
 const run=deliveryEnvironment();run(`state.checkoutAddressId='deleted'`);
 await run('createOrderAfterVerification()');
 assert.equal(run('submissions.length'),0);assert.equal(run('state.cart.length'),1);
 assert.equal(run('state.screen'),'savedAddressesPage');assert.equal(run('state.addressReturnScreen'),'checkout');
});
test('address network failure blocks delivery without emptying cart',async()=>{
 const run=deliveryEnvironment();run('loadAccountAddresses=async()=>false');
 await run('createOrderAfterVerification()');assert.equal(run('submissions.length'),0);assert.equal(run('state.cart.length'),1);
});
test('logout during delivery address refresh prevents order submission',async()=>{
 const run=deliveryEnvironment();run('loadAccountAddresses=async()=>{state.isLoggedIn=false;return true}');
 await run('createOrderAfterVerification()');assert.equal(run('submissions.length'),0);
});
test('takeaway does not require a delivery address',async()=>{
 const run=deliveryEnvironment();run(`state.orderType='takeaway';state.savedAddresses=[];loadAccountAddresses=async()=>{throw Error('Must not load')}`);
 await run('createOrderAfterVerification()');assert.equal(run('submissions.length'),1);assert.equal(run('submissions[0].address'),'');
});
test('confirmation escapes address text',()=>{
 const run=deliveryEnvironment();assert.match(run(`deliveryConfirmationMarkup({orderType:'delivery',address:'<script>'})`),/&lt;script&gt;/);
});

test('editing a location after confirmation requires a fresh confirmation',async()=>{
 const run=deliveryEnvironment();run(`state.savedAddresses[1].updatedAt='v2'`);
 await run('createOrderAfterVerification()');assert.equal(run('submissions.length'),0);assert.equal(run('state.cart.length'),1);
});
test('delivery includes selected address ID and reviewed version',async()=>{
 const run=deliveryEnvironment();await run('createOrderAfterVerification()');
 assert.equal(run('submissions[0].delivery_address_id'),'work');assert.equal(run('submissions[0].delivery_address_version'),'v1');
 assert.equal(run('state.checkoutPinConfirmedId'),null);
});

test('delivery quote fee enters totals and stale subtotal cannot reuse fee',async()=>{
 const run=deliveryEnvironment();run(`requestCustomerDeliveryQuote=async()=>({eligible:true,fee:10,zone:'Radius',distance_km:1,version:1})`);
 await run('refreshDeliveryQuote()');assert.equal(run('totals().total'),45);
 run('state.cart[0].qty=2');assert.equal(run('currentDeliveryQuote()'),null);assert.equal(run('totals().delivery'),0);
});
test('outside coverage prevents submission and keeps cart',async()=>{
 const run=deliveryEnvironment();run(`requestCustomerDeliveryQuote=async()=>({eligible:false,reason:'Outside delivery area'})`);
 await run('createOrderAfterVerification()');assert.equal(run('submissions.length'),0);assert.equal(run('state.cart.length'),1);
});
test('logout while quote loads discards response',async()=>{
 const run=deliveryEnvironment();run(`let finish;requestCustomerDeliveryQuote=()=>new Promise(resolve=>finish=resolve)`);
 const pending=run('refreshDeliveryQuote()');run(`state.isLoggedIn=false;finish({eligible:true,fee:5})`);await pending;
 assert.equal(run('state.deliveryQuote'),null);
});
test('guest delivery checkout keeps sign-in action available',()=>{
 const run=deliveryEnvironment();run('state.isLoggedIn=false;restaurantAcceptingOrders=()=>true');
 assert.doesNotMatch(run('checkout()'),/onclick="placeOrder\(\)"\s+disabled/);
});
test('submitted delivery carries reviewed fee and displays authoritative result',async()=>{
 const run=deliveryEnvironment();run(`requestCustomerDeliveryQuote=async()=>({eligible:true,fee:5});submitCustomerOrder=async p=>{submissions.push(p);return {id:'order-id',total:40,delivery_fee:5,status:'pending_confirmation',created_at:'2026-09-16T00:00:00Z'}}`);
 await run('createOrderAfterVerification()');assert.equal(run('submissions[0].expected_delivery_fee'),5);
 assert.equal(run('state.order.total'),40);assert.equal(run('state.order.deliveryFee'),5);
});
