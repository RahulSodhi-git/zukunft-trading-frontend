(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const trading = document.body.dataset.page === 'trading';
  const API = window.ZUKUNFT_API_URL || (['localhost', '127.0.0.1'].includes(location.hostname) ? 'http://localhost:5050' : 'https://zukunft-trading-backend.onrender.com');
  const token = localStorage.getItem('ztToken') || localStorage.getItem('zukunftToken');
  let connections = {}, setup = {}, overviewTimer, sessionActive = true, refreshInFlight = false;
  const esc = value => String(value == null ? '—' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number = (value, digits = 2) => value == null || value === '' || !Number.isFinite(Number(value)) ? '—' : Number(value).toLocaleString(undefined, {maximumFractionDigits:digits});
  function message(id, value = '', kind = '') { if ($(id)) { $(id).textContent = value; $(id).className = 'message ' + kind; } }
  function friendly(value) {
    let text = String(value || 'The request could not be completed. Please try again.');
    try { const data = JSON.parse(text); text = data.message || data.msg || data.error || text; } catch {}
    if (/Invalid\/Missing API key/i.test(text)) return 'Coinalyze did not accept this key. Copy your API key from Coinalyze, not your Binance key.';
    if (/cooldown|banned until|too many requests/i.test(text)) {
      const retry = text.match(/Retry after ([\dT:.Z-]+)/i);
      const time = retry && Number.isFinite(Date.parse(retry[1])) ? new Date(retry[1]).toLocaleString() : null;
      return 'Binance has temporarily blocked the verification server.' + (time ? ' Retry after ' + time + '.' : ' Please wait before retrying.') + ' Your keys have not been rejected or saved.';
    }
    if (text === 'Invalid input') return 'Check that you pasted the service API key and secret, not your Zukunft account ID.';
    return text;
  }
  function endSession() { sessionActive = false; clearInterval(overviewTimer); localStorage.removeItem('ztToken'); localStorage.removeItem('zukunftToken'); location.href = 'account.html'; }
  async function api(path, body) {
    const response = await fetch(API + path, {method:body ? 'POST' : 'GET',headers:{'Content-Type':'application/json',Authorization:'Bearer ' + token},body:body ? JSON.stringify(body) : undefined});
    const data = await response.json();
    if (response.status === 401) { endSession(); throw new Error('Please sign in again.'); }
    if (!response.ok) throw new Error(friendly(data.error));
    return data;
  }
  function card(provider, name, subtitle, fields, url, link, note) {
    return '<article class="card connection-card"><div class="connection-heading"><div class="provider"><span class="provider-icon '+provider+'">'+(provider==='binance'?'BN':'CZ')+'</span><h2>'+name+'</h2></div><span class="tag" id="'+provider+'Status">Not connected</span></div><p class="muted">'+subtitle+'</p><form id="'+provider+'Form" autocomplete="off">'+fields+'<div class="button-row"><button id="'+provider+'Save" class="primary">Verify & save</button><button id="'+provider+'Change" type="button" class="quiet" hidden>Change keys</button><button id="'+provider+'Cancel" type="button" class="quiet" hidden>Cancel</button></div><p id="'+provider+'Message" class="message" role="status" aria-live="polite"></p></form><div class="provider-help"><span>'+note+'</span><a href="'+url+'" target="_blank" rel="noopener noreferrer">'+link+' ↗</a></div></article>';
  }
  function field(id, label) { return '<label for="'+id+'">'+label+'</label><input id="'+id+'" name="zt-'+id+'-credential" type="password" autocomplete="new-password" autocapitalize="none" spellcheck="false" placeholder="Paste '+label.toLowerCase()+'" required>'; }
  $('connections').innerHTML = card('binance','Binance Futures','Connect the exchange account your bot will trade on.',field('binanceKey','Binance API key')+field('binanceSecret','Binance secret key'),'https://www.binance.com/en/my/settings/api-management','API management','Enable Futures. Keep withdrawals disabled.') + card('coinalyze','Coinalyze','Connect market data used by your trading strategies.',field('coinalyzeKey','Coinalyze API key'),'https://api.coinalyze.net/v1/doc/','Get your API key','Use a Coinalyze key, not a Binance key.');
  const fields = {binance:['binanceKey','binanceSecret'], coinalyze:['coinalyzeKey']};
  function isConnected(provider) { return connections[provider+'Connected'] === true; }
  function updateProvider(provider) {
    const saved = isConnected(provider), editing = !saved;
    $(provider+'Status').textContent = saved ? 'Connected' : 'Not connected';
    $(provider+'Status').className = 'tag' + (saved ? ' connected' : '');
    fields[provider].forEach(id => { $(id).value=''; $(id).disabled=saved; $(id).placeholder=saved?'•••••••••••• · saved securely':'Paste '+(id==='binanceSecret'?'Binance secret key':provider==='binance'?'Binance API key':'Coinalyze API key'); });
    $(provider+'Save').hidden=!editing; $(provider+'Change').hidden=!saved; $(provider+'Cancel').hidden=true;
    $(provider+'Change').disabled=connections.canReplace===false;
  }
  async function loadConnections() {
    const data = await api('/settings/connections'); connections = data.connections;
    ['binance','coinalyze'].forEach(updateProvider);
    if (trading) $('settingsNote').textContent = connections.message;
    else { const complete = isConnected('binance') && isConnected('coinalyze'); $('continue').disabled=!complete; $('progressText').textContent=complete?'Both connections saved. Your trading interface is ready to open.':'Connect both services to continue. No trading amount is needed here.'; }
  }
  for (const provider of ['binance','coinalyze']) {
    $(provider+'Change').addEventListener('click', () => { fields[provider].forEach(id=>{$(id).disabled=false;$(id).placeholder='Paste replacement key';}); $(provider+'Save').hidden=false; $(provider+'Change').hidden=true; $(provider+'Cancel').hidden=false; message(provider+'Message','Your saved connection stays active until replacement keys are verified.'); $(fields[provider][0]).focus(); });
    $(provider+'Cancel').addEventListener('click', () => {updateProvider(provider);message(provider+'Message');});
    $(provider+'Form').addEventListener('submit', async event => {
      event.preventDefault(); const values = fields[provider].map(id=>$(id).value.trim());
      if (values.some(value=>value.length<(provider==='binance'?16:12) || /^ZT-/i.test(value) || /[•#\s]/.test(value))) { message(provider+'Message','Paste the actual '+(provider==='binance'?'Binance API key and secret':'Coinalyze API key')+'. Your Zukunft account ID is not an API key.','error'); return; }
      const body = provider==='binance'?{binanceApiKey:values[0],binanceApiSecret:values[1]}:{coinalyzeApiKey:values[0]};
      const button = $(provider+'Save'); button.disabled=true; button.textContent='Checking connection…'; message(provider+'Message','Verifying and encrypting your keys…');
      try { const data = await api((trading?'/settings/':'/onboarding/')+provider,body); setup=data.setup; await loadConnections(); message(provider+'Message','Connected. Keys saved encrypted and hidden.','success'); }
      catch (error) { message(provider+'Message',error.message,'error'); }
      finally { fields[provider].forEach(id=>{$(id).value='';}); button.disabled=false; button.textContent='Verify & save'; }
    });
  }
  $('logout').addEventListener('click',endSession);
  if (!token) { endSession(); return; }
  if (!trading) $('continue').addEventListener('click',()=>{if(isConnected('binance')&&isConnected('coinalyze'))location.href='trading.html';});
  function signed(value, digits=2) { return value==null?'—':(Number(value)>=0?'+':'')+number(value,digits); }
  function age(opened) { if(!opened)return '—'; const elapsed=Math.max(0,Date.now()-Number(opened));return Math.floor(elapsed/3600000)+'h '+Math.floor(elapsed%3600000/60000)+'m'; }
  function renderBot(bot) {
    setup=bot; const heartbeat=Date.parse(bot.heartbeat_at||bot.worker_heartbeat_at||''),fresh=Number.isFinite(heartbeat)&&Date.now()-heartbeat>=0&&Date.now()-heartbeat<90000;
    const state=fresh?(bot.actual_state||'stopped'):'offline'; $('botState').textContent=state==='offline'?'Worker offline':state.charAt(0).toUpperCase()+state.slice(1); $('botState').className='tag'+(state==='running'?' connected':'');
    const ready=fresh&&bot.provisioning_status==='ready'; $('startBot').disabled=!ready; $('pauseBot').disabled=false; $('stopBot').disabled=!ready||(bot.open_positions||[]).length>0;
    $('workerNote').textContent=ready?'Your customer worker is connected.':Number(bot.capital_amount||0)<100?'Save your trading amount to prepare your customer worker.':!fresh?'Your worker is not connected yet. Trading cannot start.':'Your worker is preparing. Trading cannot start yet.';
    if(document.activeElement!==$('capitalAmount')&&bot.capital_amount)$('capitalAmount').value=Number(bot.capital_amount).toFixed(2);
    const rows=bot.open_positions||[]; $('openCount').textContent=rows.length+' currently open';
    $('openPositions').innerHTML=rows.length?rows.map(p=>'<article class="position"><div class="position-heading"><div><span class="coin">'+esc(p.coin)+'</span><span class="side">'+esc(p.side)+'</span></div><div class="position-result '+(Number(p.pnlUsdt)<0?'negative':'positive')+'">'+signed(p.marginPct)+'% · '+signed(p.pnlUsdt)+' USDT<small>price '+signed(p.pricePct)+'%</small></div></div><div class="position-details">'+[['Entry',number(p.entry,8)],['Now',number(p.now,8)],['Stop loss',number(p.stoploss,8)],['Leverage',p.leverage==null?'—':number(p.leverage)+'×'],['Margin',p.marginUsed==null?'—':'$'+number(p.marginUsed)],['Open for',age(p.openedAt)]].map(([label,value])=>'<span><small>'+label+'</small>'+esc(value)+'</span>').join('')+'</div></article>').join(''):'<p class="empty">'+(fresh?'No open positions.':'No current exchange data. Waiting for your worker.')+'</p>';
    const closed=bot.recent_closed_trades||[]; $('closedTrades').innerHTML=closed.length?closed.map(t=>'<tr>'+[t.when?new Date(Number(t.when)).toLocaleString():'—',t.coin,t.side,t.closeReason,t.heldFor,t.marginUsed==null?'—':'$'+number(t.marginUsed),t.marginPct==null?'—':signed(t.marginPct)+'%'].map(value=>'<td>'+esc(value)+'</td>').join('')+'<td class="'+(Number(t.pnlUsdt)<0?'negative':'positive')+'">'+signed(t.pnlUsdt)+' USDT</td></tr>').join(''):'<tr><td colspan="8" class="empty">No recent closed trades available.</td></tr>';
  }
  async function refresh() { if(!sessionActive||refreshInFlight)return;refreshInFlight=true;try { const data=await api('/bot/overview');if(data.bot)renderBot(data.bot); } catch(error) { $('startBot').disabled=true;$('stopBot').disabled=true;$('botState').textContent='Connection unavailable';message('controlMessage',error.message,'error'); } finally{refreshInFlight=false;} }
  if (trading) {
    $('openSettings').addEventListener('click',async()=>{const open=$('settings').hidden;$('settings').hidden=!open;$('openSettings').setAttribute('aria-expanded',String(open));if(open)try{await loadConnections();}catch(error){message('pageMessage',error.message,'error');}else['binance','coinalyze'].forEach(updateProvider);});
    $('closeSettings').addEventListener('click',()=>{$('settings').hidden=true;$('openSettings').setAttribute('aria-expanded','false');['binance','coinalyze'].forEach(updateProvider);});
    $('capitalForm').addEventListener('submit',async event=>{event.preventDefault();const capital=Number($('capitalAmount').value);if(!Number.isFinite(capital)||capital<100){message('capitalMessage','Enter at least 100 USDT.','error');return;}$('saveCapital').disabled=true;try{await api('/onboarding/capital',{capitalAmount:capital});message('capitalMessage','Trading amount saved.','success');await refresh();}catch(error){message('capitalMessage',error.message,'error');}finally{$('saveCapital').disabled=false;}});
    for(const action of ['start','pause','stop'])$(action+'Bot').addEventListener('click',async()=>{const button=$(action+'Bot');button.disabled=true;try{await api('/bot/control',{action});message('controlMessage',action==='start'?'Start requested. Waiting for worker confirmation.':action==='pause'?'Pause requested. Existing positions remain managed.':'Stop requested. Waiting for worker confirmation.');await refresh();}catch(error){message('controlMessage',error.message,'error');}finally{if(action==='pause')button.disabled=false;}});
  }
  (async()=>{try{const data=await api('/me');if(data.user.payment_status!=='active'){location.href='payment.html';return;}$('accountLabel').textContent=data.user.customer_number||'Active account';await loadConnections();if(trading){if(!isConnected('binance')||!isConnected('coinalyze')){location.href='portal.html';return;}await refresh();overviewTimer=setInterval(refresh,15000);}}catch(error){message('pageMessage',error.message,'error');}})();
})();
