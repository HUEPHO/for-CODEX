const {app,BrowserWindow,ipcMain,Menu,dialog,session,screen} = require('electron');
const {spawn} = require('node:child_process');
const {readFileSync,writeFileSync,mkdirSync} = require('node:fs');
const {join,resolve} = require('node:path');
const {pathToFileURL} = require('node:url');
const {createInterface} = require('node:readline');

const root=resolve(__dirname,'..');
const testDirectory=process.env.WORLD_ORDER_TEST_DATA;
if(testDirectory)app.setPath('userData',resolve(testDirectory));
else app.setPath('userData',join(app.getPath('appData'),'World Order'));
app.setName('World Order');
const settingsFile=join(app.getPath('userData'),'desktop.json');
let settings={fullscreen:false,lastMode:'local',width:1440,height:900};
try{settings={...settings,...JSON.parse(readFileSync(settingsFile,'utf8'))};}catch{}
let main,quitting=false,services=new Map(),starting=new Map();
const gameWindows=new Set();
const menuUrl=pathToFileURL(join(__dirname,'menu.html')).href;
function saveSettings(){try{mkdirSync(app.getPath('userData'),{recursive:true});writeFileSync(settingsFile,JSON.stringify(settings,null,2));}catch{}}
function allowed(url){
  if(url===menuUrl)return true;
  try{return [...services.values()].some(s=>new URL(url).origin===new URL(s.url).origin);}catch{return false;}
}
function senderWindow(event){
  if(event.senderFrame!==event.sender.mainFrame||!allowed(event.senderFrame.url))throw Error('Unknown game window');
  return BrowserWindow.fromWebContents(event.sender);
}
function createWindow({child=false}={}){
  const available=screen.getPrimaryDisplay().workAreaSize;
  const w=new BrowserWindow({width:Math.min(settings.width,available.width),height:Math.min(settings.height,available.height),minWidth:Math.min(1200,available.width),minHeight:Math.min(720,available.height),
    title:'World Order',backgroundColor:'#080f16',show:false,autoHideMenuBar:true,
    fullscreen:!child&&settings.fullscreen,icon:join(__dirname,'icon.png'),
    webPreferences:{preload:join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,spellcheck:false}});
  gameWindows.add(w);
  w.once('ready-to-show',()=>{w.show();});
  w.on('closed',()=>gameWindows.delete(w));
  w.on('resize',()=>{if(w===main&&!w.isFullScreen()&&!w.isMaximized()){[settings.width,settings.height]=w.getSize();saveSettings();}});
  const keepFullscreen=()=>{if(w===main){settings.fullscreen=w.isFullScreen();saveSettings();}};
  w.on('enter-full-screen',keepFullscreen);w.on('leave-full-screen',keepFullscreen);
  w.webContents.on('before-input-event',(event,input)=>{
    if(input.type!=='keyDown')return;
    if(input.key==='F11'||(input.alt&&input.key==='Enter')){event.preventDefault();w.setFullScreen(!w.isFullScreen());}
  });
  w.webContents.on('will-navigate',(event,url)=>{if(!allowed(url))event.preventDefault();});
  w.webContents.on('will-redirect',(event,url)=>{if(!allowed(url))event.preventDefault();});
  w.webContents.setWindowOpenHandler(({url})=>{
    if(allowed(url)&&url!==menuUrl){const seat=createWindow({child:true});seat.loadURL(url);}
    return {action:'deny'};
  });
  w.webContents.on('will-attach-webview',event=>event.preventDefault());
  w.webContents.on('did-navigate',(_event,url)=>{
    if(w!==main||url===menuUrl)return;
    for(const [mode,s]of services)if(new URL(url).origin===new URL(s.url).origin){settings.lastMode=mode;settings.hasPlayed=true;saveSettings();}
  });
  w.webContents.on('render-process-gone',()=>{if(!quitting){dialog.showErrorBox('游戏画面已停止','进度已自动保存。请重新打开 World Order 继续。');}});
  return w;
}
async function getService(mode){
  if(services.has(mode))return services.get(mode);
  if(starting.has(mode))return starting.get(mode);
  const pending=new Promise((resolveReady,reject)=>{
    const port=Number(process.env[mode==='local'?'WORLD_ORDER_CLIENT_PORT':'WORLD_ORDER_CLIENT_STEAM_PORT']||(mode==='local'?18787:18788));
    const child=spawn(join(root,'runtime','node.exe'),[join(__dirname,'service.mjs'),mode,app.getPath('userData'),String(port)],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});
    const service={child,url:'',mode};let ready=false,settled=false;
    const fail=message=>{if(!settled){settled=true;reject(Error(message));}child.stdin.end();};
    const timer=setTimeout(()=>fail('启动超时，请关闭游戏后重试。'),25000);
    child.stderr.resume(); // No persistent logs containing room tokens or private state.
    const lines=createInterface({input:child.stdout});
    lines.on('line',line=>{
      try{const message=JSON.parse(line);if(message.error){clearTimeout(timer);fail(message.error);return;}
        if(message.ready&&!settled){clearTimeout(timer);ready=true;settled=true;service.url=message.url;services.set(mode,service);resolveReady(service);}
      }catch{}
    });
    child.on('error',error=>{clearTimeout(timer);fail(error.message);});
    child.on('exit',()=>{
      clearTimeout(timer);services.delete(mode);
      if(!ready)fail('游戏服务未能启动，请检查 runtime 文件夹是否完整。');
      else if(!quitting){dialog.showErrorBox('游戏连接已中断','后台服务已停止，已保存的进度不会删除。返回主菜单重新进入即可。');if(main&&!main.isDestroyed())main.loadFile(join(__dirname,'menu.html'));}
    });
  });
  starting.set(mode,pending);
  try{return await pending;}finally{starting.delete(mode);}
}
if(!app.requestSingleInstanceLock())app.quit();
else{
  app.on('second-instance',()=>{if(main){if(main.isMinimized())main.restore();main.show();main.focus();}});
  app.whenReady().then(async()=>{
    Menu.setApplicationMenu(null);
    session.defaultSession.setPermissionRequestHandler((webContents,permission,callback)=>callback(permission==='clipboard-sanitized-write'&&allowed(webContents.getURL())));
    session.defaultSession.setPermissionCheckHandler((webContents,permission)=>permission==='clipboard-sanitized-write'&&!!webContents&&allowed(webContents.getURL()));
    ipcMain.handle('game:info',event=>{const w=senderWindow(event);return {version:app.getVersion(),fullscreen:w.isFullScreen(),lastMode:settings.lastMode,hasPlayed:!!settings.hasPlayed};});
    ipcMain.handle('game:start',async(event,mode)=>{
      const w=senderWindow(event);if(!['local','steam','continue'].includes(mode))throw Error('Unknown game mode');
      const resume=mode==='continue';if(resume)mode=settings.lastMode==='steam'?'steam':'local';
      try{const service=await getService(mode);await w.loadURL(resume&&service.resumeUrl?service.resumeUrl:service.url);return {ok:true};}catch(error){return {ok:false,error:error.message};}
    });
    ipcMain.handle('game:home',async event=>{const w=senderWindow(event),url=w.webContents.getURL();if(w===main)for(const s of services.values())if(new URL(url).origin===new URL(s.url).origin)s.resumeUrl=url;await w.loadFile(join(__dirname,'menu.html'));return true;});
    ipcMain.handle('game:fullscreen',event=>{const w=senderWindow(event),next=!w.isFullScreen();w.setFullScreen(next);return next;});
    ipcMain.handle('game:quit',event=>{senderWindow(event);app.quit();});
    main=createWindow();main.on('close',event=>{if(!quitting){event.preventDefault();app.quit();}});await main.loadFile(join(__dirname,'menu.html'));
    // Development-only integration runner; never included in release packages.
    if(process.env.WORLD_ORDER_CLIENT_TEST)require(resolve(process.env.WORLD_ORDER_CLIENT_TEST))({app,main,services,gameWindows});
  }).catch(error=>{dialog.showErrorBox('World Order 无法启动',error.message);app.quit();});
  app.on('before-quit',event=>{
    if(quitting)return;event.preventDefault();quitting=true;saveSettings();session.defaultSession.flushStorageData();
    for(const {child} of services.values())child.stdin.end();
    const children=[...services.values()].map(s=>s.child);
    Promise.race([Promise.all(children.map(c=>new Promise(r=>c.exitCode!==null?r():c.once('exit',r)))),new Promise(r=>setTimeout(r,4500))]).finally(()=>{for(const child of children)if(child.exitCode===null)child.kill();app.quit();});
  });
  app.on('window-all-closed',()=>app.quit());
}
