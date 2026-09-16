/* Customer phone authentication. Public/publishable keys are safe in the app;
 * authorization is enforced by Supabase Auth, RLS and authenticated RPCs. */
let customerAuthSession = null;
let customerAuthRefresh = null;

function authCopy(en, ar) { return typeof state !== "undefined" && state.lang === "ar" ? ar : en; }

function normalizeSaudiMobile(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("00966")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `966${digits.slice(1)}`;
  else if (/^5\d{8}$/.test(digits)) digits = `966${digits}`;
  if (!/^9665\d{8}$/.test(digits)) return null;
  return `+${digits}`;
}

function authSessionKey() { return appStorageKey("auth-session"); }

function validAuthSession(value) {
  return value && typeof value === "object" && typeof value.access_token === "string" &&
    value.access_token.length > 20 && typeof value.refresh_token === "string" &&
    value.refresh_token.length > 0 && value.refresh_token.length <= 4096 &&
    Number.isFinite(Number(value.expires_at)) &&
    value.user && typeof value.user.id === "string" && isMenuId(value.user.id);
}

function saveAuthSession(session) {
  const normalized = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: Number(session.expires_at) || Math.floor(Date.now() / 1000) + Number(session.expires_in || 3600),
    user: {
      id: session.user.id,
      phone: normalizeSaudiMobile(session.user.phone) || String(session.user.phone || ""),
    },
  };
  if (!validAuthSession(normalized)) throw new Error("Invalid authentication session");
  customerAuthSession = normalized;
  localStorage.setItem(authSessionKey(), JSON.stringify(customerAuthSession));
  return customerAuthSession;
}

function clearAuthSession() {
  if (typeof resetAccountOrders === 'function') resetAccountOrders();
  if (typeof resetAccountAddresses === 'function') resetAccountAddresses();
  customerAuthSession = null;
  try { localStorage.removeItem(authSessionKey()); } catch (_) {}
  if (typeof state !== "undefined") {
    state.isLoggedIn = false;
    state.authUserId = "";
    state.customerName = "";
    state.customerPhone = "";
    state.customerEmail = "";
    state.customer = {name: "", mobile: "", email: ""};
  }
}

async function authHttp(path, {method = "POST", body, token} = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${MENU_CONFIG.url}/auth/v1/${path}`, {
      method,
      headers: {
        apikey: MENU_CONFIG.publicKey,
        "Content-Type": "application/json",
        ...(token ? {Authorization: `Bearer ${token}`} : {}),
      },
      ...(body === undefined ? {} : {body: JSON.stringify(body)}),
      credentials: "omit", cache: "no-store", signal: controller.signal,
    });
    let data = {};
    try { data = await response.json(); } catch (_) {}
    if (!response.ok) {
      const error = new Error(typeof data?.msg === "string" ? data.msg :
        typeof data?.message === "string" ? data.message : "Authentication request failed");
      error.status = response.status;
      error.code = data?.error_code || data?.code || "";
      throw error;
    }
    return data;
  } finally { clearTimeout(timer); }
}

function authMessage(error, action = "login") {
  if (error?.name === "AbortError") return authCopy(
    "The request timed out. Check your connection and try again.",
    "انتهت مهلة الطلب. تحقق من اتصالك وحاول مرة أخرى."
  );
  if (error?.status === 429) return authCopy(
    "Too many attempts. Please wait before trying again.",
    "محاولات كثيرة. يرجى الانتظار قبل المحاولة مرة أخرى."
  );
  if (action === "verify" || /otp|token.*expired|invalid/i.test(String(error?.message || ""))) return authCopy(
    "The verification code is incorrect or expired. Request a new code and try again.",
    "رمز التحقق غير صحيح أو منتهي الصلاحية. اطلب رمزاً جديداً وحاول مرة أخرى."
  );
  return authCopy(
    "We could not complete sign-in. Please try again.",
    "تعذر إكمال تسجيل الدخول. يرجى المحاولة مرة أخرى."
  );
}

async function requestPhoneOtp(phone) {
  return authHttp("otp", {body: {
    phone,
    create_user: true,
    data: {restaurant_id: APP_CONFIG.tenant.restaurantId, tenant_slug: APP_CONFIG.tenant.slug},
  }});
}

async function verifyPhoneOtp(phone, token) {
  const session = await authHttp("verify", {body: {phone, token, type: "sms"}});
  return saveAuthSession(session);
}

async function refreshCustomerSession() {
  if (!customerAuthSession?.refresh_token) return null;
  if (customerAuthRefresh) return customerAuthRefresh;
  customerAuthRefresh = authHttp("token?grant_type=refresh_token", {
    body: {refresh_token: customerAuthSession.refresh_token},
  }).then(saveAuthSession).catch(error => {
    // Invalid/revoked refresh tokens end the login. A temporary network error
    // must not erase a trusted-device session that can be retried later.
    if ([400, 401, 403].includes(error?.status)) clearAuthSession();
    throw error;
  }).finally(() => { customerAuthRefresh = null; });
  return customerAuthRefresh;
}

async function activeAccessToken() {
  if (!customerAuthSession) return null;
  if (customerAuthSession.expires_at <= Math.floor(Date.now() / 1000) + 60) {
    await refreshCustomerSession();
  }
  return customerAuthSession?.access_token || null;
}

async function customerAuthRpc(name, params, retry = true) {
  const token = await activeAccessToken();
  if (!token) throw new Error("Authentication required");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  let response;
  try {
    response = await fetch(`${MENU_CONFIG.url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {apikey: MENU_CONFIG.publicKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json"},
      body: JSON.stringify(params), credentials: "omit", cache: "no-store", signal: controller.signal,
    });
  } finally { clearTimeout(timer); }
  if (response.status === 401 && retry && customerAuthSession?.refresh_token) {
    await refreshCustomerSession();
    return customerAuthRpc(name, params, false);
  }
  let data = null;
  try { data = await response.json(); } catch (_) {}
  if (!response.ok) {
    const error = new Error(typeof data?.message === "string" ? data.message : "Account service unavailable");
    error.status = response.status;
    throw error;
  }
  return data;
}

function applyCustomerProfile(profile) {
  if (state.authUserId !== customerAuthSession?.user?.id && typeof resetAccountOrders === 'function') resetAccountOrders();
  if (state.authUserId !== customerAuthSession?.user?.id && typeof resetAccountAddresses === 'function') resetAccountAddresses();
  const phone = String(profile?.phone || customerAuthSession?.user?.phone || "");
  state.authUserId = customerAuthSession?.user?.id || "";
  state.customerName = String(profile?.full_name || "");
  state.customerPhone = phone;
  state.customerEmail = String(profile?.email || "");
  state.customer = {name: state.customerName, mobile: phone, email: state.customerEmail};
  state.isLoggedIn = true;
}

async function loadCustomerProfile() {
  const profile = await customerAuthRpc(MENU_CONFIG.rpc.customerProfile, {
    p_restaurant_id: MENU_CONFIG.restaurantId,
  });
  applyCustomerProfile(profile || {});
  return profile;
}

async function saveCustomerProfile(fullName, email) {
  const profile = await customerAuthRpc(MENU_CONFIG.rpc.saveCustomerProfile, {
    p_restaurant_id: MENU_CONFIG.restaurantId,
    p_full_name: fullName,
    p_email: email || null,
  });
  applyCustomerProfile(profile);
  return profile;
}

async function resumeTrustedCustomerForPhone(phone) {
  const expectedPhone = normalizeSaudiMobile(phone);
  if (!expectedPhone) return false;

  let session = customerAuthSession;
  if (!validAuthSession(session)) {
    try { session = JSON.parse(localStorage.getItem(authSessionKey()) || "null"); }
    catch (_) { session = null; }
  }
  if (!validAuthSession(session) || normalizeSaudiMobile(session.user.phone) !== expectedPhone) return false;

  customerAuthSession = session;
  try {
    await loadCustomerProfile();
    if (typeof loadAccountAddresses === "function") await loadAccountAddresses();
    return true;
  } catch (error) {
    if ([401, 403].includes(error?.status)) {
      clearAuthSession();
      return false;
    }
    throw error;
  }
}

async function bootstrapCustomerAuth() {
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(authSessionKey()) || "null"); } catch (_) {}
  if (!validAuthSession(stored)) { clearAuthSession(); return false; }
  customerAuthSession = stored;
  try {
    await loadCustomerProfile();
    if (state.screen === 'track' && typeof loadAccountOrders === 'function') loadAccountOrders();
    if (typeof loadAccountAddresses === 'function') await loadAccountAddresses();
    if (state.screen === "account") renderKeepScroll();
    return true;
  } catch (error) {
    if ([401, 403].includes(error?.status)) clearAuthSession();
    else applyCustomerProfile({});
    if (state.screen === "account") renderKeepScroll();
    return false;
  }
}

async function signOutCustomer() {
  const token = customerAuthSession?.access_token;
  clearAuthSession();
  state.order = null;
  state.orderHistory = [];
  try {
    for (const key of [CUSTOMER_ORDER_STORAGE_KEY, CUSTOMER_ORDER_HISTORY_STORAGE_KEY,
      LEGACY_CUSTOMER_ORDER_STORAGE_KEY, LEGACY_CUSTOMER_ORDER_HISTORY_STORAGE_KEY]) localStorage.removeItem(key);
  } catch (_) {}
  renderKeepScroll();
  if (!token) return;
  try { await authHttp("logout", {body: {}, token}); } catch (_) {}
}
