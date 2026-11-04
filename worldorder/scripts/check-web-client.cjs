// Browser acceptance with ordinary sandboxed Chromium windows. No Electron
// preload, desktop bridge, Node integration, Steam or patched browser globals.
// The caller owns an isolated start-web server at WORLD_ORDER_WEB_URL.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const out=process.env.WORLD_ORDER_TEST_OUTPUT;
if(!out||!process.env.WORLD_ORDER_WEB_URL)throw Error('Isolated test output and WORLD_ORDER_WEB_URL are required');
fs.mkdirSync(out,{recursive:true});app.setPath('userData',path.join(out,'profile'));
const root=path.resolve(__dirname,'..'),origin=new URL(process.env.WORLD_ORDER_WEB_URL).origin;
assert.ok(['localhost','127.0.0.1'].includes(new URL(origin).hostname),'Use a dedicated local test server');
const SESSION='world-order-table-m2-v2-session-v1',SEATS=['US','CN','EU','RU'];
const result={suite:'ordinary-browser-client',checks:[],views:[],passed:false},windows=[],errors=[];
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const run=(win,code)=>win.webContents.executeJavaScript(code,true);
const load=file=>import(pathToFileURL(path.join(root,'dist',file)).href);
function makeWindow(name){
 const win=new BrowserWindow({show:false,width:1440,height:900,webPreferences:{partition:'persist:web-test-'+name,nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
 windows.push(win);win.webContents.on('console-message',(_event,...args)=>{const detail=args[0];if(typeof detail==='object'?detail.level==='error':detail===3)errors.push({window:name,message:typeof detail==='object'?detail.message:args[1]});});
 return win;
}
async function until(win,code){for(let i=0;i<150;i++){try{if(await run(win,code))return;}catch{}await delay(100);}throw Error('Timed out: '+code);}
async function click(win,selector){
 await run(win,`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'center',inline:'nearest'})`);await delay(120);
 const p=await run(win,`(()=>{const b=document.querySelector(${JSON.stringify(selector)});if(!b)return null;const r=b.getBoundingClientRect(),x=Math.round(r.x+r.width/2),y=Math.round(r.y+r.height/2);return {x,y,visible:b.contains(document.elementFromPoint(x,y)),disabled:!!b.disabled};})()`);
 assert.ok(p?.visible&&!p.disabled,'Visible enabled browser control: '+selector+' '+JSON.stringify(p));
 win.webContents.sendInputEvent({type:'mouseMove',x:p.x,y:p.y});win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,x:p.x,y:p.y});win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:p.x,y:p.y});await delay(200);
}
async function shot(win,name){
 // A hidden test window can defer Chromium's lazy image scheduling. Decode only
 // the currently visible images before capturing; missing resources fail QA.
 const loaded=await run(win,"(async()=>{const imgs=[...document.images].filter(img=>{const r=img.getBoundingClientRect();return r.width>0&&r.height>0&&r.top<innerHeight&&r.bottom>0&&r.left<innerWidth&&r.right>0});await Promise.all(imgs.map(async img=>{img.loading='eager';await img.decode();if(img.naturalWidth===0)throw Error('Image did not load: '+img.getAttribute('src'));}));return imgs.length;})()");
 await delay(180);fs.writeFileSync(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());
 (result.screenshots??=[]).push({name:name+'.png',decodedVisibleImages:loaded});
}
async function view(win,code){return run(win,`(async()=>{const r=await fetch('/api/rooms/'+${JSON.stringify(code)},{headers:{'X-Room-Token':sessionStorage.getItem('world-order-room-tab-v1')},cache:'no-store'}),data=await r.json();if(!r.ok)throw Error(data.error);return data.room;})()`);}
async function roomUntil(win,code,predicate){for(let i=0;i<100;i++){const data=await view(win,code);if(predicate(data))return data;await delay(120);}throw Error('Room condition not reached: '+predicate.toString());}
function privateView(room,owner){
 assert.equal(room.seat,owner);assert.equal(room.state.current,owner);assert.ok(room.state.players[owner].hand.every(id=>typeof id==='string'));
 for(const other of SEATS.filter(id=>id!==owner)){
  assert.ok(room.state.players[other].hand.every(id=>id===null),'Other hands are redacted in the actual HTTP response');
  assert.equal(room.state.players[other].assetChoices,null,'Other private draft choices are redacted');
  assert.ok(room.state.players[other].objectives.every(id=>id===null),'Other objectives are redacted');
 }
}
app.whenReady().then(async()=>{
 let main,activeWindow;
 try{
  main=makeWindow('local');activeWindow=main;await main.loadURL(origin);await until(main,"!!document.querySelector('.client-scroll-table')");
  assert.deepEqual(await run(main,"({bridge:typeof window.worldOrderDesktop,node:typeof require,web:document.body.classList.contains('web-client')})"),{bridge:'undefined',node:'undefined',web:true});
  if(!process.env.WORLD_ORDER_WEB_TEST_ROOM_ONLY){
  const [{createState,applyAction},{createRollback},{ALLY_BACK_IMAGES}]=await Promise.all(['engine.js','rollback-state.js','ally-card-art.js'].map(load));
  const cards=JSON.parse(fs.readFileSync(path.join(root,'dist/cards.json'),'utf8'));
  let state=createState(cards,{dd:false,wit:false},()=>.5);
  for(const owner of SEATS){state=applyAction(state,{type:'switch',player:owner});state=applyAction(state,{type:'selectAssetDiscard',id:state.players[owner].assetChoices[0].id});state=applyAction(state,{type:'chooseAssets'});}
  state.current='US';state.phase='行动';state.flow.order=SEATS;state.flow.step='actions';state.flow.turnCards=[];state.actionTurns={index:0,completed:{US:0,CN:0,EU:0,RU:0}};
  state.players.US.exhaustedAllies=[state.players.US.allies[0]];
  const serialized=JSON.stringify({version:1,state,rollback:createRollback()});
  await run(main,`localStorage.setItem(${JSON.stringify(SESSION)},${JSON.stringify(serialized)})`);main.webContents.reload();await until(main,"!!document.querySelector('.hand [data-card]')");
  for(const [width,height] of [[1440,900],[1200,720]]){
   main.setContentSize(width,height);await delay(250);await run(main,"document.querySelector('#app').scrollTop=0");
   const top=await run(main,"(()=>{const r=s=>{const e=document.querySelector(s),b=e.getBoundingClientRect();return {top:b.top,bottom:b.bottom,left:b.left,right:b.right,position:getComputedStyle(e).position};};return {bar:r('.action-workbench'),rail:r('.client-player-rail'),hand:r('.tray'),overflow:document.querySelector('#app').scrollWidth-document.querySelector('#app').clientWidth};})()");
   assert.equal(top.bar.position,'fixed');assert.equal(top.rail.position,'fixed');assert.ok(top.overflow<=1);
   const img=`.client-owned-ally[data-owned-card="${state.players.US.allies[0]}"] .cardbutton img`;
   assert.equal(await run(main,`document.querySelector(${JSON.stringify(img)}).getAttribute('src')`),ALLY_BACK_IMAGES[state.players.US.allies[0]]);
   await shot(main,width+'x'+height+'-web-table');
   main.webContents.sendInputEvent({type:'mouseWheel',x:400,y:height-80,deltaY:-700,deltaX:0,canScroll:true,hasPreciseScrollingDeltas:true});await delay(200);
   const scrolled=await run(main,"(()=>{const a=document.querySelector('#app'),b=document.querySelector('.action-workbench').getBoundingClientRect(),r=document.querySelector('.client-player-rail').getBoundingClientRect(),h=document.querySelector('.tray').getBoundingClientRect();return {scroll:a.scrollTop,bar:b.top,rail:r.top,hand:h.top};})()");
   assert.ok(scrolled.scroll>300);assert.ok(scrolled.hand<top.hand.top-300);assert.equal(scrolled.bar,top.bar.top);assert.equal(scrolled.rail,top.rail.top);
   await click(main,'#client-menu');assert.equal(await run(main,"!!document.querySelector('#client-pause[open] [data-client-room]')"),true);assert.equal(await run(main,"!!document.querySelector('[data-client-home],[data-client-quit]')"),false);
   await click(main,'[data-client-help]');await until(main,"document.querySelector('#help-dialog').open");await click(main,'#help-dialog .close');
   await click(main,'.hand [data-card="c0deaa2d05c13"]');await until(main,"!!document.querySelector('.client-trade-form')");assert.equal(await run(main,"document.querySelectorAll('[data-trade-resource]').length"),6);
   await click(main,'#cancel-table-card');await click(main,'#toggle-table-task');await click(main,'#toggle-table-task');
   assert.equal(await run(main,`localStorage.getItem(${JSON.stringify(SESSION)})`),serialized,'Browser-only inspections and choices do not mutate the local save');
   result.views.push({width,height,bridge:false,scroll:scrolled.scroll,menu:true,tradeColumns:6,allyBack:true});
  }
  main.webContents.reload();await until(main,"!!document.querySelector('.client-scroll-table')");assert.equal(await run(main,`localStorage.getItem(${JSON.stringify(SESSION)})`),serialized);
  result.checks.push('Ordinary browser windows have no desktop bridge or Node access','0.7 scrolling table, fixed controls, original ally backs and six-column trade work at both sizes','Browser menu/help/collapse/cancel and local reload preserve the saved session');
  }else result.mode='room-only';

  // Four separate cookie partitions model four browsers/devices. All room writes
  // below go through actual page controls and the unchanged HTTP room client.
  const roomWindows={US:main};await click(main,'#rooms');await until(main,"!!document.querySelector('[data-room-action=\"create\"]')");
  await run(main,"document.querySelectorAll('[data-room-config]').forEach(e=>{if(e.type==='checkbox')e.checked=false})");await click(main,'[data-room-action="create"]');await until(main,"!!document.querySelector('.room-code')");
  const code=await run(main,"document.querySelector('.room-code').textContent.trim()");assert.match(code,/^[A-HJ-NP-Z2-9]{6}$/);result.roomCode=code;
  for(const owner of SEATS.slice(1)){
   const win=makeWindow(owner);roomWindows[owner]=win;await win.loadURL(origin+'/?room='+code+'&seat='+owner);
   // loadURL finishes before the module's asynchronous card fetch, tab-token
   // initialization and automatic seat join. Wait for the real joined UI before
   // making an observational request with that browser's credential.
   await until(win,"/^[a-f0-9]{64}$/.test(sessionStorage.getItem('world-order-room-tab-v1')||'')&&!!document.querySelector('.room-seat.self')");
   await roomUntil(win,code,r=>r.seat===owner);
  }
  await until(main,"!!document.querySelector('[data-room-action=\"start\"]:not(:disabled)')");await click(main,'[data-room-action="start"]');
  for(const owner of SEATS){const win=roomWindows[owner];await until(win,"!!document.querySelector('[data-draft-discard]')");privateView(await view(win,code),owner);await click(win,'[data-draft-discard]');await until(win,"!!document.querySelector('#confirm-assets:not(:disabled)')");await click(win,'#confirm-assets');await roomUntil(win,code,r=>r.seats[owner].setupDone);}
  const started=await roomUntil(main,code,r=>SEATS.every(id=>r.seats[id].setupDone));const actor=started.actor,actingWindow=roomWindows[actor];assert.ok(actingWindow);
  for(const owner of SEATS){const win=roomWindows[owner];await until(win,"!!document.querySelector('.hand [data-card]')");assert.equal(await run(win,"!!document.querySelector('#client-seat')"),false,'A network room never exposes local seat switching');privateView(await view(win,code),owner);}
  activeWindow=actingWindow;
  // Observing the server above does not advance another tab's polling cycle.
  // Wait for the acting tab itself to display the post-setup turn before input.
  await until(actingWindow,`!document.querySelector('.opening-notice')&&document.querySelector('.client-player--acting')?.dataset.clientPlayer===${JSON.stringify(actor)}&&document.querySelector('#room-strip [data-room-status]')?.textContent==='已同步'`);
  const actorBefore=await view(actingWindow,code),cardId=actorBefore.state.players[actor].hand[0];
  await click(actingWindow,`.hand [data-card="${cardId}"]`);await until(actingWindow,"!!document.querySelector('.table-pass-card:not(:disabled)')");await click(actingWindow,'.table-pass-card');
  const after=await roomUntil(actingWindow,code,r=>r.gameRevision>actorBefore.gameRevision&&r.state.players[actor].hand.length===5);
  assert.equal(after.state.players[actor].money,actorBefore.state.players[actor].money+10);assert.ok(after.state.players[actor].played.includes(cardId));
  for(const owner of SEATS){const win=roomWindows[owner];const latest=await roomUntil(win,code,r=>r.gameRevision===after.gameRevision);privateView(latest,owner);await until(win,`document.querySelector('.client-player--acting')?.dataset.clientPlayer===${JSON.stringify(after.actor)}`);}
  const guest=roomWindows.CN,token=await run(guest,"sessionStorage.getItem('world-order-room-tab-v1')");guest.webContents.reload();await until(guest,"!!document.querySelector('.client-scroll-table')");
  const resumed=await view(guest,code);assert.equal(resumed.seat,'CN');assert.equal(resumed.gameRevision,after.gameRevision);assert.equal(await run(guest,"sessionStorage.getItem('world-order-room-tab-v1')"),token);
  await click(guest,'[data-client-player="US"]');await until(guest,"document.querySelector('#viewer').open");assert.equal(await run(guest,"!!document.querySelector('#viewer [data-source=\"hand\"],#viewer [data-source=\"objectives\"]')"),false);await shot(guest,'web-room-opponent-public');
  result.room={seats:SEATS,actingSeat:actor,nextActor:after.actor,gameRevision:after.gameRevision,independentBrowserIdentities:true,redactedHttpViews:true,actionSynced:true,reloadedSeat:'CN'};
  result.checks.push('Four independent browser identities create/join a real HTTP room and complete opening choices through UI','One real covered-card action is saved server-side and synchronized to all four windows','HTTP responses redact other hands/drafts/objectives; public inspection exposes no private card controls','Reload restores the same room seat and revision without local seat switching');
  assert.deepEqual(errors,[],'No renderer console errors');result.passed=true;
 }catch(error){result.error=error.stack;result.consoleErrors=errors;try{if(activeWindow){result.failureState=await run(activeWindow,"({url:location.href,classes:document.body.className,actor:document.querySelector('.client-player--acting')?.dataset.clientPlayer,status:document.querySelector('#room-strip')?.textContent,task:document.querySelector('#table-task-body')?.textContent.slice(0,1800),viewer:document.querySelector('#viewer')?.open,hand:[...document.querySelectorAll('.hand [data-card]')].map(b=>({id:b.dataset.card,source:b.dataset.source}))})");await shot(activeWindow,'failure');}}catch{}}
 finally{fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));for(const win of windows)if(!win.isDestroyed())win.destroy();app.quit();}
}).catch(error=>{fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({...result,error:error.stack},null,2));app.quit();});
