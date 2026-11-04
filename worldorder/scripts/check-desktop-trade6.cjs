// Actual desktop integration hook. Use a dedicated WORLD_ORDER_TEST_DATA and
// WORLD_ORDER_CLIENT_PORT=18914; never point this runner at a saved user game.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const key='world-order-table-m2-v2-session-v1';
async function prepareFixture(mode){
 const {createState,applyAction}=await import('./engine.js');
 const {newFlow}=await import('./flow.js');
 const {createRollback}=await import('./rollback-state.js');
 const cards=await (await fetch('./cards.json')).json();
 let state=createState(cards,{dd:true,wit:true,growthMode:'base'},()=>.5);
 for(const player of ['US','CN','EU','RU']){
  state=applyAction(state,{type:'switch',player});
  state=applyAction(state,{type:'selectAssetDiscard',id:state.players[player].assetChoices[0].id});
  state=applyAction(state,{type:'selectObjectiveDiscard',id:state.players[player].objectiveChoices[0]});
  state=applyAction(state,{type:'chooseAssets'});
 }
 state=applyAction(state,{type:'switch',player:'US'});
 // This is an explicit isolated action fixture after real setup decisions.
 state.initialOrder=['US','CN','EU','RU'];state.flow=newFlow(state.initialOrder);
 state.actionTurns={index:0,completed:{US:0,CN:0,EU:0,RU:0}};
 state.current='US';state.phase='行动';state.players.US.smart=4;
 const cardId=mode==='engage'?'c53bb53bdb193':'c0deaa2d05c13';
 if(!state.players.US.hand.includes(cardId)){
  state.players.US.deck=state.players.US.deck.filter(id=>id!==cardId);
  state.players.US.hand.push(cardId);
 }
 localStorage.setItem('world-order-table-m2-v2-session-v1',JSON.stringify({version:1,state,rollback:createRollback()}));
 return {cardId,hand:state.players.US.hand.length};
}

module.exports=async({app,main,services})=>{
 const out=process.env.WORLD_ORDER_TEST_OUTPUT;fs.mkdirSync(out,{recursive:true});
 const result={checks:[]},errors=[];
 main.webContents.on('console-message',(_event,...args)=>{if(args[0]===3)errors.push(args[1]);});
 const run=code=>main.webContents.executeJavaScript(code,true);
 const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 async function until(code){for(let i=0;i<100;i++){try{if(await run(code))return;}catch{}await sleep(100);}throw Error('Timed out: '+code);}
 async function shot(name){main.webContents.sendInputEvent({type:'mouseMove',x:4,y:4});for(let i=0;i<4;i++){await sleep(600);try{fs.writeFileSync(path.join(out,name+'.png'),(await main.webContents.capturePage()).toPNG());return;}catch(error){if(i===3)throw error;}}}
 async function point(selector){
  await run(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'nearest',inline:'nearest'})`);
  return run(`(()=>{const b=document.querySelector(${JSON.stringify(selector)});if(!b)return null;const r=b.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return {x:Math.round(x),y:Math.round(y),visible:r.width>0&&r.height>0&&b.contains(document.elementFromPoint(x,y)),disabled:!!b.disabled};})()`);
 }
 async function tap(p){
  main.webContents.sendInputEvent({type:'mouseMove',x:p.x,y:p.y});
  main.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,x:p.x,y:p.y});
  main.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:p.x,y:p.y});await sleep(160);
 }
 async function click(selector){const p=await point(selector);assert.ok(p?.visible&&!p.disabled,'Control must be hit-testable and enabled: '+selector+' '+JSON.stringify(p));await tap(p);return p;}
 const saved=()=>run(`JSON.parse(localStorage.getItem(${JSON.stringify(key)})).state`);
 async function fixture(mode){await run(`(${prepareFixture.toString()})(${JSON.stringify(mode)})`);main.webContents.reload();await until("!!document.querySelector('.game-table')&&!document.querySelector('.draft-card')");await sleep(600);}
 async function detailToggle(selector,name){
  const position=await click(selector);assert.ok(await run("document.querySelector('#viewer').open"),name+' opens details');
  const after=await point(selector);assert.ok(after.visible,name+' opener remains above/outside details');
  assert.ok(await run(`document.querySelector(${JSON.stringify(selector)}).contains(document.elementFromPoint(${position.x},${position.y}))`),name+' original click coordinate still hits its opener');
  await tap(position);assert.equal(await run("document.querySelector('#viewer').open"),false,name+' closes from the same point');
  result.checks.push(name+' detail toggle keeps its opener hit-testable');
 }
 try{
  main.setContentSize(1440,900);await click('[data-start="local"]');await until("!!document.querySelector('.draft-card')");
  await fixture('trade');const original=await saved();
  await detailToggle('[data-board-region="M"] .board-country','Country card');
  await detailToggle('[data-board-region="E"] .board-region-heading','Region');
  assert.deepEqual(await saved(),original,'Opening details is read-only');
  await click('.hand [data-card="c0deaa2d05c13"]');await until("!!document.querySelector('.client-trade-form')");
  assert.deepEqual(await run("Array.from(document.querySelectorAll('[data-trade-resource]')).map(e=>Number(e.dataset.tradeResource))"),[0,1,2,3,4,6]);
  await shot('01-trade-six-columns');
  result.tradeBounds=await run("(()=>{const f=document.querySelector('.client-trade-form'),r=f.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scroll:f.scrollWidth,client:f.clientWidth};})()");
  assert.equal(result.tradeBounds.scroll,result.tradeBounds.client,'Trade columns have no horizontal overflow');
  // Each enabled + and − goes through a hit-tested mouse event. Disabled zero
  // capacities stay disabled instead of inventing imports or export demand.
  for(const id of await run("Array.from(document.querySelectorAll('.client-trade-form input[data-export-key],.client-trade-form input[data-import-country]')).map(e=>e.id)")){
   const max=await run(`Number(document.getElementById(${JSON.stringify(id)}).max)`);
   const add=`[data-trade-input="${id}"][data-trade-step="1"]`,subtract=`[data-trade-input="${id}"][data-trade-step="-1"]`;
   if(max>0){await click(add);assert.equal(await run(`Number(document.getElementById(${JSON.stringify(id)}).value)`),1,id+' plus');await click(subtract);assert.equal(await run(`Number(document.getElementById(${JSON.stringify(id)}).value)`),0,id+' minus');}
   else assert.ok(await run(`document.querySelector(${JSON.stringify(add)}).disabled`),id+' zero-capacity plus stays disabled');
  }
  result.checks.push('Six resource columns keep capacities and all usable plus/minus controls');
  // Direct region clicks update the pending form and preview, without consuming
  // resources until the existing authoritative command is confirmed.
  await click('[data-client-pick]');
  const chooseRegion='[data-board-region="E"] .board-region-heading';
  await click(chooseRegion);assert.ok(await run("document.querySelector('[data-trade-region=E]').checked"));
  assert.match(await run("document.querySelector('#basic-preview').textContent"),/消耗1/);
  assert.ok(await run("!!document.querySelector('#basic-preview .resource-icon--smart')"),'SP cost keeps its icon/accessible label');
  assert.deepEqual(await saved(),original,'Selecting a trade region does not save a changed game');
  await click(chooseRegion);assert.equal(await run("document.querySelector('[data-trade-region=E]').checked"),false);
  await click(chooseRegion);assert.ok(await run("document.querySelector('[data-trade-region=E]').checked"));
  await click('[data-client-return]');
  result.checks.push('Direct region toggles change only the 1-SP preview');
  const partnerSummary='[data-trade-resource="0"] .client-trade-partners > summary';
  const partnerPoint=await click(partnerSummary);assert.ok(await run("document.querySelector('[data-trade-resource=\"0\"] .client-trade-partners').open"));
  assert.ok((await point(partnerSummary)).visible,'Player-import opener stays visible while expanded');
  await tap(partnerPoint);assert.equal(await run("document.querySelector('[data-trade-resource=\"0\"] .client-trade-partners').open"),false);
  await click(partnerSummary);
  await click('[data-trade-input="trade-player-RU-0"][data-trade-step="1"]');
  await click('[data-trade-input="trade-player-RU-0"][data-trade-step="1"]');
  await click('[data-trade-input="trade-player-RU-0"][data-trade-step="1"]');
  await click('[data-trade-resource="3"] .client-trade-partners > summary');
  await click('[data-trade-input="trade-player-CN-3"][data-trade-step="1"]');
  await click('[data-trade-input="trade-import-0"][data-trade-step="1"]');
  await click('[data-trade-input="trade-export-4"][data-trade-step="1"]');
  await shot('02-trade-player-imports');
  result.checks.push('Player imports expand and close from the same button, retaining input amounts');
  const action=await run("(async()=>{const {readBasicForm}=await import('./basic-actions-ui.js');return readBasicForm();})()");
  const expected=await run(`(async()=>{const {applyAction}=await import('./engine.js');const s=JSON.parse(localStorage.getItem(${JSON.stringify(key)})).state;return applyAction(s,${JSON.stringify(action)});})()`);
  result.action=action;
  assert.equal(action.type,'playBasicCard');assert.equal(action.cardId,'c0deaa2d05c13');assert.deepEqual(action.tradeRegions,['E']);
  assert.ok(action.exports.some(row=>row.key===4&&row.quantity===1));assert.ok(action.imports.some(row=>row.key===0&&row.countryQuantity===1&&row.players.RU===3));
  assert.equal(await run("document.querySelector('#commit-basic').disabled"),false);
  await click('#commit-basic');await until("!document.querySelector('.client-trade-form')");
  const settled=await saved();assert.deepEqual(settled.players,expected.players);assert.equal(settled.current,expected.current);assert.deepEqual(settled.actionTurns,expected.actionTurns);
  assert.equal(settled.players.US.smart,original.players.US.smart-1);
  assert.equal(settled.players.RU.commerce.filter(c=>!c.ready).length,1);assert.equal(settled.players.CN.commerce.filter(c=>!c.ready).length,1);
  assert.equal(settled.players.US.hand.includes('c0deaa2d05c13'),false);assert.ok(settled.players.US.played.includes('c0deaa2d05c13'));
  result.settlement={US:{money:settled.players.US.money,resources:settled.players.US.resources,smart:settled.players.US.smart},RU:{money:settled.players.RU.money,commerce:settled.players.RU.commerce},CN:{money:settled.players.CN.money,commerce:settled.players.CN.commerce}};
  result.checks.push('Actual confirmation exactly matches applyAction for all players, money, resources, commerce cards and SP');
  await shot('03-trade-settled');
  // A separate legal intervention fixture exposes genuine ineligible regions.
  // Clicking one must keep the current choice and the board-selection mode.
  await fixture('engage');await click('.hand [data-card="c53bb53bdb193"]');await until("!!document.querySelector('#basic-region')");
  const invalid=await run("['M','E','C','P','A','N','S'].find(r=>!Array.from(document.querySelector('#basic-region').options).some(o=>o.value===r&&!o.disabled))");
  assert.ok(invalid,'Intervention fixture has a real ineligible region');
  await click('[data-client-pick]');await click('[data-region-field="basic-region"]');
  const beforeInvalid=await run("document.querySelector('#basic-region').value");
  await click(`[data-board-region="${invalid}"] .board-region-heading`);
  assert.equal(await run("document.querySelector('#basic-region').value"),beforeInvalid);
  assert.ok(await run("document.body.classList.contains('client-picking')"),'Invalid region must not close board selection');
  assert.equal(await run("document.querySelector('#viewer').open"),false,'Invalid target must not become a detail popup');
  result.checks.push('Invalid region preserves both the selected value and board-selection mode');
  await click('[data-client-return]');await click('#cancel-table-card');
  main.setContentSize(1200,720);await sleep(500);await fixture('trade');await click('.hand [data-card="c0deaa2d05c13"]');
  await shot('04-trade-small-window');
  result.small=await run("({w:innerWidth,h:innerHeight,bodyWidth:document.body.scrollWidth,bodyHeight:document.body.scrollHeight,formWidth:document.querySelector('.client-trade-form').clientWidth,formScroll:document.querySelector('.client-trade-form').scrollWidth,contentWidth:document.querySelector('.client-trade-content').clientWidth,contentScroll:document.querySelector('.client-trade-content').scrollWidth,overflow:Array.from(document.querySelectorAll('.client-trade-content *')).filter(e=>e.clientWidth>0&&e.scrollWidth>e.clientWidth+1).map(e=>({tag:e.tagName,class:e.className,text:e.textContent.slice(0,45),width:e.clientWidth,scroll:e.scrollWidth,whiteSpace:getComputedStyle(e).whiteSpace,minWidth:getComputedStyle(e).minWidth}))})");
  assert.equal(result.small.w,result.small.bodyWidth);assert.equal(result.small.h,result.small.bodyHeight);assert.equal(result.small.formWidth,result.small.formScroll);
  assert.equal(result.small.contentWidth,result.small.contentScroll,'Small-window trade content has no horizontal overflow');
  for(const selector of ['.client-hand-heading [data-tray="hand"]','#hidehand','#cancel-table-card','[data-client-pick]','#commit-basic']){
   const p=await point(selector);assert.ok(p?.visible&&!p.disabled,'Small trade view leaves control hit-testable: '+selector);
  }
  result.checks.push('Small trade window leaves hand tabs, hide hand, cancel, board picking and confirmation usable');
  result.servicePids=[...services.values()].map(s=>s.child.pid);result.errors=errors;result.passed=true;
 }catch(error){result.passed=false;result.error=error.stack;try{await shot('failure');}catch(captureError){result.captureError=captureError.message;}}
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));app.quit();
};
