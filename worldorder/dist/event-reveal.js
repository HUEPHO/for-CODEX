export function eventRevealKind(before,after){
 const old=before.flow?.eventResolution,next=after.flow?.eventResolution;
 const completed=(after.eventHistory||[]).slice((before.eventHistory||[]).length);
 if(old?.mode==='bid'&&old.stage==='bid'&&(next?.cardId!==old.cardId||next?.stage!=='bid'||completed.some(q=>q.cardId===old.cardId)))return 'sealed';
 if(after.eventCountryRandom!==before.eventCountryRandom||next?.agreementRandom!==old?.agreementRandom&&next?.agreementRandom)return 'random';
 if(next?.randomChain&&next.randomChain!==old?.randomChain)return 'random';
 if(completed.some(q=>(q.agreementRandom&&q.agreementRandom!==(q.cardId===old?.cardId?old.agreementRandom:undefined))||(q.randomChain&&q.randomChain!==(q.cardId===old?.cardId?old.randomChain:undefined))))return 'random';
 return null;
}
