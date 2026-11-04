const api=window.worldOrderDesktop;
const status=document.querySelector('#status');
let busy=false;
api.info().then(info=>{if(!info.hasPlayed)document.querySelector('.primary>span').innerHTML='开始游戏<small>展开世界版图，准备第一场对局</small>';});
for(const button of document.querySelectorAll('[data-start]'))button.addEventListener('click',async()=>{
  if(busy)return;busy=true;
  for(const b of document.querySelectorAll('[data-start]'))b.disabled=true;
  status.textContent=button.dataset.start==='steam'?'正在连接 Steam，准备游戏大厅…':'正在恢复桌面，加载卡牌…';
  try{const result=await api.start(button.dataset.start);if(result&&!result.ok)status.textContent=result.error;}
  catch{status.textContent='启动失败，请退出并重新打开游戏。';}
  finally{busy=false;for(const b of document.querySelectorAll('[data-start]'))b.disabled=false;}
});
document.querySelector('#fullscreen').onclick=()=>api.fullscreen();
document.querySelector('#quit').onclick=()=>api.quit();
const help=document.querySelector('#help');
document.querySelector('#instructions').onclick=()=>help.showModal();
for(const close of help.querySelectorAll('button'))close.onclick=()=>help.close();
