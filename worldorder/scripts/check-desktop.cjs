// Runs inside the actual Electron application, using a separate test profile.
// WORLD_ORDER_CLIENT_TEST points here; excluded from release packages.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
module.exports=async({app,main,services})=>{
  const out=process.env.WORLD_ORDER_TEST_OUTPUT;
  fs.mkdirSync(out,{recursive:true});
  const errors=[];main.webContents.on('console-message',(_e,...args)=>{if(args[0]===3)errors.push(args[1]);});
  const run=code=>main.webContents.executeJavaScript(code,true);
  async function until(code){for(let i=0;i<100;i++){try{if(await run(code))return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('Timed out: '+code);}
  async function shot(name){for(let i=0;i<4;i++){await new Promise(r=>setTimeout(r,1000));try{fs.writeFileSync(path.join(out,name+'.png'),(await main.webContents.capturePage()).toPNG());return;}catch(error){if(i===3)throw error;}}}
  async function click(selector){
    await run(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'nearest',inline:'nearest'})`);
    const point=await run(`(()=>{const b=document.querySelector(${JSON.stringify(selector)});if(!b)return null;const r=b.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return {x:Math.round(x),y:Math.round(y),visible:r.width>0&&r.height>0&&b.contains(document.elementFromPoint(x,y)),disabled:!!b.disabled};})()`);
    assert.ok(point?.visible&&!point.disabled,'Control must be visible, enabled and hit-testable: '+selector);
    main.webContents.sendInputEvent({type:'mouseMove',x:point.x,y:point.y});
    main.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,x:point.x,y:point.y});
    main.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:point.x,y:point.y});
    await new Promise(r=>setTimeout(r,180));
  }
  const result={};
  try{
    main.setContentSize(1440,900);await shot('01-menu');
    assert.equal(await run('typeof require'),'undefined');
    assert.equal(await run('Object.keys(window.worldOrderDesktop).length'),5);
    await click('[data-start="local"]');await until("!!document.querySelector('.draft-card')");
    await shot('02-draft');
    assert.ok(await run("Array.from(document.querySelectorAll('.draft-card,#confirm-assets')).every(b=>{const r=b.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})"),'All six draft cards and confirmation must be visible and hit-testable');
    result.setupViewport=await run('({h:innerHeight,body:document.body.scrollHeight,app:document.querySelector("#app").scrollHeight,choices:document.querySelectorAll(".draft-card").length})');
    for(const seat of ['US','CN','EU','RU']){
      if(seat!=='US')await click('#go-opening');
      await until("!!document.querySelector('[data-command=selectAssetDiscard]')");
      assert.equal(await run("document.querySelector('.client-player--self').dataset.clientPlayer"),seat);
      await click('[data-command="selectAssetDiscard"]');await click('[data-command="selectObjectiveDiscard"]');
      await click('#confirm-assets');
    }
    await until("!document.querySelector('.draft-card')");
    await new Promise(r=>setTimeout(r,3500));
    await shot('03-board');
    result.boardViewport=await run('({h:innerHeight,body:document.body.scrollHeight,w:innerWidth,scroll:document.body.scrollWidth,regions:document.querySelectorAll(".board-region").length,hand:document.querySelectorAll(".hand .cardbutton").length})');
    assert.ok(await run("Array.from(document.querySelectorAll('.board-region-footer')).every(b=>{const r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})"),'Region rewards must not be covered by the prompt');
    assert.equal(result.boardViewport.regions,7);assert.equal(result.boardViewport.hand,6);assert.equal(result.boardViewport.h,result.boardViewport.body);assert.equal(result.boardViewport.w,result.boardViewport.scroll);
    // Choose the actual first actor, then a legal card through ordinary UI.
    const current=await run("JSON.parse(localStorage.getItem('world-order-table-m2-v2-session-v1')).state.flow.order[0]");
    await run(`(()=>{const select=document.querySelector('#client-seat');select.value=${JSON.stringify(current)};select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await click('#hidehand');assert.equal(await run("document.querySelectorAll('.hand [data-card]').length"),0);
    await click('#hidehand');assert.equal(await run("document.querySelectorAll('.hand .cardbutton').length"),6);
    // Inspecting an opponent is read-only and keeps the local operator unchanged.
    const opponent=['US','CN','EU','RU'].find(id=>id!==current);
    const beforeInspect=await run("localStorage.getItem('world-order-table-m2-v2-session-v1')");
    await click(`[data-client-player="${opponent}"]`);await shot('03-player-details');
    assert.ok(await run("!!document.querySelector('#viewer[open] .public-cards')"));
    assert.equal(await run("localStorage.getItem('world-order-table-m2-v2-session-v1')"),beforeInspect);
    assert.ok(await run("!!document.querySelector('.client-player-board')"));
    assert.ok(await run("Array.from(document.querySelectorAll('.player-board-resource')).every(e=>e.querySelectorAll('.resource-icon').length===1)"),'Dynamic tracks contain one symbol each');
    assert.ok(await run("document.querySelector('.client-public-allies') && Array.from(document.querySelectorAll('.client-public-allies [data-card]')).every(e=>e.dataset.source==='view')"),'Detailed allies share live visuals and stay read-only');
    assert.equal(await run("document.querySelector('#viewer-body').textContent.includes('我的手牌')"),false);
    await click(`[data-client-player="${opponent}"]`);assert.equal(await run("document.querySelector('#viewer').open"),false,'Same player button closes its details');
    const candidates=await run("Array.from(document.querySelectorAll('.hand .cardbutton')).filter(b=>!b.disabled).map(b=>b.dataset.card)");
    for(const id of candidates){await click(`[data-source="hand"][data-card="${id}"]`);if(await run("!!document.querySelector('.table-action-card')"))break;await run("document.querySelector('#viewer').close()");}
    assert.ok(await run("!!document.querySelector('.table-action-card')"));
    await run("window.testTask=document.querySelector('#table-task-body')");
    await click('[data-client-supply="growth"]');
    assert.ok(await run("window.testTask===document.querySelector('#table-task-body')"),'Opening supply preserves the live form');
    await click('.client-table-overlay [data-side="board"]');
    assert.ok(await run("window.testTask===document.querySelector('#table-task-body')"),'Closing supply preserves the live form');
    await shot('04-action');
    await click('[data-client-pick]');assert.ok(await run("document.body.classList.contains('client-picking')"));
    await click('[data-client-return]');assert.ok(await run("!document.body.classList.contains('client-picking')"));
    const beforePass=await run("JSON.parse(localStorage.getItem('world-order-table-m2-v2-session-v1')).state.players["+JSON.stringify(current)+"]");
    await click('.table-pass-card');
    const afterPass=await run("JSON.parse(localStorage.getItem('world-order-table-m2-v2-session-v1')).state.players["+JSON.stringify(current)+"]");
    assert.equal(afterPass.hand.length,beforePass.hand.length-1);assert.equal(afterPass.money,beforePass.money+10);assert.equal(afterPass.played.length,beforePass.played.length+1);
    await click('[data-client-supply="growth"]');await shot('05-growth');
    assert.equal(await run("document.querySelectorAll('.board-region').length"),7,'Board stays mounted behind catalogue');
    await click('[data-client-supply="growth"]');
    assert.equal(await run("!!document.querySelector('.client-table-overlay')"),false,'Same growth button closes catalogue');
    const eventId=await run("document.querySelector('[data-client-event-id]')?.dataset.clientEventId");
    if(eventId){await click('[data-client-event-id]');assert.ok(await run("!!document.querySelector('#viewer[open] .viewerimage')"));await run("document.querySelector('#viewer').close()");}
    main.setContentSize(1200,720);await new Promise(r=>setTimeout(r,2500));await shot('06-small-window');
    result.smallViewport=await run('({h:innerHeight,body:document.body.scrollHeight,w:innerWidth,scroll:document.body.scrollWidth})');
    assert.deepEqual(result.smallViewport,{h:720,body:720,w:1200,scroll:1200});
    result.referenceLayout=await run(`({players:document.querySelectorAll('.client-player').length,events:document.querySelectorAll('.client-event-section').length,allies:document.querySelectorAll('.client-owned-ally').length,tools:document.querySelectorAll('.client-dock-tools button').length,regions:Array.from(document.querySelectorAll('.board-region')).map(e=>e.dataset.boardRegion)})`);
    assert.equal(result.referenceLayout.players,4);assert.equal(result.referenceLayout.events,2);assert.equal(result.referenceLayout.tools,3);
    assert.deepEqual(result.referenceLayout.regions,['M','E','C','P','A','N','S']);
    main.setContentSize(1440,900);
    const before=await run("localStorage.getItem('world-order-table-m2-v2-session-v1')");
    await click('#client-menu');await click('[data-client-home]');await until("!!document.querySelector('[data-start]')");
    await click('[data-start="continue"]');await until("!!document.querySelector('.game-table')");
    assert.equal(await run("localStorage.getItem('world-order-table-m2-v2-session-v1')"),before);
    main.webContents.reload();await until("!!document.querySelector('.game-table')");
    assert.equal(await run("localStorage.getItem('world-order-table-m2-v2-session-v1')"),before);
    const fullBefore=main.isFullScreen();await run('window.worldOrderDesktop.fullscreen()');await new Promise(r=>setTimeout(r,500));assert.equal(main.isFullScreen(),!fullBefore);main.setFullScreen(false);
    result.servicePids=[...services.values()].map(s=>s.child.pid);
    result.errors=errors;result.passed=true;
  }catch(error){result.passed=false;result.error=error.stack;await shot('failure');}
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));
  app.quit();
};
