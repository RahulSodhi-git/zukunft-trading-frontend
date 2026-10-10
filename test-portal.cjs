const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const script=fs.readFileSync('customer.js','utf8');
function fixture({trading=false,connected=false,capital=null,paid=true,token=true}={}) {
  const html=fs.readFileSync(trading?'trading.html':'portal.html','utf8');
  const ids=[...html.matchAll(/id="([^"]+)"/g)].map(x=>x[1]);
  for(const p of ['binance','coinalyze'])ids.push(...['Status','Form','Save','Change','Cancel','Message'].map(s=>p+s));
  ids.push('binanceKey','binanceSecret','coinalyzeKey');
  const nodes=Object.fromEntries(ids.map(id=>[id,{id,value:'',disabled:false,hidden:id==='settings',textContent:'',innerHTML:'',className:'',placeholder:'',listeners:{},attributes:{},addEventListener(type,fn){this.listeners[type]=fn},setAttribute(k,v){this.attributes[k]=v},focus(){}}]));
  const calls=[],storage=new Map(token?[['ztToken','TEST_TOKEN']]:[]),location={hostname:'test.invalid',href:''};
  const state={binanceConnected:connected,coinalyzeConnected:connected,canReplace:true,message:'Keys are never displayed.'};
  let failure=null,overviewFailure=false;
  const ctx={document:{getElementById:id=>nodes[id],body:{dataset:{page:trading?'trading':'connections'}},activeElement:null},window:{},location,localStorage:{getItem:k=>storage.get(k),removeItem:k=>storage.delete(k)},setInterval:()=>1,clearInterval(){},console,fetch:async(url,opts)=>{
    const path=new URL(url).pathname;calls.push({path,opts});
    if(opts.method==='POST'&&failure)return {ok:false,status:400,json:async()=>({error:failure})};
    if(opts.method==='POST'&&path.endsWith('/binance'))state.binanceConnected=true;
    if(opts.method==='POST'&&path.endsWith('/coinalyze'))state.coinalyzeConnected=true;
    if(path==='/bot/overview'&&overviewFailure)return {ok:false,status:503,json:async()=>({error:'Unavailable'})};
    const data=path==='/me'?{user:{payment_status:paid?'active':'pending',customer_number:'ZT-TEST'}}:path==='/settings/connections'?{connections:{...state}}:path==='/bot/overview'?{bot:{actual_state:'running',provisioning_status:'ready',heartbeat_at:new Date().toISOString(),capital_amount:capital,open_positions:[{coin:'<script>BAD</script>',entry:null,now:1,pnlUsdt:2}],recent_closed_trades:[]}}:{setup:{},note:'Saved'};
    return {ok:true,status:200,json:async()=>data};
  }};
  vm.runInNewContext(script,ctx,{timeout:1000});
  return {nodes,calls,storage,location,state,setFailure:value=>failure=value,setOverviewFailure:value=>overviewFailure=value};
}
const settle=async()=>{for(let i=0;i<8;i++)await new Promise(setImmediate)};
const submit=(f,p)=>f.nodes[p+'Form'].listeners.submit({preventDefault(){}});
(async()=>{
  assert.ok(!/capitalAmount|Capital to Trade|Trading capital/.test(fs.readFileSync('portal.html','utf8')));
  assert.match(fs.readFileSync('trading.html','utf8'),/id="capitalAmount"/);
  assert.match(script,/type="password"/);
  const first=fixture();await settle();assert.equal(first.nodes.continue.disabled,true);
  first.nodes.binanceKey.value='ZT-SETUP-001';first.nodes.binanceSecret.value='not-a-valid-key-12345';await submit(first,'binance');
  assert.ok(first.nodes.binanceMessage.textContent.includes('account ID'));assert.equal(first.calls.filter(x=>x.opts.method==='POST').length,0);
  first.nodes.binanceKey.value='valid-binance-key-12345';first.nodes.binanceSecret.value='valid-secret-key-12345';await submit(first,'binance');
  assert.equal(first.nodes.continue.disabled,true);assert.equal(first.nodes.binanceKey.value,'');assert.equal(first.nodes.binanceKey.disabled,true);assert.ok(first.nodes.binanceKey.placeholder.includes('••••'));
  first.nodes.coinalyzeKey.value='valid-coinalyze-key-12345';await submit(first,'coinalyze');assert.equal(first.nodes.continue.disabled,false);
  assert.ok(!first.calls.some(x=>x.path.includes('capital')),'API navigation does not require capital');
  first.nodes.continue.listeners.click();assert.equal(first.location.href,'trading.html');
  const failed=fixture();await settle();failed.setFailure('{"message":"Invalid/Missing API key"}');failed.nodes.coinalyzeKey.value='invalid-coinalyze-12345';await submit(failed,'coinalyze');assert.ok(!failed.nodes.coinalyzeMessage.textContent.includes('{'));assert.equal(failed.nodes.continue.disabled,true);assert.equal(failed.nodes.coinalyzeKey.value,'');
  failed.setFailure('Binance server cooldown. Retry after 2026-10-10T20:50:43.441Z.');failed.nodes.binanceKey.value='valid-binance-key-12345';failed.nodes.binanceSecret.value='valid-secret-key-12345';await submit(failed,'binance');assert.ok(failed.nodes.binanceMessage.textContent.includes('temporarily blocked'));
  const returning=fixture({trading:true,connected:true});await settle();assert.equal(returning.nodes.settings.hidden,true);assert.equal(returning.nodes.binanceKey.disabled,true);assert.ok(returning.nodes.openPositions.innerHTML.includes('&lt;script&gt;'));assert.ok(!returning.nodes.openPositions.innerHTML.includes('NaN'));
  await returning.nodes.openSettings.listeners.click();assert.equal(returning.nodes.settings.hidden,false);
  returning.nodes.binanceChange.listeners.click();returning.nodes.binanceKey.value='new-key-binance-12345';returning.nodes.binanceSecret.value='new-secret-1234567890';returning.setFailure('Invalid replacement; existing keys unchanged');await submit(returning,'binance');assert.equal(returning.state.binanceConnected,true);assert.ok(returning.calls.some(x=>x.path==='/settings/binance'));assert.equal(returning.nodes.binanceSecret.value,'');
  returning.nodes.binanceCancel.listeners.click();assert.equal(returning.nodes.binanceKey.disabled,true);
  returning.nodes.capitalAmount.value='50';await returning.nodes.capitalForm.listeners.submit({preventDefault(){}});assert.ok(returning.nodes.capitalMessage.textContent.includes('100'));assert.ok(!returning.calls.some(x=>x.path==='/onboarding/capital'));
  const missing=fixture({token:false});assert.equal(missing.location.href,'account.html');
  const unpaid=fixture({paid:false});await settle();assert.equal(unpaid.location.href,'payment.html');assert.equal(unpaid.calls.length,1);
  const incomplete=fixture({trading:true});await settle();assert.equal(incomplete.location.href,'portal.html');
  for(let i=0;i<1000;i++){const f=fixture({connected:i%2===0});await settle();assert.equal(f.nodes.continue.disabled,i%2!==0);assert.equal(f.storage.get('ztToken'),'TEST_TOKEN');}
  console.log('PASS: API-only setup, independent saves, masking, validation, capital-free progression, Settings replacement and failed-key preservation, payment/session gates, escaped data; 1,000 mocked page lifecycles.');
})().catch(error=>{console.error(error);process.exitCode=1});
