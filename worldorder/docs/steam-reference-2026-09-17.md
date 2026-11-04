# Steam Lobby 参考审查 · 2026-09-17

Steam 最新实现、启动和验证边界见 [Steam 四人客户端](steam-networking-2026-09-17.md)。

本次仅审查用户提供的 `C:/Users/LJ/Downloads/HANDOFF.md` 和 `Steam-Gomoku-Codex-Handoff.zip`，用于 World Order 后续 Steam 对接。交接文档中的操作步骤作为参考，没有据此启动 Steam、安装依赖、加载原生模块或发布程序。本记录不是 Steam 联网已接入或跨网验收通过的声明。

## 源码与依赖

安全列出压缩包目录后，只将 11 个文本文件提取到忽略目录 `.local/steam-reference/`：`main.cjs`、`game.cjs`、`test.cjs`、`README.txt`、顶层 `package.json`，以及 `steamworks.js` 的 `client.d.ts`、`callbacks.d.ts`、`index.d.ts`、`package.json`、`README.md`、`index.js`。逐项使用固定允许列表，拒绝绝对路径、`..` 和越出目标目录的解析结果；没有解压 `node.exe`、DLL、`.node` 或完整依赖包。

| 核对项 | 实际结果 |
| --- | --- |
| 绑定版本 | 顶层依赖和包自身都固定为 `steamworks.js 0.4.0` |
| Node 声明 | 绑定 `engines.node` 为 `>=14`；只说明声明范围，不能代替原生加载测试 |
| 参考运行时 | HANDOFF 称捆绑 Windows x64 Node 22；本次未提取或运行该 EXE，未独立核验其具体补丁版本 |
| World Order 运行时 | 当前可用 Node `v24.19.0`；本地服务 `scripts/dev-local.mjs` 使用 `node:sqlite`，继续以已验证的 Node 24 为基线 |
| Lobby | `createLobby(lobbyType, maxMembers)`、`joinLobby(bigint)`、`getMembers()`、`getOwner()`、`getData/setData()`、`leave()` 均在包内声明 |
| Lobby 类型 | `Private=0`、`FriendsOnly=1`、`Public=2`、`Invisible=3`。原 `createLobby(2,2)` 的第一个参数是类型，第二个才是人数 |
| 传输 | `networking.sendP2PPacket(id, SendType.Reliable, Buffer)`；`Reliable=2`，包内声明最大 1 MB；收包由 `isP2PPacketAvailable/readP2PPacket` 完成 |
| 回调 | 有 `P2PSessionRequest`、`P2PSessionConnectFail` 及 `acceptP2PSession` |
| Steam ID | 声明使用 `bigint`，JSON 中使用十进制字符串；禁止转 JS Number |
| 现代传输 | 此包声明未提供 `ISteamNetworkingMessages` 或 `ISteamNetworkingSockets` 入口，也没有中继路径诊断接口 |

Valve 将旧 `ISteamNetworking` 标记为弃用，并推荐 Messages 或 Sockets；旧接口的 relay 回退也不能作为已验证现代 SDR 的证据。见 [Valve ISteamNetworking 文档](https://partner.steamgames.com/doc/api/ISteamNetworking) 与 [Steam Networking 概览](https://partner.steamgames.com/doc/features/multiplayer/networking)。本包可用来实现并验证第一版兼容传输；迁移现代 API 是另一个需要选定绑定并验证的工作，不能凭空调用当前绑定没有的方法。

## 可复用与必须替换之处

可复用的是 Lobby 成员识别、原房主检查、Steam 原生包提供的发送方身份、握手/心跳的结构，以及回环 HTTP 的 Host、随机令牌和 Origin 验证。

不能直接复用五子棋的单 `peer`、黑白两方身份、完整棋局广播、双方重开和进程内存保存。World Order 的四个玩家具有不同私有视图，主机和客机职责必须分开。

已定位的差异：

- `main.cjs:42` 丢弃超过 8192 字节的包。本次只在内存生成一次双扩展新局并序列化：完整状态约 10,327 字节，房主席位 `roomView` 约 8,048 字节；这只是样本，未含最终 Steam 信封，也不是最大值。8 KB 限额不适用于后续局面。
- `main.cjs:34` 在 epoch 不同时直接接受状态。旧局迟到消息也可能满足这个条件。新协议必须先核对已建立的 session epoch，再比较递增 revision；更换 epoch 只接受可信重连/新局握手。
- 同一行收到任意心跳快照即清除 `pending`，不能证明本次命令已经执行。World Order 需用命令 ID 的结果回执，心跳只维护连接状态。
- `main.cjs:17` 的异步建房/入房只有 `changing` 标志，没有超时后处理迟到结果的代数标记。新的传输生命周期应忽略并离开已经被取消的迟到 Lobby。
- `test.cjs` 的网络全为内存模拟，只断言双人路径。其存在不能证明原生加载、实际 NAT/中继、Steam 回调顺序或四人网络可用。

## World Order 最小对接方案

同一电脑仍以本机浏览器显示现有 `dist/` 界面。Node 桥接进程负责本机 HTTP、Steam 和存档，界面不持有 Steam 原生权限，也不对外监听 HTTP。四人不需要自建公网 HTTP 服务。

1. **独立传输模块。** 提供建房、入房、离开、按 Steam ID 单播、接收消息和连接状态事件。将 Lobby 与数据通道就绪分开表示，每个成员各自维护心跳/握手状态；Lobby 元数据仅放协议版本、原房主和会话标识，不放手牌或完整状态。人数上限为四，但四人化不能只改人数常量。
2. **主机唯一结算。** 主机进程保存完整 room，串行调用现有 `server/rooms.js` 的 `changeRoom`。远端只提交现有 command，继续校验责任人、费用、席位、`gameRevision`、`seatRevision` 和命令去重；撤回也走同一命令路径。客机不调用规则引擎推导权威状态。
3. **身份绑定。** 从 `readP2PPacket` 返回的 `steamId` 取得发送方；校验当前 Lobby 成员，再建立主机维护的 Steam ID→席位/会话映射。拒绝载荷自行指定的发送方、玩家或身份。浏览器的标签页 token 只作为本机会话标识，不能取代 Steam 身份。更换账号不能继承其他人的席位。
4. **逐席脱敏。** 对每个身份分别调用 `roomView(room, identity)`，由内部 `playerView` 处理他人手牌、目标、抽牌堆、盖牌、秘密投标以及合法检索例外。只单播该玩家结果。不能把完整 room、撤回快照/history、所有四席的视图合集或随机种子发给任一客机。主机的浏览器也只拿主机席位视图。
5. **小型有版本协议。** 消息携带协议、Lobby ID、固定原房主、session epoch、request ID；状态携带 revision。执行成功并保存后才确认 request ID；重试使用同一个 ID。错误回包不确认其他命令，不泄露他方输入。只接受原房主状态；只接受不落后于本地 revision 的同会话状态。
6. **控制包大小。** 命令与状态分别设限。可靠包不得突破绑定的 1 MB 上限；若状态需要分片，限定总字节、片数、并行重组数和过期时间，再完整校验后接受。图片从本地素材加载，不塞进快照。先计量真实对局快照，再决定快照/增量，不能照搬 8 KB 上限或无界重组。
7. **保存和恢复。** 主机在独立目录原子保存完整 room；不要操作已有 `.local/rooms.sqlite`。同一 Steam 账号重连后恢复其席位并重发该席最新视图；命令回执和 session epoch 一并处理。第一版原房主离开时停局；Steam 的 Lobby owner 自动变化不能等价于游戏权威迁移。主机进程拥有完整状态，不能宣称抵御主机作弊。
8. **保留前端接口形状。** 为 `RoomClient` 提供 Steam 模式的桥接传输，返回兼容的 room view；现有六位本地房间码与 Steam 的十进制 Lobby ID 应区分解析。不要将当前固定开发身份的 HTTP 适配器简单暴露到公网或用作 Steam 身份。

最小实现应先复用当前房间领域函数，不另写第二套计费、回合、隐藏信息和撤回规则。代码参考是接口与结构证据，不是把旧 main.cjs 改人数后整体并入项目的理由。

## 验证边界

本次完成目录/声明/源码只读审查，以及一次内存序列化大小检查；没有执行交接包主程序、原模拟测试或原生加载测试。没有更改 World Order 的规则、网络入口、依赖和正常房间存档。

后续实现时，需要针对同一身份跨席冒充、非 Lobby 发包、重复 request ID、旧 revision/epoch、秘密投标和检索视图、主机退出、客机重连及超大消息做有界协议测试。真实 Windows 原生加载，以及四个独立 Steam 账号的跨网入房/行动/回应/刷新/断线恢复，必须由实际 Steam 会话验证后才能称为完成。AppID 480 继续只是示例应用，不是独立产品发布配置。
