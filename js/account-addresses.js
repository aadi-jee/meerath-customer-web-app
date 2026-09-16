/* Authenticated, tenant-scoped saved delivery addresses. */
const accountAddresses = {busy:false,mutating:false,error:false,loaded:false,generation:0};
function resetAccountAddresses() {
  if(typeof clearDeliveryQuote==='function') clearDeliveryQuote();
  accountAddresses.generation++;
  Object.assign(accountAddresses,{busy:false,mutating:false,error:false,loaded:false});
  if (typeof state !== 'undefined') { state.savedAddresses=[]; state.defaultAddressId=null; state.checkoutAddressId=null; state.lastDeliveryAddressId=null; state.checkoutPinConfirmedId=null; if(typeof resetDeliveryLocation==='function')resetDeliveryLocation(); }
}
function applyAccountAddresses(rows) {
  state.savedAddresses = rows.filter(row=>isMenuId(String(row?.id||''))).map(row=>({
    id:String(row.id),type:['home','work','other'].includes(row.address_type)?row.address_type:'other',
    area:String(row.area||''),street:String(row.street||''),building:String(row.building||''),
    latitude:row.latitude,longitude:row.longitude,label:String(row.label||''),updatedAt:row.updated_at,lastUsedAt:row.last_used_at,
    unit:String(row.unit||''),directions:String(row.directions||''),isDefault:row.is_default===true,
  }));
  state.defaultAddressId = state.savedAddresses.find(row=>row.isDefault)?.id || null;
  state.lastDeliveryAddressId=state.savedAddresses.filter(row=>row.lastUsedAt).sort((a,b)=>Date.parse(b.lastUsedAt)-Date.parse(a.lastUsedAt))[0]?.id||null;
  // Preserve a deliberate checkout selection, including a removed ID, so it must be reselected.
  if (!state.checkoutAddressId) state.checkoutAddressId = state.lastDeliveryAddressId || state.defaultAddressId;
}
async function loadAccountAddresses(force=false) {
  if (!state.isLoggedIn || accountAddresses.busy || (accountAddresses.loaded&&!force)) return;
  const generation=accountAddresses.generation,user=state.authUserId;
  accountAddresses.busy=true;accountAddresses.error=false;
  if (state.screen==='savedAddressesPage') renderKeepScroll();
  try {
    const rows=await customerAuthRpc('oracy_customer_addresses_v2',{p_restaurant_id:MENU_CONFIG.restaurantId});
    if(generation!==accountAddresses.generation||user!==state.authUserId)return;
    if(!Array.isArray(rows))throw Error('Invalid addresses response');
    applyAccountAddresses(rows);accountAddresses.loaded=true;
  } catch(_){if(generation===accountAddresses.generation)accountAddresses.error=true;}
  finally{if(generation===accountAddresses.generation){accountAddresses.busy=false;if(state.screen==='savedAddressesPage')renderKeepScroll();}}
  return generation===accountAddresses.generation&&!accountAddresses.error;
}
async function persistAccountAddress(address) {
  if(!state.isLoggedIn)throw Error('Sign in required');
  const user=state.authUserId,generation=accountAddresses.generation;
  const saved=await customerAuthRpc('oracy_save_customer_address_v2',{
    p_restaurant_id:MENU_CONFIG.restaurantId,p_address_id:state.editingAddressId||null,
    p_address_type:address.type,p_latitude:address.latitude,p_longitude:address.longitude,
    p_label:address.label||'',p_directions:address.directions||null,p_make_default:!state.defaultAddressId,
  });
  if(user!==state.authUserId||generation!==accountAddresses.generation)throw Error('Session changed');
  accountAddresses.loaded=false;if(!(await loadAccountAddresses(true)))throw Error('Address refresh failed');return saved;
}
async function removeAccountAddress(id){
  await customerAuthRpc('oracy_delete_customer_address_v1',{p_restaurant_id:MENU_CONFIG.restaurantId,p_address_id:id});
  accountAddresses.loaded=false;if(!(await loadAccountAddresses(true)))throw Error('Address refresh failed');
}
async function makeDefaultAccountAddress(id){
  await customerAuthRpc('oracy_set_default_customer_address_v1',{p_restaurant_id:MENU_CONFIG.restaurantId,p_address_id:id});
  accountAddresses.loaded=false;if(!(await loadAccountAddresses(true)))throw Error('Address refresh failed');
}
