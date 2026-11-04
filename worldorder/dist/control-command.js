// DOM adapter: identify a control's command without running a game rule.
// New controls may declare data-command instead of adding another permission branch.
const byId={
 'confirm-assets':'chooseAssets','event-submit':'submitEvent','event-ack':'ackEvent','event-postpone':'postponeEvent','event-reward':'resolveEventReward','event-reward-skip':'resolveEventReward','event-reveal':'resolveEventReveal',
 'settle-phase-task':'settlePhaseTask','sequence-resolve':'resolveSequenceStep','sequence-decline':'resolveSequenceStep','sequence-skip-reset':'resolveSequenceStep','sequence-skip':'resolveSequenceStep','sequence-manual':'manualSequence',
 'commit-open-relation':'resolveOpenDiplomacy','skip-open-relation':'skipOpenDiplomacy','skip-battlefield-asset':'finishGrowthAbility','finish-growth-choice':'finishGrowthAbility','continue-extra-card':'continueWithExtraCard',
 'pass-empty':'passTurn','resolve-investments':'resolveInvestments','resolve-threat':'resolveThreat','score-world':'scoreWorld','score-smart':'scoreSmart','improve-prosperity':'resolveProsperity','skip-prosperity':'resolveProsperity',
 'start-research':'startResearch','research-refresh':'researchRefresh','finish-research':'finishResearch','confirm-events':'confirmEvents','confirm-aftermath':'confirmAftermath','next-round':'nextRound','confirm-countries':'confirmCountries','confirm-production':'confirmProduction','confirm-focus':'confirmFocus',
 'end-action':'endAction',draw:'draw',clear:'clearPlayed','refresh-market':'refreshMarket','add-event':'addEvent',phase:'phase',focus:'focus'
};
const byData={incomeEffect:'resolveIncomeEffect',opening:'chooseOpening',assetSelect:'toggleAssetSelection',objectiveSelect:'toggleObjectiveSelection',res:'resource',production:'adjustProduction',eventProsperity:'adjustEventProsperity',commerceIndex:'toggleCommerce',worldOp:'worldInfluence',regionCount:'region',engageDelta:'engageToken',battlefieldAsset:'finishGrowthAbility',keepEvent:'choosePersonalEvent',orderSlot:'chooseOrderSlot',round:'round'};
export function controlCommand({id,dataset={}}){
 const type=dataset.command||dataset.cardAction||byId[id]||Object.entries(byData).find(([key])=>dataset[key]!==undefined)?.[1];
 return type?{type,...(type==='region'?{player:dataset.regionCount}:{}),...(dataset.id?{id:dataset.id,cardId:dataset.id}:{})}:null;
}
