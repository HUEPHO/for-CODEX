export function eventRevealKind(before,after){
 const old=before.flow?.eventResolution,next=after.flow?.eventResolution;
 if(old?.mode==='bid'&&old.stage==='bid'&&next?.stage!=='bid')return 'sealed';
 if(after.eventCountryRandom!==before.eventCountryRandom||next?.agreementRandom!==old?.agreementRandom&&next?.agreementRandom)return 'random';
 if(next?.randomChain&&next.randomChain!==old?.randomChain)return 'random';
 return null;
}
