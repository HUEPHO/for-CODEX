const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
module.exports=async({app,main,services})=>{
  const out=process.env.WORLD_ORDER_TEST_OUTPUT, stage=process.env.RECOVERY_STAGE;
  const result={stage,checks:[],passed:false};
  const run=code=>main.webContents.executeJavaScript(code,true);
  const key='world-order-table-m2-v2-session-v1';
  async function until(code){for(let i=0;i<150;i++){if(await run(code))return;await new Promise(r=>setTimeout(r,100));}throw Error('Timeout: '+code);}
  try{
    const info=await run('window.worldOrderDesktop.info()');
    assert.equal(info.version,'0.6.0');assert.equal(info.hasPlayed,true);
    result.checks.push('Packaged 0.6.0 starts with existing save and Continue enabled');
    await run("document.querySelector('[data-start=continue]').click()");
    await until("!!document.querySelector('.game-table')");
    const before=await run(`localStorage.getItem('${key}')`), saved=JSON.parse(before);
    assert.equal(Object.values(saved.state.players).reduce((n,p)=>n+p.hand.length,0),23);
    assert.equal(Object.values(saved.state.players).reduce((n,p)=>n+p.played.length,0),1);
    assert.equal(Object.values(saved.state.players).filter(p=>p.assetChoices).length,0);
    assert.equal(await run("!!document.querySelector('.hand')"),true);
    result.checks.push('Existing completed setup and played card restored');
    const expected=path.join(out,'expected-save.json');
    if(stage==='first')fs.writeFileSync(expected,before);
    else {assert.equal(before,fs.readFileSync(expected,'utf8'));result.checks.push('Entire persisted session identical after full app/service process restart');}
    await run("document.querySelector('#client-menu').click();document.querySelector('[data-client-home]').click();true");
    await until("!!document.querySelector('[data-start=continue]')");
    await run("document.querySelector('[data-start=continue]').click()");
    await until("!!document.querySelector('.game-table')");
    assert.equal(await run(`localStorage.getItem('${key}')`),before);
    main.webContents.reload();await until("!!document.querySelector('.game-table')");
    assert.equal(await run(`localStorage.getItem('${key}')`),before);
    result.checks.push('Return to menu, Continue and reload preserve the entire session');
    result.saveSha256=crypto.createHash('sha256').update(before).digest('hex');
    result.servicePids=[...services.values()].map(s=>s.child.pid);
    result.appPid=process.pid;result.passed=true;
  }catch(error){result.error=error.stack;}
  fs.writeFileSync(path.join(out,stage+'-result.json'),JSON.stringify(result,null,2));app.quit();
};
