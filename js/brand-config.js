/*
 * Customer App brand/tenant configuration.
 *
 * This is the only customer-app file that should need brand-specific values
 * for a dedicated build. The future Oracy Super Admin can publish the same
 * validated shape; native app identifiers/icons still belong to each build.
 */
const APP_CONFIG = Object.freeze({
  schemaVersion: 1,
  maps: Object.freeze({
    // Paste the HTTP-referrer-restricted Web key locally before testing.
    // Never put the Routes key in this browser file.
    browserKey: "AIzaSyBrTPosOs4TTrwR887l8RlUffiu7D2IVhg",
    mapId: "6548a17d5d643367bdb8c58f",
    restaurant: Object.freeze({
      latitude: 24.676036401969355,
      longitude: 46.697863299188526,
    }),
  }),
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
    // CX-1: a theme is a structure (screen layout) plus a style (look).
    // Unknown names fall back to classic + heritage.
    theme: Object.freeze({structure: "classic", style: "heritage"}),
    // CX-4: while true, Account > Appearance offers the other structures on THIS device only
    // (nothing changes for anyone else). Set to false before launch.
    themePreview: true,
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
    // Gate 4: Cloudflare Turnstile site key (public). Empty = no captcha.
    // Set it together with "CAPTCHA protection" in Supabase Auth (secret key
    // there) — the app must ship with the key BEFORE the setting goes on.
    captchaSiteKey: "",
    rpc: Object.freeze({
      menu: "meerath_customer_menu_v1",
      content: "meerath_customer_content_v1",
      announcements: "meerath_app_announcements_v1",
      websiteContent: "meerath_website_content_v1",
      catering: "submit_meerath_catering_enquiry_v2",
      createOrder: "oracy_create_customer_order_v1",
      trackOrder: "oracy_track_customer_order_v1",
      customerProfile: "oracy_customer_profile_v1",
      saveCustomerProfile: "oracy_save_customer_profile_v1",
    }),
  }),
  features: Object.freeze({
    ordering: true,
    offers: true,
    catering: true,
    mealDistribution: true,
    // Batch R (241): real points. Shown only when the restaurant has also
    // switched points on in the Admin (the server says so).
    rewards: true,
    announcements: true,
    customerAccounts: true,
  }),
  operations: Object.freeze({
    timeZone: "Asia/Riyadh",
    testingAlwaysOpen: true,
    menuRefreshMs: 30000,
    menuMaxAgeMs: 90000,
    otpResendSeconds: 60,
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

const THEME_STRUCTURES = Object.freeze(["classic", "scroll"]);
const THEME_STYLES = Object.freeze(["heritage"]);
/** The structure this device is previewing, or "" (only while brand.themePreview is on). */
function previewStructure() {
  if (!APP_CONFIG.brand || APP_CONFIG.brand.themePreview !== true) return "";
  const saved = readAppStorage("structure");
  return THEME_STRUCTURES.includes(saved) ? saved : "";
}
function brandTheme() {
  const chosen = (APP_CONFIG.brand && APP_CONFIG.brand.theme) || {};
  const preview = previewStructure();
  return {
    structure: preview || (THEME_STRUCTURES.includes(chosen.structure) ? chosen.structure : THEME_STRUCTURES[0]),
    style: THEME_STYLES.includes(chosen.style) ? chosen.style : THEME_STYLES[0],
  };
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
  const brandLook = brandTheme();
  root.dataset.structure = brandLook.structure;
  root.dataset.style = brandLook.style;
  document.title = APP_CONFIG.brand.appTitle;
  const description = document.querySelector('meta[name="description"]');
  if (description) description.content = APP_CONFIG.brand.description;
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.content = theme === "light" ? "#f6f6f4" : "#070707";
}
