/* Live public menu. No Supabase SDK or package installation required. */
const RESTAURANT = Object.freeze({
  name: APP_CONFIG.brand.name, nameAr: APP_CONFIG.brand.nameAr,
  phoneDisplay: APP_CONFIG.contact.phoneDisplay, phone: APP_CONFIG.contact.phone,
  whatsapp: APP_CONFIG.contact.whatsapp, address: APP_CONFIG.contact.address,
  addressAr: APP_CONFIG.contact.addressAr, maps: APP_CONFIG.contact.maps,
});
const MENU_CONFIG = Object.freeze({
  url: APP_CONFIG.backend.url,
  publicKey: APP_CONFIG.backend.publicKey,
  restaurantId: APP_CONFIG.tenant.restaurantId,
  branchId: APP_CONFIG.branch.preferredId,
  testingAlwaysOpen: APP_CONFIG.operations.testingAlwaysOpen,
  timeZone: APP_CONFIG.operations.timeZone,
  refreshMs: APP_CONFIG.operations.menuRefreshMs,
  maxAgeMs: APP_CONFIG.operations.menuMaxAgeMs,
  rpc: APP_CONFIG.backend.rpc,
});
let CATEGORIES = [], SUBCATEGORIES = [], ITEMS = [];
// Offers are derived from the menu API. Modifiers/rewards remain unchanged.
let OFFERS = [];
const VOUCHERS = [
  { id: "v1", title: "SAR 10 off", titleAr: "خصم 10 ر.س", cost: 100 },
  { id: "v2", title: "Free drink", titleAr: "مشروب مجاني", cost: 60 },
  { id: "v3", title: "SAR 25 off", titleAr: "خصم 25 ر.س", cost: 200 },
];
const menuConnection = { status: "loading", lastSuccess: 0, error: "", payload: null,
  fingerprint: "", pending: null, started: false, pendingRender: false };
const MENU_COPY = {
  en: { loading: "Loading menu…", error: "Menu could not be updated. Please try again.",
    empty: "The menu is being updated. Please check again shortly.", retry: "Retry", unavailable: "Unavailable now",
    changed: "Your cart was updated. Please review the items and prices.",
    unavailableItem: "This item is currently unavailable.", noOffers: "No offers available right now.",
    noSpecials: "Explore our menu below.", all: "All", noItems: "No items in this category right now." },
  ar: { loading: "جارٍ تحميل القائمة…", error: "تعذر تحديث القائمة. يرجى المحاولة مرة أخرى.",
    empty: "جارٍ تحديث القائمة. يرجى العودة قريباً.", retry: "إعادة المحاولة", unavailable: "غير متوفر الآن",
    changed: "تم تحديث السلة. يرجى مراجعة الأصناف والأسعار.", unavailableItem: "هذا الصنف غير متوفر حالياً.",
    noOffers: "لا توجد عروض حالياً.", noSpecials: "تصفح قائمتنا أدناه.", all: "الكل", noItems: "لا توجد أصناف في هذا القسم حالياً." },
};
function menuText(key) { return MENU_COPY[state.lang === "ar" ? "ar" : "en"][key] || key; }
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function menuImage(value) {
  try { const u = new URL(value); if (["https:", "http:"].includes(u.protocol)) return escapeHtml(u.href); } catch (_) {}
  return APP_CONFIG.brand.logo;
}
const isMenuId = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function riyadhClock(date = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: MENU_CONFIG.timeZone,
    weekday: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
  }).formatToParts(date).map(x => [x.type, x.value]));
  return { day: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(p.weekday) + 1,
    seconds: Number(p.hour) * 3600 + Number(p.minute) * 60 + Number(p.second) };
}
function testingAlwaysOpenActive() {
  return MENU_CONFIG.testingAlwaysOpen &&
    typeof window !== "undefined" && Boolean(window.location?.hostname);
}
function scheduleAllows(rows, date = new Date()) {
  if (testingAlwaysOpenActive()) return true;
  // Admin creates ISO weekdays: Monday=1 ... Sunday=7. No schedule rows means unrestricted.
  if (!rows.length) return true;
  const {day, seconds} = riyadhClock(date);
  const parse = (s, fallback) => {
    if (s == null || s === "") return fallback;
    if (!/^\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(String(s))) return NaN;
    const [h,m,sec=0] = String(s).split(":").map(Number);
    return h < 24 && m < 60 && sec < 60 ? h*3600+m*60+sec : NaN;
  };
  return rows.some(r => {
    if (r.is_available !== true) return false;
    const start = parse(r.start_time, 0), end = parse(r.end_time, 86400);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
    const d = Number(r.day_of_week);
    if (start < end) return d === day && seconds >= start && seconds < end;
    if (start === end) return false; // Explicit zero-length interval is closed.
    return (d === day && seconds >= start) || (d === (day === 1 ? 7 : day - 1) && seconds < end);
  });
}
function selectMenuBranch(branches) {
  if (MENU_CONFIG.branchId) {
    const b = branches.find(b => b.id === MENU_CONFIG.branchId);
    if (!b) throw new Error("Configured branch is not active.");
    return b.id;
  }
  if (branches.length === 1) return branches[0].id;
  const configuredName = [APP_CONFIG.branch.name, APP_CONFIG.branch.nameAr].filter(Boolean)
    .map(value => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const preferred = configuredName.length
    ? branches.filter(branch => new RegExp(configuredName.join("|"), "i").test(branch.name || ""))
    : [];
  if (preferred.length === 1) return preferred[0].id;
  throw new Error("A branch must be selected before loading a multi-branch menu.");
}
// Admin stores Saudi calendar dates in attributes. Never read legacy root columns.
function offerDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value)) return null;
  const day = value.slice(0, 10);
  const parsed = new Date(day + "T00:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day ? day : null;
}
function saudiDay(date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: MENU_CONFIG.timeZone, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(date).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function roundMoney(value) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function choiceKey(value) {
  let hash = 2166136261;
  for (const character of value) { hash ^= character.codePointAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(36);
}
function choiceText(value, max) {
  const text = typeof value === "string" ? value.trim() : "";
  return text && text.length <= max ? text : "";
}
/** Batch V2: the choice picked for the customer when the item opens (or null). */
function defaultChoiceId(item) {
  return enabledChoices(item, "Option").find(x => x.isDefault)?.id || null;
}
function mapItemChoices(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Map();
  return value.slice(0, 30).flatMap(row => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return [];
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const type = row.type;
    const price = row.price;
    if (!name || name.length > 60 || !["Add-on", "Option", "Variant"].includes(type) ||
        typeof price !== "number" || !Number.isFinite(price) || price < 0 || price > 99999.99 || roundMoney(price) !== price ||
        typeof row.enabled !== "boolean" || typeof row.required !== "boolean") return [];
    const base = `choice-${choiceKey(`${type}\u0000${name.toLocaleLowerCase('en')}`)}`;
    const duplicate = seen.get(base) || 0;
    seen.set(base, duplicate + 1);
    // Batch V (238): permanent id, Arabic name, full-price size, default size, size hours.
    const rowId = typeof row.id === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(row.id) ? row.id : null;
    const nameAr = typeof row.name_ar === "string" && row.name_ar.trim().length <= 60 ? row.name_ar.trim() : "";
    return [{id:duplicate ? `${base}-${duplicate}` : base, name, type, price:roundMoney(price),
      enabled:row.enabled, required:row.required, rowId, nameAr,
      final:type === "Variant" && row.price_mode === "final",
      // Batch V2 (247): a choice can be the default too, with a badge, a note and a group title.
      isDefault:(type === "Variant" || type === "Option") && row.is_default === true,
      ...(type === "Option" ? {badge:choiceText(row.badge, 24), badgeAr:choiceText(row.badge_ar, 24),
        note:choiceText(row.note, 120), noteAr:choiceText(row.note_ar, 120),
        group:choiceText(row.group, 40), groupAr:choiceText(row.group_ar, 40)} : {}),
      windows:mapChoiceWindows(row.windows)}];
  });
}
// Batch V (238): a size's own hours, e.g. lunch only. Same rule as the server
// (_oracy_choice_open_v1): days 1 = Monday ... 7 = Sunday, start included, end
// not; a window past midnight belongs to the day it starts. Branch clock.
function mapChoiceWindows(value) {
  if (!Array.isArray(value)) return [];
  const minutes = text => {
    const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(typeof text === "string" ? text : "");
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  return value.slice(0, 7).flatMap(w => {
    if (!w || typeof w !== "object" || !Array.isArray(w.days)) return [];
    const start = minutes(w.start), end = minutes(w.end);
    const days = [...new Set(w.days.filter(d => Number.isInteger(d) && d >= 1 && d <= 7))];
    if (start == null || end == null || start === end || !days.length) return [];
    return [{days, start, end}];
  });
}
function choiceOpen(choice, date = new Date()) {
  if (!choice?.windows?.length) return true;
  const {day, seconds} = riyadhClock(date);
  const t = Math.floor(seconds / 60), prev = day === 1 ? 7 : day - 1;
  return choice.windows.some(w => w.start < w.end
    ? w.days.includes(day) && t >= w.start && t < w.end
    : (w.days.includes(day) && t >= w.start) || (w.days.includes(prev) && t < w.end));
}
function choiceHoursText(choice) {
  const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return (choice?.windows || []).map(w => `${hhmm(w.start)}–${hhmm(w.end)}`).join(", ");
}
// Batch V (238): the item offer on a full-price size (same rounding as the server).
function offerOnPrice(offer, price) {
  if (!offer) return roundMoney(price);
  return offer.type === "percentage"
    ? roundMoney(price * (1 - offer.amount / 100))
    : roundMoney(Math.max(0, price - offer.amount));
}
function enabledChoices(item, type) {
  return (item?.options || []).filter(choice => choice.enabled && choice.type === type);
}
function normalizeItemChoices(item, selection = {}, date = new Date()) {
  const variants = enabledChoices(item, "Variant");
  const options = enabledChoices(item, "Option");
  const addons = enabledChoices(item, "Add-on");
  // Batch V (238): a size already chosen is kept (a cart line is never
  // switched to another size behind the customer's back; checkout refuses it
  // if its hours have passed). With none chosen: the default size on sale now,
  // else the first size on sale.
  const openSizes = variants.filter(x => choiceOpen(x, date));
  const variant = variants.some(x => x.id === selection.size) ? selection.size
    : (openSizes.find(x => x.isDefault)?.id || openSizes[0]?.id || (variants.length ? null : "regular"));
  let choice = options.some(x => x.id === selection.choice) ? selection.choice : null;
  if (!choice && options.some(x => x.required)) choice = options.find(x => x.isDefault)?.id || options[0]?.id || null;
  const extras = [...new Set(Array.isArray(selection.extras) ? selection.extras : [])]
    .filter(id => addons.some(x => x.id === id));
  for (const row of addons.filter(x => x.required)) if (!extras.includes(row.id)) extras.push(row.id);
  const size = variants.find(x => x.id === variant);
  const others = [...options.filter(x => x.id === choice), ...addons.filter(x => extras.includes(x.id))]
    .reduce((n,x) => n + x.price, 0);
  // Batch V (238): a full-price size replaces the item price (the offer applies
  // to that size). extraPrice is added to item.price and baseExtraPrice to
  // item.basePrice, so every existing "item price + extra" stays correct.
  if (size?.final) {
    return {size:variant, choice, extras,
      extraPrice:roundMoney(offerOnPrice(item.offer, size.price) + others - item.price),
      baseExtraPrice:roundMoney(size.price + others - item.basePrice)};
  }
  const extraPrice = roundMoney((size?.price || 0) + others);
  return {size:variant, choice, extras, extraPrice, baseExtraPrice:extraPrice};
}
// Batch V (238): sold by size, but no size on sale right now (e.g. lunch only).
function noSizeOnSale(item, date = new Date()) {
  const variants = enabledChoices(item, "Variant");
  return variants.length > 0 && !variants.some(x => choiceOpen(x, date));
}
function activeItemOffer(row, date = new Date()) {
  const o = row.offer;
  if (!o || o.has_offer !== true || o.offer_active !== true) return null;
  const start = offerDate(o.offer_valid_from), end = offerDate(o.offer_valid_to);
  const day = saudiDay(date), amount = o.offer_discount, base = Number(row.base_price);
  if (!start || !end || start > end || day < start || day > end ||
      typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0 ||
      !Number.isFinite(base) || base < 0) return null;
  if (o.offer_type !== "percentage" && o.offer_type !== "fixed") return null;
  if (o.offer_type === "percentage" ? amount > 100 : amount > base) return null;
  const price = roundMoney(o.offer_type === "percentage" ? base * (1 - amount / 100) : base - amount);
  if (price >= roundMoney(base)) return null;
  // Missing/null is explicitly unlimited; malformed limits fail closed.
  const cap = o.offer_max_qty;
  let maxQty = cap == null ? null : Number.isInteger(cap) && cap >= 1 && cap <= 999 ? cap : 0;
  const minimum = o.offer_min_regular_spend;
  const minRegularSpend = minimum == null ? 0 : minimum;
  if (typeof minRegularSpend !== 'number' || !Number.isFinite(minRegularSpend) ||
      minRegularSpend < 0 || minRegularSpend > 99999.99 || roundMoney(minRegularSpend) !== minRegularSpend) maxQty = 0;
  return {type: o.offer_type, amount, start, end, price, maxQty, minRegularSpend};
}
function mapMenu(payload, date = new Date()) {
  if (!payload || payload.version !== 1 || payload.restaurant_id !== MENU_CONFIG.restaurantId ||
      !["categories","subcategories","items","schedules","branches","branch_items"].every(k => Array.isArray(payload[k]))) {
    throw new Error("Unexpected customer menu response.");
  }
  // An inactive restaurant / no active branch produces an empty public menu.
  const branchId = payload.branches.length ? selectMenuBranch(payload.branches) : null;
  const safeOrder = value => Number.isSafeInteger(Number(value)) && Number(value) >= 0
    ? Number(value) : Number.MAX_SAFE_INTEGER;
  const group = r => ({id:r.id, name:String(r.name_en || ""), nameAr:String(r.name_ar || ""),
    category:r.category_id, image:menuImage(r.image_url), sortOrder:safeOrder(r.sort_order)});
  const cats = payload.categories.filter(r => isMenuId(r.id)).map(group)
    .sort((a,b)=>a.sortOrder-b.sortOrder||a.id.localeCompare(b.id));
  const subs = payload.subcategories.filter(r => isMenuId(r.id) && cats.some(c => c.id === r.category_id)).map(group)
    .sort((a,b)=>a.sortOrder-b.sortOrder||a.id.localeCompare(b.id));
  const items = payload.items.filter(r => isMenuId(r.id) && cats.some(c => c.id === r.category_id) &&
    (!r.subcategory_id || subs.some(s => s.id === r.subcategory_id && s.category === r.category_id)) &&
    r.base_price != null && r.base_price !== "" && Number.isFinite(Number(r.base_price)) && Number(r.base_price) >= 0
  ).map(r => ({
    id:r.id, category:r.category_id, subcategory:r.subcategory_id || null,
    name:String(r.name_en || ""), nameAr:String(r.name_ar || ""),
    desc:String(r.description_en || ""), descAr:String(r.description_ar || ""),
    price:Number(r.base_price), image:menuImage(r.image_url),
    special:r.is_featured === true, bestSeller:r.is_best_seller === true, newItem:r.is_new === true,
    prepTime:Number(r.prep_time) || 25, options:mapItemChoices(r.options), sortOrder:safeOrder(r.sort_order),
    available:r.is_available === true && payload.branch_items.some(b => b.branch_id === branchId &&
      b.menu_item_id === r.id && b.is_available === true) &&
      (!restaurantAcceptingOrders(date) || scheduleAllows(payload.schedules.filter(s => s.menu_item_id === r.id), date)),
  }));
  items.forEach(item => {
    const row = payload.items.find(r => r.id === item.id);
    // Batch V (238): an item sold by full-price size shows its default size.
    const sizes = item.options.filter(x => x.enabled && x.final);
    const shown = sizes.find(x => x.isDefault) || sizes[0];
    item.basePrice = roundMoney(shown ? shown.price : item.price);
    item.offer = item.available ? activeItemOffer(row, date) : null;
    item.price = item.offer ? (shown ? offerOnPrice(item.offer, item.basePrice) : item.offer.price) : item.basePrice;
  });
  const categoryPosition=new Map(cats.map((row,index)=>[row.id,index]));
  const subcategoryPosition=new Map(subs.map((row,index)=>[row.id,index]));
  items.sort((a,b)=>(categoryPosition.get(a.category)??Number.MAX_SAFE_INTEGER)-(categoryPosition.get(b.category)??Number.MAX_SAFE_INTEGER)
    ||(a.subcategory==null?-1:(subcategoryPosition.get(a.subcategory)??Number.MAX_SAFE_INTEGER))
      -(b.subcategory==null?-1:(subcategoryPosition.get(b.subcategory)??Number.MAX_SAFE_INTEGER))
    ||a.sortOrder-b.sortOrder||a.id.localeCompare(b.id));
  return {categories:cats, subcategories:subs, items,
    offers:items.filter(i => i.offer).map(i => ({itemId:i.id}))};
}
function menuReady() {
  return menuConnection.status === "ready" && Date.now() - menuConnection.lastSuccess <= MENU_CONFIG.maxAgeMs;
}
function canOrderItem(item) {
  return !!item && item.available === true && item.offer?.maxQty !== 0 && menuReady() && !noSizeOnSale(item) &&
    (!restaurantAcceptingOrders() || scheduleAllows((menuConnection.payload?.schedules || []).filter(s => s.menu_item_id === item.id)));
}
function reconcileMenuCart() {
  if (!state.cart.length) return false;
  const before = JSON.stringify(state.cart);
  const used = new Map();
  state.cart = state.cart.flatMap(line => {
    const item = ITEMS.find(i => i.id === line.id);
    if (!item?.available) return [];
    const cap = item.offer?.maxQty ?? Infinity;
    const qty = Math.min(Number.isSafeInteger(line.qty) && line.qty > 0 ? line.qty : 0,
      Math.max(0, cap - (used.get(item.id) || 0)));
    if (!qty) return [];
    used.set(item.id, (used.get(item.id) || 0) + qty);
    const choices = normalizeItemChoices(item, line);
    return [{...line, cartKey:line.cartKey || newCartKey(), qty,
      price:roundMoney(item.price + choices.extraPrice),
      basePrice:roundMoney(item.basePrice + choices.baseExtraPrice), image:item.image,
      size:choices.size, choice:choices.choice, extras:choices.extras}];
  });
  const changed = before !== JSON.stringify(state.cart);
  if (changed) toast(menuText("changed"));
  saveCartDraft();
  return changed;
}
function applyMenuPayload(payload) {
  const mapped = mapMenu(payload);
  const fingerprint = JSON.stringify(mapped);
  const changed = fingerprint !== menuConnection.fingerprint;
  CATEGORIES = mapped.categories; SUBCATEGORIES = mapped.subcategories; ITEMS = mapped.items;
  OFFERS = mapped.offers;
  restoreCartDraft();
  menuConnection.fingerprint = fingerprint;
  if (!CATEGORIES.some(c => c.id === state.categoryId)) {
    state.categoryId = CATEGORIES[0]?.id || ""; state.subcategoryId = "";
  }
  if (state.subcategoryId && !SUBCATEGORIES.some(s => s.id === state.subcategoryId && s.category === state.categoryId)) state.subcategoryId = "";
  if (state.screen === "detail" && !ITEMS.some(i => i.id === state.itemId)) {
    state.screen = state.cartEditKey ? "cart" : "listing";
    state.cartEditKey = null;
  }
  const cartChanged = reconcileMenuCart();
  saveCartDraft();
  return {changed, cartChanged};
}
function refreshMenuUI() {
  if (!["home","menu","listing","detail","cart","checkout","offers"].includes(state.screen)) return;
  if (document.activeElement?.matches("input,textarea,select")) { menuConnection.pendingRender = true; return; }
  menuConnection.pendingRender = false;
  renderKeepScroll();
}
async function refreshMenu() {
  if (menuConnection.pending) return menuConnection.pending;
  menuConnection.pending = (async () => {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
    const previous = menuConnection.status;
    try {
      const response = await fetch(`${MENU_CONFIG.url}/rest/v1/rpc/${MENU_CONFIG.rpc.menu}`, {
        method:"POST", headers:{apikey:MENU_CONFIG.publicKey, "Content-Type":"application/json"},
        body:"{}", signal:controller.signal, cache:"no-store", credentials:"omit",
      });
      if (!response.ok) {
        const detail = (await response.text()).slice(0,500);
        throw new Error(`Menu API ${response.status}: ${detail}`);
      }
      const payload = await response.json();
      const result = applyMenuPayload(payload);
      menuConnection.payload = payload; menuConnection.status = "ready";
      // Batch H: the menu names the branch; read its ordering hours at once (not on the next retry).
      if (typeof orderingHours !== "undefined" && !orderingHours.status && typeof loadOrderingHours === "function") loadOrderingHours();
      menuConnection.lastSuccess = Date.now(); menuConnection.error = "";
      if (typeof requestCustomerContent === 'function') requestCustomerContent();
      if (result.changed || result.cartChanged || previous !== "ready") refreshMenuUI();
      return {ok:true, cartChanged:result.cartChanged};
    } catch(error) {
      menuConnection.status = "error"; menuConnection.error = String(error.message || error);
      console.warn(`${APP_CONFIG.brand.shortName} menu:`, menuConnection.error);
      if (previous !== "error") refreshMenuUI();
      return {ok:false, cartChanged:false};
    } finally { clearTimeout(timer); }
  })();
  try { return await menuConnection.pending; } finally { menuConnection.pending = null; }
}
function menuStatusMarkup() {
  const key = menuConnection.status === "loading" ? "loading" : !menuReady() ? "error" : !ITEMS.length ? "empty" : "";
  if (!key) return "";
  return `<div class="menu-status" role="status">${menuText(key)}${key !== "loading" ?
    ` <button class="link" onclick="refreshMenu()">${menuText("retry")}</button>` : ""}</div>`;
}
async function validateMenuCart() {
  const result = await refreshMenu();
  if (!result.ok) { toast(menuText("error")); return false; }
  if (result.cartChanged) { go("cart"); return false; }
  if (!state.cart.length) { toast(t("cartIsEmpty")); return false; }
  return state.cart.every(line => canOrderItem(itemById(line.id)));
}
function startMenuSync() {
  if (menuConnection.started) return;
  menuConnection.started = true;
  let acceptingOrders = restaurantAcceptingOrders();
  refreshMenu();
  setInterval(() => { if (!document.hidden) refreshMenu(); }, MENU_CONFIG.refreshMs);
  // Schedule transitions are recalculated in Riyadh time, including overnight windows.
  setInterval(() => {
    if (document.hidden || !menuConnection.payload) return;
    const nowAccepting = restaurantAcceptingOrders();
    const hoursChanged = nowAccepting !== acceptingOrders;
    acceptingOrders = nowAccepting;
    if (!menuReady()) {
      if (menuConnection.status === "ready") { menuConnection.status = "error"; refreshMenuUI(); }
      return;
    }
    const result = applyMenuPayload(menuConnection.payload);
    if (result.changed || result.cartChanged || hoursChanged) refreshMenuUI();
  }, 10000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshMenu(); });
  window.addEventListener("online", () => refreshMenu());
  window.addEventListener("focus", () => refreshMenu());
  document.addEventListener("focusout", () => setTimeout(() => {
    if (menuConnection.pendingRender) refreshMenuUI();
  }, 0));
  document.addEventListener("error", event => {
    const img = event.target;
    if (img.tagName === "IMG" && !img.dataset.menuFallback) {
      img.dataset.menuFallback = "1"; img.src = APP_CONFIG.brand.logo;
    }
  }, true);
}

const CUSTOMER_ORDER_STORAGE_KEY = appStorageKey("active-customer-order");
const CUSTOMER_ORDER_HISTORY_STORAGE_KEY = appStorageKey("customer-order-history");
const LEGACY_CUSTOMER_ORDER_STORAGE_KEY = "meerath-active-customer-order-v1";
const LEGACY_CUSTOMER_ORDER_HISTORY_STORAGE_KEY = "meerath-customer-order-history-v1";
const customerOrderConnection = { pending: null, timer: null };

async function customerOrderRpc(name, params) {
  const signedInOnly = ["oracy_create_customer_order_v1", "oracy_create_pin_delivery_order_v2"];
  let accessToken = null;
  let tokenError = null;
  try {
    accessToken = typeof activeAccessToken === "function" ? await activeAccessToken() : null;
  } catch (error) { tokenError = error; }
  // Gate 4 (280): the server takes orders from signed-in customers only. A
  // token refresh that failed on the network is a retry, not a sign-in problem;
  // a refresh the server refused has already ended the sign-in.
  if (signedInOnly.includes(name) && !accessToken) {
    if (typeof state !== "undefined" && !state.isLoggedIn) throw new Error("Please sign in again to continue.");
    throw new Error(tokenError && [400, 401, 403].includes(tokenError.status)
      ? "Please sign in again to continue." : "The connection is slow. Please try again.");
  }
  // Gate 3: a hung request must not freeze Place Order for ever — 12 s, then
  // the customer may try again (the same client_order_id makes a retry safe).
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = setTimeout(() => controller?.abort(), 12000);
  let response;
  try {
    response = await fetch(`${MENU_CONFIG.url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: MENU_CONFIG.publicKey,
        "Content-Type": "application/json",
        ...(accessToken ? {Authorization: `Bearer ${accessToken}`} : {}),
      },
      body: JSON.stringify(params),
      cache: "no-store",
      credentials: "omit",
      signal: controller?.signal,
    });
  } catch (error) {
    if (error && error.name === "AbortError") throw new Error("The connection is slow. Please try again.");
    throw error;
  } finally {
    if (typeof clearTimeout === "function") clearTimeout(timer);
  }
  if (!response.ok) {
    let detail = null;
    try { detail = await response.json(); } catch (_) {}
    const refusal = new Error(customerRpcMessage(response.status, detail));
    // Batch E (283): a part of the app was switched off for this restaurant. Ask the
    // server for the status again, so the screen shows the notice instead of a retry.
    if (detail && detail.code === "P0001" && detail.hint === "module_off") {
      refusal.hint = "module_off";
      if (typeof loadOrderingHours === "function") loadOrderingHours();
    }
    throw refusal;
  }
  return response.json();
}

/* Gate 4: only the server's own, written-for-customers refusals (code P0001,
 * raised by our functions) reach the screen. Driver, permission, timeout and
 * other internal texts become one plain message. */
function customerRpcMessage(status, detail) {
  const code = String(detail?.code || "");
  const message = typeof detail?.message === "string" ? detail.message : "";
  if (code === "P0001" && message.length > 0 && message.length < 220 && !/\n|\r/.test(message)) return message;
  if (status === 401 || code === "PGRST301" || (code === "42501" && /^(Authentication required|permission denied)/i.test(message))) {
    return "Please sign in again to continue.";
  }
  if (/duplicate key|23505|client_order_id/i.test(message)) return message; // Gate 3 retry logic reads this
  return "Order service is unavailable. Please try again.";
}

async function submitCustomerOrder(order) {
  const branchId = selectMenuBranch(menuConnection.payload?.branches || []);
  return customerOrderRpc(order.fulfillment_type === "delivery" ? "oracy_create_pin_delivery_order_v2" : MENU_CONFIG.rpc.createOrder, {
    p_restaurant_id: MENU_CONFIG.restaurantId,
    p_branch_id: branchId,
    p_order: order,
  });
}

async function requestCustomerDeliveryQuote(address, foodSubtotal) {
  const branchId = selectMenuBranch(menuConnection.payload?.branches || []);
  return customerOrderRpc("oracy_customer_delivery_quote_v1", {
    p_restaurant_id: MENU_CONFIG.restaurantId,
    p_branch_id: branchId,
    p_address_id: address.id,
    p_address_version: address.updatedAt,
    p_food_subtotal: foodSubtotal,
  });
}

function saveTrackedCustomerOrder() {
  try {
    if (state.order?.backendId && state.order?.trackingToken) {
      localStorage.setItem(CUSTOMER_ORDER_STORAGE_KEY, JSON.stringify(state.order));
    } else {
      localStorage.removeItem(CUSTOMER_ORDER_STORAGE_KEY);
    }
  } catch (_) {}
}

function restoreTrackedCustomerOrder() {
  try {
    const saved = JSON.parse(readAppStorage("active-customer-order", [LEGACY_CUSTOMER_ORDER_STORAGE_KEY]) || "null");
    if (saved && typeof saved === "object" && isMenuId(saved.backendId) && isMenuId(saved.trackingToken)) {
      state.order = saved;
      state.orderTab = "active";
    }
  } catch (_) {
    localStorage.removeItem(CUSTOMER_ORDER_STORAGE_KEY);
  }
}

/* Gate 4: the device keeps 20 orders for at most 30 days, and never the
 * customer's e-mail (the account has it; a shared phone should not). */
const CUSTOMER_ORDER_HISTORY_DAYS = 30;
function trimCustomerOrderHistory(list, now = Date.now()) {
  const oldest = now - CUSTOMER_ORDER_HISTORY_DAYS * 24 * 60 * 60 * 1000;
  return (Array.isArray(list) ? list : [])
    .filter(order => order && typeof order.id === "string")
    .filter(order => {
      const at = Number(order.completedAt || order.createdAt || 0);
      return !Number.isFinite(at) || at === 0 || at >= oldest;
    })
    .slice(0, 20)
    .map(order => {
      // Nothing on the device needs the address or e-mail again: reorder uses items only.
      const {address, deliveryQuote, customer, ...rest} = order;
      return customer && typeof customer === "object"
        ? {...rest, customer: {name: customer.name || "", mobile: customer.mobile || ""}}
        : rest;
    });
}

function saveCustomerOrderHistory() {
  try {
    localStorage.setItem(
      CUSTOMER_ORDER_HISTORY_STORAGE_KEY,
      JSON.stringify(trimCustomerOrderHistory(state.orderHistory))
    );
  } catch (_) {}
}

function restoreCustomerOrderHistory() {
  try {
    const saved = JSON.parse(
      readAppStorage("customer-order-history", [LEGACY_CUSTOMER_ORDER_HISTORY_STORAGE_KEY]) || "[]"
    );
    state.orderHistory = trimCustomerOrderHistory(saved);
  } catch (_) {
    state.orderHistory = [];
    localStorage.removeItem(CUSTOMER_ORDER_HISTORY_STORAGE_KEY);
  }
}

function archiveCompletedCustomerOrder(order, remote) {
  const archived = {
    ...order,
    status: "completed",
    step: customerStatusStep("completed"),
    updatedAt: remote.updated_at,
    completedAt: remote.updated_at ? Date.parse(remote.updated_at) : Date.now(),
  };
  state.orderHistory = [
    archived,
    ...state.orderHistory.filter(previous => previous.id !== archived.id),
  ].slice(0, 20);
  saveCustomerOrderHistory();
  state.order = null;
  state.orderTab = "history";
  saveTrackedCustomerOrder();
}

function customerStatusStep(status) {
  return ({pending_confirmation:0, accepted:1, preparing:2, ready:3, completed:4})[status] ?? 0;
}

async function refreshTrackedCustomerOrder() {
  const order = state.order;
  if (!order?.backendId || !order?.trackingToken || customerOrderConnection.pending) return;
  customerOrderConnection.pending = (async () => {
    try {
      const remote = await customerOrderRpc(MENU_CONFIG.rpc.trackOrder, {
        p_order_id: order.backendId,
        p_tracking_token: order.trackingToken,
      });
      if (!remote?.id) throw new Error("Order tracking is unavailable.");
      const changed = order.status !== remote.status || order.updatedAt !== remote.updated_at;
      Object.assign(order, {
        id: remote.order_number,
        status: remote.status,
        step: customerStatusStep(remote.status),
        total: Number(remote.total),
        updatedAt: remote.updated_at,
        scheduledFor: remote.scheduled_for ? Date.parse(remote.scheduled_for) : order.scheduledFor,
        rejectionReason: remote.rejection_reason || "",
      });
      if (remote.status === "completed") {
        archiveCompletedCustomerOrder(order, remote);
      } else {
        saveTrackedCustomerOrder();
      }
      if (changed && ["confirmation", "track"].includes(state.screen)) renderKeepScroll();
    } catch (error) {
      console.warn(`${APP_CONFIG.brand.shortName} order tracking:`, error.message || error);
    }
  })();
  try { await customerOrderConnection.pending; } finally { customerOrderConnection.pending = null; }
}

function startCustomerOrderSync() {
  if (customerOrderConnection.timer) return;
  customerOrderConnection.timer = setInterval(() => {
    if (!document.hidden) refreshTrackedCustomerOrder();
  }, 5000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshTrackedCustomerOrder();
  });
  window.addEventListener("online", refreshTrackedCustomerOrder);
  window.addEventListener("focus", refreshTrackedCustomerOrder);
  refreshTrackedCustomerOrder();
}
