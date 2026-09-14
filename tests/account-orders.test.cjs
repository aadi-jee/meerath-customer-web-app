const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
function env(rpc=async()=>[]) {
 const c=vm.createContext({state:{isLoggedIn:true,authUserId:'user-a',screen:'track',lang:'en'},
 MENU_CONFIG:{restaurantId:'tenant-a'},RESTAURANT:{phone:'+966500000000'},customerAuthRpc:rpc,renderKeepScroll(){},Intl,Date,
 nav:()=>'',langSwitch:()=>'',
 authCopy:(en)=>en,t:x=>x,money:n=>String(n),escapeHtml:s=>s.replaceAll('<','&lt;').replaceAll('>','&gt;')});
 vm.runInContext(fs.readFileSync(path.join(root,'js/account-orders.js'),'utf8'),c);
 return {c,run:s=>vm.runInContext(s,c)};
}
test('account history uses tenant RPC and handles empty state',async()=>{
 let params;const {run}=env(async(name,p)=>{params=p;assert.equal(name,'oracy_customer_orders_v1');return [];});
 await run('loadAccountOrders()');assert.equal(params.p_restaurant_id,'tenant-a');assert.equal(params.p_offset,0);
 assert.match(run('accountOrdersPage()'),/noActiveOrder/);
});
test('pagination requests next offset and retains first page',async()=>{
 const offsets=[];const {run}=env(async(n,p)=>{offsets.push(p.p_offset);return Array.from({length:21},(_,i)=>({id:String(i+p.p_offset)}));});
 await run('loadAccountOrders()');assert.equal(run('accountOrders.rows.length'),20);
 await run('loadAccountOrders(true)');assert.equal(run('accountOrders.rows.length'),40);assert.deepEqual(offsets,[0,20]);
});
test('logout discards in-flight history and clears rows',async()=>{
 let resolve;const {run}=env(()=>new Promise(r=>resolve=r));
 const pending=run('loadAccountOrders()');run('resetAccountOrders();state.isLoggedIn=false;state.authUserId=""');
 resolve([{id:'private-order'}]);await pending;assert.equal(run('accountOrders.rows.length'),0);
});
test('guest cannot request account history',async()=>{
 let calls=0;const {run}=env(async()=>{calls++;return[];});run('state.isLoggedIn=false');await run('loadAccountOrders()');assert.equal(calls,0);
});
test('network failures show retry instead of empty history',async()=>{
 const {run}=env(async()=>{throw Error('offline');});await run('loadAccountOrders()');
 assert.match(run('accountOrdersPage()'),/Could not load orders/);assert.doesNotMatch(run('accountOrdersPage()'),/No orders linked/);
});
test('historical item text is escaped and cancelled status retained',async()=>{
 const {run}=env(async()=>[{id:'a',order_number:'<script>',status:'cancelled',created_at:'2026-09-14T12:00:00Z',items:[{name:'<script>',quantity:1,unit_price:10}],total:10}]);
 await run('loadAccountOrders()');run("state.orderTab='history'");const html=run('accountOrdersPage()');assert.doesNotMatch(html,/<script>/);assert.match(html,/Cancelled/);assert.match(html,/&lt;script&gt;/);
});
test('SQL API filters both owner and tenant, exposes no tracking token',()=>{
 const sql=fs.readFileSync(path.join(root,'supabase/58_customer_account_orders.sql'),'utf8');
 assert.match(sql,/o.restaurant_id = p_restaurant_id and o.customer_user_id = auth.uid\(\)/);
 assert.match(sql,/from public,anon/);assert.doesNotMatch(sql,/tracking_token/);
 assert.match(sql,/phone_confirmed_at is not null/);assert.doesNotMatch(sql,/right\(regexp_replace/);
});
