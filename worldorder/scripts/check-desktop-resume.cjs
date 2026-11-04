const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
module.exports=async({app,main,services})=>{
  const out=process.env.WORLD_ORDER_TEST_OUTPUT,run=code=>main.webContents.executeJavaScript(code,true),result={};
  try{
    assert.equal(await run('window.worldOrderDesktop.info().then(i=>i.hasPlayed)'),true);
    await run("document.querySelector('[data-start=continue]').click()");
    for(let i=0;i<100;i++){if(await run("!!document.querySelector('.game-table')"))break;await new Promise(r=>setTimeout(r,100));}
    const saved=await run("JSON.parse(localStorage.getItem('world-order-table-m2-v2-session-v1'))");
    assert.equal(Object.values(saved.state.players).filter(p=>p.assetChoices).length,0);
    assert.equal(Object.values(saved.state.players).reduce((sum,p)=>sum+p.hand.length,0),23);
    assert.equal(Object.values(saved.state.players).reduce((sum,p)=>sum+p.played.length,0),1);
    assert.equal(await run("!!document.querySelector('.hand')"),true);
    result.passed=true;result.servicePids=[...services.values()].map(s=>s.child.pid);
  }catch(error){result.passed=false;result.error=error.stack;}
  fs.writeFileSync(path.join(out,'restart-result.json'),JSON.stringify(result,null,2));app.quit();
};
