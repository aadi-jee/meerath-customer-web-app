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
  for (const file of ['data.js', 'content.js']) {
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
