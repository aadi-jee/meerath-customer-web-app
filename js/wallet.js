/* Release A (415): the customer wallet — coupons and points in one place ("Rewards").
 *
 *  - The server owns every coupon and every number (oracy_customer_wallet_v1, API-A section 2.2).
 *    This file only shows them.
 *  - A coupon is an ordinary voucher. "Use now" puts its code into the existing code field and runs
 *    the existing Apply (applyCoupon -> the price engine). Nothing here computes a discount.
 *  - features.wallet (oracy_ordering_status_v1) is the switch. A server without the key (before 415)
 *    is never asked for the wallet. With the key present but false, the wallet is still asked for the
 *    points progress bar only (the answer then has "enabled": false and still carries "points").
 *  - The welcome sheet is shown once per account on this device (localStorage, guarded).
 */
const WALLET_FN = "oracy_customer_wallet_v1";
const WALLET_STALE_MS = 20000;                       // the same freshness as the points summary
const WALLET_CODE = /^[A-Za-z0-9_-]{3,24}$/;         // the restaurant's voucher code rule (live check)
const WALLET_ZONE = "Asia/Riyadh";
const walletState = {
  data: null,          // the cleaned answer
  for: "",             // auth user the answer belongs to
  at: 0,
  loading: null,       // the request on its way
  triedFor: "", triedAt: 0,
  error: "",
  pendingCode: "",     // "Use now" with an empty cart: applied when the cart has items
  welcomeSeen: new Set(),
  welcomeReturn: null, // the element that had focus before the sheet
};

function walletCopy(en, ar) { return typeof state !== "undefined" && state.lang === "ar" ? ar : en; }
function walletNumber(value, fallback = 0) {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}
function walletNow() { return typeof orderingNow === "function" ? orderingNow() : Date.now(); }

// ---------- the switch ----------
function walletFeatures() {
  const f = typeof orderingHours !== "undefined" ? orderingHours.status?.features : null;
  return f && typeof f === "object" ? f : null;
}
/** The server has 415 (the status answer names "wallet", on or off). */
function walletServerHas() {
  const f = walletFeatures();
  return Boolean(f && Object.prototype.hasOwnProperty.call(f, "wallet"));
}
/** The wallet UI: switched on by the server for this restaurant, and codes can be used here. */
function walletOn() {
  const f = walletFeatures();
  if (!f || f.wallet !== true) return false;
  if (typeof featureOn === "function" && (!featureOn("app") || !featureOn("vouchers"))) return false;
  if (typeof tableGuestOn === "function" && tableGuestOn()) return false;   // a guest at a table has no codes
  return true;
}
function walletTabOn() { return walletOn(); }

// ---------- loading ----------
/** The answer, cleaned: only known words, numbers as numbers, codes that may be shown and sent. */
function walletClean(answer) {
  if (!answer || typeof answer !== "object") return null;
  const word = (value, list, fallback) => (list.includes(value) ? value : fallback);
  const text = (value, max) => (typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, " ").trim().slice(0, max) : "");
  const coupons = (Array.isArray(answer.coupons) ? answer.coupons : []).slice(0, 30)
    .filter(c => c && typeof c.code === "string" && WALLET_CODE.test(c.code))
    .map(c => ({
      code: c.code.toUpperCase(),
      source: word(c.source, ["welcome", "second_order", "restaurant"], "restaurant"),
      kind: word(c.kind, ["percent", "amount"], "amount"),
      value: walletNumber(c.value),
      max_discount: c.max_discount == null ? null : walletNumber(c.max_discount, null),
      min_food: Math.max(0, walletNumber(c.min_food)),
      starts_at: typeof c.starts_at === "string" ? c.starts_at : null,
      ends_at: typeof c.ends_at === "string" && Number.isFinite(Date.parse(c.ends_at)) ? c.ends_at : null,
      used_at: typeof c.used_at === "string" && Number.isFinite(Date.parse(c.used_at)) ? c.used_at : null,
      state: word(c.state, ["ready", "used", "expired"], "expired"),
      title_en: text(c.title_en, 120),
      title_ar: text(c.title_ar, 120),
    }))
    .filter(c => c.value > 0);
  const p = answer.points && typeof answer.points === "object" && answer.points.enabled !== false ? answer.points : null;
  const points = p ? {
    balance: Math.max(0, Math.trunc(walletNumber(p.balance))),
    usable_points: Math.max(0, Math.trunc(walletNumber(p.usable_points))),
    usable_value: Math.max(0, walletNumber(p.usable_value)),
    next_step_points: Math.max(0, Math.trunc(walletNumber(p.next_step_points))),
    points_to_next: Math.max(0, Math.trunc(walletNumber(p.points_to_next))),
    next_step_value: Math.max(0, walletNumber(p.next_step_value)),
    min_redeem_points: Math.max(0, Math.trunc(walletNumber(p.min_redeem_points))),
    redeem_step_points: Math.max(0, Math.trunc(walletNumber(p.redeem_step_points))),
    valid_until: typeof p.valid_until === "string" ? p.valid_until : null,
  } : null;
  return {enabled: answer.enabled === true, member: answer.member !== false, coupons, points};
}
/** The answer for the account signed in now, or null. */
function walletData() {
  if (typeof state === "undefined" || !state.isLoggedIn || !walletState.data || walletState.for !== state.authUserId) return null;
  return walletState.data;
}
async function loadWallet(force = false) {
  if (typeof state === "undefined" || !state.isLoggedIn || !walletServerHas()) return null;
  if (walletState.loading) return walletState.loading;
  if (!force && walletData() && Date.now() - walletState.at < WALLET_STALE_MS) return walletState.data;
  const user = state.authUserId;
  walletState.loading = (async () => {
    try {
      const answer = await customerOrderRpc(WALLET_FN, {p_restaurant_id: MENU_CONFIG.restaurantId});
      if (user === state.authUserId) {
        walletState.data = walletClean(answer);
        walletState.for = user;
        walletState.at = Date.now();
        walletState.error = "";
      }
    } catch (error) {
      if (user === state.authUserId) walletState.error = String(error?.message || "error");
    } finally {
      walletState.loading = null;
      walletState.triedFor = user;
      walletState.triedAt = Date.now();
    }
    return walletData();
  })();
  return walletState.loading;
}
/** Asked at most once per 20 s for the account signed in now, then onReady. Never loops. */
function walletEnsureLoaded(onReady) {
  if (typeof state === "undefined" || !state.isLoggedIn || !walletServerHas() || walletState.loading) return;
  if (walletState.triedFor === state.authUserId && Date.now() - walletState.triedAt < WALLET_STALE_MS) return;
  walletState.triedFor = state.authUserId;   // no second request from the next draw while this one waits
  walletState.triedAt = Date.now();
  setTimeout(async () => {
    await loadWallet(true);
    if (typeof onReady === "function") onReady();
  }, 0);
}
function walletRetry() {
  walletState.triedAt = 0; walletState.error = "";
  loadWallet(true).then(() => { if (state.screen === "rewards" && typeof renderKeepScroll === "function") renderKeepScroll(); });
  if (typeof renderKeepScroll === "function") renderKeepScroll();
}
/** An order was just placed: the coupons are read again on the next look (the used one is not offered again). */
function walletStale() {
  walletState.pendingCode = "";
  Object.assign(walletState, {data: null, for: "", at: 0, triedAt: 0});
}
/** The status answer (features) is here, or 8 s have passed. */
function walletStatusReady() {
  return new Promise((resolve) => {
    let tries = 0;
    const check = () => {
      if (typeof orderingHours === "undefined" || orderingHours.status || ++tries > 32) resolve();
      else setTimeout(check, 250);
    };
    check();
  });
}

// ---------- words (pure, tested) ----------
function walletAmount(value) {
  const n = Math.round(walletNumber(value) * 100) / 100;
  const sar = typeof t === "function" ? t("sar") : "SAR";
  return `${sar} ${Number.isInteger(n) ? n : n.toFixed(2)}`;
}
/** The big words of a coupon: "15% off" / "SAR 10 off". */
function walletValueText(c) {
  if (!c) return "";
  if (c.kind === "percent") {
    const v = Math.round(walletNumber(c.value) * 100) / 100;
    return walletCopy(`${v}% off`, `خصم ${v}%`);
  }
  return walletCopy(`${walletAmount(c.value)} off`, `خصم ${walletAmount(c.value)}`);
}
function walletCapText(c) {
  return c && c.kind === "percent" && c.max_discount != null && c.max_discount > 0
    ? walletCopy(`Up to ${walletAmount(c.max_discount)}`, `حتى ${walletAmount(c.max_discount)}`) : "";
}
function walletMinText(c) {
  return c && c.min_food > 0
    ? walletCopy(`On orders from ${walletAmount(c.min_food)}`, `للطلبات من ${walletAmount(c.min_food)}`)
    : walletCopy("No minimum order", "بدون حد أدنى للطلب");
}
function walletSourceText(c) {
  return ({
    welcome: walletCopy("Welcome gift", "هدية ترحيب"),
    second_order: walletCopy("Thank you", "شكراً لك"),
  })[c?.source] || walletCopy("From the restaurant", "من المطعم");
}
/** The server's title in the customer's language, or the value words. */
function walletTitle(c) {
  const own = walletCopy(c?.title_en, c?.title_ar) || c?.title_en || "";
  return own || walletValueText(c);
}
function walletDayNumber(ms) {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", {year: "numeric", month: "2-digit", day: "2-digit", timeZone: WALLET_ZONE})
    .format(new Date(ms)).split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}
function walletTime(ms) {
  return new Intl.DateTimeFormat(state.lang === "ar" ? "ar-SA" : "en-US",
    {hour: "numeric", minute: "2-digit", hour12: true, timeZone: WALLET_ZONE}).format(new Date(ms));
}
function walletDate(value) {
  if (typeof rewardsDate === "function") return rewardsDate(value);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat(state.lang === "ar" ? "ar-SA" : "en-GB",
    {day: "numeric", month: "short", year: "numeric", timeZone: WALLET_ZONE}).format(d);
}
function walletArDays(n) {
  if (n === 2) return "تنتهي خلال يومين";
  return n <= 10 ? `تنتهي خلال ${n} أيام` : `تنتهي خلال ${n} يوماً`;
}
/** "Ends today 9:30 PM" · "Ends tomorrow 1:00 PM" · "Ends in 3 days" · "Ends 24 Oct 2026" · "Used" · "Ended …". */
function walletEndsText(c, now = walletNow()) {
  if (!c) return "";
  if (c.state === "used") {
    return c.used_at ? walletCopy(`Used on ${walletDate(c.used_at)}`, `استُخدمت في ${walletDate(c.used_at)}`) : walletCopy("Used", "مستخدمة");
  }
  const ends = c.ends_at ? Date.parse(c.ends_at) : NaN;
  if (c.state === "expired") {
    return Number.isFinite(ends) && ends <= now ? walletCopy(`Ended on ${walletDate(c.ends_at)}`, `انتهت في ${walletDate(c.ends_at)}`)
      : walletCopy("No longer available", "لم تعد متاحة");
  }
  if (!Number.isFinite(ends)) return walletCopy("No end date", "بدون تاريخ انتهاء");
  const days = walletDayNumber(ends) - walletDayNumber(now);
  if (days <= 0) return walletCopy(`Ends today ${walletTime(ends)}`, `تنتهي اليوم ${walletTime(ends)}`);
  if (days === 1) return walletCopy(`Ends tomorrow ${walletTime(ends)}`, `تنتهي غداً ${walletTime(ends)}`);
  if (days < 14) return walletCopy(`Ends in ${days} days`, walletArDays(days));
  return walletCopy(`Ends ${walletDate(c.ends_at)}`, `تنتهي في ${walletDate(c.ends_at)}`);
}
function walletUrgent(c, now = walletNow()) {
  const ends = c?.ends_at ? Date.parse(c.ends_at) : NaN;
  return c?.state === "ready" && Number.isFinite(ends) && ends - now <= 24 * 3600000;
}
/** Points progress from the server's own numbers: {pct, text, ready}. null = no bar. */
function walletProgress(p) {
  if (!p || !(p.next_step_points > 0) || !(p.next_step_value > 0)) return null;
  const next = p.next_step_points, step = p.redeem_step_points;
  // the bar runs from the step the customer already has (or 0) to the next one
  const prev = step > 0 ? next - step : 0;
  const base = prev > 0 && prev >= p.min_redeem_points ? prev : 0;
  const toNext = Math.max(0, p.points_to_next);
  const pct = toNext <= 0 ? 100 : Math.max(0, Math.min(100, Math.round((p.balance - base) / (next - base) * 100)));
  const text = toNext > 0
    ? walletCopy(`${toNext} points to ${walletAmount(p.next_step_value)} off`, `${toNext} نقطة متبقية لخصم ${walletAmount(p.next_step_value)}`)
    : walletCopy(`${walletAmount(p.next_step_value)} off is ready to use`, `خصم ${walletAmount(p.next_step_value)} جاهز للاستخدام`);
  return {pct, text, toNext, next, base};
}
function walletSplit(coupons) {
  const list = Array.isArray(coupons) ? coupons : [];
  return {ready: list.filter(c => c.state === "ready"), past: list.filter(c => c.state !== "ready")};
}
/** Food in the cart (line prices already include item offers), in halalas. */
function walletCartFoodCents() {
  return (state.cart || []).reduce((n, l) => n + Math.round(walletNumber(l.price) * 100) * (l.qty || 0), 0);
}
/** The coupon to offer in the cart: the first ready one that fits, else the one closest to fitting. */
function walletCartPick(coupons, foodCents, hasItemOffer) {
  // automatic coupons are "not with item offers" (API-A 2.3); the server decides for the restaurant's own
  const usable = (coupons || []).filter(c => c.state === "ready" && !(hasItemOffer && c.source !== "restaurant"));
  if (!usable.length) return null;
  const fits = usable.find(c => Math.round(c.min_food * 100) <= foodCents);
  if (fits) return {coupon: fits, missingCents: 0};
  const near = usable.reduce((a, b) => (b.min_food < a.min_food ? b : a));
  return {coupon: near, missingCents: Math.round(near.min_food * 100) - foodCents};
}

// ---------- "Use now" ----------
function walletCouponAt(index) {
  const d = walletData();
  const c = d && Number.isInteger(index) ? d.coupons[index] : null;
  return c && c.state === "ready" && WALLET_CODE.test(c.code) ? c : null;
}
/** Put the code into the existing field and Apply it there. An empty cart keeps it for the cart. */
function walletUseNow(index) {
  const c = walletCouponAt(Number(index));
  walletWelcomeClose(true);
  if (!c) return;
  state.coupon = c.code;
  if (typeof tableGuestOn === "function" && tableGuestOn()) return;
  if (!Array.isArray(state.cart) || !state.cart.length) {
    walletState.pendingCode = c.code;
    if (typeof toast === "function") toast(walletCopy("Add your dishes — the coupon is applied in your cart.", "أضف أطباقك — تُطبَّق القسيمة في سلتك."), 4000);
    if (typeof go === "function") go("menu");
    return;
  }
  walletState.pendingCode = "";
  if (typeof go === "function" && state.screen !== "cart") go("cart");
  if (typeof applyCoupon === "function") return applyCoupon();
}
/** The cart is drawn with items and a code is waiting from "Use now": apply it once. */
function walletApplyPending() {
  const code = walletState.pendingCode;
  if (!code || !state.isLoggedIn || state.screen !== "cart" || !state.cart.length || state.couponOn) return;
  if ((typeof addonTarget === "function" && addonTarget()) || (typeof tableGuestOn === "function" && tableGuestOn())) return;
  walletState.pendingCode = "";
  state.coupon = code;
  if (typeof applyCoupon === "function") applyCoupon();
}

// ---------- markup ----------
const WALLET_TICKET_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v3a2 2 0 0 0 0 4v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a2 2 0 0 0 0-4z"></path><path d="M14.5 6v2M14.5 11v2M14.5 16v2"></path></svg>`;
const WALLET_GIFT_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="9" width="17" height="11" rx="2"></rect><path d="M2.5 9h19v4h-19zM12 9v11"></path><path d="M12 9c-1.5-3.5-5-4.5-5.5-2S9.5 9 12 9c2.5 0 5.5-.5 5.5-2.5S13.5 5.5 12 9z"></path></svg>`;

function walletCouponCard(c, index, past) {
  const urgent = !past && walletUrgent(c);
  const cap = walletCapText(c);
  const stateWord = c.state === "used" ? walletCopy("Used", "مستخدمة") : walletCopy("Expired", "منتهية");
  const canUse = !past && (typeof featureOn !== "function" || featureOn("vouchers"));
  return `<article class="wallet-coupon${past ? " is-past" : ""}${urgent ? " is-urgent" : ""} wallet-src-${c.source}">
    <div class="wallet-coupon-value"><strong>${escapeHtml(walletValueText(c))}</strong>${cap ? `<small>${escapeHtml(cap)}</small>` : ""}</div>
    <div class="wallet-coupon-body">
      <span class="wallet-coupon-tag">${escapeHtml(walletSourceText(c))}</span>
      <h4>${escapeHtml(walletTitle(c))}</h4>
      <p>${escapeHtml(walletMinText(c))}</p>
      <p class="wallet-coupon-ends">${escapeHtml(walletEndsText(c))}</p>
      <div class="wallet-coupon-foot">
        <code dir="ltr" aria-label="${escapeHtml(walletCopy("Code", "الكود"))}">${escapeHtml(c.code)}</code>
        ${past ? `<span class="wallet-coupon-state">${stateWord}</span>`
          : canUse ? `<button type="button" class="btn btn-primary wallet-use" onclick="walletUseNow(${index})">${walletCopy("Use now", "استخدمها الآن")}</button>` : ""}
      </div>
    </div>
  </article>`;
}
function walletEmptyMarkup(hasPast) {
  return `<div class="wallet-empty">
    <span class="wallet-empty-icon">${WALLET_TICKET_ICON}</span>
    <strong>${walletCopy("No coupons right now", "لا توجد قسائم حالياً")}</strong>
    <p>${hasPast ? walletCopy("Your new coupons will appear here.", "ستظهر قسائمك الجديدة هنا.")
      : walletCopy("When the restaurant gives you a coupon, it appears here, ready to use.", "عندما يمنحك المطعم قسيمة، تظهر هنا جاهزة للاستخدام.")}</p>
  </div>`;
}
function walletCouponsMarkup(d) {
  const all = d.coupons;
  const {ready, past} = walletSplit(all);
  const idx = c => all.indexOf(c);
  return `<section class="wallet-section" aria-labelledby="walletReadyTitle">
      <h3 class="wallet-h" id="walletReadyTitle">${walletCopy("Your coupons", "قسائمك")}${ready.length ? ` <span class="wallet-count">${ready.length}</span>` : ""}</h3>
      ${ready.length ? `<div class="wallet-list">${ready.map(c => walletCouponCard(c, idx(c), false)).join("")}</div>` : walletEmptyMarkup(past.length > 0)}
    </section>
    ${past.length ? `<section class="wallet-section wallet-past" aria-labelledby="walletPastTitle">
      <h3 class="wallet-h" id="walletPastTitle">${walletCopy("Past", "السابقة")}</h3>
      <div class="wallet-list">${past.map(c => walletCouponCard(c, idx(c), true)).join("")}</div>
    </section>` : ""}`;
}
function walletSkeletonMarkup() {
  return `<div class="wallet-list" aria-busy="true" aria-label="${walletCopy("Loading your coupons…", "جارٍ تحميل قسائمك…")}">
    <div class="wallet-coupon wallet-skeleton"></div><div class="wallet-coupon wallet-skeleton"></div></div>`;
}
/** The progress bar under the points (the points card of rewards.js draws it). "" = no bar. */
function walletProgressMarkup() {
  if (typeof state === "undefined" || !state.isLoggedIn || !walletServerHas()) return "";
  const d = walletData();
  if (!d) {
    walletEnsureLoaded(() => { if (state.screen === "rewards" && typeof renderKeepScroll === "function") renderKeepScroll(); });
    return "";
  }
  const p = walletProgress(d.points);
  if (!p) return "";
  return `<div class="wallet-progress">
    <div class="wallet-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p.pct}" aria-valuetext="${escapeHtml(p.text)}">
      <span style="width:${p.pct}%"></span></div>
    <p>${escapeHtml(p.text)}</p>
  </div>`;
}
/** The Rewards hub with the wallet on: coupons first, then the points (when the programme is on). */
function walletScreenMarkup() {
  const top = `<div class="topbar">${back("account")}<h2>${brandedRewardsLabel()}</h2>${langSwitch()}</div>`;
  if (!state.isLoggedIn) {
    return `<section class="screen rewards-screen wallet-screen">${top}
      <div class="wallet-empty wallet-signin">
        <span class="wallet-empty-icon">${WALLET_GIFT_ICON}</span>
        <strong>${walletCopy("Your coupons and points live here", "قسائمك ونقاطك هنا")}</strong>
        <p>${walletCopy("Sign in with your mobile to see them and use them on your order.", "سجّل الدخول برقم جوالك لعرضها واستخدامها في طلبك.")}</p>
        <button class="btn btn-primary" onclick="go('signInPage')">${t("signInCreate")}</button>
      </div></section>${nav("account")}`;
  }
  walletEnsureLoaded(() => { if (state.screen === "rewards" && typeof renderKeepScroll === "function") renderKeepScroll(); });
  const d = walletData();
  const points = typeof rewardsOn === "function" && rewardsOn();
  const s = (typeof rewardsState !== "undefined" && rewardsState.summary) || {};
  let coupons;
  if (d) coupons = walletCouponsMarkup(d);
  else if (walletState.error && !walletState.loading) {
    coupons = `<div class="wallet-empty" role="alert"><strong>${walletCopy("Could not load your coupons.", "تعذر تحميل قسائمك.")}</strong>
      <button type="button" class="btn btn-ghost" onclick="walletRetry()">${walletCopy("Try again", "حاول مرة أخرى")}</button></div>`;
  } else coupons = walletSkeletonMarkup();
  return `<section class="screen rewards-screen wallet-screen">${top}
    ${coupons}
    ${points && typeof rewardsPointsCardMarkup === "function" ? `<h3 class="wallet-h">${walletCopy("Your points", "نقاطك")}</h3>${rewardsPointsCardMarkup(s)}` : ""}
    ${points && typeof rewardsDetailsMarkup === "function" ? rewardsDetailsMarkup(rewardsState.rules, s) : ""}
  </section>${nav("account")}`;
}
/** Account screen (signed in): "My coupons · 2 ready to use". */
function walletAccountCardMarkup() {
  if (!walletOn() || !state.isLoggedIn) return "";
  walletEnsureLoaded(() => { if (state.screen === "account" && typeof renderKeepScroll === "function") renderKeepScroll(); });
  const d = walletData();
  const ready = d ? walletSplit(d.coupons).ready : [];
  const line = !d ? walletCopy("See your coupons", "اعرض قسائمك")
    : ready.length === 1 ? walletCopy("1 coupon ready to use", "قسيمة واحدة جاهزة للاستخدام")
    : ready.length ? walletCopy(`${ready.length} coupons ready to use`, `${ready.length} قسائم جاهزة للاستخدام`)
    : walletCopy("No coupons right now", "لا توجد قسائم حالياً");
  const soon = ready[0] ? walletEndsText(ready[0]) : "";
  const title = typeof rewardsOn === "function" && rewardsOn() ? "" : `<div class="account-section-title">${brandedRewardsLabel()}</div>`;
  return `${title}<button class="account-rewards-card wallet-account-card" onclick="go('rewards')">
      <span class="account-reward-icon">${WALLET_TICKET_ICON}</span>
      <div class="account-reward-copy"><strong>${walletCopy("My coupons", "قسائمي")}</strong><span>${escapeHtml(line)}</span>
        ${soon ? `<small class="${walletUrgent(ready[0]) ? "rewards-expiring" : ""}">${escapeHtml(soon)}</small>` : ""}</div>
      <span class="account-arrow">›</span>
    </button>`;
}
/** Account screen (visitor), when points are off but the wallet is on: one sign-in card. */
function walletGuestCardMarkup() {
  if (!walletOn() || state.isLoggedIn || (typeof rewardsOn === "function" && rewardsOn())) return "";
  return `<div class="account-section-title">${brandedRewardsLabel()}</div>
    <button class="account-rewards-card wallet-account-card" onclick="go('signInPage')">
      <span class="account-reward-icon">${WALLET_TICKET_ICON}</span>
      <div class="account-reward-copy"><strong>${walletCopy("My coupons", "قسائمي")}</strong>
        <span>${walletCopy("Sign in to see your coupons.", "سجّل الدخول لعرض قسائمك.")}</span></div>
      <span class="account-arrow">›</span>
    </button>`;
}

// ---------- the cart: "You have a coupon" ----------
function walletNudgeInner() {
  if (!walletOn() || !state.isLoggedIn || !Array.isArray(state.cart) || !state.cart.length) return "";
  if (typeof addonTarget === "function" && addonTarget()) return "";
  const typed = String(state.coupon || "").trim();
  const quoteCode = typeof cartQuote !== "undefined" ? cartQuote.code : "";
  if (state.couponOn || quoteCode || typed || walletState.pendingCode) return "";   // a code is being used or checked
  const d = walletData();
  if (!d) {
    walletEnsureLoaded(() => walletNudgeRefresh());
    return "";
  }
  const hasItemOffer = state.cart.some(l => typeof itemById === "function" && itemById(l.id)?.offer);
  const pick = walletCartPick(d.coupons, walletCartFoodCents(), hasItemOffer);
  if (!pick) return "";
  const c = pick.coupon, index = d.coupons.indexOf(c), value = walletValueText(c);
  if (pick.missingCents > 0) {
    const more = money(pick.missingCents / 100);
    return `<div class="wallet-nudge is-short" role="status"><span class="wallet-nudge-icon">${WALLET_TICKET_ICON}</span>
      <div class="wallet-nudge-copy"><strong>${escapeHtml(walletCopy(`Add ${more} more to use your coupon`, `أضف ${more} لاستخدام قسيمتك`))}</strong>
        <small>${escapeHtml(`${value} · ${walletEndsText(c)}`)}</small></div></div>`;
  }
  return `<div class="wallet-nudge" role="status"><span class="wallet-nudge-icon">${WALLET_TICKET_ICON}</span>
    <div class="wallet-nudge-copy"><strong>${escapeHtml(walletCopy(`You have a coupon: ${value}.`, `لديك قسيمة: ${value}.`))}</strong>
      <small>${escapeHtml(walletEndsText(c))}</small></div>
    <button type="button" class="btn btn-primary wallet-nudge-use" onclick="walletUseNow(${index})">${walletCopy("Use it", "استخدمها")}</button></div>`;
}
/** The cart's coupon line (app.js draws it above the code field). Also applies a code waiting from "Use now". */
function walletCartMarkup() {
  if (walletState.pendingCode) setTimeout(walletApplyPending, 0);
  return `<div id="walletNudge">${walletNudgeInner()}</div>`;
}
function walletNudgeRefresh() {
  if (typeof document === "undefined" || typeof document.getElementById !== "function") return;
  const box = document.getElementById("walletNudge");
  if (!box || !("innerHTML" in box)) return;
  const next = walletNudgeInner();
  if (box.innerHTML !== next) box.innerHTML = next;
}

// ---------- the welcome sheet ----------
function walletWelcomeKey(userId) { return appStorageKey(`walletWelcome.${userId}`); }
function walletWelcomeSeen(userId) {
  if (walletState.welcomeSeen.has(userId)) return true;
  try { return localStorage.getItem(walletWelcomeKey(userId)) === "1"; } catch (_) { return false; }
}
function walletWelcomeRemember(userId) {
  walletState.welcomeSeen.add(userId);
  try { localStorage.setItem(walletWelcomeKey(userId), "1"); } catch (_) { /* this visit still remembers */ }
}
/** After sign-up or sign-in: a ready welcome coupon not yet shown on this device opens the sheet. */
async function walletWelcomeCheck() {
  if (typeof state === "undefined" || !state.isLoggedIn) return false;
  const user = state.authUserId;
  if (!user || walletWelcomeSeen(user)) return false;
  if (typeof orderingHours !== "undefined" && !orderingHours.status) await walletStatusReady();
  if (!walletOn()) return false;
  const d = await loadWallet(true);
  if (!d || user !== state.authUserId || walletWelcomeSeen(user)) return false;
  const c = d.coupons.find(x => x.source === "welcome" && x.state === "ready");
  if (!c) return false;
  if (["checkout", "confirmation", "otpPage"].includes(state.screen)) return false;   // never over an order being placed
  walletWelcomeRemember(user);
  walletWelcomeOpen(c, d.coupons.indexOf(c));
  return true;
}
function walletWelcomeMarkup(c, index) {
  const cap = walletCapText(c);
  return `<div class="cx-sheet wallet-welcome" id="walletWelcome" role="dialog" aria-modal="true" aria-labelledby="walletWelcomeTitle" aria-describedby="walletWelcomeWhat"
      onkeydown="if(event.key==='Escape'){event.preventDefault();walletWelcomeClose()}">
    <button type="button" class="cx-sheet-backdrop" onclick="walletWelcomeClose()" aria-label="${walletCopy("Close", "إغلاق")}"></button>
    <div class="cx-sheet-panel wallet-welcome-panel">
      <div class="cx-sheet-grip" aria-hidden="true"></div>
      <div class="wallet-confetti" aria-hidden="true">${"<i></i>".repeat(12)}</div>
      <span class="wallet-welcome-icon" aria-hidden="true">${WALLET_GIFT_ICON}</span>
      <h3 id="walletWelcomeTitle">${walletCopy("A welcome gift for you", "هدية ترحيب لك")}</h3>
      <p class="wallet-welcome-value">${escapeHtml(walletValueText(c))}</p>
      <p class="wallet-welcome-what" id="walletWelcomeWhat">${escapeHtml([walletMinText(c), cap].filter(Boolean).join(" · "))}<br>
        <span>${escapeHtml(walletEndsText(c))}</span></p>
      <code dir="ltr" class="wallet-welcome-code">${escapeHtml(c.code)}</code>
      <button type="button" class="btn btn-primary wallet-welcome-use" onclick="walletUseNow(${index})">${walletCopy("Use now", "استخدمها الآن")}</button>
      <button type="button" class="btn btn-ghost" onclick="walletWelcomeClose()">${walletCopy("Later", "لاحقاً")}</button>
      <p class="wallet-welcome-note">${escapeHtml(walletCopy(`It stays in ${t("rewards")} until it ends.`, `تبقى في ${t("rewards")} حتى تنتهي.`))}</p>
    </div></div>`;
}
function walletWelcomeOpen(c, index) {
  if (typeof document === "undefined" || typeof document.querySelector !== "function") return;
  walletWelcomeClose(true);
  walletState.welcomeReturn = document.activeElement || null;
  const host = document.querySelector(".phone") || document.body;
  if (!host) return;
  host.insertAdjacentHTML("beforeend", walletWelcomeMarkup(c, index));
  const use = document.querySelector("#walletWelcome .wallet-welcome-use");
  if (use && typeof use.focus === "function") use.focus({preventScroll: true});
}
function walletWelcomeClose(quiet) {
  if (typeof document === "undefined" || typeof document.getElementById !== "function") return;
  const sheet = document.getElementById("walletWelcome");
  if (!sheet) return;
  sheet.remove();
  const back = walletState.welcomeReturn;
  walletState.welcomeReturn = null;
  if (!quiet && back && typeof back.focus === "function" && back.isConnected !== false) back.focus({preventScroll: true});
}

// ---------- opened from a link or a notification (?wallet=1) ----------
async function walletOpen() {
  await walletStatusReady();
  if (typeof go === "function") go("rewards");
  if (state.isLoggedIn && walletServerHas()) {
    await loadWallet(true);
    if (state.screen === "rewards" && typeof renderKeepScroll === "function") renderKeepScroll();
  }
}

/* The switches arrive after the first draw (and after a reload that stays on Rewards): once they say
 * the wallet is on, the screen that shows it is drawn again. Asked every 0.5 s for at most 30 s. */
function walletWatchSwitch() {
  let tries = 0;
  const check = () => {
    if (typeof orderingHours !== "undefined" && orderingHours.status) {
      if (walletOn() && ["rewards", "account", "home"].includes(state.screen) && typeof renderKeepScroll === "function") renderKeepScroll();
      return;
    }
    if (++tries <= 60) setTimeout(check, 500);
  };
  check();
}
if (typeof window !== "undefined") {
  if (typeof window.addEventListener === "function") window.addEventListener("load", walletWatchSwitch);
  window.walletUseNow = walletUseNow;
  window.walletRetry = walletRetry;
  window.walletWelcomeClose = walletWelcomeClose;
}
