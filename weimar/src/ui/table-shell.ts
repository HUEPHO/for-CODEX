import { CARD } from '../data/cards.ts';
import { active, mcs, supply } from '../engine/rules.ts';
import { previewElection } from '../engine/elections.ts';
import type { CardInstance, Faction, GameState } from '../engine/types.ts';
import { playerMat } from './player-mats.ts';
import { html } from './pieces.ts';

export function playerRail(s: GameState, own: Faction[], handCounts?: Record<Faction, number>) {
  const pv = previewElection(s).totals;
  return `<aside class="player-rail" aria-label="四方原版玩家面板"><div class="rail-heading"><strong>玩家面板</strong><small>点击放大</small></div><div class="player-stack">${s.order
    .map(
      (
        f,
        i,
      ) => `<section class="rail-player ${f}${s.phase === 'action' && active(s) === f ? ' is-active' : ''}" data-player="${f}">
    <div class="rail-player-heading"><strong>${i + 1}. ${f === 'Coalition' ? '民主联盟' : f}</strong><span>${own.includes(f) ? '<b class="own-seat">你</b> ' : ''}${s.phase === 'action' && active(s) === f ? '行动中' : ''}</span></div>
    <button class="mat-preview" data-open-mat="${f}" aria-label="放大${f}原版玩家面板">${playerMat(s, f)}</button>
    <div class="rail-player-stats"><span>手牌 <b>${handCounts?.[f] ?? s.hands[f].length}</b></span><span>支持 <b>${mcs(s, f)}</b></span><span>库存 <b>${supply(s, f)}</b></span><span>PV <b>${pv[f]}</b></span></div>
  </section>`,
    )
    .join('')}</div></aside>`;
}

export interface CardCollection {
  id: string;
  label: string;
  cards: CardInstance[];
  owner?: Faction;
}
/** Only owned hands and explicitly revealed cards may enter the left rail. */
export function cardCollections(s: GameState, own: Faction[]): CardCollection[] {
  return [
    ...own.map((f) => ({
      id: f,
      label: `${f === 'Coalition' ? '联盟' : f}手牌`,
      cards: s.hands[f],
      owner: f,
    })),
    { id: 'lingering', label: '持续事件', cards: s.lingering },
    ...s.reveals
      .filter((r) => own.includes(r.viewer))
      .map((r, i) => ({ id: `reveal-${i}`, label: `查看 ${r.target}`, cards: r.cards })),
  ];
}

export function cardPage(collection: CardCollection, page: number, size: number) {
  const count = Math.max(1, Math.ceil(collection.cards.length / size));
  const current = Math.max(0, Math.min(count - 1, page));
  return { count, current, cards: collection.cards.slice(current * size, (current + 1) * size) };
}

export function handRail(
  collections: CardCollection[],
  selected: string,
  page: number,
  size: number,
  selectedCard: string,
  selectable: boolean,
) {
  const collection = collections.find((c) => c.id === selected)!;
  const result = cardPage(collection, page, size);
  return `<aside class="hand-rail" aria-label="自己的手牌与已知卡牌"><div class="rail-heading"><strong>${collection.owner ? '自己的手牌' : html(collection.label)}</strong><small>${collection.cards.length} 张</small></div>
    <div class="hand-tabs" role="group" aria-label="选择自己的手牌或公开事件">${collections.map((c) => `<button data-hand-collection="${c.id}" aria-pressed="${c.id === selected}"${c.id === selected ? ' class="selected"' : ''}>${html(c.label)} <small>${c.cards.length}</small></button>`).join('')}</div>
    <div class="hand-grid" style="--hand-rows:${size / 2}">${
      result.cards.length
        ? result.cards
            .map(
              (
                c,
              ) => `<article class="rail-card${collection.owner && c.uid === selectedCard ? ' is-selected' : ''}" data-visible-card="${html(c.uid)}">
      <button class="card-image" data-card-preview="${c.card}" aria-label="放大 #${c.card} ${html(CARD[c.card].name)}"><img src="${CARD[c.card].image}" alt="${html(CARD[c.card].name)}" draggable="false"/></button>
      <div class="rail-card-caption"><span title="${html(CARD[c.card].name)}">#${c.card} ${html(CARD[c.card].name)}</span>${selectable && collection.owner ? `<button data-hand-select="${html(c.uid)}" aria-label="选用 #${c.card} ${html(CARD[c.card].name)}" aria-pressed="${c.uid === selectedCard}">${c.uid === selectedCard ? '已选' : '选用'}</button>` : CARD[c.card].mandatory ? '<small>强制</small>' : ''}</div>
    </article>`,
            )
            .join('')
        : '<p class="hand-empty">这里暂时没有卡牌。</p>'
    }</div>
    <div class="hand-pager"><button id="hand-prev" aria-label="上一页手牌"${result.current === 0 ? ' disabled' : ''}>‹</button><span>${result.current + 1} / ${result.count}</span><button id="hand-next" aria-label="下一页手牌"${result.current + 1 === result.count ? ' disabled' : ''}>›</button></div><p class="hand-hint">点牌面放大${selectable ? ' · 选用后在下方出牌' : ''}</p>
  </aside>`;
}
