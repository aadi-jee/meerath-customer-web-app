const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');

function environment() {
  const storage = new Map();
  const requests = [];
  const context = vm.createContext({
    console, URL, Intl, Date, AbortController,
    setTimeout: () => 1, clearTimeout: () => {},
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key),
    },
    window: {addEventListener: () => {}},
    document: {addEventListener: () => {}, hidden: false},
    fetch: async (url, options = {}) => {
      requests.push({url, options});
      return {ok:true,status:200,json:async()=>({})};
    },
  });
  for (const file of ['brand-config.js', 'data.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'js', file), 'utf8'), context);
  }
  vm.runInContext(`const state={lang:'en',screen:'account',isLoggedIn:false,authUserId:'',customerName:'',
    customerPhone:'',customerEmail:'',customer:{name:'',mobile:'',email:''}};
    const renderKeepScroll=()=>{};`, context);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/auth.js'), 'utf8'), context);
  return {run: code => vm.runInContext(code, context), storage, requests, context};
}

test('Saudi mobile normalization accepts local and international formats', () => {
  const {run} = environment();
  assert.equal(run(`normalizeSaudiMobile('050 123 4567')`), '+966501234567');
  assert.equal(run(`normalizeSaudiMobile('+966 50 123 4567')`), '+966501234567');
  assert.equal(run(`normalizeSaudiMobile('123')`), null);
});

test('OTP request uses Supabase Auth and never sends a secret key', async () => {
  const {run, requests} = environment();
  await run(`requestPhoneOtp('+966501234567')`);
  assert.match(requests[0].url, /\/auth\/v1\/otp$/);
  const body = JSON.parse(requests[0].options.body);
  assert.equal(body.phone, '+966501234567');
  assert.equal(body.create_user, true);
  assert.equal(requests[0].options.headers.apikey.startsWith('sb_publishable_'), true);
  assert.equal('Authorization' in requests[0].options.headers, false);
});

test('verified OTP session is tenant-scoped and restores the customer', async () => {
  const {run, storage, context} = environment();
  context.fetch = async () => ({ok:true,status:200,json:async()=>({
    access_token:'a'.repeat(40),refresh_token:'r'.repeat(40),expires_in:3600,
    user:{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',phone:'+966501234567'},
  })});
  await run(`verifyPhoneOtp('+966501234567','123456')`);
  assert.equal(storage.has('oracy:meerath-kabab:auth-session:v1'), true);
  assert.equal(run('customerAuthSession.user.phone'), '+966501234567');
});

test('profile RPC carries the customer bearer token', async () => {
  const {run, requests} = environment();
  run(`saveAuthSession({access_token:'a'.repeat(40),refresh_token:'r'.repeat(40),expires_in:3600,
    user:{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',phone:'+966501234567'}})`);
  await run(`customerAuthRpc(MENU_CONFIG.rpc.customerProfile,{p_restaurant_id:MENU_CONFIG.restaurantId})`);
  assert.match(requests[0].url, /oracy_customer_profile_v1$/);
  assert.equal(requests[0].options.headers.Authorization, `Bearer ${'a'.repeat(40)}`);
});

test('sign out clears local trusted session even if network logout fails', async () => {
  const {run, storage, context} = environment();
  run(`saveAuthSession({access_token:'a'.repeat(40),refresh_token:'r'.repeat(40),expires_in:3600,
    user:{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',phone:'+966501234567'}});state.isLoggedIn=true`);
  context.fetch = async () => { throw new Error('offline'); };
  await run('signOutCustomer()');
  assert.equal(storage.has('oracy:meerath-kabab:auth-session:v1'), false);
  assert.equal(run('state.isLoggedIn'), false);
});

test('trusted checkout resumes only the matching stored phone', async () => {
  const {run, storage} = environment();
  run(`saveAuthSession({access_token:'a'.repeat(40),refresh_token:'r'.repeat(40),expires_in:3600,
    user:{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',phone:'+966501234567'}})`);
  run(`loadCustomerProfile=async()=>{state.isLoggedIn=true;state.customerName='Adeel';return {full_name:'Adeel'}}`);
  assert.equal(await run(`resumeTrustedCustomerForPhone('+966501234567')`), true);
  assert.equal(await run(`resumeTrustedCustomerForPhone('+966509999999')`), false);
  assert.equal(storage.has('oracy:meerath-kabab:auth-session:v1'), true);
});
