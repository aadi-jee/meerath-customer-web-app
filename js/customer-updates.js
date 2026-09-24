/* Shared website content and catering use the existing Supabase contracts. */
let websiteContent = {};
let websiteRequest = null;
let cateringBusy = false;
let cateringDraft = {};
let cateringConfirmation = null;
let cartOrigin = null;
let appAnnouncements = [];
let announcementsLoadedAt = 0;
let announcementsBranch = null;
let announcementsRequest = null;
function announcementBranch() {
  try { return selectMenuBranch(menuConnection.payload?.branches || []); }
  catch (_) { return null; }
}
function applyAnnouncements(data, branch) {
  if (data?.version !== 1 || !Array.isArray(data.announcements)) throw new Error('Invalid announcements');
  appAnnouncements = data.announcements.filter(a => a && typeof a.id === 'string' &&
    typeof a.text_en === 'string' && typeof a.text_ar === 'string' &&
    ['none','catering','menu','offers','call','whatsapp'].includes(a.action) &&
    (a.ends_at === null || Number.isFinite(Date.parse(a.ends_at))));
  announcementsLoadedAt = Date.now(); announcementsBranch = branch;
}
async function loadAppAnnouncements() {
  if (!featureEnabled('announcements')) {
    appAnnouncements = []; announcementsLoadedAt = 0; return;
  }
  if (announcementsRequest) return announcementsRequest;
  const branch = announcementBranch();
  announcementsRequest = (async () => {
    const before = JSON.stringify(liveAnnouncements());
    try {
      const data = await websiteRpc(MENU_CONFIG.rpc.announcements, {p_branch_id:branch});
      applyAnnouncements(data, branch);
    } catch (_) { appAnnouncements = []; announcementsLoadedAt = 0; }
    const box = document.getElementById('appAnnouncementSlot');
    if (box && state.screen === 'home' && (before !== JSON.stringify(liveAnnouncements()) || !box.innerHTML)) box.innerHTML = announcementMarkup();
  })().finally(() => { announcementsRequest = null; });
  return announcementsRequest;
}
function liveAnnouncements() {
  if (Date.now()-announcementsLoadedAt > 45000 || announcementBranch() !== announcementsBranch) return [];
  return appAnnouncements.filter(a => a.ends_at === null || Date.parse(a.ends_at)>Date.now());
}
function updateCopy(en, ar) { return state.lang === 'ar' ? ar : en; }
function configuredBranchName() { return branchDisplayName(state.lang); }
function websiteText(key) {
  const other = state.lang === 'ar' ? 'en' : 'ar';
  return String(websiteContent[key + '_' + state.lang] || websiteContent[key + '_' + other] || '');
}
async function websiteRpc(name, payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${MENU_CONFIG.url}/rest/v1/rpc/${name}`, {
      method: 'POST', headers: {apikey: MENU_CONFIG.publicKey, 'Content-Type': 'application/json'},
      body: JSON.stringify(payload), credentials: 'omit', cache: 'no-store', signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Request failed');
    return data;
  } finally { clearTimeout(timer); }
}
function loadWebsiteContent() {
  if (websiteRequest) return websiteRequest;
  websiteRequest = (async () => {
    let next = {};
    try {
      const data = await websiteRpc(MENU_CONFIG.rpc.websiteContent, {});
      if (data?.version !== 1 || !data.content || typeof data.content !== 'object' || Array.isArray(data.content)) throw new Error('Invalid content');
      next = data.content;
    } catch (error) { console.warn('Website content unavailable'); }
    const changed = JSON.stringify(next) !== JSON.stringify(websiteContent);
    websiteContent = next;
    // Do not rerender a catering form while someone is typing.
    if (changed && state.screen === 'home') renderKeepScroll();
  })().finally(() => { websiteRequest = null; });
  return websiteRequest;
}
function announcementMarkup() {
  if (!featureEnabled('announcements')) return '';
  const rows = liveAnnouncements();
  if (!rows.length) return '';
  const text = rows.map(a => {
    const copy = escapeHtml((state.lang === 'ar' ? a.text_ar || a.text_en : a.text_en || a.text_ar).slice(0,140));
    const index = appAnnouncements.indexOf(a);
    return a.action === 'none' ? `<span>${copy}</span>` : `<button class="announcement-action" onclick="announcementAction(${index})">${copy}</button>`;
  }).join('<span aria-hidden="true">　 •　 </span>');
  return `<div class="home-announcement" tabindex="0" aria-label="${updateCopy('Announcements','إعلانات')}"><div class="announcement-viewport"><p style="animation-duration:${Math.max(24, rows.length*20)}s">${text}</p></div><button type="button" class="link announcement-toggle" onclick="toggleAnnouncement(this)" aria-label="${updateCopy('Pause announcements','إيقاف الإعلانات')}" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14" fill="none" stroke="currentColor" stroke-width="3"/></svg></button></div>`;
}
function announcementAction(index) {
  const row = appAnnouncements[index];
  if (!row || !liveAnnouncements().includes(row)) return;
  if (row.action === 'catering' && featureEnabled('catering')) go('cateringPage');
  if (row.action === 'menu' || row.action === 'offers') go(row.action);
  if (row.action === 'call') window.location.href = 'tel:' + RESTAURANT.phone;
  if (row.action === 'whatsapp') window.open(waLink(updateCopy(`Hello ${APP_CONFIG.brand.shortName}`,`مرحباً ${APP_CONFIG.brand.shortNameAr}`)), '_blank', 'noopener');
}
function toggleAnnouncement(button) {
  const paused = button.parentElement.classList.toggle('paused');
  button.setAttribute('aria-pressed', String(paused));
  button.setAttribute('aria-label', paused ? updateCopy('Play announcements','تشغيل الإعلانات') : updateCopy('Pause announcements','إيقاف الإعلانات'));
  button.innerHTML = paused
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4l12 8-12 8z" fill="currentColor"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14" fill="none" stroke="currentColor" stroke-width="3"/></svg>';
}
function cateringCardMarkup() {
  if (!featureEnabled('catering')) return '';
  return `<button class="catering-card" onclick="go('cateringPage')"><strong>${updateCopy('Events & Catering', 'المناسبات والتموين')} →</strong><span>${updateCopy('Family gatherings, office lunches and special occasions.', 'تجمعات عائلية وغداء العمل والمناسبات الخاصة.')} <span class="catering-quote-callout">${updateCopy('Request a quote.', 'اطلب عرض سعر.')}</span></span></button>`;
}
function requiredLabel(en, ar) {
  return `${updateCopy(en, ar)} <span class="required-mark" aria-hidden="true">*</span>`;
}
function cateringField(key, en, ar, type = 'text', attrs = '') {
  const label = attrs.includes('required') ? requiredLabel(en, ar) : updateCopy(en, ar);
  return `<label>${label}<input class="field" name="${key}" type="${type}" value="${escapeHtml(cateringDraft[key] || '')}" ${attrs}></label>`;
}
function cateringSelect(key, en, ar, choices) {
  return `<label>${requiredLabel(en, ar)}<select class="field" name="${key}" required>${choices.map(([v,e,a]) => `<option value="${v}" ${cateringDraft[key] === v ? 'selected' : ''}>${updateCopy(e,a)}</option>`).join('')}</select></label>`;
}
function seedCateringCustomer() {
  if (!state.isLoggedIn) return;
  if (!cateringDraft.name) cateringDraft.name = state.customerName || state.customer?.name || '';
  if (!cateringDraft.mobile) cateringDraft.mobile = state.customerPhone || state.customer?.mobile || '';
}
function cateringDateParts() {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const get = type => Number(parts.find(p => p.type === type)?.value);
  return {year:get('year'),month:get('month'),day:get('day')};
}
function cateringDays() {
  const p = cateringDateParts();
  const first = Date.UTC(p.year,p.month-1,p.day,12);
  return Array.from({length:60},(_,i) => new Date(first+i*86400000));
}
function cateringIso(date) { return date.toISOString().slice(0,10); }
function cateringDateLabel(value) {
  if (!value) return updateCopy('Choose a date','اختر التاريخ');
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime())) return updateCopy('Choose a date','اختر التاريخ');
  return new Intl.DateTimeFormat(state.lang === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-GB', {weekday:'short',day:'numeric',month:'long',timeZone:'UTC'}).format(date);
}
function cateringCalendarMarkup() {
  const chosen = cateringDraft.event_date || '';
  return `<div class="calendar-sheet" id="cateringCalendar" hidden role="dialog" aria-modal="true" aria-labelledby="calendarTitle">
    <button class="calendar-backdrop" type="button" onclick="closeCateringCalendar()" aria-label="${updateCopy('Close calendar','إغلاق التقويم')}"></button>
    <div class="calendar-panel"><div class="calendar-head"><div><span>${updateCopy('SELECT A DATE','اختر التاريخ')}</span><h3 id="calendarTitle">${updateCopy('Next 60 days','الـ 60 يوماً القادمة')}</h3></div><button class="calendar-close" type="button" onclick="closeCateringCalendar()" aria-label="${updateCopy('Close','إغلاق')}">×</button></div>
    <div class="calendar-days">${cateringDays().map((date,i) => {
      const locale=state.lang==='ar'?'ar-SA-u-ca-gregory':'en-GB';
      const iso=cateringIso(date); const weekday=new Intl.DateTimeFormat(locale,{weekday:'short',timeZone:'UTC'}).format(date);
      const month=new Intl.DateTimeFormat(locale,{month:'short',timeZone:'UTC'}).format(date);
      return `<button type="button" class="calendar-day ${iso===chosen?'selected':''}" onclick="selectCateringDate('${iso}')"><small>${i===0?updateCopy('TODAY','اليوم'):escapeHtml(weekday)}</small><strong>${date.getUTCDate()}</strong><span>${escapeHtml(month)}</span></button>`;
    }).join('')}</div>
    <button class="calendar-clear" type="button" onclick="selectCateringDate('')">${updateCopy('Clear date','مسح التاريخ')}</button></div></div>`;
}
function openCateringCalendar() {
  const sheet=document.getElementById('cateringCalendar');
  if (!sheet) return; sheet.hidden=false; document.body.classList.add('calendar-open');
}
function closeCateringCalendar() {
  const sheet=document.getElementById('cateringCalendar');
  if (sheet) sheet.hidden=true; document.body.classList.remove('calendar-open');
}
function selectCateringDate(value) {
  cateringDraft.event_date=value;
  const input=document.querySelector('input[name="event_date"]'); if(input) input.value=value;
  const label=document.getElementById('cateringDateValue'); if(label) label.textContent=cateringDateLabel(value);
  closeCateringCalendar();
}
function cateringAreaMarkup() {
  const venue=cateringDraft.venue_type || '';
  const outside=venue==='outside', atMeerath=venue==='meerath';
  return `<label id="cateringAreaLabel">${updateCopy('Event location','موقع المناسبة')} <span id="cateringAreaRequired" class="required-mark" ${outside?'':'hidden'} aria-hidden="true">*</span><input class="field" name="area" type="text" value="${escapeHtml(cateringDraft.area || '')}" maxlength="160" ${outside?'required':''} ${atMeerath?'disabled':''} placeholder="${atMeerath?escapeHtml(configuredBranchName()):updateCopy('Area, street or venue name','الحي أو الشارع أو اسم القاعة')}"></label>`;
}
function updateCateringVenue(form) {
  saveCateringDraft(form);
  const venue=form.elements.venue_type.value, area=form.elements.area, requiredMark=document.getElementById('cateringAreaRequired');
  const outside=venue==='outside', atMeerath=venue==='meerath';
  if (atMeerath) { area.value=''; cateringDraft.area=''; }
  area.disabled=atMeerath; area.required=outside;
  area.placeholder=atMeerath?configuredBranchName():updateCopy('Area, street or venue name','الحي أو الشارع أو اسم القاعة');
  if (requiredMark) requiredMark.hidden=!outside;
}
function updateCateringService(form) {
  saveCateringDraft(form);
  // Service-specific fields are intentionally rebuilt after the customer chooses a service.
  renderKeepScroll();
}
function distributionAreaMarkup() {
  const needsLocation=['delivery','managed'].includes(cateringDraft.distribution_mode);
  return `<label>${updateCopy('Distribution location','موقع التوزيع')} <span class="required-mark" ${needsLocation?'':'hidden'} aria-hidden="true">*</span><input class="field" name="area" type="text" value="${escapeHtml(cateringDraft.area || '')}" maxlength="160" ${needsLocation?'required':'disabled'} placeholder="${needsLocation?updateCopy('Area, street, mosque or distribution point','الحي أو الشارع أو المسجد أو نقطة التوزيع'):updateCopy('Not needed for collection','غير مطلوب للاستلام')}"></label>`;
}
function updateDistributionMode(form) {
  saveCateringDraft(form);
  if (cateringDraft.distribution_mode==='pickup') cateringDraft.area='';
  renderKeepScroll();
}
function cateringDateField(required=false) {
  return `<label>${required?requiredLabel('Preferred date','التاريخ المفضل'):updateCopy('Event date (optional)','تاريخ المناسبة (اختياري)')}<input type="hidden" name="event_date" value="${escapeHtml(cateringDraft.event_date || '')}"><button type="button" class="premium-date-field" onclick="openCateringCalendar()"><span class="date-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"></rect><path d="M8 3v4M16 3v4M3 10h18"></path></svg></span><span id="cateringDateValue">${escapeHtml(cateringDateLabel(cateringDraft.event_date))}</span><small>${updateCopy('60-day availability','متاح خلال 60 يوماً')}</small></button></label>`;
}
function cateringServiceFields() {
  if (cateringDraft.event_type==='food_distribution') {
    const managed=cateringDraft.distribution_mode==='managed';
    return `<div class="distribution-intro"><span>${updateCopy('AVAILABLE YEAR-ROUND','متاح طوال العام')}</span><strong>${updateCopy('Meal Distribution','توزيع الوجبات')}</strong><p>${updateCopy('Request freshly prepared meals for collection, delivery or managed local distribution. This is a quotation request; our team will confirm availability and the final price before anything is booked.','اطلب وجبات طازجة للاستلام أو التوصيل أو التوزيع المحلي بإدارة ميراث. هذا طلب عرض سعر، وسيؤكد فريقنا التوفر والسعر النهائي قبل تثبيت أي حجز.')}</p></div>
      ${cateringField('meal_count','Approximate number of meals','العدد التقريبي للوجبات','number','required min="2" max="5000" step="1"')}
      ${cateringField('estimated_budget_sar','Estimated budget (SAR)','الميزانية التقديرية (ريال سعودي)','number','required min="100" max="1000000" step="1" inputmode="decimal"')}
      ${cateringSelect('recipient_group','Who should receive the meals?','الفئة المستفيدة من الوجبات',[['','Choose a recipient group','اختر الفئة المستفيدة'],['workers','Workers','العمال'],['families','Families in need','الأسر المحتاجة'],['community','Mosque / community distribution','توزيع مسجد / مجتمعي'],['mixed','Mixed recipients','فئات متنوعة'],['other','Other / guide me','أخرى / أرشدني']])}
      ${cateringSelect('meal_timing','Meal timing','وقت الوجبات',[['','Choose meal timing','اختر وقت الوجبات'],['lunch','Lunch','الغداء'],['dinner','Dinner','العشاء'],['other','Other / flexible','وقت آخر / مرن']])}
      ${cateringSelect('distribution_mode','Fulfilment','طريقة التنفيذ',[['','Choose fulfilment','اختر طريقة التنفيذ'],['managed','Meerath-managed distribution','توزيع بإدارة ميراث'],['pickup','Customer / representative collection','استلام العميل / المندوب'],['delivery','Deliver to a selected point','التوصيل إلى نقطة محددة']]).replace('name="distribution_mode"','name="distribution_mode" onchange="updateDistributionMode(this.form)"')}
      ${distributionAreaMarkup()}
      ${cateringDateField(true)}
      ${cateringField('dedication','Order dedication (optional)','إهداء الطلب (اختياري)','text','maxlength="100"')}
      <label class="consent privacy-choice"><input type="checkbox" name="donor_private" ${cateringDraft.donor_private?'checked':''}>${updateCopy('Keep the dedication private','إبقاء الإهداء خاصاً')}</label>
      <label class="consent privacy-choice ${managed?'':'muted-choice'}"><input type="checkbox" name="private_update_requested" ${cateringDraft.private_update_requested?'checked':''} ${managed?'':'disabled'}>${updateCopy('Request a private WhatsApp distribution update','طلب تحديث خاص للتوزيع عبر واتساب')}</label>
      <p class="distribution-privacy">${managed
        ? updateCopy('Where practical, we can share a private preparation or handover update. Recipient dignity and privacy come first, so a video is not guaranteed and faces—especially children—will not be recorded without permission.','عند الإمكان، يمكننا مشاركة تحديث خاص عن التجهيز أو التسليم. كرامة وخصوصية المستفيدين أولاً، لذلك لا نضمن الفيديو ولن نصور الوجوه، خصوصاً الأطفال، دون إذن.')
        : updateCopy('Private distribution updates are available only when Meerath manages the distribution.','التحديث الخاص متاح فقط عندما تدير ميراث عملية التوزيع.')}</p>`;
  }
  return `${cateringSelect('venue_type','Venue','المكان', [['','Choose a venue','اختر المكان'],['undecided','Not decided yet','لم يحدد بعد'],['meerath','At Meerath Kabab','في ميراث كباب'],['outside','Outside catering','تموين خارجي']]).replace('name="venue_type"','name="venue_type" onchange="updateCateringVenue(this.form)"')}
    ${cateringAreaMarkup()}
    ${cateringDateField(false)}
    <div class="guest-intro"><strong>${updateCopy('Guest breakdown','تفاصيل الضيوف')}</strong><p>${updateCopy('Children’s ages help us plan suitable seating, portions and service details, so your family enjoys a smoother and more comfortable event experience.','تساعدنا أعمار الأطفال على تجهيز المقاعد والكميات وتفاصيل الخدمة المناسبة، لنمنح عائلتك تجربة أكثر راحة وتنظيماً.')}</p></div>
    ${cateringField('adult_count','Approximate number of adults (12+)','العدد التقريبي للبالغين (12 سنة فأكثر)','number','required min="1" max="5000" step="1"')}
    ${cateringField('kids_5_11_count','Children aged 5–11 (optional)','الأطفال بعمر 5–11 سنة (اختياري)','number','min="0" max="5000" step="1"')}
    ${cateringField('kids_under_5_count','Children under 5 (optional)','الأطفال دون 5 سنوات (اختياري)','number','min="0" max="5000" step="1"')}`;
}
function cateringServiceName(type) {
  const names = {
    food_distribution: ['Meal Distribution','توزيع الوجبات'],
    family: ['family gathering','تجمع عائلي'],
    corporate: ['corporate event','مناسبة عمل'],
    wedding: ['wedding','حفل زفاف'],
    birthday: ['birthday celebration','احتفال عيد ميلاد'],
    anniversary: ['anniversary celebration','احتفال ذكرى سنوية'],
    private_event: ['private event','مناسبة خاصة'],
    other: ['special occasion','مناسبة خاصة'],
  };
  const value=names[type] || names.other;
  return updateCopy(value[0],value[1]);
}
function resetCateringConfirmation(destination) {
  cateringConfirmation=null;
  cateringDraft={};
  if (destination) go(destination); else renderKeepScroll();
}
function cateringConfirmationPage() {
  const row=cateringConfirmation;
  const distribution=row.event_type==='food_distribution';
  const service=cateringServiceName(row.event_type);
  const count=distribution ? row.meal_count : row.adult_count;
  const countText=count
    ? (distribution
      ? updateCopy(`Approximately ${count} meals`,`حوالي ${count} وجبة`)
      : updateCopy(`Approximately ${count} adults`,`حوالي ${count} بالغاً`))
    : updateCopy('Details received','تم استلام التفاصيل');
  const dateText=row.event_date ? cateringDateLabel(row.event_date) : updateCopy('Date to be discussed','سيتم تحديد التاريخ بالتواصل');
  return `<section class="screen catering-thanks-screen"><div class="topbar"><button class="icon-btn" type="button" onclick="resetCateringConfirmation('home')" aria-label="${updateCopy('Back to home','العودة للرئيسية')}">←</button><h2>${updateCopy('Request received','تم استلام الطلب')}</h2></div>
    <div class="catering-thanks-card">
      <div class="thanks-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m6.5 12.5 3.4 3.4 7.8-8"></path></svg></div>
      <span class="thanks-kicker">${updateCopy('REQUEST RECEIVED','تم استلام الطلب')}</span>
      <h3>${escapeHtml(updateCopy(`Thank you, ${row.name}!`,`شكراً لك، ${row.name}!`))}</h3>
      <p>${escapeHtml(updateCopy(`Thank you for considering ${APP_CONFIG.brand.name} for your ${service}. Your request has been received successfully.`,`شكراً لاختيارك ${APP_CONFIG.brand.nameAr} من أجل ${service}. تم استلام طلبك بنجاح.`))}</p>
      <div class="thanks-summary"><div><small>${updateCopy('REQUEST','الطلب')}</small><strong>${escapeHtml(service)}</strong></div><div><small>${updateCopy('ESTIMATE','العدد التقريبي')}</small><strong>${escapeHtml(countText)}</strong></div><div><small>${updateCopy('PREFERRED DATE','التاريخ المفضل')}</small><strong>${escapeHtml(dateText)}</strong></div></div>
      <p class="thanks-next">${escapeHtml(updateCopy(`Our team will contact you on ${row.mobile} to understand the final details and prepare the best quotation for you. Submitting this request does not confirm a booking.`,`سيتواصل فريقنا معك على ${row.mobile} لفهم التفاصيل النهائية وإعداد أفضل عرض سعر لك. إرسال هذا الطلب لا يؤكد الحجز.`))}</p>
      <div class="thanks-actions"><button class="btn btn-primary" type="button" onclick="resetCateringConfirmation('home')">${updateCopy('Back to home','العودة للرئيسية')}</button><button class="btn thanks-secondary" type="button" onclick="resetCateringConfirmation()">${updateCopy('Submit another request','إرسال طلب آخر')}</button></div>
    </div></section>${nav('more')}`;
}
function cateringPage() {
  if (!featureEnabled('catering')) return '';
  if (cateringConfirmation) return cateringConfirmationPage();
  seedCateringCustomer();
  return `<section class="screen"><div class="topbar">${back('home')}<h2>${updateCopy('Events & Catering','المناسبات والتموين')}</h2></div>
    <p>${escapeHtml(websiteText('catering_intro') || updateCopy('Tell us about your event. Our team will contact you with a quote; submitting this form does not confirm a booking.', 'أخبرنا عن مناسبتك وسيتواصل فريقنا معك لتقديم عرض سعر. إرسال الطلب لا يؤكد الحجز.'))}</p>
    <form class="catering-form" oninput="saveCateringDraft(this)" onchange="saveCateringDraft(this)" onsubmit="submitCatering(event)">
    ${cateringField('name','Full name','الاسم الكامل','text','required minlength="2" maxlength="100" autocomplete="name"')}
    ${cateringField('mobile','Mobile number','رقم الجوال','tel','required maxlength="25" autocomplete="tel"')}
    ${cateringSelect('event_type','Service / occasion','الخدمة / المناسبة', [['','Choose a service or occasion','اختر الخدمة أو المناسبة'],['food_distribution','Meal Distribution','توزيع الوجبات'],['family','Family gathering','تجمع عائلي'],['corporate','Corporate event','مناسبة عمل'],['wedding','Wedding','زفاف'],['birthday','Birthday','عيد ميلاد'],['anniversary','Anniversary','ذكرى سنوية'],['private_event','Private event','مناسبة خاصة'],['other','Other','أخرى']]).replace('name="event_type"','name="event_type" onchange="updateCateringService(this.form)"')}
    ${cateringServiceFields()}
    <label>${updateCopy(cateringDraft.event_type==='food_distribution'?'Meal preferences / budget / special requirements':'Menu preferences / special requirements',cateringDraft.event_type==='food_distribution'?'تفضيلات الوجبات / الميزانية / المتطلبات الخاصة':'تفضيلات الطعام / متطلبات خاصة')}<textarea class="field" name="message" maxlength="2000">${escapeHtml(cateringDraft.message || '')}</textarea></label>
    <label class="consent"><input type="checkbox" name="consent" required ${cateringDraft.consent ? 'checked' : ''}>${requiredLabel('I agree to be contacted about this enquiry.','أوافق على التواصل معي بخصوص هذا الطلب.')}</label>
    <button class="btn btn-primary" type="submit" ${cateringBusy ? 'disabled' : ''}>${updateCopy('Request a quote','طلب عرض سعر')}</button>
    <p class="catering-result" role="status" id="cateringResult"></p>
    </form>${cateringCalendarMarkup()}<div class="catering-contact"><a class="btn btn-wa" href="${waLink(updateCopy('Hello, I would like to enquire about catering.','مرحباً، أود الاستفسار عن خدمات التموين.'))}" target="_blank" rel="noopener">WhatsApp</a></div>
    </section>${nav('more')}`;
}
function saveCateringDraft(form) {
  cateringDraft = Object.fromEntries(new FormData(form));
  delete cateringDraft.company_website;
  cateringDraft.consent = form.elements.consent.checked;
  cateringDraft.donor_private = form.elements.donor_private?.checked === true;
  cateringDraft.private_update_requested = form.elements.private_update_requested?.checked === true;
}
function buildCateringPayload() {
  const payload = {...cateringDraft, lang:state.lang, company_website:''};
  if (payload.event_type === 'food_distribution') {
    payload.guest_count = payload.meal_count;
    payload.venue_type = payload.distribution_mode === 'pickup' ? 'meerath' : 'outside';
    if (payload.distribution_mode !== 'managed') payload.private_update_requested = false;
    delete payload.adult_count;
    delete payload.kids_5_11_count;
    delete payload.kids_under_5_count;
  }
  if (payload.event_type !== 'food_distribution') {
    for (const key of ['kids_5_11_count', 'kids_under_5_count']) {
      if (payload[key] == null || String(payload[key]).trim() === '') payload[key] = '0';
    }
  }
  if (payload.venue_type === 'meerath') payload.area = '';
  return payload;
}
async function submitCatering(event) {
  event.preventDefault();
  if (cateringBusy) return;
  const form = event.target;
  if (!form.reportValidity()) return;
  saveCateringDraft(form);
  const result = form.querySelector('#cateringResult');
  if (cateringDraft.event_type==='food_distribution' && !cateringDraft.event_date) {
    result.textContent=updateCopy('Please choose the preferred distribution date.','يرجى اختيار تاريخ التوزيع المفضل.');
    return;
  }
  const payload = buildCateringPayload();
  const button = form.querySelector('button[type="submit"]');
  cateringBusy = true; button.disabled = true;
  result.textContent = updateCopy('Sending…', 'جارٍ الإرسال…');
  try {
    const id = await websiteRpc(MENU_CONFIG.rpc.catering, {payload});
    if (typeof id !== 'string' || !isMenuId(id)) throw new Error('Invalid confirmation');
    cateringConfirmation = {
      name: payload.name,
      mobile: payload.mobile,
      event_type: payload.event_type,
      event_date: payload.event_date || '',
      meal_count: payload.meal_count || '',
      adult_count: payload.adult_count || '',
    };
    cateringDraft = {}; form.reset();
    renderKeepScroll();
  } catch (error) {
    result.textContent = error.name === 'AbortError'
      ? updateCopy('Confirmation timed out. Please contact us on WhatsApp before resubmitting to avoid a duplicate enquiry.', 'انتهت مهلة التأكيد. يرجى التواصل عبر واتساب قبل إعادة الإرسال لتجنب تكرار الطلب.')
      : updateCopy('Could not confirm your enquiry: ', 'تعذر تأكيد طلبك: ') + error.message;
  } finally { cateringBusy = false; button.disabled = false; }
}
function captureCartOrigin(screen) {
  if (screen !== 'cart' || !['home','menu','listing','detail','offers','more','cateringPage'].includes(state.screen)) return;
  const element = document.querySelector('#app > .screen');
  cartOrigin = {screen:state.screen, categoryId:state.categoryId, subcategoryId:state.subcategoryId,
    itemId:state.itemId, size:state.size, choice:state.choice, extras:[...state.extras], spice:state.spice,
    scroll:element?.scrollTop || 0, parentScroll:$app().parentElement.scrollTop || 0};
}
function cartBackMarkup() {
  return back('home').replace("go('home')", 'returnFromCart()');
}
function returnFromCart() {
  if (!cartOrigin) return go('home');
  const {scroll,parentScroll,...previous} = cartOrigin;
  Object.assign(state,previous,{cartEditKey:null}); render();
  requestAnimationFrame(() => {
    const element = document.querySelector('#app > .screen');
    if (element) element.scrollTop = scroll;
    $app().parentElement.scrollTop = parentScroll;
  });
}
window.addEventListener('load', loadWebsiteContent);
window.addEventListener('focus', loadWebsiteContent);
window.addEventListener('online', loadWebsiteContent);
window.addEventListener('load', loadAppAnnouncements);
window.addEventListener('focus', loadAppAnnouncements);
window.addEventListener('online', loadAppAnnouncements);
setInterval(() => {
  if (!document.hidden) loadAppAnnouncements();
}, 15000);
// Hide expired data while a refresh is pending or the device goes offline.
setInterval(() => {
  const box = document.getElementById('appAnnouncementSlot');
  const expired = appAnnouncements.some(a => a.ends_at && Date.parse(a.ends_at)<=Date.now());
  if (expired) appAnnouncements = appAnnouncements.filter(a => !a.ends_at || Date.parse(a.ends_at)>Date.now());
  if (box && (expired || (!liveAnnouncements().length && box.innerHTML))) {
    box.innerHTML = announcementMarkup();
  }
}, 1000);
