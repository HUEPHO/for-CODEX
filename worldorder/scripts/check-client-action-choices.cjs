// Execute with Electron, not Node. This isolated, hidden renderer checks the
// real DOM adapter without starting a server or opening any saved game profile.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const output=process.env.WORLD_ORDER_ACTION_UI_TEST_OUTPUT||fs.mkdtempSync(path.join(os.tmpdir(),'world-order-action-ui-'));
fs.mkdirSync(output,{recursive:true});app.setPath('userData',path.join(output,'profile'));
app.disableHardwareAcceleration();
const page='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Action UI adapter check</title><body><div id="table-task-body"></div></body></html>';
app.whenReady().then(async()=>{
 const window=new BrowserWindow({show:false,width:1000,height:700,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
 try{
  await window.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(page));
  const moduleUrl='data:text/javascript;base64,'+fs.readFileSync(path.resolve(__dirname,'../dist/client-action-choices.js')).toString('base64');
  const result=await window.webContents.executeJavaScript(`(async()=>{
   const {syncClientActionChoices:sync,handleClientActionChoice:click,selectClientCover:cover}=await import(${JSON.stringify(moduleUrl)});
   const root=document.querySelector('#table-task-body'),checks=[];
   const check=(value,message)=>{if(!value)throw Error(message);checks.push(message);};
   const option=value=>root.querySelector('[data-client-action-option="'+value+'"]');
   const event=button=>({target:button,preventDefault(){}});
   root.innerHTML='<label>选择效果<select id="basic-domestic"><option value="produce">生产</option><option value="growth">发展</option></select></label>';
   let changes=0;root.addEventListener('change',()=>changes++);
   sync(root);sync(root);
   check(root.querySelectorAll('.client-action-options').length===1,'Repeated synchronization is idempotent');
   check(changes===0,'Synchronizing choices emits no change');
   check(root.querySelector('#basic-domestic').value==='produce','Synchronizing preserves original default');
   const firstButton=option('produce');firstButton.focus();sync(root);
   check(document.activeElement===firstButton,'Unchanged synchronization preserves keyboard focus');
   check(click(event(option('growth')))&&root.querySelector('#basic-domestic').value==='growth'&&changes===1,'Action buttons change the real select and emit one bubbling change');
   check(option('growth').getAttribute('aria-pressed')==='true','Selected button follows source value');
   root.querySelector('#basic-domestic').disabled=true;sync(root);click(event(option('produce')));
   check(option('produce').disabled&&changes===1,'Disabled source blocks its buttons');
   root.querySelector('#basic-domestic').disabled=false;root.querySelector('option[value="produce"]').disabled=true;sync(root);click(event(option('produce')));
   check(root.querySelector('#basic-domestic').value==='growth'&&changes===1,'Disabled options cannot be chosen');
   const stale=option('growth');root.innerHTML='<label>第1项<select data-sequence-choice="0"><option value="trade">贸易</option><option value="engage">介入</option></select></label><label>第2项<select data-sequence-choice="1"><option value="trade">贸易</option><option value="engage" selected>介入</option></select></label>';
   sync(root);click(event(stale));check(changes===1,'Detached stale buttons cannot change a new form');
   const rows=root.querySelectorAll('[data-sequence-choice]');click(event(root.querySelectorAll('[data-client-action-option="engage"]')[0]));
   check(rows[0].value==='engage'&&rows[1].value==='engage','The adapter never invents ordering or duplicate-choice rules');
   check(root.querySelectorAll('.client-action-options')[1].getAttribute('aria-label')==='第2项行动','Ordered choices retain their slot labels');
   root.innerHTML='<label>分支<select id="basic-branch"><option value="relations">关系</option><option value="engage">介入</option></select></label>';
   root.querySelector('#basic-branch').addEventListener('change',()=>{root.innerHTML='<label>选择效果<select id="basic-domestic"><option value="produce">生产</option><option value="growth">发展</option></select></label>';});
   sync(root);click(event(option('engage')));
   check(root.querySelector('.client-action-options')&&root.querySelector('#basic-domestic'),'Branch replacement refreshes the new live form');
   root.innerHTML='<label>盖牌<select id="sequence-cover"><option value="a">第一张</option><option value="b">第二张</option><option value="c" disabled>禁选</option><option value="d" hidden>隐藏</option><optgroup disabled><option value="e">禁用分组</option></optgroup></select></label>';
   sync(root);const beforeCover=changes;
   check(!cover('other',root)&&!cover('c',root)&&!cover('d',root)&&!cover('e',root)&&changes===beforeCover,'Cover selection rejects cards outside enabled visible options');
   check(cover('b',root)&&root.querySelector('#sequence-cover').value==='b'&&changes===beforeCover+1,'Hand selection only sets the original cover field');
   check(root.querySelector('.client-cover-selected b').textContent==='第二张','Cover hint retains the actual selected card name');
   root.querySelector('#sequence-cover').disabled=true;check(!cover('a',root),'Disabled cover cannot be changed');
   root.querySelector('#sequence-cover').disabled=false;root.querySelector('label').hidden=true;check(!cover('a',root),'Hidden cover cannot be changed');
   root.innerHTML='<label>盖牌<select id="extra-asset-cover"><option value="a">第一张</option><option value="b">第二张</option></select></label>';
   sync(root);check(cover('b',root)&&root.querySelector('#extra-asset-cover').value==='b','Legacy extra-asset cover uses the same safe adapter');
   root.innerHTML='<label>盖牌<select id="sequence-cover"></select></label>';sync(root);
   check(!cover('a',root)&&root.querySelector('.client-cover-selected b').textContent==='尚未选择','No cover option is invented for an empty field');
   return {passed:true,checks};
  })()`);
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));
  console.log('Client action choice DOM checks passed: '+result.checks.length);window.destroy();app.exit(0);
 }catch(error){fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:false,error:error.stack},null,2));console.error(error);window.destroy();app.exit(1);}
});
