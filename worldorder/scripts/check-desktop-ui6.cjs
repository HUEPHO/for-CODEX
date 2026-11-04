// Actual Electron UI acceptance with isolated userData/port. All fixture setup
// precedes localStorage restoration; tested actions use normal rendered buttons.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
module.exports=async({app,main,services})=>{
 const out=process.env.WORLD_ORDER_TEST_OUTPUT,root=path.resolve(__dirname,'..');
 fs.mkdirSync(out,{recursive:true});
 const result={suite:'ui6-owned-player-board',port:Number(process.env.WORLD_ORDER_CLIENT_PORT),checks:[]},errors=[];
 const delay=ms=>new Promise(r=>setTimeout(r,ms));
 const run=code=>main.webContents.executeJavaScript(code,true);
 const load=file=>import(pathToFileURL(path.join(root,'dist',file)).href);
 const SESSION='world-order-table-m2-v2-session-v1';
 main.webContents.on('console-message',(_event,...args)=>{if(args[0]===3)errors.push(args[1]);});
 async function until(code){for(let i=0;i<100;i++){try{if(await run(code))return;}catch{}await delay(100);}throw Error('Timed out: '+code);}
 async function shot(name){await delay(400);fs.writeFileSync(path.join(out,name+'.png'),(await main.webContents.capturePage()).toPNG());}
 async function point(selector,{scroll=true}={}){
  if(scroll)await run(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'nearest',inline:'nearest'})`);
  return run(`(()=>{const b=document.querySelector(${JSON.stringify(selector)});if(!b)return null;const r=b.getBoundingClientRect(),x=Math.round(r.x+r.width/2),y=Math.round(r.y+r.height/2);return {x,y,visible:r.width>0&&r.height>0&&b.contains(document.elementFromPoint(x,y)),disabled:!!b.disabled};})()`);
 }
 async function click(selector,existing){
  const p=existing||await point(selector);
  assert.ok(p?.visible&&!p.disabled,'Control must be visible, enabled and hit-testable: '+selector);
  if(existing)assert.ok(await run(`document.querySelector(${JSON.stringify(selector)}).contains(document.elementFromPoint(${p.x},${p.y}))`),'The opener remains at the original point: '+selector);
  main.webContents.sendInputEvent({type:'mouseMove',x:p.x,y:p.y});main.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,x:p.x,y:p.y});main.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:p.x,y:p.y});await delay(220);
 }
 const saved=()=>run(`JSON.parse(localStorage.getItem(${JSON.stringify(SESSION)})).state`);
 async function restore(state){
  const {createRollback}=await load('rollback-state.js');
  await run(`localStorage.setItem(${JSON.stringify(SESSION)},${JSON.stringify(JSON.stringify({version:1,state,rollback:createRollback()}))})`);
  main.webContents.reload();await until("!!document.querySelector('.client-owned-cards')");await delay(400);
  assert.deepEqual(await saved(),JSON.parse(JSON.stringify(state)),'The client restores the exact serialized fixture through its normal save path');
 }
 try{
  assert.equal(result.port,18913,'This acceptance run must use its dedicated port');
  const [{createState,applyAction},{growthPreview,applyGrowth},{relationPreview,applyRelations},{RESEARCH_DATA},{regionCountries},{grantEventEffect,EFFECT_IDS},{tradePreview,applyTrade}]=await Promise.all([
   load('engine.js'),load('domestic-actions.js'),load('country-actions.js'),load('research-data.js'),load('country-piles.js'),load('event-effect-state.js'),load('trade.js')]);
  const cards=JSON.parse(fs.readFileSync(path.join(root,'dist/cards.json'),'utf8')),byId=Object.fromEntries(cards.map(c=>[c.id,c]));
  let action=createState(cards,{dd:true,wit:true,growthMode:'base'},()=>.5);
  for(const owner of ['US','CN','EU','RU']){
   action=applyAction(action,{type:'switch',player:owner});
   action=applyAction(action,{type:'selectAssetDiscard',id:action.players[owner].assetChoices[0].id});
   action=applyAction(action,{type:'selectObjectiveDiscard',id:action.players[owner].objectiveChoices[0]});
   action=applyAction(action,{type:'chooseAssets'});
  }
  assert.equal(action.current,'CN');const owner=action.current,p=action.players[owner];
  // A legal round-two public setup, using real cards and actual acquisition
  // executors. The public fixtures intentionally do not model an entire game.
  action.round=action.flow.round=2;p.money=100;p.resources[4]=10;p.resources[5]=10;p.exhaustedAllies??=[];
  const growth='cd3313f35a370';assert.ok(byId[growth]);
  for(const growthId of ['c7efaad90fb20',growth])applyGrowth(action,growthPreview(action,{growthId}));
  const old=p.allies.find(id=>cards.some(c=>c.type==='country'&&RESEARCH_DATA[c.id]?.countryName===RESEARCH_DATA[id]?.countryName&&regionCountries(action.regions[RESEARCH_DATA[c.id].region]).includes(c.id)));
  const upgraded=cards.find(c=>c.type==='country'&&RESEARCH_DATA[c.id]?.countryName===RESEARCH_DATA[old].countryName).id;
  const countrySearchRegion=RESEARCH_DATA[upgraded].region,relation={country:upgraded,exhaust:[]};
  applyRelations(action,relation,relationPreview(action,relation,{countrySearchRegion}));
  p.exhaustedAllies.push(upgraded);const researchAlly=p.allies.find(id=>id!==upgraded);
  assert.deepEqual(p.countryUnderlays[upgraded],[old]);
  // Another player's ordinary import consumes one of China's actual commodity
  // cards; the snapshot retains both a used and an available export card.
  action.current='US';applyTrade(action,tradePreview(action,{imports:[{key:3,countryQuantity:0,players:{CN:1}}]},{name:'国际贸易'}));action.current=owner;
  grantEventEffect(action,owner,EFFECT_IDS.siberia);
  let research=structuredClone(action);
  for(let i=0;i<16;i++)research=applyAction(research,{type:'passTurn',cardId:research.players[research.current].hand[0]});
  assert.equal(research.flow.step,'research');assert.equal(research.current,owner);assert.equal(research.flow.research,null);
  result.fixture={owner,upgraded,underlay:old,researchAlly,growth,effect:EFFECT_IDS.siberia};

  main.setContentSize(1440,900);await click('[data-start="local"]');await until("!!document.querySelector('.game-table')");
  await restore(action);await shot('01-owned-action');
  assert.ok(await run(`!!document.querySelector('.client-owned-ally.has-underlays.is-exhausted[data-owned-card="${upgraded}"]')`));
  assert.equal(await run(`document.querySelector('[data-owned-card="${upgraded}"] .client-owned-mark--stack').textContent`),'融合 · 2张');
  assert.equal(await run(`getComputedStyle(document.querySelector('[data-owned-card="${upgraded}"] .cardbutton img')).transform`),'none','Exhausted card art stays upright');
  assert.match(await run(`document.querySelector('[data-client-player="${owner}"] .client-player-commerce').textContent`),/1\/2/);
  const summaryReady=await run(`Array.from(document.querySelectorAll('[data-client-player="${owner}"] .client-commerce-card')).map(c=>c.className)`);
  assert.match(summaryReady[0],/is-used/);assert.match(summaryReady[1],/is-ready/);
  result.checks.push('upgraded ally stack and exhaustion; export availability from restored state');

  // The same physical button position opens/closes both self and opponent views.
  for(const seat of [owner,'US']){
   const selector=`[data-client-player="${seat}"]`,opener=await point(selector,{scroll:false}),before=await run(`localStorage.getItem(${JSON.stringify(SESSION)})`);
   for(let repeat=0;repeat<3;repeat++){
    await click(selector,opener);await until("document.querySelector('#viewer').open");
    assert.equal(await run("document.querySelector('.client-player-board').dataset.clientBoardOwner"),seat);
    assert.equal(await run("document.querySelectorAll('#viewer [data-board-production]').length"),7);
    assert.equal(await run("document.querySelector('#viewer-body').textContent.includes('我的手牌')"),false);
    assert.equal(await run("document.querySelectorAll('#viewer [data-source=hand],#viewer [data-drag-card]').length"),0,'Details contain no hand controls');
    assert.ok(await run(`(()=>{const b=document.querySelector(${JSON.stringify(selector)}),d=document.querySelector('#viewer'),r=b.getBoundingClientRect(),v=d.getBoundingClientRect();return b.contains(document.elementFromPoint(${opener.x},${opener.y}))&&(v.right<=r.left||v.left>=r.right||v.bottom<=r.top||v.top>=r.bottom)})()`),'The detail window cannot overlap its triggering player button');
    if(seat===owner&&repeat===0)await shot('02-self-dynamic-board');
    await click(selector,opener);assert.equal(await run("document.querySelector('#viewer').open"),false);
   }
   assert.equal(await run(`localStorage.getItem(${JSON.stringify(SESSION)})`),before,'Looking at player details never switches the operator or mutates state');
  }
  result.checks.push('self/opponent public dynamic boards; three same-position toggles each; no private hands or seat change; opener never covered');

  await click(`.client-owned-growth [data-card="${growth}"]`);
  assert.ok(await run(`!!document.querySelector('#table-task-body [data-card-action="useGrowthAbility"][data-id="${growth}"]')`),'Owned active growth opens its original use form');
  await shot('03-active-growth');await click('#cancel-table-card');
  const effectSelector=`.client-owned-effects [data-use-event-effect="${EFFECT_IDS.siberia}"]`;
  assert.ok(await run(`!!document.querySelector(${JSON.stringify(effectSelector)})`));
  const beforeEffect=await saved();await click(effectSelector);await until(`JSON.parse(localStorage.getItem(${JSON.stringify(SESSION)})).state.eventEffects.find(e=>e.cardId==='${EFFECT_IDS.siberia}').usedRound===2`);
  const afterEffect=await saved();assert.equal(afterEffect.players.CN.money,beforeEffect.players.CN.money-9);assert.equal(afterEffect.players.RU.money,beforeEffect.players.RU.money+9);
  assert.equal(afterEffect.players.RU.commerce.filter(c=>c.ready).length,beforeEffect.players.RU.commerce.filter(c=>c.ready).length-1);
  assert.equal(await run(`document.querySelector(${JSON.stringify(effectSelector)}).disabled`),true);
  result.checks.push('active growth uses original form; pipeline effect uses original UI, pays once, consumes Russian export card and disables after use');
  await shot('04-effect-used');

  await restore(research);await shot('05-research-start');await click('#start-research');
  await until(`!!JSON.parse(localStorage.getItem(${JSON.stringify(SESSION)})).state.flow.research`);
  const initialResearch=(await saved()).flow.research.remaining;
  await click(`.client-owned-ally[data-owned-card="${researchAlly}"] [data-card]`);
  await click(`#viewer [data-card-action="researchAlly"][data-id="${researchAlly}"]`);
  await until(`document.querySelector('.client-owned-ally[data-owned-card="${researchAlly}"]').classList.contains('is-exhausted')`);
  const researched=await saved();assert.equal(researched.flow.research.remaining,initialResearch+RESEARCH_DATA[researchAlly].countryValue);
  assert.ok(researched.players.CN.exhaustedAllies.includes(researchAlly));
  assert.equal(await run(`getComputedStyle(document.querySelector('.client-owned-ally[data-owned-card="${researchAlly}"] .cardbutton img')).transform`),'none');
  assert.match(await run(`document.querySelector('.client-owned-ally[data-owned-card="${researchAlly}"] .client-owned-marks').textContent`),/已消耗/);
  await shot('06-researched-ally');
  main.webContents.reload();await until("!!document.querySelector('.client-owned-cards')");
  assert.ok(await run(`document.querySelector('.client-owned-ally[data-owned-card="${researchAlly}"]').classList.contains('is-exhausted')`));
  result.checks.push('normal startResearch and researchAlly UI update research points, reverse owned appearance and survive reload');
  result.errors=errors;assert.deepEqual(errors,[],'No renderer errors');result.passed=true;
 }catch(error){result.passed=false;result.error=error.stack;result.errors=errors;try{await shot('failure');}catch{}}
 result.servicePids=[...services.values()].map(s=>s.child.pid);
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));app.quit();
};
