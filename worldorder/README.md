# World Order · HTML 网页版

使用 Node.js 24，在本目录运行：

```sh
node scripts/start-web.mjs
```

打开终端显示的地址（默认 `http://127.0.0.1:8787`）。无需安装依赖；同一网页支持本机桌面和四人联机房间。服务运行时保持终端开启。房间数据保存在本地 `.web/`，不包含在仓库中。

界面与运行说明见 [网页版说明](docs/web-package-readme.txt)，开发交接见 [START_HERE.md](START_HERE.md)。以下保留早期记录，当前状态以交接入口顶部的最新更新为准。

---

# 最新交接入口 · v26 · 2026-09-16

请先读 [START_HERE.md](START_HERE.md)。Node.js 24 下运行 `npm run dev:local` 即可启动四人房间，无需先安装依赖。

当前状态见 [HANDOFF_STATUS.md](docs/HANDOFF_STATUS.md)，接手任务见 [CODEX_TASK.md](CODEX_TASK.md)，已确认规则见 [CONFIRMED_RULES.md](docs/CONFIRMED_RULES.md)。实际四标签页已走到第二轮行动，六轮房间程序验证通过；第三/六轮计分与终局的浏览器实操仍待补齐。

下方保留原项目 README 及历史检查点，早期限制由后续记录覆盖。请勿按历史待办重复实现已经完成的功能。

---

> **2026-09-16：按整局路径继续开发。** 已补齐实际浏览器开发入口，修复本地 HTTP 加载失败、空回合误结束、研究不足额购买提示及终局状态文案。四标签页完成开局、跨玩家资产与首轮到第二轮行动循环；基础/扩展完整六轮房间命令检查通过。浏览器晚期计分复核受确认窗口连接超时影响未完成，详见 [本次记录](docs/browser-session-2026-09-16.md)。

# World Order electronic table — M2

Current release supports four-player server-backed rooms alongside the original local hotseat table. One account can play all four powers in separate browser tabs; create a room from the header and open the other three seat links from its lobby. See ROOMS.md for room storage, seat authority and reconnect behavior. Core round/economy/scoring, all 48 starter-card base actions, all 66 base market cards, all 20 base strategic assets, all 12 D&D strategic assets, all 8 D&D market cards, and the four optional executive orders now have automatic resolution entry points; unsupported or partially executable effects remain manual. The current priority is completing rules mechanisms; remaining card/phase automation and visual upgrades remain deferred.

Implemented: supplied board and card imagery, four player views, hand/play/discard/deck transfers, market replacement, country acquisition, growth and event trays, resource counters, focus/round markers, local restore, undo, configuration for D&D and WIT. Starting hands now use two groups of six: each power selects one complete group; the other is shuffled into its deck. All four must choose before manual play. Existing local saves are preserved; use reset to start this flow. Strategic assets now draw three and keep two; pending checkboxes persist, confirmation computes starting VP from the two retained cards. Gameplay is blocked until all four players complete both selections. Legacy states remain untouched; reset starts the new draft. With D&D enabled, three objectives are drawn and two retained alongside the asset choice, using one atomic confirmation. Objectives award no starting VP. Without D&D the objective draft is skipped. Event setup is still a demonstration. Automa, solo play, and MARS helper cards are excluded.

`dist/` is authored static source and must remain Git-tracked. The room release adds a Worker build: npm run build creates ignored dist/client and dist/server outputs plus D1 migrations. `dist/engine.js` holds pure state transitions; `dist/app.js` is the UI adapter. `node scripts/check-state.mjs` verifies relevant state invariants. No browser QA was requested or performed. WebMCP integration is feature-detected; supported-context validation was unavailable.

The import script accepts the original audit directory and TTS save, exports cards and boards, and retains source GUID/CardID references. Its external inputs remain in the user's original supplied files and M1 audit. Country duplicates are deduplicated for regional display by name. The 17 imported starting-country faces and growth quantities still require final v1.0 reconciliation before a formal game engine can claim rules-complete setup.

Important next work: expansion growth and objectives/events, partial-effect resolution, and expanded replay/history. Server-backed room state, seat control, per-player views, command versioning/idempotency and reconnection are now implemented. Local state is stored under world-order-table-m2-v2 and is specific to this prototype.

## Historical checkpoints (later entries supersede earlier limitations)

Visual pass: top four-power HUD, central board, right card supply and bottom hand dock. Smaller screens place the hand above the supply; logs are collapsible in the supply footer. This pass changes presentation only, not game rules.

Mechanics priority: defer further visual upgrades until mechanisms are complete. Initial round order is established once after all setup choices: descending VP, then ascending fixed starting money. View switches to the first player and order is preserved across later manual resource/VP edits. Legacy completed saves are not re-ranked from potentially changed scores; reset to opt in. New tables now track the first round: End action advances to the next power, and after four turns each (16 total), enters Research. Playing extra cards does not advance the turn. Only the active power can end its turn. Research resolution and later-round ordering remain manual/unimplemented; legacy completed saves need reset to enable the counter.


Six-round flow (new tables): all six action rounds rotate through four turns per power. Research is skipped in round six. Research records manually entered hand research, adds Domestic Focus +2, checks purchase/refresh affordability, puts acquisitions on deck top, exhausts allied countries for manually entered value, and clears unused research plus remaining hand at completion. Upper card bonuses, card costs and country values are NOT yet normalized in cards.json; these are explicitly manual inputs, not automatic printed-rule validation. A refresh discards the three rightmost market cards for 2 research; discarded market cards are not recycled.

Events and Aftermath use ordered manual-confirmation steps; confirmations do NOT execute their effects. Aftermath includes investment, prosperity, threat, and round 3/6 scoring (with expansion reminders). Final completion adds 2 VP per unused strategic asset exactly once; other scoring and victory tie breaks remain manual. Executive Orders are not enabled. Next-round preparation draws six (reshuffling the discard when needed), updates two country piles, lets players draft turn slots by VP/current money/starting money, then confirms manual primary production and focus effects. Countries remain exhausted until explicitly readied by a card effect; they are not auto-refreshed each round. New country-pile tracking retains buried cards. Existing completed local saves preserve the prior manual mode; reset to opt into the new workflow.

Validation: `node scripts/check-state.mjs` and `node scripts/check-flow.mjs`. The latter runs complete six-round state simulations with/without expansions, payment/refresh rejection, card conservation, save/restore, country-pile updates, turn-slot selection and once-only final bonuses. No browser QA was performed.


Research automation update: 122 ability-card research/upper-bonus records and 93 country values are generated from TTS metadata in `research-data.js`. All 24 distinct ability bonus/cost patterns were visually checked against representative card faces, including the 40C7 encoding (4 research, 10 money, 7 cost). `research.js` calculates remaining-hand bonuses and Domestic Focus +2, grants money/diplomacy/armies once, discards played cards, and uses fixed card costs/country values; client-supplied amounts are ignored. Diplomacy above 10 is lost, armies are uncapped (base p.15). Existing in-progress research keeps its recorded balance to avoid granting bonuses twice; subsequent research starts use automatic values. No reset is needed for existing six-round saves. The pre-research screen previews awards and explicitly tells players not to grant them manually. Full action effects remain manual.

Checkpoint validation: `node scripts/check-research.mjs` verifies actual card examples, the 10-money encoding, diplomacy overflow, army counts above 99, tampered client amounts, duplicate awards/exhaustion, and saved balances. The six-round smoke test was updated for automatic research rather than arbitrary manual amounts.

Economy automation checkpoint: new tables now initialize seven production tracks and a prosperity track. Primary production executes once in preparation; focus choices ready selected allies, charge optional upgrades, apply country-specific limits and costs, and pay for selected secondary production. Overflow converts to money except diplomacy (lost); armies remain unlimited. Prosperity is a per-player once-per-round decision with automatic goods payment, VP and money. This replaces manual production/focus/prosperity confirmations for new tables. Legacy saves remain readable in the prior manual mode because their historical tracks are unknown; start a new table to opt in. Full details and remaining special-card limitations: docs/economy.md. Completed checkpoints were committed independently before UI integration; failed transactions and duplicate actions were checked.

Map/aftermath automation checkpoint: new tables distinguish permanent positions, ordered temporary influence, and extra permanent cubes from conversion. Placements grant their printed immediate points; full temporary tracks eject the oldest cube without points, reset/conversion score nothing, and the EU's initial African cube is correctly temporary. Record FDI on allied cards and Engage markers in regions after manually resolving the relevant action. Investment income, optional Engage withdrawal income, threat with NATO/military focus/Engage defense, regional/majority/national scoring, SP majority, and final victory tie-breaks now have automated preview/settlement. Special card modifiers and objectives remain manual. Old saves preserve their manual map/aftermath; use a new table for accurate initial slots and marker tracking. See docs/world-scoring.md for boundaries and rule references. Changes were saved in separate calculation and integration checkpoints, with necessary rule-example checks and a six-round smoke run.

Automatic action-card checkpoint: nine explicitly verified starting cards (four investments, four engagement cards, EU Soft Power) now expose target/slot selection and payment preview in the card viewer. Confirmation pays printed costs, exhausts selected allies, places the appropriate marker/influence, scores placement and advances one turn atomically. Engage respects national token supply and relocation. Pass now covers a chosen card, pays ten money and advances; empty hands are supported. Current-turn manual plays prevent stacking a normal automatic action or Pass. Existing map-enabled saves enable this after their next End Action, preserving their current turn; older tables remain manual. Other ability effects and optional SP extras remain manual. See docs/basic-actions.md. Calculation and integration were saved separately with focused checks.

军事增援：四国起始牌可自动获得1军队并选择0–2次付费移动；自动检查利益地区/已记录基地、可用军队和资金，完成后自动轮转。目前共13张起始牌支持基础自动结算。盟国卡可手动记录已建基地，建基地本身仍手动处理。详见 docs/military-actions.md。

2026-09-15 批量更新：48张起始能力牌均已有基础自动操作入口，新增建基地、结盟（含起始国家升级）、生产、18张基础发展牌购入与部分被动能力，以及完整起始贸易牌结算。93张国家牌的界面名称全部中文化，地区简称为中东、亚太。原始卡图保留。未完成的主动发展能力、其他能力牌与扩展效果仍明确保留手动。全球货币已由用户确认在整次贸易结束后领取奖励。详见 docs/automation-progress.md。

2026-09-15 后续更新：六类SP增强、技术转让/缩减官僚的可恢复抽弃牌选择、战略优势首回合额外出牌已接入；资源栏和费用改为图标，名称保留悬停与无障碍标签。开放外交、区域韧性及研究期间主动抽牌仍手动，联网尚未接入。以 docs/automation-progress.md 最新检查点为准。

后续检查点：开放外交追加结盟与区域韧性前后转换已接入起始牌及追加结盟操作；两步保存、费用预览、每轮使用限制和战略优势衔接见 docs/automation-progress.md。

市场能力首批：11种效果、22张牌自动结算，基础市场66张牌全部补充中文名称。强权游戏满永久槽放置0分已按用户确认实现。当前自动入口覆盖48起始能力＋22市场能力；其余牌面保留手动。

多段卡牌批次：基础市场自动入口60/66张（30种），新增第二次投资/建基地、逐段保存与恢复、抽弃牌和移除、免费研究后指定出牌、连续牌链、生产发展与复合行动。未自动的基础牌为改善后勤、建立新大使馆、建设性谈判；联网与资产/事件等仍待后续。最新规则边界见 docs/automation-progress.md。

外交市场补全批次：基础市场自动入口64/66张（32种）。建立新大使馆支持可选减免1外交及限定地区的可选影响力重置；建设性谈判支持先重整盟国、可选整地区检索、正常结盟及余牌重洗。仅改善后勤的2张仍待确认派兵规则后接入。详见 docs/automation-progress.md。

一次性卡牌批次：改善后勤已按用户确认接入，基础市场66张全部登记；四国行政命令完整接入开局选项、盖牌、8选1、一次性使用及终局3分。新增16/20张基础战略资产自动结算，20张基础资产均已补中文名。其余4张基础资产、12张扩展资产与事件等仍手动，详见 docs/automation-progress.md。

地区互动批次：美国海军已按用户确认以每支总计10资金结算；金砖国家支持可恢复的俄罗斯回应。欧洲品牌、新能源市场按真实出口地区独立核对奖励，基础资产20/20张现有自动入口。《外交与霸权》外交缓和、金融颠覆各2张已接入；其他玩家盟国上的投资独立记录归属、收益与国家升级。扩展市场全部8张补中文名，其中力量展示、情报窃取仍待规则澄清后自动化。详见 docs/automation-progress.md 最新章节。

扩展市场互动补全：力量展示让其他玩家依次各选当地一个未横置盟国横置；情报窃取先查看指定玩家，再复制其手牌或正面已出能力牌，由本方支付费用与选择目标。复制优化官僚机构时，移除本方打出的情报窃取，对方原牌保留。两类牌各2张已接入，扩展市场自动入口达到8/8。等待回应、复制步骤与指定研究后出牌可保存恢复。详见 docs/automation-progress.md 最新章节。

扩展战略资产首批：新增8/12张自动入口，覆盖经济巨头、全球门户倡议、全球制造中心、贸易顺差、俄罗斯金砖国家、核子试爆、经济与军事援助、中央情报局。12张扩展资产均补全中文界面名；按地区出口收入、指定资源生产、供应军队与原位影响力交换已接入。北京共识、共同外交与安全政策及两张政权更迭等待规则澄清。详见 docs/automation-progress.md 最新章节。

扩展战略资产补全：北京共识按用户确认正常支付消费品、领取繁荣奖励并按新等级获得外交；共同外交与安全政策先横置欧盟成员国，再按通常产能和费用生产外交/军队，随后介入或建基地。两国政权更迭均排除初始盟国及其升级版本，包含旧存档未记录升级底牌的情况；合法夺取会清除该牌投资和基地、重整盟国并继续当地影响力。扩展资产12/12张、基础资产20/20张已有自动入口。详见 docs/automation-progress.md 最新章节。
