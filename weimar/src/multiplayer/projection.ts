import { legalActions, legalParliamentaryActions } from '../engine/legal.ts';
import { active } from '../engine/rules.ts';
import { FACTIONS } from '../engine/types.ts';
import type { Faction, GameState } from '../engine/types.ts';
import type { PlayerView, RoomInfo } from './protocol.ts';

export function decisionActor(s: GameState): Faction {
  return s.pending?.actor ?? (s.phase === 'action' ? active(s) : s.momentum);
}

/** Explicit projection: never serialize a GameSession, seed, continuation or command history. */
export function project(s: GameState, room: RoomInfo, peer: string): PlayerView {
  const factions = FACTIONS.filter((f) => room.seats[f] === peer);
  const owns = (f: Faction) => factions.includes(f);
  const canAct = !room.paused && s.phase !== 'finished' && owns(decisionActor(s));
  const state: GameState = {
    schema: s.schema,
    ruleset: s.ruleset,
    scenario: s.scenario,
    extraElectionUsed: s.extraElectionUsed,
    extraElectionPending: s.extraElectionPending,
    eraChange: s.eraChange,
    lastHeldPenalty: s.lastHeldPenalty,
    stance: s.stance,
    pcLocked: s.pcLocked,
    demo: false,
    // Inert placeholders preserve existing display helpers; they are not the game's seed/RNG.
    seed: 0,
    rng: 0,
    revision: s.revision,
    year: s.year,
    half: s.half,
    phase: s.phase,
    order: s.order,
    activeIndex: s.activeIndex,
    momentum: s.momentum,
    tracks: s.tracks,
    influence: s.influence,
    pieces: s.pieces.map(({ allegiance, ...p }) => (p.revealed ? { ...p, allegiance } : p)),
    hands: {
      Coalition: owns('Coalition') ? s.hands.Coalition : [],
      KPD: owns('KPD') ? s.hands.KPD : [],
      NSDAP: owns('NSDAP') ? s.hands.NSDAP : [],
      RC: owns('RC') ? s.hands.RC : [],
    },
    deck: [],
    discard: s.discard,
    lingering: s.lingering,
    pc: s.pc,
    article48: s.article48,
    article48Removed: s.article48Removed,
    seats: s.seats,
    electionCalled: s.electionCalled,
    electionCard: s.electionCard,
    victoryDeclared: s.victoryDeclared,
    generalStrike: s.generalStrike,
    turn: { ...s.turn, cardUid: owns(active(s)) ? s.turn.cardUid : undefined },
    effects: [],
    pending: s.pending
      ? {
          actor: s.pending.actor,
          prompt: owns(s.pending.actor) ? s.pending.prompt : `等待 ${s.pending.actor} 决定`,
          options: owns(s.pending.actor)
            ? s.pending.options.map(({ id, label }) => ({ id, label, effects: [] }))
            : [],
        }
      : null,
    reveals: s.reveals.filter((r) => owns(r.viewer)),
    lastElection: s.lastElection,
    combat: s.combat,
    lastCombat: s.lastCombat,
    winner: s.winner,
    winReason: s.winReason,
    scenarioEnding: s.scenarioEnding,
    // Engine logs may name draws, stolen cards and private choices. Do not broadcast them.
    log: [
      {
        n: s.revision,
        text: `联机状态 #${s.revision}；${s.year}年${s.half === 'early' ? '上' : '下'}半年，${s.winner ? `${s.winner} 获胜` : `等待 ${decisionActor(s)}`}。`,
      },
    ],
  };
  const pcActions: PlayerView['pcActions'] = {};
  if (canAct && !s.pending && s.phase === 'action' && !s.turn.pcUsed) {
    for (const [region, pc] of Object.entries(s.pc))
      if (pc.owner === active(s) && pc.available)
        pcActions[region] = legalParliamentaryActions(s, region);
  }
  return structuredClone({
    state,
    handCounts: Object.fromEntries(
      FACTIONS.map((f) => [f, s.hands[f].length]),
    ) as PlayerView['handCounts'],
    deckCount: s.deck.length,
    factions,
    canAct,
    decisionActor: decisionActor(s),
    actions: canAct ? legalActions(s) : [],
    pcActions,
  });
}
