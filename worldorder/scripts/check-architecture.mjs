import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
// Keep the shared admission/projection layer usable without loading mutation,
// browser or server modules. Check actual imports, including re-exports and
// literal dynamic imports, before evaluating the game module graph.
const pureFiles=['game-constants.js','interaction-state.js','phase-state.js','action-policy.js','event-income-rules.js','event-decision-rules.js'];
const pure=new Set(pureFiles.map(name=>path.join(root,'dist',name))),edges=new Map();
function dependencies(file){
 const source=fs.readFileSync(file,'utf8'),found=new Set();
 for(const pattern of [/\b(?:import|export)\s+(?:[^'";]*?\s+from\s*)?['"]([^'"]+)['"]/g,/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g]){
  for(const match of source.matchAll(pattern))found.add(match[1]);
 }
 return [...found];
}
for(const file of pure){
 const imports=dependencies(file);edges.set(file,[]);
 for(const specifier of imports){
  assert.ok(specifier.startsWith('.'),`${path.basename(file)} must not import I/O or a package: ${specifier}`);
  const dependency=path.resolve(path.dirname(file),specifier);
  assert.ok(pure.has(dependency),`Pure layer escaped into ${path.relative(root,dependency)} from ${path.basename(file)}; explicitly review new pure dependencies.`);
  edges.get(file).push(dependency);
 }
}
function visit(file,stack=[],done=new Set()){
 assert.ok(!stack.includes(file),`Module cycle: ${[...stack,file].map(file=>path.basename(file)).join(' -> ')}`);
 if(done.has(file))return;
 for(const dependency of edges.get(file)||[])visit(dependency,[...stack,file],done);
 done.add(file);
}
for(const file of pure)visit(file);

// All handwritten browser modules must remain acyclic too. This catches the
// former battlefield -> sequence availability -> growth purchase back-edge.
const modules=fs.readdirSync(path.join(root,'dist')).filter(name=>name.endsWith('.js')).map(name=>path.join(root,'dist',name));
for(const file of modules)edges.set(file,dependencies(file).filter(specifier=>specifier.startsWith('.')).map(specifier=>path.resolve(path.dirname(file),specifier)));
const visited=new Set();for(const file of modules)visit(file,[],visited);

const [engine,flow,interaction,policy,phase,rooms,market,countries,effects,incomeRules]=await Promise.all([
 import('../dist/engine.js'),import('../dist/flow.js'),import('../dist/interaction-state.js'),
 import('../dist/action-policy.js'),import('../dist/phase-state.js'),import('../server/rooms.js'),
 import('../dist/market-data.js'),import('../dist/country-actions.js'),import('../dist/event-effects.js'),
 import('../dist/event-income-rules.js')
]);
const {createState,applyAction}=engine,{newFlow}=flow;
const {activeInteraction,pendingActionIssue}=interaction;
const {gameActionIssue,roomActionIssue,actionAccess,manualWindow,setupPending}=policy;
const {currentActor,phaseStatus,settlementProgress}=phase;
const {newRoom,changeRoom,playerView}=rooms;
const {MARKET_CARDS}=market,{relationCountries,countryInfo}=countries,{grantEventEffect}=effects;
const {incomeChoiceModel}=incomeRules;
const cards=JSON.parse(fs.readFileSync(path.join(root,'dist/cards.json'),'utf8'));
const seats=['US','CN','EU','RU'],domestic='cf9aa23c4a315',trim='c7909871b7d55',openDiplomacy='cee1874f2f132';
const CEE='c09c854e149a8',IRAN='ccd84d77f9734';
const identities=Object.fromEntries(seats.map(seat=>[seat,{user:'architecture-check',token:seat}]));
let serial=0;
function fixture(){
 const s=createState(cards,{dd:true,wit:true,growthMode:'base'},()=>.5);
 for(const p of Object.values(s.players)){
  p.openingChoices=p.assetChoices=p.objectiveChoices=null;
  p.hand=[domestic];p.money=100;p.resources=Array(7).fill(8);
 }
 s.round=4;s.current='US';s.phase='行动';s.flow=newFlow(seats,4);
 s.actionTurns={index:0,completed:Object.fromEntries(seats.map(seat=>[seat,0]))};
 return s;
}
function roomFor(s){
 const room=newRoom('ARCH22',identities.US,cards,s.config);
 room.status='playing';room.seats=structuredClone(identities);room.state=s;
 return room;
}
function send(room,seat,action){
 return changeRoom(room,identities[seat],{id:String(++serial),op:'action',gameRevision:room.gameRevision,action},cards);
}
function reject(room,seat,action,pattern){
 const before=JSON.stringify(room);
 assert.throws(()=>send(room,seat,action),pattern);
 assert.equal(JSON.stringify(room),before,'Rejected command changed room state');
}
const probes=[
 {type:'finishGrowthAbility',cards:[domestic]}, {type:'useGrowthAbility',cardId:trim},
 {type:'resolveOpenDiplomacy'}, {type:'skipOpenDiplomacy'}, {type:'resolveSequenceStep'},
 {type:'manualSequence'}, {type:'endAction'}, {type:'draw'}, {type:'switch',player:'CN'},
 {type:'resource',key:'money',delta:1}, {type:'adjustProduction',key:0,delta:1},
 {type:'region',region:'E',player:'US',key:'army',delta:1},
 {type:'region',region:'E',player:'CN',key:'army',delta:1},
 {type:'resolveInvestments'}, {type:'resolveIncomeEffect',effectId:CEE,choice:'offer'},
 {type:'resolveIncomeEffect',effectId:CEE,choice:'buy'}, {type:'resolveIncomeEffect',effectId:CEE,choice:'decline'},
 {type:'resolveIncomeEffect',effectId:CEE,choice:'money'}, {type:'resolveIncomeEffect',effectId:IRAN,choice:'energy'},
 {type:'settlePhaseTask',confirmed:true}, {type:'submitEvent'}, {type:'chooseOpening',index:0}
];
function checkViews(s,label){
 const original=JSON.stringify(s);
 for(const seat of seats){
  const view=playerView(s,seat),viewBefore=JSON.stringify(view);
  assert.equal(currentActor(view),currentActor(s),`${label}: actor differs for ${seat}`);
  assert.deepEqual(activeInteraction(view),activeInteraction(s),`${label}: interaction differs for ${seat}`);
  assert.deepEqual(phaseStatus(view),phaseStatus(s),`${label}: phase status differs for ${seat}`);
  assert.equal(manualWindow(view,seat),manualWindow(s,seat));
  assert.deepEqual(incomeChoiceModel(view),incomeChoiceModel(s),`${label}: public income choices differ`);
  for(const action of probes){
   assert.equal(gameActionIssue(view,action,seat),gameActionIssue(s,action,seat),`${label}: engine admission differs for ${seat}/${action.type}`);
   assert.equal(roomActionIssue(view,seat,action),roomActionIssue(s,seat,action),`${label}: room admission differs for ${seat}/${action.type}`);
   assert.deepEqual(actionAccess(view,action,seat),actionAccess(s,action,seat));
   assert.deepEqual(actionAccess(view,action),{allowed:!gameActionIssue(view,action),reason:gameActionIssue(view,action)});
   assert.equal(pendingActionIssue(view,action.type,seat),pendingActionIssue(s,action.type,seat));
  }
  for(const other of seats.filter(other=>other!==seat)){
   assert.ok(view.players[other].hand.every(card=>card===null),'Fixture must exercise actual hidden hands');
   assert.equal(setupPending(view.players[other]),setupPending(s.players[other]));
  }
  assert.equal(JSON.stringify(view),viewBefore,`${label}: a read function mutated ${seat}'s view`);
 }
 assert.equal(JSON.stringify(s),original,`${label}: a read function mutated authoritative state`);
}

// A real action sequence opens diplomacy, then starts an optional hand change.
// All three saved continuations coexist. The innermost choice owns controls,
// while allowed commands are the intersection of all unfinished constraints.
let s=fixture();
const visitCard=Object.keys(MARKET_CARDS).find(id=>MARKET_CARDS[id].name==='外交出访');
assert.ok(visitCard);
s.players.US.hand=[visitCard,domestic];s.players.US.deck=[];s.players.US.discard=[];
s.players.US.growth=[openDiplomacy,trim];
let room=roomFor(s);
room=send(room,'US',{type:'startSequenceCard',cardId:visitCard});
const target=relationCountries(room.state)[0],region=countryInfo(target).region;
room=send(room,'US',{type:'resolveSequenceStep',country:target,slot:'temporary',openDiplomacy:true});
assert.equal(activeInteraction(room.state).kind,'relation');
assert.ok(room.state.flow.cardResolution&&room.state.flow.pendingRelation);
checkViews(room.state,'diplomacy suspends sequence');
room=send(room,'US',{type:'useGrowthAbility',cardId:trim});
assert.ok(room.state.flow.cardResolution&&room.state.flow.pendingRelation&&room.state.flow.pendingGrowth);
assert.equal(activeInteraction(room.state).kind,'growth');
assert.equal(currentActor(room.state),'US');
assert.equal(roomActionIssue(room.state,'US',{type:'finishGrowthAbility'}),null);
for(const type of ['skipOpenDiplomacy','resolveOpenDiplomacy','resolveSequenceStep','endAction','resource']){
 assert.ok(roomActionIssue(room.state,'US',{type}),`Nested growth must suspend ${type}`);
 reject(room,'US',{type},/先完成/);
}
reject(room,'CN',{type:'finishGrowthAbility',cards:[domestic]},/等待美国/);
checkViews(room.state,'growth inside diplomacy inside sequence');
const hidden=playerView(room.state,'CN');
assert.deepEqual(hidden.flow.pendingGrowth,{owner:'US'});
room=send(JSON.parse(JSON.stringify(room)),'US',{type:'finishGrowthAbility',cards:[domestic]});
assert.equal(activeInteraction(room.state).kind,'relation');
assert.equal(room.state.actionTurns.index,0);
checkViews(room.state,'resume diplomacy');
room=send(room,'US',{type:'skipOpenDiplomacy'});
assert.equal(activeInteraction(room.state).kind,'sequence');
assert.equal(roomActionIssue(room.state,'US',{type:'resolveSequenceStep'}),null);
checkViews(room.state,'resume sequence');
room=send(room,'US',{type:'resolveSequenceStep',region,slot:'temporary'});
assert.equal(room.state.actionTurns.index,1);
assert.equal(currentActor(room.state),'CN');
assert.equal(activeInteraction(room.state),null);
assert.deepEqual(room.state.players.US.trashed,[domestic]);

// Income temporarily transfers control from CN to EU and back, even when EU
// already collected its own income. No participant may bypass the choice by
// adjusting money, claiming base income again or advancing the phase.
s=fixture();s.phase='余波';s.flow=newFlow(['EU','US','RU','CN'],4);s.flow.step='aftermath';s.current='EU';
for(const p of Object.values(s.players))p.fdi=[];
grantEventEffect(s,'CN',CEE,'c0e00a3125aa7');grantEventEffect(s,'CN',IRAN,'c2885a67a8cb7');
room=roomFor(s);
for(const seat of ['EU','US','RU','CN'])room=send(room,seat,{type:'resolveInvestments'});
assert.deepEqual(room.state.flow.investmentDone,['EU','US','RU']);
assert.deepEqual(activeInteraction(room.state),{kind:'income',actor:'CN',owner:'CN',shared:true,label:'完成持续事件收益'});
checkViews(room.state,'income owner selection');
room=send(room,'CN',{type:'resolveIncomeEffect',effectId:CEE,choice:'offer'});
assert.equal(currentActor(room.state),'EU');assert.equal(activeInteraction(room.state).owner,'CN');
assert.equal(manualWindow(room.state,'EU'),false);
assert.equal(roomActionIssue(room.state,'EU',{type:'resolveIncomeEffect'}),null);
for(const seat of seats){
 reject(room,seat,{type:'resource',key:'money',delta:1});
 reject(room,seat,{type:'resolveInvestments'});
 reject(room,seat,{type:'confirmAftermath',step:'投资回报',confirmed:true});
}
checkViews(room.state,'income EU responder');
room=send(JSON.parse(JSON.stringify(room)),'EU',{type:'resolveIncomeEffect',effectId:CEE,choice:'decline'});
assert.equal(currentActor(room.state),'CN');
checkViews(room.state,'income CN fallback');
room=send(room,'CN',{type:'resolveIncomeEffect',effectId:CEE,choice:'money'});
assert.equal(currentActor(room.state),'CN');assert.deepEqual(room.state.flow.pendingIncome.remaining,[IRAN]);
room=send(room,'CN',{type:'resolveIncomeEffect',effectId:IRAN,choice:'money'});
assert.equal(activeInteraction(room.state),null);
assert.equal(currentActor(room.state),'EU');
assert.equal(room.state.players.CN.money,110);
assert.deepEqual(room.state.flow.checks,['投资回报']);
checkViews(room.state,'income finished exactly once');

// Legacy manual event saves still allow each unfinished seat to record its
// own resource outcome. The exception never grants off-turn map privileges,
// and confirming a seat immediately closes that seat's manual window.
s=fixture();delete s.eventVersion;delete s.eventBoard;s.phase='事件';s.flow.step='events';
room=roomFor(s);checkViews(room.state,'legacy event before confirmations');
assert.equal(currentActor(room.state),'US');
assert.equal(roomActionIssue(room.state,'EU',{type:'resource',key:'money',delta:1}),null);
reject(room,'EU',{type:'region',region:'E',player:'EU',key:'army',delta:1},/等待美国/);
assert.ok(roomActionIssue(room.state,'US',{type:'region',region:'E',player:'CN',key:'army',delta:1}));
room=send(room,'EU',{type:'resource',key:'money',delta:1});
assert.equal(room.state.players.EU.money,101);assert.equal(currentActor(room.state),'US');
room=send(room,'US',{type:'settlePhaseTask',taskId:settlementProgress(room.state).key,confirmed:true});
assert.equal(currentActor(room.state),'CN');assert.equal(manualWindow(room.state,'US'),false);
reject(room,'US',{type:'resource',key:'money',delta:1});
assert.ok(gameActionIssue(room.state,{type:'resource',key:'money',delta:1},'US'));
assert.equal(roomActionIssue(room.state,'RU',{type:'resource',key:'money',delta:1}),null);
checkViews(room.state,'legacy event one seat confirmed');
room=send(room,'RU',{type:'resource',key:'money',delta:1});
for(const seat of ['CN','EU','RU'])room=send(room,seat,{type:'settlePhaseTask',taskId:settlementProgress(room.state).key,confirmed:true});
assert.equal(room.state.flow.step,'aftermath');
assert.equal(room.state.players.EU.money,101);assert.equal(room.state.players.RU.money,101);

// Masked setup choices preserve their pending marker so observers cannot
// acquire gameplay controls just because private choice arrays are absent.
s=createState(cards,{dd:true,wit:true},()=>.5);
checkViews(s,'simultaneous private setup');
for(const seat of seats)assert.ok(roomActionIssue(s,seat,{type:'resolveInvestments'}));

console.log('Architecture checks passed: acyclic pure dependency boundary; nested growth/diplomacy/sequence admission; CN–EU–CN income responsibility; authoritative/view parity without mutation; legacy parallel receipts and unchanged map restrictions.');
