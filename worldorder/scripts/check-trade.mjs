import assert from 'node:assert/strict';import fs from 'node:fs';
import {createState,applyAction} from '../dist/engine.js';import {newFlow} from '../dist/flow.js';import {tradeCapacity} from '../dist/trade.js';import {productionPreview,applyProduction} from '../dist/domestic-actions.js';import {BASIC_CARDS} from '../dist/basic-actions.js';
import {COUNTRY_TRADE} from '../dist/trade-data.js';
const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url)));
function ready(actor='US'){const s=createState(cards);for(const p of Object.values(s.players)){p.openingChoices=null;p.assetChoices=null;p.objectiveChoices=null;}s.current=actor;s.flow=newFlow([actor,...Object.keys(s.players).filter(id=>id!==actor)]);s.actionTurns={index:0,completed:{US:0,EU:0,CN:0,RU:0}};s.players[actor].hand=Object.keys(BASIC_CARDS);return s;}
let s=ready();s.players.US.allies=['cb427f6dd4283','ce2df59690e60'];const type='playBasicCard',cardId='c0deaa2d05c13';let next=applyAction(s,{type,cardId,exports:[{key:4,quantity:1}],imports:[{key:0,countryQuantity:1,players:{RU:3}},{key:3,players:{CN:1}}]});assert.equal(next.players.US.money,23);assert.equal(next.players.RU.money,24);assert.equal(next.players.CN.money,30);assert.equal(next.players.US.resources[5],5);assert.equal(next.players.RU.commerce.filter(c=>!c.ready).length,1);assert.equal(next.players.CN.commerce.filter(c=>!c.ready).length,1);assert.equal(next.players.RU.resources[0],s.players.RU.resources[0]);assert.equal(next.current,'CN');
const before=JSON.stringify(s);for(const a of [{exports:[{key:0,quantity:9}]},{exports:[{key:3,quantity:1}],imports:[{key:3,players:{CN:1}}]},{imports:[{key:4,players:{EU:2}}]},{imports:[{key:0,players:{RU:1}},{key:1,players:{RU:1}},{key:3,players:{CN:1}}]}]){assert.throws(()=>applyAction(s,{type,cardId,...a}));assert.equal(JSON.stringify(s),before);}
s=ready();next=applyAction(s,{type,cardId,imports:[{key:0,players:{RU:2}}]});assert.equal(next.players.US.resources[5],s.players.US.resources[5]);assert.equal(next.players.RU.commerce[0].ready,false);
s.players.CN.commerce.forEach(c=>c.ready=false);const oldGoods=s.players.CN.resources[3];next=applyAction(s,{type,cardId,imports:[{key:3,players:{CN:1}}]});assert.equal(next.players.CN.resources[3],oldGoods-1);s.players.CN.resources[3]=0;assert.throws(()=>applyAction(s,{type,cardId,imports:[{key:3,players:{CN:1}}]}));
s=ready();next=applyAction(s,{type,cardId,imports:[{key:3,players:{EU:1}},{key:4,players:{EU:1}}]});assert.equal(next.players.EU.commerce.filter(c=>!c.ready).length,2);assert.equal(next.players.US.resources[5],5);
s=ready('CN');s.players.CN.money=0;next=applyAction(s,{type,cardId:'c0297b4923ea2',exports:[{key:6,quantity:1}],imports:[{key:0,players:{RU:3}}],factoryGoods:1});assert.ok(next.players.CN.commerce.every(c=>c.ready));
s=ready('RU');s.players.RU.allies=['c4d2b5add5fd4'];assert.equal(tradeCapacity(s,'RU',{doublePrimary:true},[],0).exports[0],2);s.players.RU.commerce.forEach(c=>c.ready=false);applyProduction(s,productionPreview(s,[{key:0}]));assert.ok(s.players.RU.commerce.every(c=>c.ready));
s=ready('EU');s.players.EU.allies=['c0bcc4a617152'];s.players.EU.countryUnderlays={c0bcc4a617152:['c35627e0bba08']};assert.equal(tradeCapacity(s,'EU').exports[4],2);assert.equal(tradeCapacity(s,'EU').imports[0],1);
// Energy giant chooses exactly one primary good. Both the preview capacity
// and the authoritative command retain the other good's normal limit.
s=ready('RU');
s.players.RU.allies=[...new Set(['exports','imports'].flatMap(direction=>[0,1].map(key=>Object.keys(COUNTRY_TRADE).find(id=>COUNTRY_TRADE[id][direction].includes(key)))))];
s.players.RU.countryUnderlays={};s.players.RU.resources[0]=s.players.RU.resources[1]=10;
const giant=BASIC_CARDS.cee23aa848494,normal=tradeCapacity(s,'RU');
for(const primaryResource of [0,1]){
 const cap=tradeCapacity(s,'RU',giant,[],primaryResource);
 for(const direction of ['exports','imports'])assert.deepEqual(cap[direction],normal[direction].map((n,k)=>k===primaryResource?n*2:n));
 const other=1-primaryResource,unchanged=JSON.stringify(s);
 assert.throws(()=>applyAction(s,{type,cardId:'cee23aa848494',primaryResource,exports:[{key:other,quantity:normal.exports[other]+1}]}),/超过盟国需求/);
 assert.equal(JSON.stringify(s),unchanged);
 const quantity=normal.exports[primaryResource]+1;
 const result=applyAction(s,{type,cardId:'cee23aa848494',primaryResource,exports:[{key:primaryResource,quantity}]});
 assert.equal(result.players.RU.resources[primaryResource],10-quantity);
 assert.equal(result.players.RU.resources[other],10);
 assert.equal(result.players.RU.money,s.players.RU.money+quantity*5);
}
for(const primaryResource of [undefined,null,2,'0',[0,1]])assert.throws(()=>applyAction(s,{type,cardId:'cee23aa848494',primaryResource}),/请选择能源或原材料/);
// SP-visible countries are available for ordinary trade but are not allies.
s.players.RU.allies=[];s.config.wit=true;s.players.RU.smart=3;
for(const key of [0,1])assert.deepEqual(tradeCapacity(s,'RU',giant,['E'],key),tradeCapacity(s,'RU',{},['E']));
for(const id of Object.keys(BASIC_CARDS))assert.ok(cards.some(c=>c.id===id));assert.equal(Object.keys(BASIC_CARDS).length,48);
console.log('Passed trade quotas, money transfers, shared commerce cards, stock fallback, Russian partial imports, export-funded imports, factory follow-up, production refresh, stacked country symbols, rollback and all 48 starter IDs.');
