// Run with Electron. Hidden, isolated DOM checks for stale/disabled source
// controls; the real cost and settlement path is covered by the desktop test.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const output=process.env.WORLD_ORDER_ALLY_UI_TEST_OUTPUT||fs.mkdtempSync(path.join(os.tmpdir(),'world-order-ally-ui-'));
fs.mkdirSync(output,{recursive:true});app.setPath('userData',path.join(output,'profile'));app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
 const window=new BrowserWindow({show:false,width:1000,height:700,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
 try{
  await window.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><body><main id="fixture"></main></body></html>'));
  const moduleUrl='data:text/javascript;base64,'+fs.readFileSync(path.resolve(__dirname,'../dist/client-ally-selection.js')).toString('base64');
  const result=await window.webContents.executeJavaScript(`(async()=>{
   const {syncClientAllySelection:sync,handleClientAllySelection:click}=await import(${JSON.stringify(moduleUrl)}),root=document.querySelector('#fixture'),checks=[];
   const check=(value,message)=>{if(!value)throw Error(message);checks.push(message);};
   const event=button=>({target:button,preventDefault(){}});
   function reset(){root.innerHTML='<div id="table-task-body"><section id="basic-form"><fieldset id="basic-discounts"><legend>盟国减费</legend><label><input type="checkbox" data-basic-exhaust="a">甲国</label><label><input type="checkbox" data-basic-exhaust="b">乙国</label><label><input type="checkbox" data-basic-exhaust="missing">缺少牌面的旧数据</label></fieldset><button id="commit-basic" disabled>确认</button></section></div><aside class="client-owned-cards"><div class="client-owned-ally"><button data-card="a" data-source="allies" aria-label="查看甲国"><img alt="甲国"></button></div><div class="client-owned-ally"><button data-card="b" data-source="allies">乙国</button></div><div class="client-owned-ally"><button data-card="other" data-source="allies">其他地区</button></div></aside>';}
   reset();let task=root.querySelector('#table-task-body'),changes=0;root.addEventListener('change',()=>changes++);
   const field=id=>root.querySelector('[data-basic-exhaust="'+id+'"]'),button=id=>root.querySelector('[data-card="'+id+'"]');
   sync(task,root);sync(task,root);
   check(changes===0&&!field('a').checked,'Synchronization never selects or emits change');
   check(root.querySelectorAll('.client-ally-discount-hint').length===1&&root.querySelectorAll('.client-ally-discount-mark').length===2,'Repeated synchronization is idempotent');
   check(field('a').closest('label').classList.contains('client-ally-discount-adapted')&&!field('missing').closest('label').classList.contains('client-ally-discount-adapted'),'Only sources with a real visible ally are adapted; missing cards retain the form fallback');
   check(click(event(button('a')),task,root)&&field('a').checked&&changes===1,'Card click selects the real checkbox and emits exactly one bubbling change despite disabled commit');
   check(button('a').getAttribute('aria-pressed')==='true'&&root.querySelector('.client-ally-discount-hint').textContent.includes('甲国'),'Selected card and compact hint follow the original checkbox');
   click(event(button('a')),task,root);check(!field('a').checked&&changes===2,'Second click deselects the checkbox');
   field('a').disabled=true;sync(task,root);click(event(button('a')),task,root);check(!field('a').checked&&changes===2,'Disabled source rejects card selection');
   field('a').disabled=false;root.querySelector('#basic-discounts').disabled=true;sync(task,root);click(event(button('a')),task,root);check(!field('a').checked&&changes===2,'Inherited fieldset disabling also rejects selection');
   root.querySelector('#basic-discounts').disabled=false;button('a').disabled=true;click(event(button('a')),task,root);check(!field('a').checked&&changes===2,'Disabled visible card cannot select an enabled source');button('a').disabled=false;
   check(!click(event(button('other')),task,root)&&changes===2,'A card outside original options cannot invent a discount');
   field('a').closest('label').hidden=true;sync(task,root);check(!click(event(button('a')),task,root)&&changes===2,'Hidden original options are not offered by the card adapter');field('a').closest('label').hidden=false;
   root.querySelector('#basic-form').inert=true;sync(task,root);check(!click(event(button('a')),task,root)&&changes===2,'Inert pending forms never acquire a selection');root.querySelector('#basic-form').inert=false;
   sync(task,root);const stale=button('a');reset();task=root.querySelector('#table-task-body');sync(task,root);click(event(stale),task,root);check(!field('a').checked&&changes===2,'Detached buttons cannot change the replacement form');
   root.querySelector('#basic-discounts').remove();sync(task,root);check(button('a').getAttribute('aria-label')==='查看甲国'&&!button('a').hasAttribute('aria-pressed')&&!button('a').querySelector('.client-ally-discount-mark'),'Removing the action restores the original card accessibility and appearance');
   reset();task=root.querySelector('#table-task-body');sync(task,root);field('a').checked=true;sync(task,root);check(button('a').getAttribute('aria-pressed')==='true'&&changes===2,'Externally updated source selection is reflected without a new event');
   root.querySelector('#basic-form').addEventListener('change',()=>{root.querySelector('#basic-discounts').innerHTML='<legend>新地区</legend><label><input type="checkbox" data-basic-exhaust="b">乙国</label>';},{once:true});
   click(event(button('a')),task,root);check(!button('a').hasAttribute('data-client-ally-discount')&&button('b').hasAttribute('data-client-ally-discount')&&changes===3,'A synchronous form replacement refreshes only the new original options');
   return {passed:true,checks};
  })()`);
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log('Client ally selection DOM checks passed: '+result.checks.length);window.destroy();app.exit(0);
 }catch(error){fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:false,error:error.stack},null,2));console.error(error);window.destroy();app.exit(1);}
});
