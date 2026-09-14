/*
 * Customer App brand/tenant configuration.
 *
 * This is the only customer-app file that should need brand-specific values
 * for a dedicated build. The future Oracy Super Admin can publish the same
 * validated shape; native app identifiers/icons still belong to each build.
 */
const APP_CONFIG = Object.freeze({
  schemaVersion: 1,
  tenant: Object.freeze({
    slug: "meerath-kabab",
    restaurantId: "11111111-1111-1111-1111-111111111111",
  }),
  brand: Object.freeze({
    name: "Meerath Kabab",
    nameAr: "ميراث كباب",
    shortName: "Meerath",
    shortNameAr: "ميراث",
    appTitle: "Meerath Kabab",
    description: "Order authentic Pakistani food from Meerath Kabab in Riyadh.",
    logo: "assets/images/meerath-logo.png",
    logoAlt: "Meerath Kabab & Roll",
    layoutPreset: "heritage",
    colors: Object.freeze({
      dark: Object.freeze({primary: "#f08a1a", primaryStrong: "#ff9f2e", accent: "#e0b15a"}),
      light: Object.freeze({primary: "#c76600", primaryStrong: "#e87908", accent: "#8a5b0a"}),
    }),
  }),
  branch: Object.freeze({
    preferredId: "",
    name: "Olaya",
    nameAr: "العليا",
    city: "Riyadh",
    cityAr: "الرياض",
    deliveryArea: "Askaan & nearby",
    deliveryAreaAr: "إسكان والمناطق القريبة",
  }),
  contact: Object.freeze({
    phoneDisplay: "0561663119",
    phone: "+966561663119",
    whatsapp: "966561663119",
    address: "Olaya Street, Riyadh, Saudi Arabia",
    addressAr: "شارع العليا، الرياض، المملكة العربية السعودية",
    maps: "https://maps.app.goo.gl/wQeq8SabZ1GfgKUN7",
  }),
  backend: Object.freeze({
    url: "https://skwburtcthxihpgqagmm.supabase.co",
    publicKey: "sb_publishable_6f7rQ5e2pJ_rdUoBxaInoA_wJW5KtHW",
    rpc: Object.freeze({
      menu: "meerath_customer_menu_v1",
      content: "meerath_customer_content_v1",
      announcements: "meerath_app_announcements_v1",
      websiteContent: "meerath_website_content_v1",
      catering: "submit_meerath_catering_enquiry_v2",
      createOrder: "oracy_create_customer_order_v1",
      trackOrder: "oracy_track_customer_order_v1",
    }),
  }),
  features: Object.freeze({
    ordering: true,
    offers: true,
    catering: true,
    mealDistribution: true,
    rewards: true,
    announcements: true,
    customerAccounts: true,
  }),
  operations: Object.freeze({
    timeZone: "Asia/Riyadh",
    testingAlwaysOpen: true,
    menuRefreshMs: 30000,
    menuMaxAgeMs: 90000,
  }),
});

function appStorageKey(name, version = 1) {
  return `oracy:${APP_CONFIG.tenant.slug}:${name}:v${version}`;
}

function readAppStorage(name, legacyKeys = [], version = 1) {
  const key = appStorageKey(name, version);
  try {
    const current = localStorage.getItem(key);
    if (current !== null) return current;
    for (const legacyKey of legacyKeys) {
      const legacy = localStorage.getItem(legacyKey);
      if (legacy !== null) {
        localStorage.setItem(key, legacy);
        return legacy;
      }
    }
  } catch (_) {}
  return null;
}

function featureEnabled(name) {
  return APP_CONFIG.features[name] === true;
}

function branchDisplayName(lang = "en") {
  const branch = lang === "ar" ? APP_CONFIG.branch.nameAr : APP_CONFIG.branch.name;
  const brand = lang === "ar" ? APP_CONFIG.brand.nameAr : APP_CONFIG.brand.name;
  return `${brand} · ${branch}`;
}

function brandShortName(lang = "en") {
  return lang === "ar" ? APP_CONFIG.brand.shortNameAr : APP_CONFIG.brand.shortName;
}

function applyBrandShell(theme = "dark") {
  if (typeof document === "undefined") return;
  const palette = APP_CONFIG.brand.colors[theme] || APP_CONFIG.brand.colors.dark;
  const root = document.documentElement;
  root.style.setProperty("--brand-primary", palette.primary);
  root.style.setProperty("--brand-primary-strong", palette.primaryStrong);
  root.style.setProperty("--brand-accent", palette.accent);
  root.style.setProperty("--orange", palette.primary);
  root.style.setProperty("--orange-2", palette.primaryStrong);
  root.style.setProperty("--gold", palette.accent);
  root.dataset.brand = APP_CONFIG.tenant.slug;
  root.dataset.layout = APP_CONFIG.brand.layoutPreset;
  document.title = APP_CONFIG.brand.appTitle;
  const description = document.querySelector('meta[name="description"]');
  if (description) description.content = APP_CONFIG.brand.description;
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.content = theme === "light" ? "#f6f6f4" : "#070707";
}
