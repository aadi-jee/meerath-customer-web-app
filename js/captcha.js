/* Gate 4: Cloudflare Turnstile for phone sign-in (SMS pumping protection).
 *
 * Dormant until APP_CONFIG.backend.captchaSiteKey is set. With a key, the
 * Turnstile script is loaded on demand, a widget is rendered into the
 * #captchaBox of the sign-in / code page, and every /otp and /verify call
 * carries a fresh token (gotrue_meta_security.captcha_token). Supabase Auth
 * checks the token itself once "CAPTCHA protection" is switched on in the
 * dashboard; while it is off the field is ignored, so the app can ship first.
 * A token is single-use: each request asks for a new one.
 */
const captcha = {
  siteKey: "",
  scriptPromise: null,
  widgetId: null,
  token: null,          // an unused token from the last challenge
  waiting: [],          // callers waiting for a token
  running: false,       // a challenge is in progress (just rendered or reset)
  lastError: "",
};

function captchaConfigured() {
  const key = typeof APP_CONFIG !== "undefined" ? String(APP_CONFIG.backend?.captchaSiteKey || "") : "";
  captcha.siteKey = key.trim();
  return captcha.siteKey.length > 0;
}

/* Markup for the page: an empty box the widget is rendered into. */
function captchaBox() {
  return captchaConfigured() ? `<div id="captchaBox" class="captcha-box" aria-live="polite"></div>` : "";
}

function captchaLoadScript() {
  if (captcha.scriptPromise) return captcha.scriptPromise;
  captcha.scriptPromise = new Promise((resolve, reject) => {
    if (typeof window === "undefined" || typeof document === "undefined") return reject(new Error("no document"));
    if (window.turnstile) return resolve(window.turnstile);
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => window.turnstile ? resolve(window.turnstile) : reject(new Error("captcha unavailable"));
    s.onerror = () => reject(new Error("captcha unavailable"));
    document.head.appendChild(s);
  }).catch(error => { captcha.scriptPromise = null; throw error; });
  return captcha.scriptPromise;
}

function captchaSettle(token, error) {
  captcha.running = false;
  const waiting = captcha.waiting.splice(0);
  if (token) {
    if (waiting.length) { waiting.shift().resolve(token); captcha.token = null; }
    else captcha.token = token;
    for (const w of waiting) w.reject(new Error("captcha token used"));
  } else {
    captcha.lastError = error || "captcha failed";
    for (const w of waiting) w.reject(new Error(captcha.lastError));
  }
}

/* Renders (once) into the current #captchaBox, or re-renders when the page
 * was re-drawn and the old container is gone. */
async function captchaMount() {
  const turnstile = await captchaLoadScript();
  let box = document.getElementById("captchaBox");
  // A page with its own box takes over from the floating one.
  if (box && !box.classList?.contains("captcha-floating")) {
    for (const stray of document.querySelectorAll ? document.querySelectorAll(".captcha-floating") : []) {
      if (stray !== box) { if (captcha.widgetId !== null && stray.childElementCount) { try { turnstile.remove(captcha.widgetId); } catch (_) {} captcha.widgetId = null; captcha.token = null; } stray.remove(); }
    }
  }
  if (!box) {
    // Sign-in started from another page (checkout): a floating box at the
    // bottom carries a visible challenge when Turnstile needs one.
    box = document.createElement("div");
    box.id = "captchaBox";
    box.className = "captcha-box captcha-floating";
    document.body.appendChild(box);
  }
  if (captcha.widgetId !== null && box.childElementCount) return turnstile;
  if (captcha.widgetId !== null) { try { turnstile.remove(captcha.widgetId); } catch (_) {} captcha.widgetId = null; captcha.token = null; }
  captcha.widgetId = turnstile.render(box, {
    sitekey: captcha.siteKey,
    appearance: "interaction-only",
    language: typeof state !== "undefined" && state.lang === "ar" ? "ar" : "en",
    callback: token => captchaSettle(token, null),
    "error-callback": () => captchaSettle(null, "captcha failed"),
    "expired-callback": () => { captcha.token = null; },
    "timeout-callback": () => captchaSettle(null, "captcha timed out"),
  });
  captcha.running = true;   // Turnstile runs the first challenge on render
  return turnstile;
}

/* A fresh single-use token, or null when no site key is configured.
 * Throws when the challenge cannot be completed (the caller shows a message). */
async function captchaToken() {
  if (!captchaConfigured()) return null;
  const turnstile = await captchaMount();
  if (captcha.token) { const t = captcha.token; captcha.token = null; return t; }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const i = captcha.waiting.indexOf(entry);
      if (i >= 0) captcha.waiting.splice(i, 1);
      if (!captcha.waiting.length) captcha.running = false;   // the next call may reset the widget
      reject(new Error("captcha timed out"));
    }, 60000);
    const entry = {
      resolve: t => { clearTimeout(timer); resolve(t); },
      reject: e => { clearTimeout(timer); reject(e); },
    };
    captcha.waiting.push(entry);
    if (!captcha.running) {
      captcha.running = true;
      try { turnstile.reset(captcha.widgetId); } catch (_) {}
    }
  });
}

/* The field Supabase Auth reads. Empty when no captcha is configured. */
async function captchaAuthFields() {
  const token = await captchaToken();
  return token ? {gotrue_meta_security: {captcha_token: token}} : {};
}

if (typeof window !== "undefined") {
  window.captchaBox = captchaBox;
  window.captchaToken = captchaToken;
  window.captchaAuthFields = captchaAuthFields;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = {captcha, captchaConfigured, captchaBox, captchaToken, captchaAuthFields, captchaSettle};
}
