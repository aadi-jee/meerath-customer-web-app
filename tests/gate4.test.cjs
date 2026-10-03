// Gate 4: server texts reach the customer only when written for them, the
// device forgets old orders and e-mails, and phone sign-in carries a Turnstile
// token once a site key is configured. Run: node --test tests/gate4.test.cjs. No network.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');

function dataSlice(from, to) {
  const data = fs.readFileSync(path.join(root, 'js/data.js'), 'utf8');
  const start = data.indexOf(from);
  const end = data.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `slice ${from}`);
  return data.slice(start, end);
}

test('only the server\'s own refusals (P0001) are shown; internal errors become one plain message', () => {
  const c = vm.createContext({String, Number});
  vm.runInContext(dataSlice('function customerRpcMessage', '\n}\n') + '\n}', c);
  const f = vm.runInContext('customerRpcMessage', c);
  assert.equal(f(400, {code: 'P0001', message: 'This code is not valid'}), 'This code is not valid');
  assert.equal(f(400, {code: 'P0001', message: 'Too many tries. Please wait a few minutes'}), 'Too many tries. Please wait a few minutes');
  assert.equal(f(400, {code: '22P02', message: 'invalid input syntax for type uuid: "x"'}), 'Order service is unavailable. Please try again.');
  assert.equal(f(500, {code: 'XX000', message: 'cache lookup failed for relation 12345'}), 'Order service is unavailable. Please try again.');
  assert.equal(f(401, {message: 'JWT expired'}), 'Please sign in again to continue.');
  assert.equal(f(403, {code: '42501', message: 'permission denied for function oracy_create_customer_order_v1'}), 'Please sign in again to continue.');
  assert.equal(f(403, {code: '42501', message: 'Authentication required'}), 'Please sign in again to continue.');
  assert.equal(f(403, {code: '42501', message: 'Order not found'}), 'Order service is unavailable. Please try again.');   // a wrong token, not a sign-in problem
  assert.match(f(409, {code: '23505', message: 'duplicate key value violates unique constraint "customer_orders_client_order_id_key"'}), /duplicate key/);
  assert.equal(f(400, {code: 'P0001', message: 'x'.repeat(300)}), 'Order service is unavailable. Please try again.');
  assert.equal(f(502, null), 'Order service is unavailable. Please try again.');
});

test('order history on the device: 20 at most, nothing older than 30 days, no e-mail', () => {
  const c = vm.createContext({Array, Number, Date});
  vm.runInContext(dataSlice('const CUSTOMER_ORDER_HISTORY_DAYS', '\nfunction saveCustomerOrderHistory'), c);
  const trim = vm.runInContext('trimCustomerOrderHistory', c);
  const now = Date.parse('2026-10-03T12:00:00Z');
  const day = 24 * 60 * 60 * 1000;
  const list = [];
  for (let i = 0; i < 25; i++) list.push({id: `MK-${i}`, completedAt: now - i * day, customer: {name: 'A', mobile: '+9665', email: 'a@b.c'}, address: 'x'});
  list.push({id: 'OLD', completedAt: now - 31 * day, customer: {name: 'Old', mobile: '+9665', email: 'old@b.c'}});
  list.push({id: 'NOTIME', customer: {name: 'N', mobile: '+9665'}});
  list.push(null, {noId: true});
  const kept = trim(list, now);
  assert.equal(kept.length, 20);
  assert.ok(kept.every(o => o.customer.email === undefined && o.address === undefined));
  assert.ok(kept.every(o => o.id !== 'OLD'));
  assert.equal(kept[0].customer.name, 'A');
  assert.equal(trim([{id: 'NOTIME', customer: {name: 'N', mobile: '+9665', email: 'n@b.c'}}], now)[0].customer.email, undefined);
  assert.equal(JSON.stringify(trim(null, now)), '[]');
});

function captchaEnvironment(siteKey) {
  const widget = {renders: [], resets: 0, removed: 0, opts: null};
  const turnstile = {
    render: (box, opts) => { widget.renders.push(box); widget.opts = opts; box.childElementCount = 1; return 'w1'; },
    reset: () => { widget.resets++; },
    remove: () => { widget.removed++; },
  };
  const box = {id: 'captchaBox', childElementCount: 0, classList: {contains: () => false}};
  const document = {
    getElementById: id => id === 'captchaBox' ? box : null,
    querySelectorAll: () => [],
    createElement: () => ({}),
    head: {appendChild: () => {}},
    body: {appendChild: () => {}},
  };
  const window = {turnstile};
  const c = vm.createContext({console, Promise, Error, String, setTimeout: () => 0, clearTimeout: () => {},
    window, document, state: {lang: 'en'}, APP_CONFIG: {backend: {captchaSiteKey: siteKey}}, module: {exports: {}}});
  vm.runInContext(fs.readFileSync(path.join(root, 'js/captcha.js'), 'utf8'), c);
  return {c, widget, box};
}

test('no site key: sign-in sends no captcha field and loads nothing', async () => {
  const {c, widget} = captchaEnvironment('');
  assert.equal(JSON.stringify(await vm.runInContext('captchaAuthFields()', c)), '{}');
  assert.equal(vm.runInContext('captchaBox()', c), '');
  assert.equal(widget.renders.length, 0);
});

test('with a site key: each request gets its own single-use token from the widget', async () => {
  const {c, widget} = captchaEnvironment('1x00000000000000000000AA');
  assert.match(vm.runInContext('captchaBox()', c), /id="captchaBox"/);
  const pending = vm.runInContext('captchaAuthFields()', c);
  await new Promise(r => setImmediate(r));
  assert.equal(widget.renders.length, 1);
  assert.equal(widget.opts.sitekey, '1x00000000000000000000AA');
  widget.opts.callback('tok-1');                      // the challenge completes
  assert.equal(JSON.stringify(await pending), JSON.stringify({gotrue_meta_security: {captcha_token: 'tok-1'}}));
  const second = vm.runInContext('captchaAuthFields()', c);
  await new Promise(r => setImmediate(r));
  assert.equal(widget.resets, 1);                      // a new challenge is asked for
  widget.opts.callback('tok-2');
  assert.equal(JSON.stringify(await second), JSON.stringify({gotrue_meta_security: {captcha_token: 'tok-2'}}));
  widget.opts.callback('tok-3');                       // an unsolicited token is kept for the next call
  assert.equal(JSON.stringify(await vm.runInContext('captchaAuthFields()', c)), JSON.stringify({gotrue_meta_security: {captcha_token: 'tok-3'}}));
  assert.equal(widget.resets, 1);
});

test('a failed challenge rejects with a message the sign-in page can show', async () => {
  const {c, widget} = captchaEnvironment('1x00000000000000000000AA');
  const pending = vm.runInContext('captchaAuthFields()', c);
  await new Promise(r => setImmediate(r));
  widget.opts['error-callback']();
  await assert.rejects(pending, /captcha failed/);
  const auth = fs.readFileSync(path.join(root, 'js/auth.js'), 'utf8');
  const a = vm.createContext({String, state: {lang: 'en'}});
  const start = auth.indexOf('function authCopy'); const end = auth.indexOf('\n}\n', start) + 3;
  vm.runInContext(auth.slice(start, end), a);
  const s2 = auth.indexOf('function authMessage'); const e2 = auth.indexOf('\n}\n', s2) + 3;
  vm.runInContext(auth.slice(s2, e2), a);
  assert.match(vm.runInContext('authMessage', a)(new Error('captcha failed')), /security check/);
  assert.match(vm.runInContext('authMessage', a)({status: 400, message: 'captcha verification process failed'}), /security check/);
});

test('the OTP request and the code check both carry the token when configured', async () => {
  const bodies = [];
  const c = vm.createContext({JSON, String, Number, Math, Date, Error, URL, console,
    APP_CONFIG: {tenant: {restaurantId: 'r', slug: 's'}},
    MENU_CONFIG: {url: 'https://x', publicKey: 'k'},
    captchaAuthFields: async () => ({gotrue_meta_security: {captcha_token: 'tok'}}),
    authHttp: async (p, {body}) => { bodies.push({p, body}); return {access_token: 'a'.repeat(30), refresh_token: 'r', expires_at: 9999999999, user: {id: '11111111-1111-1111-1111-111111111111', phone: '+966500000001'}}; },
    saveAuthSession: s => s, normalizeSaudiMobile: v => v, isMenuId: () => true, localStorage: {setItem: () => {}}});
  const auth = fs.readFileSync(path.join(root, 'js/auth.js'), 'utf8');
  const start = auth.indexOf('async function authCaptchaFields'); const end = auth.indexOf('\nasync function refreshCustomerSession');
  vm.runInContext(auth.slice(start, end), c);
  await vm.runInContext('requestPhoneOtp("+966500000001")', c);
  await vm.runInContext('verifyPhoneOtp("+966500000001", "123456")', c);
  assert.equal(bodies[0].p, 'otp');
  assert.equal(bodies[0].body.gotrue_meta_security.captcha_token, 'tok');
  assert.equal(bodies[1].p, 'verify');
  assert.equal(bodies[1].body.gotrue_meta_security.captcha_token, 'tok');
  assert.equal(bodies[1].body.type, 'sms');
});

test('the deploy ignores tests, SQL and notes; the app no longer renders an order number unescaped', () => {
  const ignore = fs.readFileSync(path.join(root, '.vercelignore'), 'utf8');
  for (const line of ['tests/', 'supabase/', '*.md']) assert.ok(ignore.includes(line), line);
  const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
  assert.ok(!/<strong>\$\{o\.id\}<\/strong>/.test(app));
  assert.ok(!/#\$\{order\.id\}/.test(app));
  assert.ok(app.includes('if (!state.isLoggedIn) { go("checkout"); return toast(t("signInRequired")); }'));
});

test('an order without a session token is refused on the device with the right words', async () => {
  const data = fs.readFileSync(path.join(root, 'js/data.js'), 'utf8');
  const start = data.indexOf('async function customerOrderRpc'); const end = data.indexOf('\nasync function submitCustomerOrder');
  const make = (token, tokenError, loggedIn) => {
    const c = vm.createContext({console, JSON, Error, String, Number, AbortController: class { constructor() { this.signal = {}; } abort() {} },
      setTimeout: () => 0, clearTimeout: () => {}, MENU_CONFIG: {url: 'https://x', publicKey: 'k'}, state: {isLoggedIn: loggedIn},
      activeAccessToken: async () => { if (tokenError) throw tokenError; return token; }, fetch: async () => ({ok: true, json: async () => ({ok: 1})})});
    vm.runInContext(data.slice(start, end), c);
    return c;
  };
  await assert.rejects(vm.runInContext('customerOrderRpc("oracy_create_customer_order_v1", {})', make(null, null, false)), /sign in again/);
  await assert.rejects(vm.runInContext('customerOrderRpc("oracy_create_customer_order_v1", {})', make(null, new Error('Failed to fetch'), true)), /connection is slow/);
  const refused = Object.assign(new Error('Invalid Refresh Token'), {status: 400});
  await assert.rejects(vm.runInContext('customerOrderRpc("oracy_create_pin_delivery_order_v2", {})', make(null, refused, false)), /sign in again/);
  assert.equal((await vm.runInContext('customerOrderRpc("oracy_track_customer_order_v1", {})', make(null, null, false))).ok, 1);   // guest tracking still works
  assert.equal((await vm.runInContext('customerOrderRpc("oracy_create_customer_order_v1", {})', make('tok', null, true))).ok, 1);
});
