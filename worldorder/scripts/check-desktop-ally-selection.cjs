// Isolated desktop acceptance for selecting allied cards as a pending relation
// discount. Uses the real form preview and normal confirmation; no user profile.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
module.exports=async({app,main,services})=>{
 const out=process.env.WORLD_ORDER_TEST_OUTPUT,root=path.resolve(__dirname,'..');
 const result={suite:'direct-ally-discount',checks:[]};
 const SESSION='world-order-table-m2-v2-session-v1';
 const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const run=code=>main.webContents.executeJavaScript(code,true);
 const load=file=>import(pathToFileURL(path.join(root,'dist',file)).href);
 async function until(code){for(let i=0;i<100;i++){try{if(await run(code))return;}catch{}await delay(100);}throw Error('Timed out: '+code);}
 async function click(selector){
  await run(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'center',inline:'nearest'})`);await delay(100);
  const point=await run(`(()=>{const button=document.querySelector(${JSON.stringify(selector)});if(!button)return null;const r=button.getBoundingClientRect(),x=Math.round(r.x+r.width/2),y=Math.round(r.y+r.height/2);return {x,y,visible:button.contains(document.elementFromPoint(x,y)),disabled:!!button.disabled};})()`);
  assert.ok(point?.visible&&!point.disabled,'Visible enabled control: '+selector);
  main.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,x:point.x,y:point.y});
  main.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:point.x,y:point.y});await delay(180);
 }
 async function shot(name){await delay(250);fs.writeFileSync(path.join(out,name+'.png'),(await main.webContents.capturePage()).toPNG());}
 async function chooseCountry(id){await run(`(()=>{const field=document.querySelector('#basic-country');field.value=${JSON.stringify(id)};field.dispatchEvent(new Event('change',{bubbles:true}));})()`);await delay(120);}
 const saved=()=>run(`localStorage.getItem(${JSON.stringify(SESSION)})`);
 try{
  assert.ok(out&&process.env.WORLD_ORDER_TEST_DATA,'Isolated output/data are required');
  assert.equal(Number(process.env.WORLD_ORDER_CLIENT_PORT),18929);fs.mkdirSync(out,{recursive:true});
  const [{createState,applyAction},{relationCountries,relationPreview},{RESEARCH_DATA},{createRollback},{ACTION_CARDS}]=await Promise.all(['engine.js','country-actions.js','research-data.js','rollback-state.js','basic-actions.js'].map(load));
  const cards=JSON.parse(fs.readFileSync(path.join(root,'dist/cards.json'),'utf8')),byId=Object.fromEntries(cards.map(card=>[card.id,card]));
  let state=createState(cards,{dd:false,wit:false},()=>.5);
  for(const owner of ['US','CN','EU','RU']){
   state=applyAction(state,{type:'switch',player:owner});
   state=applyAction(state,{type:'selectAssetDiscard',id:state.players[owner].assetChoices[0].id});
   state=applyAction(state,{type:'chooseAssets'});
  }
  const owner=state.flow.order[0];state=applyAction(state,{type:'switch',player:owner});
  const player=state.players[owner],cardId=player.hand.find(id=>ACTION_CARDS[id]?.effect==='relations');
  assert.ok(cardId,'The opening hand contains an ordinary relation card');player.resources[5]=10;
  let fixture;
  for(const target of relationCountries(state,ACTION_CARDS[cardId])){
   const targetInfo=RESEARCH_DATA[target];
   if(player.allies.some(id=>RESEARCH_DATA[id].countryName===targetInfo.countryName))continue;
   for(const ally of player.allies.filter(id=>RESEARCH_DATA[id].region===targetInfo.region)){
    try{
     const before=relationPreview(state,{country:target,exhaust:[]},ACTION_CARDS[cardId]);
     const after=relationPreview(state,{country:target,exhaust:[ally]},ACTION_CARDS[cardId]);
     if(before.cost>after.cost){fixture={owner,cardId,target,ally,before:before.cost,after:after.cost};break;}
    }catch{}
   }
   if(fixture)break;
  }
  assert.ok(fixture,'A real ready ally can reduce an available country cost');
  player.resources[5]=fixture.before-1; // Initial preview cannot confirm until reduced.
  main.setContentSize(1440,900);await click('[data-start="local"]');await until("!!document.querySelector('.game-table')");
  await run(`localStorage.setItem(${JSON.stringify(SESSION)},${JSON.stringify(JSON.stringify({version:1,state,rollback:createRollback()}))})`);
  main.webContents.reload();await until("!!document.querySelector('.client-owned-cards')");
  const original=await saved(),ally=`.client-owned-cards .client-owned-ally[data-owned-card="${fixture.ally}"] [data-card]`,field=`#basic-discounts [data-basic-exhaust="${fixture.ally}"]`;
  await click(`[data-source="hand"][data-card="${cardId}"]`);await until("!!document.querySelector('#basic-form')");
  await chooseCountry(fixture.target);
  assert.equal(await run("document.querySelector('#commit-basic').disabled"),true,'The original insufficient-diplomacy preview blocks confirmation');
  assert.equal(await run(`document.querySelector(${JSON.stringify(ally)}).classList.contains('client-ally-discount-eligible')`),true,'A discount remains selectable while the commit is unaffordable');
  await click(ally);
  assert.equal(await run(`document.querySelector(${JSON.stringify(field)}).checked`),true,'Native card click changes the original checkbox');
  assert.equal(await run("document.querySelector('#viewer').open"),false,'A discount click does not open card inspection');
  assert.equal(await run("document.querySelector('#commit-basic').disabled"),false,'The existing form preview now allows confirmation');
  // The client replaces resource names with accessible resource icons, whose
  // labels do not appear in textContent. Assert the amount and payment boundary.
  assert.match(await run("document.querySelector('#basic-preview').textContent"),new RegExp('支付'+fixture.after+'(?:外交)?；'));
  assert.equal(await saved(),original,'No state or save changes before confirmation');
  assert.equal(await run(`document.querySelector(${JSON.stringify(ally+' img')}).getAttribute('src')`),byId[fixture.ally].image,'Pending selection does not flip the ally prematurely');
  assert.equal(await run(`document.querySelector(${JSON.stringify(ally)}).getAttribute('aria-pressed')`),'true');
  await shot('01-ally-selected-before-confirm');
  await click(ally);
  assert.equal(await run(`document.querySelector(${JSON.stringify(field)}).checked`),false,'A second click removes the pending discount');
  assert.equal(await run("document.querySelector('#commit-basic').disabled"),true,'Removing the discount restores the original insufficient-fee preview');
  assert.equal(await saved(),original);
  // applyRoomPermissions uses this exact source disabled flag for busy/offline
  // and non-actor forms. Cards remain inspectable read-only buttons, so the
  // adapter must read the source flag instead of trusting the visible card.
  await run(`(async()=>{const field=document.querySelector(${JSON.stringify(field)});field.dataset.roomDisabled=String(field.disabled);field.disabled=true;const {syncClientAllySelection}=await import('./client-ally-selection.js');syncClientAllySelection();})()`);
  await click(ally);
  assert.equal(await run(`document.querySelector(${JSON.stringify(field)}).checked`),false,'A room-disabled original checkbox cannot be selected from its card');
  assert.equal(await run("document.querySelector('#viewer').open"),false,'A disabled pending choice is consumed without opening a competing action');
  assert.equal(await saved(),original);
  // An option absent from the current region is never invented by the adapter.
  await run(`(async()=>{document.querySelector(${JSON.stringify(field)}).closest('label').remove();const {syncClientAllySelection}=await import('./client-ally-selection.js');syncClientAllySelection();})()`);
  await click(ally);
  assert.equal(await run(`!!document.querySelector(${JSON.stringify(field)})`),false,'Clicking a card cannot recreate a removed original option');
  assert.equal(await saved(),original,'Out-of-context inspection never consumes an ally');
  if(await run("document.querySelector('#viewer').open"))await click('#viewer .close');
  // Refreshing the real target rebuilds the original options and clears pending
  // selections; then the normal confirmation is the only state mutation.
  await chooseCountry(fixture.target);await click(ally);
  assert.equal(await saved(),original);
  await click('#commit-basic');await until(`JSON.parse(localStorage.getItem(${JSON.stringify(SESSION)})).state.players[${JSON.stringify(owner)}].allies.includes(${JSON.stringify(fixture.target)})`);
  const completed=JSON.parse(await saved()).state,actual=completed.players[owner];
  assert.ok(actual.exhaustedAllies.includes(fixture.ally),'Original confirmation consumes the selected ally');
  assert.equal(actual.resources[5],player.resources[5]-fixture.after,'Original settlement charges exactly the previewed diplomacy');
  assert.ok(actual.played.includes(cardId),'Original confirmation plays the relation card');
  await shot('02-after-normal-confirm');
  result.checks.push('Real mouse card clicks toggle the existing exhaust checkbox and update the original cost preview','An otherwise unaffordable action becomes confirmable through its legal pending discount','Selection and deselection do not alter saved engine state or turn the ally over','Room-disabled and missing original choices cannot be selected through cards','Normal confirmation alone consumes the ally, spends the previewed diplomacy and plays the action card');
  result.fixture=fixture;result.passed=true;
 }catch(error){result.passed=false;result.error=error.stack;try{await shot('failure');}catch{}}
 result.servicePids=[...services.values()].map(service=>service.child.pid);
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));app.quit();
};
