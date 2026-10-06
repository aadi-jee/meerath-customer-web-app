/* Batch C (244): smart recommendations — manual first, then "often ordered
 * together" (from the restaurant's paid orders), then "complete your meal".
 * The server decides each item's list (oracy_customer_recommendations_v1);
 * this file only filters by what can be ordered now and shows it.
 * If the call fails, the old manual pairings (content.js) are used as before.
 * Counts sent back are anonymous (no customer, no device, no order).
 */
let RECO = null;            // server answer, or null
let recoLastSuccess = 0;
let recoRequest = null;
const RECO_MAX_AGE_MS = 10 * 60 * 1000;
const recoQueue = [];
let recoFlushTimer = null;
const recoSeen = new Set(); // "placement:item" already counted as shown in this visit

function recoCopy(en, ar) { return state.lang === "ar" ? ar : en; }

function recoValid(payload) {
  return payload && payload.version === 1 && payload.restaurant_id === MENU_CONFIG.restaurantId &&
    payload.for_item && typeof payload.for_item === "object" && Array.isArray(payload.popular) &&
    payload.roles && typeof payload.roles === "object";
}

async function refreshRecommendations() {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(`${MENU_CONFIG.url}/rest/v1/rpc/oracy_customer_recommendations_v1`, {
      method: "POST", headers: {apikey: MENU_CONFIG.publicKey, "Content-Type": "application/json"},
      body: JSON.stringify({p_restaurant_id: MENU_CONFIG.restaurantId}), cache: "no-store", credentials: "omit",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Recommendations API ${response.status}`);
    const payload = await response.json();
    if (!recoValid(payload)) throw new Error("Invalid recommendations response");
    RECO = payload; recoLastSuccess = Date.now();
    if (typeof refreshMenuUI === "function") refreshMenuUI();
  } catch (error) {
    RECO = null; recoLastSuccess = 0;   // fall back to the manual pairings
    console.warn(`${APP_CONFIG.brand.shortName} recommendations:`, error.message);
  } finally { clearTimeout(timer); }
}
function requestRecommendations() {
  if (!recoRequest) recoRequest = refreshRecommendations().finally(() => { recoRequest = null; });
  return recoRequest;
}
function recoReady() {
  return RECO !== null && Date.now() - recoLastSuccess <= RECO_MAX_AGE_MS && menuReady();
}

// ---------- pure logic (tested) ----------
/** One item's list from the server: [{id, source}] in order. */
function recoListFor(data, itemId) {
  const list = data && data.for_item && data.for_item[itemId];
  return Array.isArray(list) ? list.filter(e => e && typeof e.id === "string" && ["manual", "auto"].includes(e.source)) : [];
}

/**
 * Suggestions for a cart: every cart item's manual picks first, then the
 * automatic ones, then complete-the-meal (side, drink, dessert) when the
 * cart has a main. ok(id) = can be added now; roleOf(id) = the item's role.
 */
function recoForCart(data, cartIds, ok, roleOf, menuOrder = []) {
  if (!data || !cartIds.length) return [];
  const max = Math.max(1, Math.min(10, Number(data.max_shown) || 5));
  const inCart = new Set(cartIds), seen = new Set(), out = [];
  const push = (id, source) => {
    if (out.length >= max || inCart.has(id) || seen.has(id) || !ok(id)) return;
    seen.add(id); out.push({id, source});
  };
  const lists = [...new Set(cartIds)].map(id => recoListFor(data, id));
  for (const source of ["manual", "auto"]) for (const list of lists) for (const e of list) if (e.source === source) push(e.id, source);
  if (data.smart_fill !== false && out.length < max) {
    // roles already covered by the cart or by a suggestion above
    const roles = new Set([...cartIds, ...out.map(e => e.id)].map(roleOf));
    if (new Set(cartIds.map(roleOf)).has("main")) {
      const never = new Set(Array.isArray(data.never_auto) ? data.never_auto : []);
      for (const role of ["side", "drink", "dessert"]) {
        if (roles.has(role) || out.length >= max) continue;
        // most ordered first; with no history yet, the menu's own order
        const pick = [...data.popular, ...menuOrder]
          .find(id => roleOf(id) === role && !never.has(id) && !inCart.has(id) && !seen.has(id) && ok(id));
        if (pick) push(pick, "fill");
      }
    }
  }
  return out;
}

/** "Goes well with" on an item screen. */
function recoForItem(data, itemId, ok, limit = 4) {
  return recoListFor(data, itemId).filter(e => e.id !== itemId && ok(e.id)).slice(0, limit);
}

// ---------- anonymous counts ----------
function recoTrack(source, placement, kind, value = 0) {
  if (!["manual", "auto", "fill"].includes(source)) return;
  recoQueue.push({source, placement, kind, ...(kind === "added" ? {value: Math.max(0, Number(value) || 0)} : {})});
  if (recoQueue.length >= 30) return recoFlush();
  if (!recoFlushTimer && typeof setTimeout === "function") recoFlushTimer = setTimeout(recoFlush, 4000);
}
function recoShown(placement, entries) {
  for (const e of entries) {
    const key = `${placement}:${e.id}`;
    if (recoSeen.has(key)) continue;
    recoSeen.add(key); recoTrack(e.source, placement, "shown");
  }
}
function recoFlush() {
  if (recoFlushTimer) { clearTimeout(recoFlushTimer); recoFlushTimer = null; }
  const events = recoQueue.splice(0, 30);
  if (!events.length || typeof fetch !== "function") return;
  try {
    fetch(`${MENU_CONFIG.url}/rest/v1/rpc/oracy_reco_events_v1`, {
      method: "POST", headers: {apikey: MENU_CONFIG.publicKey, "Content-Type": "application/json"},
      body: JSON.stringify({p_restaurant_id: MENU_CONFIG.restaurantId, p_events: events}),
      cache: "no-store", credentials: "omit", keepalive: true,
    }).catch(() => {});
  } catch (_) {}
}

// ---------- hooks into the existing screens ----------
function recoRoleOf(id) {
  const item = itemById(id);
  return item && RECO && RECO.roles ? RECO.roles[item.category] || "other" : "other";
}
function recoCanAdd(id) { const item = itemById(id); return !!item && canAddItem(item); }

/* Batch E: suggestions switched off for the restaurant = none anywhere (no heading, no manual pairings). */
function recoOff() { return typeof featureOn === "function" && !featureOn("recommendations"); }
const legacyCartRecommendations = cartRecommendations;
const legacyRequestCustomerContent = requestCustomerContent;

requestCustomerContent = function () {
  // The list changes at most daily: ask again only when ours is 5+ minutes old.
  if (!RECO || Date.now() - recoLastSuccess > 5 * 60 * 1000) requestRecommendations();
  return legacyRequestCustomerContent();
};

/** Cart suggestions as menu items, each with its source. */
cartRecommendations = function () {
  if (recoOff()) return [];
  if (!recoReady() || !state.cart.length) {
    return legacyCartRecommendations().map(item => Object.assign(Object.create(item), {item, recoSource: "manual"}));
  }
  const ids = state.cart.filter(l => canOrderItem(itemById(l.id))).map(l => l.id);
  let list = recoForCart(RECO, ids, recoCanAdd, recoRoleOf, ITEMS.map(i => i.id))
    .map(e => ({item: itemById(e.id), recoSource: e.source}));
  if (offerSpendStatus().remaining > 0) list.sort((a, b) => Number(!!a.item.offer) - Number(!!b.item.offer));
  return list.map(x => Object.assign(Object.create(x.item), x));
};

let recoPending = null;   // a suggestion opened to choose its options; counted only if it reaches the cart

addRecommended = function (id, placement = "cart") {
  const found = (placement === "item" ? itemRecommendations(itemById(state.itemId)) : cartRecommendations()).find(i => i.id === id);
  if (!found) { toast(menuText("unavailableItem")); return; }
  const item = found.item || found;
  if (enabledChoices(item, "Variant").length || enabledChoices(item, "Option").length || enabledChoices(item, "Add-on").length) {
    recoPending = {id, source: found.recoSource, placement};
    openItem(id); return;
  }
  // Keep what the customer already chose on the item they are looking at.
  const kept = {size: state.size, choice: state.choice, extras: [...(state.extras || [])], spice: state.spice};
  state.size = "regular"; state.choice = null; state.extras = []; state.spice = "medium";
  const added = addToCart(item);
  if (placement === "item") Object.assign(state, kept);
  if (added) { recoTrack(found.recoSource, placement, "added", item.price); renderKeepScroll(); }
};

/** Called by addFromDetail (app.js) after the item really went into the cart. */
function recoAddedFromDetail(itemId) {
  if (!recoPending || recoPending.id !== itemId) return;
  const line = state.cart[state.cart.length - 1];
  recoTrack(recoPending.source, recoPending.placement, "added", line && line.id === itemId ? line.price : itemById(itemId)?.price);
  recoPending = null;
}

function recoCard(i, placement) {
  return `<article class="pairing-card">
      <button class="pairing-detail" onclick="openItem('${i.id}')" aria-label="${loc(i, "name")}">
        ${typeof photoPlaceholder === "function" && !hasOwnPhoto(i) ? photoPlaceholder("cx-ph-pair") : `<img src="${i.image}" alt="" loading="lazy">`}<span>${loc(i, "name")}</span></button>
      ${i.offer ? `<span class="badge">${offerLabel(i.offer)}</span>` : ""}
      ${i.recoSource === "auto" ? `<small class="reco-why">${recoCopy("Often ordered together", "يُطلب معه غالباً")}</small>` : ""}
      ${i.recoSource === "fill" ? `<small class="reco-why">${recoCopy("Complete your meal", "أكمل وجبتك")}</small>` : ""}
      <button class="btn btn-primary pairing-add" onclick="addRecommended('${i.id}','${placement}')" aria-label="${t("add")} ${loc(i, "name")}"><span>${money(i.price)}</span><b aria-hidden="true">+</b></button>
    </article>`;
}

cartRecommendationsMarkup = function () {
  const items = cartRecommendations();
  if (!items.length) return "";
  recoShown("cart", items.map(i => ({id: i.id, source: i.recoSource})));
  return `<section class="pairings"><h3>${cartCopy("Pairs well with your order", "إضافات تناسب طلبك")}</h3>
    <div class="pairing-grid">${items.map(i => recoCard(i, "cart")).join("")}</div></section>`;
};

function itemRecommendations(item) {
  if (!item || recoOff() || !recoReady()) return [];
  return recoForItem(RECO, item.id, recoCanAdd).map(e => Object.assign(Object.create(itemById(e.id)), {item: itemById(e.id), recoSource: e.source}));
}
function itemRecommendationsMarkup(item) {
  if (state.cartEditKey) return "";
  const items = itemRecommendations(item);
  if (!items.length) return "";
  recoShown("item", items.map(i => ({id: i.id, source: i.recoSource})));
  return `<section class="pairings reco-item"><h3>${recoCopy("Goes well with", "يُقدّم مع")}</h3>
    <div class="pairing-grid">${items.map(i => recoCard(i, "item")).join("")}</div></section>`;
}

/** After an order: "Next time, try" — the placed order's suggestions (open only). */
function nextTimeRecommendationsMarkup(order) {
  if (recoOff() || !recoReady() || !order || !Array.isArray(order.items)) return "";
  const ids = order.items.map(l => l.id).filter(id => itemById(id));
  const list = recoForCart(RECO, ids, id => !!itemById(id) && canOrderItem(itemById(id)), recoRoleOf).slice(0, 3);
  if (!list.length) return "";
  recoShown("confirmation", list);
  return `<section class="pairings reco-next"><h3>${recoCopy("Next time, try", "في المرة القادمة جرّب")}</h3>
    <div class="pairing-grid">${list.map(e => {
      const i = itemById(e.id);
      return `<article class="pairing-card"><button class="pairing-detail" onclick="openItem('${i.id}')" aria-label="${loc(i, "name")}">
        ${typeof photoPlaceholder === "function" && !hasOwnPhoto(i) ? photoPlaceholder("cx-ph-pair") : `<img src="${i.image}" alt="" loading="lazy">`}<span>${loc(i, "name")}</span></button>
        <div class="pairing-price">${itemPriceMarkup(i)}</div></article>`;
    }).join("")}</div></section>`;
}

if (typeof window !== "undefined") {
  window.addRecommended = addRecommended;
  if (typeof window.addEventListener === "function") window.addEventListener("pagehide", recoFlush);
}
