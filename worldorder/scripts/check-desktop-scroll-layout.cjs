// Focused 0.7 scroll-layout acceptance. Run through the desktop test hook with
// an isolated userData profile, WORLD_ORDER_CLIENT_PORT=18929 and its own output.
// Pointer/wheel interactions go through Electron's native input path.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');

module.exports=async({app,main,services})=>{
 const root=path.resolve(__dirname,'..');
 const out=process.env.WORLD_ORDER_TEST_OUTPUT||'C:/Users/fhs/Documents/Codex/2026-09-26/referenced-chatgpt-conversation-this-is-an/work/scroll-layout-qa';
 fs.mkdirSync(out,{recursive:true});
 const result={suite:'desktop-scroll-layout',port:Number(process.env.WORLD_ORDER_CLIENT_PORT),profile:app.getPath('userData'),checks:[],screenshots:[]};
 const SESSION='world-order-table-m2-v2-session-v1';
 const errors=[];
 const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const run=code=>main.webContents.executeJavaScript(code,true);
 const load=file=>import(pathToFileURL(path.join(root,'dist',file)).href);
 main.webContents.on('console-message',(_event,...args)=>{
  const details=args[0];
  if(typeof details==='object'?details.level==='error':details===3)errors.push(typeof details==='object'?details.message:args[1]);
 });
 const saved=()=>run(`JSON.parse(localStorage.getItem(${JSON.stringify(SESSION)})).state`);
 async function until(code,label=code){
  for(let attempt=0;attempt<100;attempt++){
   try{if(await run(code))return;}catch{}
   await delay(100);
  }
  throw Error('Timed out: '+label);
 }
 async function shot(name){
  await delay(250);
  const filename=name+'.png';fs.writeFileSync(path.join(out,filename),(await main.webContents.capturePage()).toPNG());result.screenshots.push(filename);
 }
 async function point(selector,{scroll=false}={}){
  if(scroll)await run(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'center',inline:'nearest'})`);
  await delay(80);
  return run(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return null;const r=el.getBoundingClientRect(),x=Math.round(r.left+r.width/2),y=Math.round(r.top+r.height/2);return {x,y,visible:r.width>0&&r.height>0&&x>=0&&x<innerWidth&&y>=0&&y<innerHeight&&el.contains(document.elementFromPoint(x,y)),disabled:!!el.disabled};})()`);
 }
 async function click(selector,options){
  const p=await point(selector,options);assert.ok(p?.visible&&!p.disabled,'Control must be visible, enabled and hit-testable: '+selector);
  main.webContents.sendInputEvent({type:'mouseMove',x:p.x,y:p.y});
  main.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,x:p.x,y:p.y});
  main.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:p.x,y:p.y});
  await delay(220);
 }
 async function bounds(){
  return run(`(()=>{const rect=selector=>{const e=document.querySelector(selector),r=e?.getBoundingClientRect();return r?{top:r.top,left:r.left,right:r.right,bottom:r.bottom,width:r.width,height:r.height,position:getComputedStyle(e).position}:null;};const a=document.querySelector('#app');return {top:rect('.action-workbench'),rail:rect('.client-player-rail'),hand:rect('.game-table>.tray'),app:rect('#app'),scrollTop:a.scrollTop,scrollHeight:a.scrollHeight,clientHeight:a.clientHeight,overflow:Math.max(document.documentElement.scrollWidth-innerWidth,a.scrollWidth-a.clientWidth),windowScroll:scrollY};})()`);
 }
 const close=(actual,expected,message,tolerance=1)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${message}: expected ${expected}, received ${actual}`);
 function fixedEquals(a,b){
  for(const section of ['top','rail'])for(const key of ['top','left','width','height'])close(b[section][key],a[section][key],`${section} ${key} remains fixed during wheel scrolling`);
 }
 async function wheel(deltaY){
  const b=await bounds(),x=Math.round((b.app.left+Math.min(b.app.right,b.rail.left)-12)/2);
  // Use the content area rather than the rail or the fixed action controls.
  const size=main.getContentSize(),safeY=Math.min(size[1]-40,Math.max(Math.round(b.top.bottom+50),Math.round(size[1]*.64)));
  main.webContents.sendInputEvent({type:'mouseMove',x,y:safeY});
  main.webContents.sendInputEvent({type:'mouseWheel',x,y:safeY,deltaY,deltaX:0,canScroll:true,hasPreciseScrollingDeltas:true});
  await delay(180);
 }
 async function closeOverlay(){
  const selector=await run(`(()=>{for(const s of ['.client-table-overlay [data-client-close-supply]','.client-table-overlay [data-side="board"]','#viewer[open] .close'])if(document.querySelector(s))return s;return null;})()`);
  assert.ok(selector,'An open detail surface has a visible close control');await click(selector);
  await until("!document.querySelector('.client-table-overlay')&&!document.querySelector('#viewer[open]')",'detail surface closes');
 }
 async function inspectBoard(scope,owner){
  const data=await run(`(()=>{const board=document.querySelector(${JSON.stringify(scope)}),crop=board?.querySelector('.printed-board-crop'),art=board?.querySelector('.printed-board-art');if(!board||!crop||!art)return null;const r=crop.getBoundingClientRect();return {owner:board.dataset.clientBoardOwner,src:art.getAttribute('src'),loaded:art.complete&&art.naturalWidth>0,cropRatio:r.width/r.height,production:[...board.querySelectorAll('[data-board-production]')].map(e=>{const m=e.getBoundingClientRect();return {key:Number(e.dataset.boardProduction),value:e.dataset.productionValue,cube:!!e.querySelector('.printed-production-cube'),x:1500*(m.left+m.width/2-r.left)/r.width,y:714*(m.top+m.height/2-r.top)/r.height};}),focus:board.querySelector('.printed-board-focus.is-current')?.dataset.boardFocus,focusCount:board.querySelectorAll('.printed-focus-cylinder').length,prosperity:board.querySelector('.printed-board-prosperity.is-current')?.dataset.boardProsperity,prosperityCount:board.querySelectorAll('.printed-prosperity-ring').length,tradeInside:!!board.querySelector('[data-board-commerce-index]')};})()`);
  assert.ok(data?.loaded,`${owner} original board image loads`);assert.equal(data.owner,owner);assert.equal(data.src,`assets/board-${owner}.webp`);close(data.cropRatio,1500/714,'Board crop excludes the warehouse',.004);
  const state=await saved(),p=state.players[owner];
  assert.equal(data.production.length,7);assert.ok(data.production.every(v=>v.cube));assert.deepEqual(data.production.map(v=>Number(v.value)),p.production);
  const {PLAYER_BOARD_GEOMETRY:g}=await load('client-player-board.js');
  for(const marker of data.production){const xs=g.productionX[owner][marker.key]||g.commonProductionX[marker.key];close(marker.x,xs[Number(marker.value)-1],`${owner} rendered production ${marker.key} x matches original artwork`,.4);close(marker.y,g.productionY[marker.key],`${owner} rendered production ${marker.key} y matches original artwork`,.4);}
  assert.equal(data.focus,p.focus);assert.equal(data.focusCount,1);assert.equal(Number(data.prosperity),p.prosperity);assert.equal(data.prosperityCount,1);assert.equal(data.tradeInside,false);
  return data;
 }
 try{
  assert.equal(result.port,18929,'Use only the dedicated scroll-layout acceptance port');
  assert.match(result.profile,/scroll[-_]?layout/i,'Use a dedicated scroll-layout profile, never the user save directory');
  await until("!!document.querySelector('[data-start=\"local\"]')||!!document.querySelector('.game-table')",'desktop launcher or table');
  if(await run("!!document.querySelector('[data-start=\"local\"]')"))await click('[data-start="local"]');
  await until("!!document.querySelector('.game-table')",'local table starts');
  const [{createState,applyAction},{createRollback}]=await Promise.all([load('engine.js'),load('rollback-state.js')]);
  const cards=JSON.parse(fs.readFileSync(path.join(root,'dist','cards.json'),'utf8'));
  let state=createState(cards,{dd:false,wit:false},()=>.5);
  for(const owner of ['US','CN','EU','RU']){
   state=applyAction(state,{type:'switch',player:owner});
   state=applyAction(state,{type:'selectAssetDiscard',id:state.players[owner].assetChoices[0].id});
   state=applyAction(state,{type:'chooseAssets'});
  }
  state=applyAction(state,{type:'switch',player:'US'});
  state.players.US.prosperity=2;state.players.US.production[0]=2;state.players.US.focus='军事焦点';
  state.players.CN.prosperity=3;state.players.CN.focus='外交焦点';
  await run(`localStorage.setItem(${JSON.stringify(SESSION)},${JSON.stringify(JSON.stringify({version:1,state,rollback:createRollback()}))})`);
  main.webContents.reload();
  await until("!!document.querySelector('.client-market-area')&&!!document.querySelector('.client-player-board--printed')",'scroll table restores');
  await until("[...document.querySelectorAll('.printed-board-art')].every(i=>i.complete&&i.naturalWidth>0)",'original board images load');
  const baseline=await saved();assert.deepEqual(baseline,JSON.parse(JSON.stringify(state)),'Restore the exact isolated fixture through the normal save path');

  for(const [width,height] of [[1440,900],[1200,720]]){
   main.setContentSize(width,height);await delay(350);
   await run("document.querySelector('#app').scrollTop=0");await delay(150);
   const start=await bounds();
   assert.equal(start.top.position,'fixed','Top action area is fixed');assert.equal(start.rail.position,'fixed','Right player rail is fixed');
   assert.ok(start.top.top>=0&&start.top.bottom<height*.5,'Action bar stays visible across the top');
   assert.ok(start.rail.left>width*.6&&start.rail.right<=width+1,'Player rail is on the right edge');
   assert.ok(start.scrollHeight>start.clientHeight+500,'Main table is a long page');assert.ok(start.overflow<=1,'No initial horizontal page overflow');
   assert.ok(start.hand.bottom>start.top.bottom&&start.hand.top<height,'Own hand starts in the main page');
   const board=await inspectBoard('.game-table .client-player-board--printed','US');
   await shot(`${width}x${height}-top`);

   // Measure the two visual rows independent of the current scroll offset.
   const regions=await run(`Object.fromEntries(['E','N','C','M','A','S','P'].map(id=>{const r=document.querySelector('.board-region--'+id)?.getBoundingClientRect();return [id,r?{x:r.x,y:r.y,right:r.right,bottom:r.bottom}:null];}))`);
   assert.ok(Object.values(regions).every(Boolean),'All seven regions are present');
   for(const row of [['E','N','C'],['M','A','S','P']]){
    row.slice(1).forEach(id=>close(regions[id].y,regions[row[0]].y,'Regions share the required row',2));
    row.slice(1).forEach((id,index)=>assert.ok(regions[id].x>regions[row[index]].x,`${row.join('/')} has the requested left-to-right order`));
   }
   assert.ok(regions.M.y>=Math.max(regions.E.bottom,regions.N.bottom,regions.C.bottom)-1,'M/A/S/P starts below E/N/C');

   let down=-640;await wheel(down);
   if((await bounds()).scrollTop<=start.scrollTop){down=640;await wheel(down);}
   for(let i=0;i<12;i++){
    const current=await bounds();
    if(current.hand.bottom<=current.top.bottom-10&&current.scrollTop>400)break;
    await wheel(down);
   }
   const scrolled=await bounds();
   assert.ok(scrolled.scrollTop>400,'Real mouse-wheel input scrolls #app');
   assert.ok(scrolled.hand.bottom<=scrolled.top.bottom,'Hand scrolls away with the main page');
   fixedEquals(start,scrolled);assert.ok(scrolled.overflow<=1,'No horizontal overflow after scrolling');close(scrolled.windowScroll,0,'Only #app scrolls');
   await shot(`${width}x${height}-scrolled`);

   // Continue using wheel input until the bottom market is reachable.
   for(let i=0;i<24;i++){
    const visible=await run("(()=>{const r=document.querySelector('.client-market-area').getBoundingClientRect();return r.top>=document.querySelector('.action-workbench').getBoundingClientRect().bottom-1&&r.bottom<=innerHeight+1;})()");
    if(visible)break;
    const prior=(await bounds()).scrollTop;await wheel(down);
    if((await bounds()).scrollTop===prior)break;
   }
   const market=await run("(()=>{const r=document.querySelector('.client-market-area').getBoundingClientRect();return {top:r.top,bottom:r.bottom,visible:r.bottom>document.querySelector('.action-workbench').getBoundingClientRect().bottom&&r.top<innerHeight,ids:[...document.querySelectorAll('.client-market-row [data-card]')].map(e=>e.dataset.card)};})()");
   assert.ok(market.visible,'Card market is reachable by wheel');assert.deepEqual(market.ids,baseline.market,'Newest market card remains at the left end of the state order');fixedEquals(start,await bounds());
   await shot(`${width}x${height}-market`);
   const rerenderScroll=[];
   for(let toggle=0;toggle<2;toggle++){
    const before=(await bounds()).scrollTop;
    await click('#toggle-table-task');
    const after=await bounds();
    const stillVisible=await run("(()=>{const r=document.querySelector('.client-market-area').getBoundingClientRect();return r.bottom>document.querySelector('.action-workbench').getBoundingClientRect().bottom&&r.top<innerHeight;})()");
    assert.ok(after.scrollTop>400,'Rerender after action-bar toggle must not jump to the top');
    assert.ok(Math.abs(after.scrollTop-before)<=2||stillVisible,'Action-bar expansion/collapse preserves scroll position or keeps the same market visible');
    assert.ok(after.overflow<=1,'Action-bar expansion/collapse introduces no horizontal overflow');
    rerenderScroll.push({before,after:after.scrollTop,marketVisible:stillVisible});
   }
   await click('.client-market-row [data-card]');
   await until("!!document.querySelector('#viewer[open]')",'market card opens');await closeOverlay();
   await click('[data-client-supply="growth"]',{scroll:true});
   await until("!!document.querySelector('.client-table-overlay')",'global growth catalogue opens');
   const catalogue=await run("({levels:document.querySelectorAll('.client-table-overlay .table-growth-level').length,cards:document.querySelectorAll('.client-table-overlay [data-card]').length})");
   assert.equal(catalogue.levels,5);assert.ok(catalogue.cards>0,'Global growth catalogue shows all levels');
   await shot(`${width}x${height}-growth`);await closeOverlay();

   // Opponent access stays available from the fixed rail at the page bottom.
   const beforeOpponent=(await saved()).current;
   await click('[data-client-player="CN"]');await until("!!document.querySelector('#viewer[open] .client-player-board--printed')",'opponent public board opens');
   await inspectBoard('#viewer .client-player-board--printed','CN');
   const publicView=await run("(()=>{const v=document.querySelector('#viewer-body');return {trade:!!v.querySelector('[data-client-trade-owner=\"CN\"]'),allies:!!v.querySelector('[data-allies-viewer=\"CN\"], [data-owned-viewer=\"CN\"]'),privateCards:!!v.querySelector('[data-source=\"hand\"],[data-source=\"objectives\"]'),text:v.textContent};})()");
   assert.ok(publicView.trade,'Opponent detail includes public trade/export information');assert.ok(publicView.allies,'Opponent detail includes public allies');assert.equal(publicView.privateCards,false,'Opponent detail exposes no private hand or objective card controls');
   assert.equal((await saved()).current,beforeOpponent,'Opening opponent details does not switch the local operator');
   await shot(`${width}x${height}-opponent`);await closeOverlay();
   assert.deepEqual(await saved(),baseline,'Scrolling and all public inspections leave the complete saved game unchanged');
   result.checks.push({viewport:`${width}x${height}`,wheelScroll:scrolled.scrollTop,handScrolls:true,topAndRightFixed:true,noHorizontalOverflow:true,regionRows:['E/N/C','M/A/S/P'],marketOrder:market.ids,rerenderScroll,growthLevels:catalogue.levels,originalBoard:board.src,opponent:'CN',saveUnchanged:true});
  }
  assert.deepEqual(errors,[],'No renderer console errors');result.ok=true;
 }catch(error){
  result.ok=false;result.error=error.stack||String(error);result.consoleErrors=errors;
  try{result.lastBounds=await bounds();await shot('failure');}catch{}
 }finally{
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
  if(!result.ok)process.exitCode=1;
  app.quit();
 }
};
