// Focused visual acceptance. Requires an isolated userData and port; does not
// replay UI/trade/room permission suites or modify the user's saved game.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
module.exports=async({app,main,services})=>{
 const out=process.env.WORLD_ORDER_TEST_OUTPUT,root=path.resolve(__dirname,'..');
 const result={suite:'ally-reverse-and-fusion',checks:[]};
 const delay=ms=>new Promise(r=>setTimeout(r,ms));
 const run=code=>main.webContents.executeJavaScript(code,true);
 const load=file=>import(pathToFileURL(path.join(root,'dist',file)).href);
 const SESSION='world-order-table-m2-v2-session-v1';
 async function until(code){for(let i=0;i<100;i++){try{if(await run(code))return;}catch{}await delay(100);}throw Error('Timed out: '+code);}
 async function click(selector){
  await run(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'nearest',inline:'nearest'})`);
  const point=await run(`(()=>{const b=document.querySelector(${JSON.stringify(selector)});if(!b)return null;const r=b.getBoundingClientRect(),x=Math.round(r.x+r.width/2),y=Math.round(r.y+r.height/2);return {x,y,visible:b.contains(document.elementFromPoint(x,y)),disabled:!!b.disabled};})()`);
  assert.ok(point?.visible&&!point.disabled,'Visible control: '+selector);
  main.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,x:point.x,y:point.y});
  main.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:point.x,y:point.y});await delay(180);
 }
 async function shot(name){await delay(300);fs.writeFileSync(path.join(out,name+'.png'),(await main.webContents.capturePage()).toPNG());}
 try{
  assert.ok(out&&process.env.WORLD_ORDER_TEST_DATA,'Isolated output/data are required');
  assert.equal(Number(process.env.WORLD_ORDER_CLIENT_PORT),18927);
  fs.mkdirSync(out,{recursive:true});
  const [{createState,applyAction},{relationPreview,applyRelations},{RESEARCH_DATA},{regionCountries},{createRollback},{ALLY_BACK_IMAGES}]=await Promise.all(['engine.js','country-actions.js','research-data.js','country-piles.js','rollback-state.js','ally-card-art.js'].map(load));
  const cards=JSON.parse(fs.readFileSync(path.join(root,'dist/cards.json'),'utf8')),byId=Object.fromEntries(cards.map(c=>[c.id,c]));
  let state=createState(cards,{dd:false,wit:false},()=>.5);
  for(const owner of ['US','CN','EU','RU']){
   state=applyAction(state,{type:'switch',player:owner});
   state=applyAction(state,{type:'selectAssetDiscard',id:state.players[owner].assetChoices[0].id});
   state=applyAction(state,{type:'chooseAssets'});
  }
  const owner=state.current,p=state.players[owner];p.resources[5]=10;p.exhaustedAllies??=[];
  const previous=p.allies.find(id=>cards.some(c=>c.type==='country'&&RESEARCH_DATA[c.id]?.countryName===RESEARCH_DATA[id]?.countryName&&regionCountries(state.regions[RESEARCH_DATA[c.id].region]).includes(c.id)));
  const upgraded=cards.find(c=>c.type==='country'&&RESEARCH_DATA[c.id]?.countryName===RESEARCH_DATA[previous].countryName).id;
  const relation={country:upgraded,exhaust:[]};
  applyRelations(state,relation,relationPreview(state,relation,{countrySearchRegion:RESEARCH_DATA[upgraded].region}));
  p.fdi=[upgraded];p.bases=[upgraded];
  for(let i=0;i<16;i++)state=applyAction(state,{type:'passTurn',cardId:state.players[state.current].hand[0]});
  assert.equal(state.current,owner);assert.equal(state.flow.step,'research');
  main.setContentSize(1440,900);await click('[data-start="local"]');await until("!!document.querySelector('.game-table')");
  await run(`localStorage.setItem(${JSON.stringify(SESSION)},${JSON.stringify(JSON.stringify({version:1,state,rollback:createRollback()}))})`);
  main.webContents.reload();await until("!!document.querySelector('.client-owned-cards')");
  const ally=`.client-owned-ally[data-owned-card="${upgraded}"]`,img=ally+' .cardbutton img';
  await until(`document.querySelector(${JSON.stringify(img)})?.complete`);
  assert.equal(await run(`document.querySelector(${JSON.stringify(img)}).getAttribute('src')`),byId[upgraded].image);
  assert.equal(await run(`document.querySelectorAll(${JSON.stringify(ally+' .client-ally-underlay')}).length`),1);
  await shot('01-fusion-ready');
  await click(`[data-client-player="${owner}"]`);await until("document.querySelector('#viewer').open");
  await run("document.querySelector('#viewer .client-public-allies').scrollIntoView({block:'center'})");
  await shot('02-fusion-public-detail');await click(`[data-client-player="${owner}"]`);
  await click('#start-research');await click(ally+' [data-card]');
  await click(`#viewer [data-card-action="researchAlly"][data-id="${upgraded}"]`);
  await until(`document.querySelector(${JSON.stringify(img)})?.getAttribute('src')===${JSON.stringify(ALLY_BACK_IMAGES[upgraded])}`);
  assert.equal(await run(`getComputedStyle(document.querySelector(${JSON.stringify(img)})).transform`),'none');
  assert.equal(await run(`document.querySelector(${JSON.stringify(ally+' .client-ally-underlay')}).getAttribute('src')`),ALLY_BACK_IMAGES[previous]);
  const marks=await run(`document.querySelector(${JSON.stringify(ally+' .client-owned-marks')}).textContent`);
  assert.match(marks,/已消耗/);assert.match(marks,/融合/);assert.match(marks,/FDI ×1/);assert.match(marks,/基地 ×1/);
  const saved=await run(`localStorage.getItem(${JSON.stringify(SESSION)})`);
  await click(ally+' [data-card]');await until("document.querySelector('#viewer').open");
  assert.equal(await run("document.querySelector('#viewer .viewerimage').getAttribute('src')"),byId[upgraded].image,'A flipped ally still opens its public face for inspection');
  assert.equal(await run(`localStorage.getItem(${JSON.stringify(SESSION)})`),saved,'Inspecting the card does not change the saved state');
  await click('#viewer .close');
  main.webContents.reload();await until(`document.querySelector(${JSON.stringify(img)})?.getAttribute('src')===${JSON.stringify(ALLY_BACK_IMAGES[upgraded])}`);
  await click(`[data-client-player="${owner}"]`);await until("document.querySelector('#viewer').open");
  await run("document.querySelector('#viewer .client-public-allies').scrollIntoView({block:'center'})");
  await shot('03-fusion-exhausted-detail');
  assert.equal(await run("Array.from(document.querySelectorAll('.client-owned-ally img')).some(img=>!img.complete||img.naturalWidth===0)"),false,'Every visible ally image loaded');
  result.checks.push('Actual relation upgrade retains one interactive card and exposed original underlay','Research consumption switches main and underlay to exact TTS backs without rotation','Fusion, FDI and base marks survive consumption and reload','Flipped card opens original public face without modifying saved state');
  result.fixture={owner,upgraded,underlay:previous};result.passed=true;
 }catch(error){result.passed=false;result.error=error.stack;try{await shot('failure');}catch{}}
 result.servicePids=[...services.values()].map(service=>service.child.pid);
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));app.quit();
};
