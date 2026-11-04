// Compatibility facade for the room API. Admission is shared with engine/UI.
import {currentActor} from './phase-state.js';
import {setupPending,roomActionIssue} from './action-policy.js';
export {SEATS,SETUP_ACTIONS,MANUAL_ACTIONS,setupPending,manualWindow} from './action-policy.js';
export const roomActor=currentActor;
export function canAct(s,seat){return !!seat&&(setupPending(s.players[seat])||currentActor(s)===seat);}
export function assertRoomAction(s,seat,a){const reason=roomActionIssue(s,seat,a);if(reason)throw Error(reason);}
