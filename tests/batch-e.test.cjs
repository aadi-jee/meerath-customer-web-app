// Batch E (283): the restaurant's switched-on parts come with the ordering status
// (features). The app only hides what the server already refuses.
// Run: node --test tests/batch-e.test.cjs. No network.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

/** One top-level function (or statement starting with `from`) out of a file. */
function piece(file, from, to = '\n}\n') {
  const text = read(file);
  const start = text.indexOf(from);
  const end = text.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `piece ${file}: ${from}`);
  return text.slice(start, end + (to === '\n}\n' ? 3 : 0));
}
function env(lang = 'en', extra = {}) {
  const c = vm.createContext({state: {lang, orderType: 'delivery', screen: 'home', orderTiming: 'later', redeemPoints: 50,
      couponOn: true, voucher: {code: 'EID'}, coupon: 'EID'}, MENU_CONFIG: {timeZone: 'Asia/Riyadh', url: 'https://x', publicKey: 'k', restaurantId: 'r', branchId: 'b'},
    escapeHtml: s => String(s), Intl, Date, Math, Number, String, JSON, Promise, Error, Object, console,
    setTimeout: () => 0, clearTimeout: () => {}, ...extra});
  vm.runInContext(read('js/ordering-hours.js'), c);
  const run = code => vm.runInContext(code, c);
  run.context = c;
  return run;
}
const ALL = ['app', 'ordering', 'delivery', 'rewards', 'vouchers', 'push', 'catering', 'recommendations'];
const open = {open: true, enforced: false};
const off = {open: false, enforced: true, reason: 'unavailable'};
const allOn = Object.fromEntries(ALL.map(x => [x, true]));
const status = o => `orderingHours.status=${JSON.stringify({version: 1, now: new Date().toISOString(), timezone: 'Asia/Riyadh', week: [],
  dinein: open, takeaway: open, delivery: open, ...o})}`;

test('no features in the answer (older database) or no answer yet: every part is on', () => {
  const run = env();
  for (const name of ALL) assert.equal(run(`featureOn("${name}")`), true, name);
  run(status({}));
  for (const name of ALL) assert.equal(run(`featureOn("${name}")`), true, name);
  assert.equal(run('featuresOffKey()'), '');
  run(status({features: {app: true, ordering: true}}));           // a key missing from the map = on
  assert.equal(run('featureOn("rewards")'), true);
  run(status({features: {...allOn, rewards: false, push: false}}));
  assert.equal(run('featureOn("rewards")'), false);
  assert.equal(run('featureOn("vouchers")'), true);
  assert.equal(run('featuresOffKey()'), 'rewards,push');
});

test('ordering switched off: the notice in both languages, nothing can be ordered, the menu stays', () => {
  for (const features of [{...allOn, ordering: false}, undefined]) {   // by the flag, or by the three states alone
    const run = env();
    run(status({dinein: off, takeaway: off, delivery: off, ...(features ? {features} : {})}));
    for (const type of ['dinein', 'takeaway', 'delivery']) assert.equal(run(`orderTypeOpen("${type}")`), false);
    assert.equal(run('restaurantAcceptingOrders()'), false);
    assert.equal(run('orderingClosedTitle("takeaway") + ". " + restaurantClosedMessage("takeaway")'),
      'Online ordering is not available right now. Please call the restaurant.');
    assert.equal(run('orderingClosedTitle("delivery") + ". " + restaurantClosedMessage("delivery")'),
      'Online ordering is not available right now. Please call the restaurant.');
    assert.match(run('orderingNoticeMarkup("dinein")'), /role="alert"[\s\S]*Online ordering is not available right now/);
    assert.match(run('orderingStripMarkup()'), /Online ordering is not available right now\.[\s\S]*Please call the restaurant\./);
    assert.doesNotMatch(run('orderingStripMarkup()'), /Closed now|Opens/);
  }
  const flagOnly = env();                                             // the flag alone is enough
  flagOnly(status({features: {...allOn, ordering: false}}));
  assert.equal(flagOnly('orderTypeOpen("dinein")'), false);
  const ar = env('ar');
  ar(status({dinein: off, takeaway: off, delivery: off, features: {...allOn, ordering: false}}));
  assert.equal(ar('orderingClosedTitle("dinein") + ". " + restaurantClosedMessage("dinein")'),
    'الطلب عبر الإنترنت غير متاح حالياً. يرجى الاتصال بالمطعم.');
  assert.match(ar('orderingStripMarkup()'), /الطلب عبر الإنترنت غير متاح حالياً/);
});

test('the checkout refuses on the device: Place Order is disabled and no order call is made', async () => {
  const app = read('js/app.js');
  assert.match(app, /\$\{orderTypeOpen\(\) && !checkoutBusy[^\n]*\? "" : "disabled aria-disabled/);
  assert.ok(app.includes('cartCopy("Ordering is not available", "الطلب غير متاح")'));
  const calls = [], toasts = [];
  const run = env('en', {render: () => {}, toast: m => toasts.push(m), validateMenuCart: async () => { calls.push('validate'); return true; },
    submitCustomerOrder: async () => { calls.push('order'); }, checkOfferCartRules: () => true});
  run(piece('js/app.js', 'async function placeOrder'));
  run(status({dinein: off, takeaway: off, delivery: off, features: {...allOn, ordering: false}}));
  run('state.authBusy = false; state.orderSubmitting = false; state.orderType = "takeaway"');
  await run('placeOrder()');
  assert.deepEqual(calls, []);
  assert.equal(toasts[0], 'Online ordering is not available right now. Please call the restaurant.');
  for (const guard of ['async function createOrderAfterVerification() {\n  if (!orderTypeOpen())', 'if (!orderTypeOpen()) { toast(orderingClosedTitle() + ". " + restaurantClosedMessage(),7000); return; }\n  // Gate 4 (280)']) {
    assert.ok(app.includes(guard), guard);
  }
});

test('delivery switched off: not offered, a delivery cart moves to pick-up, the other types stay open', () => {
  const run = env();
  run(status({delivery: off, features: {...allOn, delivery: false}}));
  assert.equal(run('orderTypeOpen("delivery")'), false);
  assert.equal(run('orderTypeOpen("takeaway")'), true);
  assert.equal(run('restaurantAcceptingOrders()'), true);
  assert.equal(run('orderingStripMarkup()'), '');
  assert.equal(run('orderingClosedTitle("delivery") + ". " + restaurantClosedMessage("delivery")'),
    'Delivery is not available from this restaurant. Please choose pick-up or dine-in.');
  run(piece('js/app.js', 'function deliveryOffered'));
  assert.equal(run('deliveryOffered()'), false);
  let cleared = 0;
  run.context.clearDeliveryQuote = () => { cleared++; };
  run('state.redeemPoints = 50; orderingApplyFeatures()');
  assert.equal(run('state.orderType'), 'takeaway');
  assert.equal(run('state.orderTiming'), 'asap');
  assert.equal(cleared, 1);
  assert.equal(run('state.redeemPoints'), 50);                      // points and the code are untouched
  assert.equal(run('state.couponOn'), true);
  const ar = env('ar');
  ar(status({delivery: off, features: {...allOn, delivery: false}}));
  assert.equal(ar('orderingClosedTitle("delivery") + ". " + restaurantClosedMessage("delivery")'),
    'التوصيل غير متاح من هذا المطعم. يرجى اختيار الاستلام أو الطلب داخل المطعم.');
  const app = read('js/app.js');
  assert.equal(app.split('${deliveryOffered() ? "" : `disabled aria-disabled="true" title="${cartCopy("Delivery is not available from this restaurant.", "التوصيل غير متاح من هذا المطعم.")}"`}').length, 3);   // Home and checkout
  const on = env();
  on(status({}));
  on(piece('js/app.js', 'function deliveryOffered'));
  assert.equal(on('deliveryOffered()'), true);
  on('orderingApplyFeatures()');
  assert.equal(on('state.orderType'), 'delivery');
});

test('the app switched off: one notice in place of every screen, in both languages', () => {
  const run = env();
  run(status({features: {...allOn, app: false}}));
  assert.match(run('appUnavailableMarkup()'), /This app is not available right now\.[\s\S]*Please contact the restaurant\./);
  const ar = env('ar');
  assert.match(ar('appUnavailableMarkup()'), /هذا التطبيق غير متاح حالياً\.[\s\S]*يرجى التواصل مع المطعم\./);
  const app = read('js/app.js');
  const guard = app.indexOf('if (typeof featureOn === "function" && !featureOn("app")) {\n    $app().innerHTML = appUnavailableMarkup();');
  assert.ok(guard > 0 && guard < app.indexOf('$app().innerHTML = (map[state.screen] || home)();'));
  assert.match(app.slice(guard, guard + 220), /return;/);          // no navigation, no screen, no push card after it
});

test('points switched off: no points anywhere and none are sent', () => {
  const run = env('en', {APP_CONFIG: {features: {rewards: true}}, rewardsState: {rules: {enabled: true}}});
  run(piece('js/rewards.js', 'function rewardsOn'));
  run(status({}));
  assert.equal(run('rewardsOn()'), true);
  run(status({features: {...allOn, rewards: false}}));
  assert.equal(run('rewardsOn()'), false);
  run('orderingApplyFeatures()');
  assert.equal(run('state.redeemPoints'), 0);
  const rewards = read('js/rewards.js');
  for (const gate of ['if (!rewardsOn()) return `<div id="rewardsCheckout" hidden></div>`;', 'function rewardsAccountCardMarkup() {\n  if (!rewardsOn()) return "";',
    'if (!rewardsOn() || !state.isLoggedIn) return 0;', 'if (!rewardsOn() || !state.isLoggedIn) return "";']) assert.ok(rewards.includes(gate), gate);
  assert.ok(read('js/app.js').includes('${typeof rewardsOn === "function" && rewardsOn() ? `'));   // the guest card on Account
});

test('voucher codes switched off: no code box, no check call, no coupon_code', async () => {
  const calls = [];
  const run = env('en', {t: k => k, cartCopy: (en) => en, customerOrderRpc: async name => { calls.push(name); return {ok: true, code: 'EID'}; },
    refreshCouponBox: () => {}, updateCartBreakdown: () => {}, toast: () => {}, totals: () => ({points: 0}), itemById: () => null});
  run(piece('js/app.js', 'function couponBoxMarkup'));
  run(piece('js/app.js', 'async function applyCoupon'));
  run(status({}));
  assert.match(run('state.couponOn = false; couponBoxMarkup()'), /id="couponInput"/);
  run(status({features: {...allOn, vouchers: false}}));
  assert.equal(run('couponBoxMarkup()'), '');
  run('state.coupon = "EID"; state.cart = []');
  await run('applyCoupon()');
  assert.deepEqual(calls, []);
  run('state.couponOn = true; state.voucher = {code: "EID"}; orderingApplyFeatures()');
  assert.equal(run('state.couponOn'), false);
  assert.equal(run('state.voucher'), null);
  assert.equal(run('state.coupon'), '');
  assert.ok(read('js/app.js').includes('coupon_code: state.couponOn && state.voucher && totals().discount > 0 && featureOn("vouchers") ? state.voucher.code : "",'));
});

test('notifications switched off: never asked, never subscribed', async () => {
  const asked = [], saved = [];
  const Notification = {permission: 'granted', requestPermission: async () => { asked.push(1); return 'granted'; }};
  const navigator = {serviceWorker: {getRegistration: async () => ({pushManager: {getSubscription: async () => ({toJSON: () => ({endpoint: 'e', keys: {}})})}}),
    addEventListener: () => {}}};
  const run = env('en', {Notification, navigator, window: {PushManager: function () {}, Notification, addEventListener: () => {}, matchMedia: () => ({matches: false})},
    customerOrderRpc: async name => { saved.push(name); }, localStorage: {getItem: () => null, setItem: () => {}}, Set, toast: () => {}});
  run(read('js/push.js'));
  const id = '11111111-1111-1111-1111-111111111111';
  assert.equal(run('pushSupported()'), true);
  run('pushState.key = "k"; pushState.keyTried = true; pushState.checked = true');
  Notification.permission = 'default';
  run(status({features: {...allOn, push: false}}));
  assert.equal(run('pushAllowed()'), false);
  assert.equal(run(`pushCardMarkup({id: "${id}"})`), '<div data-push-card="1" hidden></div>');
  await run(`pushEnable("${id}", "")`);
  await run(`pushFollowOrder("${id}", "")`);
  assert.deepEqual(asked, []);
  assert.deepEqual(saved, []);
  run(status({}));
  assert.equal(run('pushAllowed()'), true);
  assert.match(run(`pushCardMarkup({id: "${id}"})`), /Turn on/);
  Notification.permission = 'granted';
  await run(`pushFollowOrder("${id}", "")`);
  assert.deepEqual(saved, ['oracy_customer_push_subscribe_v1']);
});

test('catering switched off: no entry and no form', () => {
  const run = env('en', {featureEnabled: () => true, updateCopy: en => en, go: () => {}});
  run(piece('js/customer-updates.js', 'function cateringOn', '\n'));
  run(piece('js/customer-updates.js', 'function cateringCardMarkup'));
  run(status({}));
  assert.match(run('cateringCardMarkup()'), /catering-card/);
  run(status({features: {...allOn, catering: false}}));
  assert.equal(run('cateringOn()'), false);
  assert.equal(run('cateringCardMarkup()'), '');
  const updates = read('js/customer-updates.js');
  assert.ok(!updates.includes("featureEnabled('catering')) "));     // every catering door asks cateringOn()
  assert.ok(updates.includes("function cateringPage() {\n  if (!cateringOn()) return '';"));
  assert.ok(updates.includes("row.action === 'catering' && cateringOn()"));
});

test('suggestions switched off: no list and no heading, also not the manual pairings', () => {
  const item = {id: 'a', name_en: 'A'};
  const run = env('en', {cartRecommendations: () => [item], requestCustomerContent: () => {}, addRecommended: () => {}, cartRecommendationsMarkup: () => '',
    itemById: () => item, canAddItem: () => true, canOrderItem: () => true, menuReady: () => true, cartCopy: en => en, loc: i => i.name_en, money: n => String(n),
    t: k => k, offerLabel: () => '', offerSpendStatus: () => ({remaining: 0}), ITEMS: [item], APP_CONFIG: {brand: {shortName: 'M'}}, Set, Array, AbortController, fetch: async () => ({ok: false, status: 500})});
  run('var cartRecommendations, requestCustomerContent, addRecommended, cartRecommendationsMarkup;');
  run(read('js/recommendations.js'));
  run('state.cart = [{id: "b", qty: 1}]');
  run(status({}));
  assert.match(run('cartRecommendationsMarkup()'), /Pairs well with your order/);   // the manual pairing shows
  run(status({features: {...allOn, recommendations: false}}));
  assert.equal(run('cartRecommendationsMarkup()'), '');
  assert.equal(run('itemRecommendationsMarkup({id: "b"})'), '');
  assert.equal(run('nextTimeRecommendationsMarkup({items: [{id: "b"}]})'), '');
});

test('a module_off refusal keeps its hint and reads the status again', async () => {
  const data = read('js/data.js');
  const start = data.indexOf('async function customerOrderRpc'); const end = data.indexOf('\nasync function submitCustomerOrder');
  let refreshed = 0;
  const body = {code: 'P0001', hint: 'module_off', details: 'online_ordering',
    message: 'Online ordering is not available for this restaurant right now. Please call the restaurant.'};
  const make = detail => {
    const c = vm.createContext({console, JSON, Error, String, Number, AbortController, setTimeout: () => 0, clearTimeout: () => {},
      MENU_CONFIG: {url: 'https://x', publicKey: 'k'}, state: {isLoggedIn: true}, activeAccessToken: async () => 'tok',
      loadOrderingHours: () => { refreshed++; }, fetch: async () => ({ok: false, status: 400, json: async () => detail})});
    vm.runInContext(data.slice(start, end), c);
    return vm.runInContext('customerOrderRpc("oracy_create_customer_order_v1", {})', c);
  };
  await assert.rejects(make(body), error => error.hint === 'module_off' && error.message === body.message);
  assert.equal(refreshed, 1);
  await assert.rejects(make({code: 'P0001', message: 'This code is not valid'}), error => error.hint === undefined);
  await assert.rejects(make({code: 'XX000', hint: 'module_off', message: 'internal'}), error => error.hint === undefined);
  assert.equal(refreshed, 1);
  const app = read('js/app.js');
  const branch = app.indexOf('} else if (error?.hint === "module_off") {');
  assert.ok(branch > 0 && branch < app.indexOf('} else if (orderingRefusal(rawMessage)) {'));
  assert.match(app.slice(branch, branch + 700), /Promise\.resolve\(loadOrderingHours\(\)\)\.then/);
});

test('the status call carries the features and a change redraws the screen', async () => {
  let renders = 0;
  const answers = [{features: allOn}, {features: {...allOn, rewards: false}}, {features: {...allOn, rewards: false}}];
  const run = env('en', {render: () => { renders++; }, AbortController,
    fetch: async () => ({ok: true, json: async () => ({version: 1, now: new Date().toISOString(), dinein: open, takeaway: open, delivery: open, ...answers.shift()})})});
  await run('loadOrderingHours()');
  assert.equal(renders, 0);                                           // everything on = nothing changed
  await run('loadOrderingHours()');
  assert.equal(renders, 1);
  assert.equal(run('featureOn("rewards")'), false);
  assert.equal(run('state.redeemPoints'), 0);
  await run('loadOrderingHours()');
  assert.equal(renders, 1);
});

test('the server\'s new sentences pass the allow-list and have Arabic words', () => {
  const c = vm.createContext({String, Number});
  vm.runInContext(piece('js/data.js', 'function customerRpcMessage'), c);
  const sentences = [
    'Online ordering is not available for this restaurant right now. Please call the restaurant.',
    'Delivery is not available from this restaurant. Please choose pick-up or dine-in.',
    'Notifications are not available for this restaurant.',
    'Catering enquiries are not available right now. Please contact the restaurant directly.',
  ];
  const en = env(), ar = env('ar');
  for (const message of sentences) {
    assert.equal(vm.runInContext('customerRpcMessage', c)(400, {code: 'P0001', hint: 'module_off', message}), message);
    assert.equal(en(`moduleOffText(${JSON.stringify(message)})`), message);
    assert.match(ar(`moduleOffText(${JSON.stringify(message)})`), /[؀-ۿ]/);
  }
  assert.equal(ar('moduleOffText("Something else")'), 'Something else');
});

test('cache keys are bumped for every changed file', () => {
  const html = read('index.html');
  for (const file of ['css/home.css', 'js/rewards.js',
    'js/order-addons.js']) assert.ok(html.includes(`${file}?v=20261003-batche"`), file);
  assert.ok(html.includes('js/ordering-hours.js?v=20261007-b1g"'));   // Batch B1g (closed texts at a table) changed ordering-hours.js
});
