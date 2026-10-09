/* Batch 3a (394): the promotions that are running, for the banners and the quiet badges
 * (API-3A-CONTRACT.md, section 4: oracy_promotions_live_v1). Only automatic promotions are ever
 * listed by the server — never one with a code, never limits or numbers of use.
 *
 * What is shown here is an invitation; whether a promotion is given on a cart is decided by the
 * price function alone (cart-quote.js). Nothing here changes a price. */
const PROMO_LIVE_FN = "oracy_promotions_live_v1";
const PROMO_LIVE_MS = 3 * 60 * 1000;      // "cache a few minutes"
const PROMO_LIVE_RETRY_MS = 30 * 1000;
const PROMO_WEEK = 7 * 86400;
const promoLive = {rows: [], key: "", at: 0, busy: false, off: false, print: "[]", timer: null};
const PROMO_DAYS_EN = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const PROMO_DAYS_AR = ["الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت", "الأحد"];
function promoCopy(en, ar) { return typeof state !== "undefined" && state.lang === "ar" ? ar : en; }
function promoWord(value, max) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, " ").trim().slice(0, max) : "";
}
function promoSeconds(text) {
  const m = /^([01]\d|2[0-4]):([0-5]\d)$/.exec(typeof text === "string" ? text : "");
  if (!m) return null;
  const s = Number(m[1]) * 3600 + Number(m[2]) * 60;
  return s > 86400 ? null : s;
}
/** One row of the server's list, checked; null when it is not the contract's shape. */
function promoLiveClean(row) {
  if (!row || typeof row !== "object" || !isMenuId(row.promotion_id)) return null;
  if (!["percent", "amount", "delivery_percent", "delivery_amount"].includes(row.kind)) return null;
  // 3b: a promotion for the till only (channels ["pos"]) is never an app offer. The server answers per channel;
  // this only guards a row that says its channels and has neither the app nor the tables' QR among them.
  if (Array.isArray(row.channels) && !row.channels.some(c => c === "app" || c === "table_qr")) return null;
  const value = Number(row.value);
  if (!Number.isFinite(value) || value <= 0) return null;
  const hours = (Array.isArray(row.hours) ? row.hours : []).slice(0, 28).map(h => {
    const from = promoSeconds(h?.from), to = promoSeconds(h?.to), day = Number(h?.day);
    return Number.isInteger(day) && day >= 1 && day <= 7 && from !== null && to !== null && from !== to && from < 86400
      ? {day, from, to, fromText: h.from, toText: h.to === "24:00" ? "00:00" : h.to} : null;
  }).filter(Boolean);
  const ends = typeof row.ends_at === "string" && Number.isFinite(Date.parse(row.ends_at)) ? Date.parse(row.ends_at) : null;
  const max = row.max_discount == null ? null : Number(row.max_discount);
  return {
    promotion_id: row.promotion_id.toLowerCase(), name_en: promoWord(row.name_en, 80), name_ar: promoWord(row.name_ar, 80),
    text_en: promoWord(row.text_en, 220), text_ar: promoWord(row.text_ar, 220), kind: row.kind, value,
    max_discount: Number.isFinite(max) && max > 0 ? max : null,
    level: ["item", "order", "delivery"].includes(row.level) ? row.level : "order",
    min_order: Number.isFinite(Number(row.min_order)) && Number(row.min_order) > 0 ? Number(row.min_order) : 0,
    order_types: (Array.isArray(row.order_types) ? row.order_types : []).filter(x => ["dinein", "takeaway", "delivery"].includes(x)),
    hours, ends_at: ends,
    target: ["categories", "items"].includes(row.target) ? row.target : "menu",
    target_ids: (Array.isArray(row.target_ids) ? row.target_ids : []).filter(isMenuId).slice(0, 200).map(id => id.toLowerCase()),
    first_order_only: row.first_order_only === true, sign_in_needed: row.sign_in_needed === true, on_now: row.on_now === true,
    ...(typeof promoLicence === "function" ? promoLicence(row) : {}),   // Licence round (L2)
  };
}
/** The branch's own clock: {day 1 = Monday … 7 = Sunday, seconds since its midnight}. */
function promoClock(date = new Date()) {
  const zone = (typeof orderingHours !== "undefined" && orderingHours.status?.timezone) || MENU_CONFIG.timeZone;
  let parts;
  try {
    parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {timeZone: zone, weekday: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"})
      .formatToParts(date).map(x => [x.type, x.value]));
  } catch (_) { return riyadhClock(date); }
  return {day: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday) + 1,
    seconds: Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second)};
}
function promoChannel() { return typeof tableOn === "function" && tableOn() ? "table_qr" : "app"; }
function promoOrderType() { return typeof tableOn === "function" && tableOn() ? "dinein" : state.orderType; }
function promoBranch() {
  const table = typeof tableOn === "function" ? tableOn() : null;
  if (table && isMenuId(table.branchId)) return table.branchId;
  try { return selectMenuBranch(menuConnection.payload?.branches || []); } catch (_) { return null; }
}
/** Reads the list when it is older than a few minutes, the table changed, or a promotion's hour has come. */
async function promoLiveLoad(force) {
  if (promoLive.off || promoLive.busy || typeof customerOrderRpc !== "function") return;
  const branch = promoBranch();
  if (!branch) return;                       // the menu (and with it the branch) is not known yet
  const key = `${branch}|${promoChannel()}`;
  if (!force && promoLive.key === key && Date.now() - promoLive.at < PROMO_LIVE_MS) return;
  promoLive.busy = true;
  try {
    const answer = await customerOrderRpc(PROMO_LIVE_FN, {p_restaurant_id: MENU_CONFIG.restaurantId, p_branch_id: branch, p_channel: key.split("|")[1]});
    if (!Array.isArray(answer)) throw new Error("Invalid promotions answer");
    const rows = answer.slice(0, 40).map(promoLiveClean).filter(Boolean);
    const print = JSON.stringify(rows);
    const changed = print !== promoLive.print || promoLive.key !== key;
    Object.assign(promoLive, {rows, key, at: Date.now(), print});
    if (changed) promoLiveChanged();
  } catch (error) {
    if (error && (error.status === 404 || error.code === "PGRST202" || error.code === "42883")) {
      // a database without 394: no banners, no badges, and it is not asked again on this visit
      Object.assign(promoLive, {off: true, rows: [], print: "[]"});
    } else {
      // the list of before stays; asked again in half a minute
      if (promoLive.key !== key) Object.assign(promoLive, {rows: [], print: "[]"});   // another branch or a table: its own list
      promoLive.key = key; promoLive.at = Date.now() - PROMO_LIVE_MS + PROMO_LIVE_RETRY_MS;
    }
  } finally {
    promoLive.busy = false;
    promoLiveSchedule();
  }
}
/** A happy hour started or ended: the screens that show offers are drawn again and the cart's price is asked again. */
function promoLiveChanged() {
  if (typeof cartQuoteStale === "function") cartQuoteStale();
  if (typeof state === "undefined" || typeof document === "undefined") return;
  if (!["home", "menu", "listing", "offers", "detail"].includes(state.screen)) return;
  if (document.activeElement && typeof document.activeElement.matches === "function" && document.activeElement.matches("input,textarea,select")) return;
  if (typeof renderKeepScroll === "function") renderKeepScroll();
}
/** Seconds until the next start or end of any listed promotion (on the branch's clock), or null. */
function promoLiveBoundary(now = new Date()) {
  const clock = promoClock(now), week = (clock.day - 1) * 86400 + clock.seconds;
  let best = null;
  const take = delta => { if (delta > 0 && (best === null || delta < best)) best = delta; };
  for (const p of promoLive.rows) {
    for (const h of p.hours) {
      const start = (h.day - 1) * 86400 + h.from, length = h.to > h.from ? h.to - h.from : h.to + 86400 - h.from;
      for (const edge of [start, start + length]) take((((edge - week) % PROMO_WEEK) + PROMO_WEEK) % PROMO_WEEK || PROMO_WEEK);
    }
    if (p.ends_at) take(Math.ceil((p.ends_at - now.getTime()) / 1000));
  }
  return best;
}
function promoLiveSchedule() {
  if (typeof setTimeout !== "function") return;
  if (promoLive.timer) { clearTimeout(promoLive.timer); promoLive.timer = null; }
  if (promoLive.off) return;
  const edge = promoLiveBoundary();
  if (edge === null || edge > 6 * 3600) return;
  // two seconds after the hour, so the server's own clock has passed it too
  promoLive.timer = setTimeout(() => { promoLive.timer = null; promoLiveLoad(true); }, (edge + 2) * 1000);
}
/** Called by the screens that show offers: never waits, never draws by itself. */
function promoLiveEnsure() {
  if (promoLive.off || promoLive.busy) return;
  const branch = promoBranch();
  if (!branch) return;
  if (promoLive.key === `${branch}|${promoChannel()}` && Date.now() - promoLive.at < PROMO_LIVE_MS) return;
  setTimeout(() => promoLiveLoad(false), 0);
}

// ---------- words ----------
function promoText(p) {
  const ar = state.lang === "ar";
  return (ar ? p.text_ar || p.text_en || p.name_ar || p.name_en : p.text_en || p.name_en) || promoLabel(p);
}
/** "10% off", "SAR 5.00 off", "Free delivery": from the promotion's numbers. */
function promoLabel(p) {
  const pct = `${Number(p.value.toFixed(2))}%`;   // C9: "20%", "12.5%" — the same style as the cart
  const sar = typeof money === "function" ? money(p.value) : p.value.toFixed(2);
  if (p.kind === "percent") return promoCopy(`${pct} off`, `خصم ${pct}`);
  if (p.kind === "amount") return promoCopy(`${sar} off`, `خصم ${sar}`);
  if (p.kind === "delivery_percent") return p.value >= 100 ? promoCopy("Free delivery", "توصيل مجاني") : promoCopy(`${pct} off delivery`, `خصم ${pct} على التوصيل`);
  return promoCopy(`${sar} off delivery`, `خصم ${sar} على التوصيل`);
}
/** "Today until 18:00" · "Today 12:00–16:00" · "Tomorrow 12:00–16:00" · "Sunday 12:00–16:00" · "Until 12 Oct" · "". */
function promoWindowText(p, now = new Date()) {
  const clock = promoClock(now), week = (clock.day - 1) * 86400 + clock.seconds;
  const ar = state.lang === "ar";
  let inside = null, next = null;
  for (const h of p.hours) {
    const start = (h.day - 1) * 86400 + h.from, length = h.to > h.from ? h.to - h.from : h.to + 86400 - h.from;
    const since = (((week - start) % PROMO_WEEK) + PROMO_WEEK) % PROMO_WEEK;
    if (since < length) { if (!inside || length - since > inside.left) inside = {h, left: length - since}; }
    else { const wait = PROMO_WEEK - since; if (!next || wait < next.wait) next = {h, wait}; }
  }
  if (p.on_now && inside) {
    const today = clock.seconds + inside.left <= 86400;
    return today ? promoCopy(`Today until ${inside.h.toText}`, `اليوم حتى ${inside.h.toText}`) : promoCopy(`Until ${inside.h.toText}`, `حتى ${inside.h.toText}`);
  }
  if (!p.on_now && next) {
    // the two times keep their order in an Arabic line (left-to-right isolate)
    const days = Math.floor((clock.seconds + next.wait) / 86400), span = `\u2066${next.h.fromText}–${next.h.toText}\u2069`;
    if (days === 0) return promoCopy(`Today ${span}`, `اليوم ${span}`);
    if (days === 1) return promoCopy(`Tomorrow ${span}`, `غداً ${span}`);
    return `${(ar ? PROMO_DAYS_AR : PROMO_DAYS_EN)[next.h.day - 1]} ${span}`;
  }
  if (p.on_now && !p.hours.length && p.ends_at) {
    let date = "";
    try {
      date = new Intl.DateTimeFormat(ar ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", {timeZone: MENU_CONFIG.timeZone, day: "numeric", month: "short"}).format(new Date(p.ends_at));
    } catch (_) {}
    return date ? promoCopy(`Until ${date}`, `حتى ${date}`) : "";
  }
  return "";
}
function promoTypesText(types) {
  const names = {dinein: promoCopy("dine-in", "المحلي"), takeaway: promoCopy("pick-up", "الاستلام"), delivery: promoCopy("delivery", "التوصيل")};
  return types.map(x => names[x]).filter(Boolean).join(promoCopy(" and ", " و"));
}
/** The small line under a promotion's text: its time, its minimum, who it is for. */
function promoDetailText(p, withTypes) {
  const parts = [promoWindowText(p)];
  if (p.min_order > 0) parts.push(promoCopy(`Orders from ${money(p.min_order)}`, `للطلبات من ${money(p.min_order)}`));
  if (p.max_discount) parts.push(promoCopy(`Up to ${money(p.max_discount)} off`, `خصم حتى ${money(p.max_discount)}`));
  if (withTypes && p.order_types.length && p.order_types.length < 3 && promoChannel() === "app") parts.push(promoCopy(`For ${promoTypesText(p.order_types)}`, `لطلبات ${promoTypesText(p.order_types)}`));
  if (p.first_order_only) parts.push(promoCopy("First order", "للطلب الأول"));
  if (p.sign_in_needed && !state.isLoggedIn) parts.push(promoCopy("Sign in to get it", "سجّل الدخول للحصول عليه"));
  return parts.filter(Boolean).join(" · ");
}

// ---------- what is shown ----------
function promoForType(p) { return !p.order_types.length || p.order_types.includes(promoOrderType()); }
function promoLiveCount() { return promoLive.off ? 0 : promoLive.rows.length; }
/** The promotions that are on at this moment for the way the customer is ordering. */
function promoLiveNow() { return promoLive.off ? [] : promoLive.rows.filter(p => p.on_now && promoForType(p)); }
/** Home: on now first, then the ones that start later (with their time). At most six. */
function promoStripRows() {
  if (promoLive.off) return [];
  const later = promoLive.rows.filter(p => !p.on_now && promoForType(p) && promoWindowText(p));
  return [...promoLiveNow(), ...later].slice(0, 6);
}
function promoCardMarkup(p, wide) {
  const detail = promoDetailText(p, wide);
  const tag = p.on_now ? promoCopy("On now", "متاح الآن") : promoCopy("Coming up", "قريباً");
  const inner = `<span class="pq-card-tag">${tag}</span>
      <strong>${escapeHtml(promoText(p))}</strong>
      ${detail ? `<small>${escapeHtml(detail)}</small>` : ""}`;
  // Licence round (L2): the Offers card carries the licence line; a link may not sit inside a button,
  // so a card with a licence is an article with the tappable part and the line under it. The Home strip stays compact.
  const licence = wide && typeof promoLicenceMarkup === "function" ? promoLicenceMarkup(p) : "";
  if (licence) {
    return `<article class="pq-card pq-card-wide pq-card-licensed${p.on_now ? " on" : ""}">
      <button type="button" class="pq-card-open" onclick="promoOpen('${p.promotion_id}')">${inner}</button>
      ${licence}
    </article>`;
  }
  return `<button type="button" class="pq-card${p.on_now ? " on" : ""}${wide ? " pq-card-wide" : ""}" onclick="promoOpen('${p.promotion_id}')">
      ${inner}
    </button>`;
}
/** Home: a quiet strip of the running promotions under the banners. "" when there are none. */
function promoStripMarkup() {
  promoLiveEnsure();
  const rows = promoStripRows();
  if (!rows.length) return "";
  return `<section class="pq-strip${rows.length === 1 ? " pq-strip-one" : ""}" aria-label="${promoCopy("Offers", "العروض")}">${rows.map(p => promoCardMarkup(p, false)).join("")}</section>`;
}
/** The Offers screen: every running promotion with its text, time and conditions. */
function promoOffersMarkup() {
  promoLiveEnsure();
  if (promoLive.off || !promoLive.rows.length) return "";
  const rows = [...promoLive.rows].sort((a, b) => Number(b.on_now) - Number(a.on_now));
  return `<section class="pq-list" aria-label="${promoCopy("Offers", "العروض")}">${rows.map(p => promoCardMarkup(p, true)).join("")}
    <p class="pq-list-note">${promoCopy("Offers are applied in your cart when your order qualifies.", "تُطبَّق العروض في سلتك عندما يستوفي طلبك الشروط.")}</p></section>`;
}
/** A tap on a promotion goes to the food it is for. */
function promoOpen(id) {
  const p = promoLive.rows.find(row => row.promotion_id === id);
  if (!p || typeof go !== "function") return;
  if (p.target === "items") {
    const item = ITEMS.find(i => p.target_ids.includes(i.id) && i.available);
    if (item && typeof openItem === "function") return openItem(item.id);
  }
  if (p.target === "categories") {
    const category = CATEGORIES.find(c => p.target_ids.includes(c.id));
    if (category) return go("listing", {categoryId: category.id});
    const sub = SUBCATEGORIES.find(s => p.target_ids.includes(s.id));
    if (sub) return go("listing", {categoryId: sub.category, subcategoryId: sub.id});
  }
  go("menu");
}
/** The running promotion that is for this item (its own id, its category or its subcategory), or null. */
function promoForItem(item) {
  if (!item || item.offer) return null;      // an item with its own offer keeps that one (contract, rule 1)
  return promoLiveNow().filter(p => p.level === "item" && (!p.sign_in_needed || state.isLoggedIn) &&
    ((p.target === "items" && p.target_ids.includes(item.id)) ||
     (p.target === "categories" && (p.target_ids.includes(item.category) || (item.subcategory && p.target_ids.includes(item.subcategory))))))
    .sort((a, b) => (b.kind === "percent") - (a.kind === "percent") || b.value - a.value)[0] || null;
}
/** A quiet badge on an item of a running promotion: "20% off". The price itself is confirmed in the cart. */
function promoItemBadge(item) {
  const p = promoForItem(item);
  return p ? `<span class="pq-badge" title="${escapeHtml(promoText(p))}">${escapeHtml(promoLabel(p))}</span>` : "";
}
/** The same badge beside a category's name, when a running promotion is for the whole category. */
function promoCategoryBadge(categoryId) {
  const p = promoLiveNow().filter(row => row.level === "item" && row.target === "categories" && row.target_ids.includes(categoryId) &&
    (!row.sign_in_needed || state.isLoggedIn))[0];
  return p ? `<span class="pq-badge pq-badge-cat">${escapeHtml(promoLabel(p))}</span>` : "";
}

if (typeof setInterval === "function") {
  setInterval(() => {
    if (typeof document !== "undefined" && document.hidden) return;
    if (typeof state !== "undefined" && ["home", "menu", "listing", "offers", "detail", "cart", "checkout"].includes(state.screen)) promoLiveEnsure();
  }, 30000);
}
if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
  document.addEventListener("visibilitychange", () => { if (!document.hidden) promoLiveEnsure(); });
}
if (typeof window !== "undefined") window.promoOpen = promoOpen;
