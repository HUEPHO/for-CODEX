import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState} from '../dist/engine.js';
import {playerView} from '../server/rooms.js';
import {ECONOMY,FOCUSES,focusOptions,prosperityOffer,resolveFocus} from '../dist/economy.js';
import {COMMERCE,TRADE_LIMITS} from '../dist/commerce.js';
import {tradePreview,applyTrade} from '../dist/trade.js';
import {EFFECT_IDS,grantEventEffect} from '../dist/event-effect-state.js';
import {PLAYER_BOARD_PRINT,PLAYER_BOARD_GEOMETRY,clientPlayerTradeModel,clientPlayerBoardModel,renderClientPrintedBoard,renderClientTradeInfo,renderClientPlayerBoard} from '../dist/client-player-board.js';
import {renderClientPlayerSummary} from '../dist/client-player-summary.js';

const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url),'utf8'));
const byId=Object.fromEntries(cards.map(c=>[c.id,c]));
const state=createState(cards,{dd:true,wit:true},()=>.5),seats=['US','CN','EU','RU'];
for(const owner of seats){
 const print=PLAYER_BOARD_PRINT[owner],economy=ECONOMY[owner];
 for(const key of ['max','upgrade','ready','vp','money'])assert.deepEqual(print[key],economy[key],`${owner}: printed ${key} agrees with the rule data`);
 assert.deepEqual(print.commerce,COMMERCE[owner]);
 assert.equal(print.exports,TRADE_LIMITS[owner].exports);assert.equal(print.imports,TRADE_LIMITS[owner].imports);
 const model=clientPlayerBoardModel(state,owner),html=renderClientPlayerBoard(state,owner,byId);
 assert.equal(model.production.length,7);
 assert.deepEqual(model.production.map(t=>t.value),state.players[owner].production);
 assert.deepEqual(model.production.map(t=>t.max),economy.max);
 assert.equal((html.match(/data-board-production=/g)||[]).length,7);
 assert.equal((html.match(/data-board-focus=/g)||[]).length,3);
 assert.equal((html.match(/data-board-prosperity=/g)||[]).length,6);
 assert.equal((html.match(/data-board-commerce-index=/g)||[]).length,COMMERCE[owner].count);
 assert.doesNotMatch(html,/<button|<input|<select|data-command|data-card-action|仓库|我的手牌/,'The public board is dynamic, read-only and excludes warehouse/private cards');
 const printed=renderClientPrintedBoard(state,owner),trade=renderClientTradeInfo(state,owner);
 assert.match(trade,new RegExp(`src="assets/trade-${owner}\\.webp"`),'Trade agreement retains the original card artwork');
 assert.equal((trade.match(new RegExp(`src="assets/commerce-${owner}-[123]\\.png"`,'g'))||[]).length,COMMERCE[owner].count,'Each ready export card shows the original front');
 assert.match(printed,new RegExp(`src="assets/board-${owner}\\.webp"`),'Use the existing uncopied board image');
 assert.match(printed,/class="printed-board-crop" style="aspect-ratio:1500\/714"/,'Crop below prosperity but above the resource heading, independent of full image height');
 assert.equal((printed.match(/class="printed-production-cube"/g)||[]).length,7);
 assert.equal((printed.match(/class="printed-focus-cylinder"/g)||[]).length,1);
 assert.equal((printed.match(/class="printed-prosperity-ring"/g)||[]).length,1);
 assert.doesNotMatch(printed,/data-board-commerce-index|player-board-trade/,'The upper board can be placed independently from trade');
 assert.doesNotMatch(trade,/data-board-production|printed-board-art/,'Trade can be placed independently from the upper board');
 assert.equal(html,printed+trade,'Existing detail callers retain both public sections');
 for(const focus of model.focuses)assert.equal(focus.ready,focusOptions(owner,focus.name,state.players[owner],state.round).ready);
 assert.deepEqual(model.nextProsperity,prosperityOffer(state.players[owner],owner,state.round));
}

// Consume an actual supplier export card through the trade executor, then
// restore it by actual service production, not by editing the display flags.
state.current='CN';
const originalTrade=clientPlayerTradeModel(state,'US');assert.equal(originalTrade.ready,2);
applyTrade(state,tradePreview(state,{imports:[{key:4,countryQuantity:0,players:{US:1}}]}, {name:'国际贸易'}));
assert.equal(clientPlayerTradeModel(state,'US').ready,1);
assert.equal(clientPlayerTradeModel(state,'US').used,1);
let html=renderClientPlayerBoard(state,'US',byId);
assert.match(html,/data-board-commerce-index="0"[^]*?已使用/);
assert.equal((html.match(/src="assets\/commerce-US-back\.png"/g)||[]).length,1,'An actual player purchase turns one export card to its original back');
assert.match(html,/1 \/ 2 可用/);
assert.match(renderClientPlayerSummary(state,byId,{viewer:'CN'}),/专供出口第1张：已使用/);
state.current='US';
resolveFocus(state,{ready:[],upgrades:[],quantities:[0,0,0,0,1,0,0]});
assert.equal(clientPlayerTradeModel(state,'US').ready,2);
assert.equal(clientPlayerTradeModel(state,'US').used,0);
assert.doesNotMatch(renderClientTradeInfo(state,'US'),/src="assets\/commerce-US-back\.png"/,'Actual production restores the card face');

// Every focus/track changes with public state; active printed growth modifiers
// agree with the existing economy projection, without importing its executor.
state.round=3;state.players.CN.prosperity=2;
state.players.CN.growth.push('ca11b52d5e0ad','c7efaad90fb20');
state.players.CN.automatedGrowth=['ca11b52d5e0ad','c7efaad90fb20'];
for(const focus of FOCUSES){
 state.players.CN.focus=focus;
 const model=clientPlayerBoardModel(state,'CN');
 assert.equal(model.focuses.filter(f=>f.selected).length,1);
 assert.equal(model.focuses.find(f=>f.selected).name,focus);
 for(const f of model.focuses)assert.equal(f.ready,focusOptions('CN',f.name,state.players.CN,state.round).ready);
 assert.deepEqual(model.nextProsperity,prosperityOffer(state.players.CN,'CN',state.round));
}
state.players.CN.production[0]=2;
html=renderClientPlayerBoard(state,'CN',byId);
assert.match(html,/能源产能 2，上限 2/);assert.match(html,/data-board-focus="军事焦点" aria-label="军事焦点，当前焦点"/);
assert.match(html,/class="printed-board-prosperity is-current" data-board-prosperity="2"/);
assert.match(html,/高生活水平已生效/);

// Marker positions use each faction's actual printed cells, particularly the
// different raw-material origins. State changes must move rather than duplicate.
const geometry=PLAYER_BOARD_GEOMETRY;
assert.deepEqual(seats.map(owner=>geometry.productionX[owner][1][0]),[665,604,608,663]);
for(const owner of seats){
 const sample=structuredClone(state),p=sample.players[owner];
 p.production=[...PLAYER_BOARD_PRINT[owner].max];p.prosperity=5;p.focus='外交焦点';
 const result=renderClientPrintedBoard(sample,owner);
 for(let key=0;key<7;key++){
  const positions=geometry.productionX[owner][key]||geometry.commonProductionX[key];
  const x=positions[p.production[key]-1],y=geometry.productionY[key];
  const marker=result.match(new RegExp(`<span class="printed-board-production" data-board-production="${key}"[^>]*>`))?.[0];
  assert.ok(marker,`${owner}: production ${key} has one live marker`);
  assert.ok(marker.includes(`left:${(100*x/1500).toFixed(4)}%;top:${(100*y/714).toFixed(4)}%`),`${owner}: maximum production ${key} lands on the final printed cell`);
 }
 assert.match(result,/printed-board-focus is-current" data-board-focus="外交焦点"/);
 assert.match(result,/printed-board-prosperity is-current" data-board-prosperity="5"/);
 assert.equal((result.match(/class="printed-focus-cylinder"/g)||[]).length,1);
 assert.equal((result.match(/class="printed-prosperity-ring"/g)||[]).length,1);
}

// Persistent trade agreements and face/round usage are public state too.
grantEventEffect(state,'CN',EFFECT_IDS.siberia);
grantEventEffect(state,'global',EFFECT_IDS.sanctions);
grantEventEffect(state,'US',EFFECT_IDS.ttipUS);
state.eventEffects.find(e=>e.cardId===EFFECT_IDS.siberia).usedRound=state.round;
state.eventEffects.find(e=>e.cardId===EFFECT_IDS.ttipUS).face='investment';
assert.equal(clientPlayerTradeModel(state,'CN').agreements.find(a=>a.id===EFFECT_IDS.siberia).status,'本轮已用');
assert.ok(clientPlayerTradeModel(state,'US').agreements.some(a=>a.id===EFFECT_IDS.sanctions));
assert.equal(clientPlayerTradeModel(state,'US').agreements.find(a=>a.id===EFFECT_IDS.ttipUS).status,'投资面');
assert.ok(!clientPlayerTradeModel(state,'EU').agreements.some(a=>a.id===EFFECT_IDS.ttipUS));
state.round++;
assert.equal(clientPlayerTradeModel(state,'CN').agreements.find(a=>a.id===EFFECT_IDS.siberia).status,'本轮未用');
assert.match(renderClientPlayerSummary(state,byId,{viewer:'CN'}),/西伯利亚力量管道协议（本轮未用）/);
const before=JSON.stringify(state);for(const owner of seats)renderClientPlayerBoard(state,owner,byId);assert.equal(JSON.stringify(state),before);

// A real room projection supplies only public information for other seats.
// Guard even full local states, so the component cannot accidentally expose
// private identities or need warehouse resources to render the upper board.
const view=playerView(state,'US'),expected=Object.fromEntries(seats.map(owner=>[owner,renderClientPlayerBoard(view,owner,byId)]));
for(const p of Object.values(view.players))for(const key of ['hand','deck','objectives','openingChoices','assetChoices','objectiveChoices','resources','played','discard'])Object.defineProperty(p,key,{get(){throw Error('Private/warehouse field accessed: '+key);}});
for(const owner of seats)assert.equal(renderClientPlayerBoard(view,owner,byId),expected[owner]);
const legacy=structuredClone(state);delete legacy.tradeVersion;delete legacy.players.US.production;delete legacy.players.US.prosperity;
assert.equal(clientPlayerTradeModel(legacy,'US').unknown,2);
html=renderClientPlayerBoard(legacy,'US',byId);assert.match(html,/状态待确认/);assert.match(html,/旧局繁荣尚未记录/);assert.match(html,/能源产能 —/);
assert.equal((html.match(/class="player-board-commerce-unknown"/g)||[]).length,2,'Legacy unknown export faces are visibly marked, not represented as available');
assert.doesNotMatch(renderClientPrintedBoard(legacy,'US'),/class="printed-production-cube"|class="printed-prosperity-ring"/,'Unknown old-save values must not create fabricated markers');
assert.equal(renderClientPlayerBoard(state,'unknown',byId),'');
assert.equal(renderClientPrintedBoard(state,'unknown'),'');assert.equal(renderClientTradeInfo(state,'unknown'),'');

// The new renderer's dependency surface contains only static/read-only data.
const source=fs.readFileSync(new URL('../dist/client-player-board.js',import.meta.url),'utf8');
assert.deepEqual([...source.matchAll(/^import .*?from '([^']+)'/gm)].map(m=>m[1]),['./game-constants.js','./resource-icons.js','./client-trade-art.js','./growth-data.js','./event-effect-rules.js']);
console.log('Client player board passed: four original cropped boards, faction-specific live marker coordinates, separate trade area, dynamic focus/prosperity, actual export use and production refresh, public agreement face/round status, no private/warehouse reads, immutable/legacy projections and static-only dependencies.');
