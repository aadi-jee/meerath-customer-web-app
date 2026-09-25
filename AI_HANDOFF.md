# meerath-kabab — AI handoff

## Current Codex handoff — 25 September 2026

This section is the authoritative current state. The 18 September baseline is
retained below for audit history, but its statements about demo authentication,
Git state and test counts are superseded here.

### Scope and working rules

`meerath-kabab` is the dedicated Customer App: plain HTML, CSS and JavaScript,
with no framework or build step. Customer frontend work in this repository must
not silently change Admin, POS, KDS, shared documentation or the live Supabase
project. Backend requirements listed below belong to the Platform/Claude task and
must go through its migration review, backup and verification gates.

The app remains one build per brand. `js/brand-config.js` is the controlled
Meerath configuration under rulings H1 and M4. Backend RPCs must remain reusable
and tenant-parameterised even though this build is Meerath-specific.

### Current Git and verification state

Branch: `main`

Recent deployed commits:

- `43535bc` — Fix OTP API key fallback and checkout closed notice
- `6b010fe` — Save carts across sessions and enforce ordering hours
- `fa74021` — Improve customer mobile layout and in-place UI interactions
- `6840697` — Restore account order SQL files

Working-tree facts at handoff creation:

- `tests/content.test.cjs` is modified but not yet committed. It fixes a
  date/time-dependent recommendation schedule test by using a fixed Riyadh-open
  clock.
- `AI_HANDOFF.md` and `PHASE-3-INSTALL.md` are untracked. Do not accidentally
  stage `PHASE-3-INSTALL.md`; it was pre-existing owner material.

Owner Cursor verification on 25 September 2026:

- `node --test tests/content.test.cjs`: **13/13 passed**.
- `node --test tests/*.test.cjs`: **136 total, 135 passed, 1 failed**.
- The only failure is the static SQL assertion looking for
  `supabase/60_customer_saved_addresses.sql`. The canonical workspace copy exists
  in `../Supabase data/60_customer_saved_addresses.sql`, but the Customer repo
  copy is absent. Do not copy, edit or execute that migration merely to make the
  frontend test green. Resolve ownership and migration history in the
  Platform/Claude task.

### Customer frontend work completed

Mobile/home presentation:

- Home banners were reduced in height, text was tightened for mobile, and the
  banner button was made slightly translucent.
- The visible Pause/Play words below the slider were removed; the compact icon
  control remains.
- Event & Catering was moved below Today's Special and Categories.
- Customer-facing `Takeaway` wording is displayed as `Pick-up`; internal order
  type compatibility remains `takeaway`.
- The catering `Request a Quote` action is colourful and prominent without
  using bold styling.

Interaction stability:

- Variant, option and add-on taps keep the item detail DOM in place instead of
  replacing the full screen.
- Checkout Delivery/Pick-up/Dine-in tabs update in place.
- Coupon apply, cart quantity plus/minus and menu subcategory changes update only
  the affected region, avoiding visible screen flashes and scroll loss.
- Cart editing preserves the selected choices, quantity and spice level.

Cart, hours and checkout:

- Cart drafts persist per brand/branch in the same browser/device and are
  restored using current menu prices and current availability. Personal details
  are not stored in the cart draft.
- Customers may browse and add to cart while closed. The closed notice is shown
  only at final checkout, and Place Order is disabled there.
- The current frontend order window is still a temporary fixed Riyadh schedule:
  12:00 PM through 1:00 AM. It is not yet POS-controlled.
- `APP_CONFIG.operations.testingAlwaysOpen` remains `true` for deployed test
  behaviour affecting schedule checks; Platform must explicitly review this
  before production.

Authentication/account:

- Saudi phone normalization, Supabase phone OTP request/verify, tenant-scoped
  profile loading and trusted-device session restoration are implemented.
- A returning customer on the same device can continue without another OTP while
  the stored refresh session remains valid. Logout, app/browser data clearing,
  reinstall, revocation or a new device requires OTP again.
- The OTP request now supplies the publishable key as both the `apikey` header
  and URL fallback. This fixed the browser's earlier `No API key found` request.
- The subsequent live error was correctly diagnosed as Supabase Auth
  `Unable to get SMS provider`. The configured fixed test OTP had expired on
  21 September. Saving a new expiry attempted to validate empty Twilio provider
  credentials. No dummy credentials were added and no real SMS provider is
  configured yet.
- Real SMS delivery is intentionally deferred. Current product decision:
  preferred branded Sender ID `MEERATH`; message template
  `Your Meerath Kabab verification code is {{code}}.` Provider and Saudi sender
  registration will be completed near launch.

### Current modifier behaviour — do not misread as complete

The current menu contract supplies one base price plus choice rows whose prices
are treated as additive amounts. `normalizeItemChoices()` adds the selected
Variant, Option and Add-on prices to the base item price. Cart and checkout
therefore receive the additive total correctly for that existing contract.

This does **not** meet the intended Karahi behaviour. Example intended product
behaviour: Half is the lower default final price (SAR 45); selecting 1 KG changes
the highlighted item price to the final 1 KG price (SAR 75), rather than adding
SAR 75 to SAR 45. The detail screen also does not yet show a live highlighted
total while variants/add-ons are selected.

Do not patch only the Customer UI. Platform must first define and enforce a
modifier pricing contract that distinguishes replacement-price variants from
additive options/add-ons, returns that meaning through the menu RPC, and validates
the same price authoritatively when the order is created. Admin must publish the
same semantics. After that contract is approved, Customer frontend should:

1. Select the lowest/default enabled variant on entry.
2. Replace the base price for replacement variants.
3. Add selected options and add-ons to that selected variant price.
4. Update the highlighted price immediately without a full render.
5. Submit stable choice IDs and let the server calculate/validate the total.

This rule applies to every configurable item, not only Karahi.

### Platform/Claude requirements before further Customer integration

1. **Variant/option pricing contract** — replacement versus additive semantics
   across Admin, public menu RPC and authoritative order creation.
2. **Rewards** — real tenant-scoped points/ledger, earn/redeem rules, expiry,
   reversals and RPCs. Current Customer rewards values/UI are placeholders.
3. **Add more to an accepted order** — Delivery and Pick-up get a 10-minute
   request window while preparing; Dine-in remains open until the dining order is
   closed. Staff confirmation is required. The agreed Customer concept includes a
   clean draggable/snap-to-edge floating countdown control and tracking-screen
   copy, but no frontend should be built until order/event/idempotency rules exist.
4. **POS-controlled online availability** — ordering requires staff-enabled
   online status, current POS heartbeat/readiness and business hours. The Home
   screen remains browsable; only checkout blocks ordering. Define safe behaviour
   when POS connectivity is stale.
5. **Push notifications** — device registration, consent, tenant/user/device
   ownership, token rotation and event delivery for order status, add-more
   decisions and relevant offers.
6. **Real OTP provider** — Saudi-compliant sender registration for `MEERATH`, SMS
   rate limits, CAPTCHA/anti-pumping controls and production Auth configuration.
   Never place provider secrets in Customer JavaScript.
7. **Order timing policy** — replace generic hardcoded timing choices with a
   branch/POS-backed ASAP and scheduled-order policy constrained by opening hours,
   capacity and lead time.
8. **Saved-address migration history** — reconcile the canonical migrations 60/61
   with the Customer repo history and the live applied schema; do not execute SQL
   solely because a repository test expects a file.

### Customer work after Platform contracts land

- Implement live selected variant/add-on total and final-price variants.
- Connect real rewards screens to the approved rewards RPCs.
- Build the add-more countdown/request UI against the approved order API.
- Register and manage push tokens/permission UX in the eventual native app.
- Replace the temporary fixed order window with the POS/branch availability
  contract and implement the approved scheduled-order picker.
- Run desktop and mobile smoke tests plus the full Node suite after each small
  integration task.

### Handoff cautions

- Public/publishable Supabase and Maps browser keys in frontend config are not
  server secrets, but provider credentials and service-role keys must never enter
  this repository.
- Do not describe local mock tests as live database or production verification.
- Do not change the current variant math in only one client; that would make the
  visible price disagree with Admin/order totals.
- Do not show a global `We are closed` message on Home. Browsing and cart building
  remain available; checkout is the enforcement point.
- Website alignment is a separate future task. Share approved backend content
  contracts, not Customer App frontend code wholesale.

## Historical baseline — 18 September 2026

**As at 18 September 2026.** The customer ordering app. Plain HTML, CSS and JavaScript — no framework, no build step.

Read `../CLAUDE.md` and `../AI_WORKFLOW.md` first. `PHASE-3-INSTALL.md` and `UPDATE-NOTES.md` in this folder record what recent releases actually contained and what was left unverified; both are worth reading before changing anything.

---

## Run and test

Served by a local static server — Live Server on port 5500 is what has been used. After changes, hard-refresh with `Ctrl+Shift+R`; this app has no build step, so a stale cache looks exactly like a broken change.

```powershell
node --test tests/*.test.cjs
```

The tests use **simulated API responses, not the live database**. Passing them says the client logic holds together; it says nothing about access control. `PHASE-3-INSTALL.md` lists eight live acceptance checks that have to be done by hand, and the cross-account one matters most: sign in as a different test account and confirm the first account's orders do **not** appear.

## Structure

`index.html` at the root; `js/` holds the application. The files that carry the most behaviour are `app.js` (the bulk of it), `auth.js`, `data.js`, `customer-updates.js`, `account-orders.js`, `account-addresses.js`, `delivery-location.js`, `content.js`, `i18n.js` and `brand-config.js`. `supabase/` keeps migration SQL as history. `tests/` holds the `.cjs` node tests.

`.gitignore` covers `.env`, `.env.*`, `node_modules/` and logs.

## Per-brand configuration — ruling H1

`js/brand-config.js` is the per-brand configuration file. Under rulings **H1** and **M4** the customer app is a **per-brand build**: each brand gets its own build, and publishing that config is a deliberate manual step for now. Automated publishing from Super Admin is a later enhancement, not something to improvise.

This matters when Phase B changes function signatures — updating this app is a controlled manual step per brand, not a single deploy.

## Audit findings specific to this app

**VAT is hardcoded.** `js/app.js` line 1: `const VAT = 0.15;`. Correct for Saudi Arabia, wrong for a platform meant to run anywhere. The `i18n.js` tax strings become data rather than constants in Phase E.

**Anonymous reads are where the tenant exposure lives.** This app is the main anonymous caller, so scope task **B6** — the public-read redesign — decides its shape. The preferred design is tenant-parameterised public RPCs with narrowly defined outputs, active-tenant checks, and **no anonymous tenant-roster endpoint**.

The distinction to hold onto: a storefront naming its own restaurant is an *input*, not a credential. A design that lets a caller name a tenant and also walk the list of tenants has not closed the finding.

**Order numbers.** `customer_orders` enforces `(restaurant_id, order_number)` uniqueness. Combined with the `lpad` truncation defect, counters 10000–10009 all generate `MK-1000`, and the unique index turns that into a **failed insert** — the customer cannot place an order at all. On `pos_orders` the same collision is silently accepted, because the display number lives in `payload` rather than in a column.

**Demo authentication.** `UPDATE-NOTES.md` states it directly: customer authentication is still the demo implementation, and the fixed OTP is for the configured test number only. It must be removed before production. Do not treat it as secure authentication or build anything on top of it that assumes it is.

## Checkpoint state

**No checkpoint commit was made here** — Stage 4 covered POS and Admin only, and committing this repo was not authorised.

At the checkpoint this repo was on `main`, clean apart from one untracked file, `PHASE-3-INSTALL.md`, which was left exactly as found. It is covered by the verified filesystem backup of 17 September 2026 like everything else in the workspace.
