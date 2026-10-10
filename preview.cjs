// Loopback-only browser QA. All credentials and trades here are fake; never call an exchange.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
let connections={binanceConnected:false,coinalyzeConnected:false,canReplace:true,message:'Saved keys are never displayed. Pause entries and close all positions before replacing keys.'};
const bot={actual_state:'stopped',desired_state:'paused',provisioning_status:'waiting',capital_amount:null,open_positions:[],recent_closed_trades:[]};
http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/test-api/')){
    let input='';for await(const chunk of req)input+=chunk;
    const data=input?JSON.parse(input):{};const endpoint=url.pathname.slice(9);let result={};
    if(endpoint==='/me')result={user:{payment_status:'active',customer_number:'LOCAL PREVIEW'}};
    if(endpoint==='/settings/connections')result={connections};
    if(/\/(onboarding|settings)\/(binance|coinalyze)$/.test(endpoint)){
      if(Object.values(data).some(v=>String(v).startsWith('invalid'))){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'{"message":"Invalid/Missing API key"}'}));return;}
      connections[endpoint.endsWith('binance')?'binanceConnected':'coinalyzeConnected']=true;result={setup:bot};
    }
    if(endpoint==='/bot/overview')result={bot};
    if(endpoint==='/onboarding/capital'){bot.capital_amount=data.capitalAmount;result={setup:bot};}
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result));return;
  }
  const file=path.join(__dirname,url.pathname==='/'?'portal.html':decodeURIComponent(url.pathname).replace(/^\//,''));
  if(!file.startsWith(__dirname+path.sep)||!fs.existsSync(file)||!['.html','.js','.css'].includes(path.extname(file))){res.writeHead(404);res.end();return;}
  let content=fs.readFileSync(file,'utf8');
  if(file.endsWith('.html'))content=content.replace('<head>','<head><script>window.ZUKUNFT_API_URL=location.origin+"/test-api";localStorage.setItem("ztToken","LOCAL_FAKE_TOKEN");</script>').replace('<main>','<main><p class="eyebrow">LOCAL PREVIEW · FAKE API DATA · NO TRADING</p>');
  res.writeHead(200,{'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8'});res.end(content);
}).listen(5091,'127.0.0.1',()=>console.log('Local mocked preview: http://127.0.0.1:5091/portal.html'));
