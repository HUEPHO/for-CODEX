// Layout-only acceptance for long forms in the fixed action bar. Reuses an
// isolated opening fixture; never confirms trade/production or tests rules again.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
module.exports=async({app,main,services})=>{
 const root=path.resolve(__dirname,'..'),out=process.env.WORLD_ORDER_TEST_OUTPUT;
 const result={suite:'fixed-action-form-layout',checks:[],views:[]};
 const SESSION='world-order-table-m2-v2-session-v1',TRADE='c0deaa2d05c13';
 const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const run=code=>main.webContents.executeJavaScript(code,true);
 const load=file=>import(pathToFileURL(path.join(root,'dist',file)).href);
 async function until(code){for(let i=0;i<100;i++){try{if(await run(code))return;}catch{}await delay(100);}throw Error('Timed out: '+code);}
 async function point(selector){
  await run(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'center',inline:'nearest'})`);await delay(100);
  return run(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return null;const r=el.getBoundingClientRect(),x=Math.round(r.x+r.width/2),y=Math.round(r.y+r.height/2),work=el.closest('.action-workbench')?.getBoundingClientRect(),rail=document.querySelector('.client-player-rail')?.getBoundingClientRect();return {x,y,visible:el.contains(document.elementFromPoint(x,y)),disabled:!!el.disabled,left:r.left,right:r.right,top:r.top,bottom:r.bottom,insideViewport:r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,insideWorkbench:!work||(r.left>=work.left-1&&r.right<=work.right+1&&r.top>=work.top-1&&r.bottom<=work.bottom+1),beforeRail:!rail||r.right<=rail.left+1};})()`);
 }
 async function reachable(selector,{enabled=false}={}){
  const hit=await point(selector);assert.ok(hit?.visible&&hit.insideViewport&&hit.insideWorkbench&&hit.beforeRail,'Reachable inside action area, outside right rail: '+selector+' '+JSON.stringify(hit));
  if(enabled)assert.equal(hit.disabled,false,'Enabled control: '+selector);return hit;
 }
 async function click(selector){const hit=await reachable(selector,{enabled:true});main.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,x:hit.x,y:hit.y});main.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:hit.x,y:hit.y});await delay(140);}
 async function shot(name){await delay(180);fs.writeFileSync(path.join(out,name+'.png'),(await main.webContents.capturePage()).toPNG());}
 async function fixedAtBottom(){
  const before=await run("(()=>{const b=document.querySelector('.action-workbench').getBoundingClientRect(),r=document.querySelector('.client-player-rail').getBoundingClientRect();return {barTop:b.top,railTop:r.top};})()");
  await run("document.querySelector('#app').scrollTop=document.querySelector('#app').scrollHeight");await delay(150);
  const after=await run("(()=>{const el=document.querySelector('.action-workbench'),b=el.getBoundingClientRect(),r=document.querySelector('.client-player-rail').getBoundingClientRect();return {barTop:b.top,railTop:r.top,height:b.height,limit:innerHeight*.32,scrollTop:document.querySelector('#app').scrollTop,internalOverflow:el.scrollHeight>el.clientHeight};})()");
  assert.ok(after.scrollTop>0,'The document can scroll to its lower section');assert.ok(Math.abs(after.barTop-before.barTop)<2,'Action workbench stays fixed at the document bottom');assert.ok(Math.abs(after.railTop-before.railTop)<2,'Right rail stays fixed at the document bottom');assert.ok(after.height<=after.limit+3,'Action workbench respects 32vh');return after;
 }
 async function formEnd(){
  const before=await run("document.querySelector('.action-workbench').scrollTop");
  const confirm=await reachable('#commit-basic');
  const after=await run("document.querySelector('.action-workbench').scrollTop");
  await reachable('#cancel-table-card',{enabled:true});
  return {confirmDisabled:confirm.disabled,scrollBefore:before,scrollAfter:after};
 }
 try{
  assert.ok(out&&process.env.WORLD_ORDER_TEST_DATA,'Isolated output/data required');assert.equal(Number(process.env.WORLD_ORDER_CLIENT_PORT),18931);fs.mkdirSync(out,{recursive:true});
  const [{createState,applyAction},{createRollback},{ACTION_CARDS}]=await Promise.all(['engine.js','rollback-state.js','basic-actions.js'].map(load));
  const cards=JSON.parse(fs.readFileSync(path.join(root,'dist/cards.json'),'utf8'));
  let state=createState(cards,{dd:false,wit:false},()=>.5);
  for(const owner of ['US','CN','EU','RU']){state=applyAction(state,{type:'switch',player:owner});state=applyAction(state,{type:'selectAssetDiscard',id:state.players[owner].assetChoices[0].id});state=applyAction(state,{type:'chooseAssets'});}
  state.current='US';state.phase='行动';state.flow.order=['US','CN','EU','RU'];state.flow.step='actions';state.flow.turnCards=[];state.actionTurns={index:0,completed:{US:0,CN:0,EU:0,RU:0}};
  const player=state.players.US;player.resources=player.resources.map(value=>Math.max(value,12));player.money=100;
  if(!player.hand.includes(TRADE))player.hand.push(TRADE);
  const production=player.hand.find(id=>ACTION_CARDS[id]?.effect==='domestic');assert.ok(production,'Opening hand contains a domestic production card');
  const savedFixture=JSON.stringify({version:1,state,rollback:createRollback()});
  await click('[data-start="local"]');await until("!!document.querySelector('.game-table')");
  for(const [width,height] of [[1440,900],[1200,720]]){
   main.setContentSize(width,height);
   await run(`localStorage.setItem(${JSON.stringify(SESSION)},${JSON.stringify(savedFixture)})`);main.webContents.reload();await until("!!document.querySelector('.client-owned-cards')");
   const baseline=await run(`localStorage.getItem(${JSON.stringify(SESSION)})`);
   await click(`.hand [data-card="${TRADE}"]`);await until("!!document.querySelector('.client-trade-form')");
   assert.deepEqual(await run("Array.from(document.querySelectorAll('[data-trade-resource]')).map(el=>Number(el.dataset.tradeResource))"),[0,1,2,3,4,6],'Six trade resource columns remain available');
   const clicked=[];
   for(const resource of [0,1,2,3,4,6]){
    const control=await run(`(()=>{const col=document.querySelector('[data-trade-resource="${resource}"]'),button=Array.from(col.querySelectorAll('[data-trade-step="1"]')).find(el=>!el.disabled&&!el.closest('details:not([open])')&&el.getClientRects().length);if(button){button.dataset.scrollQa='trade-${resource}';const field=document.getElementById(button.dataset.tradeInput);return {selector:'[data-scroll-qa="trade-${resource}"]',input:field?.id,value:Number(field?.value),kind:'step'};}const summary=col.querySelector('details > summary');if(summary){summary.dataset.scrollQa='trade-${resource}';return {selector:'[data-scroll-qa="trade-${resource}"]',kind:'summary'};}return null;})()`);
    assert.ok(control,'Every trade column retains a clickable option: '+resource);await click(control.selector);
    if(control.kind==='step'){
     assert.equal(await run(`Number(document.getElementById(${JSON.stringify(control.input)}).value)`),control.value+1,'Trade increment responds in resource '+resource);
     await click(`[data-trade-input="${control.input}"][data-trade-step="-1"]`);
    }else await click(control.selector);
    clicked.push(resource);
   }
   const tradeBottom=await fixedAtBottom(),tradeEnd=await formEnd();await reachable('#commit-basic');await shot(width+'x'+height+'-trade-form');
   await click('#cancel-table-card');assert.equal(await run(`localStorage.getItem(${JSON.stringify(SESSION)})`),baseline,'Trade layout clicks and cancel do not settle a game action');
   await click(`.hand [data-card="${production}"]`);await until("!!document.querySelector('#domestic-production')");
   await run("(()=>{const mode=document.querySelector('#basic-domestic');if(mode&&mode.value!=='produce'){mode.value='produce';mode.dispatchEvent(new Event('change',{bubbles:true}));}const fields=Array.from(document.querySelectorAll('[data-produce-key]'));for(let i=0;i<fields.length;i++){const value=String([0,1,3][i]??'');if(Array.from(fields[i].options).some(option=>option.value===value)){fields[i].value=value;fields[i].dispatchEvent(new Event('change',{bubbles:true}));}}})()");
   const sourceCount=await run("document.querySelectorAll('[data-produce-key]').length");assert.ok(sourceCount>0);
   for(let i=0;i<sourceCount;i++){
    const selector=`[data-produce-key="${i}"]`;await click(selector);
    main.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});main.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});await delay(70);
   }
   const quantity=await run("(()=>{const field=Array.from(document.querySelectorAll('[data-produce-quantity]')).find(el=>!el.disabled);if(!field)return null;field.dataset.scrollQa='production-quantity';return '[data-scroll-qa=\"production-quantity\"]';})()");
   if(quantity){await click(quantity);assert.equal(await run("document.activeElement?.dataset.scrollQa"),'production-quantity','Production quantity can be focused with the mouse');}
   const productionBottom=await fixedAtBottom(),productionEnd=await formEnd();await reachable('#commit-basic');await shot(width+'x'+height+'-production-form');
   await click('#cancel-table-card');assert.equal(await run(`localStorage.getItem(${JSON.stringify(SESSION)})`),baseline,'Production layout clicks and cancel do not settle a game action');
   result.views.push({width,height,trade:{clickedResources:clicked,bottom:tradeBottom,controls:tradeEnd},production:{sourceCount,bottom:productionBottom,controls:productionEnd}});
  }
  result.checks.push('Six trade columns retain clickable options inside the action area at 1440×900 and 1200×720','Production resource and quantity controls accept real mouse interaction at both sizes','Cancel and confirmation are hit-testable through internal action-bar scrolling','Action area stays within 32vh and does not cover the fixed right rail','Action area and right rail stay fixed at the document bottom','Trade and production cancellation preserve the isolated saved state; neither action is settled');result.passed=true;
 }catch(error){result.passed=false;result.error=error.stack;try{await shot('failure');}catch{}}
 result.servicePids=[...services.values()].map(service=>service.child.pid);fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));app.quit();
};
