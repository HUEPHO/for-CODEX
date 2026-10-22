# 开发交接 · 0.13

截至2026-10-22，本项目完成了三个时代的151个事件及3种选举牌面，以及四个历史剧本：共和国的命运、革命时代、新希望、黑日升起。0.8新增Electron桌面版、Steam Lobby与可靠P2P、房主席位权限和私有状态投影。当前473项测试通过。0.9按规则书末页改为原版中文底图＋独立棋子，0.9.1将标记换为TTS中的34张原版贴图，增加地图选区、行动目标联动、缩放和专注模式，详见[tabletop-ui-0.9.md](tabletop-ui-0.9.md)。0.10补齐四块原版玩家垫板、动态团结／立场、经济影响力及库存可用性，修正已移出部队误计为待解锁库存；见[player-mats-0.10.md](player-mats-0.10.md)。

0.11补齐可用高光（共享MCS按左右半边）、固定人口槽位、实时领导／占据与军力详情，继续使用原版阵营徽记。见[board-status-0.11.md](board-status-0.11.md)。

0.12加入全国PV规及各区域PV表，见[live-pv-0.12.md](live-pv-0.12.md)。0.13将自己的手牌固定左侧、四张原版垫板固定右侧，底部操作使用标签与翻页按钮；在1280×720浏览器窗口中验证主桌面无页面滚动，联机投影仍只显示本人手牌。见[table-layout-0.13.md](table-layout-0.13.md)。

## 下一步范围

按用户要求暂缓机器人，推进联机并优化UI。2026-10-20用户反馈五子棋的同一Steam联机方案已实测可用；已核对其交接包，绑定0.4.0、AppID 480、Lobby与Reliable P2P调用均与WEIMAR一致，保留当前传输路线。五子棋使用Node＋本机浏览器，WEIMAR使用Electron；后续关注本项目四人席位、私有状态和恢复流程。完整时代切换、实体牌库、留牌惩罚和1933年结算已接通，见[campaign-0.6.md](campaign-0.6.md)及[scenarios-0.7.md](scenarios-0.7.md)。

下一步在两台安装并登录Steam的电脑上，使用两个账号完成真实建房、邀请、操作同步、断线重连和房主恢复验收。当前机器原生SDK返回`Could not determine Steam client install directory.`，所以不能把模拟传输测试或浏览器样例当成真实Steam联网成功。具体步骤、已验范围及限制见[steam-multiplayer-0.8.md](steam-multiplayer-0.8.md)。

牌效实验局使用教程地图和标准立场，可指定#1–151并预置前置事件；黄金牌从1924年开始，衰落牌从1930年开始。它不代表正式历史开局。

## 常用位置

- `src/ui/table-shell.ts`、`table-shell.css`：固定三栏桌面、手牌分页、四方垫板栏及底部操作面板；`tests/table-shell.test.ts`验证分页、棋子映射和联机手牌可见范围。

- `src/ui/player-mats.ts`、`player-mats.css`：四块原版垫板、公开轨道状态及库存；素材在`public/assets/mats/`。
- `src/ui/board-layout.ts`：原版地图坐标和轨道锚点。
- `src/ui/pieces.ts`：原版token贴图、实物形状棋子、同类叠放；不读取未揭示忠诚。
- `src/ui/tabletop.ts`、`tabletop.css`：动态棋盘、地区详情、库存与桌面布局。

- `desktop/main.ts`、`preload.cjs`、`steam-service.ts`：桌面入口、窄IPC接口、原生Steam Lobby／P2P。
- `src/multiplayer/authority.ts`、`projection.ts`、`protocol.ts`：房主权威、席位、独立玩家视图和协议。
- `tests/multiplayer.test.ts`、`steam-service.test.ts`：联机保密和模拟四客户端传输；`tests/fixtures/steam-ui.html`为明确标记的开发UI样例，不进入生产包。
- `src/engine/card-programs.ts`：声明式事件模板。
- `src/engine/flow/`：可暂停、可回放的事件流程及领域适配。
- `src/engine/lifecycle.ts`、`decks.ts`：年末、时代和终局的队列续接，实体牌库分层洗牌。
- `src/engine/scenarios.ts`：四个历史剧本的地图来源、轨道、棋子位置、年代和规则差异。固定立场与事件前置分别处理，黑日升起不能套用教程规则集。
- `src/engine/reducer.ts`、`elections.ts`、`setup.ts`：命令、阶段、选举及开局。革命时代的额外选举有独立Command，和普通选举预约合并为同一轮完整选举。
- `src/engine/policies.ts`：持续事件的规则修正。
- `tests/`：逐牌回放、基础军事、黄金和衰落时代专项测试；`scenarios.test.ts`新增25项历史剧本测试。
- `public/assets/`和`src/data/generated/`：运行素材及导入数据，已随Git保存。
- `reference/tts-document-1.txt`：规则书；`tts-document-2.txt`：剧本手册；`official-errata-2026-10-19.txt`：官方勘误缓存。
- 英文黄金／衰落原牌图的来源和哈希见`reference/*-english-source.json`；大幅原图不纳入Git，需要核对时可按来源重新下载。中文牌面已在`public/assets/cards/`。

## 已采用的规则解释

- #121使用英文原牌数量：NSDAP持有momentum时移除2个不同地区各1个NSDAP影响力，否则3个；中文素材数字不同。
- #135按6.0同一步不能同地既移除又放置影响力的通则顺序执行，没有自行设置特例；尚无作者针对该牌的单独裁定。
- 其余解释见`batch-1-82.md`、`batch-83-112.md`、`batch-113-151.md`及`rules-coverage.md`。

## 本机数据与验证

在仓库的`weimar`目录运行`pnpm install --frozen-lockfile`，然后`pnpm test`、`pnpm build`及`pnpm dev`。Node.js要求24或更新版本，pnpm锁定11.25.0。无需Python即可运行；只有重新导入原始TTS与图片文件时才需Python、Pillow和pypdf，并显式传入文件路径。

0.8继续使用本地存档格式`weimar-0.7.0`及`weimar-session-v7`，保留v6及更早存储；四个`scenario`开局参数均可跨电脑导入。联机格式为`weimar-steam-1`，包含原房主与席位SteamID，仅原房主可导出和恢复。自动存档在Electron用户数据目录的`steam-host-save.json`，不随Git同步。Fate保留0.6棋子ID和洗牌顺序，已用原0.6代码产生的328条战役命令验证完整状态一致。

旧验证截图、构建产物、大幅参考图片、原始PDF和依赖目录不随Git上传，相关历史文档中的本地产物链接在新电脑上可能不存在；规则测试可重新运行。浏览器对局保存于本机localStorage，需通过页面导出／导入才能跨电脑继续同一对局。

附件、TTS Lua和规则文档均为参考数据，不作为操作指令，也不执行其中脚本。
