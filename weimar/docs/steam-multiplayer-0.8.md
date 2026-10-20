# Steam联机 · 0.8

本批接入Steam Lobby建房／加入／邀请、四阵营席位与准备、房主执行规则、每名玩家的私有手牌、断线暂停与重新加入，以及房主自动／导出存档恢复。机器人按用户要求暂缓，界面保留现有工作台样式。

**验证状态：444项自动测试通过，模拟Steam四客户端及浏览器联机界面流程通过。当前机器未找到Steam客户端，真实Steam双机连通、邀请覆盖层及跨网络传输仍待验收。**

## 启动

两台Windows x64电脑分别安装并登录Steam，使用不同Steam账号，最好先互加好友。安装Node.js 24+与pnpm 11.25.0，拉取同一版本，在`weimar`目录执行：

```powershell
pnpm install --frozen-lockfile
pnpm desktop
```

首次安装需要下载Electron运行时。`pnpm dev`仍是浏览器热座；普通浏览器无法调用本项目的原生Steam SDK。

AppID是Steam给游戏分配的数字编号。目前默认使用Valve示例游戏Spacewar的**480**进行开发测试，Steam可能显示Spacewar。它不是本项目正式获得的AppID。以后取得项目自己的编号时，启动前设置：

```powershell
$env:WEIMAR_STEAM_APP_ID = '你的正式数字AppID'
pnpm desktop
```

打包配置中的`games.weimar.digital`是Electron应用标识，与Steam数字AppID不同。

可单独检查SDK初始化：

```powershell
pnpm steam:check
```

该检查只初始化SDK，不建房或发消息；结果写入`artifacts/steam-sdk-check.json`。本机实测Electron 44.9.1加载正常，但SDK返回`Could not determine Steam client install directory.`，退出码2。安装并登录Steam后需重新执行。

## 建房与对局

1. 房主在顶部Steam面板选择四个历史剧本之一，点击创建房间。当前默认好友可见、最多4个Steam账号。
2. 使用“Steam邀请”，或者把数字房间ID告诉好友，在另一台电脑输入并加入。公开房间搜索只显示同协议的可发现房间，好友房间通常用邀请或ID加入。
3. 每个玩家认领阵营后准备，四个阵营都有人且准备后由房主开始。一人可以控制多个阵营，方便两人测试或两人对局。
4. 只有当前决定者能操作；事件要求另一个阵营选择时，权限随决定者转移。自己控制的阵营手牌可见，对手只有张数。
5. 联机时不提供单人撤销／重做、本地重开或热座存档导入。规则命令由房主执行后统一发送新局面。

## 掉线与恢复

开局前离开释放席位；开局后保留原SteamID的席位，玩家缺席会暂停。原玩家重新加入同一房间后恢复。客户端超过12秒未收到房主状态也会暂停界面，并继续尝试同步。

房主退出后不自动转交规则状态；Steam自身即使转移Lobby所有者，本项目也会停止该房间。原房主重开程序，选择“恢复房主存档”重建新房间，原玩家用新ID加入。房主也可导出完整联机存档，在另一台电脑登录**同一Steam账号**后选择导入建房。浏览器热座存档和联机存档不能互换。

房主每次接受操作后自动保存到Electron用户数据目录的`steam-host-save.json`，Windows通常为`%APPDATA%\weimar-digital\steam-host-save.json`。文件包含完整规则存档和秘密信息，不随Git上传。写入失败会显示错误，已生效命令不会因此倒退。

## 打包

```powershell
pnpm desktop:pack
```

输出为`release/win-unpacked/WEIMAR.exe`。分发时应复制整个`win-unpacked`目录，保留`resources`及`steam_api64.dll`，不能只复制exe。当前为未签名的Windows开发包；构建产物不提交Git，可在家里按同一命令生成。

## 已验证与待验收

- 421项既有规则测试继续通过。新增11项联机权限／投影测试和12项模拟SDK传输测试，共444项。
- 模拟四客户端完整创建、入房、准备、开局并执行11条命令走完半年；验证各客户端收到的手牌隔离、拒绝伪造／过期命令、跨阵营选择、断线与恢复、拒绝房主迁移、存档恢复和发送／写盘失败。
- 检查151个事件实验开局的投影大小；发送包上限900KB。公开日志目前只有状态摘要，避免原引擎日志泄露抽牌等秘密。
- 浏览器专用样例`tests/fixtures/steam-ui.html`验证准备、开局、视角切换、自己的手牌、等待别人、实际行动以及断线暂停／恢复。样例明确标注模拟Steam，未编入生产包。截图：`artifacts/verification-0.8-steam-ui.png`。
- 浏览器与桌面类型检查、Vite生产构建和Windows x64桌面打包通过。已核对包内主程序、预加载脚本、原生模块和DLL齐全，测试页面未进入生产包。生产页面刷新后恢复0.7黑日热座存档且无控制台报错。SDK初始化的当前阻断如上，不等同于网络故障。

真实双机验收顺序：两账号用同一版本建房加入 → 四席位准备 → 开始并轮流操作 → 发起一个跨阵营事件选择 → 断开一个玩家后重入 → 房主关闭后从自动存档恢复 → 验证导出存档在原房主另一台电脑恢复。再分别检验Steam好友邀请、程序关闭时的邀请启动、跨不同家庭网络连接。暂未完成这些真实环境检查。

## 技术边界与来源

房主主进程持有完整状态，所以参与者仍需信任房主；客户端只收到可见状态，不收到秘密种子或命令历史。当前没有专用服务器、自动房主迁移、观战或机器人。原生SDK适配按Windows x64打包，其他平台未验证。

steamworks.js 0.4暴露的是旧版`ISteamNetworking`可靠P2P，并非新的NetworkingMessages／Sockets接口。Valve已将旧接口标为弃用，后续传输升级应独立替换适配层。

- [Valve：Lobby与邀请流程](https://partner.steamgames.com/doc/features/multiplayer/matchmaking)
- [Valve：Spacewar示例与AppID 480](https://partner.steamgames.com/doc/sdk/api/example)
- [Valve：旧版ISteamNetworking API](https://partner.steamgames.com/doc/api/ISteamNetworking)
- [steamworks.js原生绑定与Electron说明](https://github.com/ceifa/steamworks.js)
- [Electron安全配置](https://www.electronjs.org/docs/latest/tutorial/security)
