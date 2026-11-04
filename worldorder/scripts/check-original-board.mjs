import assert from 'node:assert/strict';
import {renderOriginalBoard,ORIGINAL_BOARD_REGIONS} from '../dist/original-board.js';
import {AREAS,IDS,majorityStandings,scoringPreview,syncInfluence} from '../dist/world.js';

const zero=()=>Object.fromEntries(IDS.map(id=>[id,0]));
const state={round:4,flow:{order:['CN','US','EU','RU']},players:Object.fromEntries(IDS.map((id,i)=>[id,{vp:i*35,money:10,allies:[],resources:[0,0,0,0,0,0,99]}])),regions:Object.fromEntries(Object.entries(AREAS).map(([id,a])=>[id,{permanent:[...a.start,...Array(a.slots-a.start.length).fill(null)],temporary:[],extraPermanent:[],ignoredStartingSlots:[],armies:zero(),engage:zero(),available:[],countryPiles:{left:[],right:[]}}]))};
state.regions.E.permanent[1]=null;state.regions.E.ignoredStartingSlots=[1];state.regions.E.extraPermanent=['CN'];state.regions.E.temporary=['RU','US'];
state.regions.E.armies={US:2,CN:3,EU:1,RU:4};state.regions.E.engage={US:1,CN:0,EU:2,RU:0};state.regions.E.available=['a','b'];
state.regions.E.countryPiles={left:['a','secret','secret2'],right:['b']};
state.regions.N.engage.RU=3;
state.players.US.allies=['a'];state.players.US.countryUnderlays={a:['fused1','fused2']};
state.players.US.money=25;state.players.CN.money=25;
const cards={a:{id:'a',name:'德国',image:'assets/germany.webp'},b:{id:'b',name:'英国',image:'assets/britain.webp'},secret:{id:'secret',name:'隐藏国家',image:'assets/hidden.webp'}};
const before=JSON.stringify(state),html=renderOriginalBoard(state,cards,{selectedRegion:'E'});
assert.equal(JSON.stringify(state),before,'Map display must not mutate a save');
assert.match(html,/assets\/map.webp/);assert.equal((html.match(/data-board-region=/g)||[]).length,7);
assert.equal((html.match(/data-board-slot="permanent"/g)||[]).length,Object.values(AREAS).reduce((sum,a)=>sum+a.slots,0));
assert.equal((html.match(/data-board-slot="temporary"/g)||[]).length,Object.values(AREAS).reduce((sum,a)=>sum+a.temp.length,0));
assert.match(html,/data-board-slot="extraPermanent" data-slot-index="0" data-region="E"/);
assert.match(html,/data-board-slot="permanent" data-slot-index="1" data-region="E"[^>]*停用起始槽[^>]*aria-disabled="true"/);
assert.match(html,/original-region original-region--selected/);
for(const id of IDS){assert.match(html,new RegExp(`token-army-${id}.png`));assert.match(html,new RegExp(`data-score-owner="${id}"`));}
assert.match(html,/欧洲 · 美国：2军队/);assert.match(html,/中东 · 俄罗斯：3介入标记/);
assert.equal((html.match(/class="original-force original-army"/g)||[]).length,4);
assert.equal((html.match(/class="original-force original-engage"/g)||[]).length,3);
assert.match(html,/第1位：中国/);assert.match(html,/当前第4轮/);
assert.doesNotMatch(html,/class="original-region-label"/,'Printed region labels stay unobstructed');
for(const id of IDS)assert.match(html,new RegExp(`data-power-flag="${id}"`));
assert.equal((html.match(/data-majority=/g)||[]).length,3);
assert.equal((html.match(/data-ranking-owner=/g)||[]).length,12);
for(const key of ['money','armies','allies'])assert.match(html,new RegExp(`assets/majority-${key}.png`));
assert.match(html,/data-card="a" data-source="regionCountry"/);assert.match(html,/data-card="b" data-source="regionCountry"/);
assert.match(html,/data-pile="left" data-pile-count="3">3/);assert.match(html,/data-pile="right" data-pile-count="1">1/);
assert.match(html,/original-engage[^>]*美国：1介入标记[^>]*><img[^>]+><\/span>/,'A single intervention token has no redundant count badge');
assert.doesNotMatch(html,/隐藏国家|hidden.webp|0军队|0介入标记/);
for(const [id,layout] of Object.entries(ORIGINAL_BOARD_REGIONS)){
 assert.equal(layout.permanent.length,AREAS[id].slots);assert.equal(layout.temporary.length,AREAS[id].temp.length);
 for(const point of [...layout.permanent,...layout.temporary])assert.ok(point[0]>=0&&point[0]<=2200&&point[1]>=0&&point[1]<=1964);
}
// Public pile lengths and top cards are legal. Any hidden identity access fails.
for(const r of Object.values(state.regions)){
 Object.defineProperty(r,'deck',{get(){throw Error('Private legacy deck accessed');}});
 for(const pile of Object.values(r.countryPiles))for(let i=1;i<pile.length;i++)Object.defineProperty(pile,i,{get(){throw Error('Private country identity accessed');}});
}
for(const p of Object.values(state.players))for(const key of ['hand','deck','objectives','assetChoices'])Object.defineProperty(p,key,{get(){throw Error('Private player cards accessed');}});
assert.equal(renderOriginalBoard(state,cards,{selectedRegion:'E'}),html);
assert.equal(renderOriginalBoard(state,Object.values(cards),{selectedRegion:'E'}),html);
const standings=majorityStandings(state);
assert.deepEqual(standings.money.filter(row=>row.leading).map(row=>row.id),['US','CN'],'Positive equal leaders both have gold borders');
for(const row of standings.money.slice(0,2)){assert.equal(row.rank,2);assert.equal(row.vp,3,'Tied leaders still receive the original lower tied rank reward');}
assert.deepEqual(standings.armies.map(row=>[row.id,row.value]),[['RU',4],['CN',3],['US',2],['EU',1]],'Army rankings exclude reserve armies');
assert.equal(standings.allies.find(row=>row.id==='US').value,1,'A fused ally counts once, not its underlays');
state.round=3;for(const region of Object.values(state.regions))syncInfluence(region);
const score=scoringPreview(state);
for(const [key,rows] of Object.entries(standings))for(const {id,rank,vp} of rows)assert.deepEqual(score.majority[key][id],{rank,vp},'Live standings and scoring share the same counter and tie rules');
for(const player of Object.values(state.players))player.money=0;
assert.ok(majorityStandings(state).money.every(row=>!row.leading),'All-zero counters have no leading highlight');
const legacy=renderOriginalBoard({...state,regions:{...state.regions,E:{...state.regions.E,countryPiles:undefined,available:['a']}}},cards);
assert.match(legacy,/data-pile-count="unknown">\?/,'Missing legacy counts stay explicitly unknown');
console.log('Original board passed: complete live geometry, flag markers, original majority artwork, public pile counts, standings/scoring parity, correct ties and no hidden identity access.');
