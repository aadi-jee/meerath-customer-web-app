/* Batch 3a (394): why a promotion or a typed code is not applied — the 24 reasons of the server
 * (API-3A-CONTRACT.md, section 6), worded once for customers, in English and Arabic.
 *
 *   offer_* : the sentence for an automatic promotion ("not_applied" in the price answer)
 *   code_*  : the sentence for a typed coupon or promo code ("code" in the price answer)
 *   show    : "hint"  = may be the one hint line of the cart (it helps the customer to act)
 *             "quiet" = never shown in the cart (it would only be a list of what did not apply)
 *
 * Words in braces are filled in: {amount} money, {offer} what the promotion gives ("10% off"),
 * {name} the promotion's own customer text, {code} the typed code, {types} order types, {time} a time.
 * The server only sends the reason; nothing here is a server sentence. */
const PROMO_REASONS = {
  minimum_not_met: {show: "hint",
    offer_en: "Add {amount} more to get {offer}", offer_ar: "أضف {amount} للحصول على {offer}",
    code_en: "Add {amount} more to use {code}", code_ar: "أضف {amount} لاستخدام {code}"},
  outside_hours: {show: "quiet",
    offer_en: "{name} is not on right now", offer_ar: "{name} غير متاح الآن",
    code_en: "This code is not on right now. It applies at its hours.", code_ar: "هذا الكود غير متاح الآن، ويُطبَّق في أوقاته."},
  not_started: {show: "quiet",
    offer_en: "{name} has not started yet", offer_ar: "{name} لم يبدأ بعد"},
  ended: {show: "quiet",
    offer_en: "{name} has ended", offer_ar: "انتهى عرض {name}"},
  wrong_order_type: {show: "hint",
    offer_en: "{name} is for {types} orders", offer_ar: "{name} متاح لطلبات {types}",
    code_en: "This code is for {types} orders.", code_ar: "هذا الكود لطلبات {types}."},
  wrong_branch: {show: "quiet",
    offer_en: "{name} is not available at this branch", offer_ar: "{name} غير متاح في هذا الفرع"},
  wrong_channel: {show: "quiet",
    offer_en: "{name} is not available here", offer_ar: "{name} غير متاح هنا"},
  no_matching_items: {show: "quiet",
    offer_en: "Nothing in your cart is part of {name}", offer_ar: "لا يوجد في سلتك صنف ضمن {name}"},
  item_offer_applies: {show: "quiet",
    offer_en: "These items already have their own offer", offer_ar: "هذه الأصناف عليها عرضها الخاص"},
  sign_in_needed: {show: "hint",
    offer_en: "Sign in to get {offer}", offer_ar: "سجّل الدخول للحصول على {offer}",
    code_en: "Sign in to use this code", code_ar: "سجّل الدخول لاستخدام هذا الكود"},
  not_first_order: {show: "quiet",
    offer_en: "{name} is for a first order", offer_ar: "{name} للطلب الأول فقط",
    code_en: "This code is for a first order only.", code_ar: "هذا الكود للطلب الأول فقط."},
  used_already: {show: "quiet",
    offer_en: "You have already used {name}", offer_ar: "لقد استخدمت {name} من قبل",
    code_en: "You have already used this code", code_ar: "لقد استخدمت هذا الكود من قبل"},
  limit_reached: {show: "quiet",
    offer_en: "{name} is fully used", offer_ar: "انتهت كمية عرض {name}"},
  better_offer_applied: {show: "quiet",
    offer_en: "A better offer is applied instead of {name}", offer_ar: "تم تطبيق عرض أفضل بدلاً من {name}",
    code_en: "The offer on your order already gives more, and the two cannot be combined.",
    code_ar: "العرض المطبق على طلبك يمنحك خصماً أكبر، ولا يمكن الجمع بينهما."},
  not_with_code: {show: "hint",
    offer_en: "{name} is not applied: your code gives more, and they cannot be combined",
    offer_ar: "لم يُطبَّق {name}: الكود يمنحك خصماً أكبر ولا يمكن الجمع بينهما"},
  nothing_to_reduce: {show: "quiet",
    offer_en: "{name} has nothing left to take off", offer_ar: "لم يبق ما يُخصم منه لعرض {name}",
    code_en: "There is nothing left on this order to take it off.",
    code_ar: "لم يبق في هذا الطلب ما يُخصم منه."},
  would_be_free: {show: "hint",
    offer_en: "This offer cannot make the whole order free. Add another item to use it.",
    offer_ar: "لا يمكن أن يجعل هذا العرض الطلب كله مجاناً. أضف صنفاً آخر للاستفادة منه.",
    code_en: "This offer cannot make the whole order free. Add another item to use {code}.",
    code_ar: "لا يمكن أن يجعل هذا العرض الطلب كله مجاناً. أضف صنفاً آخر لاستخدام {code}."},
  address_needed: {show: "hint",
    offer_en: "Choose your address to see {offer}", offer_ar: "اختر عنوانك لمعرفة {offer}"},
  no_delivery_fee: {show: "quiet",
    offer_en: "There is no delivery fee to reduce", offer_ar: "لا توجد رسوم توصيل لتخفيضها"},
  code_not_valid: {show: "quiet",
    offer_en: "This code is not valid", offer_ar: "هذا الكود غير صالح",
    code_en: "This code is not valid", code_ar: "هذا الكود غير صالح"},
  not_with_item_offer: {show: "quiet",
    offer_en: "This code cannot be used together with an item offer", offer_ar: "لا يمكن استخدام هذا الكود مع عروض الأصناف",
    code_en: "It cannot be used together with an item offer in your cart.",
    code_ar: "لا يمكن استخدامه مع عرض على صنف في سلتك."},
  too_many_tries: {show: "quiet",
    offer_en: "Too many tries. Please try again in a few minutes", offer_ar: "محاولات كثيرة. حاول مرة أخرى بعد بضع دقائق",
    code_en: "Too many tries. Please try again in a few minutes", code_ar: "محاولات كثيرة. حاول مرة أخرى بعد بضع دقائق"},
  points_refused: {show: "quiet",
    offer_en: "Your points could not be used on this order", offer_ar: "تعذر استخدام نقاطك في هذا الطلب"},
  not_in_test: {show: "quiet",
    offer_en: "Not part of this test", offer_ar: "غير مشمول في هذا الاختبار"},
};
/* A typed code that stays in the cart although it is not applied: a real code that is only not
 * applicable now (contract, Reconciliation C2: these are never counted as wrong tries, and the same
 * code within 10 minutes counts once). It can start to apply when the cart, the order type or the
 * hour changes, and the customer sees why it does not. Every other answer (code_not_valid,
 * sign_in_needed, too_many_tries, used_already, not_first_order, an unknown reason) takes it off:
 * those cannot change with the cart, and the first two are the ones that count. */
const PROMO_CODE_KEPT = ["minimum_not_met", "better_offer_applied", "not_with_item_offer", "nothing_to_reduce", "would_be_free", "outside_hours", "wrong_order_type"];
/* Contract, Reconciliation C8: before an address, a promotion that would make the food free waits for the fee. */
const PROMO_PENDING_TEXT = {
  en: "{name} is added when you choose your delivery address.",
  ar: "يُضاف عرض «{name}» عند اختيار عنوان التوصيل.",
};
/* Contract, Reconciliation C6: the stable word ("hint") beside every error of the price and order
 * functions. "other" = show the server's own sentence; a word this app does not know = the generic one. */
const PROMO_ERRORS = {
  item_unavailable: {en: "An item in your cart is no longer available. Please review your cart.", ar: "أحد أصناف سلتك لم يعد متاحاً. يرجى مراجعة السلة."},
  choice_changed: {en: "The choices of an item in your cart have changed. Please review your cart.", ar: "تغيّرت خيارات أحد أصناف سلتك. يرجى مراجعة السلة."},
  item_outside_hours: {en: "An item in your cart is not available at this time.", ar: "أحد أصناف سلتك غير متاح في هذا الوقت."},
  item_offer_limit: {en: "An item offer in your cart is over its limit. Please review your cart.", ar: "تجاوز عرض أحد الأصناف في سلتك حده. يرجى مراجعة السلة."},
  branch_closed: {en: "This branch is not taking orders right now.", ar: "هذا الفرع لا يستقبل الطلبات الآن."},
  table_inactive: {en: "This table QR is not active. Please ask our staff.", ar: "رمز هذه الطاولة غير مفعّل. يرجى سؤال الموظفين."},
  invalid_cart: {en: "Something in your cart is not right. Please review your cart.", ar: "هناك خطأ في سلتك. يرجى مراجعتها."},
  sign_in_needed: {en: "Please sign in with your mobile number to order from this table.", ar: "يرجى تسجيل الدخول برقم جوالك للطلب من هذه الطاولة."},
  name_needed: {en: "Please enter your name to order.", ar: "يرجى إدخال اسمك لإتمام الطلب."},
  phone_needed: {en: "Please enter a valid mobile number.", ar: "يرجى إدخال رقم جوال صحيح."},
  delivery_fee_changed: {en: "The delivery fee changed. Review the new fee and place your order again.", ar: "تغيّرت رسوم التوصيل. راجع الرسوم الجديدة وأكد طلبك مرة أخرى."},
  location_changed: {en: "Your delivery location changed. Please confirm it again.", ar: "تغيّر موقع التوصيل. يرجى تأكيده مرة أخرى."},
  invalid_points: {en: "Your points could not be used on this order.", ar: "تعذر استخدام نقاطك في هذا الطلب."},
  order_id_conflict: {en: "Please place your order again.", ar: "يرجى تأكيد الطلب مرة أخرى."},
  quote_key_required: {en: "We could not confirm the price. Check your connection and try again.", ar: "تعذر تأكيد السعر. تحقق من اتصالك وحاول مرة أخرى."},
  quote_mismatch: {en: "We could not confirm the price. Check your connection and try again.", ar: "تعذر تأكيد السعر. تحقق من اتصالك وحاول مرة أخرى."},
  invalid_order_type: {en: "Choose how you want your order.", ar: "اختر طريقة استلام طلبك."},
};
/* The words that mean "the cart itself changed": the menu is read again. */
const PROMO_CART_ERRORS = ["item_unavailable", "choice_changed", "item_outside_hours", "item_offer_limit", "invalid_cart"];
/** The customer's sentence for an error word: "" = none (no word, or "other": show the server's sentence). */
function promoErrorText(hint, lang) {
  if (typeof hint !== "string" || !hint || hint === "other") return "";
  const ar = (lang || (typeof state !== "undefined" ? state.lang : "en")) === "ar";
  const row = PROMO_ERRORS[hint];
  if (row) return ar ? row.ar : row.en;
  return ar ? "تعذر إتمام الطلب. حاول مرة أخرى." : "Could not place order. Try again.";
}
/* The one hint of the cart: the first of these that a not-applied promotion carries. */
const PROMO_HINT_ORDER = ["minimum_not_met", "would_be_free", "not_with_code", "address_needed", "sign_in_needed", "wrong_order_type"];

/** The sentence for a reason. kind = "offer" | "code"; words = {amount, offer, name, code, types, time}. */
function promoReasonText(reason, kind, words, lang) {
  const row = PROMO_REASONS[reason];
  const ar = (lang || (typeof state !== "undefined" ? state.lang : "en")) === "ar";
  if (!row) return ar ? "هذا العرض غير مطبق على طلبك" : "This offer is not applied to your order";
  const pick = row[`${kind === "code" ? "code" : "offer"}_${ar ? "ar" : "en"}`] || row[`offer_${ar ? "ar" : "en"}`];
  return pick.replace(/\{(\w+)\}/g, (_, key) => String((words && words[key]) ?? "").trim()).replace(/\s{2,}/g, " ").trim();
}
