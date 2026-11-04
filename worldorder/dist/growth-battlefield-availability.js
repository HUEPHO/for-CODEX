import {SPECIAL_CARDS} from './special-data.js';
import {battlefieldAssetOwnershipIssue} from './growth-battlefield.js';
import {sequenceEntryIssue} from './sequence-availability.js';

// Full sequence validation belongs at the execution/UI boundary. Keeping it
// out of the battlefield state helpers prevents growth purchase validation
// from importing the basic-action validator through itself.
export function battlefieldAssetIssue(s,id){
 return battlefieldAssetOwnershipIssue(s,id)||sequenceEntryIssue(s,SPECIAL_CARDS[id].steps);
}
