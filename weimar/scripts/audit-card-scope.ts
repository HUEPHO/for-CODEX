import { mkdirSync, writeFileSync } from 'node:fs';
import { CARD_SURVEY, CAPABILITIES, surveyReport } from '../src/data/card-survey.ts';
import { CARDS } from '../src/data/cards.ts';

const report = surveyReport();
const root = new URL('../', import.meta.url);
const stateNames = { existing: '已有基础', partial: '已有部分', missing: '缺通用实现' };
const eraNames = { crisis: '危机时代', golden: '黄金年代', decline: '衰落时代' };
const cell = (text: string) => text.replaceAll('|', '\\|').replaceAll('\n', ' ');
const lines = [
  '# 全牌效果范围盘点',
  '',
  '> 由 `pnpm audit:cards` 从 `src/data/card-survey.ts` 生成。更新调查数据后重新生成，不手工修改此表。',
  '',
  '本次按用户提供的中文牌面逐张做范围调查：**151 张事件牌 + 3 种选举牌面，归为 26 项能力需求**。目的在于决定框架边界，摘要不是完整规则转录，也不是逐条规则认证。调查完成不等于事件可执行。',
  '',
  `现有代码登记了 **${CARDS.filter((c) => !c.election && c.status === 'implemented').length} 个事件**及 3 种选举牌面。三个时代#1–151已接入，覆盖与限制见 [规则覆盖](rules-coverage.md) 和 [衰落时代说明](batch-113-151.md)。`,
  '',
  '资料：`public/assets/cards/001.webp` 至 `154.webp`；原始 ZIP 的三张时代牌图；规则核对参考 `reference/tts-document-1.txt`（Rulebook）与 `tts-document-2.txt`（Playbook）。素材和文档内容仅作参考数据。',
  '',
  '三个时代的事件分别为 1—52、53—112、113—151。以下卡号为内部 faceId；选举牌 faceId 152 / 153 / 154 对应印刷编号 152 / 154 / 156。物理卡 uid 另存，不能用牌面数量推算实体卡数量。',
  '',
  '## 从范围得到的框架边界',
  '',
  '1. **查询与选择**：区分存在、领导、占据、军事优势、议会控制；集合去重、动态数量、选择权归属、无目标策略。',
  '2. **领域操作与实际结果**：影响力、棋子、轨道、手牌、立场和议会牌返回实际结果；替换和永久移出是独立操作。',
  '3. **事件流程**：顺序、分支、重复、跨阵营选择、子流程等待及父流程恢复；所有续点可以保存。',
  '4. **行动授权**：借用已有行动规则，但具有独立次数、范围、决策者和明确规则例外；不复用普通回合行动余额。',
  '5. **持续规则与触发器**：查询时应用加成、改值、禁止、许可、上下限；规则冲突需依据；触发器规定时点和递归限制。',
  '6. **生命周期与阶段**：前置、取消、时代到期、下次选举到期；PV 只读查询与普通／特殊选举结算分开。',
  '7. **卡定义与验证**：牌面、物理实例、规则模板分离；未支持的操作在执行前拒绝；通过规则测试再登记可执行。',
  '',
  '实际模块、已完成部分与接入顺序见 [引擎架构](architecture.md)。',
  '',
  '## 能力矩阵',
  '',
  '数量为逐牌调查的需求标签计数，包含重复牌面，同一牌可以落入多项；它们不是完成率，也不表示遗漏标签的卡不受通用规则影响。下列基础状态保留0.2初次调查时的快照；0.5实际接入情况见规则覆盖与本批说明。',
  '',
  '| 能力 | 涉及牌面数 | 原有基础 | 主要缺口 |',
  '| --- | ---: | --- | --- |',
  ...report.capabilities.map(
    (c) => `| ${c.name} | ${c.cards.length} | ${stateNames[c.state]} | ${c.gap} |`,
  ),
  '',
  '## 待核实与审计发现',
  '',
  ...report.questions.map((q) => `- #${q.card}：${q.questions.join('；')}。`),
  '',
  '上述条目保留调查中需要解释的规则。0.3已按官方勘误修正#55，并补全选举取得momentum；#2／#15原子替换、#12并列和#68非正差值的当前解释详见[前批说明](batch-1-82.md)。#121英文原牌数量与#135通则交互的当前解释见[衰落时代说明](batch-113-151.md)。',
  '',
  '## 逐牌范围',
];
for (const era of ['crisis', 'golden', 'decline'] as const) {
  lines.push(
    '',
    `### ${eraNames[era]}`,
    '',
    '| faceId / 名称 | 效果范围摘要 | 能力需求 | 牌面 |',
    '| --- | --- | --- | --- |',
  );
  for (const card of CARD_SURVEY.filter((c) => c.era === era)) {
    lines.push(
      `| ${card.faceId} ${cell(card.name)} | ${cell(card.summary)} | ${card.capabilities.map((c) => CAPABILITIES[c].name).join('、')} | [原图](../public${card.sourceImage}) |`,
    );
  }
}
lines.push('');
mkdirSync(new URL('artifacts/', root), { recursive: true });
writeFileSync(new URL('docs/card-scope.md', root), lines.join('\n'));
writeFileSync(
  new URL('artifacts/card-scope-report.json', root),
  JSON.stringify(
    {
      version: 1,
      scope: 'requirements-survey-not-execution-coverage',
      ...report,
      cards: CARD_SURVEY,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `Survey: ${report.events} events, ${report.electionFaces} election faces, ${report.capabilities.length} capabilities. Wrote docs/card-scope.md and artifacts/card-scope-report.json.`,
);
