// Batch PC (301): "Offers and news" — a separate agreement, off until the customer switches it on.
// Run: node --test tests/push-offers.test.cjs. No network.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc';
const AUTH = 'abcdefghijklmnop';
const ITEM = '11111111-1111-4111-8111-111111111111';
const GONE = '22222222-2222-4222-8222-222222222222';
const CATEGORY = '33333333-3333-4333-8333-333333333333';
const CAMPAIGN = '44444444-4444-4444-8444-444444444444';
const ORDER = '55555555-5555-4555-8555-555555555555';
const OFFERS = 'oracy_customer_push_offers_v1';
const OPENED = 'oracy_customer_push_opened_v1';

/** push.js in a vm. options: subscription (false = none), permission, loggedIn, pushOn, supported, ios, lang, search, rpc. */
function environment(options = {}) {
  const calls = [], went = [], opened = [], replaced = [], inserted = [], windowEvents = {}, workerEvents = {};
  let asked = 0, subscribed = 0;
  const made = {endpoint: ENDPOINT, toJSON: () => ({endpoint: ENDPOINT, keys: {auth: AUTH, p256dh: 'p'}}), unsubscribe: async () => true};
  let subscription = options.subscription === false ? null : (options.subscription || made);
  const Notification = {permission: options.permission || 'granted',
    requestPermission: async () => { asked++; if (Notification.permission === 'default') Notification.permission = options.answer || 'granted'; return Notification.permission; }};
  const registration = {pushManager: {getSubscription: async () => subscription,
    subscribe: async () => { subscribed++; subscription = made; return made; }}};
  const navigator = {userAgent: options.ios ? 'iPhone' : 'Linux', platform: 'Linux', maxTouchPoints: 0,
    serviceWorker: {addEventListener: (name, fn) => { workerEvents[name] = fn; }, getRegistration: async () => registration,
      register: async () => registration, ready: Promise.resolve(registration)}};
  const window = {addEventListener: (name, fn) => { windowEvents[name] = fn; }};
  if (options.supported === false) delete navigator.serviceWorker; else Object.assign(window, {PushManager: {}, Notification});
  const state = {lang: options.lang || 'en', screen: 'home', isLoggedIn: !!options.loggedIn, orderTab: 'history'};
  const items = [{id: ITEM, category: CATEGORY, offer: options.noOffers ? null : {}, ok: true}, {id: GONE, category: 'x', ok: false}];
  const server = {known: true, on: false};
  const rpc = options.rpc || (async (name, params) => {
    if (name === OFFERS) {
      if (params.p_on !== null && server.known) server.on = params.p_on;
      return {ok: true, known: server.known, on: server.known && server.on};
    }
    if (name === 'oracy_customer_push_subscribe_v1') server.known = true;
    return {ok: true};
  });
  const c = vm.createContext({console, navigator, window, Notification, PushManager: {}, setTimeout, clearTimeout, atob, btoa, URLSearchParams, Uint8Array,
    matchMedia: () => ({matches: false}), localStorage: {getItem: () => null, setItem: () => {}},
    location: {search: options.search || '', pathname: '/app/'}, history: {state: null, replaceState: (...a) => replaced.push(a)},
    state, MENU_CONFIG: {url: 'https://x', publicKey: 'k', restaurantId: 'r'},
    featureOn: name => !(name === 'push' && options.pushOn === false),
    moduleOffText: text => `[module off] ${text}`,
    escapeHtml: value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    toast: () => {}, renderKeepScroll: () => {},
    menuReady: () => true, ITEMS: items, CATEGORIES: [{id: CATEGORY}],
    itemById: id => items.find(i => i.id === id), canOrderItem: item => !!item && item.ok,
    openItem: id => opened.push(id), go: (screen, extra) => { state.screen = screen; went.push({screen, extra}); },
    customerOrderRpc: async (name, params) => { calls.push({name, params}); return rpc(name, params); }});
  if (options.document) c.document = {querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
    body: {insertAdjacentHTML: (where, html) => inserted.push(html)}};
  vm.runInContext(read('js/push.js'), c);
  const run = code => vm.runInContext(code, c);
  run(`pushState.key = "${'A'.repeat(87)}"; pushState.keyTried = true;`);
  if (subscription && Notification.permission === 'granted') run('pushState.subscribed = true; pushState.checked = true;');
  return {c, run, calls, went, opened, replaced, inserted, state, server, windowEvents, workerEvents, Notification,
    offers: () => calls.filter(x => x.name === OFFERS), asked: () => asked, subscribed: () => subscribed};
}
const checked = html => /<input[^>]*\schecked/.test(html);
const hasSwitch = html => html.includes('role="switch"');
const settle = () => new Promise(resolve => setTimeout(resolve, 5));

test('default is off: nothing is checked and nothing is sent until the customer taps', async () => {
  const e = environment();
  const html = e.run('pushOffersMarkup("card")');
  assert.ok(hasSwitch(html));
  assert.equal(checked(html), false);
  assert.ok(html.includes('Offers and news'));
  assert.ok(html.includes('Occasional offers from this restaurant. Never more than one a day. You can turn this off at any time.'));
  assert.equal(e.run('pushOffers.on'), false);
  assert.equal(e.calls.length, 0);
});

test('the order card shows the switch only once order notifications are on', () => {
  const on = environment();
  const card = on.run(`pushCardMarkup({id: "${ORDER}", token: ""})`);
  assert.ok(card.includes('Notifications are on for this order.'));
  assert.ok(card.includes('data-push-offers="card"'));
  assert.equal(checked(card), false);
  const notYet = environment({subscription: false, permission: 'default'});
  const ask = notYet.run(`pushCardMarkup({id: "${ORDER}", token: ""})`);
  assert.ok(ask.includes('Turn on'));
  assert.equal(ask.includes('data-push-offers'), false);
});

test('the state comes from the server: a read sends null and never changes anything', async () => {
  const e = environment();
  e.server.on = true;
  await e.run('pushOffersLoad()');
  assert.equal(e.offers().length, 1);
  assert.deepEqual({...e.offers()[0].params}, {p_endpoint: ENDPOINT, p_auth: AUTH, p_on: null});
  assert.equal(checked(e.run('pushOffersMarkup("card")')), true);
  e.server.on = false;
  await e.run('pushOffersLoad()');
  assert.equal(checked(e.run('pushOffersMarkup("card")')), false);
});

test('a screen with the switch asks the server again each time it is shown', async () => {
  const e = environment();
  e.state.screen = 'track';
  e.run('pushAfterRender()'); e.run('pushAfterRender()');
  await settle();
  assert.equal(e.offers().length, 1);
  e.state.screen = 'home'; e.run('pushAfterRender()');
  e.state.screen = 'account'; e.run('pushAfterRender()');
  await settle();
  assert.equal(e.offers().length, 2);
  assert.ok(e.offers().every(x => x.params.p_on === null));
});

test('an answer that is not exactly "known and on" shows as off', async () => {
  for (const answer of [{ok: true, known: false, on: true}, {ok: false, known: true, on: true}, {ok: true, known: true, on: 'true'}, null, 'on', {}]) {
    const e = environment({rpc: async () => answer});
    await e.run('pushOffersLoad()');
    assert.equal(e.run('pushOffers.on'), false, JSON.stringify(answer));
  }
});

test('a failed read keeps what is shown', async () => {
  let fail = false;
  const e = environment({rpc: async () => { if (fail) throw new Error('offline'); return {ok: true, known: true, on: true}; }});
  await e.run('pushOffersLoad()');
  fail = true;
  await e.run('pushOffersLoad()');
  assert.equal(e.run('pushOffers.on'), true);
});

test('turning on sends the endpoint, the auth secret and true', async () => {
  const e = environment();
  await e.run('pushOffersSet(true)');
  assert.equal(e.calls.length, 1);
  assert.equal(e.calls[0].name, OFFERS);
  assert.deepEqual({...e.calls[0].params}, {p_endpoint: ENDPOINT, p_auth: AUTH, p_on: true});
  assert.equal(e.run('pushOffers.on'), true);
  assert.equal(e.run('pushOffers.busy'), false);
  assert.equal(checked(e.run('pushOffersMarkup("card")')), true);
  assert.equal(e.asked(), 0);
});

test('turning off sends false', async () => {
  const e = environment();
  e.server.on = true;
  await e.run('pushOffersLoad()');
  await e.run('pushOffersSet(false)');
  assert.deepEqual({...e.calls.at(-1).params}, {p_endpoint: ENDPOINT, p_auth: AUTH, p_on: false});
  assert.equal(e.run('pushOffers.on'), false);
  assert.equal(e.server.on, false);
});

test('only a real true agrees: any other value withdraws', async () => {
  for (const value of ['"true"', '1', 'undefined', '{}']) {
    const e = environment();
    await e.run(`pushOffersSet(${value})`);
    assert.equal(e.calls.at(-1).params.p_on, false, value);
    assert.equal(e.run('pushOffers.on'), false, value);
  }
});

test('a failure rolls the switch back and says so in plain words', async () => {
  const e = environment({rpc: async (name, params) => {
    if (params.p_on === null) return {ok: true, known: true, on: false};
    throw new Error('The connection is slow. <b>Please</b> try again.');
  }});
  const pending = e.run('pushOffersSet(true)');
  assert.equal(e.run('pushOffers.on'), true);            // shown at once
  assert.equal(e.run('pushOffers.busy'), true);
  await pending;
  assert.equal(e.run('pushOffers.on'), false);           // and put back
  assert.equal(e.run('pushOffers.busy'), false);
  const html = e.run('pushOffersMarkup("card")');
  assert.equal(checked(html), false);
  assert.ok(html.includes('The connection is slow. &lt;b&gt;Please&lt;/b&gt; try again.'));
  assert.ok(html.includes('role="alert"'));
});

test('a failed switch-off stays on', async () => {
  const e = environment({rpc: async (name, params) => {
    if (params.p_on === false) throw new Error('The connection is slow. Please try again.');
    return {ok: true, known: true, on: true};
  }});
  await e.run('pushOffersLoad()');
  await e.run('pushOffersSet(false)');
  assert.equal(e.run('pushOffers.on'), true);
  assert.ok(e.run('pushOffers.error').includes('try again'));
});

test('a server that does not confirm is a failure, not a silent "on"', async () => {
  const e = environment({rpc: async () => ({ok: true, known: true, on: false})});
  await e.run('pushOffersSet(true)');
  assert.equal(e.run('pushOffers.on'), false);
  assert.equal(e.run('pushOffers.error'), 'This could not be changed. Please try again.');
});

test('notifications switched off for the restaurant while tapping: the server\'s words, switch back off', async () => {
  const e = environment({rpc: async () => { throw Object.assign(new Error('Notifications are not available for this restaurant.'), {hint: 'module_off'}); }});
  await e.run('pushOffersSet(true)');
  assert.equal(e.run('pushOffers.on'), false);
  assert.equal(e.run('pushOffers.error'), '[module off] Notifications are not available for this restaurant.');
});

test('a second tap while the first is on its way is ignored', async () => {
  const e = environment();
  const first = e.run('pushOffersSet(true)');
  await e.run('pushOffersSet(false)');
  await first;
  assert.equal(e.offers().length, 1);
  assert.equal(e.run('pushOffers.on'), true);
});

test('subscribing for an order never calls the offers RPC and never agrees', async () => {
  const e = environment({subscription: false, permission: 'default'});
  await e.run(`pushEnable("${ORDER}", "")`);
  await e.run(`pushFollowOrder("${ORDER}", "")`);
  await settle();
  assert.equal(e.run('pushState.subscribed'), true);
  assert.equal(e.run('pushState.error'), '');
  assert.ok(e.calls.length >= 2);
  assert.ok(e.calls.every(x => x.name === 'oracy_customer_push_subscribe_v1'));
  assert.equal(e.calls[0].params.p_order_id, ORDER);
  assert.equal(e.offers().length, 0);
  assert.equal(e.run('pushOffers.on'), false);
  assert.equal(checked(e.run(`pushCardMarkup({id: "${ORDER}", token: ""})`)), false);
});

test('push switched off for the restaurant: no card, no switch, no request', async () => {
  const e = environment({pushOn: false, loggedIn: true});
  assert.equal(e.run(`pushCardMarkup({id: "${ORDER}", token: ""})`), '<div data-push-card="1" hidden></div>');
  for (const place of ['card', 'account', 'sheet']) assert.equal(e.run(`pushOffersMarkup("${place}")`), '');
  await e.run('pushOffersSet(true)');
  await e.run('pushOffersLoad()');
  await e.run('pushOffersManage()');
  await e.run(`pushOpenOffer({go: "menu", c: "${CAMPAIGN}"})`);
  await settle();
  assert.equal(e.calls.length, 0);
  assert.equal(e.run('pushOffers.on'), false);
});

test('Account, device not set up: turning on asks the browser, saves the device without an order, then agrees', async () => {
  const e = environment({subscription: false, permission: 'default', loggedIn: true});
  const row = e.run('pushOffersMarkup("account")');
  assert.ok(row.includes('account-list-item') && hasSwitch(row));
  assert.equal(checked(row), false);
  await e.run('pushOffersSet(true)');
  assert.equal(e.asked(), 1);
  assert.equal(e.subscribed(), 1);
  assert.deepEqual(e.calls.map(x => x.name), ['oracy_customer_push_subscribe_v1', OFFERS]);
  assert.equal(e.calls[0].params.p_order_id, null);
  assert.equal(e.calls[0].params.p_tracking_token, null);
  assert.equal(e.calls[1].params.p_on, true);
  assert.equal(e.run('pushOffers.on'), true);
});

test('Account: the customer says no to the browser question — nothing is agreed, plain message', async () => {
  const e = environment({subscription: false, permission: 'default', answer: 'denied', loggedIn: true});
  await e.run('pushOffersSet(true)');
  assert.equal(e.calls.length, 0);
  assert.equal(e.run('pushOffers.on'), false);
  // Now blocked in the browser: the row explains it and has no switch that could not work.
  const row = e.run('pushOffersMarkup("account")');
  assert.equal(hasSwitch(row), false);
  assert.ok(row.includes('Notifications are blocked for this site in your browser settings.'));
});

test('a device the server no longer has is saved again first (signed in); a guest is told what to do', async () => {
  const signedIn = environment({loggedIn: true});
  signedIn.server.known = false;
  await signedIn.run('pushOffersSet(true)');
  assert.deepEqual(signedIn.calls.map(x => x.name), [OFFERS, 'oracy_customer_push_subscribe_v1', OFFERS]);
  assert.equal(signedIn.run('pushOffers.on'), true);
  const guest = environment();
  guest.server.known = false;
  await guest.run('pushOffersSet(true)');
  assert.deepEqual(guest.calls.map(x => x.name), [OFFERS]);
  assert.equal(guest.run('pushOffers.on'), false);
  assert.equal(guest.run('pushOffers.error'), 'Turn on notifications for an order first, then switch on offers.');
});

test('never a dead switch: no push in the browser hides the row, an iPhone gets the Home Screen hint', () => {
  const none = environment({supported: false, loggedIn: true});
  assert.equal(none.run('pushOffersMarkup("account")'), '');
  assert.equal(none.run('pushOffersMarkup("card")'), '');
  const iphone = environment({supported: false, ios: true, loggedIn: true});
  const row = iphone.run('pushOffersMarkup("account")');
  assert.ok(row.includes('Add to Home Screen'));
  assert.equal(hasSwitch(row), false);
  // No server key (push not set up on the server): no row either.
  const noKey = environment({subscription: false, permission: 'default', loggedIn: true});
  noKey.run('pushState.key = null');
  assert.equal(noKey.run('pushOffersMarkup("account")'), '');
});

test('Arabic: every new text has its translation', async () => {
  const e = environment({lang: 'ar', loggedIn: true});
  const html = e.run('pushOffersMarkup("account")');
  assert.ok(html.includes('العروض والأخبار'));
  assert.ok(html.includes('عروض من هذا المطعم بين حين وآخر. لا تزيد عن عرض واحد في اليوم. يمكنك إيقافها في أي وقت.'));
  assert.equal(/[A-Za-z]{4,}/.test(html.replace(/<[^>]*>/g, '')), false);
  assert.equal(e.run('pushOffersOrderFirstText()'), 'فعّل إشعارات أحد طلباتك أولاً ثم فعّل العروض.');
  assert.equal(e.run('pushBlockedText()'), 'الإشعارات محظورة لهذا الموقع في إعدادات المتصفح.');
  const failing = environment({lang: 'ar', rpc: async () => ({ok: true, known: true, on: false})});
  await failing.run('pushOffersSet(true)');
  assert.equal(failing.run('pushOffers.error'), 'تعذّر تغيير هذا الإعداد. يرجى المحاولة مرة أخرى.');
  const blocked = environment({lang: 'ar', subscription: false, permission: 'denied'});
  assert.ok(blocked.run('pushOffersMarkup("sheet")').includes('الإشعارات محظورة'));
  const off = environment({lang: 'ar', subscription: false, permission: 'default'});
  assert.ok(off.run('pushOffersMarkup("sheet")').includes('العروض متوقفة على هذا الجهاز.'));
});

test('signing out still removes the device on the server and forgets the agreement here', async () => {
  const e = environment({loggedIn: true});
  await e.run('pushOffersSet(true)');
  await e.run('pushDetach()');
  assert.equal(e.calls.at(-1).name, 'oracy_customer_push_unsubscribe_v1');
  assert.deepEqual({...e.calls.at(-1).params}, {p_endpoint: ENDPOINT, p_auth: AUTH});
  assert.equal(e.run('pushOffers.on'), false);
});

test('?go= opens the same places as a home banner and strips the query', async () => {
  const item = environment({search: `?go=item&id=${ITEM}&c=${CAMPAIGN}`});
  item.run('pushOpenFromLink()');
  await settle();
  assert.deepEqual(item.opened, [ITEM]);
  assert.deepEqual(item.replaced, [[null, '', '/app/']]);
  const category = environment({search: `?go=category&id=${CATEGORY}`});
  category.run('pushOpenFromLink()');
  await settle();
  assert.equal(JSON.stringify(category.went), JSON.stringify([{screen: 'listing', extra: {categoryId: CATEGORY, subcategoryId: ''}}]));
  const offers = environment({search: '?go=offers'});
  offers.run('pushOpenFromLink()');
  await settle();
  assert.equal(offers.went[0].screen, 'offers');
  const menu = environment({search: '?go=menu'});
  menu.run('pushOpenFromLink()');
  await settle();
  assert.equal(menu.went[0].screen, 'menu');
});

test('an item or category that is gone, or cannot be ordered, opens the menu', async () => {
  for (const search of [`?go=item&id=${GONE}`, `?go=item&id=${CAMPAIGN}`, `?go=category&id=${GONE}`, '?go=item', '?go=category&id=']) {
    const e = environment({search});
    e.run('pushOpenFromLink()');
    await settle();
    assert.deepEqual(e.opened, [], search);
    assert.equal(e.went.length, 1, search);
    assert.equal(e.went[0].screen, 'menu', search);
  }
  const noOffers = environment({search: '?go=offers', noOffers: true});
  noOffers.run('pushOpenFromLink()');
  await settle();
  assert.equal(noOffers.went[0].screen, 'menu');
});

test('hostile links fall back to the menu and are never used as an address', async () => {
  for (const search of ['?go=https://evil.example', '?go=javascript:alert(1)', `?go=item&id=../x`, `?go=item&id=${ITEM}%27);alert(1)//`, '?go=', '?go=__proto__', '?go=track']) {
    const e = environment({search});
    e.run('pushOpenFromLink()');
    await settle();
    assert.deepEqual(e.opened, [], search);
    assert.deepEqual(e.went.map(x => x.screen), ['menu'], search);
    assert.deepEqual(e.replaced, [[null, '', '/app/']], search);
    assert.equal(e.calls.length, 0, search);
  }
});

test('the opened RPC is called once, with the device\'s proof, and only for a valid campaign id', async () => {
  const e = environment({search: `?go=menu&c=${CAMPAIGN.toUpperCase()}`});
  e.run('pushOpenFromLink()');
  await settle();
  await e.run(`pushOpenOffer({go: "menu", c: "${CAMPAIGN}"})`);
  e.workerEvents.message({data: {type: 'oracy-open-offer', go: 'offers', id: null, c: CAMPAIGN}});
  await settle();
  const opened = e.calls.filter(x => x.name === OPENED);
  assert.equal(opened.length, 1);
  assert.deepEqual({...opened[0].params}, {p_campaign_id: CAMPAIGN, p_endpoint: ENDPOINT, p_auth: AUTH});
  assert.equal(e.offers().length, 0);
  for (const c of ['', 'abc', '../x', `${CAMPAIGN}x`, `${CAMPAIGN}&p_on=true`]) {
    const bad = environment({search: `?go=menu&c=${encodeURIComponent(c)}`});
    bad.run('pushOpenFromLink()');
    await bad.run(`pushOpenOffer({go: "menu", c: {toString: () => "${CAMPAIGN}"}})`);
    await settle();
    assert.equal(bad.calls.length, 0, c);
  }
});

test('opened: no device subscription = no call; a failing call is never shown and never blocks', async () => {
  const none = environment({subscription: false, permission: 'default', search: `?go=item&id=${ITEM}&c=${CAMPAIGN}`});
  none.run('pushOpenFromLink()');
  await settle();
  assert.equal(none.calls.length, 0);
  assert.deepEqual(none.opened, [ITEM]);
  const failing = environment({search: `?go=item&id=${ITEM}&c=${CAMPAIGN}`, rpc: async () => { throw new Error('down'); }});
  failing.run('pushOpenFromLink()');
  await settle();
  assert.deepEqual(failing.opened, [ITEM]);
});

test('the order link and a plain visit behave as before', async () => {
  const order = environment({search: '?orders=1'});
  order.run('pushOpenFromLink()');
  await settle();
  assert.deepEqual(order.went.map(x => x.screen), ['track']);
  assert.equal(order.state.orderTab, 'active');
  assert.equal(order.calls.length, 0);
  const plain = environment({search: '?utm=1'});
  plain.run('pushOpenFromLink()');
  await settle();
  assert.equal(plain.went.length, 0);
  assert.equal(plain.replaced.length, 0);
});

test('messages from the service worker: an offer navigates, an order still opens Orders', async () => {
  const e = environment();
  e.workerEvents.message({data: {type: 'oracy-open-offer', go: 'item', id: ITEM, c: 'nope'}});
  await settle();
  assert.deepEqual(e.opened, [ITEM]);
  assert.equal(e.calls.length, 0);
  e.workerEvents.message({data: {type: 'oracy-open-orders'}});
  assert.equal(e.went.at(-1).screen, 'track');
  e.workerEvents.message({data: null});
  e.workerEvents.message({data: {type: 'something-else', go: 'item', id: ITEM}});
  await settle();
  assert.deepEqual(e.opened, [ITEM]);
});

test('"Stop offers": a signed-in customer lands on Account, a guest on Orders, otherwise a small sheet with the switch', async () => {
  const account = environment({loggedIn: true, document: true, search: '?offers=manage'});
  account.server.on = true;
  account.run('pushOpenFromLink()');
  await settle();
  assert.deepEqual(account.replaced, [[null, '', '/app/']]);
  assert.equal(account.went.at(-1).screen, 'account');
  assert.equal(checked(account.run('pushOffersMarkup("account")')), true);
  const guest = environment({document: true});
  guest.server.on = true;
  guest.workerEvents.message({data: {type: 'oracy-manage-offers'}});
  await settle();
  assert.equal(guest.went.at(-1).screen, 'track');
  assert.equal(guest.state.orderTab, 'active');
  // The fake page has no card on it, so the sheet carries the switch — already showing the server's "on".
  assert.equal(guest.inserted.length, 1);
  assert.ok(guest.inserted[0].includes('data-push-offers="sheet"') && hasSwitch(guest.inserted[0]) && checked(guest.inserted[0]));
  assert.ok(guest.inserted[0].includes('Close'));
  assert.ok(guest.offers().every(x => x.params.p_on === null));   // getting there changes nothing
});

/* ---- service worker ---- */
function worker(pages = []) {
  const handlers = {}, shown = [], windows = [];
  const self = {addEventListener: (name, fn) => { handlers[name] = fn; }, skipWaiting: () => {},
    registration: {scope: 'https://shop.example/app/', showNotification: async (title, options) => { shown.push({title, options}); }},
    clients: {claim: async () => {}, matchAll: async () => pages, openWindow: async url => { windows.push(url); }}};
  vm.runInContext(read('sw.js'), vm.createContext({self, URL, console}));
  const push = async (payload, raw) => {
    let work;
    handlers.push({data: payload === undefined && raw === undefined ? null
      : {json: () => (raw !== undefined ? JSON.parse(raw) : payload)}, waitUntil: p => { work = p; }});
    await work;
    return shown.at(-1);
  };
  const click = async (notification, action = '') => {
    let work, closed = 0;
    handlers.notificationclick({action, notification: {data: notification.options.data, close: () => { closed++; }}, waitUntil: p => { work = p; }});
    await work;
    assert.equal(closed, 1);
  };
  return {push, click, shown, windows};
}
const offer = extra => ({kind: 'offer', title: 'Grill House', body: 'Two for one tonight', tag: `offer-${CAMPAIGN}`, go: 'item', id: ITEM, c: CAMPAIGN, stop: 'Stop offers', ...extra});

test('sw: an offer shows with its own tag, no renotify and a "Stop offers" action', async () => {
  const w = worker();
  const n = await w.push(offer({stop: 'إيقاف العروض'}));
  assert.equal(n.title, 'Grill House');
  assert.equal(n.options.body, 'Two for one tonight');
  assert.equal(n.options.tag, `offer-${CAMPAIGN}`);
  assert.equal(n.options.renotify, false);
  assert.equal(JSON.stringify(n.options.actions), JSON.stringify([{action: 'stop', title: 'إيقاف العروض'}]));
  assert.equal(n.options.icon, 'assets/icons/icon-192.png');
  await w.click(n);
  assert.deepEqual(w.windows, [`https://shop.example/app/?go=item&id=${ITEM}&c=${CAMPAIGN}`]);
  await w.click(n, 'stop');
  assert.equal(w.windows[1], 'https://shop.example/app/?offers=manage');
});

test('sw: each target builds its own address', async () => {
  const cases = [[{go: 'menu', id: null}, `?go=menu&c=${CAMPAIGN}`], [{go: 'offers', id: ITEM}, `?go=offers&c=${CAMPAIGN}`],
    [{go: 'category', id: CATEGORY}, `?go=category&id=${CATEGORY}&c=${CAMPAIGN}`], [{go: 'item', id: ITEM, c: 'x'}, `?go=item&id=${ITEM}`]];
  for (const [extra, query] of cases) {
    const w = worker();
    await w.click(await w.push(offer(extra)));
    assert.deepEqual(w.windows, [`https://shop.example/app/${query}`]);
  }
});

test('sw: hostile offer payloads fall back to safe defaults and never choose the address', async () => {
  const hostile = [
    {go: 'https://evil.example', id: ITEM}, {go: 'item', id: '../x'}, {go: 'item', id: `${ITEM}&offers=manage`}, {go: ['item'], id: ITEM},
    {go: 'category', id: {toString: () => ITEM}}, {go: 'item', id: null}, {go: undefined, id: undefined}, {go: '//evil.example/', id: 'x'},
  ];
  for (const extra of hostile) {
    const w = worker();
    const n = await w.push(offer({...extra, url: 'https://evil.example/', tag: 'offer-<script>', c: 'javascript:alert(1)', stop: 'x'.repeat(200), title: 'T'.repeat(500), body: 'B'.repeat(900)}));
    assert.equal(n.options.tag, 'offer');
    assert.equal(n.options.actions[0].title.length, 30);
    assert.equal(n.title.length, 80);
    assert.equal(n.options.body.length, 300);
    assert.equal(JSON.stringify(n.options.data), JSON.stringify({kind: 'offer', go: 'menu', id: null, c: null}));
    await w.click(n);
    assert.deepEqual(w.windows, ['https://shop.example/app/?go=menu'], JSON.stringify(extra));
  }
});

test('sw: missing fields get neutral defaults', async () => {
  const w = worker();
  const n = await w.push({kind: 'offer'});
  assert.equal(n.title, 'Offer');
  assert.equal(n.options.body, '');
  assert.equal(n.options.tag, 'offer');
  assert.equal(n.options.actions[0].title, 'Stop offers');
  for (const stop of ['', '   ', 5, null]) assert.equal((await w.push(offer({stop}))).options.actions[0].title, 'Stop offers');
  await w.click(n);
  assert.deepEqual(w.windows, ['https://shop.example/app/?go=menu']);
});

test('sw: a message that is not JSON, empty, or not an object still shows an order notification', async () => {
  const w = worker();
  for (const n of [await w.push(undefined, 'not json {'), await w.push(), await w.push(null), await w.push('offer'), await w.push(7)]) {
    assert.equal(n.title, 'Order update');
    assert.equal(n.options.tag, 'order');
    assert.equal(n.options.actions, undefined);
    await w.click(n);
  }
  assert.ok(w.windows.every(url => url === 'https://shop.example/app/?orders=1'));
});

test('sw: an order message is exactly as before', async () => {
  const w = worker();
  const n = await w.push({title: 'Order MK-1001', body: 'Your order is ready', tag: 'order-abc', url: 'https://evil.example/', go: 'item', id: ITEM, c: CAMPAIGN, stop: 'x'});
  assert.equal(JSON.stringify(n), JSON.stringify({title: 'Order MK-1001', options: {body: 'Your order is ready', tag: 'order-abc', renotify: true,
    icon: 'assets/icons/icon-192.png', badge: 'assets/icons/badge-96.png', data: {url: './?orders=1'}}}));
  await w.click(n);
  await w.click(n, 'stop');   // an order has no such action: still Orders
  assert.deepEqual(w.windows, ['https://shop.example/app/?orders=1', 'https://shop.example/app/?orders=1']);
  // "kind" must be exactly "offer"
  assert.equal((await w.push({kind: 'OFFER', title: 'x'})).options.renotify, true);
});

test('sw: with the app already open it is focused and told where to go, no new window', async () => {
  const messages = []; let focused = 0;
  const page = {url: 'https://shop.example/app/?x=1', postMessage: m => messages.push(m), focus: async () => { focused++; }};
  const other = {url: 'https://other.example/app/', postMessage: () => { throw new Error('wrong page'); }, focus: async () => {}};
  const w = worker([other, page]);
  const n = await w.push(offer());
  await w.click(n);
  await w.click(n, 'stop');
  await w.click(await w.push({title: 'Order', body: '', tag: 'order-1'}));
  assert.equal(JSON.stringify(messages), JSON.stringify([{type: 'oracy-open-offer', go: 'item', id: ITEM, c: CAMPAIGN}, {type: 'oracy-manage-offers'}, {type: 'oracy-open-orders'}]));
  assert.equal(focused, 3);
  assert.deepEqual(w.windows, []);
});

test('the Account screen has the row for a signed-in customer only, and the changed files have new cache keys', () => {
  const app = read('js/app.js');
  const hook = '${typeof pushOffersMarkup === "function" ? pushOffersMarkup("account") : ""}';
  assert.equal(app.split(hook).length, 2);
  assert.ok(app.indexOf(hook) > app.indexOf('function signedInAccount()') && app.indexOf(hook) < app.indexOf('function account()'));
  const html = read('index.html');
  for (const file of ['css/order-addons.css', 'js/app.js', 'js/push.js']) assert.ok(html.includes(`${file}?v=20261004-pc1"`), file);
  const push = read('js/push.js');
  assert.equal(push.split('p_on: true').length, 1);            // nothing agrees with a fixed "true"
  assert.equal(push.split('pushOffersSet(').length, 3);        // the function and the switch's own handler
  assert.equal(/localStorage[^\n]*offer/i.test(push), false);  // the agreement is never kept on the device
});
