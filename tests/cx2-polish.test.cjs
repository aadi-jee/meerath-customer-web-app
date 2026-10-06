const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const css = read('css/theme.css'), app = read('js/app.js'), theme = read('js/theme.js');

test('changed files have new cache keys', () => {
  const html = read('index.html');
  for (const file of ['css/theme.css', 'js/theme.js', 'js/app.js', 'js/recommendations.js', 'js/content.js']) assert.ok(html.includes(`${file}?v=20261006-cx2b"`), file);
});

test('the sheen is on main buttons, the selected order type and recommended adds; never on menu lists', () => {
  const part = css.slice(css.indexOf('7. Sheen sweep'), css.indexOf('Cart button with something in it'));
  assert.ok(part.includes('.cx-cta-bar > .btn-primary'));
  assert.ok(part.includes('.splash > .btn-primary'));
  assert.ok(part.includes('.home-order-toggle button.on') && part.includes('.checkout-order-types button.active'));
  assert.ok(part.includes('animation: cx-sheen 3.8s linear infinite'));   // continuous, no pause
  for (const listThing of ['.item', '.special-card', '.cat', '.add', '.badge']) {
    assert.equal(new RegExp(`(^|[\\s,>])\\${listThing}(?![\\w-])`, 'm').test(part), false, listThing);
  }
  assert.ok(part.includes(':not(:disabled)::after'));          // a disabled button does not shine
  assert.ok(part.includes('cx-sheen-rtl'));                    // Arabic runs the other way
});

test('every animation stands still when the phone asks for reduced motion', () => {
  const names = [...css.matchAll(/@keyframes ([\w-]+)/g)].map(m => m[1]);
  assert.deepEqual(names.sort(), ['cx-border-beam', 'cx-bump', 'cx-glow', 'cx-logo-in', 'cx-pulse', 'cx-rise-in', 'cx-sheen', 'cx-sheen-rtl', 'cx-skel', 'cx-text-shimmer']);
  const reduce = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
  for (const sel of ['.cx-cta-bar > .btn-primary::after', '.account-rewards-card::after', '.cx-skel', '.cx-bump',
    '.home-order-toggle button.on::after', '.pairing-card > .btn.pairing-add', '.cart-icon-btn.has-items::before',
    '.cx-text-shimmer', '.splash > .splash-brand-logo', '#app img']) assert.ok(reduce.includes(sel), sel);
  // only transform, opacity and one short-lived background move: nothing that re-lays-out the page
  for (const frame of css.matchAll(/@keyframes [\w-]+ \{([\s\S]*?)\n\}/g)) {
    assert.equal(/(width|height|top|left|margin|padding)\s*:/.test(frame[1]), false);
  }
});

test('an item or category without a photo shows a placeholder icon the size of the photo, never the logo', () => {
  assert.ok(app.includes('function hasOwnPhoto(row)'));
  assert.equal(app.includes('"no-photo"'), false);
  assert.equal(app.includes('cx-no-photo'), false);              // every card keeps the same shape
  // the helper + specials + home and menu categories + category list + item screen + cart
  assert.equal(app.split('photoPlaceholder(').length - 1, 7);
  for (const file of ['js/recommendations.js', 'js/content.js']) assert.ok(read(file).includes('!hasOwnPhoto(i) ? photoPlaceholder('), file);
  assert.equal(/photoPlaceholder\([^)]*\$\{/.test(app), false);   // the icon takes no data from the menu
});

test('placeholders show only during the first menu load', () => {
  assert.ok(app.includes('menuConnection.status === "loading" && !CATEGORIES.length'));
  assert.equal(app.split('menuFirstLoad() ? skeletonTiles(').length - 1, 3);
});

test('prices use the text colour; gold is kept for offers, badges and rewards', () => {
  const roles = css.slice(css.indexOf('6. Colour roles'), css.indexOf('7. Passing light'));
  assert.ok(/\.price,[\s\S]*?color: var\(--text\)/.test(roles));
  assert.ok(roles.includes('.price del ~ span { color: var(--cx-reward); }'));
  assert.ok(roles.includes('.badge'));
  assert.ok(roles.includes('.account-rewards-card'));
});

test('theme.js stays presentation only', () => {
  for (const banned of ['fetch(', 'localStorage', 'sessionStorage', 'state.', 'innerHTML', 'supabase'])
    assert.equal(theme.includes(banned), false, banned);
  assert.ok(theme.includes('cx-img-wait') && theme.includes('cx-bump'));
});

test('the cart button never changes size; its light is a border beam and a glow', () => {
  const part = css.slice(css.indexOf('Cart button with something in it'), css.indexOf('Text shimmer'));
  assert.ok(part.includes('.cart-icon-btn.has-items::before') && part.includes('conic-gradient'));
  assert.equal(/\.cart-icon-btn\.has-items[^{]*\{[^}]*transform/.test(part), false);
});

test('the frozen action bar sits 8px above the bottom bar', () => {
  assert.ok(css.includes('bottom: calc(-1 * var(--cx-pad-b, 28px));'));
  assert.ok(theme.includes('"--cx-pad-b"'));
});

test('light theme: the points card and the chosen spice level follow the theme', () => {
  const part = css.slice(css.indexOf('12. Light theme'), css.indexOf('13. Reduce motion'));
  assert.ok(part.includes('.points') && part.includes('var(--card)'));
  assert.ok(part.includes('.spice button.on'));
  assert.ok(part.includes('input[type="checkbox"]:disabled:checked'));
});
