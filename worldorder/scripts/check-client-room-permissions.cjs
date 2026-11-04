const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
// Hidden Electron DOM check. Its mandatory output directory owns all profile
// data; the user's saves and game server are never opened.
const root=path.resolve(__dirname,'..'),out=process.env.WORLD_ORDER_TEST_OUTPUT;
if(!out)throw Error('Set WORLD_ORDER_TEST_OUTPUT to an isolated test output directory.');
fs.mkdirSync(out,{recursive:true});app.setPath('userData',path.join(out,'profile'));app.disableHardwareAcceleration();
const source=fs.readFileSync(path.join(root,'dist/app.js'),'utf8');
const permissionFunction=source.slice(source.indexOf('function applyRoomPermissions(){'),source.indexOf('async function openRoomDialog('));
const regionFunction=source.slice(source.indexOf('async function commitViewerRegionAction(b){'),source.indexOf('function changeCardForm(e){'));
const regionListener=source.split('\n').find(line=>line.startsWith("$('#viewer').addEventListener('click'")&&line.includes('commitViewerRegionAction(b)'));
let server;
app.whenReady().then(async()=>{
 const result={checks:[]};
 try{
  server=http.createServer((req,res)=>{
   if(req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html><body><button id="newgame">新局</button><div id="app"><div id="table-task-body"><label>行动<select id="basic-domestic"><option value="produce">生产</option><option value="growth">发展</option></select></label></div></div><dialog id="viewer" open></dialog></body></html>');return;}
   const file=path.join(root,'dist',path.basename(req.url));
   if(!file.endsWith('.js')||!fs.existsSync(file)){res.statusCode=404;res.end();return;}
   res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(file));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const win=new BrowserWindow({show:false,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true}});
  await win.loadURL('http://127.0.0.1:'+server.address().port+'/');
  result.checks=await win.webContents.executeJavaScript(`(async()=>{
   const {actionAccess,setupPending}=await import('./action-policy.js');
   const {controlCommand}=await import('./control-command.js');
   const {renderEventEffects}=await import('./event-effects-ui.js');
   const {renderWorldRegion}=await import('./world-ui.js');
   const {syncClientActionChoices}=await import('./client-action-choices.js');
   const $=s=>document.querySelector(s),isGameClient=true,updateRollbackControls=()=>{},toast=()=>{};
   const seats=['US','CN','EU','RU'],players=Object.fromEntries(seats.map(id=>[id,{money:30,resources:[1,1,1,1,1,1,1],commerce:[{ready:true}]}]));
   const state={current:'US',round:4,players,flow:{step:'actions',order:seats},actionTurns:{index:0},config:{dd:false,wit:true},eventEffects:[{cardId:'cf48fe9407208',owner:'US',face:'exchange'}],activeEffects:[],log:[]};
   const room={isHost:true,seat:'US',actor:'US',state},roomClient={busy:false,status:'online',isSteam:false};
   const check=(value,message)=>{if(!value)throw Error(message);checks.push(message);},checks=[];
   $('#viewer').innerHTML=renderEventEffects(state,'US')+'<button data-commerce-index="0">手动贸易卡</button>';
   ${permissionFunction}
   syncClientActionChoices();applyRoomPermissions();
   const select=$('[data-effect-resource]'),effect=$('[data-use-event-effect]'),choice=()=>$('[data-client-action-option="growth"]'),field=$('#basic-domestic');
   check(select&&!select.disabled&&!effect.disabled,'Own legal TTIP effect and resource selector remain enabled');
   select.value='4';check(select.value==='4','Owner can select a non-default TTIP resource');
   check($('[data-commerce-index]').disabled===!actionAccess(state,{type:'toggleCommerce'},room.seat).allowed,'Manual commerce command obeys the same action policy');
   check(!choice().disabled&&!field.disabled,'Action adapter starts enabled with its real source');
   roomClient.busy=true;applyRoomPermissions();
   check(select.disabled&&effect.disabled&&choice().disabled&&field.disabled,'Saving immediately disables effect inputs, command and adapted action choices');
   roomClient.busy=false;applyRoomPermissions();
   check(!select.disabled&&!effect.disabled&&!choice().disabled&&!field.disabled,'Finishing save restores inputs and action buttons without rerender');
   check(select.value==='4'&&field.value==='produce','Permission transitions preserve form values');
   roomClient.status='offline';applyRoomPermissions();
   check(select.disabled&&effect.disabled&&choice().disabled,'Offline blocks effect and action controls');
   roomClient.status='online';applyRoomPermissions();
   check(!select.disabled&&!effect.disabled&&!choice().disabled,'Reconnect restores the existing controls');
   room.seat='CN';state.current='CN';applyRoomPermissions();
   check(select.disabled&&effect.disabled&&choice().disabled,"Other seat cannot operate the actor controls");
   room.seat='US';state.current='US';applyRoomPermissions();
   check(!select.disabled&&!effect.disabled&&!choice().disabled,'Returning to the authorized seat restores permissions');
   const region='E',actions=[];let actionSucceeds=true;
   const act=async action=>{actions.push(action);return {ok:actionSucceeds};};
   state.regions={E:{permanent:['US',null,null],extraPermanent:[],temporary:['US'],influence:{US:2,CN:0,EU:0,RU:0},engage:{US:0,CN:0,EU:0,RU:0}}};
   ${regionFunction}
   ${regionListener}
   const openRegion=()=>{$('#viewer').innerHTML=renderWorldRegion(state,region);if(!$('#viewer').open)$('#viewer').show();applyRoomPermissions();};
   const clickRegion=async selector=>{$(selector).click();await new Promise(resolve=>setTimeout(resolve,0));};
   openRegion();await clickRegion('[data-world-op="remove"][data-kind="permanent"]');
   check(actions.length===1&&actions[0].type==='worldInfluence'&&actions[0].operation==='remove'&&actions[0].region==='E'&&actions[0].kind==='permanent'&&actions[0].index===0,'Viewer influence control sends the existing command and exact selected position');
   check(!$('#viewer').open,'Successful influence action closes the now-stale detail');
   openRegion();await clickRegion('[data-engage-delta="1"]');
   check(actions.length===2&&actions[1].type==='engageToken'&&actions[1].region==='E'&&actions[1].delta===1&&!$('#viewer').open,'Viewer intervention uses the original command and closes after success');
   actionSucceeds=false;openRegion();await clickRegion('[data-world-op="placeTemporary"]');
   check(actions.length===3&&$('#viewer').open,'Rejected regional action preserves the detail for correction');
   roomClient.busy=true;applyRoomPermissions();await clickRegion('[data-engage-delta="1"]');
   check(actions.length===3&&$('[data-engage-delta="1"]').disabled,'Busy regional controls cannot send commands');
   roomClient.busy=false;roomClient.status='offline';applyRoomPermissions();await clickRegion('[data-world-op="placeTemporary"]');
   check(actions.length===3&&$('[data-world-op="placeTemporary"]').disabled,'Offline regional controls cannot send commands');
   roomClient.status='online';room.seat='CN';state.current='CN';applyRoomPermissions();await clickRegion('[data-world-op="placeTemporary"]');
   check(actions.length===3&&$('[data-world-op="placeTemporary"]').disabled,'Another seat cannot send the actor regional commands');
   room.seat='US';state.current='US';actionSucceeds=true;applyRoomPermissions();await clickRegion('[data-world-op="placeTemporary"]');
   check(actions.length===4&&!$('#viewer').open,'Authorized region controls recover after permission changes');
   const contextChanged=(previous,room)=>${source.match(/const viewerContextChanged=([^;]+);/)[1]};
   const original={code:'ROOM01',gameRevision:1,seat:'US',state:{}};
   check(!contextChanged(original,{...original,state:{}}),'Same room identity and revision can keep an open detail');
   check(contextChanged(original,{...original,seat:null,state:null})&&contextChanged(original,{...original,seat:'CN'})&&contextChanged(original,{...original,code:'ROOM02'})&&contextChanged(original,{...original,state:null}),'Seat takeover, room change and lost state invalidate existing details');
   return checks;
  })()`,true);
  result.passed=true;win.destroy();
 }catch(error){result.passed=false;result.error=error.stack;}
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 server?.close();app.exit(result.passed?0:1);
});
