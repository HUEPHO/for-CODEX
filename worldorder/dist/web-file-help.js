// ES module data loading and multiplayer need HTTP even when hosted locally.
if(location.protocol==='file:'){
 document.addEventListener('DOMContentLoaded',()=>{
  const root=document.querySelector('#app');
  root.innerHTML='<section class="room-entry"><h1>启动 World Order 网页版</h1><p>请返回网页包的根目录，双击「启动网页版.cmd」，再使用自动打开的浏览器页面。</p><p>其他系统：安装 Node.js 24 后，在网页包目录运行 <code>npm start</code>，打开终端显示的网址。</p><p>本网页需要通过 HTTP 加载牌图、规则模块和联机接口，不能直接双击 index.html 运行。</p></section>';
  root.setAttribute('aria-busy','false');
  document.querySelectorAll('.topactions button').forEach(button=>button.disabled=true);
 });
}
