# World Order · HTML 网页版

《World Order》电子桌面，支持基础版、《外交与霸权》（D&D）和《世界动荡》（WIT），提供本机桌面、共享房间，以及基础／高级自动机。当前说明更新于 **2026-11-06**。

项目位于 [HUEPHO/for-CODEX](https://github.com/HUEPHO/for-CODEX) 仓库的 `worldorder/`，默认分支为 `main`。

## 启动

Windows 双击本目录的 **`Start-Local.bat`**。它优先使用 `runtime/node.exe`，没有附带运行时时使用系统 Node.js。

已安装 Node.js 24 的环境也可以在本目录运行：

```sh
npm run dev:local
```

无需先安装 npm 依赖。打开终端显示的地址，默认是 `http://127.0.0.1:8787`；保持服务窗口运行。页面通过 HTTP 加载，不能直接双击 `dist/index.html`。

启动器会打印当前源码和实际房间存档路径；同目录服务可复用，其他目录或旧服务占用端口时会明确提示，避免误开旧版本。`runtime/` 不进入 Git，仅克隆仓库时需自行准备 Node.js 24。

更新服务端或引擎代码后，先停止原服务，再重新启动并刷新网页。

## 房间与开局

首页是房间大厅，可创建房间、按房号加入、查看最近创建的房间，或进入本机对局。创建时选择扩展、自动机模式，以及四个势力分别由真人还是自动机控制。

| 开局模式 | 真人数量 | 其余势力 |
| --- | --- | --- |
| 无自动机 | 4 | 全部真人 |
| 基础自动机 | 2或3 | 基础版非玩家势力 |
| 高级自动机 | 1至3 | 一扩高级自动机，普通／困难难度 |

基础双人局需从美国／欧盟中选一方，再从中国／俄罗斯中选一方。两类自动机不混用，模式在布置新对局时确定；旧存档保留原配置。

创建后在房间等待页确认席位，使用席位链接邀请其他真人入座，再由房主开始游戏。自动机不占真人席位。对局顶部的 **“返回房间大厅”** 只切换页面，保留席位和存档；返回对局可继续操作。

本机入口可用多个标签页验证真人席位。`127.0.0.1` 链接仅供本机访问，其他电脑加入需使用下文的独立网页服务及局域网地址。

## 当前功能与操作

- 六轮准备、行动、研究、事件与结算流程；基础及扩展卡牌已有自动结算入口。无需选择的确定性步骤自动推进，遇到真人选择或明确标示的人工结算才停下。
- 自动机相关面板、行动方块、牌图、盟国及公开状态集中在对应玩家的信息窗口。裁军、撤军／增援、转永久、北溪、TTIP及金砖国家等自动机事件选择由脚本处理，旧存档的相关待办可自动继续。
- 数量统一左键增加、右键减少；是否选择统一左键选中、右键取消，重复左键保持选中。地区选择以整块金框表示状态。
- 贸易面板同时展示各类资源，保存结束后即可操作，无需先点击“扩展”。主板提供六格公共效果区。
- 轮到本席行动或回应时播放 BGA 同款提示音。首次点击或按键后启用，刷新、大厅和重复同步不会重复提醒。
- 抽牌、掷骰或查看隐藏信息后仍可撤回，点击即执行并提示“这不太好哟”；进入下一位玩家回合后，重开上一回合需要对方同意。
- 协议公开实时出资。含真人时，全部确认但不足额仍等待补足或达到拒绝门槛；完全由自动机参与时，出资不足直接失败。费用和拒绝条件按对应协议执行。

自动入口不代表全部牌面组合或整局完全自动；保留人工结算和旧存档兼容。高级自动机的自由选择策略见[实现说明](docs/non-player-decisions-2026-11-06.md)，不作为新增印刷规则。当前不包含 MARS 辅助牌。

## 存档与运行入口

推荐本机入口 `Start-Local.bat`／`npm run dev:local` 使用 `scripts/launch-local.mjs`，默认房间库为 `.local/rooms.sqlite`。若 `.local/launch-config.json` 配置了 `dataDirectory`，或设置了 `WORLD_ORDER_DATA`，则使用指定目录；以启动时打印的路径为准。保留已有配置即可继续使用原房间。

本机单桌进度保存在浏览器本地存储中；房间完整状态由服务端校验并保存，各席只获得对应的脱敏视图。备份房间时先停止服务并复制整个实际数据目录，或使用 SQLite 在线备份。

独立访客网页入口为 `node scripts/start-web.mjs`，默认数据目录是 `.web/`，使用独立访客身份。它与本机开发入口的身份和默认存档目录不同，切换入口不会自动迁移房间。局域网运行参数见[网页包说明](docs/web-package-readme.txt)的“同一局域网四台电脑”部分；该文档的旧界面说明以本 README 和最新交接记录为准。

本机开发入口使用固定开发身份，仅用于本机使用和验证。生产入口 `server/index.js` 依赖可信 Sites 身份及 D1 `DB`；本仓库不会自动部署或创建公网地址。Steam 通道已有实现，真实四账号跨网络联机仍待实测。

## 开发与验证

接手前依次阅读 [START_HERE.md](START_HERE.md)、[CODEX_TASK.md](CODEX_TASK.md)、[HANDOFF_STATUS.md](docs/HANDOFF_STATUS.md)、[CONFIRMED_RULES.md](docs/CONFIRMED_RULES.md)，并遵守 [AGENTS.md](AGENTS.md)。这是现有项目的续作，较早阶段记录中的限制和待办以最新确认内容为准。

| 位置 | 用途 |
| --- | --- |
| `dist/` 根目录、`dist/assets/` | 跟踪的前端、引擎源文件与素材，不是可整体删除的构建目录 |
| `server/`、`drizzle/` | 房间服务、存储及数据库迁移 |
| `scripts/` | 启动、构建与专项验证 |
| `docs/` | 规则、架构、功能交接和验证记录 |
| `dist/client/`、`dist/server/`、`dist/.openai/` | 生成物 |

Node.js 24 下，以下房间和流程检查无需先安装依赖，按变更范围选择运行：

```sh
npm run test:local
npm run test:rooms
npm run test:room-game
npm run test:flow
```

自动机、导航和提示音另有专项：`scripts/check-non-player.mjs`、`scripts/check-automa-core.mjs`、`scripts/check-automa-integration.mjs`、`scripts/check-automa-events.mjs`、`scripts/check-non-player-decisions.mjs`、`scripts/check-room-navigation.mjs`、`scripts/check-local-launcher.mjs`、`scripts/check-turn-notification.mjs`。

修改模块依赖或动作准入边界时运行 `npm run test:architecture`。`npm test` 仅是早期状态回归，不能代表当前全部功能验收；先查看 [VERIFICATION.md](docs/VERIFICATION.md)，选择能覆盖本次实际风险的检查。

Vite 开发、生产构建及 Drizzle 工具需要先运行 `npm ci`，再按需执行 `npm run dev`、`npm run build` 或 `npm run db:generate`。存档、便携运行时、临时构建和截图按 `.gitignore` 留在本机。

## 最近更新与记录

- [第11页批注](docs/page-eleven-2026-11-06.md)：贸易灰显、金框选择、公共效果区、提示音及自动机事件选择。
- [房间大厅与启动入口](docs/room-lobby-2026-11-06.md)：模式配置、真人／自动机席位、返回大厅和源码路径核对。
- [高级自动机](docs/advanced-automa-2026-11-06.md)与[基础非玩家](docs/non-player-2026-11-06.md)：规则覆盖、界面及验证范围。
- [架构说明](docs/ARCHITECTURE.md)与[早期自动化记录](docs/automation-progress.md)：模块边界和历史开发过程；更早的 README 可从 Git 历史查看。
