const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const css = read('css/theme.css'), app = read('js/app.js'), theme = read('js/theme.js');

test('changed files have new cache keys', () => {
  const html = read('index.html');
  for (const file of ['css/theme.css', 'js/theme.js', 'js/app.js']) assert.ok(html.includes(`${file}?v=20261006-cx2"`), file);
});

test('the passing light is on the main button only, never on list items', () => {
  const part = css.slice(css.indexOf('7. Passing light'), css.indexOf('8. Touch feedback'));
  assert.ok(part.includes('.cx-cta-bar > .btn-primary'));
  assert.ok(part.includes('.splash > .btn-primary'));
  for (const listThing of ['.item', '.special-card', '.cat', '.add', '.badge']) {
    assert.equal(new RegExp(`(^|[\\s,>])\\${listThing}(?![\\w-])`, 'm').test(part), false, listThing);
  }
  assert.ok(part.includes(':not(:disabled)::after'));          // a disabled button does not shine
  assert.ok(part.includes('cx-sheen-rtl'));                    // Arabic runs the other way
});

test('every animation stands still when the phone asks for reduced motion', () => {
  const names = [...css.matchAll(/@keyframes ([\w-]+)/g)].map(m => m[1]);
  assert.deepEqual(names.sort(), ['cx-bump', 'cx-logo-in', 'cx-rise-in', 'cx-sheen', 'cx-sheen-rtl', 'cx-skel']);
  const reduce = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
  for (const sel of ['.cx-cta-bar > .btn-primary::after', '.account-rewards-card::after', '.cx-skel', '.cx-bump',
    '.splash > .splash-brand-logo', '#app img']) assert.ok(reduce.includes(sel), sel);
  // only transform, opacity and one short-lived background move: nothing that re-lays-out the page
  for (const frame of css.matchAll(/@keyframes [\w-]+ \{([\s\S]*?)\n\}/g)) {
    assert.equal(/(width|height|top|left|margin|padding)\s*:/.test(frame[1]), false);
  }
});

test('an item or category without a photo shows a tile, never the logo', () => {
  assert.ok(app.includes('function hasOwnPhoto(row)'));
  assert.equal(app.includes('"no-photo"'), false);
  assert.equal(app.split('monogramTile(').length - 1, 5);        // the helper + specials + home and menu categories + cart
  assert.ok(app.includes('${hasOwnPhoto(i) ? "" : "cx-no-photo"}'));
  assert.ok(app.includes('escapeHtml(Array.from(name)[0] || "")'));   // the letter is escaped
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
