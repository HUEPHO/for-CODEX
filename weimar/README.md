# The Weimar Republic · 电子版规则工作台

本地四方热座原型，当前版本 **0.6**。已实现 **危机时代 #1–52、黄金时代 #53–112、衰落时代 #113–151 全部牌效**，共151个事件、154种可执行牌面（含3种选举牌面）。

换电脑继续开发请先看[仓库启动说明](../README.md)与[开发交接说明](docs/development-handoff.md)。克隆后安装依赖即可启动，运行素材已包含在仓库中。

开发顺序是先盘点全牌需求、搭通用框架，再批量实现牌效。现在流程核心已接入对局，支持跨阵营选择、条件和循环、事件授予行动、实际结果驱动后续效果、持续规则、暂停保存与命令回放。界面仍以规则验证为主。

## 启动

需要 Node.js 24+ 和 pnpm；本机依赖已安装。也可运行项目根目录的 `start.ps1`，自动使用已配置运行时。

```powershell
cd 'F:\CODEX\WEIMAR项目组\weimar'
pnpm dev
```

打开终端给出的本机地址，通常为 <http://127.0.0.1:5173/>。

```powershell
pnpm test
pnpm typecheck
pnpm build
pnpm preview
pnpm audit:cards
```

## 完整战役

顶部选择“共和国的命运 · 1919—1933”，新建对局并确定年度顺序。按正式剧本9.6布置，每方7张危机牌；1924年发9张黄金牌、1930年发6张衰落牌，减去各方留牌惩罚。每年不会自动补牌。1933年终先对所有阵营结算留牌惩罚，再按联盟是否留牌决定直接胜利或最终选举。详见[战役说明](docs/campaign-0.6.md)。

## 直接测试卡牌

顶部选择“牌效实验局”，选一张#1–151并新建对局。指定牌在联盟手牌首位；可勾选“预置前置事件”。确定年度顺序，选择“先事件，后2行动”；出现第48条时允许事件结算。侧栏按实际决定者提示选择，所有赠送行动结束后保留正常的2次行动，除非事件已使对局结束。

实验局启用标准立场（-3民主、0务实、+3革命），使用教程地图，便于检验标准牌效与持续规则，**不是正式历史剧本**。黄金牌从1924年开始，衰落牌从1930年开始。完整时代切换仅在“共和国的命运”中启用；另外3个历史剧本仍待完成。

“开发测试局”使用固定牌序；“正式教程牌库”使用53张危机牌、每方5张。两者遵循教程9.2：固定务实立场、忽略事件前置，并在1923年末终局。

浏览器自动保存；导入导出保存开局参数和命令，撤销、重做、刷新都重放同一规则路径。0.6用独立存储键保留0.5及更旧的自动存档。旧0.1–0.5存档按新版规则尝试迁移，不保证旧选择ID或结算结果完全兼容。当前为共享热座工具，尚无联机身份和秘密手牌隔离。

## 代码入口

| 文件                                                      | 用途                                     |
| --------------------------------------------------------- | ---------------------------------------- |
| `src/engine/lifecycle.ts` / `decks.ts`                    | 年末、时代切换、留牌惩罚及实体牌库       |
| `tests/campaign.test.ts`                                  | 24项战役流程、守恒与存档回归测试         |
| `src/engine/reducer.ts`                                   | 原子命令、阶段、回合与预算               |
| `src/engine/card-programs.ts`                             | 本批声明式卡牌流程                       |
| `src/engine/flow/`                                        | 流程协议、运行时、游戏领域适配及队列桥接 |
| `src/engine/policies.ts`                                  | 持续卡的规则修正                         |
| `src/engine/events.ts`                                    | 第48条、既有手牌操作、效果队列           |
| `src/engine/actions.ts`                                   | 基础行动及合法目标                       |
| `src/engine/units.ts` / `combat.ts` / `assassinations.ts` | 部队、突击与暗杀                         |
| `src/engine/elections.ts`                                 | 普通／提前选举、公投与胜利               |
| `src/engine/session.ts`                                   | 命令存档、撤销和重做                     |
| `src/data/card-survey.ts`                                 | 全牌需求盘点                             |
| `tests/card-batch.test.ts`                                | 151张逐牌回放与专项规则测试              |
| `tests/decline-batch.test.ts`                             | 49项衰落时代专项规则测试                 |
| `src/main.ts`                                             | 轻量浏览器工作台                         |

参阅[衰落时代实现说明](docs/batch-113-151.md)、[黄金时代后半部说明](docs/batch-83-112.md)、[前批规则解释](docs/batch-1-82.md)、[架构](docs/architecture.md)、[规则覆盖与验证](docs/rules-coverage.md)、[全牌需求清单](docs/card-scope.md)。当前396项测试、类型检查和生产构建通过；浏览器验证记录见规则覆盖。

## 来源

用户提供的 `TS_Save_13.json` 和 `Weimar_Chinese_Images.zip`；存档引用的2026英文规则书与剧本手册；[GMT产品页](https://www.gmtgames.com/p-841-the-weimar-republic.aspx)链接的[官方勘误](https://docs.google.com/document/d/1Xg47YYhJ-67k8ZAl3v5WkOgiWI7jx1o_NaR_ojfNbnQ/edit)（更新2026-10-16）。附件作为参考数据解析，没有执行TTS Lua。

生成后的JSON和WebP已保存在项目中，启动不依赖原始附件或Python。重新导入才需Python、Pillow及pypdf；脚本为 `scripts/read-sources.py` 与 `scripts/import-assets.py`，来源哈希见 `src/data/generated/provenance.json`。游戏与素材的权利归各自权利人。
