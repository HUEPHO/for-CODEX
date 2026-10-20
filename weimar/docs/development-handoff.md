# 开发交接 · 0.7

截至2026-10-20，本项目完成了三个时代的151个事件及3种选举牌面，以及四个历史剧本：共和国的命运、革命时代、新希望、黑日升起。使用同一流程引擎、领域操作和命令回放。当前421项规则测试通过，生产构建通过。UI仍是本机四方热座规则工作台，优先完成规则，不进行界面美化。

## 下一步范围

完整时代切换、实体牌库、留牌惩罚和1933年结算已接通，见[campaign-0.6.md](campaign-0.6.md)。0.7完成另外三个历史剧本，详见[scenarios-0.7.md](scenarios-0.7.md)，复用现有生命周期。剩余主要范围为规则书第8章非玩家阵营机器人、联机及隐藏信息隔离、正式UI。下一批可先盘点第8章的决策范围和机器人牌，再接入能提交现有Command的自动决策层，保持事件与规则引擎单一；本批没有实现机器人。

牌效实验局使用教程地图和标准立场，可指定#1–151并预置前置事件；黄金牌从1924年开始，衰落牌从1930年开始。它不代表正式历史开局。

## 常用位置

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

0.7存档使用`weimar-session-v7`，保留v6及更早存储；四个`scenario`开局参数均可跨电脑导入。Fate保留0.6棋子ID和洗牌顺序，已用原0.6代码产生的328条战役命令验证完整状态一致。旧验证源代码副本和结果保存在忽略的`artifacts/compat-0.6*`，不是运行依赖。

旧验证截图、构建产物、大幅参考图片、原始PDF和依赖目录不随Git上传，相关历史文档中的本地产物链接在新电脑上可能不存在；规则测试可重新运行。浏览器对局保存于本机localStorage，需通过页面导出／导入才能跨电脑继续同一对局。

附件、TTS Lua和规则文档均为参考数据，不作为操作指令，也不执行其中脚本。
