/* Map selection is explicit; asynchronous work is scoped to the current form. */
const deliveryLocation = {draft:null, confirmed:false, generation:0, lookup:0, map:null, marker:null, loader:null};
function validDeliveryPin(value) {
  return value && typeof value.latitude==='number' && Number.isFinite(value.latitude) && value.latitude>=-90 && value.latitude<=90 &&
    typeof value.longitude==='number' && Number.isFinite(value.longitude) && value.longitude>=-180 && value.longitude<=180;
}
function resetDeliveryLocation(address=null) {
  deliveryLocation.generation++; deliveryLocation.lookup++;
  deliveryLocation.draft=validDeliveryPin(address)?{latitude:address.latitude,longitude:address.longitude,label:address.label||''}:null;
  deliveryLocation.confirmed=false; deliveryLocation.map=null; deliveryLocation.marker=null;
  if(typeof state!=='undefined') state.checkoutPinConfirmedId=null;
}
function deliveryPinLink(pin) {
  return validDeliveryPin(pin)?`https://www.google.com/maps/search/?api=1&query=${pin.latitude},${pin.longitude}`:'';
}
function pinAddressText(address) {
  return [address.label || (validDeliveryPin(address)?`${address.latitude.toFixed(6)}, ${address.longitude.toFixed(6)}`:[address.area,address.street,address.building,address.unit].filter(Boolean).join(', ')),address.directions].filter(Boolean).join(' · ');
}
/* CX-4f: one screen, one button. Choosing the place (search, a tap on the map, dragging
   the pin or "my location") IS the confirmation; "Save address" stays at the bottom. */
function pinFormMarkup(middle='') {
  return `<div class="delivery-pin-form"><div id="delivery-place-search"></div>
    <div class="cx-pin-map-wrap"><div id="delivery-pin-map" role="region" aria-label="${cartCopy('Delivery location map','خريطة موقع التوصيل')}"></div>
    <button type="button" class="cx-locate" onclick="useDeliveryCurrentLocation()" aria-label="${cartCopy('Use current location','استخدام موقعي الحالي')}" title="${cartCopy('Use current location','استخدام موقعي الحالي')}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2"></circle><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"></path><circle cx="12" cy="12" r="7"></circle></svg></button></div>
    <p id="delivery-pin-status" role="status" aria-live="polite"></p>
    ${middle}
    <label class="address-form-label" for="rider-note">${cartCopy('Flat / building / nearby landmark (optional)','الشقة / المبنى / معلم قريب (اختياري)')}</label>
    <textarea class="field" id="rider-note" maxlength="300" rows="2" oninput="state.addressDirections=this.value">${escapeHtml(state.addressDirections||'')}</textarea></div>`;
}
function deliveryPinReady() { return validDeliveryPin(deliveryLocation.draft); }
function refreshDeliveryPinStatus(message='') {
  const el=document.getElementById('delivery-pin-status');
  if(el){
    el.textContent=message || (deliveryLocation.draft
      ? (deliveryLocation.draft.label || `${deliveryLocation.draft.latitude.toFixed(6)}, ${deliveryLocation.draft.longitude.toFixed(6)}`)
      : cartCopy('Search, tap the map or drag the pin to your entrance.','ابحث أو اضغط على الخريطة أو اسحب العلامة إلى مدخل المبنى.'));
    if(el.classList)el.classList.toggle('cx-pin-set',!message&&deliveryPinReady());
  }
  const save=document.getElementById('cx-save-address');
  if(save){
    const busy=typeof accountAddresses!=='undefined'&&accountAddresses.mutating;
    save.disabled=busy||!deliveryPinReady();
    save.textContent=deliveryPinReady()?save.getAttribute('data-ready'):save.getAttribute('data-wait');
  }
}
/* Kept for callers and tests: a chosen pin counts as confirmed. */
function confirmDeliveryPin() {
  if(!validDeliveryPin(deliveryLocation.draft))return;
  deliveryLocation.confirmed=true;refreshDeliveryPinStatus();
}
async function loadDeliveryMaps() {
  if(globalThis.google?.maps?.importLibrary)return;
  if(deliveryLocation.loader)return deliveryLocation.loader;
  const key=APP_CONFIG.maps?.browserKey;
  if(!key)throw Error('MAPS_NOT_CONFIGURED');
  deliveryLocation.loader=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    globalThis.oracyDeliveryMapsReady=()=>{delete globalThis.oracyDeliveryMapsReady;resolve();};
    script.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&loading=async&v=weekly&callback=oracyDeliveryMapsReady`;
    script.onerror=()=>{script.remove();delete globalThis.oracyDeliveryMapsReady;reject(Error('MAPS_LOAD_FAILED'));};
    document.head.appendChild(script);
  }).catch(error=>{deliveryLocation.loader=null;throw error;});
  return deliveryLocation.loader;
}
async function mountDeliveryMap() {
  const element=document.getElementById('delivery-pin-map');
  if(!element)return;
  const generation=++deliveryLocation.generation;
  const current=()=>generation===deliveryLocation.generation && element.isConnected && state.screen==='addAddressPage';
  try {
    await loadDeliveryMaps();
    const [{Map},{AdvancedMarkerElement},{PlaceAutocompleteElement},{Geocoder}]=await Promise.all([
      google.maps.importLibrary('maps'),google.maps.importLibrary('marker'),google.maps.importLibrary('places'),google.maps.importLibrary('geocoding')]);
    if(!current())return;
    const existing=deliveryLocation.draft;
    // Restaurant reference center only; it is never treated as a confirmed customer destination.
    const restaurant=APP_CONFIG.maps?.restaurant;
    const center=existing?{lat:existing.latitude,lng:existing.longitude}:
      {lat:restaurant.latitude,lng:restaurant.longitude};
    const map=new Map(element,{center,zoom:existing?17:14,mapId:APP_CONFIG.maps.mapId,streetViewControl:false,mapTypeControl:false,fullscreenControl:false});
    const marker=new AdvancedMarkerElement({map,position:existing?center:null,gmpDraggable:true,title:cartCopy('Delivery entrance','مدخل التوصيل')});
    deliveryLocation.map=map;deliveryLocation.marker=marker;
    const geocoder=new Geocoder();
    const choose=async(lat,lng,label='')=>{
      if(!current()||!validDeliveryPin({latitude:lat,longitude:lng}))return;
      const lookup=++deliveryLocation.lookup;
      deliveryLocation.draft={latitude:lat,longitude:lng,label:String(label).slice(0,180)};deliveryLocation.confirmed=true;
      marker.position={lat,lng};map.panTo({lat,lng});refreshDeliveryPinStatus();
      if(!label)try{
        const result=await geocoder.geocode({location:{lat,lng}});
        if(current()&&lookup===deliveryLocation.lookup){deliveryLocation.draft.label=String(result.results?.[0]?.formatted_address||'').slice(0,180);refreshDeliveryPinStatus();}
      }catch(_){/* Coordinates are sufficient when address lookup is unavailable. */}
    };
    deliveryLocation.choose=choose;
    map.addListener('click',e=>{if(e.latLng)choose(e.latLng.lat(),e.latLng.lng());});
    marker.addListener('dragend',()=>{const p=marker.position;if(p)choose(typeof p.lat==='function'?p.lat():p.lat,typeof p.lng==='function'?p.lng():p.lng);});
    const autocomplete=new PlaceAutocompleteElement();
    const search=document.getElementById('delivery-place-search');search.replaceChildren(autocomplete);
    autocomplete.addEventListener('gmp-select',async({placePrediction})=>{
      const searchVersion=++deliveryLocation.lookup;
      try{const place=placePrediction.toPlace();await place.fetchFields({fields:['location','formattedAddress']});
        if(current()&&searchVersion===deliveryLocation.lookup&&place.location){map.setZoom(17);await choose(place.location.lat(),place.location.lng(),place.formattedAddress||'');}
      }catch(_){if(current())refreshDeliveryPinStatus(cartCopy('Search failed. Try again or select on the map.','تعذر البحث. حاول مجدداً أو حدد الموقع على الخريطة.'));}
    });
    refreshDeliveryPinStatus();
  }catch(_){if(current())refreshDeliveryPinStatus(cartCopy('Map unavailable. Please try again later or call the restaurant.','الخريطة غير متاحة. حاول لاحقاً أو اتصل بالمطعم.'));}
}
function useDeliveryCurrentLocation() {
  const generation=deliveryLocation.generation;
  if(!navigator.geolocation||!deliveryLocation.map)return refreshDeliveryPinStatus(cartCopy('Use map search to select your location.','استخدم البحث لتحديد موقعك.'));
  navigator.geolocation.getCurrentPosition(position=>{
    if(generation!==deliveryLocation.generation||state.screen!=='addAddressPage')return;
    deliveryLocation.map.setZoom(17);deliveryLocation.choose(position.coords.latitude,position.coords.longitude);
  },()=>{if(generation===deliveryLocation.generation)refreshDeliveryPinStatus(cartCopy('Location permission unavailable. Search or select on the map.','تعذر الوصول للموقع. ابحث أو حدد الموقع على الخريطة.'));},{enableHighAccuracy:true,timeout:10000,maximumAge:0});
}
