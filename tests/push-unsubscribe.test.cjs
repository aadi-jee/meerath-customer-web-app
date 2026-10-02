// Gate 2 (271): unsubscribing sends the subscription's own secret (keys.auth).
// Run: node --test tests/push-unsubscribe.test.cjs. No network.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
function environment(subscription) {
  const calls = [];
  const navigator = {serviceWorker: {addEventListener: () => {}, getRegistration: async () => ({pushManager: {getSubscription: async () => subscription}})}};
  const c = vm.createContext({console, navigator, window: {PushManager: {}, Notification: {}, addEventListener: () => {}},
    PushManager: {}, Notification: {}, setTimeout: () => 0, localStorage: {getItem: () => null, setItem: () => {}},
    state: {lang: 'en'}, MENU_CONFIG: {url: 'https://x', publicKey: 'k'},
    customerOrderRpc: async (name, params) => { calls.push({name, params}); return {ok: true}; },
    pushRefreshCards: () => {}});
  vm.runInContext(fs.readFileSync(path.join(root, 'js/push.js'), 'utf8'), c);
  return {c, calls};
}
test('sign-out sends the endpoint and the auth secret', async () => {
  let unsubscribed = 0;
  const sub = {endpoint: 'https://fcm.googleapis.com/fcm/send/abc', toJSON: () => ({keys: {auth: 'abcdefghijklmnop', p256dh: 'x'}}), unsubscribe: async () => { unsubscribed++; return true; }};
  const {c, calls} = environment(sub);
  await vm.runInContext('pushDetach()', c);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'oracy_customer_push_unsubscribe_v1');
  assert.equal(calls[0].params.p_endpoint, sub.endpoint);
  assert.equal(calls[0].params.p_auth, 'abcdefghijklmnop');
  assert.equal(unsubscribed, 1);
});
test('a subscription without keys still asks (the server removes nothing) and the device forgets it', async () => {
  let unsubscribed = 0;
  const sub = {endpoint: 'https://fcm.googleapis.com/fcm/send/abc', unsubscribe: async () => { unsubscribed++; return true; }};
  const {c, calls} = environment(sub);
  await vm.runInContext('pushDetach()', c);
  assert.equal(calls[0].params.p_auth, null);
  assert.equal(unsubscribed, 1);
});
