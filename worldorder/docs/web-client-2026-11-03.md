# HTML 网页端 0.8 · 2026-11-03

用户提供 Azure World Order 网站，询问其联机技术，并明确先交付可运行 HTML 网页包。没有要求部署或修改该站。

## 参考站点

`https://worldorder-h2ejh2e0hucngza6.eastasia-01.azurewebsites.net/` 托管在 Azure App Service 域名下；首页响应标示 Express，公开 `/assets/index-yN4U1jSk.js` 包含 React、Socket.IO 客户端，并以 WebSocket 连接同源 `/realtime`，监听房间与对局事件；游戏命令另走 HTTP API。此信息来自公开资源的只读检查，未注册、登录或创建房间，未推测数据库。

## 本项目实现

- 新 `client-platform.js` 将共享网页布局与原生桌面接口分开。普通浏览器直接使用 0.7 滚动桌面、牌背、融合、直接盟国减费和六列贸易；原桌面桥接仍只负责原生菜单/全屏/退出。
- 浏览器菜单使用标准 Fullscreen API，并提供房间、说明和新局入口；不调用 Electron。直接打开 file:// 时给出 HTTP 启动说明。
- 新 `start-web.mjs` 复用原 roomApi 与 SQLite，保留原规则、席位、版本冲突和隐私校验。使用签名 HttpOnly 访客 Cookie，标签页令牌再绑定该访客；HTML 入口先初始化 Cookie，避免首轮并发 API 请求漂移身份。默认本机，显式 HOST + PUBLIC_ORIGIN 才接受共享访问。
- `launch-web.mjs` / `package-web.mjs` 提供 Windows 一键启动、独立 HTML 素材与无 npm 依赖的 Node 服务。默认数据 `.web/`，可配置独立目录。未包含任何用户数据、密钥或测试房间。未更换既有 Sites 或 Steam 服务。

## 已验证

- 普通 Chromium 页面（无 preload、无 Node、无 worldOrderDesktop）：1440×900 / 1200×720，滚动桌面、固定栏、牌背、六列贸易、菜单/说明/取消、页面重载存档通过。
- 四个独立浏览器身份通过真实页面创建/入座/完成开局，真实盖牌行动加10资金并同步四方；HTTP 返回遮蔽他方手牌、目标和私有选牌，刷新恢复中国席位通过。
- 服务器专项覆盖首页 Cookie 初始化与并发首请求、身份伪造、同源/请求大小/静态路径限制、SQLite 与身份密钥重启，以及同浏览器接管席位。
- 成品包自带 Node 启动、页面/模块/牌图加载、实际房间创建/读取通过；687 个打包文件 SHA-256 校验通过。
- 沿用已完成游戏规则验收，未重跑整套 UI/贸易/权限旧测试。只验证本次平台接入及必要联机链路。未进行跨公网多设备试玩。

## 交付

目录：`C:/Users/fhs/Documents/Codex/2026-09-26/referenced-chatgpt-conversation-this-is-an/outputs/WorldOrder-Web-0.8`。
同目录的 ZIP、使用说明、预览和验收 JSON 为本次交付。Windows 解压后双击 `启动网页版.cmd`；其他系统安装 Node.js 24 后 `npm start`。跨互联网联机需以后另行部署 HTTPS 服务，本轮没有发布公网网址。桌面 0.7 成品与原存档保持原样。
