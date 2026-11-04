import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState,applyAction} from '../dist/engine.js';
import {newFlow} from '../dist/flow.js';
import {BASIC_CARDS} from '../dist/basic-actions.js';
import {rankBonus,scoringPreview} from '../dist/world.js';
const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url)));
function ready(){const s=createState(cards);for(const p of Object.values(s.players)){p.openingChoices=null;p.assetChoices=null;p.objectiveChoices=null;}s.flow=newFlow(['US','EU','CN','RU']);s.actionTurns={index:0,completed:{US:0,EU:0,CN:0,RU:0}};s.players.US.hand=['cc9cd4168dcc6'];return s;}
let s=ready();s.players.US.resources[6]=0;const original=JSON.stringify(s);let next=applyAction(s,{type:'playBasicCard',cardId:'cc9cd4168dcc6',moves:[{from:'reserve',to:'M'},{from:'M',to:'E'}]});assert.equal(next.players.US.resources[6],0);assert.equal(next.regions.E.armies.US,1);assert.equal(next.regions.M.armies.US,0);assert.equal(next.players.US.money,20);assert.equal(next.current,'EU');assert.equal(JSON.stringify(s),original);
for(const moves of [[{from:'reserve',to:'S'}],[{from:'A',to:'M'}],[{from:'reserve',to:'M'},{from:'reserve',to:'E'}],Array(3).fill({from:'reserve',to:'M'}),[{from:'M',to:'M'}]]){assert.throws(()=>applyAction(s,{type:'playBasicCard',cardId:'cc9cd4168dcc6',moves}));assert.equal(JSON.stringify(s),original);}
s.players.US.money=0;assert.throws(()=>applyAction(s,{type:'playBasicCard',cardId:'cc9cd4168dcc6',moves:[{from:'reserve',to:'M'}]}));next=applyAction(s,{type:'playBasicCard',cardId:'cc9cd4168dcc6',moves:[]});assert.equal(next.players.US.resources[6],1);
s=ready();const target=cards.find(c=>c.type==='country'&&c.region==='S');s.players.US.allies.push(target.id);s.players.US.bases=[target.id];next=applyAction(s,{type:'playBasicCard',cardId:'cc9cd4168dcc6',moves:[{from:'reserve',to:'S'}]});assert.equal(next.regions.S.armies.US,1);s.players.US.allies.pop();assert.throws(()=>applyAction(s,{type:'playBasicCard',cardId:'cc9cd4168dcc6',moves:[{from:'reserve',to:'S'}]}));
for(const [id,info] of Object.entries(BASIC_CARDS).filter(([,c])=>c.effect==='reinforce')){const c=cards.find(c=>c.id===id);assert.ok(c);s=ready();s.current=c.owner;s.flow.order=[c.owner,...Object.keys(s.players).filter(p=>p!==c.owner)];s.players[c.owner].hand=[id];next=applyAction(s,{type:'playBasicCard',cardId:id,moves:[]});assert.equal(next.players[c.owner].resources[6],s.players[c.owner].resources[6]+1);}
assert.equal(rankBonus([{id:'US',value:3,tie:2},{id:'EU',value:3,tie:2},{id:'CN',value:3,tie:1}],[7,4,2]).US.vp,4);
s=ready();s.round=3;s.regions.C.armies.RU=1;assert.equal(scoringPreview(s).national.RU,2);assert.equal(scoringPreview(s).regions.find(r=>r.region==='C').eligible,false);
console.log('Passed all four reinforcement cards, sequential moves, free gain, base access, invalid moves and insufficient-funds rollback, turn advancement and confirmed scoring cases.');
