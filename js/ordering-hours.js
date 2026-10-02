/* Batch H: ordering hours. The server decides (oracy_ordering_status_v1); this file only
   shows what the server will accept. If the answer cannot be loaded the app stays usable
   and the server still refuses an order outside the hours. */
const orderingHours = {status: null, skew: 0, loading: null, started: false, boundary: null, retry: null};

function orderingCopy(en, ar) { return state.lang === "ar" ? ar : en; }
function orderingNow() { return Date.now() + orderingHours.skew; }

/** The branch the app is ordering from: fixed in the brand settings, or the one the menu chose. */
function orderingBranchId() {
  if (MENU_CONFIG.branchId) return MENU_CONFIG.branchId;
  try {
    const branches = typeof menuConnection !== "undefined" ? menuConnection.payload?.branches || [] : [];
    return branches.length && typeof selectMenuBranch === "function" ? selectMenuBranch(branches) || "" : "";
  } catch (_) { return ""; }
}
async function loadOrderingHours() {
  if (orderingHours.loading) return orderingHours.loading;
  const branchId = orderingBranchId();
  if (!branchId) {
    // The menu has not told us the branch yet: ask again shortly.
    clearTimeout(orderingHours.retry);
    orderingHours.retry = setTimeout(loadOrderingHours, 1500);
    return;
  }
  orderingHours.loading = (async () => {
    try {
      const response = await fetch(`${MENU_CONFIG.url}/rest/v1/rpc/oracy_ordering_status_v1`, {
        method: "POST",
        headers: {apikey: MENU_CONFIG.publicKey, "Content-Type": "application/json"},
        body: JSON.stringify({p_restaurant_id: MENU_CONFIG.restaurantId, p_branch_id: branchId}),
        cache: "no-store", credentials: "omit",
      });
      if (!response.ok) return;
      const status = await response.json();
      if (!status || status.version !== 1) return;
      const before = orderingSignature();
      orderingHours.status = status;
      const serverNow = Date.parse(status.now);
      orderingHours.skew = Number.isFinite(serverNow) ? serverNow - Date.now() : 0;
      orderingScheduleBoundary();
      if (before !== orderingSignature()) orderingRefreshUI();
    } catch (_) { /* keep the last answer */ }
    finally { orderingHours.loading = null; }
  })();
  return orderingHours.loading;
}
function orderingSignature() {
  return ["delivery", "takeaway", "dinein"].map(type => {
    const s = orderingState(type);
    return [s.open, s.reason || "", s.pause_reason || "", s.opens_at || ""].join("|");
  }).join(";");
}
/** What the server said for one order type, corrected for a limit that has passed since it answered. */
function orderingState(type) {
  const raw = orderingHours.status?.[type];
  if (!raw || raw.enforced === false) return {open: true};
  const now = orderingNow();
  if (raw.open && raw.until && now >= Date.parse(raw.until)) return {open: false, reason: "cutoff", opens_at: raw.opens_at};
  if (!raw.open && raw.reason !== "paused" && raw.opens_at && now >= Date.parse(raw.opens_at)) return {open: true};
  return raw;
}
function orderTypeOpen(type = state.orderType) { return orderingState(type).open !== false; }
/** True while at least one order type can be ordered (used for item availability). */
function restaurantAcceptingOrders() {
  return ["delivery", "takeaway", "dinein"].some(type => orderTypeOpen(type));
}
function orderingTypeName(type) {
  return type === "delivery" ? orderingCopy("Delivery", "التوصيل")
    : type === "takeaway" ? orderingCopy("Pick-up", "الاستلام") : orderingCopy("Dine-in", "الطلب داخل المطعم");
}
/** "today at 12:00 PM" / "tomorrow at …" / "Friday at …", in the restaurant's own time. */
function orderingOpensText(iso) {
  const at = Date.parse(iso || "");
  if (!Number.isFinite(at)) return "";
  const zone = orderingHours.status?.timezone || MENU_CONFIG.timeZone;
  const locale = state.lang === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-US";
  const dayKey = ms => new Intl.DateTimeFormat("en-CA", {timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit"}).format(ms);
  const days = Math.round((Date.parse(dayKey(at)) - Date.parse(dayKey(orderingNow()))) / 86400000);
  const time = new Intl.DateTimeFormat(locale, {timeZone: zone, hour: "numeric", minute: "2-digit", hour12: true}).format(at);
  const day = days === 0 ? orderingCopy("today", "اليوم") : days === 1 ? orderingCopy("tomorrow", "غداً")
    : new Intl.DateTimeFormat(locale, {timeZone: zone, weekday: "long"}).format(at);
  return orderingCopy(`${day} at ${time}`, `${day} الساعة ${time}`);
}
function orderingClosedTitle(type = state.orderType) {
  const s = orderingState(type);
  if (s.open !== false) return "";
  if (s.reason === "paused") return orderingCopy(`${orderingTypeName(type)} is paused right now`, `${orderingTypeName(type)} متوقف مؤقتاً`);
  if (s.reason === "cutoff") return orderingCopy(`${orderingTypeName(type)} has closed for now`, `${orderingTypeName(type)} مغلق حالياً`);
  return orderingCopy("Restaurant is currently closed", "المطعم مغلق حالياً");
}
function restaurantClosedMessage(type = state.orderType) {
  const s = orderingState(type);
  if (s.open !== false) return "";
  const opens = orderingOpensText(s.opens_at);
  if (s.reason === "paused") {
    const reason = String(s.pause_reason || "").trim();
    return (reason ? reason.replace(/[.!?؟\s]+$/, "") + ". " : "") +
      orderingCopy("Your cart is saved. Please try again later or choose another order type.",
        "سلتك محفوظة. يرجى المحاولة لاحقاً أو اختيار نوع طلب آخر.");
  }
  const other = ["dinein", "takeaway", "delivery"].find(x => x !== type && orderTypeOpen(x));
  return orderingCopy(
    `Your cart is saved.${opens ? ` You can place this order when we open ${opens}.` : ""}${other ? ` ${orderingTypeName(other)} is still open now.` : ""}`,
    `سلتك محفوظة.${opens ? ` يمكنك إرسال الطلب عند الافتتاح ${opens}.` : ""}${other ? ` ${orderingTypeName(other)} متاح الآن.` : ""}`);
}
function orderingNoticeMarkup(type = state.orderType) {
  if (orderTypeOpen(type)) return "";
  return `<div class="restaurant-closed-notice" role="alert" aria-live="assertive">
    <span class="restaurant-closed-icon" aria-hidden="true">!</span>
    <div><strong>${escapeHtml(orderingClosedTitle(type))}</strong><p>${escapeHtml(restaurantClosedMessage(type))}</p></div></div>`;
}
/** Slim line for Home and the cart while nothing can be ordered. */
function orderingStripMarkup() {
  if (restaurantAcceptingOrders()) return "";
  const s = orderingState("dinein");
  const opens = orderingOpensText(s.opens_at);
  return `<div class="ordering-strip" role="status"><span class="ordering-dot" aria-hidden="true"></span>
    <span><strong>${orderingCopy("Closed now", "مغلق الآن")}</strong>${opens ? ` · ${orderingCopy("Opens", "يفتح")} ${escapeHtml(opens)}` : ""}
    · ${orderingCopy("you can still fill your cart", "يمكنك تجهيز سلتك")}</span></div>`;
}
/** "For later" choices that would fall after the limit of the order type are not offered. */
function orderingLimitTimingOptions(options, type = state.orderType) {
  const s = orderingState(type);
  const until = s.open !== false && s.until ? Date.parse(s.until) : NaN;
  if (!Number.isFinite(until)) return options;
  const now = orderingNow();
  return options.filter(([value]) => value === "asap" || now + Number(value) * 60000 < until);
}
/** A server refusal about the hours: reload the answer and show our own (two-language) words. */
function orderingRefusal(message) {
  if (!/closed now|closed for now|paused right now|within opening hours/i.test(String(message || ""))) return false;
  loadOrderingHours();
  return true;
}
function orderingRefreshUI() {
  if (typeof render !== "function") return;
  if (["home", "cart", "checkout"].includes(state.screen)) {
    if (typeof renderKeepScroll === "function") renderKeepScroll(); else render();
  }
}
/** Re-ask the server right when a limit or an opening is reached. */
function orderingScheduleBoundary() {
  clearTimeout(orderingHours.boundary);
  const now = orderingNow();
  const times = ["delivery", "takeaway", "dinein"].flatMap(type => {
    const raw = orderingHours.status?.[type] || {};
    return [raw.open ? raw.until : null, raw.open ? null : raw.opens_at];
  }).map(x => Date.parse(x || "")).filter(x => Number.isFinite(x) && x > now);
  if (!times.length) return;
  const wait = Math.min(Math.min(...times) - now + 1500, 6 * 3600000);
  orderingHours.boundary = setTimeout(() => { orderingRefreshUI(); loadOrderingHours(); }, wait);
}
function startOrderingHours() {
  if (orderingHours.started) return;
  orderingHours.started = true;
  loadOrderingHours();
  setInterval(() => { if (!document.hidden) loadOrderingHours(); }, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) loadOrderingHours(); });
}
if (typeof window !== "undefined" && typeof document !== "undefined" && window.location?.hostname) {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startOrderingHours);
  else setTimeout(startOrderingHours, 0);
}
