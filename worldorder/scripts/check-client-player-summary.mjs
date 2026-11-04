import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState} from '../dist/engine.js';
import {playerView} from '../server/rooms.js';
import {renderClientPlayerSummary} from '../dist/client-player-summary.js';

const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url),'utf8'));
const byId=Object.fromEntries(cards.map(card=>[card.id,card]));
const state=createState(cards,{dd:true,wit:true},()=>.5);
state.players.US.growth=['c74931cfb3833','cd18c8e5a0461','c142f2edba533'];
state.players.CN.money=35;state.players.CN.vp=-2;state.players.CN.prosperity=3;
state.players.CN.focus='外交焦点';state.players.CN.resources=[1,2,3,4,5,6,7];state.players.CN.production=[7,6,5,4,3,2,1];
state.players.CN.objectives=['private-objective'];
const view=playerView(state,'CN'),before=JSON.stringify(view);
const html=renderClientPlayerSummary(view,byId,{viewer:'CN',actor:'RU'});
assert.equal(JSON.stringify(view),before,'Rendering must not mutate the view or switch its operator');
assert.deepEqual([...html.matchAll(/data-client-player="(\w+)"/g)].map(m=>m[1]),['US','EU','RU','CN'],'Three opponents precede the fixed self panel');
assert.match(html,/client-player--CN client-player--self/);
assert.match(html,/client-player--RU client-player--acting/);
assert.doesNotMatch(html,/data-player=|data-command=|data-tray=/,'Viewing a summary must not use a gameplay or seat-switch command');
assert.equal((html.match(/aria-haspopup="dialog"/g)||[]).length,4);
assert.equal((html.match(/data-client-resource=/g)||[]).length,28);
assert.equal((html.match(/data-client-production=/g)||[]).length,28);
assert.match(html,/title="能源库存：1"/);assert.match(html,/title="能源产能：7"/);
assert.match(html,/title="军队库存：7"/);assert.match(html,/title="军队产能：1"/);
assert.match(html,/title="1级发展牌：2张"/);assert.match(html,/title="3级发展牌：1张"/);
assert.match(html,/title="胜利分：-2"/);assert.match(html,/title="繁荣等级：3 \/ 5"/);
assert.match(html,/title="手牌数量：6张"/);assert.match(html,/class="client-player-smart"/);
assert.doesNotMatch(html,/private-objective/);
for(const player of Object.values(view.players)){
 // A real redacted room exposes null arrays. The summary needs only length,
 // even if an inspection effect temporarily reveals the hand's identities.
 player.hand=new Proxy(player.hand,{get(target,key){if(key==='length')return target.length;throw Error('Read private hand identity: '+String(key));}});
 for(const key of ['deck','objectives','objectiveChoices','assetChoices'])Object.defineProperty(player,key,{get(){throw Error('Read private field: '+key);}});
}
assert.equal(renderClientPlayerSummary(view,byId,{viewer:'CN',actor:'RU'}),html);
view.players.EU.growth=[null,null];
assert.match(renderClientPlayerSummary(view,byId,{viewer:'CN'}),/等级未公开或尚未识别：2张/);
view.config.wit=false;
view.players.CN.focus='<img src=x onerror=alert(1)>焦点';
const base=renderClientPlayerSummary(view,byId,{viewer:'CN'});
assert.doesNotMatch(base,/client-player-smart|<img src=x/);
assert.match(base,/&lt;img src=x onerror=alert\(1\)&gt;/);
assert.equal(renderClientPlayerSummary(null,byId),'');
console.log('Client player summary passed: fixed viewing seat, public resources and production, acquired growth levels, real redacted room privacy, WIT visibility, escaped labels, immutable rendering.');
