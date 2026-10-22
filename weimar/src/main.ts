import './style.css';
import './ui/tabletop.css';
import './ui/player-mats.css';
import './ui/table-shell.css';
import {
  GameSession,
  legalActions,
  legalParliamentaryActions,
  previewElection,
  FACTIONS,
} from './engine/index.ts';
import type { Action, Command, Faction, ScenarioId } from './engine/index.ts';
import { active, dominance, piecesAt, supremacy, isUnit } from './engine/rules.ts';
import { unitLabel } from './engine/units.ts';
import { CARDS, CARD, IMPLEMENTED_CARDS } from './data/cards.ts';
import { SPACES, SPACE, REGIONS, REGION_NAMES } from './data/board.ts';
import { ACTION_LABELS } from './engine/actions.ts';
import { seatsUsesRemaining } from './engine/policies.ts';
import { SCENARIOS } from './engine/scenarios.ts';
import { steamPanel } from './multiplayer/panel.ts';
import type { DesktopStatus, LobbySummary } from './multiplayer/protocol.ts';
import { actionSpace, tabletop, selectedSpacePanel } from './ui/tabletop.ts';

import { playerMatDetail } from './ui/player-mats.ts';
import { cardCollections, cardPage, handRail, playerRail } from './ui/table-shell.ts';

const KEY = 'weimar-session-v7';
const PREVIOUS_KEYS = [
  'weimar-session-v6',
  'weimar-session-v5',
  'weimar-session-v4',
  'weimar-session-v3',
];
const LEGACY_KEY = 'weimar-tutorial-session-v1';
const NAMES: Record<Faction, string> = {
  Coalition: '民主联盟',
  KPD: '德国共产党',
  NSDAP: '国家社会主义工人党',
  RC: '激进保守派',
};
const PHASES = {
  order: '年度顺序',
  action: '阵营行动',
  'sudden-victory': '即时胜利检查',
  election: '选举',
  timeline: '推进时间轴',
  upkeep: '年末与时代结算',
  finished: '对局结束',
};
const app = document.querySelector<HTMLDivElement>('#app')!;
let desktop: DesktopStatus | null = null;
let lobbyResults: LobbySummary[] = [];
let networkBusy = false;
const networkView = () => desktop?.snapshot?.view;
const gameState = () => networkView()?.state ?? session.state;
let session = new GameSession({ scenario: 'fate' }),
  tab: 'board' | 'map' | 'catalog' | 'coverage' = 'map',
  selectedSpace = 'Berlin',
  selectedCard = '',
  actionKind: Action['kind'] = 'gain-momentum',
  pcRegion = 'Berlin',
  search = '',
  status = '';
try {
  const saved =
    localStorage.getItem(KEY) ??
    PREVIOUS_KEYS.map((key) => localStorage.getItem(key)).find((save) => save !== null) ??
    localStorage.getItem(LEGACY_KEY);
  if (saved) session = GameSession.import(saved);
  if (saved && !localStorage.getItem(KEY)) status = '已按新版规则尝试恢复旧存档；原始存档仍保留。';
} catch (error) {
  status = `自动恢复未完成：${error instanceof Error ? error.message : '存储不可用'}`;
}
const esc = (v: unknown) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const disabled = (condition: boolean) => (condition ? ' disabled' : '');
const fmtLocation = (loc: string) => SPACE[loc]?.nameZh ?? loc;
const factionBadge = (f: Faction | null) =>
  f ? `<span class="badge ${f}">${esc(f)}</span>` : '<span class="muted">—</span>';
function persist() {
  try {
    localStorage.setItem(KEY, session.export());
  } catch {
    status = '操作成功，但浏览器存储不可用，请导出存档。';
  }
}
function send(c: Command) {
  if (desktop?.lobbyId) {
    const view = networkView();
    if (!view?.canAct || !window.weimarSteam) return;
    void steamAction(() =>
      window.weimarSteam!.request({
        type: 'command',
        revision: view.state.revision,
        command: c,
      }),
    );
    return;
  }
  const r = session.send(c);
  status = r.ok ? '' : r.error;
  if (r.ok) persist();
  render();
}
function bind(id: string, event: string, fn: (e: Event) => void) {
  document.getElementById(id)?.addEventListener(event, fn);
}
function options(values: { value: string; label: string }[], selected = '') {
  return values
    .map(
      (v) =>
        `<option value="${esc(v.value)}"${v.value === selected ? ' selected' : ''}>${esc(v.label)}</option>`,
    )
    .join('');
}
function cardImage(n: number, extra = '') {
  return `<button class="card-image ${extra}" data-card-preview="${n}" title="查看 #${n} ${esc(CARD[n].name)}"><img src="${CARD[n].image}" alt="#${n} ${esc(CARD[n].name)}" loading="lazy" /></button>`;
}

let boardZoom = 1,
  boardFocus = false,
  gameMenuOpen = false,
  boardScroll = { left: 0, top: 0 };
let dockTab = 'action',
  dockOpen = true;
let handCollection = '',
  handPage = 0,
  lastDecision = '';
let previewCard: number | null = null;
let selectedMat: Faction | null = null;
let networkMenuOpen = false;
let selectedTarget = '';
function render() {
  app.classList.toggle('tabletop-focus', boardFocus && tab === 'map');
  const oldBoard = document.getElementById('board-viewport');
  if (oldBoard) boardScroll = { left: oldBoard.scrollLeft, top: oldBoard.scrollTop };
  const online = !!desktop?.lobbyId;
  const view = networkView();
  if (online && !view) {
    app.innerHTML = `<header><h1>WEIMAR <span>Steam联机</span></h1></header>${steamPanel(desktop, lobbyResults, networkBusy)}${status ? `<p role="alert" class="error">${esc(status)}</p>` : ''}`;
    bindSteam();
    return;
  }
  const s = gameState(),
    f = active(s),
    hand = s.hands[f];
  if (!hand.some((c) => c.uid === selectedCard)) selectedCard = hand[0]?.uid ?? '';
  const canAct = s.phase === 'action' && !s.pending;
  const actions = view?.actions ?? legalActions(s);
  const kinds = [...new Set(actions.map((a) => a.action.kind))];
  if (kinds.length && !kinds.includes(actionKind)) {
    actionKind = kinds[0];
  }
  const targets = actions.filter((a) => a.action.kind === actionKind);
  const savedTarget = targets.findIndex((a) => JSON.stringify(a.action) === selectedTarget);
  const targetIndex =
    savedTarget >= 0
      ? savedTarget
      : Math.max(
          0,
          targets.findIndex((a) => actionSpace(a.action) === selectedSpace),
        );
  const pcCards = REGIONS.filter((r) => s.pc[r].owner === f && s.pc[r].available);
  if (!pcCards.includes(pcRegion)) pcRegion = pcCards[0] ?? 'Berlin';
  const pcActions =
    canAct && pcCards.length && !s.turn.pcUsed
      ? view
        ? (view.pcActions[pcRegion] ?? [])
        : legalParliamentaryActions(s, pcRegion)
      : [];
  const election = previewElection(s);
  const extraCards = [
    ...(!s.turn.pcUsed
      ? pcCards.map((r) => ({ value: `pc:${r}`, label: `${REGION_NAMES[r]}议会控制牌` }))
      : []),
    ...(s.seats.owner === f && s.seats.available ? [{ value: 'seats', label: '国会议席牌' }] : []),
  ];
  const actionPairPending =
    ['event-first', 'event-last'].includes(s.turn.mode) && s.turn.actionsLeft === 1;
  const own = view?.factions ?? [s.pending?.actor ?? f];
  const collections = cardCollections(s, own);
  const decision = `${online ? desktop?.lobbyId : 'local'}:${s.year}:${s.half}:${s.phase}:${s.activeIndex}:${s.pending?.actor ?? ''}`;
  if (decision !== lastDecision) {
    dockTab = 'action';
    dockOpen = true;
    if (own.includes(f)) handCollection = f;
    handPage = 0;
    lastDecision = decision;
  }
  if (!collections.some((c) => c.id === handCollection)) handCollection = collections[0].id;
  const shownCards = collections.find((c) => c.id === handCollection)!;
  const pageSize = app.clientHeight < 640 ? 4 : app.clientHeight >= 900 ? 8 : 6;
  handPage = cardPage(shownCards, handPage, pageSize).current;
  const selectHand =
    shownCards.owner === f && (!view || view.canAct) && canAct && s.turn.mode === 'unselected';
  app.innerHTML = `
    <header><div><div class="eyebrow">THE WEIMAR REPUBLIC / GMT</div><h1>WEIMAR <span>魏玛共和国</span></h1></div><div class="version">${online ? 'Steam联机' : '本地热座'} · 开发版 0.13</div></header>
    <div class="utility-bar">${desktop ? `<details id="network-menu" class="network-menu"${networkMenuOpen ? ' open' : ''}><summary>Steam 联机${desktop.snapshot?.room.paused ? ' · 已暂停' : online ? ' · 已连接' : ''}</summary>${steamPanel(desktop, lobbyResults, networkBusy)}</details>` : steamPanel(desktop, lobbyResults, networkBusy)}
    <div class="notice"><strong>三个时代 #1–151 全部牌效已接通</strong> · ${s.scenario ? `${SCENARIOS[s.scenario].name}：${SCENARIOS[s.scenario].startYear}—${SCENARIOS[s.scenario].endYear}，历史布局与剧本规则已接通。${s.scenario === 'black-sun' ? '立场固定务实；事件前置条件仍有效。' : ''}` : session.options.testCard ? '牌效实验局：教程地图＋标准立场，可指定测试牌；不是历史剧本。' : s.demo ? '开发测试局：固定牌序，每方3张。' : '教程布局与53张危机牌库，每方5张，立场按教程固定。'}</div>
    <details id="game-menu" class="game-menu"${online ? ' hidden' : ''}${gameMenuOpen ? ' open' : ''}><summary>对局与存档 <span>剧本 · 牌效实验 · 撤销 · 导入导出</span></summary><div class="toolbar">
      <label>开局<select id="new-mode">${options(
        Object.entries(SCENARIOS).map(([value, scenario]) => ({
          value,
          label: `${scenario.name} · ${scenario.startYear}—${scenario.endYear}`,
        })),
        s.scenario,
      )}<option value="demo"${s.demo && !session.options.testCard ? ' selected' : ''}>开发测试局</option><option value="tutorial"${!s.demo && !s.scenario ? ' selected' : ''}>正式教程牌库</option><option value="cards"${session.options.testCard ? ' selected' : ''}>牌效实验局</option></select></label>
      <label>实验局指定牌<select id="test-card">${options(
        CARDS.filter((c) => c.id <= 151).map((c) => ({
          value: String(c.id),
          label: `#${c.id} ${c.name}`,
        })),
        String(session.options.testCard ?? 30),
      )}</select></label>
      <label><input id="test-prerequisites" type="checkbox"${session.options.testPrerequisites !== false ? ' checked' : ''}/>预置前置事件</label>
      <label>随机种子<input id="new-seed" type="number" min="0" max="4294967295" value="${s.seed}" /></label><button id="new-game">新建对局</button>
      <div class="toolbar-spacer"></div><button id="undo"${disabled(!session.commands.length)}>撤销</button><button id="redo"${disabled(!session.redoCommands.length)}>重做</button><button id="export">导出存档</button><button id="import">导入存档</button><input id="import-file" hidden type="file" accept=".json,application/json" />
    </div></details></div>
    ${status ? `<div role="alert" class="error">${esc(status)}</div>` : ''}
    <div class="timeline"><div><strong>${s.year}</strong> / ${s.half === 'early' ? '上半年' : '下半年'} <span class="pill">${s.year <= 1923 ? '危机时代' : s.year <= 1929 ? '黄金时代' : '衰落时代'}</span></div><div class="steps">${Object.entries(
      PHASES,
    )
      .filter(([p]) => p !== 'finished')
      .map(([p, n]) => `<span class="${s.phase === p ? 'current' : ''}">${n}</span>`)
      .join('<i>→</i>')}</div><div>牌堆 ${view?.deckCount ?? s.deck.length} · 弃牌 ${s.discard.length}</div><div>momentum ${factionBadge(s.momentum)}</div></div>
    <main class="game-table">${handRail(collections, handCollection, handPage, pageSize, selectedCard, selectHand)}<section class="table-center"><div class="workspace"><nav>${[
      ['map', '棋盘'],
      ['board', '地区明细'],
      ['catalog', '卡牌库'],
      ['coverage', '实现范围'],
    ]
      .map(
        ([k, n]) =>
          `<button data-tab="${k}" class="${tab === k ? 'selected' : ''}">${n}${k === 'catalog' ? ` <small>${CARDS.length}</small>` : ''}</button>`,
      )
      .join('')}</nav>
    <div class="workspace-body">${
      tab === 'board'
        ? boardView()
        : tab === 'map'
          ? tabletop(
              s,
              selectedSpace,
              targets.map((a) => a.action),
              boardZoom,
              boardFocus,
            )
          : tab === 'catalog'
            ? catalogView()
            : coverageView()
    }</div></div>
    <section class="action-dock${dockOpen ? '' : ' is-collapsed'}" aria-label="行动与局面详情">
      <div class="dock-heading"><div class="dock-tabs" role="group" aria-label="操作面板">${[
        ['action', s.pending ? '待处理选择' : '行动'],
        ['space', '地区'],
        ['parliament', '议会'],
        ['combat', '战斗'],
        ['log', '记录'],
      ]
        .map(
          ([id, label]) =>
            `<button data-dock-tab="${id}" aria-pressed="${dockTab === id}" class="${dockTab === id ? 'selected' : ''}">${label}</button>`,
        )
        .join(
          '',
        )}</div><span class="dock-status">${s.pending ? `${s.pending.actor} 选择中` : s.phase === 'action' ? `${f} · 剩余 ${s.turn.actionsLeft} 行动` : PHASES[s.phase]}</span><div class="dock-tools"><button data-scroll-target=".dock-page:not([hidden])" data-scroll-direction="-1" aria-label="面板向上翻页">↑</button><button data-scroll-target=".dock-page:not([hidden])" data-scroll-direction="1" aria-label="面板向下翻页">↓</button><button id="dock-toggle" aria-expanded="${dockOpen}">${dockOpen ? '收起' : '展开'}</button></div></div>
      <div class="dock-content"${dockOpen ? '' : ' hidden'}>
        <section class="dock-page" data-dock-page="action"${dockTab === 'action' ? '' : ' hidden'}>    <aside id="turn-controls" class="controls"><h2>${s.pending ? '待处理选择' : s.phase === 'action' ? `${f} 的回合` : PHASES[s.phase]}</h2>
    ${
      s.winner
        ? `<div class="winner">${factionBadge(s.winner)}<h3>获胜</h3><p>${esc(s.winReason)}</p></div>`
        : view && !view.canAct
          ? `<p>${desktop?.snapshot?.room.paused ? '对局暂停，等待断线玩家重新加入。' : `等待 ${esc(view.decisionActor)} 操作。`}</p>`
          : s.pending
            ? `<div class="choice"><div>由 ${factionBadge(s.pending.actor)} 决定</div><p>${esc(s.pending.prompt)}</p><select id="choice-option" aria-label="待处理选项">${options(s.pending.options.map((o) => ({ value: o.id, label: o.label })))}</select><button id="resolve-choice" class="primary">确认选择</button></div>`
            : s.phase === 'order'
              ? `
      <p>由 ${factionBadge(s.momentum)} 设置本年顺序。</p><div class="order-fields">${s.order
        .map(
          (x, i) =>
            `<label>第${i + 1}位<select id="order-${i}">${options(
              FACTIONS.map((value) => ({ value, label: value })),
              x,
            )}</select></label>`,
        )
        .join(
          '',
        )}</div><button id="set-order" class="primary">${s.eraChange ? '确定顺序，结算留牌惩罚' : '确定顺序，开始行动'}</button>`
              : s.phase === 'action'
                ? `
      <p class="muted">每方选择1次行动、事件＋2次行动，或跳过。两个行动须连续完成。</p>
      ${
        s.turn.mode === 'unselected'
          ? `<label>事件牌<select id="event-card">${options(
              hand.map((c) => ({
                value: c.uid,
                label: `#${c.card} ${CARD[c.card].name}${CARD[c.card].status === 'pending' ? ' · 待实现' : ''}`,
              })),
              selectedCard,
            )}</select></label><div class="button-grid"><button id="single">只做1次行动</button><button id="event-first"${disabled(!selectedCard || CARD[hand.find((c) => c.uid === selectedCard)!.card].status === 'pending')}>先事件，后2行动</button><button id="event-last"${disabled(!selectedCard || CARD[hand.find((c) => c.uid === selectedCard)!.card].status === 'pending')}>先2行动，后事件</button><button id="pass">跳过</button><button id="pass-draw"${disabled(!selectedCard || !(view?.deckCount ?? s.deck.length) || CARD[hand.find((c) => c.uid === selectedCard)!.card].mandatory || CARD[hand.find((c) => c.uid === selectedCard)!.card].election)}>跳过并换所选牌</button></div>`
          : `
      <div class="action-budget">剩余行动 <strong>${s.turn.actionsLeft}</strong><small>${s.turn.mode === 'single' ? '单行动' : s.turn.mode === 'pass' ? '已跳过' : s.turn.eventDone ? '事件已处理' : '事件将在行动后打出'}</small></div>
      ${
        s.turn.actionsLeft
          ? `<label>行动<select id="action-kind">${options(
              kinds.map((k) => ({ value: k, label: ACTION_LABELS[k] })),
              actionKind,
            )}</select></label><label>合法目标<select id="action-target">${options(
              targets.map((a, i) => ({ value: String(i), label: a.label })),
              String(targetIndex),
            )}</select></label><button id="execute-action" class="primary"${disabled(!targets.length)}>执行行动</button>`
          : ''
      }
      ${s.turn.mode === 'event-last' && !s.turn.eventDone && s.turn.actionsLeft === 0 ? '<button id="play-event" class="primary">打出承诺的事件牌</button>' : ''}
      <button id="end-turn"${disabled(s.turn.actionsLeft > 0 || (['event-first', 'event-last'].includes(s.turn.mode) && !s.turn.eventDone))}>结束本阵营回合</button>`
      }
`
                : s.phase === 'election'
                  ? `
      <p>地区计票后进行全国选举。${s.scenarioEnding ? '这是终局选举，按本剧本的全国选举胜利规则决定赢家。' : '联盟胜出则继续，其他阵营胜出则游戏结束。'}</p><div class="pv-list">${FACTIONS.map((x) => `<span>${x}<b>${election.totals[x]}</b></span>`).join('')}</div>
      <label>${s.momentum} 可转让PV<select id="transfer-to"><option value="">不转让</option>${options(FACTIONS.filter((x) => x !== s.momentum).map((value) => ({ value, label: value })))}</select></label><input id="transfer-amount" type="number" min="0" max="${Math.max(0, Math.floor(election.totals[s.momentum] / 2))}" value="0" /><button id="advance" class="primary">结算选举</button>`
                  : `
      ${s.phase === 'timeline' && s.tracks.economy === 1 ? `<label>恶性通胀：移除联盟影响力<select id="inflation-space">${options(SPACES.filter((p) => s.influence[p.id].Coalition > 0).map((p) => ({ value: p.id, label: p.nameZh })))}</select></label>` : ''}
      <p>${s.phase === 'sudden-victory' ? '按当前行动顺序检查已放置的即时胜利标记。' : '清除受联盟部队保护地区的暗杀，处理经济并推进半年。'}</p><button id="advance" class="primary">${s.phase === 'timeline' ? '推进半年' : '执行胜利检查'}</button>`
    }
</aside></section>
        <section class="dock-page" data-dock-page="space"${dockTab === 'space' ? '' : ' hidden'}>${selectedSpacePanel(s, selectedSpace)}</section>
        <section class="dock-page" data-dock-page="parliament"${dockTab === 'parliament' ? '' : ' hidden'}><div class="controls parliament-controls">${
          s.phase === 'action' && !s.pending && !s.winner && (!view || view.canAct)
            ? `      ${s.scenario === 'revolution' ? `<section class="extra-election"><p>额外选举：${s.extraElectionPending ? '已预约本轮选举' : s.extraElectionUsed ? '本局机会已使用' : '全局可用一次，由momentum消耗一张议会或议席牌召开'}</p>${!s.extraElectionUsed ? `<label>额外选举用牌<select id="extra-card">${options(extraCards)}</select></label><button id="call-extra-election"${disabled(f !== s.momentum || !extraCards.length || actionPairPending)}>消耗所选牌，预约额外选举</button>` : ''}</section>` : ''}
      <p>第48条：${s.article48Removed ? '永久移除' : s.article48 ? '可用' : '已消耗'}；符合条件时会自动询问联盟。</p><button id="play-seats"${disabled(s.seats.owner !== f || seatsUsesRemaining(s) === 0)}>使用国会议席（${s.seats.owner ?? '无人持有'} · 剩余${seatsUsesRemaining(s)}次）</button>
      ${
        pcCards.length && !s.turn.pcUsed
          ? `<label>议会控制牌<select id="pc-region">${options(
              pcCards.map((value) => ({ value, label: REGION_NAMES[value] })),
              pcRegion,
            )}</select></label><label>奖励行动<select id="pc-action"><option value="none">不执行奖励行动，仅清场</option>${options(pcActions.map((a, i) => ({ value: String(i), label: a.label })))}</select></label><label>可选移除改革<select id="pc-reform"><option value="">不移除改革</option>${options(s.pieces.filter((p) => p.kind === 'reform' && SPACE[p.location]?.region === pcRegion).map((p) => ({ value: p.id, label: fmtLocation(p.location) })))}</select></label><button id="play-pc">使用议会控制牌</button>`
          : '<p class="muted">没有可用议会牌，或本回合已使用。</p>'
      }`
            : '<p>当前没有可执行的议会操作。</p>'
        }</div></section>
        <section class="dock-page" data-dock-page="combat"${dockTab === 'combat' ? '' : ' hidden'}>${combatView() || '<p>尚无突击记录。</p>'}</section>
        <section class="dock-page" data-dock-page="log"${dockTab === 'log' ? '' : ' hidden'}>      <section class="event-log"><h3>行动记录 <small>${s.log.length}</small></h3><ol>${s.log
          .slice(-16)
          .reverse()
          .map((l) => `<li><small>${l.n}</small>${esc(l.text)}</li>`)
          .join('')}</ol></section>
</section>
      </div>
    </section></section>${playerRail(s, online ? own : [], view?.handCounts)}</main>
    <dialog id="mat-dialog" class="mat-dialog"><div class="dialog-top"><strong>${selectedMat ? NAMES[selectedMat] : ''} · 原版玩家面板</strong><div><button data-scroll-target="#mat-dialog .mat-inventory" data-scroll-direction="-1" aria-label="库存向上翻页">↑</button><button data-scroll-target="#mat-dialog .mat-inventory" data-scroll-direction="1" aria-label="库存向下翻页">↓</button><button id="close-mat" aria-label="关闭玩家面板">关闭 ×</button></div></div>${selectedMat ? playerMatDetail(s, selectedMat) : ''}</dialog>
    <dialog id="card-dialog"><div class="dialog-top"><span id="card-title"></span><button id="close-dialog" aria-label="关闭牌面">关闭 ×</button></div><img id="card-large" alt="放大牌面" /><p id="card-summary"></p></dialog>
  `;
  bindSteam();
  document.querySelectorAll<HTMLButtonElement>('[data-open-mat]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedMat = button.dataset.openMat as Faction;
      previewCard = null;
      render();
    });
  });
  const matDialog = document.getElementById('mat-dialog') as HTMLDialogElement;
  if (selectedMat) matDialog.showModal();
  bind('close-mat', 'click', () => {
    selectedMat = null;
    matDialog.close();
  });
  bind('mat-dialog', 'cancel', () => {
    selectedMat = null;
  });
  document.querySelectorAll<HTMLButtonElement>('[data-hand-collection]').forEach((button) => {
    button.addEventListener('click', () => {
      handCollection = button.dataset.handCollection!;
      handPage = 0;
      render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-hand-select]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!selectHand || !hand.some((c) => c.uid === button.dataset.handSelect)) return;
      selectedCard = button.dataset.handSelect!;
      dockTab = 'action';
      dockOpen = true;
      render();
    });
  });
  bind('hand-prev', 'click', () => {
    handPage--;
    render();
  });
  bind('hand-next', 'click', () => {
    handPage++;
    render();
  });
  document.querySelectorAll<HTMLButtonElement>('[data-dock-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      dockTab = button.dataset.dockTab!;
      dockOpen = true;
      render();
    });
  });
  bind('dock-toggle', 'click', () => {
    dockOpen = !dockOpen;
    render();
  });
  document.querySelectorAll<HTMLButtonElement>('[data-scroll-target]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = document.querySelector<HTMLElement>(button.dataset.scrollTarget!);
      target?.scrollBy({
        top: Number(button.dataset.scrollDirection) * target.clientHeight * 0.8,
        behavior: 'smooth',
      });
    });
  });
  bind('game-menu', 'toggle', (event) => {
    gameMenuOpen = (event.target as HTMLDetailsElement).open;
  });
  bind('network-menu', 'toggle', (event) => {
    networkMenuOpen = (event.target as HTMLDetailsElement).open;
  });
  const boardViewport = document.getElementById('board-viewport');
  if (boardViewport) {
    boardViewport.scrollLeft = boardScroll.left;
    boardViewport.scrollTop = boardScroll.top;
  }
  document.querySelectorAll<HTMLButtonElement>('[data-board-pan]').forEach((button) => {
    button.addEventListener('click', () => {
      const area = document.getElementById('board-viewport')!;
      const [x, y] = button.dataset.boardPan!.split(',').map(Number);
      area.scrollBy({
        left: x * area.clientWidth * 0.6,
        top: y * area.clientHeight * 0.6,
        behavior: 'smooth',
      });
    });
  });
  bind('board-zoom-in', 'click', () => {
    boardZoom = Math.min(2.5, boardZoom + 0.25);
    render();
  });
  bind('board-zoom-out', 'click', () => {
    boardZoom = Math.max(1, boardZoom - 0.25);
    render();
  });
  bind('board-fit', 'click', () => {
    boardZoom = 1;
    render();
    document.getElementById('board-viewport')?.scrollTo(0, 0);
  });
  bind('board-focus', 'click', () => {
    boardFocus = !boardFocus;
    render();
    window.scrollTo(0, 0);
  });
  bind('action-target', 'change', () => {
    const target = targets[Number(value('action-target'))];
    if (target) {
      selectedTarget = JSON.stringify(target.action);
      selectedSpace = actionSpace(target.action) ?? selectedSpace;
      render();
    }
  });
  bind('new-game', 'click', () => {
    if (online) return;
    try {
      const mode = value('new-mode');
      session = new GameSession({
        seed: Number(value('new-seed')),
        demo: !['tutorial', ...Object.keys(SCENARIOS)].includes(mode),
        ...(Object.hasOwn(SCENARIOS, mode) ? { scenario: mode as ScenarioId } : {}),
        ...(value('new-mode') === 'cards'
          ? {
              testCard: Number(value('test-card')),
              testPrerequisites: (document.getElementById('test-prerequisites') as HTMLInputElement)
                .checked,
            }
          : {}),
      });
      selectedCard = '';
      status = '';
      persist();
      render();
    } catch (e) {
      status = String(e);
      render();
    }
  });
  bind('undo', 'click', () => {
    if (online) return;
    session.undo();
    status = '';
    persist();
    render();
  });
  bind('redo', 'click', () => {
    if (online) return;
    session.redo();
    status = '';
    persist();
    render();
  });
  bind('export', 'click', () => {
    if (online) return;
    const url = URL.createObjectURL(new Blob([session.export()], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `weimar-${s.year}-${s.half}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  bind('import', 'click', () => document.getElementById('import-file')?.click());
  bind('import-file', 'change', async (e) => {
    if (online) return;
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      session = GameSession.import(await file.text());
      status = '';
      persist();
    } catch (error) {
      status = String(error);
    }
    render();
  });
  bind('set-order', 'click', () =>
    send({
      type: 'set-order',
      actor: s.momentum,
      order: [0, 1, 2, 3].map((i) => value(`order-${i}`) as Faction),
    }),
  );
  bind('resolve-choice', 'click', () =>
    send({ type: 'choose', actor: s.pending!.actor, option: value('choice-option') }),
  );
  bind('event-card', 'change', () => {
    selectedCard = value('event-card');
    render();
  });
  for (const mode of ['single', 'event-first', 'event-last'] as const)
    bind(mode, 'click', () =>
      send({
        type: 'begin-turn',
        actor: f,
        mode,
        cardUid: mode === 'single' ? undefined : selectedCard,
      }),
    );
  bind('pass', 'click', () => send({ type: 'pass', actor: f }));
  bind('pass-draw', 'click', () => send({ type: 'pass', actor: f, discardUid: selectedCard }));
  bind('action-kind', 'change', () => {
    actionKind = value('action-kind') as Action['kind'];
    selectedTarget = '';
    render();
  });
  bind('execute-action', 'click', () => {
    const a = targets[Number(value('action-target'))];
    if (a) send({ type: 'action', actor: f, action: a.action });
  });
  bind('play-event', 'click', () => send({ type: 'play-event', actor: f }));
  bind('end-turn', 'click', () => send({ type: 'end-turn', actor: f }));
  bind('call-extra-election', 'click', () => {
    const card = value('extra-card');
    send(
      card === 'seats'
        ? { type: 'call-extra-election', actor: f, card: 'seats' }
        : { type: 'call-extra-election', actor: f, card: 'pc', region: card.slice(3) },
    );
  });
  bind('play-seats', 'click', () => send({ type: 'play-seats', actor: f }));
  bind('pc-region', 'change', () => {
    pcRegion = value('pc-region');
    render();
  });
  bind('play-pc', 'click', () => {
    const a = value('pc-action');
    send({
      type: 'play-pc',
      actor: f,
      region: pcRegion,
      action: a === 'none' ? undefined : pcActions[Number(a)]?.action,
      removeReform: value('pc-reform') || undefined,
    });
  });
  bind('advance', 'click', () =>
    send({
      type: 'advance',
      actor: s.momentum,
      transfer: value('transfer-to')
        ? { to: value('transfer-to') as Faction, amount: Number(value('transfer-amount')) }
        : undefined,
      inflationSpace: value('inflation-space') || undefined,
    }),
  );
  document.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) =>
    b.addEventListener('click', () => {
      tab = b.dataset.tab as typeof tab;
      render();
    }),
  );
  document.querySelectorAll<HTMLElement>('[data-space]').forEach((b) => {
    const select = () => {
      selectedSpace = b.dataset.space!;
      selectedTarget = '';
      if (targets.some((a) => actionSpace(a.action) === selectedSpace)) dockTab = 'action';
      else if (!s.pending) dockTab = 'space';
      dockOpen = true;
      render();
    };
    b.addEventListener('click', select);
    b.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        select();
      }
    });
  });
  document.querySelectorAll<HTMLElement>('[data-card-preview]').forEach((b) => {
    const openCard = () => {
      previewCard = Number(b.dataset.cardPreview);
      const c = CARD[previewCard];
      (document.getElementById('card-large') as HTMLImageElement).src = c.image;
      document.getElementById('card-title')!.textContent = `#${c.id} ${c.name}`;
      document.getElementById('card-summary')!.textContent =
        `${c.status === 'implemented' ? '已实现' : '待实现'} · ${c.summary}`;
      (document.getElementById('card-dialog') as HTMLDialogElement).showModal();
    };
    b.addEventListener('click', openCard);
    if (b.namespaceURI === 'http://www.w3.org/2000/svg')
      b.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openCard();
        }
      });
  });
  bind('close-dialog', 'click', () => {
    previewCard = null;
    (document.getElementById('card-dialog') as HTMLDialogElement).close();
  });
  bind('card-dialog', 'cancel', () => {
    previewCard = null;
  });
  if (previewCard !== null) {
    const c = CARD[previewCard];
    (document.getElementById('card-large') as HTMLImageElement).src = c.image;
    document.getElementById('card-title')!.textContent = `#${c.id} ${c.name}`;
    document.getElementById('card-summary')!.textContent = c.summary;
    (document.getElementById('card-dialog') as HTMLDialogElement).showModal();
  }
  bind('card-search', 'input', () => {
    const el = document.getElementById('card-search') as HTMLInputElement;
    search = el.value;
    const pos = el.selectionStart;
    render();
    const next = document.getElementById('card-search') as HTMLInputElement;
    next.focus();
    next.setSelectionRange(pos, pos);
  });
}
function value(id: string) {
  return (document.getElementById(id) as HTMLInputElement | null)?.value ?? '';
}
function boardView() {
  const s = gameState(),
    sp = SPACE[selectedSpace];
  return `<div class="space-detail"><strong>${sp.nameZh}</strong><small>${esc(sp.name)}</small><span>人口 ${sp.population} · PV ${sp.politicalValue}</span><span>邻接：${sp.adjacent.map((x) => SPACE[x].nameZh).join('、')}</span><p>${
    piecesAt(s, sp.id)
      .map((p) =>
        isUnit(p) ? unitLabel(p) : `${p.owner ?? ''} ${p.kind}${p.side ? ' / ' + p.side : ''}`,
      )
      .join('；') || '无部队及标记'
  }</p></div>
    <div class="table-scroll"><table><thead><tr><th>地区</th><th>人口</th><th>联盟</th><th>KPD</th><th>NSDAP</th><th>RC</th><th>PV</th><th>领导权</th><th>军事优势</th><th>议会</th></tr></thead><tbody>${SPACES.map((p) => `<tr data-space="${esc(p.id)}" class="${p.id === selectedSpace ? 'selected-row' : ''}" tabindex="0"><td><strong>${p.nameZh}</strong><small>${REGION_NAMES[p.region]}</small></td><td>${Object.values(s.influence[p.id]).reduce((a, b) => a + b, 0)}/${p.population}</td>${FACTIONS.map((f) => `<td><span class="cube ${f} ${s.influence[p.id][f] ? '' : 'zero'}">${s.influence[p.id][f]}</span></td>`).join('')}<td>${p.politicalValue}</td><td>${factionBadge(dominance(s, p.id))}</td><td>${factionBadge(supremacy(s, p.id))}</td><td>${factionBadge(s.pc[p.region].owner)}</td></tr>`).join('')}</tbody></table></div>`;
}
function catalogView() {
  const filtered = CARDS.filter((c) =>
    `${c.id} ${c.name} ${c.title} ${c.status === 'implemented' ? '已实现' : '待实现'}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return `<div class="catalog-header"><input id="card-search" type="search" placeholder="搜索编号、名称或“已实现”" value="${esc(search)}" aria-label="搜索卡牌" /><span>${filtered.length} 张牌面 / ${IMPLEMENTED_CARDS.length} 种已实现</span></div><div class="catalog">${filtered.map((c) => `<article>${cardImage(c.id)}<strong>#${c.id} ${esc(c.name)}</strong><small class="${c.status === 'implemented' ? 'supported' : ''}">${c.status === 'implemented' ? '已实现' : '待实现'} · ${c.era}${c.mandatory ? ' · 强制' : ''}</small></article>`).join('')}</div>`;
}
function coverageView() {
  return `<div class="coverage"><h2>三个时代全部牌效</h2><p>已实现危机时代 #1–52、黄金时代 #53–112、衰落时代 #113–151，另含3种选举牌面。共151个事件、154种可执行牌面。</p><h3>衰落时代能力</h3><ul><li>#117 提前选举：更新地区控制、国会议席及胜利结果，联盟胜出后回到当前回合，保留本轮已预约的普通选举。</li><li>#118 即时胜利；#122／132／146 按当前局面计算PV，不改变议会控制。</li><li>#119 永久移除第48条；#124 右翼国会议席每次选举周期可使用两次。</li><li>杠杆和影响力替换；#137 按实际移除SA的不同地区逐一给予补偿。</li><li>事件授予行动复用基础行动规则；跨阵营选择、战斗与归还结算后继续原流程。</li><li>流程中途可保存、撤销、重做和刷新重放；保留旧版自动存档。</li></ul><h3>如何测试</h3><p>顶部选择“牌效实验局”，选择 #1–151 的指定牌并新建对局。测试牌放在联盟手牌首位；可勾选预置前置事件。该模式使用教程地图和标准立场，用于牌效验证。黄金牌从1924年、衰落牌从1930年开始；测试事件时请选择允许第48条询问中的事件结算。</p><h3>规则口径</h3><p>#121 按英文原牌，在NSDAP持有momentum时移除2个不同地区各1个影响力，否则3个地区。#135 按6.0通则顺序执行：在巴伐利亚实际移除NSDAP影响力后，本行动步骤不能再在同地放置RC影响力。</p><h3>完整战役</h3><p>“共和国的命运”按9.6从1919年开始，每方7张危机牌。1924年发9张黄金牌、1930年发6张衰落牌，均扣除留牌惩罚。换时代由新年度顺序结算；1933年终按官方勘误对所有阵营结算留牌，再决定联盟直接胜利或最终选举。实体牌库共159张：151张事件、1／3／4张各时代选举牌。</p><h3>历史剧本</h3><p>革命时代：1919—1923，含全局一次额外选举与终局军事优势等PV修正。新希望：1924—1933独立历史布局。黑日升起：1928—1933，预置#54、#57及3张随机持续事件，移除其他黄金持续牌和选举牌，立场固定务实且保留事件前置。三个剧本均接通各自终局。</p><h3>后续范围</h3><ul><li>Steam Lobby与房主权威同步已接通；真实Steam双机验收见联机说明。</li><li>机器人暂缓，正式UI待优化。</li></ul><p>教程模式按9.2固定立场并忽略卡牌前置。牌效实验局不是正式历史剧本，尚不执行完整时代切换。</p></div>`;
}
function combatView() {
  const c = gameState().combat ?? gameState().lastCombat;
  if (!c) return '';
  const ongoing = !!gameState().combat;
  return `<section class="combat-panel" aria-label="突击状态"><h3>${ongoing ? '正在突击' : '最近一次突击'} · ${esc(SPACE[c.space].nameZh)}</h3><p>${factionBadge(c.attacker)} → ${factionBadge(c.defender)} ${c.free ? ' · 免费突击' : ''}</p><p>${esc(c.stage)}</p>${c.dice.attacker ? `<div class="combat-results">${(['attacker', 'defender'] as const).map((side) => `<div><strong>${c[side]}</strong><span>强度 ${c.strength[side]} − 骰子 ${c.dice[side]} = <b>${c.hits[side]} 命中</b></span></div>`).join('')}</div>` : ''}<small>已移除 ${c.casualties.length} 个部队／罢工标记${c.ignored.length ? ` · ${c.ignored.length} 支国防军拒战` : ''}</small></section>`;
}
async function steamAction(action: () => Promise<unknown>) {
  if (networkBusy) return;
  networkBusy = true;
  status = '';
  render();
  try {
    await action();
  } catch (error) {
    status = error instanceof Error ? error.message : String(error);
  } finally {
    networkBusy = false;
    render();
  }
}
function bindSteam() {
  const bridge = window.weimarSteam;
  if (!bridge) return;
  const room = desktop?.snapshot?.room;
  bind('steam-create', 'click', () => {
    const scenario = value('steam-scenario') as ScenarioId;
    void steamAction(() => bridge.create(scenario));
  });
  bind('steam-resume', 'click', () => void steamAction(() => bridge.resume()));
  bind('steam-import', 'click', () => document.getElementById('steam-save-file')?.click());
  bind('steam-save-file', 'change', (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) void steamAction(async () => bridge.resume(await file.text()));
  });
  bind('steam-join', 'click', () => {
    const id = value('steam-lobby-id').trim();
    void steamAction(() => bridge.join(id));
  });
  bind(
    'steam-list',
    'click',
    () =>
      void steamAction(async () => {
        lobbyResults = await bridge.list();
        if (!lobbyResults.length) status = '没有同版本公开房间；好友房间请通过邀请或房间ID加入。';
      }),
  );
  bind('steam-leave', 'click', () => void steamAction(() => bridge.leave()));
  bind('steam-invite', 'click', () => void steamAction(() => bridge.invite()));
  bind('steam-start', 'click', () => void steamAction(() => bridge.request({ type: 'start' })));
  bind(
    'steam-ready',
    'click',
    () =>
      void steamAction(() =>
        bridge.request({
          type: 'ready',
          ready: !room?.ready.includes(desktop!.self!.id),
        }),
      ),
  );
  document.querySelectorAll<HTMLElement>('[data-steam-seat]').forEach((button) =>
    button.addEventListener(
      'click',
      () =>
        void steamAction(() =>
          bridge.request({
            type: 'seat',
            faction: button.dataset.steamSeat as Faction,
            claim: button.dataset.claim === 'true',
          }),
        ),
    ),
  );
  document
    .querySelectorAll<HTMLElement>('[data-steam-join]')
    .forEach((button) =>
      button.addEventListener(
        'click',
        () => void steamAction(() => bridge.join(button.dataset.steamJoin!)),
      ),
    );
  bind(
    'steam-export',
    'click',
    () =>
      void steamAction(async () => {
        const text = await bridge.exportSave();
        const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'weimar-steam-host.json';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }),
  );
}

let resizeTimer = 0;
window.addEventListener('resize', () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(render, 100);
});
render();
if (window.weimarSteam) {
  window.weimarSteam.subscribe((next) => {
    desktop = next;
    render();
  });
  void window.weimarSteam.status().then((next) => {
    desktop = next;
    render();
  });
}
