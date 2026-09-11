const VAT = 0.15;
const DELIVERY = 0;
const MIN_DELIVERY_ORDER = 30;
const RESTAURANT_ORDER_WINDOW = Object.freeze({
  openSeconds: 12 * 60 * 60,
  closeSeconds: 1 * 60 * 60,
});

const state = {
  lang: localStorage.getItem("mk-lang") === "ar" ? "ar" : "en",
  appearance: ["dark", "light", "system"].includes(
    localStorage.getItem("mk-appearance")
  )
    ? localStorage.getItem("mk-appearance")
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
  savedAddresses: [],
  defaultAddressId: null,
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
  rewardPoints: 0,
  rewardStamps: 0,
  rewardVouchers: 0,
  supportType: "",
  supportOrder: "",
  supportDetails: "",
  points: 120,
  stamps: 3,
  orderTiming: "asap",
};

let cartLineSequence = 0;
function newCartKey() { return "line-" + (++cartLineSequence); }
function cartCopy(en, ar) { return state.lang === "ar" ? ar : en; }
function restaurantAcceptingOrders(date = new Date()) {
  if (testingAlwaysOpenActive()) return true;
  const { seconds } = riyadhClock(date);
  return seconds >= RESTAURANT_ORDER_WINDOW.openSeconds ||
    seconds < RESTAURANT_ORDER_WINDOW.closeSeconds;
}
function restaurantClosedMessage() {
  return cartCopy(
    "Meerath Kabab is currently closed. Please place your order during our working hours: 12:00 PM to 1:00 AM.",
    "مطعم ميراث كباب مغلق حالياً. يرجى تقديم طلبكم خلال ساعات العمل: من 12:00 ظهراً إلى 1:00 صباحاً."
  );
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
  return choice.price > 0 ? ` <small>+ ${money(choice.price)}</small>` : "";
}
function itemChoiceMarkup(item) {
  const variants = enabledChoices(item, "Variant");
  const options = enabledChoices(item, "Option");
  const addons = enabledChoices(item, "Add-on");
  const group = (title, rows, mode, allowNone = false) => !rows.length ? "" : `<div class="item-choice-group"><h4>${title}</h4>
    ${allowNone ? `<label class="item-choice-row"><input type="radio" name="choice-Option" ${state.choice == null ? "checked" : ""} onchange="clearChoice()"><span>${cartCopy("No option", "بدون خيار")}</span></label>` : ""}
    ${rows.map(row => `<label class="item-choice-row"><input type="${mode}" name="${mode === "radio" ? `choice-${row.type}` : row.id}"
      ${row.type === "Variant" ? (state.size === row.id ? "checked" : "") : row.type === "Option" ? (state.choice === row.id ? "checked" : "") : (state.extras.includes(row.id) ? "checked" : "")}
      ${row.type === "Add-on" && row.required ? "disabled" : ""}
      onchange="${row.type === "Variant" ? `selectVariant('${row.id}')` : row.type === "Option" ? `selectChoice('${row.id}')` : `toggleExtra('${row.id}')`}">
      <span>${escapeHtml(row.name)}${row.required ? ` <small>${cartCopy("Required", "مطلوب")}</small>` : ""}</span><strong>${choicePriceText(row)}</strong></label>`).join("")}</div>`;
  return `${group(cartCopy("Choose a variant", "اختر النوع"), variants, "radio")}
    ${group(cartCopy("Choose an option", "اختر خياراً"), options, "radio", !options.some(x => x.required))}
    ${group(cartCopy("Add-ons", "إضافات"), addons, "checkbox")}`;
}
function cartChoiceText(item, line) {
  const labels = selectedChoices(item, line).map(row => row.name);
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
}

function setAppearance(mode) {
  if (!["dark", "light", "system"].includes(mode)) return;

  state.appearance = mode;
  localStorage.setItem("mk-appearance", mode);

  applyAppearance();
  render();
}

function setLang(lang) {
  state.lang = lang;
  localStorage.setItem("mk-lang", lang);
  applyDir();
  render();
}

function go(screen, extra = {}) {
  if (screen !== "detail") state.cartEditKey = null;
  if (screen === "checkout") {
    validateMenuCart().then(ok => { if (ok && checkOfferCartRules()) { Object.assign(state, extra, {screen}); render(); } });
    return;
  }
  if (screen === "listing" && extra.categoryId !== undefined && extra.categoryId !== state.categoryId) state.subcategoryId = "";
  Object.assign(state, extra, { screen });
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

function totals() {
  // Sum integer halalas; the line prices already include VAT and item offers.
  const cents = n => Math.round(Number(n) * 100);
  const itemsCents = state.cart.reduce((n,l) => n + cents(l.price) * l.qty, 0);
  const regularCents = state.cart.reduce((n,l) =>
    n + cents(l.basePrice ?? itemById(l.id)?.basePrice ?? l.price) * l.qty, 0);
  const delivery = state.orderType === "delivery" ? DELIVERY : 0;
  const hasItemOffer = state.cart.some(l => itemById(l.id)?.offer);
  const discountCents = state.couponOn && !hasItemOffer ? Math.min(1000, itemsCents) : 0;
  const total = Math.max(0, itemsCents - discountCents + cents(delivery)) / 100;
  const vat = roundMoney(total * VAT / (1 + VAT));
  return {subtotal:roundMoney(total - vat), delivery, discount:discountCents / 100, vat, total,
    regularItemsTotal:regularCents / 100, offerSavings:Math.max(0, regularCents - itemsCents) / 100};
}
function cartSummaryMarkup() {
  const tot = totals();
  return `${offerSpendMarkup()}<div><span>${cartCopy("Items total (VAT included)", "إجمالي الأصناف (شامل الضريبة)")}</span><span>${money(tot.regularItemsTotal)}</span></div>
    ${tot.offerSavings ? `<div class="offer-saving"><span>${cartCopy("Offer savings", "توفير العروض")}</span><span>− ${money(tot.offerSavings)}</span></div>` : ""}
    ${tot.discount ? `<div><span>${t("coupon")}</span><span>− ${money(tot.discount)}</span></div>` : ""}
    ${state.orderType === "delivery" ? `<div><span>${t("deliveryFee")}</span><span>${money(tot.delivery)}</span></div>` : ""}
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
      basePrice: roundMoney(item.basePrice + normalized.extraPrice),
      price: roundMoney(item.price + normalized.extraPrice),
      image: item.image,
      qty,
      size,
      choice,
      spice,
      extras,
    });
  toast(t("added"));
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
      <img src="assets/images/meerath-logo.png" alt="Meerath Kabab" />
      <div><strong>${RESTAURANT.name}</strong><span>Olaya, Riyadh</span></div>
    </div>
    ${items.map(([id, icon, key]) =>
      `<button class="${active === id ? "active" : ""}" onclick="go('${id}')">
        ${icon}<span class="nav-label">${t(key)}</span>
      </button>`).join("")}
  </nav>`;
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
  src="assets/images/meerath-logo.png"
  alt="Meerath Kabab & Roll"
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
function setHomeOrderType(type, button) {
  state.orderType = type;
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

  if (location) {
    if (type === "delivery") {
      location.innerHTML =
        `Deliver to <strong>Askaan & nearby</strong>`;
    } else if (type === "takeaway") {
      location.innerHTML =
        `Pickup from <strong>Meerath Kabab · Olaya</strong>`;
    } else {
      location.innerHTML =
        `Dining at <strong>Meerath Kabab · Olaya</strong>`;
    }
  }

  if (note) {
    if (type === "delivery") {
      note.style.display = "";
      note.textContent =
      note.textContent = `✓ ${t("deliveryScope")}`;
    } else {
      note.style.display = "none";
    }
  }
}

function home() {
  const specials = ITEMS.filter((i) => i.special && i.available);
  return `
    <section class="screen home-screen">
      <div class="topbar home-topbar">

  <div class="home-brand-location">

    <img
      class="home-brand-logo"
      src="assets/images/meerath-logo.png"
      alt="Meerath"
    />

    <div class="loc" id="homeOrderLocation">
      ${
        state.orderType === "delivery"
          ? `Deliver to <strong>Askaan & nearby</strong>`
          : state.orderType === "takeaway"
          ? `Pickup from <strong>Meerath Kabab · Olaya</strong>`
          : `Dining at <strong>Meerath Kabab · Olaya</strong>`
      }
    </div>

  </div>

  <div class="top-actions">
  ${langSwitch()}
  ${cartButton()}
</div>

</div>
      <div class="home-search-wrap">

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

  <button class="${state.orderType === "delivery" ? "on" : ""}" onclick="setHomeOrderType('delivery', this)">${t("delivery")}</button>
</div>

<div
  id="homeOrderNote"
  class="mode-note"
  style="${state.orderType === "delivery" ? "" : "display:none"}"
>
  ✓ ${t("deliveryScope")}
</div>
      ${homeBannersMarkup()}
      <div class="h-row"><h3>${t("todaysSpecial")}</h3><button class="link" onclick="go('menu')">${t("seeAll")}</button></div>
      <div class="scroll">
        ${!specials.length && menuReady() ? `<p class="menu-hint">${menuText("noSpecials")}</p>` : ""}
        ${specials
          .map(
            (i) => `
          <article class="special-card" onclick="openItem('${i.id}')">
            <img src="${i.image}" alt="${loc(i, "name")}" />
            <div>
              ${i.offer ? `<span class="badge">${offerLabel(i.offer)}</span>` : ""}
              <h4>${loc(i, "name")}</h4>
              <p class="price">${itemPriceMarkup(i)}</p>
            </div>
          </article>`
          )
          .join("")}
      </div>
      <div class="h-row"><h3>${t("categories")}</h3></div>
      <div class="grid">
        ${CATEGORIES
          .map(
            (c) =>
              `<button class="cat cat-photo" onclick="go('listing',{categoryId:'${c.id}'})">
  <img src="${c.image}" alt="${loc(c, "name")}" />
  <span class="cat-label">${loc(c, "name")}</span>
</button>`
          )
          .join("")}
      </div>
    </section>
    ${nav("home")}`;
}

function menu() {
  return `
    <section class="screen menu-screen">
      <div class="topbar">
  <h2>${t("menu")}</h2>
  ${back("home")}
</div>
      <div class="grid">
        ${CATEGORIES.map(
          (c) =>
            `<button class="cat cat-photo" onclick="go('listing',{categoryId:'${c.id}'})"><img src="${c.image}" alt="${loc(c, "name")}" />${loc(c, "name")}</button>`
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
        <button class="${!state.subcategoryId ? "on" : ""}" onclick="state.subcategoryId='';render()">${menuText("all")}</button>
        ${subs.map(s => `<button class="${state.subcategoryId === s.id ? "on" : ""}" onclick="state.subcategoryId='${s.id}';render()">${loc(s,"name")}</button>`).join("")}
      </div>` : ""}
      ${!items.length && menuReady() ? `<p class="menu-hint">${menuText("noItems")}</p>` : ""}
      <div class="menu-items-grid">
      ${items.map(i => `
        <article class="item ${canOrderItem(i) ? "" : "menu-unavailable"}">
          <img src="${i.image}" alt="${loc(i, "name")}" onclick="openItem('${i.id}')" />
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
        ${back(editing ? "cart" : "listing")}
        ${cartButton()}
      </div>
      ${i.offer ? `<span class="badge">${offerLabel(i.offer)}</span>` : ""}
      <h2>${dish}</h2>
      <div class="stars">${t("kitchen")}</div>
      <p style="color:var(--muted);font-size:14px">${loc(i, "desc")}</p>
      <p class="price" style="margin:12px 0;font-size:20px">${itemPriceMarkup(i)}</p>
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
  renderKeepScroll();
}
function cart() {
  if (!state.cart.length) {
    return `<section class="screen cart-screen">
      <div class="topbar">${back("home")}<h2>${t("yourCart")}</h2>${langSwitch()}</div>
      <div class="empty">${t("cartEmpty")}<br><button class="link" onclick="go('menu')">${t("browseTheMenu")}</button></div>
    </section>${nav("home")}`;
  }
  return `<section class="screen cart-screen">
    <div class="topbar">${back("home")}<h2>${t("yourCart")}</h2>${langSwitch()}</div>
    ${state.cart.map((l,idx) => {
      const item = itemById(l.id), name = item ? loc(item,"name") : "";
      const saved = roundMoney(Math.max(0, (l.basePrice ?? item?.basePrice ?? l.price) - l.price) * l.qty);
      return `<div class="cart-line cart-editable" onclick="cartRowClick(event,${idx})">
        <button class="cart-image-link" onclick="openCartItem(${idx})" aria-label="${cartCopy("Edit", "تعديل")} ${name}">
          <img src="${l.image}" alt="" />
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
    <input class="field" placeholder="${t("coupon")}" value="${escapeHtml(state.coupon)}" oninput="state.coupon=this.value" />
    <button class="link" onclick="applyCoupon()">${t("applyCoupon")}</button>
    <div class="breakdown" id="cartBreakdown" style="margin-top:14px">${cartSummaryMarkup()}</div>
    <button class="btn btn-primary" style="margin-top:16px" onclick="go('checkout')">${t("proceed")}</button>
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
  state.orderTiming = "asap";

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
          ${t("location")}<br>
          ${t("addressLine")}
        </p>
      `;
    } else if (type === "takeaway") {
      locationCard.innerHTML = `
        <h4>${t("pickupFrom")}</h4>

        <p>
          Meerath Kabab · Olaya<br>
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
          Meerath Kabab · Olaya<br>
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
}

function checkout() {
  const timingOptions = checkoutTimingOptions();
  const acceptingOrders = restaurantAcceptingOrders();

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

      <input
        class="field"
        placeholder="${t("name")}"
        value="${state.customer.name}"
        oninput="state.customer.name=this.value"
      />

      <input
        class="field"
        placeholder="${t("mobile")}"
        value="${state.customer.mobile}"
        oninput="state.customer.mobile=this.value"
      />

      <input
        class="field"
        placeholder="${t("email")}"
        value="${state.customer.email}"
        oninput="state.customer.email=this.value"
      />

      <h3 class="checkout-section-title">
        ${t("orderType")}
      </h3>

      <div class="checkout-order-types">

        <button
          class="${state.orderType === "delivery" ? "active" : ""}"
          onclick="setCheckoutOrderType('delivery', this)"
        >
          ${t("delivery")}
        </button>

        <button
          class="${state.orderType === "takeaway" ? "active" : ""}"
          onclick="setCheckoutOrderType('takeaway', this)"
        >
          ${t("takeaway")}
        </button>

        <button
          class="${state.orderType === "dinein" ? "active" : ""}"
          onclick="setCheckoutOrderType('dinein', this)"
        >
          ${t("dineIn")}
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
                ${t("location")}<br>
                ${t("addressLine")}
              </p>
            </div>
          `
          : state.orderType === "takeaway"
          ? `
            <div class="checkout-location-card">
              <h4>${t("pickupFrom")}</h4>

              <p>
                Meerath Kabab · Olaya<br>
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
                Meerath Kabab · Olaya<br>
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

      ${acceptingOrders ? "" : `
        <div class="restaurant-closed-notice" role="alert" aria-live="assertive">
          <span class="restaurant-closed-icon" aria-hidden="true">!</span>
          <div>
            <strong>${cartCopy("Restaurant is currently closed", "المطعم مغلق حالياً")}</strong>
            <p>${restaurantClosedMessage()}</p>
          </div>
        </div>
      `}

      <div class="breakdown checkout-total-card">${cartSummaryMarkup()}</div>

      <button
        class="btn btn-primary checkout-place-order"
        onclick="placeOrder()"
        ${acceptingOrders ? "" : "disabled aria-disabled=\"true\""}
      >
        ${acceptingOrders ? t("placeOrder") : cartCopy("Ordering is closed", "الطلبات مغلقة")}
      </button>

    </section>`;
}

function confirmation() {
  const o = state.order;

  if (!o) return "";

  const type = o.orderType || state.orderType;

  if (o.status === "rejected") {
    return `<section class="screen confirmation-screen"><div class="success">
      <img class="confirmation-brand-logo" src="assets/images/meerath-logo.png" alt="Meerath" />
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
            src="assets/images/meerath-logo.png"
            alt="Meerath"
          />

          <h2>${t("orderReceived")}</h2>

          <p class="confirmation-message">
            ${t("awaitingConfirmationMsg")}
          </p>

          <span class="confirmation-type">
            ${t(typeKey)}
          </span>

          <p class="confirmation-order">
            ${t("order")}
            <strong>${o.id}</strong>
          </p>

          <div class="pending-confirmation-badge">
            ${t("awaitingConfirmation")}
          </div>

          <p class="confirmation-time-note">
            ${t("confirmationTimeNote")}
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

  /* AFTER RESTAURANT ACCEPTS */
  return `
    <section class="screen confirmation-screen">

      <div class="success">

        <img
          class="confirmation-brand-logo"
          src="assets/images/meerath-logo.png"
          alt="Meerath"
        />

        <div class="check">✓</div>

        <h2>${t("thankYou")}</h2>

        <p class="confirmation-message">
          ${t("confirmedMsg")}
        </p>

        <span class="confirmation-type">
          ${t(typeKey)}
        </span>

        <p class="confirmation-order">
          ${t("order")}
          <strong>${o.id}</strong>
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

                    </div>

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
                              <strong>#${order.id}</strong>
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
                              ${(order.items || []).reduce(
                                (sum, item) => sum + item.qty,
                                0
                              )} ${t("items")}
                            </span>
                  
                            ${
                              order.total
                                ? `<strong>${money(order.total)}</strong>`
                                : ""
                            }
                  
                          </div>
                  
                          <button
                            class="history-reorder-btn"
                            onclick="reorderFromHistory('${order.id}')"
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
function startOtp() {
  const raw = state.loginMobile.replace(/\D/g, "");
  const mobile = raw.startsWith("0") ? raw.slice(1) : raw;

  if (!/^5\d{8}$/.test(mobile)) {
    toast(t("invalidMobile"));
    return;
  }

  state.otpCode = "";
  go("otpPage");
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

      <button
        class="btn btn-primary signin-continue"
        onclick="startOtp()"
      >
        ${t("continue")}
      </button>

      <p class="signin-terms">
        ${t("termsNote")}
      </p>

    </section>

    </section>`;
}

function verifyOtp() {
  if (!/^\d{4}$/.test(state.otpCode)) {
    toast(t("invalidOtp"));
    return;
  }

  // Guest checkout OTP
  if (state.otpPurpose === "guestOrder") {
    state.otpPurpose = "login";
    createOrderAfterVerification();
    return;
  }

  // Sign in / Create account OTP
  go("profileSetupPage");
}

function otpPage() {
  const raw = state.loginMobile.replace(/\D/g, "");
  const mobile = raw.startsWith("0") ? raw.slice(1) : raw;

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
        <strong dir="ltr">+966 ${mobile}</strong>

        <button class="otp-change-number" onclick="go(otpBackScreen)">
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
        maxlength="4"
        autocomplete="one-time-code"
        placeholder="••••"
        value="${state.otpCode}"
        oninput="state.otpCode=this.value.replace(/[^0-9]/g,'').slice(0,4)"
      />

      <button
        class="btn btn-primary otp-verify-btn"
        onclick="verifyOtp()"
      >
        ${t("verifyContinue")}
      </button>

      <div class="otp-resend">
        <span>${t("didntReceiveCode")}</span>
        <button onclick="toast(t('resendCode'))">
          ${t("resendCode")}
        </button>
      </div>

    </section>`;
}

function completeProfile() {
  const name = state.customerName.trim();

  if (!name) {
    toast(t("nameRequired"));
    return;
  }

  const raw = state.loginMobile.replace(/\D/g, "");
  const mobile = raw.startsWith("0") ? raw.slice(1) : raw;

  state.customerName = name;
  state.customerEmail = state.customerEmail.trim();
  state.customerPhone = `+966 ${mobile}`;

  // Keep old customer object synced too
  state.customer = {
    name: state.customerName,
    mobile: state.customerPhone,
    email: state.customerEmail,
  };

  state.isLoggedIn = true;

  go("account");
}

function profileSetupPage() {
  return `
    <section class="screen profile-setup-screen">

      <div class="topbar profile-setup-topbar">
        ${back("otpPage")}
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
      >
        ${t("saveContinue")}
      </button>

    </section>`;
}



function savedAddressesPage() {
  return `
    <section class="screen saved-addresses-screen">

      <div class="topbar saved-addresses-topbar">
        ${back("account")}
        <h2>${t("savedAddresses")}</h2>
        ${langSwitch()}
      </div>

      ${
        state.savedAddresses.length === 0
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
                        <strong>${t(address.type)}</strong>

                        ${
                          isDefault
                            ? `<span class="default-address-badge">${t("defaultAddress")}</span>`
                            : ""
                        }
                      </div>

                      <span>
                        ${address.area}, ${address.street}
                      </span>

                      <small>
                        ${t("buildingNumber")}: ${address.building}
                        ${address.unit ? ` · ${address.unit}` : ""}
                      </small>

                      <div class="saved-address-actions">

                        ${
                          !isDefault
                            ? `
                              <button onclick="setDefaultAddress(${address.id})">
                                ${t("setDefault")}
                              </button>
                            `
                            : ""
                        }

                        <button onclick="editAddress(${address.id})">
                          ${t("edit")}
                        </button>

                        <button
                          class="address-delete-btn"
                          onclick="deleteAddress(${address.id})"
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
      >
        + ${t("addNewAddress")}
      </button>

    </section>`;
}

function saveAddress() {
  const area = state.addressArea.trim();
  const street = state.addressStreet.trim();
  const building = state.addressBuilding.trim();

  if (!area || !street || !building) {
    toast(t("addressRequired"));
    return;
  }

  const addressData = {
    type: state.addressType,
    area,
    street,
    building,
    unit: state.addressUnit.trim(),
    directions: state.addressDirections.trim(),
  };

  if (state.editingAddressId) {
    state.savedAddresses = state.savedAddresses.map((address) =>
      address.id === state.editingAddressId
        ? { ...address, ...addressData }
        : address
    );

    toast(t("addressUpdated"));
  } else {
    const newAddress = {
      id: Date.now(),
      ...addressData,
    };

    state.savedAddresses.push(newAddress);

    if (!state.defaultAddressId) {
      state.defaultAddressId = newAddress.id;
    }

    toast(t("addressSaved"));
  }

  state.editingAddressId = null;
  state.addressType = "home";
  state.addressArea = "";
  state.addressStreet = "";
  state.addressBuilding = "";
  state.addressUnit = "";
  state.addressDirections = "";

  go("savedAddressesPage");
}
function startAddAddress() {
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

  state.editingAddressId = id;
  state.addressType = address.type;
  state.addressArea = address.area;
  state.addressStreet = address.street;
  state.addressBuilding = address.building;
  state.addressUnit = address.unit || "";
  state.addressDirections = address.directions || "";

  go("addAddressPage");
}

function deleteAddress(id) {
  state.savedAddresses = state.savedAddresses.filter(
    (address) => address.id !== id
  );

  if (state.defaultAddressId === id) {
    state.defaultAddressId =
      state.savedAddresses.length > 0
        ? state.savedAddresses[0].id
        : null;
  }

  render();
  toast(t("addressDeleted"));
}

function setDefaultAddress(id) {
  state.defaultAddressId = id;
  render();
  toast(t("defaultAddressSet"));
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
          onclick="state.addressType='home'; render()"
        >
          ${t("home")}
        </button>

        <button
          class="${state.addressType === "work" ? "active" : ""}"
          onclick="state.addressType='work'; render()"
        >
          ${t("work")}
        </button>

        <button
          class="${state.addressType === "other" ? "active" : ""}"
          onclick="state.addressType='other'; render()"
        >
          ${t("other")}
        </button>

      </div>

      <label class="address-form-label">${t("areaDistrict")}</label>
      <input
        class="field"
        type="text"
        placeholder="${t("areaPlaceholder")}"
        value="${state.addressArea}"
        oninput="state.addressArea=this.value"
      />

      <label class="address-form-label">${t("street")}</label>
      <input
        class="field"
        type="text"
        placeholder="${t("streetPlaceholder")}"
        value="${state.addressStreet}"
        oninput="state.addressStreet=this.value"
      />

      <label class="address-form-label">${t("buildingNumber")}</label>
      <input
        class="field"
        type="text"
        placeholder="${t("buildingPlaceholder")}"
        value="${state.addressBuilding}"
        oninput="state.addressBuilding=this.value"
      />

      <label class="address-form-label">${t("unitOptional")}</label>
      <input
        class="field"
        type="text"
        placeholder="${t("unitPlaceholder")}"
        value="${state.addressUnit}"
        oninput="state.addressUnit=this.value"
      />

      <label class="address-form-label">${t("directionsOptional")}</label>
      <textarea
        class="field"
        rows="3"
        placeholder="${t("directionsPlaceholder")}"
        oninput="state.addressDirections=this.value"
      >${state.addressDirections}</textarea>

      <button
        class="btn btn-primary save-address-btn"
        onclick="saveAddress()"
      >
      ${state.editingAddressId ? t("updateAddress") : t("saveAddress")}
      </button>

    </section>`;
}

function signedInAccount() {
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
          <h3>${state.customerName}</h3>
          <p dir="ltr">${state.customerPhone}</p>
          ${
            state.customerEmail
              ? `<small>${state.customerEmail}</small>`
              : ""
          }
        </div>

        <button class="signed-edit-btn" onclick="go('profileSetupPage')">
          ${t("editProfile")}
        </button>

      </div>

      <div class="account-section-title">
        ${t("meerathRewards")}
      </div>

      <div class="signed-rewards-card">

        <div class="signed-reward-stat">
          <strong>${state.points || 0}</strong>
          <span>${t("points")}</span>
        </div>

        <div class="signed-reward-divider"></div>

        <div class="signed-reward-stat">
          <strong>${state.stamps || 0}</strong>
          <span>${t("stamps")}</span>
        </div>

        <div class="signed-reward-divider"></div>

        <div class="signed-reward-stat">
          <strong>${state.rewardVouchers || 0}</strong>
          <span>${t("vouchers")}</span>
        </div>

      </div>

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
        onclick="state.isLoggedIn=false; go('account')"
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
          <h3>${t("welcomeMeerath")}</h3>
          <p>${t("accountGuestSub")}</p>
        </div>

        <button
          class="btn btn-primary account-signin-btn"
          onclick="go('signInPage')"
        >
          ${t("signInCreate")}
        </button>

      </div>

      <div class="account-section-title">
        ${t("meerathRewards")}
      </div>

      <button
        class="account-rewards-card"
        onclick="toast(t('signInRequired'))"
      >
        <div class="account-reward-icon">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3l2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3z"></path>
          </svg>
        </div>

        <div class="account-reward-copy">
          <strong>${t("meerathRewards")}</strong>
          <span>${t("rewardsGuestSub")}</span>
          <small>${t("signInToViewRewards")}</small>
        </div>

        <span class="account-arrow">›</span>
      </button>

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
  applyDir();
  const map = {
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
  $app().innerHTML = (map[state.screen] || home)();
  if (["home","menu","listing","detail","cart","checkout","offers"].includes(state.screen)) {
    const screen = $app().querySelector(".screen");
    if (screen) screen.insertAdjacentHTML("afterbegin", menuStatusMarkup());
  }
  $app().style.paddingBottom =
    state.screen === "splash" ||
    state.screen === "detail" ||
    state.screen === "cart" ||
    state.screen === "checkout" ||
    state.screen === "confirmation"
      ? "20px"
      : "";
}

function openItem(id) {
  state.cartEditKey = null;
  const item = itemById(id);
  if (!item) { toast(menuText("unavailableItem")); return; }
  if (state.categoryId !== item.category) state.subcategoryId = "";
  state.categoryId = item.category;
  state.itemId = id;
  state.choice = null;
  prepareChoices(item, {size:"regular", choice:null, extras:[]});
  state.spice = "medium";
  go("detail");
}
function renderKeepScroll() {
  const currentScreen = document.querySelector("#app > .screen");
  const currentScroll = currentScreen ? currentScreen.scrollTop : 0;

  render();

  requestAnimationFrame(() => {
    const newScreen = document.querySelector("#app > .screen");

    if (newScreen) {
      newScreen.scrollTop = currentScroll;
    }
  });
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
  renderKeepScroll();
}
function selectVariant(id) {
  if (!enabledChoices(itemById(state.itemId), "Variant").some(x => x.id === id)) return;
  state.size = id;
  renderKeepScroll();
}
function selectChoice(id) {
  if (!enabledChoices(itemById(state.itemId), "Option").some(x => x.id === id)) return;
  state.choice = id;
  renderKeepScroll();
}
function clearChoice() {
  if (enabledChoices(itemById(state.itemId), "Option").some(x => x.required)) return;
  state.choice = null;
  renderKeepScroll();
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
    line.basePrice = roundMoney(item.basePrice + normalized.extraPrice);
    const match = state.cart.find(l => l.cartKey !== line.cartKey && l.id === line.id &&
      l.spice === line.spice && l.size === line.size && l.choice === line.choice &&
      l.extras.join() === line.extras.join());
    if (match) { match.qty += line.qty; state.cart.splice(index,1); }
    reconcileMenuCart();
    go("cart");
    return;
  }
  if (addToCart(itemById(state.itemId))) go("cart");
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
  addToCart(item);
  
}

function updateCartBreakdown() {
  const box = document.getElementById("cartBreakdown");
  if (box) box.innerHTML = cartSummaryMarkup();
}
function chgQty(idx, d, button) {
  const line = state.cart[idx];
  if (!line || (d !== 1 && d !== -1)) return;
  const item = itemById(line.id);
  if (d > 0 && !canOrderItem(item)) return toast(menuText("unavailableItem"));
  if (d > 0 && !canAddItem(item)) return toast(limitMessage(item));
  line.qty += d;
  if (line.qty <= 0) state.cart.splice(idx,1);
  // Rebuild handlers after removal so old indices cannot change the wrong item.
  renderKeepScroll();
}

function applyCoupon() {
  if (state.cart.some(l => itemById(l.id)?.offer)) {
    state.couponOn = false;
    toast(state.lang === "ar" ? "لا يمكن جمع الكوبون مع عروض الأصناف." : "Coupons cannot be combined with item offers.");
    render();
    return;
  }
  state.couponOn = state.coupon.trim().toUpperCase() === "MEERATH10";
  toast(state.couponOn ? t("couponOk") : t("couponBad"));
  render();
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
  if (!restaurantAcceptingOrders()) {
    render();
    return toast(restaurantClosedMessage(), 7000);
  }
  if (!(await validateMenuCart())) return;
  if (!checkOfferCartRules()) return;
  if (!state.cart.length) {
    return toast(t("cartIsEmpty"));
  }

  if (!state.customer.name || !state.customer.mobile) {
    return toast(t("addNameMobile"));
  }

  // Signed-in verified customer = no OTP again
  if (state.isLoggedIn) {
    createOrderAfterVerification();
    return;
  }

  // Guest customer = mobile OTP required
  const raw = state.customer.mobile.replace(/\D/g, "");
  const mobile = raw.startsWith("0") ? raw.slice(1) : raw;

  if (!/^5\d{8}$/.test(mobile)) {
    toast(t("invalidMobile"));
    return;
  }

  state.loginMobile = state.customer.mobile;
  state.otpCode = "";
  state.otpPurpose = "guestOrder";

  go("otpPage");
}
async function createOrderAfterVerification() {
  if (!(await validateMenuCart())) return;
  if (!checkOfferCartRules()) return;
  if (state.orderSubmitting) return;
  state.orderSubmitting = true;
  const cart = state.cart.map((line) => ({ ...line, extras:[...(line.extras || [])] }));
  const suggestedEta = calculateSuggestedEta(state.orderType, cart);
  const defaultAddress = state.savedAddresses.find(row => row.id === state.defaultAddressId);
  const address = state.orderType === "delivery" && defaultAddress
    ? [defaultAddress.area, defaultAddress.street, defaultAddress.building, defaultAddress.unit, defaultAddress.directions].filter(Boolean).join(", ")
    : "";
  const clientOrderId = crypto.randomUUID();
  try {
    const result = await submitCustomerOrder({
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
      coupon_code: state.couponOn ? state.coupon.trim().toUpperCase() : "",
      address,
      items: cart.map(line => {
        const item = itemById(line.id);
        return {
          menu_item_id: line.id,
          quantity: line.qty,
          notes: line.notes || "",
          choices: selectedChoices(item, line).map(choice => ({
            name: choice.name,
            type: choice.type,
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
      status: result.status,
      suggestedEta,
      confirmedEta: null,
      scheduleType: state.orderTiming === "asap" ? "asap" : "scheduled",
      orderTiming: state.orderTiming,
      scheduledFor: getScheduledFor(),
      total: Number(result.total),
      createdAt: Date.parse(result.created_at),
      step: 0,
    };
    state.cart = [];
    state.couponOn = false;
    saveTrackedCustomerOrder();
    go("confirmation");
    refreshTrackedCustomerOrder();
  } catch (error) {
    const rawMessage = String(error?.message || "");
    if (/outside its available time/i.test(rawMessage)) {
      const message = restaurantAcceptingOrders()
        ? unavailableTimeMessage()
        : restaurantClosedMessage();
      go("checkout");
      setTimeout(() => toast(message, 7000));
    } else {
      toast(rawMessage || cartCopy("Could not place order. Try again.", "تعذر إرسال الطلب. حاول مرة أخرى."), 5000);
    }
  } finally {
    state.orderSubmitting = false;
  }
}

function redeem(cost) {
  if (state.points < cost) return toast(t("notEnough"));
  state.points -= cost;
  toast(t("voucherOk"));
  render();
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
window.placeOrder = placeOrder;
window.createOrderAfterVerification = createOrderAfterVerification;
window.redeem = redeem;
window.setLang = setLang;
window.t = t;
window.state = state;
window.render = render;
window.openSupportWhatsApp = openSupportWhatsApp;
window.startOtp = startOtp;
window.verifyOtp = verifyOtp;
window.completeProfile = completeProfile;
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
render();

startMenuSync();
startCustomerOrderSync();
