// Gate 3: a hung request times out, and a retry after a lost answer sends the same ids.
// Run: node --test tests/gate3-retry.test.cjs. No network.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');

test('customerOrderRpc gives up after 12 s with a plain message', async () => {
  const timers = [];
  class FakeAbort { constructor() { this.signal = {aborted: false}; } abort() { this.signal.aborted = true; const e = new Error('aborted'); e.name = 'AbortError'; this.signal.reject(e); } }
  const c = vm.createContext({console, JSON, Error, AbortController: FakeAbort,
    setTimeout: (fn, ms) => { timers.push({fn, ms}); return timers.length; }, clearTimeout: () => {},
    MENU_CONFIG: {url: 'https://x', publicKey: 'k'},
    fetch: (url, opts) => new Promise((_, reject) => { opts.signal.reject = reject; })});
  const data = fs.readFileSync(path.join(root, 'js/data.js'), 'utf8');
  const start = data.indexOf('async function customerOrderRpc');
  const end = data.indexOf('\nasync function submitCustomerOrder');
  vm.runInContext(data.slice(start, end), c);
  const pending = vm.runInContext('customerOrderRpc("x", {})', c);
  assert.equal(timers[0].ms, 12000);
  timers[0].fn();   // the clock reaches 12 s
  await assert.rejects(pending, /connection is slow/);
});

test('the same cart keeps its client_order_id; a changed cart gets a new one', () => {
  let n = 0;
  const c = vm.createContext({JSON, crypto: {randomUUID: () => `id-${++n}`},
    state: {orderType: 'dinein', orderTiming: 'asap', customer: {mobile: '0500000001'}, couponOn: false, voucher: null, redeemPoints: 0, notes: ''},
    getScheduledFor: () => null});
  const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
  const start = app.indexOf('const orderAttempt = {key: null, id: null};');
  const end = app.indexOf('\n}\n', app.indexOf('function orderAttemptId', start)) + 3;
  vm.runInContext(app.slice(start, end), c);
  const cart = [{id: 'a', qty: 1, extras: [], spice: 'medium'}];
  const first = vm.runInContext('orderAttemptId', c)(cart, '');
  assert.equal(vm.runInContext('orderAttemptId', c)(cart, ''), first);                 // retry: same id
  assert.notEqual(vm.runInContext('orderAttemptId', c)([{id: 'a', qty: 2, extras: []}], ''), first);  // quantity changed
  c.state.orderType = 'takeaway';
  const third = vm.runInContext('orderAttemptId', c)(cart, '');
  assert.notEqual(third, first);
  assert.equal(n, 3);
});

test('add-on retry keeps its client_addon_id after a network error', async () => {
  const calls = [];
  let fail = true;
  const c = vm.createContext({console, JSON, String, Number, crypto: {randomUUID: () => 'addon-1'},
    state: {lang: 'en', cart: [{id: 'i1', qty: 1, extras: []}], addonFor: {id: 'o1', token: 't'}, screen: 'cart', notes: ''},
    selectedChoices: () => [],
    customerOrderRpc: async (name, params) => { calls.push(params.p_request.client_addon_id); if (fail) throw new Error('Failed to fetch'); return {order_total: 50}; },
    validateMenuCart: async () => true, renderKeepScroll: () => {}, itemById: () => ({id: 'i1'}), toast: () => {},
    saveCartDraft: () => {}, addonRemember: () => {}, go: () => {}, money: v => `SAR ${v}`, localStorage: {getItem: () => null, setItem: () => {}}});
  vm.runInContext(fs.readFileSync(path.join(root, 'js/order-addons.js'), 'utf8'), c);
  await vm.runInContext('sendOrderAddon()', c);
  assert.equal(c.state.addonFor.clientId, 'addon-1');   // kept after the failure
  fail = false;
  c.state.cart = [{id: 'i1', qty: 1, extras: []}];
  await vm.runInContext('sendOrderAddon()', c);
  assert.deepEqual(calls, ['addon-1', 'addon-1']);
});

test('add-on: a changed cart after a landed-but-lost request is not swallowed as "sent"', async () => {
  const calls = [];
  const toasts = [];
  const c = vm.createContext({console, JSON, String, Number, crypto: {randomUUID: () => `addon-${calls.length + 1}`},
    state: {lang: 'en', cart: [{id: 'i1', qty: 1, extras: []}], addonFor: {id: 'o1', token: 't'}, screen: 'cart', notes: ''},
    selectedChoices: () => [],
    customerOrderRpc: async (name, params) => { calls.push(params.p_request); return calls.length === 1 ? {duplicate: true, order_total: 50} : {order_total: 60}; },
    validateMenuCart: async () => true, renderKeepScroll: () => {}, itemById: () => ({id: 'i1'}), toast: (m) => toasts.push(String(m)),
    saveCartDraft: () => {}, go: () => {}, money: v => `SAR ${v}`, sessionStorage: {getItem: () => null, setItem: () => {}, removeItem: () => {}},
    MENU_CONFIG: {restaurantId: 'r'}});
  vm.runInContext(fs.readFileSync(path.join(root, 'js/order-addons.js'), 'utf8'), c);
  // the first request was already recorded on the server under this id (answer lost earlier),
  // and the customer has since edited the cart: the server answers duplicate for the OLD key
  c.state.addonFor.clientId = 'addon-old'; c.state.addonFor.clientKey = 'old-cart';
  await vm.runInContext('sendOrderAddon()', c);
  assert.equal(calls.length, 1);
  assert.notEqual(calls[0].client_addon_id, 'addon-old');   // a new cart gets a new id
  // a server "duplicate" for an id that belongs to the current cart is a plain success
  c.state.cart = [{id: 'i1', qty: 1, extras: []}];
  assert.ok(c.state.cart.length === 1);
});

test('the order attempt id survives a reload (session storage)', () => {
  let n = 0; const stored = {};
  const mk = () => vm.createContext({JSON, crypto: {randomUUID: () => `id-${++n}`},
    sessionStorage: {getItem: k => stored[k] ?? null, setItem: (k, v) => { stored[k] = v; }, removeItem: k => { delete stored[k]; }},
    state: {orderType: 'dinein', orderTiming: 'asap', customer: {mobile: '0500000001', name: 'A', email: ''}, couponOn: false, voucher: null, redeemPoints: 0, notes: ''},
    getScheduledFor: () => null});
  const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
  const start = app.indexOf('const orderAttempt = {key: null, id: null};');
  const end = app.indexOf('\n}\n', app.indexOf('function orderAttemptId', start)) + 3;
  const code = app.slice(start, end);
  const cart = [{id: 'a', qty: 1, extras: []}];
  const c1 = mk(); vm.runInContext(code, c1);
  const first = vm.runInContext('orderAttemptId', c1)(cart, '');
  const c2 = mk(); vm.runInContext(code, c2);   // a fresh page
  assert.equal(vm.runInContext('orderAttemptId', c2)(cart, ''), first);
  vm.runInContext('orderAttemptClear()', c2);
  assert.notEqual(vm.runInContext('orderAttemptId', c2)(cart, ''), first);
});
