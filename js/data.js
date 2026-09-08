/* Live public menu. No Supabase SDK or package installation required. */
const RESTAURANT = {
  name: "Meerath Kabab", nameAr: "ميراث كباب", phoneDisplay: "0561663119",
  phone: "+966561663119", whatsapp: "966561663119",
  address: "Olaya Street, Riyadh, Saudi Arabia", addressAr: "شارع العليا، الرياض، المملكة العربية السعودية",
  maps: "https://maps.app.goo.gl/wQeq8SabZ1GfgKUN7",
};
const MENU_CONFIG = Object.freeze({
  url: "https://skwburtcthxihpgqagmm.supabase.co",
  publicKey: "sb_publishable_6f7rQ5e2pJ_rdUoBxaInoA_wJW5KtHW",
  restaurantId: "11111111-1111-1111-1111-111111111111",
  branchId: "", // Optional exact branch UUID. Auto-selects sole branch or unique Olaya branch.
  timeZone: "Asia/Riyadh", refreshMs: 30000, maxAgeMs: 90000,
});
let CATEGORIES = [], SUBCATEGORIES = [], ITEMS = [];
// Offers are derived from the menu API. Modifiers/rewards remain unchanged.
let OFFERS = [];
const EXTRAS = [];
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
  return "assets/images/meerath-logo.png";
}
const isMenuId = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function riyadhClock(date = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: MENU_CONFIG.timeZone,
    weekday: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
  }).formatToParts(date).map(x => [x.type, x.value]));
  return { day: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(p.weekday) + 1,
    seconds: Number(p.hour) * 3600 + Number(p.minute) * 60 + Number(p.second) };
}
function scheduleAllows(rows, date = new Date()) {
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
  const olaya = branches.filter(b => /olaya|olayya|العليا/i.test(b.name || ""));
  if (olaya.length === 1) return olaya[0].id;
  throw new Error("Select one active branch in MENU_CONFIG.branchId; no unique Olaya branch was found.");
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
  const maxQty = cap == null ? null : Number.isInteger(cap) && cap >= 1 && cap <= 999 ? cap : 0;
  return {type: o.offer_type, amount, start, end, price, maxQty};
}
function mapMenu(payload, date = new Date()) {
  if (!payload || payload.version !== 1 || payload.restaurant_id !== MENU_CONFIG.restaurantId ||
      !["categories","subcategories","items","schedules","branches","branch_items"].every(k => Array.isArray(payload[k]))) {
    throw new Error("Unexpected customer menu response.");
  }
  // An inactive restaurant / no active branch produces an empty public menu.
  const branchId = payload.branches.length ? selectMenuBranch(payload.branches) : null;
  const group = r => ({id:r.id, name:String(r.name_en || ""), nameAr:String(r.name_ar || ""),
    category:r.category_id, image:menuImage(r.image_url)});
  const cats = payload.categories.filter(r => isMenuId(r.id)).map(group);
  const subs = payload.subcategories.filter(r => isMenuId(r.id) && cats.some(c => c.id === r.category_id)).map(group);
  const items = payload.items.filter(r => isMenuId(r.id) && cats.some(c => c.id === r.category_id) &&
    (!r.subcategory_id || subs.some(s => s.id === r.subcategory_id && s.category === r.category_id)) &&
    r.base_price != null && r.base_price !== "" && Number.isFinite(Number(r.base_price)) && Number(r.base_price) >= 0
  ).map(r => ({
    id:r.id, category:r.category_id, subcategory:r.subcategory_id || null,
    name:String(r.name_en || ""), nameAr:String(r.name_ar || ""),
    desc:String(r.description_en || ""), descAr:String(r.description_ar || ""),
    price:Number(r.base_price), image:menuImage(r.image_url),
    special:r.is_featured === true, bestSeller:r.is_best_seller === true, newItem:r.is_new === true,
    prepTime:Number(r.prep_time) || 25,
    available:r.is_available === true && payload.branch_items.some(b => b.branch_id === branchId &&
      b.menu_item_id === r.id && b.is_available === true) &&
      scheduleAllows(payload.schedules.filter(s => s.menu_item_id === r.id), date),
  }));
  items.forEach(item => {
    const row = payload.items.find(r => r.id === item.id);
    item.basePrice = roundMoney(item.price);
    item.offer = item.available ? activeItemOffer(row, date) : null;
    item.price = item.offer ? item.offer.price : item.basePrice;
  });
  cats.forEach(c => {
    if (c.image === "assets/images/meerath-logo.png") c.image = items.find(i => i.category === c.id)?.image || c.image;
  });
  return {categories:cats, subcategories:subs, items,
    offers:items.filter(i => i.offer).map(i => ({itemId:i.id}))};
}
function menuReady() {
  return menuConnection.status === "ready" && Date.now() - menuConnection.lastSuccess <= MENU_CONFIG.maxAgeMs;
}
function canOrderItem(item) {
  return !!item && item.available === true && item.offer?.maxQty !== 0 && menuReady() &&
    scheduleAllows((menuConnection.payload?.schedules || []).filter(s => s.menu_item_id === item.id));
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
    return [{...line, cartKey:line.cartKey || newCartKey(), qty,
      price:item.price, basePrice:item.basePrice, image:item.image, size:"regular", extras:[]}];
  });
  const changed = before !== JSON.stringify(state.cart);
  if (changed) toast(menuText("changed"));
  return changed;
}
function applyMenuPayload(payload) {
  const mapped = mapMenu(payload);
  const fingerprint = JSON.stringify(mapped);
  const changed = fingerprint !== menuConnection.fingerprint;
  CATEGORIES = mapped.categories; SUBCATEGORIES = mapped.subcategories; ITEMS = mapped.items;
  OFFERS = mapped.offers;
  menuConnection.fingerprint = fingerprint;
  if (!CATEGORIES.some(c => c.id === state.categoryId)) {
    state.categoryId = CATEGORIES[0]?.id || ""; state.subcategoryId = "";
  }
  if (state.subcategoryId && !SUBCATEGORIES.some(s => s.id === state.subcategoryId && s.category === state.categoryId)) state.subcategoryId = "";
  if (state.screen === "detail" && !ITEMS.some(i => i.id === state.itemId)) {
    state.screen = state.cartEditKey ? "cart" : "listing";
    state.cartEditKey = null;
  }
  return {changed, cartChanged:reconcileMenuCart()};
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
      const response = await fetch(`${MENU_CONFIG.url}/rest/v1/rpc/meerath_customer_menu_v1`, {
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
      menuConnection.lastSuccess = Date.now(); menuConnection.error = "";
      if (result.changed || result.cartChanged || previous !== "ready") refreshMenuUI();
      return {ok:true, cartChanged:result.cartChanged};
    } catch(error) {
      menuConnection.status = "error"; menuConnection.error = String(error.message || error);
      console.warn("Meerath menu:", menuConnection.error);
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
  refreshMenu();
  setInterval(() => { if (!document.hidden) refreshMenu(); }, MENU_CONFIG.refreshMs);
  // Schedule transitions are recalculated in Riyadh time, including overnight windows.
  setInterval(() => {
    if (document.hidden || !menuConnection.payload) return;
    if (!menuReady()) {
      if (menuConnection.status === "ready") { menuConnection.status = "error"; refreshMenuUI(); }
      return;
    }
    const result = applyMenuPayload(menuConnection.payload);
    if (result.changed || result.cartChanged) refreshMenuUI();
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
      img.dataset.menuFallback = "1"; img.src = "assets/images/meerath-logo.png";
    }
  }, true);
}
