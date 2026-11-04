# Steam 四人联机实现 · 2026-09-17

Steam Lobby / P2P 已接入真实游戏引擎与界面，并提供 Windows x64 便携客户端。当前电脑无法登录 Steam：原生模块加载、四人模拟通道、浏览器联动均已验证，真实账号建房及跨网络联机尚未验收。本文覆盖此前只审查参考项目的历史进度。

## 使用

四台 Windows x64 电脑分别登录不同 Steam 账号，与房主互加好友。完整解压便携包后双击 `Start-Steam.bat`，房主创建房间并分享数字房间号，其余三人输入房间号并选择势力。四席在线后房主开始选牌。每个账号只控制自己的席位。

便携包包含 Node 24.19.0 和 steamworks.js 0.4.0，不需要安装 Node、npm 或公网服务器。浏览器仅连接本机回环服务，邀请时不要分享本机 URL 或令牌。沿用参考试验的 AppID 480（Spacewar），不是已上架的独立 Steam 应用。

目标系统为 Windows 10/11 x64。原生模块导入表依赖 `VCRUNTIME140.dll`，首次使用的电脑可能需要安装 [微软 Visual C++ x64 运行库](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist)。包内 README 附官方安装入口；程序不自动安装系统组件。

开发入口：`node scripts/start-steam.mjs`；依赖单独位于 `steam/`，按其锁文件安装。`node scripts/package-steam.mjs` 在 `.local/releases/` 新建目录，不覆盖既有包，内附文件 SHA256 清单及第三方许可。普通四标签页入口仍为 `node scripts/dev-local.mjs`。

## 边界与模块

| 文件 | 职责 |
| --- | --- |
| `server/steam-native.js` | FriendsOnly 四人 Lobby、Steam ID、成员验证、Reliable P2P、超时与原房主失联检测 |
| `server/steam-session.js` | 房主权威队列、固定账号身份、协议/房间/会话校验、回执重试、心跳与逐席快照 |
| `server/steam-http.js` | 仅监听 127.0.0.1；随机启动令牌、Host/Origin/请求体校验、静态界面与本机 API |
| `server/steam-store.js` | 独立目录原子写入短期自动快照，30分钟过期 |
| `dist/steam-client.js` / `steam-ui.js` | 浏览器桥接、建房/数字房间号加入、成员与断线状态 |
| `scripts/start-steam.mjs` / `Start-Steam.bat` | 初始化原生组件、启动回环服务及打开浏览器 |

所有游戏命令复用 `server/rooms.js` 的 `newRoom/changeRoom/roomView`。房主持有完整状态，其他客户端只收到自己席位的脱敏视图；身份来自实际 Steam 发送者，客户端不能指定他方身份。保留版本冲突、幂等命令、行动权限、私密竞价、抽牌及撤回屏障。传输层限制消息大小及待处理数；同一命令重发使用同一 ID。

刷新页面恢复原席位；客机退出或掉线后，可以同一账号重入原房间。短暂断线暂停操作；原房主退出 Lobby/程序或 Steam 转移房主后，本局停止，不支持房主迁移。自动快照不是跨重启继续旧 Lobby 的承诺，仅可恢复匹配原房间、原房主和会话的短期状态。

数据位于 `.local/steam/<SteamID>/`，未触碰原本机房间数据库。便携包只复制界面素材、所需服务模块和运行时，不包含房间数据库、访问令牌、测试局或个人数据。

## 已完成验证

- `check-steam-native.mjs`：原生 API 替身覆盖 11 类检查，包括成员/房主变更、异步超时、清理及大包边界。
- `check-steam-session.mjs`：真实游戏引擎与四个模拟 Steam 身份，覆盖入座、开局、行动、撤回、私密竞价、逐席脱敏、丢回执重试、陈旧/伪造包、心跳恢复、退出重入、原房主退出和损坏快照。
- `check-steam-client.mjs`：桥接、同 ID 重试、刷新/退出竞态、断线操作保护与界面入口。
- `check-steam-http.mjs`：回环接口鉴权、跨源/Host 拒绝、无鉴权错误不泄露视图、请求限制、组件失败提示、快照原子写入和过期。
- 原有房间、开局库存、架构检查通过。Windows x64 Node 24.19.0 实际加载官方 registry 下载的 steamworks.js 原生模块成功。
- 使用四个真实会话对象和模拟 Steam 通道进行浏览器操作：建房、数字号加入、四席开局、美中分别选牌、阶段撤回、行动撤回、另一页面同步、刷新恢复、客机退出重入、房主退出后禁用操作。浏览器发现并修复了原生 fetch 接收者绑定问题。
- 实际启动器在本机缺少可用 Steam 时显示明确初始化失败，建房/加入禁用，不降级成伪联机桌面。
- 已生成 `WorldOrder-Steam-2026-09-17.zip`（58,929,921字节，570项）。使用包内 Node 启动及加载包内原生模块通过；分发清单检查无本地数据库、自动快照或环境文件。压缩包未替代真实 Steam 登录验收。

尚需在可登录 Steam 的电脑上验收：真实 Lobby 创建/加入、四账号跨网络 P2P、Steam 服务中断恢复、长时间整局。以上模拟及浏览器检查不能代替这些实测。
