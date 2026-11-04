import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState,applyAction} from '../dist/engine.js';
import {ACTION_CARDS} from '../dist/basic-actions.js';
import {ECONOMY} from '../dist/economy.js';
import {GROWTH_FAMILIES} from '../dist/growth-setup.js';
import {GROWTH_DATA} from '../dist/growth-data.js';
import {growthPreview} from '../dist/domestic-actions.js';
import {playerView} from '../server/rooms.js';
import {clientGrowthCatalogue,renderClientGrowthCatalogue,renderClientSupplyDock} from '../dist/client-table-ui.js';

const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url),'utf8'));
const byId=Object.fromEntries(cards.map(card=>[card.id,card]));
const seats=['US','CN','EU','RU'];
// Keep the application's card callback contract without pulling in a DOM or UI.
const card=(id,source)=>{assert.ok(byId[id],`Unknown real card: ${id}`);return `<button class="cardbutton" data-card="${id}" data-source="${source}"><img src="${byId[id].image}"></button>`;};
function ready(mode='base'){
 let s=createState(cards,{dd:mode!=='base',wit:false,growthMode:mode},()=>.5);
 for(const seat of seats){
  s=applyAction(s,{type:'switch',player:seat});
  s=applyAction(s,{type:'selectAssetDiscard',id:s.players[seat].assetChoices[0].id});
  if(s.config.dd)s=applyAction(s,{type:'selectObjectiveDiscard',id:s.players[seat].objectiveChoices[0]});
  s=applyAction(s,{type:'chooseAssets'});
 }
 // Supply-state UI tests use funded real hands to exercise actual purchases.
 for(const p of Object.values(s.players)){p.money=100;p.resources[4]=10;p.resources[5]=10;}
 return s;
}
function buy(s,growthId){
 const owner=s.current,p=s.players[owner],cardId=p.hand.find(id=>ACTION_CARDS[id]?.effect==='domestic');
 assert.ok(cardId,`${owner} has a real domestic starting card`);
 const upgrades=GROWTH_DATA[growthId].effect==='industry'?p.production.map((n,k)=>n<ECONOMY[owner].max[k]?k:null).filter(k=>k!==null).slice(0,2):[];
 const next=applyAction(s,{type:'playBasicCard',cardId,domestic:'growth',growthId,upgrades});
 assert.ok(next.players[owner].growth.includes(growthId));
 assert.equal(next.growth.length,s.growth.length-1);
 return next;
}
const industry=GROWTH_FAMILIES.find(f=>f.module==='base'&&GROWTH_DATA[f.ids[0]].effect==='industry');
const repeated=GROWTH_FAMILIES.find(f=>f.module==='base'&&f.ids.length===3&&new Set(f.ids).size===1);
let state=ready(),originalCatalogue=clientGrowthCatalogue(state,byId);
assert.equal(originalCatalogue.length,10,'Twenty base physical cards render as ten ability stacks');
assert.equal(originalCatalogue.reduce((n,g)=>n+g.count,0),20);
assert.equal(originalCatalogue.find(g=>g.ids.includes(industry.ids[0])).available,3);
assert.equal(originalCatalogue.find(g=>g.ids.includes(repeated.ids[0])).available,3);
const owners=[];
for(let index=0;index<industry.ids.length;index++){
 const owner=state.current;owners.push(owner);state=buy(state,industry.ids[index]);
 const before=JSON.stringify(state),catalogue=clientGrowthCatalogue(state,byId),group=catalogue.find(g=>g.ids.includes(industry.ids[0]));
 assert.equal(group.count,3,'Owned cards remain in the same original public stack');
 assert.equal(group.available,2-index,'Only physical stock remaining is available');
 assert.deepEqual(group.availableIds,industry.ids.slice(index+1));
 assert.equal(group.owners.reduce((n,entry)=>n+entry.count,0),index+1);
 for(const boughtBy of owners)assert.equal(group.owners.find(entry=>entry.owner===boughtBy)?.count,1);
 if(index<2)assert.equal(group.id,industry.ids[index+1],'The card face uses an actual remaining physical alias');
 const html=renderClientGrowthCatalogue(state,byId,card);
 assert.match(html,/共 20 张/);assert.equal((html.match(/class="table-supply-card/g)||[]).length,10);
 const block=[...html.matchAll(/<div class="table-supply-card[^]*?<\/div>/g)].map(m=>m[0]).find(block=>industry.ids.some(id=>block.includes(`data-card="${id}"`)));
 assert.ok(block,'The ability stack survives every purchase, including depletion');
 if(index<2){assert.match(block,/data-source="growthSupply"/);assert.match(block,new RegExp(`data-supply-ids="${industry.ids.slice(index+1).join(',')}"`));}
 else{assert.match(block,/supply-empty/);assert.match(block,/已取完/);assert.match(block,/data-source="view"/);assert.doesNotMatch(block,/data-supply-ids|data-table-target|growthSupply/,'Depleted stacks are inspectable and have no purchase target');}
 assert.equal(JSON.stringify(state),before,'Catalogue rendering does not mutate game state');
}
assert.throws(()=>growthPreview(state,{growthId:industry.ids[0]}),/供应区/,'The real purchase validator also rejects depleted physical cards');

// Repeated IDs also represent separate physical copies, while target IDs dedupe.
let sameId=ready();
for(let index=0;index<3;index++){
 sameId=buy(sameId,repeated.ids[0]);
 const group=clientGrowthCatalogue(sameId,byId).find(g=>g.ids.includes(repeated.ids[0]));
 assert.equal(group.count,3);assert.equal(group.available,2-index);
 assert.deepEqual(group.availableIds,index<2?[repeated.ids[0]]:[]);
 assert.equal(group.owners.length,index+1);
}
for(const mode of ['base','expansion','families','mixed']){
 const s=ready(mode),catalogue=clientGrowthCatalogue(s,byId);
 assert.equal(catalogue.reduce((n,g)=>n+g.count,0),20);
 assert.equal(catalogue.reduce((n,g)=>n+g.available,0),20);
 assert.deepEqual(catalogue.flatMap(g=>Array(g.available).fill(g.level)).sort(),[1,1,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5]);
}

const viewer=owners[0],before=JSON.stringify(state),dock=renderClientSupplyDock(state,byId,card,{viewer});
const rows=[...dock.matchAll(/<div class="client-research-row"[^]*?(?=<div class="client-research-row"|<\/section>)/g)].map(m=>m[0]);
assert.equal(rows.length,2,'The six-card market uses two rows');
assert.deepEqual(rows.map(row=>[...row.matchAll(/data-card="([^"]+)"/g)].map(m=>m[1])),[state.market.slice(0,3),state.market.slice(3,6)],'Rows preserve market order and never reshuffle on rendering');
assert.equal((dock.match(/data-source="market"/g)||[]).length,6);
assert.match(dock,/下次发展 · 2 级/);
const hint=dock.slice(dock.indexOf('<button'),dock.indexOf('</button>')+9);
assert.match(hint,/data-client-supply="growth"/);
assert.doesNotMatch(hint,/data-card=|data-card-action=|data-command=|data-supply-ids=|data-table-target=/,'Next-level display is a catalogue hint, not a purchase permission');
for(const match of hint.matchAll(/<img src="([^"]+)"/g)){
 const c=cards.find(c=>c.image===match[1]);assert.ok(c);assert.equal(GROWTH_DATA[c.id].level,2);
}
assert.equal(JSON.stringify(state),before,'Dock rendering cannot consume resources or replace the next-growth rule');
const emptyMarket=structuredClone(state);emptyMarket.market=[];
assert.doesNotMatch(renderClientSupplyDock(emptyMarket,byId,card,{viewer}),/data-source="market"/,'An empty market does not fabricate cards');
const redacted=playerView(state,viewer);
for(const p of Object.values(redacted.players))for(const key of ['hand','deck','objectives','assetChoices','objectiveChoices'])Object.defineProperty(p,key,{get(){throw Error('Private player field accessed: '+key);}});
for(const key of ['marketDeck','eraDeck','era2Deck'])Object.defineProperty(redacted,key,{get(){throw Error('Private supply accessed: '+key);}});
assert.equal(renderClientSupplyDock(redacted,byId,card,{viewer}),dock);
assert.deepEqual(clientGrowthCatalogue(redacted,byId),clientGrowthCatalogue(state,byId),'Growth catalogue uses public stock and ownership only');
console.log('Client table UI passed: real purchases retain ten public stacks, distinct/repeated physical copies deplete accurately, empty stock is inspect-only, all four stock modes, ordered two-by-three research, next-level hint only, and no private pile access or rendering mutation.');
