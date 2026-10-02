const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');

function env(lang = 'en') {
  const c = vm.createContext({state: {lang, orderType: 'delivery', screen: 'home'}, MENU_CONFIG: {timeZone: 'Asia/Riyadh'},
    escapeHtml: s => String(s), Intl, Date, Math, Number, String, setTimeout: () => 0, clearTimeout: () => {}});
  vm.runInContext(fs.readFileSync(path.join(root, 'js/ordering-hours.js'), 'utf8'), c);
  return code => vm.runInContext(code, c);
}
const iso = ms => new Date(Date.now() + ms).toISOString();
const status = o => `orderingHours.status=${JSON.stringify({version: 1, now: new Date().toISOString(), timezone: 'Asia/Riyadh', week: [], ...o})}`;
const H = 3600000;

test('no answer or hours switched off: everything is open', () => {
  const run = env();
  assert.equal(run('restaurantAcceptingOrders()'), true);
  run(status({dinein: {open: true, enforced: false}, takeaway: {open: true, enforced: false}, delivery: {open: true, enforced: false}}));
  assert.equal(run('orderTypeOpen("delivery")'), true);
  assert.equal(run('orderingNoticeMarkup("delivery")'), '');
  assert.equal(run('orderingStripMarkup()'), '');
});

test('delivery past its limit while dine-in is open: notice names the type and the open alternative', () => {
  const run = env();
  run(status({dinein: {open: true, enforced: true, until: iso(H)}, takeaway: {open: false, enforced: true, reason: 'cutoff', opens_at: iso(12 * H)},
    delivery: {open: false, enforced: true, reason: 'cutoff', opens_at: iso(12 * H)}}));
  assert.equal(run('orderTypeOpen("delivery")'), false);
  assert.equal(run('orderTypeOpen("dinein")'), true);
  assert.equal(run('restaurantAcceptingOrders()'), true);
  assert.match(run('orderingClosedTitle("delivery")'), /Delivery has closed for now/);
  assert.match(run('restaurantClosedMessage("delivery")'), /Your cart is saved\..*when we open (today|tomorrow) at .*Dine-in is still open now\./);
  assert.equal(run('orderingStripMarkup()'), '');
});

test('closed: strip on Home, cart saved message; Arabic too', () => {
  const closed = {open: false, enforced: true, reason: 'closed', opens_at: iso(2 * H)};
  const run = env();
  run(status({dinein: closed, takeaway: closed, delivery: closed}));
  assert.equal(run('restaurantAcceptingOrders()'), false);
  assert.match(run('orderingStripMarkup()'), /Closed now.*Opens (today|tomorrow) at/s);
  assert.match(run('orderingNoticeMarkup("dinein")'), /Restaurant is currently closed.*Your cart is saved/s);
  const ar = env('ar');
  ar(status({dinein: closed, takeaway: closed, delivery: closed}));
  assert.match(ar('restaurantClosedMessage("dinein")'), /سلتك محفوظة/);
});

test('pause shows the reason once, tidy punctuation', () => {
  const run = env();
  run(status({dinein: {open: true, enforced: true}, takeaway: {open: true, enforced: true},
    delivery: {open: false, enforced: true, reason: 'paused', pause_reason: 'No rider available.'}}));
  assert.match(run('orderingClosedTitle("delivery")'), /Delivery is paused right now/);
  assert.match(run('restaurantClosedMessage("delivery")'), /^No rider available\. Your cart is saved\./);
});

test('a limit that passed since the last answer closes the type without waiting for the server', () => {
  const run = env();
  run(status({dinein: {open: true, enforced: true, until: iso(H)}, takeaway: {open: true, enforced: true, until: iso(H)},
    delivery: {open: true, enforced: true, until: iso(-1000), opens_at: iso(12 * H)}}));
  assert.equal(run('orderTypeOpen("delivery")'), false);
  assert.equal(run('orderingState("delivery").reason'), 'cutoff');
});

test('"for later" choices after the limit are not offered', () => {
  const run = env();
  run(status({dinein: {open: true, enforced: true}, takeaway: {open: true, enforced: true, until: iso(50 * 60000)}, delivery: {open: true, enforced: true}}));
  assert.deepEqual(JSON.parse(run('JSON.stringify(orderingLimitTimingOptions([["asap","asap"],["30","a"],["45","b"],["60","c"]],"takeaway"))')),
    [['asap', 'asap'], ['30', 'a'], ['45', 'b']]);
  assert.equal(run('orderingLimitTimingOptions([["asap","asap"],["60","c"]],"dinein").length'), 2);
});

test('server refusals about hours are recognised; others are not', () => {
  const run = env();
  run('loadOrderingHours=()=>Promise.resolve()');
  assert.equal(run('orderingRefusal("The restaurant is closed now. We open today at 12:00 PM. Your cart is saved.")'), true);
  assert.equal(run('orderingRefusal("Delivery orders are paused right now. Please try again later.")'), true);
  assert.equal(run('orderingRefusal("This code cannot be used")'), false);
});

test('app wiring: old fixed window is gone, script order is right', () => {
  const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(!/RESTAURANT_ORDER_WINDOW|12:00 PM to 1:00 AM/.test(app));
  assert.ok(html.indexOf('js/data.js') < html.indexOf('js/ordering-hours.js') && html.indexOf('js/ordering-hours.js') < html.indexOf('js/app.js'));
  assert.match(app, /orderingNoticeMarkup\(\)/);
  assert.match(app, /orderingRefusal\(rawMessage\)/);
});
