/* Batch B1 (373): QR table ordering ("table mode").
 * A sticker on the table opens <app address>/?t=<key>. The server says which table the key
 * is (oracy_table_scan_v1); from then on this tab orders dine-in for that table through
 * oracy_create_table_order_v1. The server decides everything again when the order is sent:
 * this file only remembers the table and shows it. Without ?t= nothing here does anything. */
const TABLE_KEY_SHAPE = /^[A-Za-z0-9]{22}$/;
const TABLE_TTL_MS = 6 * 60 * 60 * 1000;            // a remembered table is forgotten after 6 hours
const TABLE_ORDER_LABEL_MS = 24 * 60 * 60 * 1000;   // "Table 7" stays on an order card for a day
/* The server's own words when it refuses a key (create order). Shown as they are, with Arabic. */
const TABLE_INACTIVE_EN = "This table QR is not active. Please ask our staff.";
/* Batch B1g (376): the server's words for a guest at the table. */
const TABLE_GUEST_SIGNIN_EN = "Please sign in with your mobile number to order from this table.";
const TABLE_BUSY_EN = "Ordering is very busy right now. Please ask our staff.";
const TABLE_NAME_EN = "Please enter your name to order.";
const TABLE_TEXT = {
  en: {
    table: "Table {label}",
    ordering: "You are ordering for Table {label}",
    inactive: TABLE_INACTIVE_EN,
    finding: "Finding your table…",
    served: "We will bring your order to this table.",
    leaveAsk: "Not at this table?",
    leaveTitle: "Leave Table {label}?",
    leaveHint: "You can then choose dine-in, takeaway or delivery.",
    stay: "Stay",
    leave: "Leave table",
    whoLabel: "How would you like to order?",
    guestTitle: "Order as guest",
    guestSub: "Just your name. Quick and easy.",
    guestName: "Your name",
    guestHint: "No mobile number needed.",
    guestNameError: "Please enter your name (at least 2 letters).",
    signInEarn: "Sign in and earn {points} points",
    signInPlain: "Sign in with your mobile number",
    signInSub: "Collect points, use offers and keep your order history.",
    couponAsk: "Have a coupon?",
    couponLink: "Sign in to use it",
    couponRemoved: "Coupons are for signed-in orders. Your coupon was removed.",
    guestSignIn: TABLE_GUEST_SIGNIN_EN,
    busy: TABLE_BUSY_EN,
    nameNeeded: TABLE_NAME_EN,
  },
  ar: {
    table: "طاولة {label}",
    ordering: "أنت تطلب لطاولة {label}",
    inactive: "رمز QR لهذه الطاولة غير مفعّل. يرجى سؤال أحد موظفينا.",
    finding: "جارٍ تحديد طاولتك…",
    served: "سنحضر طلبك إلى هذه الطاولة.",
    leaveAsk: "لست على هذه الطاولة؟",
    leaveTitle: "مغادرة طاولة {label}؟",
    leaveHint: "بعدها يمكنك اختيار الطلب داخل المطعم أو الاستلام أو التوصيل.",
    stay: "البقاء",
    leave: "مغادرة الطاولة",
    whoLabel: "كيف تود أن تطلب؟",
    guestTitle: "اطلب كضيف",
    guestSub: "اسمك فقط. سريع وسهل.",
    guestName: "اسمك",
    guestHint: "لا حاجة لرقم الجوال.",
    guestNameError: "يرجى إدخال اسمك (حرفان على الأقل).",
    signInEarn: "سجّل الدخول واكسب {points} نقطة",
    signInPlain: "سجّل الدخول برقم جوالك",
    signInSub: "اجمع النقاط واستخدم العروض واحتفظ بسجل طلباتك.",
    couponAsk: "هل لديك كوبون؟",
    couponLink: "سجّل الدخول لاستخدامه",
    couponRemoved: "الكوبونات للطلبات المسجّلة فقط. تمت إزالة الكوبون.",
    guestSignIn: "يرجى تسجيل الدخول برقم جوالك للطلب من هذه الطاولة.",
    busy: "الطلبات مزدحمة جداً الآن. يرجى سؤال أحد موظفينا.",
    nameNeeded: "يرجى إدخال اسمك لإتمام الطلب.",
  },
};
const tableMode = {table: null, loaded: false, pending: null, settled: null, confirming: false, scan: 0, retry: null};

function tableText(key, vars = {}) {
  const lang = typeof state !== "undefined" && state.lang === "ar" ? "ar" : "en";
  return String(TABLE_TEXT[lang][key] ?? TABLE_TEXT.en[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ""));
}
/** Server text kept short and free of control characters; it is still escaped wherever it is drawn. */
function tableClean(value, max) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, " ").trim().slice(0, max) : "";
}
function tableStorageKey() { return appStorageKey("table"); }
function tableStore() {
  try {
    if (tableMode.table) sessionStorage.setItem(tableStorageKey(), JSON.stringify(tableMode.table));
    else sessionStorage.removeItem(tableStorageKey());
  } catch (_) { /* no storage: the table is remembered until the page is reloaded */ }
}
/** Read once from this tab's storage. Anything that is not exactly our own shape is dropped. */
function tableLoad() {
  if (tableMode.loaded) return;
  tableMode.loaded = true;
  try {
    const saved = JSON.parse(sessionStorage.getItem(tableStorageKey()) || "null");
    if (!saved || typeof saved !== "object") return;
    const label = tableClean(saved.label, 12);
    if (TABLE_KEY_SHAPE.test(String(saved.key)) && label && saved.restaurantId === MENU_CONFIG.restaurantId &&
        isMenuId(saved.branchId) && Number.isFinite(saved.at)) {
      tableMode.table = {key: saved.key, label, section: tableClean(saved.section, 40),
        branchId: saved.branchId, restaurantId: saved.restaurantId, at: saved.at, guestOrders: saved.guestOrders === true};
    } else sessionStorage.removeItem(tableStorageKey());
  } catch (_) {}
}
function tableClear() {
  tableMode.table = null;
  tableMode.confirming = false;
  tableStore();
  tableApplyLook();
}
/** Batch B1g: a visit from a table's QR is always drawn in brand.theme.tableStructure (brand-config.js asks
 *  here). True from the moment a good-looking key is being checked, so the screen does not jump. */
function tableShapesLook() { return !!(tableMode.pending || tableActive()); }
/** Puts the structure that now applies on the page, and leaves a screen the forced structure does not have. */
function tableApplyLook() {
  if (typeof brandTheme !== "function") return;
  const structure = brandTheme().structure;
  if (typeof document !== "undefined" && document.documentElement && document.documentElement.dataset) {
    document.documentElement.dataset.structure = structure;
  }
  if (structure === "scroll" && typeof state !== "undefined" && ["menu", "listing"].includes(state.screen)) state.screen = "home";
}
/** The branch the app orders from must be the table's branch. Unknown yet (menu not loaded) = decided later. */
function tableBranchOk(branchId) {
  const ordering = typeof orderingBranchId === "function" ? orderingBranchId() : "";
  return !ordering || ordering === branchId;
}
/** The remembered table, or null. Ends by itself after 6 hours or when the branch turns out to be another one. */
function tableActive() {
  tableLoad();
  const table = tableMode.table;
  if (!table) return null;
  const age = Date.now() - table.at;
  if (!(age >= 0 && age < TABLE_TTL_MS)) { tableClear(); return null; }
  if (!tableBranchOk(table.branchId)) {
    tableClear();
    setTimeout(() => { tableNotice(); tableRedraw(); }, 0);
    return null;
  }
  return table;
}
/** Table mode is dine-in, now. Called before every draw and before an order is built. */
function tableEnforce() {
  if (typeof state === "undefined" || !tableActive()) return false;
  if (state.orderType !== "dinein") {
    state.orderType = "dinein";
    if (typeof clearDeliveryQuote === "function") clearDeliveryQuote();
  }
  state.orderTiming = "asap";
  // Batch B1g: a guest order carries no voucher and no points, so the totals must not show them.
  if (tableGuestMode()) { state.couponOn = false; state.voucher = null; state.redeemPoints = 0; }
  return true;
}
function tableNotice() {
  if (typeof toast === "function") toast(tableText("inactive"), 6000);
}
function tableRedraw() {
  if (typeof state === "undefined" || !["home", "checkout", "appearanceSettingsPage"].includes(state.screen)) return;
  if (typeof renderKeepScroll === "function") renderKeepScroll();
  else if (typeof render === "function") render();
}
/** Takes ?t= out of the address bar (the other parameters stay for pushOpenFromLink).
 *  null = no table link; "" = a table link that is not a key; otherwise the key. */
function tableTakeKeyFromUrl() {
  try {
    const query = new URLSearchParams(location.search);
    if (!query.has("t")) return null;
    const key = query.get("t") || "";
    query.delete("t");
    const rest = query.toString();
    history.replaceState(history.state, "", location.pathname + (rest ? `?${rest}` : "") + (location.hash || ""));
    return TABLE_KEY_SHAPE.test(key) ? key : "";
  } catch (_) { return null; }
}
/** Start-up (called by app.js before the first draw and before anything else reads the address). */
function tableBoot() {
  const key = tableTakeKeyFromUrl();
  const kept = tableActive();
  if (key === null) {
    if (kept) { tableSkipSplash(); tableApplyLook(); tableEnforce(); }
    return;
  }
  // A new scan replaces the remembered table at once: an order must never go to a table the customer left.
  if (kept && kept.key !== key) tableClear();
  tableSkipSplash();
  if (key === "") { setTimeout(tableNotice, 0); return; }
  tableEnforce();
  tableMode.settled = tableScan(key);
  tableApplyLook();   // tableScan has marked the key as being checked: the table's layout from the first draw
}
/** A customer at a table goes straight to the menu, not to the welcome screen. */
function tableSkipSplash() {
  if (typeof state !== "undefined" && state.screen === "splash") state.screen = "home";
}
/** Resolves when the scan that is running (if any) has its answer: an order waits for it. */
function tableSettled() { return tableMode.settled || Promise.resolve(); }
async function tableScan(key, attempt = 1) {
  const run = ++tableMode.scan;
  if (tableMode.retry) { clearTimeout(tableMode.retry); tableMode.retry = null; }
  if (attempt === 1) tableMode.pending = key;
  let answer = null, failure = null;
  try { answer = await customerOrderRpc("oracy_table_scan_v1", {p_key: key}); }
  catch (error) { failure = error || new Error("scan failed"); }
  if (run !== tableMode.scan) return;                 // a newer scan has taken over
  tableMode.pending = null;
  const kept = tableMode.table && tableMode.table.key === key;
  if (failure) {
    // The server has no table ordering yet (migration 373 not there): an ordinary visit, no message.
    if (failure.status === 404 || failure.code === "PGRST202") { if (kept) tableClear(); }
    // No answer at all (weak signal in the dining room): two quiet tries more, then an ordinary visit.
    else if (failure.status === undefined && attempt < 3) {
      tableMode.retry = setTimeout(() => { tableMode.retry = null; tableMode.settled = tableScan(key, attempt + 1); }, attempt * 2500);
    }
    tableApplyLook();
    tableRedraw();
    return;
  }
  const label = tableClean(answer && answer.table_label, 12);
  const valid = !!answer && answer.ok === true && !!label && answer.restaurant_id === MENU_CONFIG.restaurantId &&
    isMenuId(answer.branch_id) && tableBranchOk(answer.branch_id);
  if (!valid) {                                       // switched off, unknown, another restaurant or another branch
    tableClear();
    tableNotice();
    tableRedraw();
    return;
  }
  tableMode.table = {key, label, section: tableClean(answer.section, 40), branchId: answer.branch_id,
    restaurantId: answer.restaurant_id, at: Date.now(), guestOrders: answer.guest_orders === true};
  tableMode.confirming = false;
  tableStore();
  tableApplyLook();
  tableEnforce();
  tableRedraw();
  if (typeof toast === "function") toast(tableText("ordering", {label}), 3200);
}
/** The server refused the key while taking the order: table mode ends, the cart stays. */
function tableRefused(message) {
  if (String(message || "") !== TABLE_INACTIVE_EN) return false;
  tableClear();
  return true;
}
/** Asked after a refusal that does not say why (a switched-off part): is the table still good? */
async function tableRecheck() {
  const table = tableActive();
  if (!table) return;
  try {
    const answer = await customerOrderRpc("oracy_table_scan_v1", {p_key: table.key});
    if (tableMode.table !== table || (answer && answer.ok === true)) return;
    tableClear();
    tableNotice();
    tableRedraw();
  } catch (_) { /* no answer: the server still decides on the next try */ }
}
function tableAskLeave() { if (tableActive()) { tableMode.confirming = true; tableRedraw(); } }
function tableStay() { tableMode.confirming = false; tableRedraw(); }
function tableLeave() { tableClear(); tableRedraw(); }

/** "Table 7", escaped; the label keeps its own direction inside Arabic text. */
function tableNameHtml(label, key = "table") {
  return escapeHtml(tableText(key, {label: "\u0001"})).replace("\u0001", () => `<bdi>${escapeHtml(label)}</bdi>`);
}
const TABLE_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 8.5h17M5 8.5l1.2-3h11.6l1.2 3M7 8.5V19M17 8.5V19M7 13.5h10"></path></svg>`;
/** Takes the place of the Dine-in / Takeaway / Delivery choice. place = "home" | "checkout". "" = not in table mode. */
function tableChipMarkup(place) {
  const where = place === "checkout" ? "checkout" : "home";
  const table = tableActive();
  if (!table) {
    if (!tableMode.pending) return "";
    return `<div class="table-chip table-chip-${where} table-chip-wait" role="status">
      <span class="table-chip-icon">${TABLE_ICON}</span>
      <div class="table-chip-copy"><small>${t("dineIn")}</small><strong>${escapeHtml(tableText("finding"))}</strong></div></div>`;
  }
  const name = tableNameHtml(table.label);
  if (tableMode.confirming) {
    return `<div class="table-chip table-chip-${where} table-chip-ask" role="group">
      <div class="table-chip-copy"><strong>${tableNameHtml(table.label, "leaveTitle")}</strong>
        <small>${escapeHtml(tableText("leaveHint"))}</small></div>
      <div class="table-chip-actions">
        <button type="button" class="table-chip-stay" onclick="tableStay()">${escapeHtml(tableText("stay"))}</button>
        <button type="button" class="table-chip-go" onclick="tableLeave()">${escapeHtml(tableText("leave"))}</button>
      </div></div>`;
  }
  return `<div class="table-chip table-chip-${where}" role="group">
    <span class="table-chip-icon">${TABLE_ICON}</span>
    <div class="table-chip-copy">
      <small><i class="table-chip-dot" aria-hidden="true"></i>${t("dineIn")}${table.section ? ` · <bdi>${escapeHtml(table.section)}</bdi>` : ""}</small>
      <strong>${name}</strong>
    </div>
    <button type="button" class="table-chip-leave" onclick="tableAskLeave()">${escapeHtml(tableText("leaveAsk"))}</button>
    ${where === "checkout" ? `<p class="table-chip-note">${escapeHtml(tableText("served"))}</p>` : ""}
  </div>`;
}

/* Which table an order was placed for, kept on this device for a day so the order cards can say
 * "Dine-in · Table 7" after a reload. Only the order id and the label are kept. */
function tableOrderLabels() {
  try {
    const list = JSON.parse(localStorage.getItem(appStorageKey("order-tables")) || "[]");
    return (Array.isArray(list) ? list : []).filter(row => row && isMenuId(row.id) && tableClean(row.label, 12) &&
      Number.isFinite(row.at) && Math.abs(Date.now() - row.at) < TABLE_ORDER_LABEL_MS).slice(0, 12);
  } catch (_) { return []; }
}
function tableRememberOrder(id, label) {
  const clean = tableClean(label, 12);
  if (!isMenuId(id) || !clean) return;
  try {
    const list = [{id, label: clean, at: Date.now()}, ...tableOrderLabels().filter(row => row.id !== id)].slice(0, 12);
    localStorage.setItem(appStorageKey("order-tables"), JSON.stringify(list));
  } catch (_) {}
}
/** " · Table 7" for an order card (escaped), or "". label = what the order itself carries, when it does. */
function tableOrderSuffix(id, label) {
  const own = tableClean(label, 12) || tableClean(tableOrderLabels().find(row => row.id === id)?.label, 12);
  // One element with a hard first space: the badges are flex rows, where loose spaces between pieces are dropped.
  return own ? `<span class="table-order-name">&nbsp;· ${tableNameHtml(own)}</span>` : "";
}

if (typeof window !== "undefined") {
  window.tableAskLeave = tableAskLeave;
  window.tableStay = tableStay;
  window.tableLeave = tableLeave;
}

/* ---- Batch B1g (376): a guest at the table orders with a name only -------------------------------
 * Offered when the scan said guest_orders and nobody is signed in. The visitor chooses on the checkout:
 * "Order as guest" (one field) or "Sign in and earn points" (the usual mobile + OTP way).
 * The server decides again when the order is sent; a signed-in visitor never gets here. */
const TABLE_GUEST_ID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const tableGuest = {choice: "", name: null, id: "", error: ""};
/** The name as it will be sent: no control or invisible characters, single spaces, at most 80. */
function tableGuestClean(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, " ")
    .replace(/\s+/g, " ").trim().slice(0, 80).trim();
}
function tableGuestNameValue() {
  if (tableGuest.name === null) {
    tableGuest.name = "";
    try { tableGuest.name = String(localStorage.getItem(appStorageKey("guest-name")) || "").slice(0, 80); } catch (_) {}
  }
  return tableGuest.name;
}
/** Made once and kept on the device; with storage blocked (private mode) it lives as long as the page. */
function tableGuestId() {
  if (TABLE_GUEST_ID_SHAPE.test(tableGuest.id)) return tableGuest.id;
  try {
    const saved = String(localStorage.getItem(appStorageKey("guest-id")) || "");
    if (TABLE_GUEST_ID_SHAPE.test(saved)) return (tableGuest.id = saved.toLowerCase());
  } catch (_) {}
  tableGuest.id = crypto.randomUUID();
  try { localStorage.setItem(appStorageKey("guest-id"), tableGuest.id); } catch (_) {}
  return tableGuest.id;
}
/** True when the checkout shows the two ways (guest / sign in). */
function tableGuestOffered() {
  const table = tableActive();
  return !!table && table.guestOrders === true && typeof state !== "undefined" && !state.isLoggedIn;
}
/** True while the guest way is the chosen one (it is the first choice until the visitor picks sign-in). */
function tableGuestMode() { return tableGuestOffered() && tableGuest.choice !== "signin"; }
function tableChoose(choice) {
  if (!tableGuestOffered()) return;
  tableGuest.choice = choice === "signin" ? "signin" : "guest";
  tableGuest.error = "";
  if (tableGuest.choice === "guest" && typeof state !== "undefined" && state.couponOn) {
    state.couponOn = false; state.voucher = null; state.coupon = "";
    if (typeof toast === "function") toast(tableText("couponRemoved"), 4500);
  }
  if (typeof state !== "undefined" && ["checkout", "cart"].includes(state.screen)) {
    if (typeof renderKeepScroll === "function") renderKeepScroll(); else if (typeof render === "function") render();
  }
}
/** Typing never redraws the screen (the keyboard would close); an error goes away at the first key. */
function tableGuestNameInput(value) {
  tableGuest.name = String(value ?? "").slice(0, 80);
  try { localStorage.setItem(appStorageKey("guest-name"), tableGuest.name); } catch (_) {}
  if (!tableGuest.error) return;
  tableGuest.error = "";
  if (typeof document === "undefined" || typeof document.querySelector !== "function") return;
  const note = document.querySelector(".table-guest-error");
  if (note && typeof note.remove === "function") note.remove();
  const field = document.getElementById("tableGuestName");
  if (field && field.classList) { field.classList.remove("invalid"); field.removeAttribute("aria-invalid"); }
}
function tableGuestShowError(text) {
  tableGuest.error = text;
  if (typeof state !== "undefined" && state.screen === "checkout") {
    if (typeof renderKeepScroll === "function") renderKeepScroll(); else if (typeof render === "function") render();
  }
  if (typeof document === "undefined" || typeof document.getElementById !== "function") return;
  const field = document.getElementById("tableGuestName");
  if (field && typeof field.focus === "function") { field.focus(); if (typeof field.scrollIntoView === "function") field.scrollIntoView({block: "center"}); }
}
/** Place Order as a guest: the name must be 2 to 80 characters. */
function tableGuestNameOk() {
  if (tableGuestClean(tableGuestNameValue()).length >= 2) return true;
  tableGuestShowError(tableText("guestNameError"));
  return false;
}
/** What goes to the server for this guest ({name, id}), or null when the order is not a guest order. */
function tableGuestOrder() {
  if (!tableGuestMode()) return null;
  const name = tableGuestClean(tableGuestNameValue());
  return name.length >= 2 ? {name, id: tableGuestId()} : null;
}
function tableGuestDone(guest) {
  tableGuest.name = guest.name;
  tableGuest.error = "";
  try { localStorage.setItem(appStorageKey("guest-name"), guest.name); } catch (_) {}
}
/** The server's own words for a guest order. True = it was one of them and has been shown. */
function tableGuestRefusal(message) {
  const text = String(message || "");
  if (text === TABLE_GUEST_SIGNIN_EN) {
    // Guest orders were switched off: this visit goes on with sign-in, and guest is not offered again.
    if (tableMode.table) { tableMode.table.guestOrders = false; tableStore(); }
    tableGuest.choice = "signin";
    setTimeout(() => { if (typeof toast === "function") toast(tableText("guestSignIn"), 7000); }, 0);
    return true;
  }
  if (text === TABLE_BUSY_EN) {
    setTimeout(() => { if (typeof toast === "function") toast(tableText("busy"), 7000); }, 0);
    return true;
  }
  if (text === TABLE_NAME_EN) {
    setTimeout(() => tableGuestShowError(tableText("nameNeeded")), 0);
    return true;
  }
  return false;
}
/** Points this order would earn when signed in (the existing estimate), or 0 when points are off. */
function tableGuestEarn() {
  try {
    if (typeof rewardsOn !== "function" || !rewardsOn() || typeof rewardsEarnPreview !== "function") return 0;
    const earn = Number(rewardsEarnPreview(rewardsState.rules, totals().foodTotal));
    return Number.isSafeInteger(earn) && earn > 0 ? earn : 0;
  } catch (_) { return 0; }
}
const TABLE_STAR_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9 6.8 19.6l1-5.8L3.5 9.7l5.9-.8z"></path></svg>`;
const TABLE_CHEVRON_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"></path></svg>`;
/** The two ways on the checkout. mobileEntry = the app's own mobile-number field (app.js). */
function tableGuestMarkup(mobileEntry) {
  const guestOn = tableGuest.choice !== "signin";
  const earn = tableGuestEarn();
  const error = guestOn ? tableGuest.error : "";
  return `<div class="table-who" role="radiogroup" aria-label="${escapeHtml(tableText("whoLabel"))}">
    <div class="table-who-card table-who-guest${guestOn ? " on" : ""}">
      <button type="button" class="table-who-head" role="radio" aria-checked="${guestOn}" onclick="tableChoose('guest')">
        <span class="table-who-radio" aria-hidden="true"></span>
        <span class="table-who-copy"><strong>${escapeHtml(tableText("guestTitle"))}</strong><small>${escapeHtml(tableText("guestSub"))}</small></span>
      </button>
      ${guestOn ? `<div class="table-who-body">
        <input class="field table-guest-name${error ? " invalid" : ""}" id="tableGuestName" type="text" maxlength="80"
          autocomplete="given-name" autocapitalize="words" enterkeyhint="done" dir="auto"
          placeholder="${escapeHtml(tableText("guestName"))}" aria-label="${escapeHtml(tableText("guestName"))}"
          ${error ? `aria-invalid="true"` : ""} value="${escapeHtml(tableGuestNameValue())}" oninput="tableGuestNameInput(this.value)" />
        ${error ? `<p class="table-guest-error" role="alert">${escapeHtml(error)}</p>` : ""}
        <p class="table-guest-hint">${escapeHtml(tableText("guestHint"))}</p>
      </div>` : ""}
    </div>
    <div class="table-who-card table-who-signin${earn ? " table-who-gold" : ""}${guestOn ? "" : " on"}">
      <button type="button" class="table-who-head" role="radio" aria-checked="${!guestOn}" onclick="tableChoose('signin')">
        <span class="table-who-radio" aria-hidden="true"></span>
        <span class="table-who-copy"><strong>${escapeHtml(earn ? tableText("signInEarn", {points: earn}) : tableText("signInPlain"))}</strong><small>${escapeHtml(tableText("signInSub"))}</small></span>
        <span class="table-who-mark" aria-hidden="true">${earn ? TABLE_STAR_ICON : TABLE_CHEVRON_ICON}</span>
      </button>
      ${guestOn ? "" : `<div class="table-who-body">${mobileEntry}</div>`}
    </div>
  </div>`;
}
/** In the cart, in place of the coupon box while ordering as a guest. */
function tableGuestCouponNote() {
  if (typeof featureOn === "function" && !featureOn("vouchers")) return "";
  return `<p class="table-guest-coupon">${escapeHtml(tableText("couponAsk"))}
    <button type="button" class="link" onclick="tableChoose('signin')">${escapeHtml(tableText("couponLink"))}</button></p>`;
}

if (typeof window !== "undefined") {
  window.tableChoose = tableChoose;
  window.tableGuestNameInput = tableGuestNameInput;
}
