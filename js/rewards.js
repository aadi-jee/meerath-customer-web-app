/* Batch R (241): real loyalty points.
 * The server owns every number: balance, what an order earns, what may be
 * used. This file only shows them and sends "redeem_points" with the order.
 * Nothing shows unless the restaurant has switched points on in the Admin
 * (oracy_rewards_rules_v1 says enabled) AND APP_CONFIG.features.rewards.
 */
const rewardsState = {
  rules: null,        // server rules, or {enabled:false}
  summary: null,      // signed-in customer's balance and history
  loadingRules: false,
  loadingSummary: false,
  summaryFor: "",     // auth user the summary belongs to
  summaryTried: "",   // auth user we already asked for (success or not)
  error: "",
};

function rewardsCopy(en, ar) { return state.lang === "ar" ? ar : en; }

function rewardsOn() {
  // Batch E: also off when points are switched off for the restaurant (status call).
  return Boolean(APP_CONFIG.features.rewards && (typeof featureOn !== "function" || featureOn("rewards")) &&
    rewardsState.rules && rewardsState.rules.enabled === true);
}

// ---------- pure helpers (tested) ----------
function rewardsNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Points an order earns: floor(food paid x rate). Food paid = after discounts and points, without delivery. */
function rewardsEarnPreview(rules, foodPaid) {
  if (!rules || rules.enabled !== true) return 0;
  const rate = rewardsNumber(rules.earn_points_per_unit, 0);
  return Math.max(0, Math.floor(Math.round(rewardsNumber(foodPaid) * 100) * rate / 100));
}

/** Money value of a number of points (rounded to halalas). */
function rewardsRedeemValue(rules, points) {
  if (!rules || !points) return 0;
  const step = rewardsNumber(rules.redeem_step_points, 0);
  const value = rewardsNumber(rules.redeem_step_value, 0);
  if (step <= 0) return 0;
  return Math.round(Math.floor(points / step) * value * 100) / 100;
}

/**
 * The point amounts this customer may use on this cart, smallest first.
 * Same rules as the server: whole steps, at least the minimum, not more than
 * the balance, worth at most max_redeem_share of the food subtotal, and no
 * coupon unless the restaurant allows it.
 */
function rewardsRedeemOptions(rules, balance, foodSubtotal, couponOn) {
  if (!rules || rules.enabled !== true) return [];
  if (couponOn && !rules.allow_with_coupon) return [];
  const step = rewardsNumber(rules.redeem_step_points, 0);
  const stepValue = rewardsNumber(rules.redeem_step_value, 0);
  const min = rewardsNumber(rules.min_redeem_points, step);
  const share = rewardsNumber(rules.max_redeem_share, 0);
  if (step <= 0 || stepValue <= 0) return [];
  const capCents = Math.round(Math.max(0, rewardsNumber(foodSubtotal)) * share * 100);
  const byCap = Math.floor(capCents / Math.round(stepValue * 100)) * step;
  const byBalance = Math.floor(Math.max(0, rewardsNumber(balance)) / step) * step;
  const most = Math.min(byCap, byBalance);
  const out = [];
  for (let p = Math.max(min, step); p <= most && out.length < 50; p += step) out.push(p);
  return out;
}

/** Keep the chosen amount only while it is still allowed (cart or coupon changed). */
function rewardsValidSelection(rules, balance, foodSubtotal, couponOn, chosen) {
  const options = rewardsRedeemOptions(rules, balance, foodSubtotal, couponOn);
  if (!chosen || !options.length) return 0;
  if (options.includes(chosen)) return chosen;
  return options.filter(p => p <= chosen).pop() || 0;
}

function rewardsHistoryLabel(kind) {
  return ({
    earn: rewardsCopy("Earned", "مكتسبة"),
    reverse_earn: rewardsCopy("Taken back (order cancelled or refunded)", "مستردة (طلب ملغى أو مسترجع)"),
    redeem: rewardsCopy("Used on an order", "مستخدمة في طلب"),
    restore_redeem: rewardsCopy("Given back", "مُعادة"),
    expire: rewardsCopy("Expired", "منتهية"),
    adjust: rewardsCopy("From the restaurant", "من المطعم"),
  })[kind] || kind;
}

function rewardsDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(state.lang === "ar" ? "ar-SA" : "en-GB",
    {day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Riyadh"}).format(d);
}

// ---------- loading ----------
async function loadRewardsRules(force = false) {
  if (!APP_CONFIG.features.rewards || rewardsState.loadingRules) return rewardsState.rules;
  if (rewardsState.rules && !force) return rewardsState.rules;
  rewardsState.loadingRules = true;
  try {
    rewardsState.rules = await customerOrderRpc("oracy_rewards_rules_v1", {p_restaurant_id: MENU_CONFIG.restaurantId});
  } catch (_) {
    rewardsState.rules = {enabled: false};   // points simply stay hidden
  } finally {
    rewardsState.loadingRules = false;
  }
  return rewardsState.rules;
}

async function loadRewardsSummary(force = false) {
  if (!APP_CONFIG.features.rewards || !state.isLoggedIn || rewardsState.loadingSummary) return rewardsState.summary;
  if (!force && rewardsState.summary && rewardsState.summaryFor === state.authUserId) return rewardsState.summary;
  rewardsState.loadingSummary = true;
  rewardsState.error = "";
  try {
    const s = await customerOrderRpc("oracy_rewards_summary_v1", {p_restaurant_id: MENU_CONFIG.restaurantId});
    rewardsState.summary = s;
    rewardsState.summaryFor = state.authUserId;
    rewardsState.summaryAt = Date.now();
    if (s && s.rules) rewardsState.rules = s.rules;
    if (s && s.enabled === false) rewardsState.rules = {enabled: false};
  } catch (error) {
    rewardsState.error = String(error?.message || "");
  } finally {
    rewardsState.loadingSummary = false;
    rewardsState.summaryTried = state.authUserId;
  }
  return rewardsState.summary;
}

/** Opening the points or account screen: a summary older than 20 seconds is read again (points change when an order is paid). */
function rewardsTouch() {
  if (!state.isLoggedIn || !rewardsState.summary || Date.now() - (rewardsState.summaryAt || 0) < 20000) return;
  loadRewardsSummary(true).then(() => { if (["rewards", "account", "track"].includes(state.screen)) renderKeepScroll(); });
}

/** Load rules (and the summary when signed in) once; then call onReady. Never loops. */
function rewardsEnsureLoaded(onReady) {
  if (!APP_CONFIG.features.rewards) return;
  const needRules = !rewardsState.rules && !rewardsState.loadingRules;
  const needSummary = state.isLoggedIn && rewardsState.summaryTried !== state.authUserId && !rewardsState.loadingSummary;
  if (!needRules && !needSummary) return;
  setTimeout(async () => {
    await loadRewardsRules();
    if (rewardsState.rules?.enabled && state.isLoggedIn) await loadRewardsSummary();
    else if (state.isLoggedIn) rewardsState.summaryTried = state.authUserId;
    if (typeof onReady === "function") onReady();
  }, 0);
}

function rewardsBalance() {
  const s = rewardsState.summary;
  return s && s.member && rewardsState.summaryFor === state.authUserId ? rewardsNumber(s.balance) : 0;
}

/** Called by totals(): the points discount for the current cart (0 when not allowed). */
function rewardsDiscountFor(foodSubtotal, couponOn) {
  if (!rewardsOn() || !state.isLoggedIn) return 0;
  const chosen = rewardsValidSelection(rewardsState.rules, rewardsBalance(), foodSubtotal, couponOn, state.redeemPoints || 0);
  state.redeemPoints = chosen;
  return rewardsRedeemValue(rewardsState.rules, chosen);
}

function chooseRedeemPoints(points) {
  state.redeemPoints = Math.max(0, Number(points) || 0);
  if (typeof updateCheckoutSummary === "function") updateCheckoutSummary();
  if (typeof updateCartBreakdown === "function") updateCartBreakdown();
  const box = document.getElementById("rewardsCheckout");
  if (box) box.outerHTML = rewardsCheckoutMarkup();
}

// ---------- markup ----------
function rewardsCheckoutMarkup() {
  if (!rewardsOn()) return `<div id="rewardsCheckout" hidden></div>`;
  const tot = totals();
  const earn = rewardsEarnPreview(rewardsState.rules, tot.foodTotal);
  if (!state.isLoggedIn) {
    return `<div id="rewardsCheckout" class="rewards-checkout">
      <strong>${rewardsCopy(`Earn ${earn} points on this order`, `اكسب ${earn} نقطة مع هذا الطلب`)}</strong>
      <span>${rewardsCopy("Sign in with your mobile to collect points.", "سجّل الدخول برقم جوالك لجمع النقاط.")}</span>
    </div>`;
  }
  const balance = rewardsBalance();
  const foodBeforePoints = tot.foodTotal + tot.points;
  const options = rewardsRedeemOptions(rewardsState.rules, balance, foodBeforePoints, state.couponOn);
  const chosen = state.redeemPoints || 0;
  const chip = (p, label) => `<button type="button" class="rewards-chip ${chosen === p ? "active" : ""}"
      onclick="chooseRedeemPoints(${p})" aria-pressed="${chosen === p}">${label}</button>`;
  let useBlock = "";
  if (options.length) {
    useBlock = `<div class="rewards-use">
      <span>${rewardsCopy("Use your points", "استخدم نقاطك")}</span>
      <div class="rewards-chips">${chip(0, rewardsCopy("Don't use", "لا أستخدم"))}${options.slice(-4).map(p =>
        chip(p, `${p} = ${money(rewardsRedeemValue(rewardsState.rules, p))}`)).join("")}</div>
    </div>`;
  } else if (balance > 0 && state.couponOn && !rewardsState.rules.allow_with_coupon) {
    useBlock = `<small>${rewardsCopy("Points cannot be used together with a coupon code.", "لا يمكن استخدام النقاط مع كود الخصم.")}</small>`;
  } else if (balance > 0) {
    useBlock = `<small>${rewardsCopy(`You can use points from ${rewardsState.rules.min_redeem_points}.`, `يمكنك استخدام النقاط ابتداءً من ${rewardsState.rules.min_redeem_points}.`)}</small>`;
  }
  return `<div id="rewardsCheckout" class="rewards-checkout">
    <strong>${rewardsCopy(`You will earn ${earn} points`, `ستكسب ${earn} نقطة`)}</strong>
    <span>${rewardsCopy(`Balance: ${balance} points`, `رصيدك: ${balance} نقطة`)}</span>
    ${useBlock}
  </div>`;
}

/** Batch R2 (250): each earning has its own expiry date; the server lists them oldest first. */
function rewardsExpiryList(s) {
  return (Array.isArray(s?.expiring) ? s.expiring : [])
    .map(e => ({points: Math.trunc(rewardsNumber(e?.points)), at: e?.at}))
    .filter(e => e.points > 0 && e.at);
}
function rewardsNextExpiryLine(s, full) {
  const next = rewardsExpiryList(s)[0];
  const tag = full ? "p" : "small";
  if (!next) {   // older server answer: one date for the whole balance
    return s?.valid_until ? `<${tag}>${rewardsCopy("Valid until", "صالحة حتى")} ${rewardsDate(s.valid_until)}</${tag}>` : "";
  }
  const all = next.points >= Math.trunc(rewardsNumber(s.balance));
  const text = s.expiring_soon && full
    ? rewardsCopy(`Order soon — ${next.points} points expire on ${rewardsDate(next.at)}`, `اطلب قريباً — ${next.points} نقطة تنتهي في ${rewardsDate(next.at)}`)
    : all ? rewardsCopy(`Valid until ${rewardsDate(next.at)}`, `صالحة حتى ${rewardsDate(next.at)}`)
    : rewardsCopy(`${next.points} points expire on ${rewardsDate(next.at)}`, `${next.points} نقطة تنتهي في ${rewardsDate(next.at)}`);
  return `<${tag} class="${s.expiring_soon ? "rewards-expiring" : ""}">${text}</${tag}>`;
}

/** Points of one order, for the order history ("+262 points earned · 100 points used"). */
function rewardsOrderPoints(history, orderNumber) {
  let earned = 0, used = 0;
  for (const h of Array.isArray(history) ? history : []) {
    if (!orderNumber || h?.order_number !== orderNumber) continue;
    const p = Math.trunc(rewardsNumber(h.points));
    if (h.kind === "earn" || h.kind === "reverse_earn") earned += p;
    else if (h.kind === "redeem" || h.kind === "restore_redeem") used -= p;
  }
  return {earned: Math.max(0, earned), used: Math.max(0, used)};
}
function rewardsOrderLine(orderNumber) {
  if (!rewardsOn() || !state.isLoggedIn) return "";
  if (!rewardsState.summary) {   // first visit to Orders: fetch once, then redraw
    loadRewardsSummary().then(s => { if (s && state.screen === "track") renderKeepScroll(); });
    return "";
  }
  const p = rewardsOrderPoints(rewardsState.summary.history, orderNumber);
  const parts = [];
  if (p.earned) parts.push(rewardsCopy(`+${p.earned} points earned`, `+${p.earned} نقطة مكتسبة`));
  if (p.used) parts.push(rewardsCopy(`${p.used} points used`, `${p.used} نقطة مستخدمة`));
  return parts.length ? `<div class="order-points">★ ${parts.join(" · ")}</div>` : "";
}

function rewardsAccountCardMarkup() {
  if (!rewardsOn()) return "";
  const s = rewardsState.summary;
  const balance = rewardsBalance();
  return `<div class="account-section-title">${brandedRewardsLabel()}</div>
    <button class="account-rewards-card" onclick="go('rewards')">
      <span class="account-reward-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-3-5.3 3 1.1-6L3.4 9.4l6-.8z"></path></svg></span>
      <div class="account-reward-copy">
        <strong>${balance} ${rewardsCopy("points", "نقطة")}</strong>
        <span>${rewardsCopy(`Worth ${money(rewardsNumber(s?.usable_value))}`, `قيمتها ${money(rewardsNumber(s?.usable_value))}`)}</span>
        ${rewardsNextExpiryLine(s, false)}
      </div>
      <span class="account-arrow">›</span>
    </button>`;
}

/** The points card: balance, value, expiry and (Release A) the progress bar to the next reward. */
function rewardsPointsCardMarkup(s) {
  return `<div class="points">
      <small style="color:var(--gold)">${rewardsCopy("Your points", "نقاطك")}</small>
      <h2>${rewardsNumber(s.balance)} ${rewardsCopy("points", "نقطة")}</h2>
      <p>${rewardsCopy(`Usable now: ${money(rewardsNumber(s.usable_value))}`, `قابلة للاستخدام الآن: ${money(rewardsNumber(s.usable_value))}`)}</p>
      ${rewardsNextExpiryLine(s, true)}
      ${typeof walletProgressMarkup === "function" ? walletProgressMarkup() : ""}
      <button class="btn btn-primary" style="margin-top:12px" onclick="go('menu')">${rewardsCopy("Order and use points", "اطلب واستخدم نقاطك")}</button>
    </div>`;
}

/** How it works, when points expire, and the history. */
function rewardsDetailsMarkup(r, s) {
  const history = Array.isArray(s.history) ? s.history : [];
  const how = [
    rewardsCopy(`Earn ${rewardsNumber(r.earn_points_per_unit)} point for every ${money(1)} you pay for food.`,
                `اكسب ${rewardsNumber(r.earn_points_per_unit)} نقطة لكل ${money(1)} تدفعه على الطعام.`),
    rewardsCopy(`${r.redeem_step_points} points = ${money(rewardsNumber(r.redeem_step_value))} off. Use from ${r.min_redeem_points} points, up to ${Math.round(rewardsNumber(r.max_redeem_share) * 100)}% of your food.`,
                `${r.redeem_step_points} نقطة = خصم ${money(rewardsNumber(r.redeem_step_value))}. تُستخدم ابتداءً من ${r.min_redeem_points} نقطة وحتى ${Math.round(rewardsNumber(r.max_redeem_share) * 100)}% من قيمة الطعام.`),
    rewardsCopy(`Points are added when your order is completed and paid. Each earning is valid for ${r.expiry_days} days; your oldest points are used first.`,
                `تُضاف النقاط عند اكتمال الطلب ودفعه. كل نقاط مكتسبة صالحة لمدة ${r.expiry_days} يوماً، وتُستخدم أقدم نقاطك أولاً.`),
    rewardsCopy("Catering orders: the restaurant adds your points to your account after payment. Meal-distribution requests do not earn points.",
                "طلبات التموين: يضيف المطعم نقاطك إلى حسابك بعد الدفع. طلبات توزيع الوجبات لا تكسب نقاطاً."),
  ];
  return `${rewardsState.error ? `<p class="delivery-quote-error">${escapeHtml(rewardsState.error)}</p>` : ""}
    <h3 style="margin:18px 0 10px">${rewardsCopy("How it works", "كيف تعمل")}</h3>
    <ul class="rewards-how">${how.map(x => `<li>${escapeHtml(x)}</li>`).join("")}</ul>
    ${rewardsExpiryList(s).length > 1 ? `<h3 style="margin:18px 0 10px">${rewardsCopy("When your points expire", "متى تنتهي نقاطك")}</h3>
      ${rewardsExpiryList(s).map(e => `<div class="rewards-row"><div><strong>${rewardsDate(e.at)}</strong>
        <span>${rewardsCopy("Oldest points are used first", "تُستخدم أقدم النقاط أولاً")}</span></div>
        <b>${e.points} ${rewardsCopy("points", "نقطة")}</b></div>`).join("")}` : ""}
    <h3 style="margin:18px 0 10px">${rewardsCopy("History", "السجل")}</h3>
    ${history.length ? history.map(h => `<div class="rewards-row">
        <div><strong>${escapeHtml(rewardsHistoryLabel(h.kind))}</strong>
          <span>${h.order_number ? escapeHtml(h.order_number) + " · " : ""}${rewardsDate(h.at)}</span></div>
        <b class="${rewardsNumber(h.points) < 0 ? "minus" : "plus"}">${rewardsNumber(h.points) > 0 ? "+" : ""}${rewardsNumber(h.points)}</b>
      </div>`).join("")
      : `<div class="empty">${rewardsCopy("No points yet — they appear after your first paid order.", "لا توجد نقاط بعد — تظهر بعد أول طلب مدفوع.")}</div>`}`;
}

function rewardsScreenMarkup() {
  // Release A (415): with the wallet switched on, this screen is the Rewards hub (coupons + points, wallet.js).
  if (typeof walletOn === "function" && walletOn() && typeof walletScreenMarkup === "function") return walletScreenMarkup();
  const r = rewardsState.rules;
  if (!rewardsOn()) {
    return `<section class="screen"><div class="topbar">${back("account")}<h2>${brandedRewardsLabel()}</h2>${langSwitch()}</div>
      <div class="empty">${rewardsCopy("Points are not available right now.", "النقاط غير متاحة حالياً.")}</div></section>${nav("account")}`;
  }
  if (!state.isLoggedIn) {
    return `<section class="screen"><div class="topbar">${back("account")}<h2>${brandedRewardsLabel()}</h2>${langSwitch()}</div>
      <div class="empty">${rewardsCopy("Sign in to see your points.", "سجّل الدخول لعرض نقاطك.")}<br>
      <button class="link" onclick="go('signInPage')">${t("signInCreate")}</button></div></section>${nav("account")}`;
  }
  const s = rewardsState.summary || {};
  return `<section class="screen rewards-screen">
    <div class="topbar">${back("account")}<h2>${brandedRewardsLabel()}</h2>${langSwitch()}</div>
    ${rewardsPointsCardMarkup(s)}
    ${rewardsDetailsMarkup(r, s)}
  </section>${nav("account")}`;
}

window.chooseRedeemPoints = chooseRedeemPoints;
