/* Batch 3a (394): the cart is priced by the server (API-3A-CONTRACT.md, sections 2, 3 and 8).
 *
 *  - oracy_price_quote_v1 answers the lines, the promotions that are applied, the reasons for
 *    the ones that are not, the voucher, the points, the delivery fee and the total. Whenever it
 *    has answered for the cart as it stands, ITS numbers are the ones on the screen.
 *  - The app's own sum (totals() in app.js) stays as the first, instant display while an answer
 *    is on its way, and as the whole display on a database without 394 or without a connection.
 *  - An order on a 394 database always carries the quote_key of the price the customer saw.
 *    No answer -> no order. A database without the function (404 / PGRST202 / 42883) is an old
 *    database for the rest of this visit: the cart and the order then work exactly as before,
 *    with the old order functions. The two are never mixed.
 *
 * Nothing here adds the cart up: every amount shown from a quote is the server's own. */
const CART_QUOTE_FN = "oracy_price_quote_v1";
const CART_QUOTE_DEBOUNCE_MS = 400;     // contract: 300-500 ms after the last change
const CART_QUOTE_TIMEOUT_MS = 9000;
const CART_QUOTE_FRESH_MS = 90000;      // only for an answer without valid_seconds (C1): then an open cart asks again after this
const CART_QUOTE_ORDER_MS = 45000;      // Place Order takes the answer on screen only when it is younger than this
const CART_QUOTE_RETRY_MS = [5000, 15000];
const CART_QUOTE_KEY = /^[0-9a-f]{32}$/;
const cartQuote = {
  support: "unknown",   // "unknown" until the first answer | "yes" (394) | "no" (old database, this visit)
  quote: null,          // the last answer taken
  key: "",              // the cart (fingerprint) that answer is for
  at: 0,
  status: "idle",       // idle | updating | fresh | failed
  stale: false,         // the answer is shown but must be asked again before an order
  flight: "",           // the fingerprint being asked now
  request: 0,           // answers of an older request are dropped
  timer: null, abort: null, retryTimer: null, retries: 0,
  error: "", refusal: false,
  trust: true,          // the app's own sum equalled the last answer: it may be shown while the next one is on its way
  raw: false,           // true while the app's own sum is being read (stops the loop totals -> quote -> totals)
  code: "",             // the code that is sent with the cart
  codeNote: null,       // {code, reason, kept, missing}: why the typed code is not applied
  codeBusy: false, codeTyped: false,
  shownTotal: null, shownQuote: null,   // what the summary last showed (Place Order compares the answer with it)
  confirmedKey: "",     // the customer said yes to this price in the "price has changed" sheet
  changed: null,        // the open "price has changed" sheet
  profileTried: "",
  validTimer: null,     // C1: asks again when the answer's valid_seconds run out (a happy hour starts or ends)
};
/** How long the answer on screen is good for: the server's valid_seconds (C1), else 90 s. */
function cartQuoteLife(quote) {
  // never under 5 s: a broken answer (0) cannot make a question on every draw
  return quote && Number.isInteger(quote.valid_seconds) ? Math.max(5, quote.valid_seconds) * 1000 : CART_QUOTE_FRESH_MS;
}
function cartQuoteCopy(en, ar) { return typeof state !== "undefined" && state.lang === "ar" ? ar : en; }
const CART_QUOTE_FAIL = () => cartQuoteCopy("We could not confirm the price. Check your connection and try again.",
  "تعذر تأكيد السعر. تحقق من اتصالك وحاول مرة أخرى.");
function cartQuoteMoney(value) {
  return typeof money === "function" ? money(Number(value) || 0) : (Number(value) || 0).toFixed(2);
}
function cartQuoteNumber(value, fallback = 0) {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}
function cartQuoteWord(value, max) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, " ").trim().slice(0, max) : "";
}
function cartQuoteOn() { return cartQuote.support === "yes"; }

// ---------- what is asked ----------
/** The lines exactly as the order will carry them (app.js builds the same lines for the order). */
function cartQuoteItems(cart) {
  return (cart || []).map(line => {
    const item = itemById(line.id);
    return {menu_item_id: line.id, quantity: line.qty,
      choices: selectedChoices(item, line).map(choice => ({name: choice.name, type: choice.type, ...(choice.rowId ? {id: choice.rowId} : {})}))};
  });
}
/** A cart is priced when there is one, the menu is known, and it is a new order (not items added to an order). */
function cartQuoteWanted() {
  if (typeof state === "undefined" || !Array.isArray(state.cart) || !state.cart.length) return false;
  if (typeof addonTarget === "function" && addonTarget()) return false;   // add-ons use the functions of before (contract, section 10)
  if (state.cart.length > 40) return false;
  return state.cart.every(line => line && typeof itemById === "function" && itemById(line.id) && Number.isSafeInteger(line.qty) && line.qty > 0);
}
function cartQuoteAddress() {
  if (state.orderType !== "delivery" || !state.isLoggedIn || typeof selectedDeliveryAddress !== "function") return null;
  const address = selectedDeliveryAddress();
  if (!address || (typeof validDeliveryPin === "function" && !validDeliveryPin(address))) return null;
  // the address the customer has seen on the checkout (the same rule as the delivery fee of before)
  return state.checkoutPinConfirmedId === address.id && state.checkoutPinConfirmedVersion === address.updatedAt ? address : null;
}
/** {p_restaurant_id, p_branch_id, p_cart} for the cart as it stands, or null. */
function cartQuoteParams() {
  if (!cartQuoteWanted()) return null;
  const table = typeof tableOn === "function" ? tableOn() : null;
  const guest = typeof tableGuestOn === "function" && tableGuestOn();
  const cart = {items: cartQuoteItems(state.cart)};
  if (!guest) {   // a guest at a table has no code and no points (contract, rule 9)
    if (cartQuote.code) {
      cart.code = cartQuote.code;
      const phone = state.isLoggedIn ? state.customerPhone || state.customer.mobile || "" : state.customer.mobile || "";
      if (phone) cart.customer_phone = phone;   // only used by the vouchers of before, as today
    }
    if (state.isLoggedIn && Number(state.redeemPoints) > 0) cart.redeem_points = Number(state.redeemPoints);
  }
  if (table && table.key) {
    // The sticker names the restaurant, the branch and "dine-in"; the channel is the table's QR.
    cart.table_key = table.key;
    return {p_restaurant_id: null, p_branch_id: null, p_cart: cart};
  }
  let branchId = null;
  try { branchId = selectMenuBranch(menuConnection.payload?.branches || []); } catch (_) { return null; }
  if (!branchId) return null;
  cart.order_type = state.orderType;
  const address = cartQuoteAddress();
  if (address) cart.delivery_address_id = address.id;
  return {p_restaurant_id: MENU_CONFIG.restaurantId, p_branch_id: branchId, p_cart: cart};
}
function cartQuoteFingerprint() {
  const params = cartQuoteParams();
  if (!params) return "";
  const address = cartQuoteAddress();
  return JSON.stringify([state.isLoggedIn ? state.authUserId || "in" : "", params, address ? address.updatedAt : ""]);
}

// ---------- the answer ----------
function cartQuotePromotion(row) {
  if (!row || typeof row !== "object") return null;
  const level = ["item", "order", "delivery"].includes(row.level) ? row.level : "order";
  return {promotion_id: cartQuoteWord(row.promotion_id, 60), name_en: cartQuoteWord(row.name_en, 80), name_ar: cartQuoteWord(row.name_ar, 80),
    text_en: cartQuoteWord(row.text_en, 220), text_ar: cartQuoteWord(row.text_ar, 220),
    kind: cartQuoteWord(row.kind, 30), value: cartQuoteNumber(row.value), max_discount: row.max_discount == null ? null : cartQuoteNumber(row.max_discount, null),
    level, amount: Math.max(0, cartQuoteNumber(row.amount)), ...promoLicence(row)};
}
/* Licence round (9 Oct, L2): a promotion may carry its licence number and a link to the licence. The keys are
 * absent when empty; the app shows them only when they are filled AND well-formed. The link is shown only when it
 * is https with the contract's characters (no other scheme, no space, quote or <>), at most 300 characters. */
const PROMO_LICENCE_LINK = /^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?(?:\/[A-Za-z0-9._~:\/@!$&()*+,;=%-]*)?(?:\?[A-Za-z0-9._~:\/@!$&()*+,;=%-]*)?$/;
function promoLicence(row) {
  const out = {};
  const number = row && typeof row.licence_number === "string" ? row.licence_number.trim() : "";
  if (number && number.length <= 60 && !/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/.test(number)) out.licence_number = number;
  const link = row && typeof row.licence_link === "string" ? row.licence_link.trim() : "";
  if (link && link.length <= 300 && PROMO_LICENCE_LINK.test(link)) out.licence_link = link;
  return out;
}
/** "Licence no. MC-2026-0042 · Verify" (escaped), or "" when the promotion carries neither. */
function promoLicenceMarkup(p) {
  const licence = promoLicence(p);
  if (!licence.licence_number && !licence.licence_link) return "";
  const number = licence.licence_number
    ? `<span>${cartQuoteCopy("Licence no.", "رقم الترخيص")} <bdi dir="ltr">${escapeHtml(licence.licence_number)}</bdi></span>` : "";
  const link = licence.licence_link
    ? `<a href="${escapeHtml(licence.licence_link)}" target="_blank" rel="noopener noreferrer">${licence.licence_number ? cartQuoteCopy("Verify", "تحقق") : cartQuoteCopy("Verify the licence", "تحقق من الترخيص")}</a>` : "";
  return `<p class="pq-licence">${number}${number && link ? " · " : ""}${link}</p>`;
}
/** The answer, checked. Anything that is not the contract's shape is no answer (and so no order). */
function cartQuoteClean(answer, lineCount) {
  if (!answer || typeof answer !== "object" || answer.ok !== true) return null;
  if (typeof answer.quote_key !== "string" || !CART_QUOTE_KEY.test(answer.quote_key)) return null;
  const total = cartQuoteNumber(answer.total, NaN), itemsTotal = cartQuoteNumber(answer.items_total, NaN);
  if (!(total >= 0) || !(itemsTotal >= 0) || !Array.isArray(answer.lines) || answer.lines.length !== lineCount) return null;
  const lines = [];
  for (const row of answer.lines) {
    const lineTotal = cartQuoteNumber(row?.line_total, NaN), net = cartQuoteNumber(row?.net_total, NaN);
    if (!(lineTotal >= 0) || !(net >= 0)) return null;
    lines.push({unit_price: cartQuoteNumber(row.unit_price), line_total: lineTotal, net_total: net, name: cartQuoteWord(row.name, 120),
      menu_item_id: cartQuoteWord(row.menu_item_id, 60), item_offer: row.item_offer === true,
      reductions: (Array.isArray(row.reductions) ? row.reductions : []).map(r => ({promotion_id: cartQuoteWord(r?.promotion_id, 60), amount: Math.max(0, cartQuoteNumber(r?.amount))})).filter(r => r.amount > 0)});
  }
  const delivery = answer.delivery && typeof answer.delivery === "object" ? {
    known: answer.delivery.known === true, eligible: answer.delivery.eligible === true,
    reason: cartQuoteWord(answer.delivery.reason, 60), message: cartQuoteWord(answer.delivery.message, 220),
    fee_before: cartQuoteNumber(answer.delivery.fee_before), reduction: Math.max(0, cartQuoteNumber(answer.delivery.reduction)),
    fee: Math.max(0, cartQuoteNumber(answer.delivery.fee))} : null;
  const code = answer.code && typeof answer.code === "object" ? {
    code: cartQuoteWord(answer.code.code, 40), applied: answer.code.applied === true, kind: cartQuoteWord(answer.code.kind, 20),
    reason: cartQuoteWord(answer.code.reason, 40), discount: Math.max(0, cartQuoteNumber(answer.code.discount)),
    min_order: cartQuoteNumber(answer.code.min_order), missing: Math.max(0, cartQuoteNumber(answer.code.missing)),
    pending: answer.code.pending === "delivery_fee" ? "delivery_fee" : "",
    order_types: (Array.isArray(answer.code.order_types) ? answer.code.order_types : []).filter(x => ["dinein", "takeaway", "delivery"].includes(x))} : null;
  const points = answer.points && typeof answer.points === "object" ? {
    requested: cartQuoteNumber(answer.points.requested), applied: answer.points.applied === false ? false : answer.points.applied,
    value: Math.max(0, cartQuoteNumber(answer.points.value)), reason: cartQuoteWord(answer.points.reason, 40), message: cartQuoteWord(answer.points.message, 220)} : null;
  return {
    quote_key: answer.quote_key, signed_in: answer.signed_in === true, order_type: cartQuoteWord(answer.order_type, 20),
    lines, items_total: itemsTotal,
    applied: (Array.isArray(answer.applied) ? answer.applied : []).map(cartQuotePromotion).filter(p => p && p.amount > 0).slice(0, 20),
    not_applied: (Array.isArray(answer.not_applied) ? answer.not_applied : []).map(row => {
      const p = cartQuotePromotion(row);
      return p ? {...p, reason: cartQuoteWord(row.reason, 40), min_order: cartQuoteNumber(row.min_order), missing: Math.max(0, cartQuoteNumber(row.missing)),
        pending: row.pending === "delivery_fee" ? "delivery_fee" : "",
        order_types: (Array.isArray(row.order_types) ? row.order_types : []).filter(x => ["dinein", "takeaway", "delivery"].includes(x))} : null;
    }).filter(Boolean).slice(0, 40),
    code, points, delivery,
    promotion_discount: Math.max(0, cartQuoteNumber(answer.promotion_discount)), voucher_discount: Math.max(0, cartQuoteNumber(answer.voucher_discount)),
    points_value: Math.max(0, cartQuoteNumber(answer.points_value)), discount_total: Math.max(0, cartQuoteNumber(answer.discount_total)),
    delivery_fee: answer.delivery_fee == null ? null : Math.max(0, cartQuoteNumber(answer.delivery_fee)),
    total, vat_amount: Math.max(0, cartQuoteNumber(answer.vat_amount)), total_is_final: answer.total_is_final !== false,
    // Reconciliation round (9 Oct): C1 the life of this price, C4 whether a code can be typed, C8 the fee not known yet
    valid_seconds: Number.isInteger(answer.valid_seconds) && answer.valid_seconds >= 0 ? Math.min(answer.valid_seconds, 24 * 3600) : null,
    valid_until: typeof answer.valid_until === "string" ? answer.valid_until.slice(0, 40) : "",
    codes_available: typeof answer.codes_available === "boolean" ? answer.codes_available : null,
    delivery_pending: answer.delivery_pending === true || Boolean(answer.delivery && answer.delivery.known === false && answer.order_type === "delivery"),
  };
}
function cartQuoteMissing(error) {
  return Boolean(error) && (error.status === 404 || error.code === "PGRST202" || error.code === "42883");
}
/** The app's own sum (the estimate), read without the quote. */
function cartQuoteEstimate() {
  if (typeof totals !== "function") return null;
  cartQuote.raw = true;
  try { return totals(); } catch (_) { return null; } finally { cartQuote.raw = false; }
}

// ---------- asking ----------
function cartQuoteStop() {
  if (cartQuote.timer) { clearTimeout(cartQuote.timer); cartQuote.timer = null; }
  if (cartQuote.abort) { try { cartQuote.abort.abort(); } catch (_) {} cartQuote.abort = null; }
  cartQuote.flight = "";
}
/** Called whenever the summary is drawn: asks for a price when the cart is not the one that was answered. */
function cartQuoteSync(now) {
  if (cartQuote.raw || cartQuote.support === "no") return;
  const fp = cartQuoteFingerprint();
  if (!fp) return;
  if (cartQuote.flight === fp) {
    if (now && cartQuote.timer) { clearTimeout(cartQuote.timer); cartQuoteRun(fp, cartQuote.request); }
    return;
  }
  const same = Boolean(cartQuote.quote) && cartQuote.key === fp;
  if (same && cartQuote.status === "fresh" && !cartQuote.stale && Date.now() - cartQuote.at < cartQuoteLife(cartQuote.quote)) return;
  if (!same && cartQuote.status === "failed" && cartQuote.failedKey === fp && !now) return;   // its own retry, or the customer, asks again
  cartQuoteStop();
  const request = ++cartQuote.request;
  cartQuote.flight = fp;
  if (!same) cartQuote.status = "updating";   // the same cart asked again (its age) changes nothing on the screen
  const wait = now || !cartQuote.quote ? 0 : CART_QUOTE_DEBOUNCE_MS;
  cartQuote.timer = setTimeout(() => cartQuoteRun(fp, request), wait);
}
async function cartQuoteRun(fp, request) {
  cartQuote.timer = null;
  if (request !== cartQuote.request) return;
  const params = cartQuoteParams();
  if (!params || cartQuoteFingerprint() !== fp) { cartQuote.flight = ""; return; }
  let answer = null, failure = null;
  try {
    answer = await customerOrderRpc(CART_QUOTE_FN, params, {timeoutMs: CART_QUOTE_TIMEOUT_MS, onStart: controller => { cartQuote.abort = controller; }});
  } catch (error) { failure = error || new Error("failed"); }
  if (request !== cartQuote.request) return;       // the cart changed since: that newer request owns the screen
  cartQuote.flight = ""; cartQuote.abort = null;
  if (failure) return cartQuoteFailed(failure, fp);
  const quote = cartQuoteClean(answer, params.p_cart.items.length);
  if (!quote) return cartQuoteFailed(new Error("Invalid price answer"), fp);
  if (cartQuoteFingerprint() !== fp) {             // changed without a draw in between: ask for the cart as it is now
    cartQuote.support = "yes";
    return cartQuoteSync();
  }
  cartQuoteTake(quote, fp);
}
/** An answer becomes the price on the screen. */
function cartQuoteTake(quote, fp) {
  const first = cartQuote.support !== "yes";
  const sameKey = cartQuote.quote && cartQuote.key === fp && cartQuote.quote.quote_key === quote.quote_key && cartQuote.status === "fresh";
  if (cartQuote.retryTimer) { clearTimeout(cartQuote.retryTimer); cartQuote.retryTimer = null; }
  Object.assign(cartQuote, {support: "yes", quote, key: fp, at: Date.now(), status: "fresh", stale: false, error: "", refusal: false, retries: 0, failedKey: ""});
  const estimate = cartQuoteEstimate();
  cartQuote.trust = Boolean(estimate) && Math.abs(estimate.total - quote.total) < 0.005 && !quote.applied.length;
  cartQuoteAfter(quote);
  cartQuoteValidity(quote);
  if (!sameKey || first) cartQuoteRedraw(first);
}
/** C1: when the answer's life runs out (a happy hour starts or ends, or its 15 minutes), the price is asked again. */
function cartQuoteValidity(quote) {
  if (cartQuote.validTimer) { clearTimeout(cartQuote.validTimer); cartQuote.validTimer = null; }
  if (!quote || typeof setTimeout !== "function") return;
  // valid_seconds is counted from the server's own "now", so the device clock plays no part; one second later
  // the server's boundary has surely passed. Never sooner than 5 s, so a broken answer cannot make a loop.
  const wait = Math.max(5, (Number.isInteger(quote.valid_seconds) ? quote.valid_seconds : CART_QUOTE_FRESH_MS / 1000) + 1) * 1000;
  cartQuote.validTimer = setTimeout(() => {
    cartQuote.validTimer = null;
    if (cartQuote.quote !== quote) return;
    cartQuote.stale = true;
    if (cartQuoteVisible()) cartQuoteSync(true);
  }, wait);
}
function cartQuoteFailed(error, fp) {
  if (cartQuoteMissing(error)) {
    // A database without 394: for this visit the cart and the order are the ones of before.
    if (cartQuote.code) { state.coupon = cartQuote.code; }
    Object.assign(cartQuote, {support: "no", quote: null, key: "", status: "idle", code: "", codeNote: null, codeBusy: false, error: "", refusal: false});
    return cartQuoteRedraw(true);
  }
  const message = String(error?.message || "");
  const written = error?.code === "P0001";     // a sentence of the pricer, written for customers
  if (written || error?.code === "22023") cartQuote.support = "yes";   // the function is there
  Object.assign(cartQuote, {status: "failed", failedKey: fp, refusal: written, error: written ? message : ""});
  cartQuote.hint = typeof error?.hint === "string" ? error.hint : "";
  if (written || error?.code === "22023") {
    // C6: the word beside the sentence decides; a server without words still has its sentences
    if ((PROMO_CART_ERRORS.includes(cartQuote.hint) || (!cartQuote.hint && /no longer available|outside its available time|choice|order line|quantity|offer/i.test(message))) && typeof refreshMenu === "function") refreshMenu();
    if (typeof tableRefused === "function" && tableRefused(cartQuote.hint === "table_inactive" && typeof TABLE_INACTIVE_EN === "string" ? TABLE_INACTIVE_EN : message) && typeof tableNotice === "function") tableNotice();
    cartQuote.refusal = true;
  } else if (cartQuote.retries < CART_QUOTE_RETRY_MS.length) {
    const wait = CART_QUOTE_RETRY_MS[cartQuote.retries++];
    if (cartQuote.retryTimer) clearTimeout(cartQuote.retryTimer);
    cartQuote.retryTimer = setTimeout(() => { cartQuote.retryTimer = null; if (cartQuoteVisible()) cartQuoteSync(true); }, wait);
  }
  cartQuoteRedraw(false);
}
/** The customer's words for a refusal of the price function (C6), in the app's language. */
function cartQuoteRefusalText() {
  const worded = promoErrorText(cartQuote.hint);
  if (worded) return worded;
  if (!cartQuote.hint && /no longer available|outside its available time|choice|order line|quantity|offer/i.test(cartQuote.error)) return promoErrorText("item_unavailable");
  return state.lang === "ar" ? "تعذر تأكيد السعر الآن." : cartQuote.error || CART_QUOTE_FAIL();
}
function cartQuoteVisible() {
  return typeof state !== "undefined" && ["cart", "checkout"].includes(state.screen) && !(typeof document !== "undefined" && document.hidden);
}
/** Something outside the cart changed the prices (the menu, a promotion's hours, coming back online). */
function cartQuoteStale() {
  if (cartQuote.support === "no") return;
  cartQuote.stale = true;
  if (cartQuote.status === "failed") { cartQuote.failedKey = ""; cartQuote.retries = 0; }
  if (cartQuoteVisible()) cartQuoteSync(true);
}
function cartQuoteRetry() { cartQuote.failedKey = ""; cartQuote.retries = 0; cartQuoteSync(true); cartQuoteRedraw(false); }
/** A price for the cart as it stands, now: the one on screen when it is young, else a new one. null = none. */
async function cartQuoteFresh(maxAge = CART_QUOTE_ORDER_MS) {
  for (let turn = 0; turn < 4; turn++) {
    if (cartQuote.support === "no") return null;
    const fp = cartQuoteFingerprint();
    if (!fp) return null;
    if (cartQuote.quote && cartQuote.key === fp && cartQuote.status === "fresh" && !cartQuote.stale && Date.now() - cartQuote.at < maxAge) return cartQuote.quote;
    cartQuoteStop();
    const request = ++cartQuote.request;
    cartQuote.flight = fp;
    if (!(cartQuote.quote && cartQuote.key === fp)) cartQuote.status = "updating";
    await cartQuoteRun(fp, request);
    if (request !== cartQuote.request) continue;                    // the cart changed while asking
    if (cartQuote.status === "failed") return null;
    if (cartQuote.status === "fresh" && !cartQuote.stale && cartQuote.quote && cartQuote.key === cartQuoteFingerprint()) return cartQuote.quote;   // just answered
  }
  return null;
}

// ---------- after an answer: the code, the points, the customer ----------
function cartQuoteAfter(quote) {
  if (cartQuote.code) {
    const typed = cartQuote.codeTyped;
    cartQuote.codeTyped = false; cartQuote.codeBusy = false;
    const code = quote.code;
    if (code && code.applied) {
      cartQuote.codeNote = null;
      state.couponOn = true;
      // the same places as before read these two (the summary, the points rules, the order attempt)
      state.voucher = {ok: true, code: cartQuote.code, quoted: true, kind: "quote", value: 0, min_food: 0, allow_with_offers: true};
      if (typed && typeof toast === "function") toast(t("couponOk"));
    } else {
      const reason = code && code.reason ? code.reason : "code_not_valid";
      const kept = PROMO_CODE_KEPT.includes(reason);
      cartQuote.codeNote = {code: cartQuote.code, reason, kept, missing: code ? code.missing : 0, order_types: code ? code.order_types : []};
      state.couponOn = false; state.voucher = null;
      if (!kept) {
        // A code that will not work is taken off, so it is not sent again with every change of the cart.
        state.coupon = cartQuote.code;
        cartQuote.code = "";
        cartQuote.key = cartQuoteFingerprint();   // the same cart without the code: shown, and asked again quietly
        cartQuote.stale = true;
      }
    }
  }
  if (quote.points && quote.points.applied === false && Number(state.redeemPoints) > 0) {
    // The points programme refused (its own sentence). The choice is taken back and the balance read again.
    state.redeemPoints = 0;
    cartQuote.key = cartQuoteFingerprint(); cartQuote.stale = true;
    if (typeof toast === "function") toast(quote.points.message || promoReasonText("points_refused", "offer", {}), 6000);
    if (typeof loadRewardsSummary === "function") Promise.resolve(loadRewardsSummary(true)).then(() => { if (state.screen === "checkout") renderKeepScroll(); }).catch(() => {});
  }
  // Contract, step 8.7: a session that is not yet a customer of this restaurant. Today's sign-in makes
  // the customer by reading the profile; then the price is asked again (codes and first-order offers need it).
  if (state.isLoggedIn && quote.signed_in === false && cartQuote.profileTried !== state.authUserId && typeof loadCustomerProfile === "function") {
    cartQuote.profileTried = state.authUserId;
    Promise.resolve(loadCustomerProfile()).then(() => cartQuoteStale()).catch(() => {});
  }
  if (cartQuote.stale && cartQuoteVisible()) setTimeout(() => cartQuoteSync(true), 0);
}

// ---------- the code field ----------
/** "Apply" in the cart. true = handled here (394); false = the voucher check of before runs. */
async function cartQuoteApplyCode() {
  if (cartQuote.support === "unknown" && cartQuoteWanted()) await cartQuoteFresh();
  if (cartQuote.support === "no") return false;
  const code = String(state.coupon || "").trim().toUpperCase().slice(0, 40);
  state.couponOn = false; state.voucher = null;
  cartQuote.codeNote = null;
  if (cartQuote.support !== "yes") {
    // no answer at all yet (no connection): nothing is known about the code
    if (typeof toast === "function") toast(cartQuoteCopy("Could not check the code. Please try again.", "تعذر التحقق من الكود. حاول مرة أخرى."));
    return true;
  }
  if (!code) { cartQuote.code = ""; cartQuoteRedraw(false); return true; }
  Object.assign(cartQuote, {code, codeBusy: true, codeTyped: true});
  cartQuoteCodeBoxRefresh(true);
  const quote = await cartQuoteFresh(0);
  if (!quote && cartQuote.codeBusy) {
    // the price could not be asked: the code is not kept, the words stay in the field
    Object.assign(cartQuote, {code: "", codeBusy: false, codeTyped: false});
    state.coupon = code;
    if (typeof toast === "function") toast(cartQuoteCopy("Could not check the code. Please try again.", "تعذر التحقق من الكود. حاول مرة أخرى."));
  }
  cartQuote.codeBusy = false;
  cartQuoteRedraw(false);
  cartQuoteCodeBoxRefresh(true);
  return true;
}
/** The code is taken off (Remove, a refusal of the order, a new order). */
function cartQuoteDropCode() {
  if (!cartQuote.code && !cartQuote.codeNote) return;
  Object.assign(cartQuote, {code: "", codeNote: null, codeBusy: false, codeTyped: false});
  if (cartQuoteVisible()) cartQuoteSync();   // the price without the code
}
function cartQuoteCodeNoteText() {
  const note = cartQuote.codeNote;
  if (!note) return "";
  return promoReasonText(note.reason, "code", {code: note.code, amount: cartQuoteMoney(note.missing), types: cartQuoteTypesText(note.order_types)});
}
/** The code box of the cart on a 394 database; null = the box of before. One field for a coupon or a promo code. */
/** C4: whether this restaurant has any code for this channel; null = not known (no answer yet). */
function cartQuoteCodesAvailable() {
  return cartQuote.support === "yes" && cartQuote.quote ? cartQuote.quote.codes_available : null;
}
function cartQuoteCodeBox() {
  if (cartQuote.support !== "yes") return null;
  if (typeof addonTarget === "function" && addonTarget()) return null;
  const note = cartQuote.codeNote;
  const busy = Boolean(cartQuote.code || state.couponOn || note || String(state.coupon || "").trim());
  // C4: no running code and no voucher here -> no field; one that is typed or applied always stays
  if (cartQuoteCodesAvailable() === false && !busy) return "";
  // C4: a visitor is asked to sign in first (the server answers a visitor's code "sign_in_needed" without looking it up)
  if (!state.isLoggedIn && !busy) {
    return `<p class="table-guest-coupon pq-code-signin">${cartQuoteCopy("Have a coupon or promo code?", "لديك كود خصم أو عرض؟")}
      <button type="button" class="link" onclick="go('signInPage')">${cartQuoteCopy("Sign in to use it", "سجّل الدخول لاستخدامه")}</button></p>`;
  }
  if (cartQuote.code && cartQuote.codeBusy) {
    return `<div class="coupon-applied pq-code-wait" role="status"><span class="coupon-applied-text">${cartQuoteCopy("Checking", "جارٍ التحقق من")} <b dir="ltr">${escapeHtml(cartQuote.code)}</b>…</span></div>`;
  }
  if (cartQuote.code && state.couponOn && state.voucher?.code === cartQuote.code) {
    return `<div class="coupon-applied" role="status">
      <span class="coupon-applied-text">✓ ${cartQuoteCopy("Applied", "تم التطبيق")} <b dir="ltr">${escapeHtml(cartQuote.code)}</b></span>
      <button class="link" onclick="removeCoupon()">${cartQuoteCopy("Remove", "إزالة")}</button>
    </div>`;
  }
  if (cartQuote.code && note && note.kept) {
    // F4: a code that cannot be combined (or does not reach its minimum) is said so, never dropped silently.
    return `<div class="coupon-applied pq-code-held" role="status">
      <span class="coupon-applied-text"><b dir="ltr">${escapeHtml(cartQuote.code)}</b> · ${cartQuoteCopy("not applied", "غير مطبق")}</span>
      <button class="link" onclick="removeCoupon()">${cartQuoteCopy("Remove", "إزالة")}</button>
      <p class="pq-code-note">${escapeHtml(cartQuoteCodeNoteText())}</p>
    </div>`;
  }
  const label = cartQuoteCopy("Coupon or promo code", "كود الخصم أو العرض");
  const signIn = note && note.reason === "sign_in_needed" && !state.isLoggedIn
    ? ` <button type="button" class="link" onclick="go('signInPage')">${cartQuoteCopy("Sign in", "تسجيل الدخول")}</button>` : "";
  return `<input class="field" id="couponInput" placeholder="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" value="${escapeHtml(state.coupon)}"
      autocapitalize="characters" autocomplete="off" spellcheck="false" maxlength="40" enterkeyhint="done"
      oninput="state.coupon=this.value" onkeydown="if(event.key==='Enter'){event.preventDefault();applyCoupon()}" />
    <button class="link" onclick="applyCoupon()">${cartQuoteCopy("Apply", "تطبيق")}</button>
    ${note && !note.kept ? `<p class="pq-code-note pq-code-bad" role="alert">${escapeHtml(cartQuoteCodeNoteText())}${signIn}</p>` : ""}`;
}
function cartQuoteCodeBoxRefresh(force) {
  if (typeof document === "undefined" || typeof document.getElementById !== "function") return;
  const box = document.getElementById("couponBox");
  if (!box || !("innerHTML" in box) || typeof couponBoxMarkup !== "function") return;
  const next = couponBoxMarkup();
  // a field the customer is typing in is not replaced under the fingers
  if (!force && document.activeElement && document.activeElement.id === "couponInput" && next.includes('id="couponInput"') && !cartQuote.codeNote) return;
  if (box.innerHTML !== next) box.innerHTML = next;
}

// ---------- what the screen shows ----------
/** {quote, held}: the answer for the cart as it stands; or the last answer, held while the next one is on its way. */
function cartQuoteShown() {
  if (cartQuote.raw || cartQuote.support !== "yes" || !cartQuote.quote) return null;
  const fp = cartQuoteFingerprint();
  if (!fp) return null;
  if (cartQuote.key === fp) return {quote: cartQuote.quote, held: false};
  // The cart changed and the new price is on its way. When the last answer equalled the app's own sum
  // the sum is shown at once (the answer will almost always confirm it: no jump); when it did not
  // (a promotion), the last price stays, dimmed, and the total moves once, when the answer comes.
  if (cartQuote.status === "updating" && !cartQuote.trust) return {quote: cartQuote.quote, held: true};
  return null;
}
/** For totals() in app.js: the server's numbers in the shape the app already uses, or null. */
function cartQuoteTotals() {
  const shown = cartQuoteShown();
  if (!shown) return null;
  const q = shown.quote;
  const delivery = q.delivery && q.delivery.known && q.delivery.eligible ? q.delivery.fee : 0;
  const food = Math.max(0, roundMoney(q.items_total - q.discount_total));
  const own = cartQuoteEstimate();
  // the regular prices (before an item's own offer) are the menu's; shown only while they agree with the answer
  const agrees = own && Math.abs(roundMoney(own.regularItemsTotal - own.offerSavings) - q.items_total) < 0.005;
  return {subtotal: roundMoney(q.total - q.vat_amount), foodTotal: food, delivery, discount: q.voucher_discount, points: q.points_value,
    vat: q.vat_amount, total: q.total, regularItemsTotal: agrees ? own.regularItemsTotal : q.items_total, offerSavings: agrees ? own.offerSavings : 0,
    promotions: q.promotion_discount, quoted: true, held: shown.held, final: q.total_is_final};
}
function cartQuotePromoText(p) {
  const ar = state.lang === "ar";
  return (ar ? p.text_ar || p.text_en || p.name_ar || p.name_en : p.text_en || p.name_en) || cartQuoteOfferLabel(p);
}
/** "10% off", "SAR 5.00 off", "free delivery": what a promotion gives, from its numbers. */
function cartQuoteOfferLabel(p) {
  const pct = `${Number(Number(p.value).toFixed(2))}%`;   // C9: "20%", "12.5%" — one style everywhere
  if (p.kind === "percent") return cartQuoteCopy(`${pct} off`, `خصم ${pct}`);
  if (p.kind === "amount") return cartQuoteCopy(`${cartQuoteMoney(p.value)} off`, `خصم ${cartQuoteMoney(p.value)}`);
  if (p.kind === "delivery_percent") return Number(p.value) >= 100 ? cartQuoteCopy("free delivery", "توصيل مجاني") : cartQuoteCopy(`${pct} off delivery`, `خصم ${pct} على التوصيل`);
  if (p.kind === "delivery_amount") return cartQuoteCopy(`${cartQuoteMoney(p.value)} off delivery`, `خصم ${cartQuoteMoney(p.value)} على التوصيل`);
  return cartQuoteCopy("an offer", "عرض");
}
function cartQuoteTypesText(types) {
  const names = {dinein: cartQuoteCopy("dine-in", "المحلي"), takeaway: cartQuoteCopy("pick-up", "الاستلام"), delivery: cartQuoteCopy("delivery", "التوصيل")};
  return (types || []).map(x => names[x]).filter(Boolean).join(cartQuoteCopy(" and ", " و"));
}
/** What the promotion would give at its minimum (the contract's numbers), to choose the best hint. */
function cartQuoteHintGain(p) {
  if (p.kind === "amount" || p.kind === "delivery_amount") return p.value;
  const base = p.kind === "percent" ? Math.max(p.min_order, 0) : 0;
  const gain = base * p.value / 100;
  return p.max_discount != null && p.max_discount > 0 ? Math.min(gain, p.max_discount) : gain;
}
/** The one hint of the cart: the best promotion that is close, or the one reason that helps. "" when none. */
function cartQuoteHint(q) {
  const rows = q.not_applied.filter(p => PROMO_REASONS[p.reason]?.show === "hint");
  // 1. "Add SAR 12.00 more": within reach (not more than the cart is worth now) and worth more than what is applied.
  const orderApplied = q.applied.filter(p => p.level === "order").reduce((n, p) => n + p.amount, 0);
  const close = rows.filter(p => p.reason === "minimum_not_met" && p.missing > 0 && p.missing <= Math.max(q.items_total, 1) &&
    (p.level !== "order" || cartQuoteHintGain(p) > orderApplied + 0.004))
    .sort((a, b) => cartQuoteHintGain(b) - cartQuoteHintGain(a) || a.missing - b.missing);
  let pick = close[0] || null;
  if (!pick) {
    for (const reason of PROMO_HINT_ORDER.slice(1)) {
      pick = rows.find(p => p.reason === reason && !p.pending && (reason !== "sign_in_needed" || !state.isLoggedIn) &&
        (reason !== "wrong_order_type" || (p.order_types.length && !(typeof tableOn === "function" && tableOn()))));
      if (pick) break;
    }
  }
  // C8: before an address, the promotion that steps aside for the fee is said to be on its way, not "cannot make the order free"
  const pending = q.not_applied.find(p => p.reason === "would_be_free" && p.pending === "delivery_fee");
  if (pending) return PROMO_PENDING_TEXT[state.lang === "ar" ? "ar" : "en"].replace("{name}", cartQuotePromoText(pending));
  if (!pick) return "";
  return promoReasonText(pick.reason, "offer", {amount: cartQuoteMoney(pick.missing), offer: cartQuoteOfferLabel(pick),
    name: cartQuotePromoText(pick), types: cartQuoteTypesText(pick.order_types)});
}
/** The quiet line under the totals: nothing when the price is confirmed. */
function cartQuoteStateMarkup() {
  if (cartQuote.support !== "yes") return "";
  if (cartQuote.status === "updating") return `<p class="pq-state" role="status">${cartQuoteCopy("Updating price…", "جارٍ تحديث السعر…")}</p>`;
  if (cartQuote.status === "failed" && !(cartQuote.quote && cartQuote.key === cartQuoteFingerprint())) {
    const words = cartQuote.refusal ? cartQuoteRefusalText()
      : cartQuoteCopy("Prices are confirmed when you are online.", "تُؤكَّد الأسعار عند اتصالك بالإنترنت.");
    return `<p class="pq-state pq-state-off" role="status">${escapeHtml(words)} <button type="button" class="link" onclick="cartQuoteRetry()">${cartQuoteCopy("Try again", "إعادة المحاولة")}</button></p>`;
  }
  return `<p class="pq-state pq-state-ok" aria-hidden="true"></p>`;
}
/** True while the amounts on the screen are the app's own sum because no price could be had (said so beside the total). */
function cartQuoteEstimated() {
  if (cartQuote.raw || cartQuote.support !== "yes" || cartQuote.status !== "failed" || !cartQuoteWanted()) return false;
  return !(cartQuote.quote && cartQuote.key === cartQuoteFingerprint());
}
/** "Total", or "Estimated total" while the price is not confirmed. */
function cartQuoteTotalLabel() {
  if (cartQuoteEstimated()) return cartQuoteCopy("Estimated total", "الإجمالي التقديري");
  const shown = cartQuoteShown();
  return shown && shown.quote.delivery_pending ? cartQuoteCopy("Food total", "إجمالي الطعام") : t("total");
}
/** The breakdown of the cart and the checkout on a 394 database; null = the breakdown of before. */
function cartQuoteSummaryMarkup() {
  if (cartQuote.raw) return null;
  cartQuoteSync();
  if (cartQuote.support !== "yes" || !cartQuoteWanted()) return null;
  const shown = cartQuoteShown();
  if (!shown) {
    // no answer for this cart yet (or none could be had): the app's own sum, said to be unconfirmed below it
    let own = "";
    cartQuote.raw = true;
    try { own = cartSummaryMarkup(); } finally { cartQuote.raw = false; }
    const estimate = cartQuoteEstimate();
    cartQuote.shownTotal = estimate ? estimate.total : null; cartQuote.shownQuote = null;
    if (cartQuoteEstimated()) own = own.replace(`<div class="total"><span>${t("total")}</span>`, `<div class="total pq-estimate"><span>${cartQuoteTotalLabel()}</span>`);
    return `${own}${cartQuoteStateMarkup()}`;
  }
  const q = shown.quote, tot = cartQuoteTotals(), wait = shown.held ? " pq-wait" : "";
  cartQuote.shownTotal = q.total; cartQuote.shownQuote = q;
  const hint = shown.held ? "" : cartQuoteHint(q);
  const food = q.applied.filter(p => p.level !== "delivery");
  const deliveryPromo = q.applied.find(p => p.level === "delivery");
  const d = q.delivery, pending = q.delivery_pending;
  const feeText = !d || pending ? "" : !d.known ? "—"
    : !d.eligible ? "—"
    : `${d.reduction > 0 ? `<s class="pq-was">${cartQuoteMoney(d.fee_before)}</s> ` : ""}${d.fee === 0 ? cartQuoteCopy("Free", "مجاناً") : cartQuoteMoney(d.fee)}`;
  return `${typeof offerSpendMarkup === "function" ? offerSpendMarkup() : ""}${hint ? `<p class="pq-hint" role="status">${escapeHtml(hint)}</p>` : ""}
    <div class="pq-row${wait}"><span>${cartQuoteCopy("Items total (VAT included)", "إجمالي الأصناف (شامل الضريبة)")}</span><span>${cartQuoteMoney(tot.regularItemsTotal)}</span></div>
    ${tot.offerSavings ? `<div class="offer-saving${wait}"><span>${cartQuoteCopy("Offer savings", "توفير العروض")}</span><span>− ${cartQuoteMoney(tot.offerSavings)}</span></div>` : ""}
    ${food.length ? `<p class="pq-applied-title${wait}">${cartQuoteCopy("Offers applied", "العروض المطبقة")}</p>
      ${food.map(p => `<div class="offer-saving pq-applied${wait}"><span>${escapeHtml(cartQuotePromoText(p))}</span><span>− ${cartQuoteMoney(p.amount)}</span></div>`).join("")}` : ""}
    ${q.voucher_discount ? `<div class="pq-row${wait}"><span>${t("coupon")}${cartQuote.code ? ` <b dir="ltr">${escapeHtml(cartQuote.code)}</b>` : ""}</span><span>− ${cartQuoteMoney(q.voucher_discount)}</span></div>` : ""}
    ${q.points_value ? `<div class="rewards-line${wait}"><span>${cartQuoteCopy(`Points (${state.redeemPoints})`, `النقاط (${state.redeemPoints})`)}</span><span>− ${cartQuoteMoney(q.points_value)}</span></div>` : ""}
    ${d && !pending ? `<div class="pq-row${wait}"><span>${t("deliveryFee")}</span><span>${feeText}</span></div>
      ${deliveryPromo && d.known && d.eligible ? `<p class="pq-delivery-offer${wait}">${escapeHtml(cartQuotePromoText(deliveryPromo))}</p>` : ""}` : ""}
    <div class="total${wait}${pending ? " pq-food-total" : ""}"><span>${pending ? cartQuoteCopy("Food total", "إجمالي الطعام") : t("total")}</span><span>${cartQuoteMoney(q.total)}</span></div>
    <div class="included-vat${wait}"><span>${cartQuoteCopy("Includes VAT 15%", "يشمل ضريبة القيمة المضافة 15%")}</span><span>${cartQuoteMoney(q.vat_amount)}</span></div>
    ${pending || !q.total_is_final ? `<p class="pq-pending" role="status">${cartQuoteCopy("Delivery fee added when you choose your address.", "تُضاف رسوم التوصيل عند اختيار عنوانك.")}</p>` : ""}
    ${cartQuoteStateMarkup()}`;
}
/** A cart line's amount: the reduced price with the regular one struck through, or "" (the amount of before). */
function cartQuoteLineInner(index) {
  const shown = cartQuoteShown();
  if (!shown || shown.held) return "";
  const line = shown.quote.lines[index];
  if (!line || !line.reductions.length || !(line.net_total < line.line_total)) return "";
  return `<s class="pq-was">${cartQuoteMoney(line.line_total)}</s> <span class="pq-now">${cartQuoteMoney(line.net_total)}</span>`;
}
function cartQuoteRows() {
  if (typeof document === "undefined" || typeof document.querySelectorAll !== "function") return;
  document.querySelectorAll(".cart-line").forEach((row, index) => {
    const cell = row.querySelector ? row.querySelector(".cart-line-total") : null;
    const line = state.cart[index];
    if (!cell || !line) return;
    const next = cartQuoteLineInner(index) || cartQuoteMoney(typeof linePrice === "function" ? linePrice(line) : 0);
    if (cell.innerHTML !== next) cell.innerHTML = next;
  });
}
/** The answer came: only the parts that show money are drawn again (no jump of the page, no lost typing). */
function cartQuoteRedraw(whole) {
  if (typeof document === "undefined" || typeof state === "undefined" || !["cart", "checkout"].includes(state.screen)) return;
  const typing = document.activeElement && typeof document.activeElement.matches === "function" && document.activeElement.matches("input,textarea,select");
  if (whole && !typing && typeof renderKeepScroll === "function") return renderKeepScroll();
  if (typeof document.querySelectorAll === "function") {
    document.querySelectorAll(".cx-cta-total > span").forEach(label => { const words = cartQuoteTotalLabel(); if (label.textContent !== words) label.textContent = words; });
  }
  if (state.screen === "cart") {
    if (typeof updateCartBreakdown === "function") updateCartBreakdown();
    cartQuoteCodeBoxRefresh(false);
    cartQuoteRows();
  } else {
    if (typeof updateCheckoutSummary === "function") updateCheckoutSummary();
    const lines = typeof document.querySelector === "function" ? document.querySelector(".cx-co-order") : null;
    if (lines && "outerHTML" in lines && typeof checkoutOrderLinesMarkup === "function") lines.outerHTML = checkoutOrderLinesMarkup();
    const points = typeof document.getElementById === "function" ? document.getElementById("rewardsCheckout") : null;
    if (points && "outerHTML" in points && typeof rewardsCheckoutMarkup === "function" && !(typeof tableGuestOffered === "function" && tableGuestOffered())) points.outerHTML = rewardsCheckoutMarkup();
  }
}

// ---------- Place Order ----------
/** In one sentence: what is different between the price that was shown and the new one. */
function cartQuoteChangeSentence(before, after) {
  if (!before) return cartQuoteCopy("This is the confirmed price of your order.", "هذا هو السعر المؤكد لطلبك.");
  const ids = list => new Map(list.map(p => [p.promotion_id, p]));
  const was = ids(before.applied), now = ids(after.applied);
  const gone = [...was.values()].filter(p => !now.has(p.promotion_id));
  const added = [...now.values()].filter(p => !was.has(p.promotion_id));
  if (gone.length === 1) return cartQuoteCopy(`“${cartQuotePromoText(gone[0])}” is no longer applied.`, `لم يعد عرض «${cartQuotePromoText(gone[0])}» مطبقاً.`);
  if (gone.length > 1) return cartQuoteCopy("Some offers are no longer applied.", "بعض العروض لم تعد مطبقة.");
  const line = after.lines.findIndex((row, n) => before.lines[n] && Math.abs(row.line_total - before.lines[n].line_total) > 0.004);
  if (line >= 0) {
    const item = typeof itemById === "function" && state.cart[line] ? itemById(state.cart[line].id) : null;
    const name = item && typeof loc === "function" ? loc(item, "name") : after.lines[line].name;
    return cartQuoteCopy(`The price of ${name} has changed.`, `تغيّر سعر ${name}.`);
  }
  if (added.length) return cartQuoteCopy(`“${cartQuotePromoText(added[0])}” is now applied.`, `تم تطبيق عرض «${cartQuotePromoText(added[0])}».`);
  if ([...now.values()].some(p => was.has(p.promotion_id) && Math.abs(was.get(p.promotion_id).amount - p.amount) > 0.004)) {
    return cartQuoteCopy("An offer on your order has changed.", "تغيّر أحد العروض على طلبك.");
  }
  if (Math.abs(before.voucher_discount - after.voucher_discount) > 0.004) return cartQuoteCopy("Your coupon discount has changed.", "تغيّر خصم الكوبون.");
  if (Math.abs(before.points_value - after.points_value) > 0.004) return cartQuoteCopy("The value of your points has changed.", "تغيّرت قيمة نقاطك.");
  if (Math.abs((before.delivery_fee || 0) - (after.delivery_fee || 0)) > 0.004) return cartQuoteCopy("The delivery fee has changed.", "تغيّرت رسوم التوصيل.");
  return cartQuoteCopy("The total of your order has changed.", "تغيّر إجمالي طلبك.");
}
function cartQuoteOpenChange(fromTotal, before, quote) {
  cartQuote.changed = {from: fromTotal, before, key: quote.quote_key};
  cartQuote.confirmedKey = "";
  if (typeof state !== "undefined" && state.screen !== "checkout" && typeof go === "function") go("checkout");
  else if (typeof renderKeepScroll === "function") renderKeepScroll();
}
/** The sheet "The price has changed": the new total, why, and the customer says yes again. Nothing was saved. */
function cartQuoteChangedMarkup() {
  const open = cartQuote.changed;
  if (!open || !cartQuote.quote || cartQuote.quote.quote_key !== open.key || cartQuote.key !== cartQuoteFingerprint()) return "";
  const q = cartQuote.quote;
  return `<div class="cx-sheet pq-sheet" role="alertdialog" aria-modal="true" aria-labelledby="pqChangedTitle" aria-describedby="pqChangedWhy">
    <button type="button" class="cx-sheet-backdrop" onclick="cartQuoteCloseChange()" aria-label="${cartQuoteCopy("Close", "إغلاق")}"></button>
    <div class="cx-sheet-panel">
      <div class="cx-sheet-grip" aria-hidden="true"></div>
      <h3 id="pqChangedTitle">${cartQuoteCopy("The price has changed", "تغيّر السعر")}</h3>
      <p class="pq-sheet-why" id="pqChangedWhy">${escapeHtml(cartQuoteChangeSentence(open.before, q))}</p>
      <div class="pq-sheet-totals">
        ${open.from == null ? "" : `<div class="pq-sheet-was"><span>${cartQuoteCopy("Before", "السابق")}</span><s>${cartQuoteMoney(open.from)}</s></div>`}
        <div class="pq-sheet-now"><span>${cartQuoteCopy("New total", "الإجمالي الجديد")}</span><strong>${cartQuoteMoney(q.total)}</strong></div>
      </div>
      <p class="pq-sheet-note">${cartQuoteCopy("Your order has not been sent yet.", "لم يُرسل طلبك بعد.")}</p>
      <button type="button" class="btn btn-primary pq-sheet-yes" onclick="cartQuoteConfirmChange()">${cartQuoteCopy("Place order", "تأكيد الطلب")} · ${cartQuoteMoney(q.total)}</button>
      <button type="button" class="btn btn-ghost" onclick="cartQuoteCloseChange(true)">${cartQuoteCopy("Back to cart", "العودة إلى السلة")}</button>
    </div></div>`;
}
function cartQuoteCloseChange(toCart) {
  cartQuote.changed = null;
  if (toCart && typeof go === "function") go("cart");
  else if (typeof renderKeepScroll === "function") renderKeepScroll();
}
function cartQuoteConfirmChange() {
  const open = cartQuote.changed;
  if (!open) return;
  cartQuote.confirmedKey = open.key;      // the customer saw this price and said yes
  cartQuote.changed = null;
  if (typeof renderKeepScroll === "function") renderKeepScroll();
  if (typeof createOrderAfterVerification === "function") createOrderAfterVerification();
}
/**
 * Before the order is sent. Answers:
 *   null                    an old database: the order goes the way of before (no key, the old functions)
 *   {stop: true}            no order now (no price, or the customer must look at a new one)
 *   {key, code, quote}      send with this key
 */
async function cartQuoteForOrder() {
  if (cartQuote.support === "no") return null;
  const shownTotal = cartQuote.shownTotal, shownQuote = cartQuote.shownQuote;
  let quote = await cartQuoteFresh();
  if (cartQuote.support === "no") return null;
  // A code that is not applied is not sent with the order (the order function would refuse it and count a try).
  if (quote && cartQuote.code && !(quote.code && quote.code.applied)) {
    const note = cartQuote.codeNote;
    cartQuote.code = "";
    state.couponOn = false; state.voucher = null;
    cartQuote.codeNote = note ? {...note, kept: false} : null;
    if (note) state.coupon = note.code;
    quote = await cartQuoteFresh();
  }
  if (!quote) {
    if (typeof toast === "function") {
      toast(cartQuote.refusal ? cartQuoteRefusalText() : CART_QUOTE_FAIL(), 7000);
    }
    return {stop: true};
  }
  if (!quote.total_is_final) {
    if (typeof toast === "function") toast(cartQuoteCopy("Choose your delivery address to see the total.", "اختر عنوان التوصيل لمعرفة الإجمالي."), 6000);
    return {stop: true};
  }
  if (cartQuote.confirmedKey !== quote.quote_key && shownTotal != null && Math.abs(quote.total - shownTotal) > 0.004) {
    // The price is not the one on the screen (higher or lower): the customer looks at it and taps again.
    cartQuoteOpenChange(shownTotal, shownQuote, quote);
    return {stop: true};
  }
  return {key: quote.quote_key, quote, code: cartQuote.code && quote.code && quote.code.applied ? cartQuote.code : "", fingerprint: cartQuote.key};
}
/** The order's answer. true = the price had changed (nothing was saved) and it is handled here. */
function cartQuotePriceChanged(result, priced) {
  if (!result || result.ok !== false || result.code !== "price_changed") return false;
  const fp = cartQuoteFingerprint();
  const params = cartQuoteParams();
  const quote = params ? cartQuoteClean(result.quote, params.p_cart.items.length) : null;
  if (!quote || !fp) {
    cartQuote.stale = true;
    if (typeof toast === "function") toast(CART_QUOTE_FAIL(), 7000);
    return true;
  }
  const before = priced.quote, was = before.total;
  cartQuoteStop();
  cartQuote.request++;
  Object.assign(cartQuote, {quote, key: fp, at: Date.now(), status: "fresh", stale: false, error: "", refusal: false});
  cartQuoteAfter(quote);
  cartQuoteValidity(quote);
  // Nothing was saved. Whatever the direction, the new price is shown and the customer taps Place Order again.
  cartQuoteOpenChange(was, before, quote);
  return true;
}
/** The order failed on its key (should never be seen): the price is asked again before the next try. */
function cartQuoteKeyRefused(error) {
  if (!error || !["quote_key_required", "quote_mismatch"].includes(error.hint)) return false;
  cartQuote.stale = true; cartQuote.confirmedKey = "";
  if (typeof console !== "undefined" && console.warn) console.warn("ORACY price key refused:", error.hint);
  if (typeof toast === "function") toast(CART_QUOTE_FAIL(), 7000);
  return true;
}
/** After an order was saved, or when the customer changes. */
function cartQuoteReset() {
  cartQuoteStop();
  if (cartQuote.retryTimer) { clearTimeout(cartQuote.retryTimer); cartQuote.retryTimer = null; }
  cartQuote.request++;
  Object.assign(cartQuote, {quote: null, key: "", at: 0, status: "idle", stale: false, error: "", refusal: false, trust: true, code: "", codeNote: null,
    codeBusy: false, codeTyped: false, shownTotal: null, shownQuote: null, confirmedKey: "", changed: null, retries: 0, failedKey: ""});
}

// ---------- the saved order: its promotions and its total, kept on this device ----------
const PROMO_ORDER_KEEP_MS = 3 * 24 * 60 * 60 * 1000;
function promoOrderClean(list) {
  return (Array.isArray(list) ? list : []).map(cartQuotePromotion).filter(p => p && p.amount > 0).slice(0, 10)
    .map(p => ({promotion_id: p.promotion_id, name_en: p.name_en, name_ar: p.name_ar, text_en: p.text_en, text_ar: p.text_ar, kind: p.kind, value: p.value, level: p.level, amount: p.amount,
      ...promoLicence(p)}));
}
function promoOrderList() {
  try {
    const list = JSON.parse(localStorage.getItem(appStorageKey("order-promos")) || "[]");
    return (Array.isArray(list) ? list : []).filter(row => row && isMenuId(row.id) && Number.isFinite(row.at) &&
      Math.abs(Date.now() - row.at) < PROMO_ORDER_KEEP_MS).slice(0, 12);
  } catch (_) { return []; }
}
/** What the order's answer said (contract, section 3: total, discount, promotions). Only for an order made with a key. */
function promoOrderRemember(id, result) {
  if (!isMenuId(id) || !result) return null;
  const row = {id, at: Date.now(), total: cartQuoteNumber(result.total), discount: Math.max(0, cartQuoteNumber(result.discount)), promotions: promoOrderClean(result.promotions)};
  try { localStorage.setItem(appStorageKey("order-promos"), JSON.stringify([row, ...promoOrderList().filter(x => x.id !== id)].slice(0, 12))); } catch (_) {}
  return row;
}
/* C5: what an order was given, read from the server (oracy_order_promotions_v1) on any device: by the
 * tracking token, or as the signed-in customer's own order. The device's own copy above stays only as the
 * first answer (right after ordering, or with no connection); the server's answer always wins. */
const PROMO_ORDER_FN = "oracy_order_promotions_v1";
const PROMO_ORDER_ASK_MS = 60000;
const promoServer = {rows: new Map(), off: false};
function promoServerClean(answer, id) {
  if (!answer || typeof answer !== "object" || Array.isArray(answer)) return null;
  if (answer.order_id && String(answer.order_id).toLowerCase() !== String(id).toLowerCase()) return null;
  return {id, server: true, has: answer.has_promotions === true, total: cartQuoteNumber(answer.total, NaN),
    discount: Math.max(0, cartQuoteNumber(answer.discount)), promotions: promoOrderClean(answer.promotions),
    addedInFull: answer.added_items_in_full !== false};
}
function promoOrderAsk(id, token) {
  if (promoServer.off || !isMenuId(id) || typeof customerOrderRpc !== "function" || cartQuote.support === "no") return;
  const row = promoServer.rows.get(id);
  if (row && (row.busy || Date.now() - row.at < PROMO_ORDER_ASK_MS)) return;
  promoServer.rows.set(id, {info: row ? row.info : undefined, at: Date.now(), busy: true});
  setTimeout(async () => {
    let info = row ? row.info : undefined;
    try {
      info = promoServerClean(await customerOrderRpc(PROMO_ORDER_FN, {p_order_id: id, p_tracking_token: isMenuId(token) ? token : null}), id);
    } catch (error) {
      if (cartQuoteMissing(error)) promoServer.off = true;    // a database without it: not asked again on this visit
    }
    promoServer.rows.set(id, {info, at: Date.now(), busy: false});
    if (JSON.stringify(info ?? null) !== JSON.stringify(row ? row.info ?? null : null) && typeof state !== "undefined" &&
        ["track", "confirmation", "cart"].includes(state.screen) && typeof renderKeepScroll === "function") renderKeepScroll();
  }, 0);
}
/** The promotions of an order: the server's answer, else this device's copy, else null. */
function promoOrderInfo(id, order, token) {
  promoOrderAsk(id, token || (order && order.trackingToken) || null);
  const server = promoServer.rows.get(id);
  if (server && server.info) return server.info;
  if (order && order.quoted && Array.isArray(order.promotions)) return {id, total: order.total, discount: order.discount || 0, promotions: promoOrderClean(order.promotions)};
  const kept = promoOrderList().find(row => row.id === id);
  return kept ? {...kept, promotions: promoOrderClean(kept.promotions)} : null;
}
/** "Lunch 10%  − SAR 7.00" rows for an order's card (escaped), or "". */
function promoOrderRows(id, order) {
  const info = promoOrderInfo(id, order);
  if (!info || !info.promotions.length) return "";
  return `<div class="pq-order" role="group" aria-label="${cartQuoteCopy("Offers applied", "العروض المطبقة")}">${info.promotions.map(p =>
    `<div class="pq-order-row"><span>${escapeHtml(cartQuotePromoText(p))}</span><span>− ${cartQuoteMoney(p.amount)}</span></div>${promoLicenceMarkup(p)}`).join("")}</div>`;
}
/** The same rows and the saved total, for the confirmation and the tracking card of this device's order. */
function promoOrderBlock(order) {
  if (!order || !order.quoted || !isMenuId(order.backendId)) return "";
  const info = promoOrderInfo(order.backendId, order);
  const total = cartQuoteNumber(info && info.server && Number.isFinite(info.total) ? info.total : order.total, NaN);
  return `${promoOrderRows(order.backendId, order)}${Number.isFinite(total) ? `<div class="pq-order-total"><span>${t("total")}</span><strong>${cartQuoteMoney(total)}</strong></div>` : ""}`;
}
/** Contract 10 and C5 (added_items_in_full): items added to an order are charged in full. Said in the add-on sheet when it matters. */
function promoAddonNote(id) {
  const own = typeof state !== "undefined" && state.order && state.order.backendId === id ? state.order : null;
  const token = typeof state !== "undefined" && state.addonFor && state.addonFor.id === id ? state.addonFor.token : null;
  const info = promoOrderInfo(id, own, token);
  const given = Boolean(info && info.promotions.length && info.addedInFull !== false);
  const live = typeof promoLiveNow === "function" && promoLiveNow().length > 0;
  if (!given && !live) return "";
  return `<p class="addon-cart-hint pq-addon-note" role="note">${cartQuoteCopy("Offers are not applied to added items.", "لا تُطبَّق العروض على الأصناف المضافة.")}</p>`;
}

if (typeof setInterval === "function") setInterval(() => { if (cartQuoteVisible()) cartQuoteSync(); }, 20000);
if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("online", () => cartQuoteStale());
  Object.assign(window, {cartQuoteRetry, cartQuoteConfirmChange, cartQuoteCloseChange});
}
if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
  document.addEventListener("visibilitychange", () => { if (!document.hidden && Date.now() - cartQuote.at > 30000) cartQuoteStale(); });
}
