const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync('portal.html','utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
function fixture(connected) {
  const ids=[...html.matchAll(/id="([^"]+)"/g)].map(x=>x[1]);
  const nodes=Object.fromEntries(ids.map(id=>[id,{id,value:'',textContent:'',innerHTML:'',hidden:id==='connectionSettings',style:{},listeners:{},attributes:{},className:'',classList:{values:new Set(),add(x){this.values.add(x)},remove(x){this.values.delete(x)},toggle(x,on){on?this.add(x):this.remove(x)}},addEventListener(type,fn){this.listeners[type]=fn},setAttribute(k,v){this.attributes[k]=v},appendChild(child){child.parentNode=this}}]));
  nodes.setupArea.parentNode={id:'initialSetup'};
  nodes.bg.getContext=()=>({createRadialGradient:()=>({addColorStop(){}})});
  const calls=[];
  const status={binance_status:connected?'verified':'not_connected',coinalyze_status:connected?'verified':'not_connected',desired_state:'paused',actual_state:'paused',provisioning_status:'pending'};
  const globals={};
  const storage=new Map([['ztToken','TEST_TOKEN']]);
  let fail=false;
  const ctx={document:{getElementById:id=>nodes[id],activeElement:null,querySelectorAll:()=>[],body:{style:{}}},window:{},localStorage:{getItem:k=>storage.get(k),removeItem:k=>storage.delete(k)},location:{protocol:'https:',hostname:'test.invalid'},fetch:async(url,opts)=>{
    calls.push({url,opts});
    const path=new URL(url).pathname;
    const error=fail&&opts.method==='POST';
    const data=path==='/me'?{user:{payment_status:'active',...status}}:path==='/settings/connections'?{connections:{message:'Pause and close all positions before replacing keys.'}}:path==='/bot/overview'?{bot:{...status,open_positions:[],recent_closed_trades:[]}}:{setup:status,note:'Encrypted and saved'};
    return {ok:!error,json:async()=>error?{error:'Replacement invalid; previous credentials unchanged'}:data};
  },addEventListener:(name,fn)=>{globals[name]=fn},setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,matchMedia:()=>({matches:true}),innerWidth:1200,innerHeight:800,requestAnimationFrame(){},alert(){},console};
  vm.runInNewContext(script,ctx,{timeout:1000});
  return {nodes,calls,storage,globals,setFail:v=>{fail=v}};
}
const settle=async()=>{for(let i=0;i<8;i++)await new Promise(setImmediate)};
(async()=>{
  const first=fixture(false);await settle();
  assert.equal(first.nodes.setupArea.parentNode.id,'initialSetup');
  first.nodes.binanceKey.value='KEY';first.nodes.binanceSecret.value='SECRET';
  first.nodes.verifyKeys.listeners.click();await settle();
  assert.ok(first.calls.some(c=>c.url.endsWith('/onboarding/binance')));
  const returning=fixture(true);await settle();
  assert.equal(returning.nodes.setupArea.parentNode.id,'settingsConnections');
  assert.equal(returning.nodes.connectionSettings.hidden,true);
  assert.equal(returning.nodes.verifyKeys.textContent,'Replace Binance keys');
  returning.nodes.openSettings.listeners.click();await settle();
  assert.equal(returning.nodes.connectionSettings.hidden,false);
  assert.equal(returning.nodes.openSettings.attributes['aria-expanded'],'true');
  assert.ok(returning.calls.some(c=>c.url.endsWith('/settings/connections')));
  returning.nodes.binanceKey.value='NEW_KEY';returning.nodes.binanceSecret.value='NEW_SECRET';
  returning.nodes.verifyKeys.listeners.click();await settle();
  assert.ok(returning.calls.some(c=>c.url.endsWith('/settings/binance')));
  assert.equal(returning.nodes.binanceSecret.value,'');
  returning.setFail(true);
  returning.nodes.binanceSecret.value='INVALID_SECRET';returning.nodes.verifyKeys.listeners.click();await settle();
  assert.equal(returning.nodes.binanceSecret.value,'');
  assert.equal(returning.nodes.customerInterface.classList.values.has('show'),true);
  assert.ok(returning.nodes.keyMsg.textContent.includes('previous credentials unchanged'));
  assert.equal(returning.storage.get('ztToken'),'TEST_TOKEN');
  assert.ok(!returning.globals.beforeunload,'Reload must not clear the session');
  assert.match(html,/id="binanceKey" type="password"/);
  assert.match(html,/id="coinalyzeKey" type="password"/);
  for(let i=0;i<1000;i++) { const f=fixture(i%2===0); await settle(); assert.equal(f.storage.get('ztToken'),'TEST_TOKEN'); }
  console.log('PASS: initial setup, returning-user Settings, replacement routes, masked/cleared keys, failed-update preservation and session reload; 1,000 mocked portal lifecycles. No browser rendering or live API calls.');
})().catch(error=>{console.error(error);process.exitCode=1});
