/* Optional merchandising; prices, availability and checkout remain in menu code. */
let CUSTOMER_CONTENT = {recommendations: [], banners: []};
let contentLastSuccess = 0;
function applyContentPayload(payload) {
  if (!payload || payload.version !== 1 || payload.restaurant_id !== MENU_CONFIG.restaurantId ||
      !Array.isArray(payload.recommendations) || !Array.isArray(payload.banners)) throw new Error('Invalid content response');
  const recommendations = payload.recommendations.filter(r => r && isMenuId(r.source_item_id) &&
    isMenuId(r.recommended_item_id) && r.source_item_id !== r.recommended_item_id &&
    Number.isInteger(r.priority) && r.priority >= 1 && r.priority <= 3)
    .map(r => ({source_item_id:r.source_item_id, recommended_item_id:r.recommended_item_id, priority:r.priority}));
  const seen = new Set();
  const banners = payload.banners.filter(b => {
    if (!b || !Number.isInteger(b.slot) || b.slot < 1 || b.slot > 3 || seen.has(b.slot) ||
        !['menu','category','item','offers'].includes(b.target_kind) ||
        (['category','item'].includes(b.target_kind) && !isMenuId(b.target_id)) ||
        typeof b.title_en !== 'string' || !b.title_en.trim() || typeof b.button_en !== 'string' || !b.button_en.trim()) return false;
    seen.add(b.slot); return true;
  }).map(b => ({slot:b.slot, target_kind:b.target_kind, target_id:b.target_id,
    title_en:b.title_en.slice(0,80), title_ar:String(b.title_ar || '').slice(0,80),
    subtitle_en:String(b.subtitle_en || '').slice(0,160), subtitle_ar:String(b.subtitle_ar || '').slice(0,160),
    button_en:b.button_en.slice(0,35), button_ar:String(b.button_ar || '').slice(0,35),
    image_url:typeof b.image_url === 'string' ? b.image_url : ''})).sort((a,b) => a.slot-b.slot);
  const next = {recommendations,banners};
  const changed = Date.now()-contentLastSuccess > MENU_CONFIG.maxAgeMs || JSON.stringify(next) !== JSON.stringify(CUSTOMER_CONTENT);
  CUSTOMER_CONTENT = next; contentLastSuccess = Date.now(); return changed;
}
async function refreshCustomerContent() {
  // Independent timeout: content failure must not block menu loading or checkout.
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(`${MENU_CONFIG.url}/rest/v1/rpc/meerath_customer_content_v1`, {
      method:'POST', headers:{apikey:MENU_CONFIG.publicKey,'Content-Type':'application/json'},
      body:'{}', cache:'no-store', credentials:'omit', signal:controller.signal,
    });
    if (!response.ok) throw new Error(`Content API ${response.status}`);
    if (applyContentPayload(await response.json())) refreshMenuUI();
  } catch (error) {
    const hadContent = CUSTOMER_CONTENT.banners.length || CUSTOMER_CONTENT.recommendations.length;
    CUSTOMER_CONTENT = {recommendations:[],banners:[]}; contentLastSuccess = 0;
    console.warn('Meerath optional content:', error.message);
    if (hadContent) refreshMenuUI();
  } finally { clearTimeout(timer); }
}
let contentRequest = null;
function requestCustomerContent() {
  if (!contentRequest) contentRequest = refreshCustomerContent().finally(() => { contentRequest = null; });
  return contentRequest;
}
function contentReady() { return menuReady() && contentLastSuccess > 0 && Date.now()-contentLastSuccess <= MENU_CONFIG.maxAgeMs; }
function cartRecommendations() {
  if (!contentReady() || !state.cart.length) return [];
  const inCart = new Set(state.cart.map(l => l.id));
  const sources = new Set(state.cart.filter(l => canOrderItem(itemById(l.id))).map(l => l.id));
  const seen = new Set(), candidates = [];
  const edges = CUSTOMER_CONTENT.recommendations.filter(r => sources.has(r.source_item_id))
    .slice().sort((a,b) => a.priority-b.priority || a.source_item_id.localeCompare(b.source_item_id));
  for (const edge of edges) {
    const item = itemById(edge.recommended_item_id);
    if (!item || inCart.has(item.id) || seen.has(item.id) || !canAddItem(item)) continue;
    seen.add(item.id); candidates.push(item);
  }
  if (offerSpendStatus().remaining > 0) candidates.sort((a,b) => Number(!!a.offer)-Number(!!b.offer));
  return candidates.slice(0,3);
}
function addRecommended(id) {
  const item = cartRecommendations().find(i => i.id === id);
  if (!item) { toast(menuText('unavailableItem')); return; }
  if (enabledChoices(item, 'Variant').length || enabledChoices(item, 'Option').length || enabledChoices(item, 'Add-on').length) {
    openItem(id); return;
  }
  state.size = 'regular'; state.choice = null; state.extras = [];
  state.spice = 'medium';
  if (addToCart(item)) renderKeepScroll();
}
function cartRecommendationsMarkup() {
  const items = cartRecommendations();
  if (!items.length) return '';
  return `<section class="pairings"><h3>${cartCopy('Pairs well with your order','إضافات تناسب طلبك')}</h3>
    <div class="pairing-grid">${items.map(i => `<article class="pairing-card">
      <button class="pairing-detail" onclick="openItem('${i.id}')" aria-label="${loc(i,'name')}">
        <img src="${i.image}" alt="" loading="lazy"><span>${loc(i,'name')}</span></button>
      <div class="pairing-price">${itemPriceMarkup(i)}</div>
      ${i.offer ? `<span class="badge">${offerLabel(i.offer)}</span>` : ''}
      <button class="btn btn-primary" onclick="addRecommended('${i.id}')">+ ${t('add')}</button>
    </article>`).join('')}</div></section>`;
}
function visibleHomeBanners() {
  if (!contentReady()) return [];
  return CUSTOMER_CONTENT.banners.filter(b => {
    if (b.target_kind === 'item') return canOrderItem(itemById(b.target_id));
    if (b.target_kind === 'category') return CATEGORIES.some(c => c.id === b.target_id) && ITEMS.some(i => i.category === b.target_id && canOrderItem(i));
    if (b.target_kind === 'offers') return ITEMS.some(i => i.offer && canOrderItem(i));
    return ITEMS.some(i => canOrderItem(i));
  });
}
function contentText(b, key) { return escapeHtml(state.lang === 'ar' && b[`${key}_ar`] ? b[`${key}_ar`] : b[`${key}_en`]); }
function openHomeBanner(slot) {
  const b = visibleHomeBanners().find(b => b.slot === slot);
  if (!b) { toast(menuText('unavailableItem')); return; }
  if (b.target_kind === 'item') openItem(b.target_id);
  else if (b.target_kind === 'category') go('listing',{categoryId:b.target_id,subcategoryId:''});
  else go(b.target_kind === 'offers' ? 'offers' : 'menu');
}
function homeBannersMarkup() {
  const banners = visibleHomeBanners();
  if (!banners.length) return '';
  return `<section class="home-banners" aria-label="${cartCopy('Restaurant highlights','مختارات المطعم')}">
    <div class="banner-track" onscroll="updateBannerDots(this)">${banners.map((b,n) => `<article class="managed-banner" id="home-banner-${b.slot}" aria-label="${n+1} / ${banners.length}">
      ${b.image_url ? `<img class="managed-banner-image" src="${menuImage(b.image_url)}" alt="">` : ''}
      <div class="managed-banner-body"><h2>${contentText(b,'title')}</h2><p>${contentText(b,'subtitle')}</p>
      ${b.target_kind === 'item' ? `<div class="managed-banner-price">${itemPriceMarkup(itemById(b.target_id))}</div>` : ''}
      <button class="btn btn-primary" onclick="openHomeBanner(${b.slot})">${contentText(b,'button')}</button></div>
    </article>`).join('')}</div>
    ${banners.length > 1 ? `<div class="banner-dots">${banners.map((b,n) => `<button aria-label="${cartCopy('Banner','لافتة')} ${n+1}" aria-current="${n === 0}" onclick="scrollHomeBanner(${b.slot})"></button>`).join('')}</div>` : ''}
  </section>`;
}
function scrollHomeBanner(slot) {
  document.getElementById(`home-banner-${slot}`)?.scrollIntoView({behavior:'smooth',block:'nearest',inline:'start'});
}
function updateBannerDots(track) {
  const children = [...track.children], box = track.getBoundingClientRect();
  let closest = 0, distance = Infinity;
  children.forEach((child,n) => { const r=child.getBoundingClientRect(); const d=Math.abs((r.left+r.right-box.left-box.right)/2); if (d < distance) {distance=d;closest=n;} });
  track.parentElement.querySelectorAll('.banner-dots button').forEach((dot,n) => dot.setAttribute('aria-current',String(n === closest)));
}
