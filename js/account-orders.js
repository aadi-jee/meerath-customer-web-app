/* Account history is server-owned. Never mix browser guest history with it. */
const accountOrders = {rows: [], busy: false, error: false, more: false, generation: 0};
function resetAccountOrders() {
  accountOrders.generation++;
  Object.assign(accountOrders, {rows: [], busy: false, error: false, more: false});
}
async function loadAccountOrders(append = false) {
  if (!state.isLoggedIn || accountOrders.busy) return;
  const generation = accountOrders.generation;
  const user = state.authUserId;
  accountOrders.busy = true;
  accountOrders.error = false;
  if (!append) accountOrders.rows = [];
  if (state.screen === 'track') renderKeepScroll();
  try {
    const rows = await customerAuthRpc('oracy_customer_orders_v1', {
      p_restaurant_id: MENU_CONFIG.restaurantId,
      p_offset: append ? accountOrders.rows.length : 0,
    });
    if (generation !== accountOrders.generation || user !== state.authUserId) return;
    if (!Array.isArray(rows)) throw new Error('Invalid order history response');
    accountOrders.more = rows.length > 20;
    const seen = new Set(accountOrders.rows.map(row => row.id));
    accountOrders.rows.push(...rows.slice(0,20).filter(row => !seen.has(row.id)));
  } catch (_) {
    if (generation === accountOrders.generation) accountOrders.error = true;
  } finally {
    if (generation === accountOrders.generation) {
      accountOrders.busy = false;
      if (state.screen === 'track') renderKeepScroll();
    }
  }
}
function accountOrderStatus(status) {
  const names = {
    pending_confirmation:['Awaiting confirmation','بانتظار التأكيد'], accepted:['Accepted','مقبول'],
    preparing:['Preparing','قيد التحضير'], ready:['Ready','جاهز'], completed:['Completed','مكتمل'],
    cancelled:['Cancelled','ملغي'], rejected:['Rejected','مرفوض'],
  };
  const pair = names[status] || ['Unknown status','حالة غير معروفة'];
  return authCopy(...pair);
}
function accountOrderType(type) {
  return t(type === 'delivery' ? 'delivery' : type === 'takeaway' ? 'takeaway' : 'dineIn');
}
function accountOrderSteps(type) {
  if (type === 'takeaway') return ['awaitingConfirmation','confirmed','preparing','readyPickup','collected'];
  if (type === 'delivery') return ['awaitingConfirmation','confirmed','preparing','ready','delivered'];
  return ['awaitingConfirmation','confirmed','preparing','ready','served'];
}
function accountOrderStep(status) {
  return ({pending_confirmation:0,accepted:1,preparing:2,ready:3,completed:4})[status] ?? 0;
}
function accountOrdersPage() {
  const history = state.orderTab === 'history';
  const visible = accountOrders.rows.filter(o => ['completed','cancelled','rejected'].includes(o.status) === history);
  const h = value => escapeHtml(String(value ?? ''));
  const date = value => {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat(state.lang === 'ar' ? 'ar-SA' : 'en-GB', {
      timeZone:'Asia/Riyadh',year:'numeric',month:'short',day:'2-digit',hour:'numeric',minute:'2-digit',hour12:true,
    }).format(d);
  };
  const empty = `<div class="orders-empty-state">
    <div class="orders-empty-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"></path><path d="M9 8h6M9 12h6"></path></svg></div>
    <h3>${history?t('noOrderHistory'):t('noActiveOrder')}</h3><p>${history?t('noOrderHistorySub'):t('noActiveOrderSub')}</p>
    ${history?'':`<button class="btn btn-primary orders-menu-btn" onclick="go('menu')">${t('browseMenu')}</button>`}</div>`;
  const activeCards = visible.map(order => {
    const steps = accountOrderSteps(order.fulfillment_type);
    const idx = accountOrderStep(order.status);
    return `<article class="active-order-card account-active-order">
      <div class="active-order-head"><div><span>${t('currentOrder')}</span><strong>#${h(order.order_number)}</strong></div>
      <span class="order-type-badge">${h(accountOrderType(order.fulfillment_type))}</span></div>
      <div class="order-timeline">${steps.map((step,i)=>`<div class="order-step ${i<idx?'done':i===idx?'now':''}"><div class="order-step-dot"></div><div class="order-step-copy"><strong>${t(step)}</strong></div></div>`).join('')}</div>
      <div class="active-order-items"><h4>${t('orderDetails')}</h4>
      ${(Array.isArray(order.items)?order.items:[]).map(line=>`<div class="active-order-item"><span>${h(line.quantity)} × ${h(line.name)}</span></div>`).join('')}
      <div class="account-order-total"><span>${authCopy('Total','الإجمالي')}</span><strong>${money(Number(order.total)||0)}</strong></div></div>
      <a class="btn btn-ghost orders-call-btn" href="tel:${h(RESTAURANT.phone)}">${t('callRestaurant')}</a></article>`;
  }).join('');
  const historyCards = visible.map(order => `<article class="history-order-card">
    <div class="history-order-top"><div><strong>#${h(order.order_number)}</strong><span>${h(date(order.created_at))}</span></div>
    <span class="history-status ${order.status==='rejected'||order.status==='cancelled'?'account-status-negative':''}">${h(accountOrderStatus(order.status))}</span></div>
    <div class="history-order-meta"><span>${h(accountOrderType(order.fulfillment_type))}</span><span>${(Array.isArray(order.items)?order.items:[]).reduce((n,line)=>n+(Number(line.quantity)||0),0)} ${t('items')}</span><strong>${money(Number(order.total)||0)}</strong></div>
    <details class="account-order-details"><summary>${t('orderDetails')}</summary>
    ${(Array.isArray(order.items)?order.items:[]).map(line=>`<div class="active-order-item">${h(line.quantity)} × ${h(line.name)}</div>`).join('')}
    ${order.rejection_reason?`<p>${h(order.rejection_reason)}</p>`:''}</details></article>`).join('');
  return `<section class="screen orders-screen account-orders-screen">
    <div class="topbar orders-topbar"><h2>${t('orders')}</h2><div class="account-orders-actions">
      <button class="account-orders-refresh" onclick="loadAccountOrders()" ${accountOrders.busy?'disabled':''}>${authCopy('Refresh','تحديث')}</button>${langSwitch()}</div></div>
    <div class="orders-tabs"><button class="${history?'':'active'}" onclick="state.orderTab='active';renderKeepScroll()">${t('activeOrders')}</button>
      <button class="${history?'active':''}" onclick="state.orderTab='history';renderKeepScroll()">${t('history')}</button></div>
    ${accountOrders.error?`<div class="account-orders-notice" role="alert">${authCopy('Could not load orders. Please retry.','تعذر تحميل الطلبات. حاول مجدداً.')}</div>`:''}
    ${accountOrders.busy&&!accountOrders.rows.length?`<div class="account-orders-notice" role="status">${authCopy('Loading orders…','جارٍ تحميل الطلبات…')}</div>`:''}
    ${!accountOrders.busy&&!accountOrders.error&&!visible.length?empty:''}
    ${history?`<div class="order-history-list">${historyCards}</div>`:`<div class="account-active-orders">${activeCards}</div>`}
    ${accountOrders.more?`<button class="btn btn-ghost account-load-more" onclick="loadAccountOrders(true)" ${accountOrders.busy?'disabled':''}>${authCopy('Load more','تحميل المزيد')}</button>`:''}
    </section>${nav('track')}`;
}
