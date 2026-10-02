/* Batch A (256): add more items to an order that is already in the restaurant.
 * The server prices the lines and decides; the cashier accepts; it stays one bill. */
const orderAddons = {info: new Map(), loading: new Set(), sending: false};
const ADDON_FOR_KEY = "oracy_addon_for";
function addonCopy(en, ar) { return state.lang === "ar" ? ar : en; }
function addonTarget() { return state.addonFor && state.addonFor.id ? state.addonFor : null; }
function addonRemember() {
  try {
    if (addonTarget()) sessionStorage.setItem(ADDON_FOR_KEY, JSON.stringify(state.addonFor));
    else sessionStorage.removeItem(ADDON_FOR_KEY);
  } catch (_) {}
}
function addonRestore() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(ADDON_FOR_KEY) || "null");
    if (saved && typeof saved.id === "string" && typeof saved.number === "string") {
      state.addonFor = {id: saved.id, number: saved.number, token: typeof saved.token === "string" ? saved.token : null,
        restaurant: saved.restaurant};
      if (saved.restaurant !== MENU_CONFIG.restaurantId) state.addonFor = null;
    }
  } catch (_) {}
}
function addonOrderOpen(type, status) {
  return ["dinein", "takeaway"].includes(type) && ["accepted", "preparing", "ready"].includes(status);
}
async function loadOrderAddons(id, token, quiet = false) {
  if (!id || orderAddons.loading.has(id)) return;
  orderAddons.loading.add(id);
  try {
    const info = await customerOrderRpc("oracy_customer_order_addons_v1", {p_order_id: id, p_tracking_token: token || null});
    if (!info || typeof info !== "object" || !Array.isArray(info.addons)) throw new Error("Invalid add-on response");
    const before = JSON.stringify(orderAddons.info.get(id) || null);
    orderAddons.info.set(id, info);
    if (before !== JSON.stringify(info) && state.screen === "track") renderKeepScroll();
  } catch (_) {
    if (!quiet && !orderAddons.info.has(id)) orderAddons.info.set(id, {can_add: false, reason: "unknown", addons: []});
  } finally { orderAddons.loading.delete(id); }
}
function addonLinesText(items) {
  return (Array.isArray(items) ? items : []).map(l => `${Number(l.quantity) || 0} × ${escapeHtml(String(l.name || ""))}`).join(", ");
}
/** The add-on part of an order card on the Orders screen. order = {id, number, token, type, status}. */
function orderAddonsMarkup(order) {
  if (!order || !order.id) return "";
  const info = orderAddons.info.get(order.id);
  if (!addonOrderOpen(order.type, order.status)) {
    return "";
  }
  if (!info) { loadOrderAddons(order.id, order.token); return ""; }
  const last = info.addons[info.addons.length - 1];
  const waiting = info.addons.find(a => a.status === "pending");
  let note = "";
  if (waiting) {
    note = `<div class="addon-note addon-waiting" role="status"><strong>${addonCopy("Waiting for the restaurant", "بانتظار المطعم")}</strong>
      <span>${addonLinesText(waiting.items)}</span></div>`;
  } else if (last && last.status === "declined") {
    note = `<div class="addon-note addon-declined" role="status"><strong>${addonCopy("The restaurant could not add your items", "تعذر على المطعم إضافة الأصناف")}</strong>
      <span>${escapeHtml(String(last.decline_reason || ""))}</span></div>`;
  }
  const button = info.can_add
    ? `<button class="btn btn-primary addon-start" onclick="startOrderAddon('${escapeHtml(order.id)}','${escapeHtml(order.number)}','${escapeHtml(order.token || "")}')">
        <span aria-hidden="true">+</span> ${addonCopy("Add more items", "إضافة أصناف أخرى")}</button>` : "";
  return note + button;
}
/** For a guest's order card: the items the restaurant has already added (the card itself lists the first ones). */
function orderAddedItemsMarkup(id) {
  const info = orderAddons.info.get(id);
  if (!info) return "";
  return info.addons.filter(a => a.status === "accepted").flatMap(a => a.items)
    .map(l => `<div class="active-order-item"><span>${Number(l.quantity) || 0} × ${escapeHtml(String(l.name || ""))}</span></div>`).join("");
}
function startOrderAddon(id, number, token) {
  state.addonFor = {id, number, token: token || null, restaurant: MENU_CONFIG.restaurantId};
  addonRemember();
  toast(addonCopy(`Adding to order #${number}`, `إضافة إلى الطلب #${number}`), 2600);
  go(state.cart.length ? "cart" : "menu");
}
function cancelOrderAddon() {
  state.addonFor = null;
  addonRemember();
  if (state.screen === "cart") renderKeepScroll();
}
/** Replaces the coupon box, totals and Proceed button of the cart while adding to an order. */
function addonCartMarkup() {
  const target = addonTarget();
  if (!target) return "";
  const sum = roundMoney(state.cart.reduce((n, l) => n + linePrice(l), 0));
  return `<div class="addon-cart" id="addonCart">
    <div class="addon-cart-head"><div><span>${addonCopy("Adding to order", "إضافة إلى الطلب")}</span><strong>#${escapeHtml(target.number)}</strong></div>
      <button type="button" class="link" onclick="cancelOrderAddon()">${addonCopy("Cancel", "إلغاء")}</button></div>
    <div class="addon-cart-row"><span>${addonCopy("Items to add", "الأصناف المضافة")}</span><strong>${money(sum)}</strong></div>
    <p class="addon-cart-hint">${addonCopy("The restaurant confirms and adds these to your bill. You pay once, at the end.",
      "يؤكد المطعم الطلب ويضيف الأصناف إلى فاتورتك. تدفع مرة واحدة في النهاية.")}</p>
    <button class="btn btn-primary" id="addonSend" ${orderAddons.sending ? "disabled" : ""} onclick="sendOrderAddon()">
      ${orderAddons.sending ? addonCopy("Sending…", "جارٍ الإرسال…") : addonCopy("Send to restaurant", "إرسال إلى المطعم")}</button>
  </div>`;
}
async function sendOrderAddon() {
  const target = addonTarget();
  if (!target || orderAddons.sending || !state.cart.length) return;
  if (typeof validateMenuCart === "function" && !(await validateMenuCart())) return;
  orderAddons.sending = true;
  if (state.screen === "cart") renderKeepScroll();
  target.clientId ||= crypto.randomUUID();   // the same id on a retry: never sent twice
  try {
    const result = await customerOrderRpc("oracy_request_order_addon_v1", {
      p_order_id: target.id, p_tracking_token: target.token || null,
      p_request: {
        client_addon_id: target.clientId,
        items: state.cart.map(line => {
          const item = itemById(line.id);
          return {menu_item_id: line.id, quantity: line.qty,
            notes: [line.notes || "", state.notes || ""].filter(Boolean).join(" · ").slice(0, 300),
            choices: selectedChoices(item, line).map(choice => ({name: choice.name, type: choice.type,
              ...(choice.rowId ? {id: choice.rowId} : {})}))};
        }),
      },
    });
    state.cart = [];
    state.notes = "";
    saveCartDraft();
    state.addonFor = null;
    addonRemember();
    orderAddons.info.delete(target.id);
    state.orderTab = "active";
    toast(addonCopy(`Sent. New total after the restaurant confirms: ${money(Number(result.order_total) || 0)}`,
      `تم الإرسال. الإجمالي الجديد بعد تأكيد المطعم: ${money(Number(result.order_total) || 0)}`), 6000);
    go("track");
  } catch (error) {
    toast(String(error?.message || error), 6500);
    // An order that can no longer take items: leave the mode, keep the cart for a normal order.
    if (/paid or closed|No more items|delivery order|not available/i.test(String(error?.message || ""))) {
      state.addonFor = null; addonRemember();
    } else { target.clientId = null; }
  } finally {
    orderAddons.sending = false;
    if (state.screen === "cart") renderKeepScroll();
  }
}
/* While the Orders screen is open, open orders' add-on state is read again every few seconds. */
function refreshOrderAddonsQuietly() {
  if (state.screen !== "track" || (typeof document !== "undefined" && document.hidden)) return;
  if (state.isLoggedIn && typeof accountOrders !== "undefined") {
    accountOrders.rows.filter(o => addonOrderOpen(o.fulfillment_type, o.status)).slice(0, 5)
      .forEach(o => loadOrderAddons(o.id, null, true));
  } else if (state.order?.backendId && addonOrderOpen(state.order.orderType, state.order.status)) {
    loadOrderAddons(state.order.backendId, state.order.trackingToken, true);
  }
}
if (typeof setInterval === "function") setInterval(refreshOrderAddonsQuietly, 6000);
addonRestore();
if (addonTarget() && typeof render === "function" && state.screen === "cart") render();
