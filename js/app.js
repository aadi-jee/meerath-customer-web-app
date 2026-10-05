const VAT = 0.15;

const state = {
  lang: readAppStorage("language", ["mk-lang"]) === "ar" ? "ar" : "en",
  appearance: ["dark", "light", "system"].includes(
    readAppStorage("appearance", ["mk-appearance"])
  )
    ? readAppStorage("appearance", ["mk-appearance"])
    : "dark",
  screen: "splash",
  categoryId: "",
  subcategoryId: "",
  itemId: "",
  cartEditKey: null,
  orderType: "dinein",
  cart: [],
  size: "regular",
  choice: null,
  extras: [],
  spice: "medium",
  notes: "",
  coupon: "",
  couponOn: false,
  voucher: null,   // Batch D: the checked voucher (server answer)
  redeemPoints: 0,   // Batch R: points chosen at checkout (the server re-checks them)
  customer: { name: "", mobile: "", email: "" },
  order: null,
  orderSubmitting: false,
  orderTab: "active",
orderHistory: [],
  offerTab: "all",
  rating: "",
  feedback: "",
  searchQuery: "",
  isLoggedIn: false,
  loginMobile: "",
  otpCode: "",
  otpPurpose: "login",
  authBusy: false,
  authUserId: "",
  otpSentAt: 0,
  savedAddresses: [],
  defaultAddressId: null,
  checkoutAddressId: null,
  deliveryQuote: null,
  deliveryQuoteKey: "",
  deliveryQuoteBusy: false,
  deliveryQuoteError: "",
  deliveryQuoteRequest: 0,
editingAddressId: null,
  customerName: "",
  customerPhone: "",
  customerEmail: "",
  addressType: "home",
  addressArea: "",
  addressStreet: "",
  addressBuilding: "",
  addressUnit: "",
  addressDirections: "",
  addressReturnScreen: "account",
  supportType: "",
  supportOrder: "",
  supportDetails: "",
  orderTiming: "asap",
};

let cartLineSequence = 0;
function newCartKey() { return "line-" + (++cartLineSequence); }
function cartCopy(en, ar) { return state.lang === "ar" ? ar : en; }
// Batch H: restaurantAcceptingOrders / orderTypeOpen / restaurantClosedMessage live in ordering-hours.js (the server decides).
let cartDraftRestored = false;
function saveCartDraft() {
  if (!cartDraftRestored) return;
  try {
    const key = appStorageKey('cart');
    if (!state.cart.length) { localStorage.removeItem(key); return; }
    localStorage.setItem(key, JSON.stringify({version:1, restaurantId:MENU_CONFIG.restaurantId,
      branchId:MENU_CONFIG.branchId, orderType:state.orderType,
      items:state.cart.map(({id,qty,size,choice,extras,spice}) => ({id,qty,size,choice,extras,spice}))}));
  } catch (_) { /* Browsing remains usable when device storage is unavailable. */ }
}
function restoreCartDraft() {
  if (cartDraftRestored) return;
  cartDraftRestored = true;
  if (state.cart.length) return;
  try {
    const draft = JSON.parse(localStorage.getItem(appStorageKey('cart')) || 'null');
    if (!draft || draft.version !== 1 || draft.restaurantId !== MENU_CONFIG.restaurantId ||
        draft.branchId !== MENU_CONFIG.branchId || !Array.isArray(draft.items)) return;
    state.cart = draft.items.slice(0,100).flatMap(line => {
      if (!line || !isMenuId(line.id) || !Number.isSafeInteger(line.qty) || line.qty < 1 || line.qty > 999) return [];
      const item = itemById(line.id);
      if (!item) return [];
      const choices = normalizeItemChoices(item, line);
      return [{id:item.id,cartKey:newCartKey(),qty:line.qty,size:choices.size,choice:choices.choice,
        extras:choices.extras,spice:['mild','medium','spicy'].includes(line.spice)?line.spice:'medium',
        price:roundMoney(item.price+choices.extraPrice),basePrice:roundMoney(item.basePrice+choices.baseExtraPrice),image:item.image}];
    });
    if (['delivery','takeaway','dinein'].includes(draft.orderType)) state.orderType=draft.orderType;
  } catch (_) { /* Ignore malformed drafts; never trust stored prices or HTML. */ }
}
function unavailableTimeMessage() {
  return cartCopy(
    "One or more items in your cart are not available at this time. Please remove the unavailable item or choose another item.",
    "صنف واحد أو أكثر في سلتك غير متاح في هذا الوقت. يرجى إزالة الصنف غير المتاح أو اختيار صنف آخر."
  );
}
function itemCartQty(id) {
  return state.cart.filter(l => l.id === id).reduce((n,l) => n + l.qty, 0);
}
function limitMessage(item) {
  const cap = item?.offer?.maxQty;
  return cartCopy(`Maximum limit is ${cap} for this offer.`,
    `الحد الأقصى لهذا الصنف في السلة مع العرض: ${cap}.`);
}
function canAddItem(item, qty = 1) {
  return canOrderItem(item) && Number.isSafeInteger(qty) && qty > 0 &&
    itemCartQty(item.id) + qty <= (item.offer?.maxQty ?? Infinity);
}
function prepareChoices(item, selection = {}) {
  const normalized = normalizeItemChoices(item, selection);
  state.size = normalized.size;
  state.choice = normalized.choice;
  state.extras = normalized.extras;
  return normalized;
}
function selectedChoices(item, selection = state) {
  const normalized = normalizeItemChoices(item, selection);
  const ids = new Set([normalized.size, normalized.choice, ...normalized.extras].filter(Boolean));
  return (item?.options || []).filter(x => ids.has(x.id));
}
function choicesValid(item, selection = state) {
  const rows = enabledChoices(item, "Option");
  return !rows.some(x => x.required) || rows.some(x => x.id === selection.choice);
}
function choicePriceText(choice) {
  // Batch V (238): a full-price size shows its own price, not "+".
  if (choice.final) return ` <small>${money(choice.price)}</small>`;
  return choice.price > 0 ? ` <small>+ ${money(choice.price)}</small>` : "";
}
function choiceName(choice) {
  return escapeHtml(state.lang === "ar" && choice.nameAr ? choice.nameAr : choice.name);
}
// Batch V (238): the big price on the item screen follows the chosen size,
// choice and extras straight away (no full re-render).
function detailPriceMarkup(item) {
  const n = normalizeItemChoices(item, state);
  const price = roundMoney(item.price + n.extraPrice), base = roundMoney(item.basePrice + n.baseExtraPrice);
  const old = item.offer && base > price ? `<del style="color:var(--muted);font-size:0.85em;margin-inline-end:8px">${money(base)}</del>` : "";
  return `${old}<span>${money(price)}</span>`;
}
function refreshDetailPrice() {
  const item = itemById(state.itemId);
  const el = typeof document !== "undefined" && document.getElementById("detail-price");
  if (item && el) el.innerHTML = detailPriceMarkup(item);
}
// Batch V2 (247): the restaurant's own title for the choices, with "Required" once.
function optionGroupTitle(options) {
  const named = options.find(x => x.group);
  const title = named ? escapeHtml(state.lang === "ar" && named.groupAr ? named.groupAr : named.group)
    : cartCopy("Choose an option", "اختر خياراً");
  return `${title}${options.some(x => x.required) ? ` <small class="choice-required">${cartCopy("Required", "مطلوب")}</small>` : ""}`;
}
function choiceBadge(row) {
  if (row.type !== "Option" || !row.badge) return "";
  return ` <em class="choice-badge">${escapeHtml(state.lang === "ar" && row.badgeAr ? row.badgeAr : row.badge)}</em>`;
}
function choiceNote(row) {
  if (row.type !== "Option" || !row.note) return "";
  return `<small class="choice-note">${escapeHtml(state.lang === "ar" && row.noteAr ? row.noteAr : row.note)}</small>`;
}
function itemChoiceMarkup(item) {
  const variants = enabledChoices(item, "Variant");
  const options = enabledChoices(item, "Option");
  const addons = enabledChoices(item, "Add-on");
  const group = (title, rows, mode, allowNone = false) => !rows.length ? "" : `<div class="item-choice-group"><h4>${title}</h4>
    ${allowNone ? `<label class="item-choice-row"><input type="radio" name="choice-Option" ${state.choice == null ? "checked" : ""} onchange="clearChoice()"><span>${cartCopy("No option", "بدون خيار")}</span></label>` : ""}
    ${rows.map(row => { const closed = !choiceOpen(row); return `<label class="item-choice-row${closed ? " is-closed" : ""}"${closed ? ' style="opacity:.55"' : ""}><input type="${mode}" name="${mode === "radio" ? `choice-${row.type}` : row.id}"
      ${row.type === "Variant" ? (state.size === row.id ? "checked" : "") : row.type === "Option" ? (state.choice === row.id ? "checked" : "") : (state.extras.includes(row.id) ? "checked" : "")}
      ${(row.type === "Add-on" && row.required) || closed ? "disabled" : ""}
      onchange="${row.type === "Variant" ? `selectVariant('${row.id}')` : row.type === "Option" ? `selectChoice('${row.id}')` : `toggleExtra('${row.id}')`}">
      <span>${choiceName(row)}${row.type !== "Option" && row.required ? ` <small>${cartCopy("Required", "مطلوب")}</small>` : ""}${choiceBadge(row)}${choiceNote(row)}${row.windows?.length ? ` <small>${closed ? cartCopy("Not available now", "غير متاح الآن") + " · " : ""}${cartCopy("Available", "متاح")} ${choiceHoursText(row)}</small>` : ""}</span><strong>${choicePriceText(row)}</strong></label>`; }).join("")}</div>`;
  const sized = variants.some(x => x.final);
  return `${group(sized ? cartCopy("Choose a size", "اختر الحجم") : cartCopy("Choose a variant", "اختر النوع"), variants, "radio")}
    ${group(optionGroupTitle(options), options, "radio", !options.some(x => x.required || x.isDefault))}
    ${group(cartCopy("Add-ons", "إضافات"), addons, "checkbox")}`;
}
function cartChoiceText(item, line) {
  const labels = selectedChoices(item, line).map(row => state.lang === "ar" && row.nameAr ? row.nameAr : row.name);
  labels.push(t(line.spice));
  return escapeHtml(labels.join(" · "));
}
function offerLimitMarkup(item) {
  const cap = item?.offer?.maxQty;
  const min = item?.offer?.minRegularSpend;
  return `${cap > 0 ? `<p class="offer-cap">${cartCopy(`Limit ${cap} per order`, `الحد الأقصى ${cap} لكل طلب`)}</p>` : ""}
    ${min > 0 ? `<p class="offer-cap">${cartCopy(`Requires ${money(min)} in regular-priced items per discounted unit.`, `يتطلب كل صنف مخفض ${money(min)} من الأصناف بالسعر العادي.`)}</p>` : ""}`;
}
function offerSpendStatus() {
  let required = 0, grossCents = 0;
  for (const line of state.cart) {
    const item = itemById(line.id);
    if (!item || !Number.isSafeInteger(line.qty) || line.qty <= 0) continue;
    if (item.offer) required += Math.round((item.offer.minRegularSpend || 0) * 100) * line.qty;
    else if (canOrderItem(item)) {
      const extraPrice = normalizeItemChoices(item, line).extraPrice;
      grossCents += Math.round((item.price + extraPrice) * 100) * line.qty;
    }
  }
  // Customer-facing threshold uses displayed, VAT-inclusive menu prices.
  const qualifying = grossCents;
  return {required: required / 100, qualifying: qualifying / 100,
    remaining: Math.max(0, required - qualifying) / 100};
}
function offerSpendMessage(status = offerSpendStatus()) {
  return cartCopy(`Add ${money(status.remaining)} more in regular-priced items to use this offer, or remove the offer item.`,
    `أضف أصنافاً بالسعر العادي بقيمة ${money(status.remaining)} إضافية للاستفادة من العرض، أو احذف صنف العرض.`);
}
function checkOfferSpend() {
  const status = offerSpendStatus();
  if (status.remaining > 0) { toast(offerSpendMessage(status), 5000); return false; }
  return true;
}
function offerSpendMarkup() {
  const status = offerSpendStatus();
  if (!status.required || !status.remaining) return "";
  return `<p class="offer-spend-notice" role="status">${escapeHtml(offerSpendMessage(status))}</p>`;
}
function checkOfferCartRules() { return checkOfferSpend(); }
const $app = () => document.getElementById("app");
const $toast = () => document.getElementById("toast");

function t(key) {
  return (I18N[state.lang] && I18N[state.lang][key]) || I18N.en[key] || key;
}

function brandedRewardsLabel() {
  return state.lang === "ar"
    ? `${t("rewards")} ${brandShortName("ar")}`
    : `${brandShortName("en")} ${t("rewards")}`;
}

function brandedWelcomeLabel() {
  return state.lang === "ar"
    ? `مرحباً بك في ${APP_CONFIG.brand.shortNameAr}`
    : `Welcome to ${APP_CONFIG.brand.shortName}`;
}

function loc(obj, field) {
  if (!obj) return "";
  return escapeHtml(state.lang === "ar" ? obj[field + "Ar"] || obj[field] : obj[field]);
}

function applyDir() {
  const ar = state.lang === "ar";
  document.documentElement.lang = ar ? "ar" : "en";
  document.documentElement.dir = ar ? "rtl" : "ltr";
  document.body.classList.toggle("is-ar", ar);
}

function applyAppearance() {
  let mode = state.appearance;

  if (mode === "system") {
    mode = window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  }

  document.body.classList.toggle("light-theme", mode === "light");
  document.body.classList.toggle("dark-theme", mode === "dark");

  document.documentElement.style.colorScheme = mode;
  applyBrandShell(mode);
}

function setAppearance(mode) {
  if (!["dark", "light", "system"].includes(mode)) return;

  state.appearance = mode;
  localStorage.setItem(appStorageKey("appearance"), mode);

  applyAppearance();
  render();
}

function setLang(lang) {
  state.lang = lang;
  localStorage.setItem(appStorageKey("language"), lang);
  applyDir();
  render();
}

function go(screen, extra = {}) {
  if (typeof captureCartOrigin === 'function') captureCartOrigin(screen);
  if (screen === "savedAddressesPage" && state.screen !== "addAddressPage") {
    state.addressReturnScreen = state.screen === "checkout" ? "checkout" : state.screen === "home" ? "home" : "account";
  }
  if (screen !== "detail") state.cartEditKey = null;
  if (["rewards", "account"].includes(screen) && typeof rewardsTouch === "function") rewardsTouch();
  // Batch H: opening the cart or checkout asks the server again, so a pause shows before the customer presses Place Order.
  if (["cart", "checkout"].includes(screen) && typeof loadOrderingHours === "function") loadOrderingHours();
  if (typeof orderingApplyFeatures === "function") orderingApplyFeatures();   // Batch E: never land on a switched-off choice
  // Batch A: while adding to an order there is no checkout; the cart sends the items.
  if (screen === "checkout" && typeof addonTarget === "function" && addonTarget()) screen = "cart";
  if (screen === "checkout") {
    validateMenuCart().then(ok => { if (ok && checkOfferCartRules()) { Object.assign(state, extra, {screen}); render(); } });
    return;
  }
  if (screen === "listing" && extra.categoryId !== undefined && extra.categoryId !== state.categoryId) state.subcategoryId = "";
  Object.assign(state, extra, { screen });
  // A returning customer goes straight to Home next time (the welcome screen is shown once).
  if (screen !== "splash") { try { localStorage.setItem(appStorageKey("welcomed"), "1"); } catch (_) {} }
  if (screen === 'track' && state.isLoggedIn && typeof loadAccountOrders === 'function') loadAccountOrders();
  if (screen === 'savedAddressesPage' && state.isLoggedIn && typeof loadAccountAddresses === 'function') loadAccountAddresses();
  render();
  $app().parentElement.scrollTop = 0;
}

function itemById(id) {
  return ITEMS.find((i) => i.id === id);
}

function cartCount() {
  return state.cart.reduce((n, l) => n + l.qty, 0);
}

function linePrice(line) {
  return Number(line.price) * line.qty;
}

// Batch D (253): the restaurant's own voucher codes. The server checks the
// code (oracy_voucher_check_v1) and prices it again at checkout; this is the
// same sum for the cart on screen.
function voucherDiscountCents(itemsCents, hasItemOffer) {
  const v = state.couponOn ? state.voucher : null;
  if (!v || itemsCents <= 0) return 0;
  if (hasItemOffer && !v.allow_with_offers) return 0;
  if (itemsCents < Math.round(Number(v.min_food || 0) * 100)) return 0;
  const value = Number(v.value) || 0;
  if (v.kind === "percent") {
    const top = v.max_discount == null ? itemsCents : Math.round(Number(v.max_discount) * 100);
    return Math.max(0, Math.min(itemsCents, top, Math.round(itemsCents * value / 100)));
  }
  return Math.max(0, Math.min(itemsCents, Math.round(value * 100)));
}
const VOUCHER_MESSAGES_AR = {
  "This code is not valid": "هذا الكود غير صالح",
  "Too many tries. Please wait a few minutes": "محاولات كثيرة. يرجى الانتظار بضع دقائق",
  "Too many recent orders. Please call the restaurant": "طلبات كثيرة خلال وقت قصير. يرجى الاتصال بالمطعم",
  "Ordering is very busy right now. Please try again in a few minutes or call the restaurant": "الطلبات مزدحمة جداً الآن. حاول مجدداً بعد دقائق أو اتصل بالمطعم",
  "Sign in to use this code": "سجّل الدخول لاستخدام هذا الكود",
  "This code cannot be used together with an item offer": "لا يمكن استخدام هذا الكود مع عروض الأصناف",
  "You have already used this code": "لقد استخدمت هذا الكود من قبل",
};
function voucherMessage(message) {
  if (state.lang !== "ar") return message;
  if (VOUCHER_MESSAGES_AR[message]) return VOUCHER_MESSAGES_AR[message];
  const min = /^This code needs at least ([0-9.]+) of food$/.exec(message || "");
  return min ? `هذا الكود يتطلب طعاماً بقيمة ${money(Number(min[1]))} على الأقل` : t("couponBad");
}
function totals() {
  // Sum integer halalas; the line prices already include VAT and item offers.
  const cents = n => Math.round(Number(n) * 100);
  const itemsCents = state.cart.reduce((n,l) => n + cents(l.price) * l.qty, 0);
  const regularCents = state.cart.reduce((n,l) =>
    n + cents(l.basePrice ?? itemById(l.id)?.basePrice ?? l.price) * l.qty, 0);
  const hasItemOffer = state.cart.some(l => itemById(l.id)?.offer);
  const couponCents = voucherDiscountCents(itemsCents, hasItemOffer);
  // Batch R: points work like the server: on the food after the coupon.
  const pointsCents = typeof rewardsDiscountFor === "function"
    ? Math.round(rewardsDiscountFor((itemsCents - couponCents) / 100, couponCents > 0) * 100) : 0;
  const discountCents = couponCents + pointsCents;
  const foodTotal = Math.max(0, itemsCents - discountCents) / 100;
  const address = typeof selectedDeliveryAddress === "function" ? selectedDeliveryAddress() : null;
  const quoteKey = address ? deliveryQuoteFingerprint(address, foodTotal) : "";
  const delivery = state.orderType === "delivery" && state.deliveryQuote?.eligible === true &&
    state.deliveryQuoteKey === quoteKey ? Number(state.deliveryQuote.fee || 0) : 0;
  const total = Math.max(0, itemsCents - discountCents + cents(delivery)) / 100;
  const vat = roundMoney(total * VAT / (1 + VAT));
  return {subtotal:roundMoney(total - vat), foodTotal, delivery, discount:couponCents / 100, points:pointsCents / 100, vat, total,
    regularItemsTotal:regularCents / 100, offerSavings:Math.max(0, regularCents - itemsCents) / 100};
}
function cartSummaryMarkup() {
  const tot = totals();
  return `${offerSpendMarkup()}<div><span>${cartCopy("Items total (VAT included)", "إجمالي الأصناف (شامل الضريبة)")}</span><span>${money(tot.regularItemsTotal)}</span></div>
    ${tot.offerSavings ? `<div class="offer-saving"><span>${cartCopy("Offer savings", "توفير العروض")}</span><span>− ${money(tot.offerSavings)}</span></div>` : ""}
    ${tot.discount ? `<div><span>${t("coupon")}${state.voucher?.code ? ` <b dir="ltr">${escapeHtml(state.voucher.code)}</b>` : ""}</span><span>− ${money(tot.discount)}</span></div>` : ""}
    ${tot.points ? `<div class="rewards-line"><span>${cartCopy(`Points (${state.redeemPoints})`, `النقاط (${state.redeemPoints})`)}</span><span>− ${money(tot.points)}</span></div>` : ""}
    ${state.orderType === "delivery" ? `<div><span>${t("deliveryFee")}</span><span>${currentDeliveryQuote()?.eligible ? money(tot.delivery) : cartCopy("Select location", "اختر الموقع")}</span></div>` : ""}
    <div class="total"><span>${t("total")}</span><span>${money(tot.total)}</span></div>
    <div class="included-vat"><span>${cartCopy("Includes VAT 15%", "يشمل ضريبة القيمة المضافة 15%")}</span><span>${money(tot.vat)}</span></div>`;
}

function toast(msg, duration = 1600) {
  const el = $toast();
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), duration);
}

function addToCart(item, qty = 1) {
  if (!canOrderItem(item)) { toast(menuText("unavailableItem")); return false; }
  if (!canAddItem(item, qty)) { toast(limitMessage(item)); return false; }
  if (!choicesValid(item)) {
    toast(cartCopy("Please choose the required option.", "يرجى اختيار الخيار المطلوب."));
    return false;
  }
  const normalized = prepareChoices(item, state);
  const extras = [...state.extras];
  const size = state.size;
  const choice = state.choice;
  const spice = state.spice;
  const existing = state.cart.find(
    (l) =>
      l.id === item.id &&
      l.size === size &&
      l.choice === choice &&
      l.spice === spice &&
      l.extras.join() === extras.join()
  );
  if (existing) existing.qty += qty;
  else
    state.cart.push({
      id: item.id,
      cartKey: newCartKey(),
      basePrice: roundMoney(item.basePrice + normalized.baseExtraPrice),
      price: roundMoney(item.price + normalized.extraPrice),
      image: item.image,
      qty,
      size,
      choice,
      spice,
      extras,
    });
  toast(t("added"));
  saveCartDraft();
  updateCartButtons();
  if (["listing","detail","offers"].includes(state.screen)) renderKeepScroll();
  return true;
}

function waLink(text) {
  return `https://wa.me/${RESTAURANT.whatsapp}?text=${encodeURIComponent(text)}`;
}

function langSwitch() {
  if (
    state.screen === "otpPage" &&
    state.otpPurpose === "guestOrder"
  ) {
    return "";
  }
  const allowedScreens = [
    "splash",
    "signInPage",
    "otpPage",
    "profileSetupPage",
  ];

  if (!allowedScreens.includes(state.screen)) {
    return "";
  }

  return `<div class="lang-switch">
    <button
      class="${state.lang === "en" ? "on" : ""}"
      onclick="setLang('en')"
    >
      EN
    </button>

    <button
      class="${state.lang === "ar" ? "on" : ""}"
      onclick="setLang('ar')"
    >
      عربي
    </button>
  </div>`;
}

function nav(active) {
  const icons = {
    home: `
      <svg viewBox="0 0 24 24" class="nav-icon" aria-hidden="true">
        <path d="M3 10.5 12 3l9 7.5"></path>
        <path d="M5 9.5V21h14V9.5"></path>
        <path d="M9 21v-6h6v6"></path>
      </svg>
    `,
    menu: `
      <svg viewBox="0 0 24 24" class="nav-icon" aria-hidden="true">
        <path d="M4 6h16"></path>
        <path d="M4 12h16"></path>
        <path d="M4 18h16"></path>
      </svg>
    `,
    orders: `
      <svg viewBox="0 0 24 24" class="nav-icon" aria-hidden="true">
        <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"></path>
        <path d="M9 8h6"></path>
        <path d="M9 12h6"></path>
        <path d="M9 16h4"></path>
      </svg>
    `,
    rewards: `
      <svg viewBox="0 0 24 24" class="nav-icon" aria-hidden="true">
        <path d="M12 3l2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.8 1-6.1-4.4-4.3 6.1-.9L12 3z"></path>
      </svg>
    `,
    more: `
  <svg viewBox="0 0 24 24" class="nav-icon" aria-hidden="true">
    <circle cx="5" cy="12" r="1.5"></circle>
    <circle cx="12" cy="12" r="1.5"></circle>
    <circle cx="19" cy="12" r="1.5"></circle>
  </svg>
`,
    account: `
      <svg viewBox="0 0 24 24" class="nav-icon" aria-hidden="true">
        <circle cx="12" cy="8" r="4"></circle>
        <path d="M4.5 21c.8-4.2 3.3-6.5 7.5-6.5s6.7 2.3 7.5 6.5"></path>
      </svg>
    `,
  };

  const items = [
    ["home", icons.home, "home"],
    ["menu", icons.menu, "menu"],
    ["track", icons.orders, "orders"],
    ["more", icons.more, "more"],
    ["account", icons.account, "account"],
  ];

  return `<nav class="nav">
    <div class="desktop-nav-brand">
      <img src="${APP_CONFIG.brand.logo}" alt="${escapeHtml(APP_CONFIG.brand.logoAlt)}" />
      <div><strong>${RESTAURANT.name}</strong><span>${escapeHtml(APP_CONFIG.branch.name)}, ${escapeHtml(APP_CONFIG.branch.city)}</span></div>
    </div>
    ${items.map(([id, icon, key]) =>
      `<button class="${active === id ? "active" : ""}" onclick="go('${id}')">
        ${icon}<span class="nav-label">${t(key)}</span>
      </button>`).join("")}
  </nav>`;
}

// ---------------------------------------------------------------------
// Batch N: navigation on every screen, and the browser / phone Back
// button works as the app's Back.
// ---------------------------------------------------------------------
const NAV_WIDE_ONLY = ["detail", "checkout", "signInPage", "otpPage", "profileSetupPage", "addAddressPage", "supportRequest", "cateringPage"];
function navTabFor(screen) {
  if (["listing", "detail", "cart", "checkout", "menu"].includes(screen)) return "menu";
  if (["confirmation", "track"].includes(screen)) return "track";
  if (["account", "rewards", "signInPage", "otpPage", "profileSetupPage", "savedAddressesPage", "addAddressPage",
       "languageSettingsPage", "appearanceSettingsPage"].includes(screen)) return "account";
  return screen === "home" ? "home" : "more";
}
const NAV_STEP_SCREENS = ["splash", "signInPage", "otpPage", "profileSetupPage"];   // never stay in the Back trail
const navTrail = [];     // screens this visit put into the browser history
let navOwnBack = 0;      // history.back() calls made by the app itself
let navPopping = false;  // drawing a screen the Back / Forward button asked for
function navContext() {
  return {screen: state.screen, categoryId: state.categoryId, subcategoryId: state.subcategoryId,
    itemId: state.itemId, orderTab: state.orderTab, itemFrom: state.itemFrom};
}
/** The screen a history entry may open now (a finished step is never reopened). */
function navTarget(ctx) {
  const screen = ctx && typeof ctx.screen === "string" ? ctx.screen : "home";
  if (screen === "checkout") return state.cart.length ? ctx : {screen: "cart"};
  if (screen === "confirmation") return state.order ? ctx : {screen: "home"};
  if (screen === "detail") return itemById(ctx.itemId) ? ctx : {...ctx, screen: "listing"};
  if (["otpPage", "profileSetupPage"].includes(screen)) return {screen: state.isLoggedIn ? "account" : "signInPage"};
  if (screen === "signInPage") return state.isLoggedIn ? {screen: "account"} : ctx;
  if (["savedAddressesPage", "addAddressPage"].includes(screen)) return state.isLoggedIn ? {...ctx, screen: "savedAddressesPage"} : {screen: "account"};
  if (screen === "splash") return {screen: "home"};
  return ctx;
}
/** Called after every draw: keeps the browser history in step with the screen. */
function navSync() {
  if (typeof history === "undefined" || typeof history.pushState !== "function") return;
  const now = state.screen, last = navTrail[navTrail.length - 1], entry = {oracy: navContext()};
  try {
    if (last === undefined) { navTrail.push(now); history.replaceState(entry, ""); return; }
    if (navPopping || now === last) { navTrail[navTrail.length - 1] = now; history.replaceState(entry, ""); return; }
    if (navTrail.length > 1 && navTrail[navTrail.length - 2] === now) {   // the app's own Back
      navTrail.pop(); navOwnBack++; history.back(); return;
    }
    // A step that is over is replaced, so Back never returns into it.
    if (NAV_STEP_SCREENS.includes(last) || (last === "checkout" && now === "confirmation")) {
      navTrail[navTrail.length - 1] = now; history.replaceState(entry, ""); return;
    }
    navTrail.push(now); history.pushState(entry, "");
  } catch (_) { /* history not available (private mode, file://): the app's own Back still works */ }
}
function navOnPop(event) {
  if (navOwnBack > 0) { navOwnBack--; return; }
  const ctx = event && event.state && event.state.oracy;
  if (!ctx) return;
  if (navTrail.length > 1 && navTrail[navTrail.length - 2] === ctx.screen) navTrail.pop();
  else navTrail.push(ctx.screen);                                           // the Forward button
  const target = navTarget(ctx);
  navPopping = true;
  try {
    Object.assign(state, target, {cartEditKey: null});
    if (state.screen === "track" && state.isLoggedIn && typeof loadAccountOrders === "function") loadAccountOrders();
    if (state.screen === "savedAddressesPage" && state.isLoggedIn && typeof loadAccountAddresses === "function") loadAccountAddresses();
    render();
    $app().parentElement.scrollTop = 0;
  } finally { navPopping = false; }
}
if (typeof window !== "undefined" && typeof window.addEventListener === "function") window.addEventListener("popstate", navOnPop);

const ITEM_BACK_SCREENS = ["cart", "home", "listing", "offers", "confirmation"];
function itemBackScreen() {
  const from = state.itemFrom;
  if (!ITEM_BACK_SCREENS.includes(from)) return "listing";
  if (from === "confirmation" && !state.order) return "listing";
  return from;
}
function back(to = "home") {
  return `
    <button
      class="icon-btn back-btn"
      onclick="go('${to}')"
      aria-label="${t("back")}"
    >
      <svg
        class="back-arrow-icon"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="M19 10.5H5"></path>
<path d="M11 4.5L5 10.5L11 16.5"></path>
      </svg>
    </button>
  `;
}

function money(n) {
  return `${t("sar")} ${Number(n).toFixed(2)}`;
}
function itemPriceMarkup(item) {
  const old = item.offer ? `<del style="color:var(--muted);font-size:0.85em;margin-inline-end:8px">${money(item.basePrice)}</del>` : "";
  return `${old}<span>${money(item.price)}</span>`;
}
function offerLabel(offer) {
  const amount = offer.type === "percentage" ? `${offer.amount}%` : money(offer.amount);
  return state.lang === "ar" ? `خصم ${amount}` : `${amount} off`;
}
/** CX-2: an item or category without its own photo gets a monogram tile, never the logo. */
function hasOwnPhoto(row) {
  return !!row && !!row.image && row.image !== APP_CONFIG.brand.logo;
}
function monogramTile(row, extraClass = "") {
  const name = String((state.lang === "ar" ? row.nameAr || row.name : row.name) || "").trim();
  return `<span class="cx-mono ${extraClass}" aria-hidden="true">${escapeHtml(Array.from(name)[0] || "")}</span>`;
}
/** CX-2: placeholders shown only while the first menu load is still running. */
function menuFirstLoad() {
  return typeof menuConnection !== "undefined" && menuConnection.status === "loading" && !CATEGORIES.length;
}
function skeletonTiles(kind, count) {
  return Array.from({length: count}, () => `<div class="cx-skel cx-skel-${kind}" aria-hidden="true"></div>`).join("");
}

/** "1 item" / "3 items" (English only needs the singular). */
function itemsCountLabel(count) {
  const n = Number(count) || 0;
  return `${n} ${n === 1 && state.lang !== "ar" ? "item" : t("items")}`;
}

function cartButton() {
  const count = cartCount();

  return `
    <button
      class="icon-btn cart-icon-btn ${count > 0 ? "has-items" : ""}"
      onclick="go('cart')"
      aria-label="${t("yourCart")}"
    >
      <svg
  class="cart-basket-icon"
  viewBox="0 0 24 24"
  aria-hidden="true"
>
  <path d="M3 4h2.5l2.1 10h10.8l2-7H7"></path>
  <circle cx="9" cy="19" r="1.5"></circle>
  <circle cx="18" cy="19" r="1.5"></circle>
</svg>

      ${
        count > 0
          ? `<span class="cart-count-badge">${count > 99 ? "99+" : count}</span>`
          : ""
      }
    </button>
  `;
}

function updateCartButtons() {
  const count = cartCount();

  document.querySelectorAll(".cart-icon-btn").forEach((button) => {
    button.classList.toggle("has-items", count > 0);

    let badge = button.querySelector(".cart-count-badge");

    if (count > 0) {
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "cart-count-badge";
        button.appendChild(badge);
      }

      badge.textContent = count > 99 ? "99+" : count;
    } else if (badge) {
      badge.remove();
    }
  });
}

function splash() {
  return `
    <section class="splash">
      <div class="splash-lang">${langSwitch()}</div>
      <img
  class="splash-brand-logo"
  src="${APP_CONFIG.brand.logo}"
  alt="${escapeHtml(APP_CONFIG.brand.logoAlt)}"
/>
      <p>${t("tagline")}</p>
      <button class="btn btn-primary" onclick="go('home')">${t("startOrdering")}</button>
      <button class="btn btn-ghost" onclick="go('menu')">${t("browseMenu")}</button>
    </section>`;
}
function normalizeSearchText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, " ")
    .trim();
}

function searchDistance(a, b) {
  const matrix = Array.from(
    { length: b.length + 1 },
    () => Array(a.length + 1).fill(0)
  );

  for (let i = 0; i <= b.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] =
        b[i - 1] === a[j - 1]
          ? matrix[i - 1][j - 1]
          : Math.min(
              matrix[i - 1][j - 1] + 1,
              matrix[i][j - 1] + 1,
              matrix[i - 1][j] + 1
            );
    }
  }

  return matrix[b.length][a.length];
}

function searchWordScore(queryWord, targetWord) {
  if (!queryWord || !targetWord) return 0;

  if (queryWord === targetWord) return 30;

  if (
    targetWord.startsWith(queryWord) ||
    queryWord.startsWith(targetWord)
  ) {
    return 22;
  }

  if (
    targetWord.includes(queryWord) ||
    queryWord.includes(targetWord)
  ) {
    return 18;
  }

  if (queryWord.length <= 2) return 0;

  const distance = searchDistance(queryWord, targetWord);

  const allowed =
    Math.max(queryWord.length, targetWord.length) <= 4
      ? 1
      : Math.max(queryWord.length, targetWord.length) <= 8
      ? 2
      : 3;

  return distance <= allowed
    ? 14 - distance * 3
    : 0;
}

function getHomeSearchResults(query) {
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) return [];

  const queryWords = normalizedQuery.split(" ");

  return ITEMS
    .map((item) => {
      const category = CATEGORIES.find(
        (c) => c.id === item.category
      );

      const searchText = normalizeSearchText([
        item.name,
        item.nameAr,
        item.desc,
        item.descAr,
        item.id.replace(/-/g, " "),
        category ? category.name : "",
        category ? category.nameAr : "",
      ].join(" "));

      const targetWords = searchText.split(" ");

      let score = searchText.includes(normalizedQuery)
        ? 100
        : 0;

      for (const queryWord of queryWords) {
        let bestScore = 0;

        for (const targetWord of targetWords) {
          bestScore = Math.max(
            bestScore,
            searchWordScore(queryWord, targetWord)
          );
        }

        if (bestScore === 0) {
          return null;
        }

        score += bestScore;
      }

      return { item, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((result) => result.item);
}

function homeSearchResultsMarkup() {
  const query = state.searchQuery.trim();

  if (!query) return "";

  const results = getHomeSearchResults(query);

  if (!results.length) {
    return `
      <div class="home-search-empty">
        ${t("noSearchResults")}
      </div>
    `;
  }

  return results
    .map((item) => `
      <button
        class="home-search-result"
        onclick="openItem('${item.id}')"
      >
        <img
          src="${item.image}"
          alt=""
        />

        <div class="home-search-result-copy">
          <strong>${loc(item, "name")}</strong>
          <span>${money(item.price)}</span>
        </div>

        <span class="home-search-arrow">›</span>
      </button>
    `)
    .join("");
}

function updateHomeSearch(value) {
  state.searchQuery = value;

  const resultsBox =
    document.getElementById("homeSearchResults");

  if (!resultsBox) return;

  resultsBox.innerHTML =
    homeSearchResultsMarkup();

  resultsBox.classList.toggle(
    "show",
    value.trim().length > 0
  );
}
/** Batch E: delivery is offered unless it is switched off for the restaurant (while ordering itself is on). */
function deliveryOffered() {
  return typeof orderingState !== "function" || orderingState("delivery").reason !== "unavailable" || !featureOn("ordering");
}
function setHomeOrderType(type, button) {
  state.orderType = type;
  saveCartDraft();
  state.orderTiming = "asap";

  const toggle = button.closest(".home-order-toggle");

  if (toggle) {
    toggle.querySelectorAll("button").forEach((btn) => {
      btn.classList.remove("on");
    });

    button.classList.add("on");
  }

  const location = document.getElementById("homeOrderLocation");
  const note = document.getElementById("homeOrderNote");

  if (location) location.innerHTML = homeLocationMarkup();

  if (note) note.style.display = homeDeliveryNoteVisible() ? "" : "none";
  homeDeliverySync();
}

/* Home "Deliver to": the customer's own address, checked against the restaurant's delivery limits by the server. */
const homeDelivery = {key: "", status: "", request: 0};
function homeDeliveryAddress() {
  if (!state.isLoggedIn) return null;
  const address = selectedDeliveryAddress();
  return address && validDeliveryPin(address) ? address : null;
}
/** The district out of a full map address: the part just before "City 12345"; never a plus code, number or country. */
function homeAddressDistrict(text) {
  const parts = String(text || "").split(/[,،]/).map(p => p.trim()).filter(Boolean);
  if (parts.length < 2) return parts[0] && !/[\d٠-٩]{3,}|\+/.test(parts[0]) ? parts[0] : "";
  const named = p => !/[\d٠-٩]/.test(p) && !p.includes("+");
  const cityAt = parts.findIndex(p => /[\d٠-٩]{5}\s*$/.test(p));
  if (cityAt > 0) {
    for (let n = cityAt - 1; n >= 0; n--) if (named(parts[n])) return parts[n];
    return parts[cityAt].replace(/[\d٠-٩\s]+$/, "").trim();
  }
  const names = parts.filter(named);
  return names.length > 2 ? names[names.length - 3] : (names[0] || "");
}
function homeAddressName(address) {
  const kind = address.type === "home" ? cartCopy("Home", "المنزل") : address.type === "work" ? cartCopy("Work", "العمل") : "";
  const district = homeAddressDistrict(address.area) || homeAddressDistrict(address.label);
  return [kind, district.slice(0, 40)].filter(Boolean).join(" · ") || cartCopy("Saved address", "عنوان محفوظ");
}
function homeDeliveryNoteVisible() { return state.orderType === "delivery" && !homeDeliveryAddress(); }
function homeLocationMarkup() {
  if (state.orderType === "takeaway") return `${cartCopy("Pickup from", "الاستلام من")} <strong>${escapeHtml(branchDisplayName(state.lang))}</strong>`;
  if (state.orderType !== "delivery") return `${cartCopy("Dining at", "تناول الطعام في")} <strong>${escapeHtml(branchDisplayName(state.lang))}</strong>`;
  const address = homeDeliveryAddress();
  if (!address) {
    return `${cartCopy("Delivery", "توصيل")} <strong>${state.isLoggedIn
      ? `<button type="button" class="loc-link" onclick="homeChooseAddress()">${cartCopy("Add your delivery address", "أضف عنوان التوصيل")}</button>`
      : cartCopy("Set your location at checkout", "حدد موقعك عند إتمام الطلب")}</strong>`;
  }
  const key = `${address.id}|${address.updatedAt}`, out = homeDelivery.key === key && homeDelivery.status === "out";
  return `${out ? cartCopy("Delivery not available to", "التوصيل غير متاح إلى") : cartCopy("Deliver to", "التوصيل إلى")}
    <strong><button type="button" class="loc-link${out ? " loc-out" : ""}" onclick="homeChooseAddress()">${escapeHtml(homeAddressName(address))}<span class="loc-change">${out ? cartCopy("Change", "تغيير") : "›"}</span></button></strong>`;
}
function homeChooseAddress() {
  if (!state.isLoggedIn) return;
  go("savedAddressesPage");
}
function selectHomeAddress(id) {
  if (!state.isLoggedIn || !state.savedAddresses.some(row => row.id === id)) return;
  if (state.checkoutAddressId !== id) { state.checkoutAddressId = id; clearDeliveryQuote(); }
  go("home");
}
function homeDeliveryRefreshLine() {
  if (state.screen !== "home") return;
  const location = document.getElementById("homeOrderLocation"), note = document.getElementById("homeOrderNote");
  if (location) location.innerHTML = homeLocationMarkup();
  if (note) note.style.display = homeDeliveryNoteVisible() ? "" : "none";
}
/** Loads the saved addresses if needed, then asks the server whether the chosen one is inside the delivery limits. */
async function homeDeliverySync() {
  if (state.orderType !== "delivery" || !state.isLoggedIn) return;
  try {
    if (typeof accountAddresses !== "undefined" && !accountAddresses.loaded && typeof loadAccountAddresses === "function") {
      await loadAccountAddresses();
      homeDeliveryRefreshLine();
    }
    const address = homeDeliveryAddress();
    if (!address || !menuReady()) return;
    const key = `${address.id}|${address.updatedAt}`;
    if (homeDelivery.key === key && homeDelivery.status) return;
    const request = ++homeDelivery.request, user = state.authUserId;
    homeDelivery.key = key; homeDelivery.status = "checking";
    const quote = await requestCustomerDeliveryQuote(address, 0);
    if (request !== homeDelivery.request || user !== state.authUserId) return;
    homeDelivery.status = typeof quote?.eligible === "boolean" ? (quote.eligible ? "ok" : "out") : "";
    if (homeDelivery.status === "") homeDelivery.key = "";
    homeDeliveryRefreshLine();
  } catch (_) {
    homeDelivery.key = ""; homeDelivery.status = "";   // unknown: checkout still decides
  }
}

function home() {
  homeDeliverySync();
  const specials = ITEMS.filter((i) => i.special && i.available);
  return `
    <section class="screen home-screen">
      <div class="topbar home-topbar">

  <div class="home-brand-location">

    <img
      class="home-brand-logo"
      src="${APP_CONFIG.brand.logo}"
      alt="${escapeHtml(APP_CONFIG.brand.logoAlt)}"
    />

    <div class="loc" id="homeOrderLocation">
      ${homeLocationMarkup()}
    </div>

  </div>

  <div class="top-actions">
  ${langSwitch()}
  ${cartButton()}
</div>

</div>
      <div id="appAnnouncementSlot">${typeof announcementMarkup === 'function' ? announcementMarkup() : ''}</div>
      ${orderingStripMarkup()}
      <div class="home-search-wrap">

  <div class="cx-search-row">
  <div class="home-search-box">

    <svg
      class="home-search-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7"></circle>
      <path d="m20 20-3.5-3.5"></path>
    </svg>

    <input
      type="search"
      value="${escapeHtml(state.searchQuery)}"
      placeholder="${t("search")}"
      autocomplete="off"
      spellcheck="false"
      oninput="updateHomeSearch(this.value)"
    />

  </div>
  <span class="cx-search-cart">${cartButton()}</span>
  </div>

  <div
    id="homeSearchResults"
    class="home-search-results ${state.searchQuery.trim() ? "show" : ""}"
  >
    ${homeSearchResultsMarkup()}
  </div>

</div>
      <div class="toggle home-order-toggle">
  <button class="${state.orderType === "dinein" ? "on" : ""}" onclick="setHomeOrderType('dinein', this)">${t("dineIn")}</button>

  <button class="${state.orderType === "takeaway" ? "on" : ""}" onclick="setHomeOrderType('takeaway', this)">${t("takeaway")}</button>

  <button class="${state.orderType === "delivery" ? "on" : ""}" onclick="setHomeOrderType('delivery', this)" ${deliveryOffered() ? "" : `disabled aria-disabled="true" title="${cartCopy("Delivery is not available from this restaurant.", "التوصيل غير متاح من هذا المطعم.")}"`}>${t("delivery")}</button>
</div>

<div
  id="homeOrderNote"
  class="mode-note"
  style="${homeDeliveryNoteVisible() ? "" : "display:none"}"
>
  ${t("deliveryScope")}
</div>
      ${homeBannersMarkup()}
      <div class="h-row"><h3>${t("todaysSpecial")}</h3><button class="link" onclick="go('menu')">${t("seeAll")}</button></div>
      <div class="scroll">
        ${!specials.length && menuReady() ? `<p class="menu-hint">${menuText("noSpecials")}</p>` : ""}
        ${menuFirstLoad() ? skeletonTiles("special", 3) : ""}
        ${specials
          .map(
            (i) => `
          <article class="special-card">
            <button class="special-open" onclick="openItem('${i.id}')" aria-label="${loc(i, "name")}">
              ${hasOwnPhoto(i) ? `<img src="${i.image}" alt="" loading="lazy" />` : monogramTile(i, "cx-mono-special")}
              ${i.offer ? `<span class="badge">${offerLabel(i.offer)}</span>` : ""}
              <h4>${loc(i, "name")}</h4>
            </button>
            <button class="special-add" onclick="quickAdd('${i.id}')" aria-label="${t("add")} ${loc(i, "name")}">
              <span>${money(i.price)}</span><b aria-hidden="true">+</b>
            </button>
          </article>`
          )
          .join("")}
      </div>
      <div class="h-row"><h3>${t("categories")}</h3></div>
      <div class="grid">
        ${menuFirstLoad() ? skeletonTiles("cat", 4) : ""}
        ${CATEGORIES
          .map(
            (c) =>
              `<button class="cat cat-photo" onclick="go('listing',{categoryId:'${c.id}'})">
  ${hasOwnPhoto(c) ? `<img src="${c.image}" alt="${loc(c, "name")}" loading="lazy" />` : monogramTile(c, "cx-mono-cat")}
  <span class="cat-label">${loc(c, "name")}</span>
</button>`
          )
          .join("")}
      </div>
      ${typeof cateringCardMarkup === 'function' ? cateringCardMarkup() : ''}
    </section>
    ${nav("home")}`;
}

function menu() {
  return `
    <section class="screen menu-screen">
      <div class="topbar menu-topbar">
  <h2>${t("menu")}</h2>
  ${cartButton()}
</div>
      <div class="grid">
        ${menuFirstLoad() ? skeletonTiles("cat", 6) : ""}
        ${CATEGORIES.map(
          (c) =>
            `<button class="cat cat-photo" onclick="go('listing',{categoryId:'${c.id}'})">${hasOwnPhoto(c) ? `<img src="${c.image}" alt="${loc(c, "name")}" loading="lazy" />` : monogramTile(c, "cx-mono-cat")}${loc(c, "name")}</button>`
        ).join("")}
      </div>
    </section>
    ${nav("menu")}`;
}

function listing() {
  const cat = CATEGORIES.find(c => c.id === state.categoryId);
  const subs = SUBCATEGORIES.filter(s => s.category === state.categoryId);
  const items = ITEMS.filter(i => i.category === state.categoryId && (!state.subcategoryId || i.subcategory === state.subcategoryId));
  return `
    <section class="screen listing-screen">
      <div class="topbar">${back("menu")}<h2>${cat ? loc(cat, "name") : t("items")}</h2>${cartButton()}</div>
      ${subs.length ? `<div class="menu-subcategories" aria-label="${t("categories")}">
        <button class="${!state.subcategoryId ? "on" : ""}" onclick="selectSubcategory('',this)">${menuText("all")}</button>
        ${subs.map(s => `<button class="${state.subcategoryId === s.id ? "on" : ""}" onclick="selectSubcategory('${s.id}',this)">${loc(s,"name")}</button>`).join("")}
      </div>` : ""}
      <div class="menu-items-grid">
      ${!items.length && menuReady() ? `<p class="menu-hint">${menuText("noItems")}</p>` : ""}
      ${items.map(i => `
        <article class="item ${canOrderItem(i) ? "" : "menu-unavailable"} ${hasOwnPhoto(i) ? "" : "cx-no-photo"}">
          ${hasOwnPhoto(i) ? `<img src="${i.image}" alt="${loc(i, "name")}" loading="lazy" onclick="openItem('${i.id}')" />` : ""}
          <div onclick="openItem('${i.id}')">
            ${i.offer ? `<span class="badge">${offerLabel(i.offer)}</span>` : ""}
            ${i.bestSeller ? `<span class="badge">${t("bestSeller")}</span>` : ""}
            <h4>${loc(i,"name")}</h4><p>${loc(i,"desc")}</p>
            <div class="price">${itemPriceMarkup(i)}</div>
            ${offerLimitMarkup(i)}
            ${!i.available ? `<small class="menu-availability">${menuText("unavailable")}</small>` : ""}
          </div>
          <button class="add ${canOrderItem(i) && !canAddItem(i) ? "offer-add-blocked" : ""}" ${canOrderItem(i) ? "" : "disabled"} onclick="quickAdd('${i.id}')">${t("add")}</button>
        </article>`).join("")}
      </div>
    </section>${nav("menu")}`;
}

function selectSubcategory(id, button) {
  if (id && !SUBCATEGORIES.some(row => row.id === id && row.category === state.categoryId)) return;
  state.subcategoryId = id;
  button.closest('.menu-subcategories').querySelectorAll('button')
    .forEach(row => row.classList.toggle('on', row === button));
  const template = document.createElement('template');
  template.innerHTML = listing();
  document.querySelector('.menu-items-grid').replaceChildren(...template.content.querySelector('.menu-items-grid').childNodes);
}

function detail() {
  const i = itemById(state.itemId);
  if (!i) return state.cartEditKey ? cart() : listing();
  const editing = !!state.cartEditKey;
  const editLine = state.cart.find(l => l.cartKey === state.cartEditKey);
  const allowed = editing ? !!editLine && canOrderItem(i) : canOrderItem(i);
  const dish = loc(i, "name");
  return `
    <section class="screen detail-screen">
      <img class="hero-img" src="${i.image}" alt="${dish}" />
      <div class="topbar" style="margin-top:-48px;position:relative">
        ${back(editing ? "cart" : itemBackScreen())}
        ${cartButton()}
      </div>
      ${i.offer ? `<span class="badge">${offerLabel(i.offer)}</span>` : ""}
      <h2>${dish}</h2>
      <div class="stars">${t("kitchen")}</div>
      <p style="color:var(--muted);font-size:14px">${loc(i, "desc")}</p>
      <p class="price" id="detail-price" style="margin:12px 0;font-size:20px">${detailPriceMarkup(i)}</p>
      ${offerLimitMarkup(i)}
      ${itemChoiceMarkup(i)}
      ${editing && !editLine ? `<p role="status">${cartCopy("This cart item was removed after a menu update. Return to your cart.", "تمت إزالة هذا الصنف بعد تحديث القائمة. ارجع إلى السلة.")}</p>` : ""}
      <div class="options">
        <h4>${t("spiceLevel")}</h4>
        <div class="spice">
          ${["mild", "medium", "spicy"]
            .map(
              (s) =>
                `<button class="${state.spice === s ? "on" : ""}" onclick="setSpiceLevel(this, '${s}')">${t(s)}</button>`
            )
            .join("")}
        </div>
      </div>
      ${typeof itemRecommendationsMarkup === "function" ? itemRecommendationsMarkup(i) : ""}
      <div class="sticky-actions single-action">
  <button class="btn btn-primary" ${allowed ? "" : "disabled"} onclick="addFromDetail()">
    ${editing ? cartCopy("Update cart", "تحديث السلة") : canOrderItem(i) ? (allowed ? t("addToCart") : cartCopy("Offer limit reached", "تم بلوغ حد العرض")) : menuText("unavailable")}
  </button>
</div>
    </section>`;
}

function openCartItem(index) {
  const line = state.cart[index];
  const item = line && itemById(line.id);
  if (!item) return toast(menuText("unavailableItem"));
  line.cartKey ||= newCartKey();
  state.cartEditKey = line.cartKey;
  state.itemId = item.id;
  state.size = line.size;
  state.choice = line.choice ?? null;
  state.spice = line.spice;
  state.extras = [...(line.extras || [])];
  go("detail");
}
function cartRowClick(event, index) {
  if (!event.target.closest("button,a,input,textarea")) openCartItem(index);
}
function removeCartItem(index) {
  if (!state.cart[index]) return;
  state.cart.splice(index, 1);
  saveCartDraft();
  renderKeepScroll();
}
function cart() {
  if (!state.cart.length) {
    return `<section class="screen cart-screen">
      <div class="topbar">${typeof cartBackMarkup === 'function' ? cartBackMarkup() : back("home")}<h2>${t("yourCart")}</h2>${langSwitch()}</div>
      <div class="empty">${t("cartEmpty")}<br><button class="link" onclick="go('menu')">${t("browseTheMenu")}</button></div>
    </section>${nav("menu")}`;
  }
  return `<section class="screen cart-screen">
    <div class="topbar">${typeof cartBackMarkup === 'function' ? cartBackMarkup() : back("home")}<h2>${t("yourCart")}</h2>${langSwitch()}</div>
    ${state.cart.map((l,idx) => {
      const item = itemById(l.id), name = item ? loc(item,"name") : "";
      const saved = roundMoney(Math.max(0, (l.basePrice ?? item?.basePrice ?? l.price) - l.price) * l.qty);
      return `<div class="cart-line cart-editable" data-cart-key="${escapeHtml(l.cartKey)}" onclick="cartRowClick(event,${idx})">
        <button class="cart-image-link" onclick="openCartItem(${idx})" aria-label="${cartCopy("Edit", "تعديل")} ${name}">
          ${hasOwnPhoto(l) ? `<img src="${l.image}" alt="" />` : monogramTile(item || {name: ""}, "cx-mono-cart")}
        </button>
        <div class="cart-line-content">
          <button class="cart-name-link" onclick="openCartItem(${idx})"><h4>${name}</h4></button>
          <p class="cart-choice">${cartChoiceText(item,l)}</p>
          ${item?.offer ? `<span class="badge">${offerLabel(item.offer)}</span>
            <p class="cart-unit-price"><s>${money(l.basePrice)}</s> <strong>${money(l.price)}</strong> <small>${cartCopy("each", "للوحدة")}</small></p>
            <p class="offer-saving">${cartCopy("You saved", "وفّرت")} ${money(saved)}</p>` : ""}
          <div class="cart-controls">
            <div class="qty">
              <button aria-label="${cartCopy("Decrease quantity", "تقليل الكمية")}" onclick="chgQty(${idx},-1,this)">−</button>
              <span aria-live="polite">${l.qty}</span>
              <button class="${canOrderItem(item) && !canAddItem(item) ? "offer-add-blocked" : ""}" aria-label="${cartCopy("Increase quantity", "زيادة الكمية")}" ${canOrderItem(item) ? "" : "disabled"}
                title="${item?.offer?.maxQty ? escapeHtml(limitMessage(item)) : ""}" onclick="chgQty(${idx},1,this)">+</button>
            </div>
            <button class="link cart-remove" onclick="removeCartItem(${idx})">${cartCopy("Remove", "إزالة")}</button>
          </div>
        </div>
        <strong class="cart-line-total">${money(linePrice(l))}</strong>
      </div>`;
    }).join("")}
    ${cartRecommendationsMarkup()}
    <textarea class="field" rows="2" placeholder="${t("cookingNotes")}" oninput="state.notes=this.value">${escapeHtml(state.notes)}</textarea>
    ${typeof addonTarget === "function" && addonTarget() ? addonCartMarkup() : `<div id="couponBox">${couponBoxMarkup()}</div>
    <div class="breakdown" id="cartBreakdown" style="margin-top:14px">${cartSummaryMarkup()}</div>
    ${orderingStripMarkup()}
    <div class="cx-cta-bar">
      <div class="cx-cta-total"><span>${t("total")}</span><strong data-cx-total>${money(totals().total)}</strong></div>
      <button class="btn btn-primary" onclick="go('checkout')">${t("proceed")}</button>
    </div>`}
  </section>`;
}

function checkoutTimingOptions() {
  if (state.orderType === "delivery") {
    return [
      ["asap", "asap"],
      ["60", "in60Min"],
      ["75", "in75Min"],
      ["90", "in90Min"],
      ["120", "in120Min"],
    ];
  }

  if (state.orderType === "takeaway") {
    return [
      ["asap", "asap"],
      ["30", "in30Min"],
      ["45", "in45Min"],
      ["60", "in60Min"],
      ["90", "in90Min"],
    ];
  }

  return [
    ["asap", "now"],
    ["30", "in30Min"],
    ["45", "in45Min"],
    ["60", "in60Min"],
    ["90", "in90Min"],
  ];
}

function getCheckoutTimingSub() {
  if (state.orderTiming === "asap") {
    if (state.orderType === "delivery") return t("asapDelivery");
    if (state.orderType === "takeaway") return t("asapTakeaway");
    return t("asapDineIn");
  }

  return state.orderType === "dinein"
    ? t("arrivalNote")
    : t("scheduledOrderNote");
}

function setCheckoutTiming(value, button) {
  state.orderTiming = value;

  const box = button.closest(".checkout-time-options");

  if (box) {
    box.querySelectorAll("button").forEach((btn) => {
      btn.classList.remove("active");
    });
  }

  button.classList.add("active");

  const note = document.querySelector(".checkout-time-note");

  if (note) {
    note.textContent = getCheckoutTimingSub();
  }
}

function setCheckoutOrderType(type, button) {
  state.orderType = type;
  saveCartDraft();
  state.orderTiming = "asap";
  clearDeliveryQuote();
  // Batch H: with ordering hours on, the notice, the times and the button depend on the type: redraw all.
  if (orderingHours.status && ["delivery", "takeaway", "dinein"].some(x => orderingHours.status[x]?.enforced)) {
    renderKeepScroll();
    return;
  }

  /* Order type active tab */
  const typeBox = button.closest(".checkout-order-types");

  if (typeBox) {
    typeBox.querySelectorAll("button").forEach((btn) => {
      btn.classList.remove("active");
    });
  }

  button.classList.add("active");

  /* Location card */
  const locationCard = document.querySelector(".checkout-location-card");

  if (locationCard) {
    if (type === "delivery") {
      locationCard.innerHTML = `
        <div class="checkout-location-head">
          <h4>${t("deliveryTo")}</h4>

          <button
            class="link"
            onclick="go('savedAddressesPage')"
          >
            ${t("change")}
          </button>
        </div>

        <p>
          ${checkoutDeliveryAddressHtml()}
        </p>
      `;
    } else if (type === "takeaway") {
      locationCard.innerHTML = `
        <h4>${t("pickupFrom")}</h4>

        <p>
          ${escapeHtml(branchDisplayName(state.lang))}<br>
          ${loc(RESTAURANT, "address")}
        </p>

        <a
          class="link"
          href="${RESTAURANT.maps}"
          target="_blank"
          rel="noopener"
        >
          ${t("directions")}
        </a>
      `;
    } else {
      locationCard.innerHTML = `
        <h4>${t("diningAt")}</h4>

        <p>
          ${escapeHtml(branchDisplayName(state.lang))}<br>
          ${loc(RESTAURANT, "address")}
        </p>

        <a
          class="link"
          href="${RESTAURANT.maps}"
          target="_blank"
          rel="noopener"
        >
          ${t("directions")}
        </a>
      `;
    }
  }

  /* Timing options */
  const timingBox = document.querySelector(".checkout-time-options");

  if (timingBox) {
    timingBox.innerHTML = checkoutTimingOptions()
      .map(
        ([value, label]) => `
          <button
            class="${value === "asap" ? "active" : ""}"
            onclick="setCheckoutTiming('${value}', this)"
          >
            ${t(label)}
          </button>
        `
      )
      .join("");
  }

  const note = document.querySelector(".checkout-time-note");

  if (note) {
    note.textContent = getCheckoutTimingSub();
  }
  updateCheckoutSummary();
}

function updateCheckoutSummary() {
  if (state.screen !== 'checkout') return;
  const template = document.createElement('template');
  template.innerHTML = checkout();
  for (const selector of ['.checkout-location-card', '.checkout-total-card']) {
    const current = document.querySelector(selector);
    const next = template.content.querySelector(selector);
    if (current && next) current.replaceChildren(...next.childNodes);
  }
  const current = document.querySelector('.checkout-place-order');
  const next = template.content.querySelector('.checkout-place-order');
  if (current && next) {
    current.disabled = next.disabled;
    current.textContent = next.textContent;
    if (next.hasAttribute('aria-disabled')) current.setAttribute('aria-disabled', 'true');
    else current.removeAttribute('aria-disabled');
  }
}

function selectedDeliveryAddress() {
  const id = state.checkoutAddressId || state.lastDeliveryAddressId || state.defaultAddressId;
  return state.savedAddresses.find(row => row.id === id) || null;
}
function deliveryAddressButton() {
  return state.isLoggedIn ? `<button type="button" class="btn btn-ghost" onclick="go('savedAddressesPage')">${cartCopy("Choose / edit address", "اختيار / تعديل العنوان")}</button>` : `<small>${cartCopy("Choose your address after verifying your number.", "اختر عنوانك بعد التحقق من رقمك.")}</small>`;
}
function selectCheckoutAddress(id) {
  if (!state.isLoggedIn || accountAddresses.busy || accountAddresses.mutating) return;
  if (!state.savedAddresses.some(row => row.id === id)) return;
  const selected=state.savedAddresses.find(row=>row.id===id);
  if(!validDeliveryPin(selected))return editAddress(id);
  state.checkoutAddressId = id;
  state.checkoutPinConfirmedId = id;
  state.checkoutPinConfirmedVersion=selected.updatedAt;
  clearDeliveryQuote();
  go("checkout");
}

function deliveryQuoteFingerprint(address, foodSubtotal) {
  return address ? `${state.authUserId}|${JSON.stringify(menuConnection.payload?.branches || [])}|${address.id}|${address.updatedAt}|${Number(foodSubtotal).toFixed(2)}` : "";
}
function currentDeliveryQuote() {
  const address=selectedDeliveryAddress();
  return state.isLoggedIn && address && state.checkoutPinConfirmedId===address.id &&
    state.checkoutPinConfirmedVersion===address.updatedAt &&
    state.deliveryQuoteKey===deliveryQuoteFingerprint(address,totalsWithoutDelivery().foodTotal) ? state.deliveryQuote : null;
}
function clearDeliveryQuote() {
  state.deliveryQuote = null; state.deliveryQuoteKey = ""; state.deliveryQuoteError = "";
  state.deliveryQuoteRequest += 1; state.deliveryQuoteBusy = false;
}
async function refreshDeliveryQuote(force = false) {
  if (state.orderType !== "delivery" || !state.isLoggedIn) return null;
  const address = selectedDeliveryAddress();
  if (!validDeliveryPin(address) || state.checkoutPinConfirmedId !== address.id ||
      state.checkoutPinConfirmedVersion !== address.updatedAt) return null;
  const foodSubtotal = totalsWithoutDelivery().foodTotal;
  const key = deliveryQuoteFingerprint(address, foodSubtotal);
  if (!force && state.deliveryQuoteKey === key && state.deliveryQuote) return state.deliveryQuote;
  if (!force && state.deliveryQuoteBusy && state.deliveryQuoteKey === key) return null;
  const request = ++state.deliveryQuoteRequest;
  const user=state.authUserId;
  state.deliveryQuoteBusy = true; state.deliveryQuoteKey = key; state.deliveryQuoteError = "";
  state.deliveryQuote=null;
  try {
    const quote = await requestCustomerDeliveryQuote(address, foodSubtotal);
    if (request !== state.deliveryQuoteRequest || !state.isLoggedIn || state.authUserId!==user || key!==deliveryQuoteFingerprint(selectedDeliveryAddress(),totalsWithoutDelivery().foodTotal)) return null;
    if (typeof quote?.eligible !== 'boolean' || (quote.eligible && (!Number.isFinite(Number(quote.fee)) || Number(quote.fee)<0))) throw new Error('Invalid delivery quote');
    state.deliveryQuote = quote;
    if (!quote?.eligible) state.deliveryQuoteError = quote?.reason || cartCopy("Delivery is unavailable for this location.", "التوصيل غير متاح لهذا الموقع.");
    return quote;
  } catch (error) {
    if (request !== state.deliveryQuoteRequest) return null;
    state.deliveryQuote = null; state.deliveryQuoteError = moduleOffText(error?.message || error);
    return null;
  } finally {
    if (request === state.deliveryQuoteRequest) {
      state.deliveryQuoteBusy = false;
      if (state.screen === "checkout") updateCheckoutSummary();
    }
  }
}
function totalsWithoutDelivery() {
  const cents = n => Math.round(Number(n) * 100);
  const itemsCents = state.cart.reduce((n,l) => n + cents(l.price) * l.qty, 0);
  const hasItemOffer = state.cart.some(l => itemById(l.id)?.offer);
  const couponCents = voucherDiscountCents(itemsCents, hasItemOffer);
  const pointsCents = typeof rewardsDiscountFor === "function"
    ? Math.round(rewardsDiscountFor((itemsCents - couponCents) / 100, couponCents > 0) * 100) : 0;
  return {foodTotal: Math.max(0, itemsCents - couponCents - pointsCents) / 100};
}
function deliveryQuoteMarkup() {
  if (state.deliveryQuoteBusy) return `<div class="delivery-quote-note">${cartCopy("Checking delivery area and fee…", "جارٍ التحقق من منطقة ورسوم التوصيل…")}</div>`;
  if (state.deliveryQuoteError) return `<div class="delivery-quote-note delivery-quote-error">${escapeHtml(state.deliveryQuoteError)} <a href="tel:${escapeHtml(RESTAURANT.phone)}">${cartCopy("Call restaurant","اتصل بالمطعم")}</a> <button type="button" class="link" onclick="refreshDeliveryQuote(true)">${cartCopy("Retry","إعادة المحاولة")}</button></div>`;
  const q=currentDeliveryQuote();
  if (!q?.eligible) return `<div class="delivery-quote-note">${cartCopy("Confirm the map location to calculate delivery.", "أكد الموقع على الخريطة لحساب التوصيل.")}</div>`;
  return `<div class="delivery-quote-note"><strong>${escapeHtml(q.zone || cartCopy("Delivery area","منطقة التوصيل"))}</strong> · ${Number(q.fee)===0?cartCopy("Free delivery","توصيل مجاني"):money(Number(q.fee))} · ${Number(q.distance_km).toFixed(2)} km</div>`;
}
function deliveryConfirmationMarkup(o) {
  return o.orderType === "delivery" && o.address ? `<p class="confirmation-message"><strong>${cartCopy("Delivery address", "عنوان التوصيل")}</strong><br>${escapeHtml(o.address)}</p>` : "";
}
function checkoutDeliveryAddressHtml() {
  const address = selectedDeliveryAddress();
  if (!address) return `${t("noDeliveryAddressSelected")}<br><small>${t("addDeliveryAddressPrompt")}</small><br>${deliveryAddressButton()}`;
  const previous=address.id===state.lastDeliveryAddressId;
  return `<strong>${previous?cartCopy("Your last delivery location","موقع توصيل طلبك السابق"):cartCopy("Delivery location","موقع التوصيل")}</strong>
    <p>${escapeHtml(pinAddressText(address))}</p>
    ${validDeliveryPin(address)?`<a href="${deliveryPinLink(address)}" target="_blank" rel="noopener">${cartCopy("View on map","عرض على الخريطة")}</a>`:""}
    <button type="button" class="btn btn-ghost" onclick="selectCheckoutAddress('${escapeHtml(address.id)}')">${state.checkoutPinConfirmedId===address.id?cartCopy("Location confirmed ✓","تم تأكيد الموقع ✓"):cartCopy("Deliver here","التوصيل هنا")}</button>${deliveryAddressButton()}`;
}

function checkoutCustomerMarkup() {
  if (state.isLoggedIn) {
    return `<div class="checkout-account-card">
      <div>
        <span>${t("welcomeBack")}</span>
        <strong>${escapeHtml(state.customerName || state.customer.name)}</strong>
        <small dir="ltr">${escapeHtml(state.customerPhone || state.customer.mobile)}</small>
      </div>
      <button type="button" onclick="go('account')">${t("viewAccount")}</button>
    </div>`;
  }
  const rawMobile = String(state.customer.mobile || "").replace(/\D/g, "");
  const mobile = rawMobile.startsWith("966") ? `0${rawMobile.slice(3)}` : rawMobile;
  return `<p class="checkout-mobile-intro">${t("checkoutMobileIntro")}</p>
    <div class="mobile-field-wrap checkout-mobile-field">
      <span class="country-code">+966</span>
      <input class="field mobile-input" type="tel" inputmode="numeric" maxlength="10"
        autocomplete="tel" placeholder="${t("mobilePlaceholder")}" value="${escapeHtml(mobile)}"
        oninput="state.customer.mobile=this.value.replace(/[^0-9]/g,'')" />
    </div>`;
}

function checkout() {
  const timingOptions = orderingLimitTimingOptions(checkoutTimingOptions());
  if (state.orderTiming !== "asap" && !timingOptions.some(([value]) => value === String(state.orderTiming))) state.orderTiming = "asap";
  const checkoutBusy = state.authBusy || state.orderSubmitting;
  if (state.orderType === "delivery" && state.isLoggedIn && !state.deliveryQuoteError) setTimeout(() => refreshDeliveryQuote(), 0);
  if (typeof rewardsEnsureLoaded === "function") rewardsEnsureLoaded(() => { if (state.screen === "checkout") renderKeepScroll(); });

  const timingSub =
    state.orderTiming === "asap"
      ? state.orderType === "delivery"
        ? t("asapDelivery")
        : state.orderType === "takeaway"
        ? t("asapTakeaway")
        : t("asapDineIn")
      : state.orderType === "dinein"
      ? t("arrivalNote")
      : t("scheduledOrderNote");

  return `
    <section class="screen checkout-screen">

      <div class="topbar checkout-topbar">
        ${back("cart")}
        <h2>${t("checkout")}</h2>
        ${langSwitch()}
      </div>

      <h3 class="checkout-section-title">
        ${t("customerDetails")}
      </h3>

      ${checkoutCustomerMarkup()}

      <h3 class="checkout-section-title">
        ${t("orderType")}
      </h3>

      <div class="checkout-order-types">

        <button
          class="${state.orderType === "delivery" ? "active" : ""}"
          onclick="setCheckoutOrderType('delivery', this)"
          ${deliveryOffered() ? "" : `disabled aria-disabled="true" title="${cartCopy("Delivery is not available from this restaurant.", "التوصيل غير متاح من هذا المطعم.")}"`}
        >
          ${t("delivery")}${orderTypeOpen('delivery') ? "" : `<small class="type-closed">${deliveryOffered() ? cartCopy("Closed", "مغلق") : cartCopy("Not available", "غير متاح")}</small>`}
        </button>

        <button
          class="${state.orderType === "takeaway" ? "active" : ""}"
          onclick="setCheckoutOrderType('takeaway', this)"
        >
          ${t("takeaway")}${orderTypeOpen('takeaway') ? "" : `<small class="type-closed">${cartCopy("Closed", "مغلق")}</small>`}
        </button>

        <button
          class="${state.orderType === "dinein" ? "active" : ""}"
          onclick="setCheckoutOrderType('dinein', this)"
        >
          ${t("dineIn")}${orderTypeOpen('dinein') ? "" : `<small class="type-closed">${cartCopy("Closed", "مغلق")}</small>`}
        </button>

      </div>

      ${
        state.orderType === "delivery"
          ? `
            <div class="checkout-location-card">
              <div class="checkout-location-head">
                <h4>${t("deliveryTo")}</h4>
                <button class="link" onclick="go('savedAddressesPage')">
                  ${t("change")}
                </button>
              </div>

              <p>
                ${checkoutDeliveryAddressHtml()}
              </p>
              ${deliveryQuoteMarkup()}
            </div>
          `
          : state.orderType === "takeaway"
          ? `
            <div class="checkout-location-card">
              <h4>${t("pickupFrom")}</h4>

              <p>
                ${escapeHtml(branchDisplayName(state.lang))}<br>
                ${loc(RESTAURANT, "address")}
              </p>

              <a
                class="link"
                href="${RESTAURANT.maps}"
                target="_blank"
                rel="noopener"
              >
                ${t("directions")}
              </a>
            </div>
          `
          : `
            <div class="checkout-location-card">
              <h4>${t("diningAt")}</h4>

              <p>
                ${escapeHtml(branchDisplayName(state.lang))}<br>
                ${loc(RESTAURANT, "address")}
              </p>

              <a
                class="link"
                href="${RESTAURANT.maps}"
                target="_blank"
                rel="noopener"
              >
                ${t("directions")}
              </a>
            </div>
          `
      }

      <h3 class="checkout-section-title checkout-time-title">
        ${t("whenOrder")}
      </h3>

      <div class="checkout-time-options">

        ${timingOptions
          .map(
            ([value, label]) => `
              <button
                class="${state.orderTiming === value ? "active" : ""}"
                onclick="setCheckoutTiming('${value}', this)"
              >
                ${t(label)}
              </button>
            `
          )
          .join("")}

      </div>

      <p class="checkout-time-note">
        ${timingSub}
      </p>

      ${orderingNoticeMarkup()}

      ${typeof rewardsCheckoutMarkup === "function" ? rewardsCheckoutMarkup() : ""}

      <div class="breakdown checkout-total-card">${cartSummaryMarkup()}</div>

      <div class="cx-cta-bar">
      <div class="cx-cta-total"><span>${t("total")}</span><strong data-cx-total>${money(totals().total)}</strong></div>
      <button
        class="btn btn-primary checkout-place-order"
        onclick="placeOrder()"
        ${orderTypeOpen() && !checkoutBusy && (state.orderType !== "delivery" || !state.isLoggedIn || !state.checkoutPinConfirmedId || (currentDeliveryQuote()?.eligible === true && !state.deliveryQuoteBusy)) ? "" : "disabled aria-disabled=\"true\""}
      >
        ${!orderTypeOpen() ? (orderingState(state.orderType).reason === "unavailable" ? cartCopy("Ordering is not available", "الطلب غير متاح") : cartCopy("Ordering is closed", "الطلبات مغلقة")) : checkoutBusy ? t("processingOrder") : t("placeOrder")}
      </button>
      </div>

    </section>`;
}

function confirmation() {
  const o = state.order;

  if (!o) return "";

  const type = o.orderType || state.orderType;

  if (o.status === "rejected") {
    return `<section class="screen confirmation-screen"><div class="success">
      <img class="confirmation-brand-logo" src="${APP_CONFIG.brand.logo}" alt="${escapeHtml(APP_CONFIG.brand.logoAlt)}" />
      <h2>${cartCopy("Order could not be accepted", "تعذر قبول الطلب")}</h2>
      <p class="confirmation-message">${escapeHtml(o.rejectionReason || cartCopy("Please contact the restaurant for help.", "يرجى التواصل مع المطعم للمساعدة."))}</p>
      <p class="confirmation-order">${t("order")} <strong>${escapeHtml(o.id)}</strong></p>
    </div><a class="btn btn-wa" href="${waLink(t("order") + " " + o.id)}" target="_blank" rel="noopener">${t("whatsappHelp")}</a>
    <button class="btn btn-ghost" onclick="go('home')">${t("continueShopping")}</button></section>`;
  }

  const typeKey =
    type === "dinein"
      ? "dineIn"
      : type === "takeaway"
      ? "takeaway"
      : "delivery";

  /* PENDING RESTAURANT ACCEPTANCE */
  if (o.status === "pending_confirmation") {
    return `
      <section class="screen confirmation-screen">

        <div class="success">

          <img
            class="confirmation-brand-logo"
            src="${APP_CONFIG.brand.logo}"
            alt="${escapeHtml(APP_CONFIG.brand.logoAlt)}"
          />

          <h2>${t("orderReceived")}</h2>

          <p class="confirmation-message">
            ${t("awaitingConfirmationMsg")}
          </p>

          <span class="confirmation-type">
            ${t(typeKey)}
          </span>
          ${deliveryConfirmationMarkup(o)}

          <p class="confirmation-order">
            ${t("order")}
            <strong>${escapeHtml(o.id)}</strong>
          </p>

          <div class="pending-confirmation-badge">
            ${t("awaitingConfirmation")}
          </div>

          <p class="confirmation-time-note">
            ${t("confirmationTimeNote")}
          </p>

        </div>
        ${typeof nextTimeRecommendationsMarkup === "function" ? nextTimeRecommendationsMarkup(o) : ""}

        <button
          class="btn btn-primary"
          onclick="go('track')"
        >
          ${t("trackOrder")}
        </button>

        <a
          class="btn btn-wa"
          style="margin-top:10px"
          href="${waLink(t("order") + " " + o.id)}"
          target="_blank"
          rel="noopener"
        >
          ${t("whatsappHelp")}
        </a>

        <button
          class="btn btn-ghost"
          onclick="go('home')"
        >
          ${t("continueShopping")}
        </button>

      </section>`;
  }

  /* AFTER RESTAURANT ACCEPTS */
  return `
    <section class="screen confirmation-screen">

      <div class="success">

        <img
          class="confirmation-brand-logo"
          src="${APP_CONFIG.brand.logo}"
          alt="${escapeHtml(APP_CONFIG.brand.logoAlt)}"
        />

        <div class="check">✓</div>

        <h2>${t("thankYou")}</h2>

        <p class="confirmation-message">
          ${t("confirmedMsg")}
        </p>

        <span class="confirmation-type">
          ${t(typeKey)}
        </span>
        ${deliveryConfirmationMarkup(o)}

        <p class="confirmation-order">
          ${t("order")}
          <strong>${escapeHtml(o.id)}</strong>
        </p>

        <p class="confirmation-eta">
          ${formatEtaRange(o.confirmedEta || o.suggestedEta)}
        </p>

      </div>

      <button
        class="btn btn-primary"
        onclick="go('track')"
      >
        ${t("trackOrder")}
      </button>

      <a
        class="btn btn-wa"
        style="margin-top:10px"
        href="${waLink(t("order") + " " + o.id)}"
        target="_blank"
        rel="noopener"
      >
        ${t("whatsappHelp")}
      </a>

      <button
        class="btn btn-ghost"
        onclick="go('home')"
      >
        ${t("continueShopping")}
      </button>

    </section>`;
}

function formatOrderDate(timestamp) {
  if (!timestamp) return "";

  return new Intl.DateTimeFormat(
    state.lang === "ar" ? "ar-SA" : "en-GB",
    {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }
  ).format(new Date(timestamp));
}
function reorderFromHistory(id) {
  const order = state.orderHistory.find((o) => o.id === id);

  if (!order) return;

  if (!menuReady()) { toast(menuText("error")); refreshMenu(); return; }
  state.cart = order.items.map((item) => ({ ...item }));
  reconcileMenuCart();
  state.orderType = order.orderType || "dinein";

  go("cart");
}

function track() {
  if (state.isLoggedIn && typeof accountOrdersPage === 'function') return accountOrdersPage();
  const tab = state.orderTab || "active";
  const o = state.order;

  let steps = [];

if (o) {
  const type = o.orderType || state.orderType;

  if (type === "dinein") {
    steps = [
      "awaitingConfirmation",
      "confirmed",
      "preparing",
      "ready",
      "served",
    ];
  } else if (type === "takeaway") {
    steps = [
      "awaitingConfirmation",
      "confirmed",
      "preparing",
      "readyPickup",
      "collected",
    ];
  } else {
    steps = [
      "awaitingConfirmation",
      "confirmed",
      "preparing",
      "ready",
      "delivered",
    ];
  }
}

if (o?.status === "rejected") return confirmation();

const idx = o ? customerStatusStep(o.status) : 0;

  return `
    <section class="screen orders-screen">

      <div class="topbar orders-topbar">
        <h2>${t("orders")}</h2>
        ${langSwitch()}
      </div>

      <div class="orders-tabs">

        <button
          class="${tab === "active" ? "active" : ""}"
          onclick="state.orderTab='active'; render()"
        >
          ${t("activeOrders")}
        </button>

        <button
          class="${tab === "history" ? "active" : ""}"
          onclick="state.orderTab='history'; render()"
        >
          ${t("history")}
        </button>

      </div>

      ${
        tab === "active"
          ? `
            ${
              o
                ? `
                  <div class="active-order-card">

                    <div class="active-order-head">
                      <div>
                        <span>${t("currentOrder")}</span>
                        <strong>#${o.id || ""}</strong>
                      </div>

                      <span class="order-type-badge">
                        ${
                          t(
                            (o.orderType || state.orderType) === "dinein"
                              ? "dineIn"
                              : (o.orderType || state.orderType) === "takeaway"
                              ? "takeaway"
                              : "delivery"
                          )
                        }
                      </span>
                    </div>

                    <div class="order-timeline">

                      ${steps
                        .map((step, i) => {
                          const cls =
                            i < idx
                              ? "done"
                              : i === idx
                              ? "now"
                              : "";

                          return `
                            <div class="order-step ${cls}">
                              <div class="order-step-dot"></div>

                              <div class="order-step-copy">
                                <strong>${t(step)}</strong>
                              </div>
                            </div>
                          `;
                        })
                        .join("")}

                    </div>

                    <div class="active-order-items">

                      <h4>${t("orderDetails")}</h4>

                      ${(o.items || [])
                        .map((line) => {
                          const item = itemById(line.id);

                          return `
                            <div class="active-order-item">
                              <span>
                                ${line.qty} × ${item ? loc(item, "name") : ""}
                              </span>
                            </div>
                          `;
                        })
                        .join("")}

                      ${typeof orderAddedItemsMarkup === "function" ? orderAddedItemsMarkup(o.backendId) : ""}
                    </div>
                    ${typeof pushCardMarkup === "function" && !["completed", "rejected", "cancelled"].includes(o.status)
                        ? pushCardMarkup({id: o.backendId, token: o.trackingToken}) : ""}
                    ${typeof orderAddonsMarkup === "function" ? orderAddonsMarkup({id: o.backendId, number: String(o.id || ""),
                        token: o.trackingToken, type: o.orderType || state.orderType, status: o.status}) : ""}

                    <a
                      class="btn btn-ghost orders-call-btn"
                      href="tel:${RESTAURANT.phone}"
                    >
                      ${t("callRestaurant")}
                    </a>
                  </div>
                `
                : `
                  <div class="orders-empty-state">

                    <div class="orders-empty-icon">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"></path>
                        <path d="M9 8h6"></path>
                        <path d="M9 12h6"></path>
                      </svg>
                    </div>

                    <h3>${t("noActiveOrder")}</h3>
                    <p>${t("noActiveOrderSub")}</p>

                    <button
                      class="btn btn-primary orders-menu-btn"
                      onclick="go('menu')"
                    >
                      ${t("browseMenu")}
                    </button>

                  </div>
                `
            }
          `
          : `
            ${
              state.orderHistory.length
                ? `
                  <div class="order-history-list">

                  ${state.orderHistory
                    .map(
                      (order) => `
                        <div class="history-order-card">
                  
                          <div class="history-order-top">
                  
                            <div>
                              <strong>#${escapeHtml(order.id)}</strong>
                              <span>
                                ${formatOrderDate(order.completedAt || order.createdAt)}
                              </span>
                            </div>
                  
                            <span class="history-status">
                              ${t("completed")}
                            </span>
                  
                          </div>
                  
                          <div class="history-order-meta">
                  
                            <span>
                              ${
                                t(
                                  order.orderType === "dinein"
                                    ? "dineIn"
                                    : order.orderType === "takeaway"
                                    ? "takeaway"
                                    : "delivery"
                                )
                              }
                            </span>
                  
                            <span>
                              ${itemsCountLabel((order.items || []).reduce(
                                (sum, item) => sum + item.qty,
                                0
                              ))}
                            </span>
                  
                            ${
                              order.total
                                ? `<strong>${money(order.total)}</strong>`
                                : ""
                            }
                  
                          </div>
                  
                          <button
                            class="history-reorder-btn"
                            onclick="reorderFromHistory('${escapeHtml(order.id)}')"
                          >
                            ${t("reorder")}
                          </button>
                  
                        </div>
                      `
                    )
                    .join("")}

                  </div>
                `
                : `
                  <div class="orders-empty-state">

                    <div class="orders-empty-icon">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"></path>
                        <path d="M9 8h6"></path>
                        <path d="M9 12h6"></path>
                      </svg>
                    </div>

                    <h3>${t("noOrderHistory")}</h3>
                    <p>${t("noOrderHistorySub")}</p>

                  </div>
                `
            }
          `
      }

    </section>

    ${nav("track")}`;
}

function offers() {
  const list = menuReady() ? OFFERS.filter(o => canOrderItem(itemById(o.itemId))) : [];
  return `
    <section class="screen">
      <div class="topbar offers-topbar">
  ${back("more")}
  <h2>${t("offersDeals")}</h2>
  ${langSwitch()}
</div>
      <button class="link" onclick="refreshMenu()">${state.lang === "ar" ? "تحديث العروض" : "Refresh offers"}</button>
      ${menuReady() && menuConnection.payload?.offers_version !== 1 ? `<p class="menu-hint" role="status">${state.lang === "ar" ? "العروض قيد التحديث. يرجى المحاولة لاحقاً." : "Offers are being updated. Please check again shortly."}</p>` : ""}
      ${menuReady() && menuConnection.payload?.offers_version === 1 && !list.length ? `<p class="menu-hint">${menuText("noOffers")}</p>` : ""}
      <div class="menu-items-grid">
      ${list
        .map((o) => {
          const item = itemById(o.itemId);
          return `
          <article class="item">
            <img src="${item.image}" alt="" />
            <div>
              <span class="badge">${offerLabel(item.offer)}</span>
              <h4>${loc(item, "name")}</h4>
              <p>${loc(item, "desc")}</p>
              <div class="price">${itemPriceMarkup(item)}</div>
              ${offerLimitMarkup(item)}
            </div>
            <button class="add" onclick="openItem('${o.itemId}')">${t("add")}</button>
          </article>`;
        })
        .join("")}
      </div>
    </section>
    ${nav("more")}`;
}

function rewards() {
  // Batch R: the real points screen (the old placeholder below is never shown).
  if (typeof rewardsScreenMarkup === "function") {
    if (typeof rewardsEnsureLoaded === "function") rewardsEnsureLoaded(() => { if (state.screen === "rewards") render(); });
    return rewardsScreenMarkup();
  }
  return `
    <section class="screen">
      <div class="topbar"><h2>${t("rewards")}</h2>${langSwitch()}</div>
      <div class="points">
        <small style="color:var(--gold)">${t("pointsBalance")}</small>
        <h2>${state.points} ${t("points")}</h2>
        <button class="btn btn-primary" style="margin-top:12px" onclick="toast(t('redeemLater'))">${t("redeemNow")}</button>
      </div>
      <h3>${t("stampCard")}</h3>
      <p style="color:var(--muted);font-size:13px;margin:6px 0 4px">${t("stampHint")}</p>
      <div class="stamps">
        ${[0, 1, 2, 3, 4]
          .map((i) => `<div class="stamp ${i < state.stamps ? "filled" : ""}">${i < state.stamps ? "★" : i + 1}</div>`)
          .join("")}
      </div>
      <h3 style="margin:18px 0 10px">${t("vouchers")}</h3>
      ${VOUCHERS.map(
        (v) => `
        <div class="item" style="grid-template-columns:1fr auto">
          <div><h4>${loc(v, "title")}</h4><p>${v.cost} ${t("pointsCost")}</p></div>
          <button class="add" onclick="redeem(${v.cost})">${t("redeemNow")}</button>
        </div>`
      ).join("")}
    </section>
    ${nav("rewards")}`;
}
function more() {
  return `
    <section class="screen more-screen">

      <div class="topbar">
        <h2>${t("more")}</h2>
        ${langSwitch()}
      </div>

      <div class="more-list">
        ${typeof cateringCardMarkup === 'function' ? cateringCardMarkup() : ''}

        <button class="more-item" onclick="go('offers')">
          <div class="more-item-icon">
  <svg viewBox="0 0 24 24" class="more-icon" aria-hidden="true">
    <circle cx="7" cy="7" r="2"></circle>
    <circle cx="17" cy="17" r="2"></circle>
    <path d="M6 18L18 6"></path>
  </svg>
</div>
          <div class="more-item-text">
            <strong>${t("offersDeals")}</strong>
            <span>${t("offersDealsSub")}</span>
          </div>
          <span class="more-arrow">›</span>
        </button>

        <button class="more-item" onclick="go('feedbackPage')">
          <div class="more-item-icon">
  <svg viewBox="0 0 24 24" class="more-icon" aria-hidden="true">
    <path d="M4 5h16v11H8l-4 4V5z"></path>
    <path d="M8 9h8"></path>
    <path d="M8 12h5"></path>
  </svg>
</div>
          <div class="more-item-text">
            <strong>${t("sendFeedback")}</strong>
            <span>${t("feedbackSub")}</span>
          </div>
          <span class="more-arrow">›</span>
        </button>

        <button class="more-item" onclick="go('branchPage')">
          <div class="more-item-icon">
  <svg viewBox="0 0 24 24" class="more-icon" aria-hidden="true">
    <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0z"></path>
    <circle cx="12" cy="10" r="2.5"></circle>
  </svg>
</div>
          <div class="more-item-text">
            <strong>${t("branchContact")}</strong>
            <span>${t("branchContactSub")}</span>
          </div>
          <span class="more-arrow">›</span>
        </button>

        <button class="more-item" onclick="go('supportPage')">
          <div class="more-item-icon">
  <svg viewBox="0 0 24 24" class="more-icon" aria-hidden="true">
    <circle cx="12" cy="12" r="9"></circle>
    <path d="M9.8 9a2.4 2.4 0 0 1 4.6 1c0 1.8-2.4 2.1-2.4 4"></path>
    <path d="M12 18h.01"></path>
  </svg>
</div>
          <div class="more-item-text">
            <strong>${t("helpSupport")}</strong>
            <span>${t("helpSupportSub")}</span>
          </div>
          <span class="more-arrow">›</span>
        </button>

      </div>

    </section>

    ${nav("more")}`;
}
function feedbackPage() {
  const ratings = [
    ["excellent", "😍"],
    ["good", "🙂"],
    ["okay", "😐"],
    ["poor", "🙁"],
    ["veryPoor", "😡"],
  ];

  return `
    <section class="screen feedback-screen">

      <div class="topbar">
        ${back("more")}
        <h2>${t("sendFeedback")}</h2>
        ${langSwitch()}
      </div>

      <div class="feedback-intro">
        <h3>${t("howMeal")}</h3>
        <p>${t("feedbackSub")}</p>
      </div>

      <div class="emoji-row">
        ${ratings
          .map(
            ([key, emoji]) =>
              `<button
                class="${state.rating === key ? "on" : ""}"
                onclick="state.rating='${key}'; render()">
                <span>${emoji}</span>
                ${t(key)}
              </button>`
          )
          .join("")}
      </div>

      <textarea
        class="field"
        rows="4"
        placeholder="${t("tellMore")}"
        oninput="state.feedback=this.value"
      >${state.feedback}</textarea>

      <button
        class="btn btn-primary feedback-submit"
        onclick="toast(t('thanksFeedback'))">
        ${t("sendFeedback")}
      </button>

    </section>

    ${nav("more")}`;
}
function branchPage() {
  return `
    <section class="screen branch-screen">

      <div class="topbar">
        ${back("more")}
        <h2>${t("branchContact")}</h2>
        ${langSwitch()}
      </div>

      <div class="branch-card">
        <div class="branch-pin">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0z"></path>
            <circle cx="12" cy="10" r="2.5"></circle>
          </svg>
        </div>

        <div>
          <h3>${t("branchName")}</h3>
          <p>${loc(RESTAURANT, "address")}</p>
        </div>
      </div>

      <div class="branch-info-card">
        <div class="branch-info-row">
          <span>${t("open")}</span>
          <strong>${t("hours")}</strong>
        </div>

        <div class="branch-info-row">
          <span>${t("call")}</span>
          <strong>${RESTAURANT.phoneDisplay}</strong>
        </div>
      </div>

      <a
        class="branch-action branch-action-primary"
        href="${RESTAURANT.maps}"
        target="_blank"
        rel="noopener">
        ${t("directions")}
      </a>

      <div class="branch-actions-row">
        <a class="branch-action" href="tel:${RESTAURANT.phone}">
          ${t("call")}
        </a>

        <a
          class="branch-action branch-action-wa"
          href="${waLink(t("waHello"))}"
          target="_blank"
          rel="noopener">
          ${t("whatsapp")}
        </a>
      </div>

    </section>

    ${nav("more")}`;
}
function supportPage() {
  return `
    <section class="screen support-screen">

      <div class="topbar">
        ${back("more")}
        <h2>${t("helpSupport")}</h2>
        ${langSwitch()}
      </div>

      <p class="support-intro">${t("supportIntro")}</p>

      <div class="support-list">

        <button
          class="support-item"
          onclick="go('supportRequest', { supportType: 'order', supportOrder: '', supportDetails: '' })"
        >
          <div class="support-icon">
            <svg viewBox="0 0 24 24" class="support-svg" aria-hidden="true">
              <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"></path>
              <path d="M9 8h6"></path>
              <path d="M9 12h6"></path>
            </svg>
          </div>

          <div>
            <strong>${t("orderIssue")}</strong>
            <span>${t("orderIssueSub")}</span>
          </div>

          <span class="support-arrow">›</span>
        </button>

        <button
          class="support-item"
          onclick="go('supportRequest', { supportType: 'food', supportOrder: '', supportDetails: '' })"
        >
          <div class="support-icon">
            <svg viewBox="0 0 24 24" class="support-svg" aria-hidden="true">
              <path d="M4 12h16"></path>
              <path d="M6 12a6 6 0 0 1 12 0"></path>
              <path d="M12 6V4"></path>
              <path d="M3 16h18"></path>
            </svg>
          </div>

          <div>
            <strong>${t("foodIssue")}</strong>
            <span>${t("foodIssueSub")}</span>
          </div>

          <span class="support-arrow">›</span>
        </button>

        <button
          class="support-item"
          onclick="go('supportRequest', { supportType: 'payment', supportOrder: '', supportDetails: '' })"
        >
          <div class="support-icon">
            <svg viewBox="0 0 24 24" class="support-svg" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="2"></rect>
              <path d="M3 10h18"></path>
              <path d="M7 15h4"></path>
            </svg>
          </div>

          <div>
            <strong>${t("paymentIssue")}</strong>
            <span>${t("paymentIssueSub")}</span>
          </div>

          <span class="support-arrow">›</span>
        </button>

        <button
          class="support-item"
          onclick="go('supportRequest', { supportType: 'other', supportOrder: '', supportDetails: '' })"
        >
          <div class="support-icon">
            <svg viewBox="0 0 24 24" class="support-svg" aria-hidden="true">
              <circle cx="12" cy="12" r="9"></circle>
              <path d="M9.8 9a2.4 2.4 0 0 1 4.6 1c0 1.8-2.4 2.1-2.4 4"></path>
              <path d="M12 18h.01"></path>
            </svg>
          </div>

          <div>
            <strong>${t("otherIssue")}</strong>
            <span>${t("otherIssueSub")}</span>
          </div>

          <span class="support-arrow">›</span>
        </button>

      </div>

      <div class="support-contact">
        <a class="branch-action" href="tel:${RESTAURANT.phone}">
          ${t("call")}
        </a>

        <a
          class="branch-action branch-action-wa"
          href="${waLink(t("waHello"))}"
          target="_blank"
          rel="noopener">
          ${t("whatsapp")}
        </a>
      </div>

    </section>

    ${nav("more")}`;
}

function supportRequest() {
  const typeKeys = {
    order: "orderIssue",
    food: "foodIssue",
    payment: "paymentIssue",
    other: "otherIssue",
  };

  const title = t(typeKeys[state.supportType] || "otherIssue");

  return `
    <section class="screen support-request-screen">

      <div class="topbar">
        ${back("supportPage")}
        <h2>${title}</h2>
        ${langSwitch()}
      </div>

      
      <label class="support-field-label">${t("orderNumberOptional")}</label>

      <input
        class="field"
        type="text"
        placeholder="${t("orderNumberPlaceholder")}"
        value="${state.supportOrder}"
        oninput="state.supportOrder=this.value"
      />

      <label class="support-field-label">${t("describeIssue")}</label>

      <textarea
        class="field"
        rows="5"
        placeholder="${t("describeIssuePlaceholder")}"
        oninput="state.supportDetails=this.value"
      >${state.supportDetails}</textarea>

      <p class="support-note">${t("supportWhatsAppNote")}</p>

      <button
        class="btn btn-wa"
        onclick="openSupportWhatsApp()">
        ${t("continueWhatsApp")}
      </button>

      <a
        class="btn btn-ghost"
        href="tel:${RESTAURANT.phone}">
        ${t("callRestaurant")}
      </a>

    </section>

    ${nav("more")}`;
}
function openSupportWhatsApp() {
  const typeKeys = {
    order: "orderIssue",
    food: "foodIssue",
    payment: "paymentIssue",
    other: "otherIssue",
  };

  const issue = t(typeKeys[state.supportType] || "otherIssue");

  const message =
    `${t("supportMessageTitle")}\n\n` +
    `${t("issueType")}: ${issue}\n` +
    (state.supportOrder
      ? `${t("orderNumber")}: ${state.supportOrder}\n`
      : "") +
    `${t("details")}: ${state.supportDetails || "-"}`;

  window.open(waLink(message), "_blank");
}
async function startOtp(isResend = false) {
  if (state.authBusy) return;
  const phone = normalizeSaudiMobile(state.loginMobile);
  if (!phone) {
    toast(t("invalidMobile"));
    return;
  }
  const remaining = Math.ceil((state.otpSentAt + APP_CONFIG.operations.otpResendSeconds * 1000 - Date.now()) / 1000);
  if (isResend && remaining > 0) {
    toast(authCopy(`Please wait ${remaining} seconds before requesting another code.`, `يرجى الانتظار ${remaining} ثانية قبل طلب رمز جديد.`));
    return;
  }
  state.authBusy = true;
  try {
    await requestPhoneOtp(phone);
    state.loginMobile = phone;
    state.otpCode = "";
    state.otpSentAt = Date.now();
    go("otpPage");
    if (isResend) toast(authCopy("A new verification code was sent.", "تم إرسال رمز تحقق جديد."));
  } catch (error) {
    toast(authMessage(error), 6000);
  } finally {
    state.authBusy = false;
    if (["signInPage", "otpPage"].includes(state.screen)) renderKeepScroll();
  }
}

function signInPage() {
  return `
    <section class="screen signin-screen">

      <div class="topbar signin-topbar">
        ${back("account")}
        <h2>${t("signInTitle")}</h2>
        ${langSwitch()}
      </div>

      <div class="signin-intro">
     <p>${t("signInSub")}</p>
    </div>
      <label class="signin-label">
        ${t("mobileNumber")}
      </label>

      <div class="mobile-field-wrap">
        <span class="country-code">+966</span>

        <input
          class="field mobile-input"
          type="tel"
          inputmode="numeric"
          maxlength="10"
          placeholder="${t("mobilePlaceholder")}"
          value="${state.loginMobile}"
          oninput="state.loginMobile=this.value.replace(/[^0-9]/g,'')"
        />
      </div>

      <p class="signin-mobile-note">
        ${t("saudiNumberNote")}
      </p>

      ${typeof captchaBox === "function" ? captchaBox() : ""}

      <button
        class="btn btn-primary signin-continue"
        onclick="startOtp()"
        ${state.authBusy ? "disabled" : ""}
      >
        ${t("continue")}
      </button>

      <p class="signin-terms">
        ${t("termsNote")}
      </p>

    </section>

    </section>`;
}

async function verifyOtp() {
  if (state.authBusy) return;
  if (!/^\d{6}$/.test(state.otpCode)) {
    toast(t("invalidOtp"));
    return;
  }
  const phone = normalizeSaudiMobile(state.loginMobile);
  if (!phone) return toast(t("invalidMobile"));
  state.authBusy = true;
  try {
    await verifyPhoneOtp(phone, state.otpCode);
  } catch (error) {
    toast(authMessage(error, "verify"), 6000);
    state.authBusy = false;
    renderKeepScroll();
    return;
  }
  try {
    const profile = await loadCustomerProfile();
    if (profile?.full_name && typeof loadAccountAddresses === "function") await loadAccountAddresses();
    if (state.otpPurpose === "guestOrder") {
      if (profile?.full_name) {
        toast(authCopy(`Welcome back, ${profile.full_name}`, `مرحباً بعودتك، ${profile.full_name}`));
        state.otpPurpose = "login";
        await createOrderAfterVerification();
      } else {
        go("profileSetupPage");
      }
    } else if (profile?.full_name) go("account");
    else go("profileSetupPage");
  } catch (error) {
    console.error("Customer account setup failed:", error);
    toast(authCopy(
      "Your number was verified, but we could not open your account. Please try again.",
      "تم التحقق من رقمك، لكن تعذر فتح حسابك. يرجى المحاولة مرة أخرى."
    ), 6000);
  } finally {
    state.authBusy = false;
    if (["otpPage", "profileSetupPage", "account", "checkout"].includes(state.screen)) renderKeepScroll();
  }
}

function otpPage() {
  const phone = normalizeSaudiMobile(state.loginMobile) || "";

  const guestOrderOtp = state.otpPurpose === "guestOrder";
  const otpBackScreen = guestOrderOtp ? "checkout" : "signInPage";

  return `
    <section class="screen otp-screen">

      <div class="topbar otp-topbar">
      ${back(otpBackScreen)}
        <h2>${t("verifyPhone")}</h2>
        ${langSwitch()}
      </div>

      <div class="otp-intro">
        <p>${t("otpSub")}</p>
        <strong dir="ltr">${escapeHtml(phone)}</strong>

        <button class="otp-change-number" onclick="go('${otpBackScreen}')">
          ${t("changeNumber")}
        </button>
      </div>

      <label class="otp-label">
        ${t("verificationCode")}
      </label>

      <input
        class="field otp-input"
        type="tel"
        inputmode="numeric"
        maxlength="6"
        autocomplete="one-time-code"
        placeholder="••••••"
        value="${state.otpCode}"
        oninput="state.otpCode=this.value.replace(/[^0-9]/g,'').slice(0,6)"
      />

      ${typeof captchaBox === "function" ? captchaBox() : ""}

      <button
        class="btn btn-primary otp-verify-btn"
        onclick="verifyOtp()"
        ${state.authBusy ? "disabled" : ""}
      >
        ${t("verifyContinue")}
      </button>

      <div class="otp-resend">
        <span>${t("didntReceiveCode")}</span>
        <button onclick="startOtp(true)" ${state.authBusy ? "disabled" : ""}>
          ${t("resendCode")}
        </button>
      </div>

    </section>`;
}

async function completeProfile() {
  if (state.authBusy || !state.isLoggedIn) return;
  const name = state.customerName.trim();

  if (!name) {
    toast(t("nameRequired"));
    return;
  }

  const email = state.customerEmail.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    toast(authCopy("Enter a valid email address or leave it blank.", "أدخل بريداً إلكترونياً صحيحاً أو اتركه فارغاً."));
    return;
  }
  state.authBusy = true;
  try {
    await saveCustomerProfile(name, email);
    if (state.otpPurpose === "guestOrder") {
      state.otpPurpose = "login";
      await createOrderAfterVerification();
    } else {
      go("account");
    }
  } catch (error) {
    toast(authMessage(error), 6000);
  } finally {
    state.authBusy = false;
    if (["profileSetupPage", "account", "checkout"].includes(state.screen)) renderKeepScroll();
  }
}

function profileSetupPage() {
  return `
    <section class="screen profile-setup-screen">

      <div class="topbar profile-setup-topbar">
        ${back(state.customerName ? "account" : "otpPage")}
        <h2>${t("completeProfile")}</h2>
        ${langSwitch()}
      </div>

      <div class="profile-setup-intro">
        <p>${t("profileSetupSub")}</p>
      </div>

      <label class="profile-setup-label">
        ${t("fullName")}
      </label>

      <input
        class="field"
        type="text"
        placeholder="${t("fullNamePlaceholder")}"
        value="${state.customerName}"
        oninput="state.customerName=this.value"
      />

      <label class="profile-setup-label">
        ${t("emailOptional")}
      </label>

      <input
        class="field"
        type="email"
        placeholder="${t("emailPlaceholder")}"
        value="${state.customerEmail}"
        oninput="state.customerEmail=this.value"
      />

      <button
        class="btn btn-primary profile-save-btn"
        onclick="completeProfile()"
        ${state.authBusy ? "disabled" : ""}
      >
        ${t("saveContinue")}
      </button>

    </section>`;
}



function savedAddressesPage() {
  const addressBusy = typeof accountAddresses !== "undefined" && (accountAddresses.busy || accountAddresses.mutating);
  const addressError = typeof accountAddresses !== "undefined" && accountAddresses.error;
  return `
    <section class="screen saved-addresses-screen">

      <div class="topbar saved-addresses-topbar">
        ${back(state.addressReturnScreen || "account")}
        <h2>${t("savedAddresses")}</h2>
        ${langSwitch()}
      </div>

      ${addressBusy && !state.savedAddresses.length ? `<div class="address-load-state">${t("loadingAddresses")}</div>` : ""}
      ${addressError ? `<div class="address-load-state address-load-error">${t("addressesUnavailable")} <button onclick="loadAccountAddresses(true)">${t("retry")}</button></div>` : ""}

      ${
        state.savedAddresses.length === 0 && !addressBusy
          ? `
            <div class="address-empty-state">
              <div class="address-empty-icon">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 10.5L12 4l8 6.5V20H4z"></path>
                  <path d="M9 20v-6h6v6"></path>
                </svg>
              </div>

              <h3>${t("noSavedAddresses")}</h3>
              <p>${t("noSavedAddressesSub")}</p>
            </div>
          `
          : `
            <div class="saved-address-list">

              ${state.savedAddresses.map((address) => {
                const isDefault = state.defaultAddressId === address.id;

                return `
                  <div class="saved-address-card ${isDefault ? "is-default" : ""}">

                    <div class="saved-address-icon">
  ${
    address.type === "home"
      ? `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 10.5L12 4l8 6.5V20H4z"></path>
          <path d="M9 20v-6h6v6"></path>
        </svg>
      `
      : address.type === "work"
      ? `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="7" width="18" height="13" rx="2"></rect>
          <path d="M9 7V5h6v2"></path>
          <path d="M3 12h18"></path>
        </svg>
      `
      : `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0z"></path>
          <circle cx="12" cy="10" r="2.5"></circle>
        </svg>
      `
  }
</div>

                    <div class="saved-address-copy">

                      <div class="saved-address-heading">
                        <strong>${t(address.type === "home" ? "homeAddress" : address.type)}</strong>

                        ${
                          isDefault
                            ? `<span class="default-address-badge">${t("defaultAddress")}</span>`
                            : ""
                        }
                      </div>

                      <span>${escapeHtml(pinAddressText(address))}</span>
                      ${validDeliveryPin(address)?`<a href="${deliveryPinLink(address)}" target="_blank" rel="noopener">${cartCopy("View on map","عرض على الخريطة")}</a>`:`<small>${cartCopy("Add a map pin before delivery","أضف موقعاً على الخريطة قبل التوصيل")}</small>`}

                      <div class="saved-address-actions">
                        ${state.addressReturnScreen === "checkout" ? `<button onclick="selectCheckoutAddress('${escapeHtml(address.id)}')" ${addressBusy ? "disabled" : ""}>${cartCopy("Deliver here", "التوصيل هنا")}${state.checkoutAddressId === address.id ? " ✓" : ""}</button>` : ""}
                        ${state.addressReturnScreen === "home" ? `<button onclick="selectHomeAddress('${escapeHtml(address.id)}')" ${addressBusy ? "disabled" : ""}>${cartCopy("Deliver here", "التوصيل هنا")}${state.checkoutAddressId === address.id ? " ✓" : ""}</button>` : ""}

                        ${
                          !isDefault
                            ? `
                              <button onclick="setDefaultAddress('${escapeHtml(address.id)}')" ${addressBusy ? "disabled" : ""}>
                                ${t("setDefault")}
                              </button>
                            `
                            : ""
                        }

                        <button onclick="editAddress('${escapeHtml(address.id)}')" ${addressBusy ? "disabled" : ""}>
                          ${t("edit")}
                        </button>

                        <button
                          class="address-delete-btn"
                          onclick="deleteAddress('${escapeHtml(address.id)}')"
                          ${addressBusy ? "disabled" : ""}
                        >
                          ${t("delete")}
                        </button>

                      </div>

                    </div>

                  </div>
                `;
              }).join("")}

            </div>
          `
      }

      <button
        class="btn btn-primary add-address-btn"
        onclick="startAddAddress()"
        ${addressBusy || state.savedAddresses.length >= 10 ? "disabled" : ""}
      >
        + ${t("addNewAddress")}
      </button>

      ${state.savedAddresses.length >= 10 ? `<small class="address-limit-note">${t("addressLimitReached")}</small>` : ""}

    </section>`;
}

async function saveAddress() {
  if (!state.isLoggedIn || accountAddresses.mutating) return;
  if(!validDeliveryPin(deliveryLocation.draft)||!deliveryLocation.confirmed){
    toast(cartCopy("Confirm your location pin first.","أكد موقعك على الخريطة أولاً."));return;
  }
  if(state.addressDirections.trim().length>300)return;
  const addressData={type:state.addressType,...deliveryLocation.draft,directions:state.addressDirections.trim()};
  const saveUser=state.authUserId;
  const wasEditing = Boolean(state.editingAddressId);
  accountAddresses.mutating = true;
  renderKeepScroll();
  try {
    const saved = await persistAccountAddress(addressData);
    if(!state.isLoggedIn||state.authUserId!==saveUser)return;
    if (state.addressReturnScreen === "checkout") {state.checkoutAddressId = saved.id;state.checkoutPinConfirmedId=saved.id;state.checkoutPinConfirmedVersion=state.savedAddresses.find(a=>a.id===saved.id)?.updatedAt;}
    toast(t(wasEditing ? "addressUpdated" : "addressSaved"));
  } catch (_) {
    toast(t("addressSaveFailed"));
    return;
  } finally {
    accountAddresses.mutating = false;
    if (state.screen === "addAddressPage") renderKeepScroll();
  }

  state.editingAddressId = null;
  state.addressType = "home";
  state.addressArea = "";
  state.addressStreet = "";
  state.addressBuilding = "";
  state.addressUnit = "";
  state.addressDirections = "";

  go(state.addressReturnScreen === "checkout" ? "checkout" : "savedAddressesPage");
}
function startAddAddress() {
  resetDeliveryLocation();
  state.editingAddressId = null;
  state.addressType = "home";
  state.addressArea = "";
  state.addressStreet = "";
  state.addressBuilding = "";
  state.addressUnit = "";
  state.addressDirections = "";

  go("addAddressPage");
}

function editAddress(id) {
  const address = state.savedAddresses.find((item) => item.id === id);

  if (!address) return;

  resetDeliveryLocation(address);
  state.editingAddressId = id;
  state.addressType = address.type;
  state.addressArea = address.area;
  state.addressStreet = address.street;
  state.addressBuilding = address.building;
  state.addressUnit = address.unit || "";
  state.addressDirections = address.directions || "";

  go("addAddressPage");
}

async function deleteAddress(id) {
  if (!isMenuId(id) || accountAddresses.mutating) return;
  accountAddresses.mutating = true; renderKeepScroll();
  try { await removeAccountAddress(id); toast(t("addressDeleted")); }
  catch (_) { toast(t("addressDeleteFailed")); }
  finally { accountAddresses.mutating = false; renderKeepScroll(); }
}

async function setDefaultAddress(id) {
  if (!isMenuId(id) || accountAddresses.mutating) return;
  accountAddresses.mutating = true; renderKeepScroll();
  try { await makeDefaultAccountAddress(id); toast(t("defaultAddressSet")); }
  catch (_) { toast(t("addressDefaultFailed")); }
  finally { accountAddresses.mutating = false; renderKeepScroll(); }
}


function setAddressType(type, button) {
  if (!['home','work','other'].includes(type)) return;
  state.addressType = type;
  button.closest('.address-type-toggle').querySelectorAll('button')
    .forEach(row => row.classList.toggle('active', row === button));
}

function addAddressPage() {
  return `
    <section class="screen add-address-screen">

      <div class="topbar add-address-topbar">
        ${back("savedAddressesPage")}
        <h2>${state.editingAddressId ? t("editAddressTitle") : t("addAddressTitle")}</h2>
        ${langSwitch()}
      </div>

      <label class="address-form-label">
        ${t("addressType")}
      </label>

      <div class="address-type-toggle">

        <button
          class="${state.addressType === "home" ? "active" : ""}"
          onclick="setAddressType('home',this)"
        >
          ${t("homeAddress")}
        </button>

        <button
          class="${state.addressType === "work" ? "active" : ""}"
          onclick="setAddressType('work',this)"
        >
          ${t("work")}
        </button>

        <button
          class="${state.addressType === "other" ? "active" : ""}"
          onclick="setAddressType('other',this)"
        >
          ${t("other")}
        </button>

      </div>

      ${pinFormMarkup()}

      <button
        class="btn btn-primary save-address-btn"
        onclick="saveAddress()"
        ${typeof accountAddresses !== "undefined" && accountAddresses.mutating ? "disabled" : ""}
      >
      ${state.editingAddressId ? t("updateAddress") : t("saveAddress")}
      </button>

    </section>`;
}

function signedInAccount() {
  if (typeof rewardsEnsureLoaded === "function") rewardsEnsureLoaded(() => { if (state.screen === "account") renderKeepScroll(); });
  return `
    <section class="screen new-account-screen signed-account-screen">

      <div class="topbar account-topbar">
        <h2>${t("accountTitle")}</h2>
        ${langSwitch()}
      </div>

      <div class="signed-profile-card">

        <div class="account-avatar">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="8" r="4"></circle>
            <path d="M4.5 21a7.5 7.5 0 0 1 15 0"></path>
          </svg>
        </div>

        <div class="signed-profile-copy">
          <span>${t("welcomeBack")}</span>
          <h3>${escapeHtml(state.customerName)}</h3>
          <p dir="ltr">${escapeHtml(state.customerPhone)}</p>
          ${
            state.customerEmail
              ? `<small>${escapeHtml(state.customerEmail)}</small>`
              : ""
          }
        </div>

        <button class="signed-edit-btn" onclick="go('profileSetupPage')">
          ${t("editProfile")}
        </button>

      </div>

${typeof rewardsAccountCardMarkup === "function" ? rewardsAccountCardMarkup() : ""}
      <div class="account-section-title account-settings-title">
        ${t("myAccount")}
      </div>

      <div class="account-list">

        <button
          class="account-list-item"
          onclick="go('savedAddressesPage')"
        >
          <div class="account-list-icon">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 10.5L12 4l8 6.5V20H4z"></path>
              <path d="M9 20v-6h6v6"></path>
            </svg>
          </div>

          <div class="account-list-copy">
            <strong>${t("savedAddresses")}</strong>
            <span>${t("savedAddressesSub")}</span>
          </div>

          <span class="account-arrow">›</span>
        </button>

        <button
          class="account-list-item"
          onclick="go('track', { orderTab: 'history' })"
        >
          <div class="account-list-icon">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"></path>
              <path d="M9 8h6"></path>
              <path d="M9 12h6"></path>
              <path d="M9 16h4"></path>
            </svg>
          </div>

          <div class="account-list-copy">
            <strong>${t("orderHistory")}</strong>
            <span>${t("orderHistorySub")}</span>
          </div>

          <span class="account-arrow">›</span>
        </button>

        <button
          class="account-list-item"
          onclick="toast(t('notifications'))"
        >
          <div class="account-list-icon">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path>
              <path d="M10 21h4"></path>
            </svg>
          </div>

          <div class="account-list-copy">
            <strong>${t("notifications")}</strong>
            <span>${t("notificationsSub")}</span>
          </div>

          <span class="account-arrow">›</span>
        </button>
${typeof pushOffersMarkup === "function" ? pushOffersMarkup("account") : ""}

      </div>
      <div class="account-section-title account-settings-title">
        ${t("preferences")}
      </div>

      <div class="account-list">

        <button
          class="account-list-item"
          onclick="go('languageSettingsPage')"
        >
          <div class="account-list-icon">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="9"></circle>
              <path d="M3 12h18"></path>
              <path d="M12 3a15 15 0 0 1 0 18"></path>
              <path d="M12 3a15 15 0 0 0 0 18"></path>
            </svg>
          </div>

          <div class="account-list-copy">
            <strong>${t("language")}</strong>
            <span>${state.lang === "ar" ? "العربية" : "English"}</span>
          </div>

          <span class="account-arrow">›</span>
        </button>
<button
  class="account-list-item"
  onclick="go('appearanceSettingsPage')"
>
  <div class="account-list-icon">
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4"></circle>
      <path d="M12 2v2"></path>
      <path d="M12 20v2"></path>
      <path d="M4.93 4.93l1.41 1.41"></path>
      <path d="M17.66 17.66l1.41 1.41"></path>
      <path d="M2 12h2"></path>
      <path d="M20 12h2"></path>
      <path d="M4.93 19.07l1.41-1.41"></path>
      <path d="M17.66 6.34l1.41-1.41"></path>
    </svg>
  </div>

  <div class="account-list-copy">
    <strong>${t("appearance")}</strong>
    <span>
      ${
        state.appearance === "light"
          ? t("lightMode")
          : state.appearance === "system"
          ? t("systemMode")
          : t("darkMode")
      }
    </span>
  </div>

  <span class="account-arrow">›</span>
</button>
        
      </div>
      <button
        class="account-signout-btn"
        onclick="signOutCustomer()"
      >
        ${t("signOut")}
      </button>

    </section>

    ${nav("account")}`;
}

function languageSettingsPage() {
  return `
    <section class="screen language-settings-screen">

      <div class="topbar language-settings-topbar">
        ${back("account")}
        <h2>${t("chooseLanguage")}</h2>
      </div>

      <p class="language-settings-intro">
        ${t("languageSettingsSub")}
      </p>

      <div class="language-settings-list">

        <button
          class="language-setting-item ${state.lang === "en" ? "active" : ""}"
          onclick="setLang('en')"
        >
          <div>
            <strong>${t("englishLanguage")}</strong>
            <span>English</span>
          </div>

          <span class="language-check">
            ${state.lang === "en" ? "✓" : ""}
          </span>
        </button>

        <button
          class="language-setting-item ${state.lang === "ar" ? "active" : ""}"
          onclick="setLang('ar')"
        >
          <div>
            <strong>${t("arabicLanguage")}</strong>
            <span>العربية</span>
          </div>

          <span class="language-check">
            ${state.lang === "ar" ? "✓" : ""}
          </span>
        </button>

      </div>

    </section>`;
}
function appearanceSettingsPage() {
  return `
    <section class="screen language-settings-screen">

      <div class="topbar language-settings-topbar">
        ${back("account")}
        <h2>${t("appearance")}</h2>
      </div>

      <p class="language-settings-intro">
        ${t("appearanceSettingsSub")}
      </p>

      <div class="language-settings-list">

        <button
          class="language-setting-item ${
            state.appearance === "dark" ? "active" : ""
          }"
          onclick="setAppearance('dark')"
        >
          <div>
            <strong>${t("darkMode")}</strong>
            <span>${t("darkModeSub")}</span>
          </div>

          <span class="language-check">
            ${state.appearance === "dark" ? "✓" : ""}
          </span>
        </button>

        <button
          class="language-setting-item ${
            state.appearance === "light" ? "active" : ""
          }"
          onclick="setAppearance('light')"
        >
          <div>
            <strong>${t("lightMode")}</strong>
            <span>${t("lightModeSub")}</span>
          </div>

          <span class="language-check">
            ${state.appearance === "light" ? "✓" : ""}
          </span>
        </button>

        <button
          class="language-setting-item ${
            state.appearance === "system" ? "active" : ""
          }"
          onclick="setAppearance('system')"
        >
          <div>
            <strong>${t("systemMode")}</strong>
            <span>${t("systemModeSub")}</span>
          </div>

          <span class="language-check">
            ${state.appearance === "system" ? "✓" : ""}
          </span>
        </button>

      </div>

    </section>`;
}

function account() {
  if (state.isLoggedIn) {
    return signedInAccount();
  }
  if (typeof rewardsEnsureLoaded === "function") rewardsEnsureLoaded(() => { if (state.screen === "account") renderKeepScroll(); });
  return `
    <section class="screen new-account-screen">

      <div class="topbar account-topbar">
        <h2>${t("accountTitle")}</h2>
        ${langSwitch()}
      </div>

      <div class="account-guest-card">

        <div class="account-avatar">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="8" r="4"></circle>
            <path d="M4.5 21a7.5 7.5 0 0 1 15 0"></path>
          </svg>
        </div>

        <div class="account-guest-copy">
          <h3>${brandedWelcomeLabel()}</h3>
          <p>${t("accountGuestSub")}</p>
        </div>

        <button
          class="btn btn-primary account-signin-btn"
          onclick="go('signInPage')"
        >
          ${t("signInCreate")}
        </button>

      </div>

${typeof rewardsOn === "function" && rewardsOn() ? `
      <div class="account-section-title">
        ${brandedRewardsLabel()}
      </div>

      <button
        class="account-rewards-card"
        onclick="go('signInPage')"
      >
        <div class="account-reward-icon">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3l2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3z"></path>
          </svg>
        </div>

        <div class="account-reward-copy">
          <strong>${brandedRewardsLabel()}</strong>
          <span>${t("rewardsGuestSub")}</span>
          <small>${t("signInToViewRewards")}</small>
        </div>

        <span class="account-arrow">›</span>
      </button>

` : ""}
      <div class="account-section-title account-settings-title">
      ${t("myAccount")}
     </div>

      <div class="account-list">

        <button
          class="account-list-item"
          onclick="toast(t('signInRequired'))"
        >
          <div class="account-list-icon">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 10.5L12 4l8 6.5V20H4z"></path>
              <path d="M9 20v-6h6v6"></path>
            </svg>
          </div>

          <div class="account-list-copy">
            <strong>${t("savedAddresses")}</strong>
            <span>${t("savedAddressesSub")}</span>
          </div>

          <span class="account-arrow">›</span>
        </button>

        <button
       class="account-list-item"
      onclick="go('track', { orderTab: 'history' })"
      >
      <div class="account-list-icon">
      <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"></path>
      <path d="M9 8h6"></path>
      <path d="M9 12h6"></path>
      <path d="M9 16h4"></path>
     </svg>
     </div>

     <div class="account-list-copy">
     <strong>${t("orderHistory")}</strong>
     <span>${t("orderHistorySub")}</span>
     </div>

      <span class="account-arrow">›</span>
       </button>

        <button
          class="account-list-item"
          onclick="toast(t('signInRequired'))"
        >
          <div class="account-list-icon">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path>
              <path d="M10 21h4"></path>
            </svg>
          </div>

          <div class="account-list-copy">
            <strong>${t("notifications")}</strong>
            <span>${t("notificationsSub")}</span>
          </div>

          <span class="account-arrow">›</span>
        </button>
<button
  class="account-list-item"
  onclick="go('appearanceSettingsPage')"
>
  <div class="account-list-icon">
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4"></circle>
      <path d="M12 2v2"></path>
      <path d="M12 20v2"></path>
      <path d="M4.93 4.93l1.41 1.41"></path>
      <path d="M17.66 17.66l1.41 1.41"></path>
      <path d="M2 12h2"></path>
      <path d="M20 12h2"></path>
      <path d="M4.93 19.07l1.41-1.41"></path>
      <path d="M17.66 6.34l1.41-1.41"></path>
    </svg>
  </div>

  <div class="account-list-copy">
    <strong>${t("appearance")}</strong>
    <span>
      ${
        state.appearance === "light"
          ? t("lightMode")
          : state.appearance === "system"
          ? t("systemMode")
          : t("darkMode")
      }
    </span>
  </div>

  <span class="account-arrow">›</span>
</button>
      </div>
      <div class="account-section-title account-settings-title">
        ${t("preferences")}
      </div>

      <div class="account-list">

        <button
          class="account-list-item"
          onclick="go('languageSettingsPage')"
        >
          <div class="account-list-icon">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="9"></circle>
              <path d="M3 12h18"></path>
              <path d="M12 3a15 15 0 0 1 0 18"></path>
              <path d="M12 3a15 15 0 0 0 0 18"></path>
            </svg>
          </div>

          <div class="account-list-copy">
            <strong>${t("language")}</strong>
            <span>${state.lang === "ar" ? "العربية" : "English"}</span>
          </div>

          <span class="account-arrow">›</span>
        </button>

      </div>
    </section>

    ${nav("account")}`;
}




function render() {
  saveCartDraft();
  applyDir();
  const map = {
    ...(typeof cateringPage === 'function' ? {cateringPage} : {}),
    splash,
    home,
    menu,
    listing,
    detail,
    cart,
    checkout,
    confirmation,
    track,
    offers,
    rewards,
    more,
    feedbackPage,
    branchPage,
    supportPage,
    signInPage,
    supportRequest,
    otpPage,
    profileSetupPage,
    savedAddressesPage,
    addAddressPage,
    languageSettingsPage,
    appearanceSettingsPage,
    account,
  };
  // Batch E: the app itself is switched off for this restaurant: one notice, nothing else.
  if (typeof featureOn === "function" && !featureOn("app")) {
    $app().innerHTML = appUnavailableMarkup();
    $app().style.paddingBottom = "20px";
    return;
  }
  $app().innerHTML = (map[state.screen] || home)();
  // Batch N: every screen keeps the navigation. On a phone the focused steps
  // (item, checkout, sign-in, new address) show it only on a wide screen.
  if (state.screen !== "splash" && typeof $app().querySelector === "function" && !$app().querySelector(".nav")) {
    $app().insertAdjacentHTML("beforeend", nav(navTabFor(state.screen))
      .replace('class="nav"', `class="nav${NAV_WIDE_ONLY.includes(state.screen) ? " nav-wide-only" : ""}"`));
  }
  navSync();
  if (typeof pushAfterRender === "function") pushAfterRender();   // Batch P
  if(state.screen==="addAddressPage")mountDeliveryMap();
  if (["home","menu","listing","detail","cart","checkout","offers"].includes(state.screen)) {
    const screen = $app().querySelector(".screen");
    if (screen) screen.insertAdjacentHTML("afterbegin", menuStatusMarkup());
  }
  $app().style.paddingBottom =
    state.screen === "splash" ||
    NAV_WIDE_ONLY.includes(state.screen)
      ? "20px"
      : "";
}

function openItem(id) {
  state.cartEditKey = null;
  const item = itemById(id);
  if (!item) { toast(menuText("unavailableItem")); return; }
  if (state.categoryId !== item.category) state.subcategoryId = "";
  state.categoryId = item.category;
  // Back on the item page returns to the screen the customer opened it from.
  if (state.screen !== "detail") state.itemFrom = state.screen;
  state.itemId = id;
  state.choice = null;
  // Batch V2: the restaurant's default choice starts selected.
  prepareChoices(item, {size:"regular", choice:defaultChoiceId(item), extras:[]});
  state.spice = "medium";
  go("detail");
}
function renderKeepScroll() {
  const currentScreen = document.querySelector("#app > .screen");
  const currentScroll = currentScreen ? currentScreen.scrollTop : 0;
  const horizontal = currentScreen ? [...currentScreen.querySelectorAll('.menu-subcategories,.banner-track,.scroll')].map(el => el.scrollLeft) : [];
  const focused = document.activeElement;
  const controls = currentScreen ? [...currentScreen.querySelectorAll('input,textarea,select,button,a')] : [];
  const focusIndex = controls.indexOf(focused);
  const start = focused?.selectionStart, end = focused?.selectionEnd;

  render();

  // Restore before the next paint, avoiding a visible jump to the top.
  const newScreen = document.querySelector("#app > .screen");
  if (newScreen) {
    newScreen.scrollTop = currentScroll;
    newScreen.querySelectorAll('.menu-subcategories,.banner-track,.scroll')
      .forEach((el,index) => { el.scrollLeft = horizontal[index] || 0; });
    const next = [...newScreen.querySelectorAll('input,textarea,select,button,a')][focusIndex];
    // A removed cart row may shift indices; never move focus to a different action.
    if (next && focused && next.tagName === focused.tagName && next.id === focused.id &&
        next.closest('.cart-line')?.dataset.cartKey === focused.closest('.cart-line')?.dataset.cartKey &&
        next.getAttribute('onclick') === focused.getAttribute('onclick') &&
        next.getAttribute('name') === focused.getAttribute('name') &&
        next.textContent === focused.textContent) {
      next.focus({preventScroll:true});
      if (typeof start === 'number' && typeof next.setSelectionRange === 'function') next.setSelectionRange(start,end);
    }
  }
}

function toggleExtra(id) {
  const item = itemById(state.itemId);
  const row = enabledChoices(item, "Add-on").find(x => x.id === id);
  if (!row || (row.required && state.extras.includes(id))) return;
  if (state.extras.includes(id)) {
    state.extras = state.extras.filter((x) => x !== id);
  } else {
    state.extras.push(id);
  }
  // The native checkbox already reflects the change; keep the detail DOM intact.
  refreshDetailPrice();
}
function selectVariant(id) {
  // Batch V (238): a size outside its own hours cannot be chosen.
  if (!enabledChoices(itemById(state.itemId), "Variant").some(x => x.id === id && choiceOpen(x))) return;
  state.size = id;
  refreshDetailPrice();
}
function selectChoice(id) {
  if (!enabledChoices(itemById(state.itemId), "Option").some(x => x.id === id)) return;
  state.choice = id;
  refreshDetailPrice();
}
function clearChoice() {
  if (enabledChoices(itemById(state.itemId), "Option").some(x => x.required)) return;
  state.choice = null;
  refreshDetailPrice();
}
function setSpiceLevel(button, spice) {
  state.spice = spice;

  const spiceBox = button.closest(".spice");

  if (spiceBox) {
    spiceBox.querySelectorAll("button").forEach((btn) => {
      btn.classList.remove("on");
    });
  }

  button.classList.add("on");
}

function addFromDetail() {
  if (state.cartEditKey) {
    const index = state.cart.findIndex(l => l.cartKey === state.cartEditKey);
    const item = itemById(state.itemId);
    if (index < 0 || !canOrderItem(item)) {
      toast(menuText("unavailableItem")); go("cart"); return;
    }
    // Edit the existing line, preserving its quantity. Merge matching choices.
    const line = state.cart[index];
    if (!choicesValid(item)) {
      toast(cartCopy("Please choose the required option.", "يرجى اختيار الخيار المطلوب.")); return;
    }
    const normalized = prepareChoices(item, state);
    line.spice = state.spice;
    line.size = normalized.size;
    line.choice = normalized.choice;
    line.extras = [...normalized.extras];
    line.price = roundMoney(item.price + normalized.extraPrice);
    line.basePrice = roundMoney(item.basePrice + normalized.baseExtraPrice);
    const match = state.cart.find(l => l.cartKey !== line.cartKey && l.id === line.id &&
      l.spice === line.spice && l.size === line.size && l.choice === line.choice &&
      l.extras.join() === line.extras.join());
    if (match) { match.qty += line.qty; state.cart.splice(index,1); }
    reconcileMenuCart();
    go("cart");
    return;
  }
  if (addToCart(itemById(state.itemId))) {
    // Batch C: a suggestion opened to choose options counts once it reaches the cart.
    if (typeof recoAddedFromDetail === "function") recoAddedFromDetail(state.itemId);
    go("cart");
  }
}

function quickAdd(id) {
  const item = itemById(id);
  if (!item) return toast(menuText("unavailableItem"));
  if (enabledChoices(item, "Variant").length || enabledChoices(item, "Option").length || enabledChoices(item, "Add-on").length) {
    openItem(id); return;
  }
  state.size = "regular";
  state.choice = null;
  state.extras = [];
  state.spice = "medium";
  if (addToCart(item) && state.screen === "home") renderKeepScroll();
}

function updateCartBreakdown() {
  const box = document.getElementById("cartBreakdown");
  if (box) box.innerHTML = cartSummaryMarkup();
  const addon = document.getElementById("addonCart");   // Batch A: the "items to add" sum follows the cart
  if (addon && typeof addonCartMarkup === "function") addon.outerHTML = addonCartMarkup();
}
function chgQty(idx, d, button) {
  const line = state.cart[idx];
  if (!line || (d !== 1 && d !== -1)) return;
  const item = itemById(line.id);
  if (d > 0 && !canOrderItem(item)) return toast(menuText("unavailableItem"));
  if (d > 0 && !canAddItem(item)) return toast(limitMessage(item));
  line.qty += d;
  if (line.qty <= 0) state.cart.splice(idx,1);
  saveCartDraft();
  if (line.qty <= 0 || !button?.closest) {
    // Rebuild handlers after removal so old indices cannot change the wrong item.
    renderKeepScroll();
    return;
  }
  const row = button.closest('.cart-line');
  row.querySelector('.qty span').textContent = line.qty;
  row.querySelector('.cart-line-total').textContent = money(linePrice(line));
  const saving = row.querySelector('.offer-saving');
  if (saving) saving.textContent = `${cartCopy('You saved','وفّرت')} ${money(roundMoney(Math.max(0,(line.basePrice ?? item.basePrice)-line.price)*line.qty))}`;
  document.querySelectorAll('.cart-line').forEach((element,index) => {
    const currentItem = itemById(state.cart[index].id);
    element.querySelector('.qty button:last-child').classList.toggle('offer-add-blocked', canOrderItem(currentItem) && !canAddItem(currentItem));
  });
  updateCartBreakdown();
  updateCartButtons();
}

// Batch D: the code box in the cart. Not applied: the field and "Apply code".
// Applied: "Coupon applied" with the code, and "Remove coupon" beside it.
function couponBoxMarkup() {
  if (typeof featureOn === "function" && !featureOn("vouchers")) return "";   // Batch E: codes switched off
  if (state.couponOn && state.voucher?.code) {
    return `<div class="coupon-applied" role="status">
      <span class="coupon-applied-text">✓ ${cartCopy("Coupon applied", "تم تطبيق الكوبون")} <b dir="ltr">${escapeHtml(state.voucher.code)}</b></span>
      <button class="link" onclick="removeCoupon()">${cartCopy("Remove coupon", "إزالة الكوبون")}</button>
    </div>`;
  }
  return `<input class="field" id="couponInput" placeholder="${t("coupon")}" value="${escapeHtml(state.coupon)}" oninput="state.coupon=this.value" />
    <button class="link" onclick="applyCoupon()">${t("applyCoupon")}</button>`;
}
function refreshCouponBox() {
  const box = typeof document !== "undefined" ? document.getElementById("couponBox") : null;
  if (box && "innerHTML" in box) box.innerHTML = couponBoxMarkup();
}
// Take the code off again (the customer can type another one).
function removeCoupon() {
  state.couponOn = false;
  state.voucher = null;
  state.coupon = "";
  refreshCouponBox();
  updateCartBreakdown();
}
async function applyCoupon() {
  const code = state.coupon.trim().toUpperCase();
  state.couponOn = false;
  state.voucher = null;
  if (typeof featureOn === "function" && !featureOn("vouchers")) { refreshCouponBox(); updateCartBreakdown(); return; }
  if (!code) { updateCartBreakdown(); return; }
  const cents = n => Math.round(Number(n) * 100);
  const itemsCents = state.cart.reduce((n,l) => n + cents(l.price) * l.qty, 0);
  try {
    const answer = await customerOrderRpc("oracy_voucher_check_v1", {
      p_restaurant_id: MENU_CONFIG.restaurantId, p_code: code, p_food: itemsCents / 100,
      p_has_offer: state.cart.some(l => itemById(l.id)?.offer),
      p_phone: state.isLoggedIn ? state.customerPhone || state.customer.mobile || "" : state.customer.mobile || "",
    });
    if (answer?.ok === true && answer.code === code) {
      state.voucher = answer;
      state.couponOn = true;
      toast(t("couponOk"));
    } else {
      toast(voucherMessage(answer?.message || ""));
    }
  } catch (_) {
    toast(state.lang === "ar" ? "تعذر التحقق من الكود. حاول مرة أخرى." : "Could not check the code. Please try again.");
  }
  // points may not be allowed together with a code
  if (typeof rewardsValidSelection === "function" && state.redeemPoints > 0 && totals().points <= 0) state.redeemPoints = 0;
  refreshCouponBox();
  updateCartBreakdown();
}

function calculateSuggestedEta(orderType, items) {
  const qty = (items || []).reduce(
    (sum, item) => sum + Number(item.qty || 0),
    0
  );

  if (orderType === "dinein") {
    if (qty <= 3) return { min: 25, max: 35 };
    if (qty <= 6) return { min: 35, max: 45 };
    return { min: 45, max: 60 };
  }

  if (orderType === "takeaway") {
    if (qty <= 3) return { min: 20, max: 30 };
    if (qty <= 6) return { min: 30, max: 45 };
    return { min: 45, max: 60 };
  }

  if (qty <= 3) return { min: 45, max: 60 };
  if (qty <= 6) return { min: 60, max: 75 };
  return { min: 75, max: 90 };
}

function formatEtaRange(eta) {
  if (!eta) return "";

  return state.lang === "ar"
    ? `${eta.min}–${eta.max} دقيقة`
    : `${eta.min}–${eta.max} mins`;
}

function getScheduledFor() {
  if (state.orderTiming === "asap") {
    return null;
  }

  const minutes = Number(state.orderTiming);

  return Date.now() + minutes * 60 * 1000;
}

async function placeOrder() {
  if (state.authBusy || state.orderSubmitting) return;
  if (!orderTypeOpen()) {
    render();
    return toast(orderingClosedTitle() + ". " + restaurantClosedMessage(), 7000);
  }
  if (!(await validateMenuCart())) return;
  if (!checkOfferCartRules()) return;
  if (!state.cart.length) {
    return toast(t("cartIsEmpty"));
  }

  const phone = normalizeSaudiMobile(state.isLoggedIn ? state.customerPhone || state.customer.mobile : state.customer.mobile);
  if (!phone) {
    toast(t("invalidMobile"));
    return;
  }
  state.customer.mobile = phone;
  if (state.isLoggedIn) {
    if (!state.customer.name) return toast(t("nameRequired"));
    return createOrderAfterVerification();
  }

  state.authBusy = true;
  renderKeepScroll();
  try {
    const resumed = await resumeTrustedCustomerForPhone(phone);
    if (resumed) {
      if (!state.customerName) {
        state.otpPurpose = "guestOrder";
        go("profileSetupPage");
        return;
      }
      toast(authCopy(`Welcome back, ${state.customerName}`, `مرحباً بعودتك، ${state.customerName}`));
      return await createOrderAfterVerification();
    }
  } catch (error) {
    toast(authMessage(error), 6000);
    return;
  } finally {
    state.authBusy = false;
    if (state.screen === "checkout") renderKeepScroll();
  }

  state.loginMobile = phone;
  state.otpPurpose = "guestOrder";
  await startOtp();
}
/* Gate 3: the client_order_id for the cart as it is now (same cart → same id). */
const orderAttempt = {key: null, id: null};
const ORDER_ATTEMPT_KEY = "oracy_order_attempt";
/* The attempt survives a reload: a retry after a timeout must not make a second order. */
function orderAttemptLoad() {
  if (orderAttempt.key !== null) return;
  try {
    const saved = JSON.parse(sessionStorage.getItem(ORDER_ATTEMPT_KEY) || "null");
    if (saved && typeof saved.key === "string" && typeof saved.id === "string") { orderAttempt.key = saved.key; orderAttempt.id = saved.id; }
  } catch (_) {}
}
function orderAttemptSave() {
  try {
    if (orderAttempt.id) sessionStorage.setItem(ORDER_ATTEMPT_KEY, JSON.stringify({key: orderAttempt.key, id: orderAttempt.id}));
    else sessionStorage.removeItem(ORDER_ATTEMPT_KEY);
  } catch (_) {}
}
function orderAttemptClear() { orderAttempt.key = null; orderAttempt.id = null; orderAttemptSave(); orderAttempt.key = null; }
function orderAttemptId(cart, address) {
  orderAttemptLoad();
  const key = JSON.stringify([
    state.orderType, state.orderTiming, typeof getScheduledFor === "function" ? getScheduledFor() : null, address || "",
    (state.customer.mobile || "").trim(), (state.customer.name || "").trim(), (state.customer.email || "").trim(),
    state.couponOn ? (state.voucher?.code || "") : "", state.redeemPoints || 0, state.notes || "",
    cart.map(l => [l.id, l.qty, l.size || null, l.choice || null, (l.extras || []).map(e => e.id || e.name || e).sort(), l.spice || "", l.notes || ""]),
  ]);
  if (orderAttempt.key !== key || !orderAttempt.id) { orderAttempt.key = key; orderAttempt.id = crypto.randomUUID(); orderAttemptSave(); }
  return orderAttempt.id;
}

async function createOrderAfterVerification() {
  if (!orderTypeOpen()) { toast(orderingClosedTitle() + ". " + restaurantClosedMessage(),7000); return; }
  if (!(await validateMenuCart())) return;
  if (!checkOfferCartRules()) return;
  if (state.orderSubmitting) return;
  if (state.orderType === "delivery") {
    if (!state.isLoggedIn) return toast(t("signInRequired"));
    if (accountAddresses.busy || accountAddresses.mutating) return toast(t("loadingAddresses"));
    const user = state.authUserId;
    const loaded = await loadAccountAddresses(true);
    if (!loaded || !state.isLoggedIn || state.authUserId !== user) {
      go("checkout");
      return toast(t("addressesUnavailable"));
    }
    const selected = selectedDeliveryAddress();
    if (!validDeliveryPin(selected) || state.checkoutPinConfirmedId!==selected.id || state.checkoutPinConfirmedVersion!==selected.updatedAt) {
      state.addressReturnScreen = "checkout";
      go("savedAddressesPage", {addressReturnScreen: "checkout"});
      toast(t("addDeliveryAddressPrompt"));
      return;
    }
    const reviewedQuote=currentDeliveryQuote();
    const quote = await refreshDeliveryQuote(true);
    if (!quote?.eligible) {
      go("checkout");
      return toast(state.deliveryQuoteError || quote?.reason || cartCopy("Delivery is unavailable for this location.", "التوصيل غير متاح لهذا الموقع."), 6000);
    }
    if (reviewedQuote?.eligible && Number(reviewedQuote.fee)!==Number(quote.fee)) {
      go("checkout");
      return toast(cartCopy("Delivery fee changed. Please review the total and place your order again.","تغيرت رسوم التوصيل. راجع الإجمالي وأكد الطلب مجدداً."),6000);
    }
  }
  if (state.orderSubmitting || !state.cart.length) return;
  if (!orderTypeOpen()) { toast(orderingClosedTitle() + ". " + restaurantClosedMessage(),7000); return; }
  // Gate 4 (280): the server takes orders from signed-in customers only.
  if (!state.isLoggedIn) { go("checkout"); return toast(t("signInRequired")); }
  state.orderSubmitting = true;
  if (state.screen === "checkout") renderKeepScroll();
  const cart = state.cart.map((line) => ({ ...line, extras:[...(line.extras || [])] }));
  const suggestedEta = calculateSuggestedEta(state.orderType, cart);
  const defaultAddress = selectedDeliveryAddress();
  const address = state.orderType === "delivery" && defaultAddress
    ? pinAddressText(defaultAddress)
    : "";
  if (address.length > 500) {
    state.orderSubmitting = false;
    go("checkout");
    return toast(cartCopy("Please shorten the delivery address to 500 characters.", "يرجى اختصار عنوان التوصيل إلى 500 حرف."));
  }
  // Gate 3: one id per cart as it stands. A retry after a lost answer sends
  // the same id and the server hands back the order it already made; a
  // changed cart gets a new id.
  const clientOrderId = orderAttemptId(cart, address);
  /* A retry while the first request is still running meets the server's unique
     id; one quiet re-send a moment later then returns that order. */
  const submitOnce = async (payload) => {
    try { return await submitCustomerOrder(payload); }
    catch (error) {
      if (!/duplicate key|23505|client_order_id/i.test(String(error?.message || ""))) throw error;
      await new Promise(resolve => setTimeout(resolve, 1500));
      return submitCustomerOrder(payload);
    }
  };
  try {
    const result = await submitOnce({
      client_order_id: clientOrderId,
      customer_name: state.customer.name.trim(),
      customer_phone: state.customer.mobile.trim(),
      customer_email: state.customer.email.trim(),
      customer_registered: state.isLoggedIn,
      fulfillment_type: state.orderType,
      schedule_type: state.orderTiming === "asap" ? "asap" : "scheduled",
      order_timing: state.orderTiming,
      scheduled_for: getScheduledFor() ? new Date(getScheduledFor()).toISOString() : null,
      suggested_eta: suggestedEta,
      // Batch D (253): only a code that takes something off this cart is sent.
      coupon_code: state.couponOn && state.voucher && totals().discount > 0 && featureOn("vouchers") ? state.voucher.code : "",
      // Batch R (241): points to use; the server prices and checks them.
      ...(state.redeemPoints > 0 ? {redeem_points: state.redeemPoints} : {}),
      address,
      delivery_address_id: state.orderType==="delivery" ? defaultAddress?.id : null,
      delivery_address_version: state.orderType==="delivery" ? defaultAddress?.updatedAt : null,
      expected_delivery_fee: state.orderType==="delivery" ? Number(currentDeliveryQuote()?.fee) : null,
      items: cart.map(line => {
        const item = itemById(line.id);
        return {
          menu_item_id: line.id,
          quantity: line.qty,
          notes: line.notes || "",
          choices: selectedChoices(item, line).map(choice => ({
            name: choice.name,
            type: choice.type,
            // Batch V (238): the permanent id, so the server knows the exact row.
            ...(choice.rowId ? {id: choice.rowId} : {}),
          })),
        };
      }),
    });
    state.order = {
      id: result.order_number,
      backendId: result.id,
      trackingToken: result.tracking_token,
      items: cart,
      customer: {...state.customer},
      customerType: state.isLoggedIn ? "registered" : "guest",
      orderType: state.orderType,
      address,
      status: result.status,
      suggestedEta,
      confirmedEta: null,
      scheduleType: state.orderTiming === "asap" ? "asap" : "scheduled",
      orderTiming: state.orderTiming,
      scheduledFor: getScheduledFor(),
      total: Number(result.total),
      deliveryFee: Number(result.delivery_fee || 0),
      deliveryQuote: result.delivery_quote || null,
      createdAt: Date.parse(result.created_at),
      step: 0,
    };
    if(state.orderType==="delivery"){state.lastDeliveryAddressId=defaultAddress.id;state.checkoutPinConfirmedId=null;}
    orderAttemptClear();
    state.cart = [];
    saveCartDraft();
    state.couponOn = false;
    state.voucher = null;
    state.coupon = "";
    state.redeemPoints = 0;
    if (typeof loadRewardsSummary === "function") loadRewardsSummary(true);
    saveTrackedCustomerOrder();
    go("confirmation");
    refreshTrackedCustomerOrder();
  } catch (error) {
    const rawMessage = String(error?.message || "");
    if (/outside its available time/i.test(rawMessage)) {
      const message = orderTypeOpen()
        ? unavailableTimeMessage()
        : orderingClosedTitle() + ". " + restaurantClosedMessage();
      go("checkout");
      setTimeout(() => toast(message, 7000));
    } else if (/Client order ID conflict/i.test(rawMessage)) {
      // Gate 4 (280): the attempt id met an order that is not this customer's
      // (the same cart was sent to another branch, or the id is stale): a new
      // id and one more tap place the order.
      orderAttemptClear();
      go("checkout");
      setTimeout(() => toast(cartCopy("Please place your order again.", "يرجى تأكيد الطلب مرة أخرى."), 6000));
    } else if (error?.hint === "module_off") {
      // Batch E: ordering (or delivery) was switched off for this restaurant. The cart stays;
      // read the status again so the checkout shows the notice instead of another try.
      go("checkout");
      Promise.resolve(loadOrderingHours()).then(() => {
        if (state.screen === "checkout") renderKeepScroll();
        toast(orderingClosedTitle() ? orderingClosedTitle() + ". " + restaurantClosedMessage() : moduleOffText(rawMessage), 7000);
      });
    } else if (orderingRefusal(rawMessage)) {
      // Batch H: the server refused because of the hours. The cart stays; show the notice.
      go("checkout");
      // Read the server's answer first, so the notice and the words match what it just refused.
      loadOrderingHours().then(() => {
        if (state.screen === "checkout") renderKeepScroll();
        toast(/within opening hours/i.test(rawMessage)
          ? cartCopy("Please choose a time within opening hours.", "يرجى اختيار وقت ضمن ساعات العمل.")
          : (orderingClosedTitle() ? orderingClosedTitle() + ". " + restaurantClosedMessage() : rawMessage), 7000);
      });
    } else {
      if (/points/i.test(rawMessage) && typeof loadRewardsSummary === "function") {
        // Balance changed elsewhere (or expired): refresh and let the customer choose again.
        state.redeemPoints = 0;
        loadRewardsSummary(true).then(() => { if (state.screen === "checkout") renderKeepScroll(); });
      }
      if ((/\bcode\b/i.test(rawMessage) || /^Too many tries/.test(rawMessage)) && state.couponOn) {
        // Batch D: the code can no longer be used (switched off, used up, signed out…):
        // take it off so the customer sees the real total and can order.
        state.couponOn = false;
        state.voucher = null;
        toast(voucherMessage(rawMessage), 7000);
      } else {
        // Gate 2: the busy/too-many messages have Arabic words too.
        const known = state.lang === "ar" && VOUCHER_MESSAGES_AR[rawMessage];
        toast(known || rawMessage || cartCopy("Could not place order. Try again.", "تعذر إرسال الطلب. حاول مرة أخرى."), 5000);
      }
    }
  } finally {
    state.orderSubmitting = false;
    if (state.screen === "checkout") renderKeepScroll();
  }
}

window.go = go;
window.openItem = openItem;
window.toggleExtra = toggleExtra;
window.selectVariant = selectVariant;
window.selectChoice = selectChoice;
window.clearChoice = clearChoice;
window.setSpiceLevel = setSpiceLevel;
window.addFromDetail = addFromDetail;
window.quickAdd = quickAdd;
window.chgQty = chgQty;
window.applyCoupon = applyCoupon;
window.removeCoupon = removeCoupon;
window.placeOrder = placeOrder;
window.createOrderAfterVerification = createOrderAfterVerification;
window.setLang = setLang;
window.t = t;
window.state = state;
window.render = render;
window.openSupportWhatsApp = openSupportWhatsApp;
window.startOtp = startOtp;
window.verifyOtp = verifyOtp;
window.completeProfile = completeProfile;
window.signOutCustomer = signOutCustomer;
window.saveAddress = saveAddress;
window.startAddAddress = startAddAddress;
window.editAddress = editAddress;
window.deleteAddress = deleteAddress;
window.setDefaultAddress = setDefaultAddress;
window.reorderFromHistory = reorderFromHistory;
window.setHomeOrderType = setHomeOrderType;
window.setCheckoutOrderType = setCheckoutOrderType;
window.setCheckoutTiming = setCheckoutTiming;
window.updateCartBreakdown = updateCartBreakdown;
window.setAppearance = setAppearance;

applyDir();
applyAppearance();
restoreCustomerOrderHistory();
restoreTrackedCustomerOrder();
try { if (localStorage.getItem(appStorageKey("welcomed")) === "1") state.screen = "home"; } catch (_) {}
// Batch N: a reload stays on the same browsing screen (not inside a form or the checkout).
try {
  const kept = typeof history !== "undefined" && history.state && history.state.oracy;
  if (kept && ["home", "menu", "listing", "detail", "cart", "track", "more", "offers", "account", "rewards"].includes(kept.screen)) {
    Object.assign(state, {screen: kept.screen, categoryId: kept.categoryId ?? state.categoryId,
      subcategoryId: kept.subcategoryId ?? state.subcategoryId, itemId: kept.itemId ?? state.itemId,
      orderTab: kept.orderTab ?? state.orderTab, itemFrom: kept.itemFrom});
  }
} catch (_) {}
render();

bootstrapCustomerAuth();

startMenuSync();
startCustomerOrderSync();
