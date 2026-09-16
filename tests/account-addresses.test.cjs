const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
const addressId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function env(rpc=async()=>[]) {
  const c=vm.createContext({
    state:{isLoggedIn:true,authUserId:'user-a',screen:'account',savedAddresses:[],defaultAddressId:null,editingAddressId:null},
    MENU_CONFIG:{restaurantId:'tenant-a'},customerAuthRpc:rpc,renderKeepScroll(){},
    isMenuId:value=>/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value),Error,
  });
  vm.runInContext(fs.readFileSync(path.join(root,'js/account-addresses.js'),'utf8'),c);
  return {c,run:s=>vm.runInContext(s,c)};
}

test('saved addresses use authenticated tenant RPC and restore default',async()=>{
  let call;
  const {run}=env(async(name,params)=>{call={name,params};return [{id:addressId,address_type:'home',area:'Olaya',street:'King Fahd',building:'12',is_default:true}];});
  assert.equal(await run('loadAccountAddresses()'),true);
  assert.equal(call.name,'oracy_customer_addresses_v2');
  assert.equal(call.params.p_restaurant_id,'tenant-a');
  assert.equal(run('state.defaultAddressId'),addressId);
  assert.equal(run('state.savedAddresses[0].area'),'Olaya');
});

test('address save sends trimmed tenant-scoped fields and refreshes list',async()=>{
  const calls=[];
  const {run}=env(async(name,params)=>{calls.push({name,params});return name==='oracy_save_customer_address_v2'?{id:addressId,is_default:true}:[{id:addressId,address_type:'work',area:'Olaya',street:'Main',building:'7',is_default:true}];});
  await run(`persistAccountAddress({type:'work',latitude:24.7,longitude:46.7,label:'Main',directions:''})`);
  assert.equal(calls[0].name,'oracy_save_customer_address_v2');
  assert.equal(calls[0].params.p_restaurant_id,'tenant-a');
  assert.equal(calls[0].params.p_address_id,null);
  assert.equal(calls[0].params.p_make_default,true);
  assert.equal(calls[0].params.p_latitude,24.7);
  assert.equal(calls[0].params.p_longitude,46.7);
  assert.equal(calls[1].name,'oracy_customer_addresses_v2');
});

test('logout discards an in-flight private address response',async()=>{
  let resolve;
  const {run}=env(()=>new Promise(r=>{resolve=r;}));
  const pending=run('loadAccountAddresses()');
  run('resetAccountAddresses();state.isLoggedIn=false;state.authUserId=""');
  resolve([{id:addressId,address_type:'home',area:'Private',street:'Private',building:'1',is_default:true}]);
  await pending;
  assert.equal(run('state.savedAddresses.length'),0);
});

test('guest cannot request saved addresses',async()=>{
  let calls=0;
  const {run}=env(async()=>{calls++;return [];});
  run('state.isLoggedIn=false');
  await run('loadAccountAddresses()');
  assert.equal(calls,0);
});

test('saved-address SQL is owner and tenant scoped with no direct table access',()=>{
  const sql=fs.readFileSync(path.join(root,'supabase/60_customer_saved_addresses.sql'),'utf8');
  assert.match(sql,/a\.restaurant_id=p_restaurant_id and a\.user_id=uid/);
  assert.match(sql,/revoke all on public\.customer_addresses from public,anon,authenticated/);
  assert.match(sql,/Maximum 10 addresses allowed/);
  assert.match(sql,/customer_addresses_one_default_idx/);
  assert.match(sql,/grant execute[\s\S]+to authenticated/);
  assert.doesNotMatch(sql,/grant [^;]* on public\.customer_addresses/i);
});

test('customer app loads address module and checkout consumes the default address',()=>{
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const app=fs.readFileSync(path.join(root,'js/app.js'),'utf8');
  assert.match(html,/js\/account-addresses\.js/);
  assert.match(app,/const id = state\.checkoutAddressId \|\| state\.lastDeliveryAddressId \|\| state\.defaultAddressId/);
  assert.match(app,/setDefaultAddress\('\$\{escapeHtml\(address\.id\)\}'\)/);
});

test('last used location takes priority over default only while it remains saved',async()=>{
 const last='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 let rows=[{id:addressId,address_type:'home',is_default:true},{id:last,address_type:'work',last_used_at:'2026-09-15T12:00:00Z'}];
 const {run}=env(async()=>rows);await run('loadAccountAddresses()');
 assert.equal(run('state.lastDeliveryAddressId'),last);assert.equal(run('state.checkoutAddressId'),last);
 rows=rows.slice(0,1);await run('loadAccountAddresses(true)');
 assert.equal(run('state.lastDeliveryAddressId'),null);
 // Removed explicit selection is retained, forcing reselection rather than silently changing destination.
 assert.equal(run('state.checkoutAddressId'),last);
});
test('logout while saving does not refresh or reveal the previous account address',async()=>{
 let resolve;let calls=0;const {run}=env(()=>{calls++;return new Promise(r=>resolve=r)});
 const pending=run("persistAccountAddress({type:'home',latitude:24.7,longitude:46.7,label:'',directions:''})");
 run('resetAccountAddresses();state.isLoggedIn=false;state.authUserId="user-b"');resolve({id:addressId});
 await assert.rejects(pending,/Session changed/);assert.equal(calls,1);assert.equal(run('state.savedAddresses.length'),0);
});
