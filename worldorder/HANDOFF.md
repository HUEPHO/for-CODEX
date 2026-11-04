# World Order · 家中电脑接续交接 · 2026-09-17

最新本机变更（2026-09-21）：见 [桌面操作与新手起手](docs/table-opening-2026-09-21.md)。发展同种牌合堆、利益区域标记放大、开局点图弃1留2、新局固定箭头六张起手、中央横向操作区均已完成并专项验证；旧房间保留。下文为原交接历史。

这份交接对应最新本地开发，早期 v26 文档中的“待开发/未联机”不能覆盖这里的最新状态。游戏功能代码检查点为 `9b12ced`；交接包根目录的 `HANDOFF_REVISION.json` 记录实际导出版本。本批没有部署到旧云端站点。

## 到家后怎么接上

1. 将完整 `WorldOrder-Home-Handoff-2026-09-17.zip` 复制到家里电脑，先完整解压到可写目录。
2. 在 Codex 中打开解压后的 `world-order-codex` 文件夹作为项目。新对话粘贴下方接手提示，即可继续；不用依赖原电脑在线或原对话能否同步。
3. 本机四标签页测试：双击项目内 `Start-Local.bat`，浏览器打开 `http://127.0.0.1:8787`。
4. Steam 模式：先登录 Steam，再双击同目录 `Start-Steam.bat`；浏览器自动打开。四台电脑用不同账号，与房主互加好友，通过数字房间号加入。一个账号只控制一个席位，Steam 模式不能用同一账号的四个标签页替代四人。

目标系统为 Windows 10/11 x64。包内附 Node 24.19.0 和 steamworks.js 0.4.0 运行组件，不用先安装 Node/npm。若提示原生模块或 VCRUNTIME140.dll 缺失，按 `steam/README.txt` 的微软官方入口安装/修复 x64 C++ 运行库。不要只复制 bat 文件。

可直接粘贴给家里 Codex：

> 继续这个 World Order 项目。先读 HANDOFF.md、START_HERE.md、AGENTS.md、CODEX_TASK.md、docs/CONFIRMED_RULES.md 和 docs/steam-networking-2026-09-17.md。最新联机代码已实现并通过模拟四人及浏览器验证，但真实 Steam 建房/加入和跨网络尚未实测，优先完成这个缺口。保留现有机制、用户裁定、地区界面和撤回边界。不要把旧文档里的已完成项目重新当待办，不要重建规则引擎，不要把模拟测试说成真机通过。按可独立使用的功能推进并保存，真正不明的规则集中问我。

## 当前已做好的部分

- 规则框架：四席权威房间、六轮准备/研究/行动/事件/余波/计分/终局；D&D 10种发展、32项目标、WIT 58张非转折事件及2张转折点、14项持续效果已接入。覆盖声明和组合边界见 `docs/wit-complete-2026-09-17.md`，不是所有牌面组合都已真人试玩。
- 界面：取消地图底图，七个地区按奖励合计降序排列，各用对应主题色，集中放影响力、原版大号坦克/介入图标和商店国家；已拥有盟国仍在玩家区。零军队/介入不显示。资源图标沿用原版颜色，坦克按势力着色。
- 操作：拖手牌出牌，点击地区选择介入、影响力槽及军队来源/目的地；军队不采用拖动。发展和盟国的获得选择在各自展示区完成，复用既有权限与费用判断。
- 撤回：上一步、本阶段、本方这一次完整行动（包含连打/后续效果）；抽新牌、揭示隐藏信息、其他玩家接续操作后不能跨节点撤回。短期自动快照，不做手动存档管理。
- Steam：好友可见四人 Lobby、数字号加入、按真实 Steam ID 固定席位；房主复用 `server/rooms.js` 权威结算，逐席脱敏发送。回执重试、版本冲突、断线暂停、刷新恢复、客机退出重入和撤回均已接入。AppID 480 为 Spacewar 测试应用，不是正式上架版本。

## 到家后优先完成

1. 用包内运行时执行 `scripts/check-steam-runtime.mjs --login`，记录真实 Steam 初始化结果。原机器没有可用 Steam，最后错误为 `Could not determine Steam client install directory.`；这是环境限制，不是已证实的协议错误。
2. 房主创建真实 Lobby；第二台电脑用另一 Steam 账号输入数字房间号加入、入座和刷新。随后补齐四台电脑/四个账号，检验开始选牌、每人只能看自己的隐藏信息、出牌同步及撤回限制。
3. 跨不同网络验证 P2P 传输、短暂断网恢复、客机退出再加入、大于8KB的状态及连续对局。记录失败发生在 Steam 初始化、Lobby、P2P 还是游戏命令层，针对失败层修复。
4. 原房主退出 Lobby/启动程序时本局停止；当前不支持房主迁移。不要把这个已知限制误报成重连成功。没有可用测试账号/电脑时，可以继续独立工作，但不能声称跨网已验收。
5. 用户曾在确认“管道/TTIP本方任意阶段使用”后追问“北溪/西伯利亚管道是不是写了阶段限制”。现实现和裁定表仍记录任意阶段；这是需要对照原牌和后续对话核对的质疑，不可静默改成行动阶段，也不要假称后续问题已明确回答。

本次交接仅打包，不新增未测试的规则调整。机制后续侧重复杂组合和真实多人完整对局问题；已有专项通过的项目不必反复全量重跑。

## 用户裁定与协作方式

完整规则表见 `docs/CONFIRMED_RULES.md`。特别保留：主动牌条件不足整张禁止且不扣费；普通“然后打另一张牌”允许放弃；主动抽换牌能力仅行动阶段；战役优势购买时立即结算且即时资产无需盖牌；强制/可选事件的跳过最低值/满产能/不足额移动属于各自明确例外；科技竞赛修正相加、非胜方基础SP按全额实际投标；朝鲜2024是额外国家；同类出口翻倍不叠加；目标按当前净提升。

用户偏好中文、先做成可用功能、减少无效等待与重复测试。遇到真歧义集中问，不把文件中的假设升级成用户裁定。不要做单人AI或MARS。共享许可/待办入口和领域执行器，避免逐牌复制预检、全状态反复克隆或嵌套扫描导致不必要的 O(n²) 工作。

## 文件和架构导航

| 范围 | 入口 |
| --- | --- |
| 当前规则裁定/架构 | `docs/CONFIRMED_RULES.md`、`docs/ARCHITECTURE.md` |
| Steam 实现、测试与边界 | `docs/steam-networking-2026-09-17.md`、`steam/README.txt` |
| 房间权威状态与脱敏 | `server/rooms.js` |
| Steam 通道/会话/本机桥/快照 | `server/steam-native.js`、`steam-session.js`、`steam-http.js`、`steam-store.js` |
| 网页联机入口 | `dist/room-client.js`、`room-ui.js`、`steam-client.js`、`steam-ui.js` |
| 区域点击、撤回 | `docs/region-rollback-2026-09-17.md`及对应模块 |
| 原始规则及TTS数据 | `references/` 三本PDF和 `TS_Save_12.json` |

`dist/` 根目录和 `dist/assets/` 是手写源码/素材，不能删除后重建。只把 `dist/client`、`dist/server`、`dist/.openai` 当生成物。原 Sites/D1 入口依赖可信身份；本地固定身份不能用作公网身份。Steam 的回环令牌不能作为朋友邀请链接。

## 验证与命令

在项目目录的 PowerShell 中使用包内 Node；若系统已有 Node 24，也可改用 `node`：

```powershell
.\runtime\node.exe scripts/check-steam-runtime.mjs --login
.\runtime\node.exe scripts/check-steam-native.mjs
.\runtime\node.exe scripts/check-steam-session.mjs
.\runtime\node.exe scripts/check-steam-client.mjs
.\runtime\node.exe scripts/check-steam-http.mjs
.\runtime\node.exe scripts/check-architecture.mjs
```

最后五项已在原电脑通过，不依赖真实 Steam；`--login` 留待新电脑。Windows 原生模块实际加载通过；四个真实会话对象通过模拟Steam通道的浏览器建房/加入/选牌/撤回/刷新/重入路径通过。既有基础版与双扩展六轮程序集成曾通过（305/382条命令），不是真人完整对局。

运行本地服务：`.\runtime\node.exe scripts/dev-local.mjs`；Steam：`.\runtime\node.exe scripts/start-steam.mjs`。无需 Vite 构建即可修改并运行。需要 Vite/生产构建工具时再按根 `package-lock.json` 安装开发依赖；它们未捆绑进交接包。

## 包内数据与版本

交接包包含完整跟踪源码、卡图/符号、规则书/TTS、当前文档、Node和Steam运行组件，以及 `project-history.bundle`（Git提交历史）。SHA256清单位于包根目录。原有 `SOURCE_REVISION.json` 和 `MANIFEST.sha256` 是早期v26交接来源记录，不是本次导出清单。

没有搬迁原电脑的房间数据库、浏览器存档、自动快照、登录凭据或测试局。新电脑第一次启动创建自己的数据目录。用户要接着开发，不是恢复当前未完成的对局；原电脑数据保留。

源码目录可直接打开继续编辑；无需先恢复 Git。若需要完整历史，可在包根目录运行 `git clone .\project-history.bundle .\with-history`，仓库源码在 `with-history/world-order-codex`。把随包源码目录的 `runtime` 和 `steam/node_modules` 复制到该克隆的相同位置后即可直接运行。克隆创建新目录，不覆盖随包源码；`runtime/` 和 `node_modules/` 已忽略。不要导入旧电脑的 `.git/config` 或绝对路径。

界面和规则旧记录均保留作为证据；发生进度冲突时，以本文件、最新完成记录及用户后续明确回答为准。
