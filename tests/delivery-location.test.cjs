const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
function env(){const ctx=vm.createContext({state:{},document:{getElementById:()=>null},cartCopy:(en)=>en});vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/delivery-location.js'),'utf8'),ctx);return code=>vm.runInContext(code,ctx);}
test('coordinates reject missing, string, nonfinite and out-of-range values',()=>{
 const run=env();for(const input of ['{}',"{latitude:'24',longitude:46}",'{latitude:null,longitude:0}','{latitude:Infinity,longitude:0}','{latitude:91,longitude:0}','{latitude:0,longitude:181}'])assert.ok(!run(`validDeliveryPin(${input})`));
 assert.ok(run('validDeliveryPin({latitude:0,longitude:0})'));
});
test('saved pin must be explicitly confirmed and resets for a different address',()=>{
 const run=env();run('resetDeliveryLocation({latitude:24.7,longitude:46.7});');assert.equal(run('deliveryLocation.confirmed'),false);
 run('confirmDeliveryPin()');assert.equal(run('deliveryLocation.confirmed'),true);
 run('resetDeliveryLocation()');assert.equal(run('deliveryLocation.confirmed'),false);assert.equal(run('deliveryLocation.draft'),null);
});
test('rider map link is constructed solely from validated coordinates',()=>{
 const run=env();assert.equal(run("deliveryPinLink({latitude:24.7,longitude:46.7,label:'javascript:alert(1)'})"),'https://www.google.com/maps/search/?api=1&query=24.7,46.7');
 assert.equal(run("deliveryPinLink({latitude:'javascript:alert(1)',longitude:0})"),'');
});
