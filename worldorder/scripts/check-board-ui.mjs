import assert from 'node:assert/strict';
import {renderInteractiveBoard} from '../dist/board-ui.js';
import {AREAS,IDS} from '../dist/world.js';
import {REGION_COLORS} from '../dist/region-presentation.js';

const zero=()=>Object.fromEntries(IDS.map(id=>[id,0]));
const state={current:'US',regions:Object.fromEntries(Object.entries(AREAS).map(([id,a])=>[id,{permanent:Array(a.slots).fill(null),extraPermanent:[],temporary:[],ignoredStartingSlots:[],armies:zero(),engage:zero(),available:[]}]))};
state.regions.E.permanent=['EU',null,'RU','US',null,null,null];
state.regions.E.ignoredStartingSlots=[1];
state.regions.E.extraPermanent=['CN'];
state.regions.E.temporary=['RU','CN'];
state.regions.E.armies={US:2,CN:3,EU:1,RU:4};
state.regions.E.engage={US:1,CN:0,EU:2,RU:0};
state.regions.E.available=['visible-a','visible-b'];
state.regions.E.deck=['hidden-country'];
state.regions.E.countryPiles={left:['visible-a','hidden-country'],right:['visible-b']};
state.regions.N.permanent[0]='neutral';
state.regions.N.engage.RU=3;
const cards={
 'visible-a':{id:'visible-a',name:'德国',image:'assets/germany.webp'},
 'visible-b':{id:'visible-b',name:'英国',image:'assets/britain.webp'},
 'hidden-country':{id:'hidden-country',name:'不应泄露的国家',image:'assets/secret.webp'}
};
const before=JSON.stringify(state),html=renderInteractiveBoard(state,cards,{selectedRegion:'E'});
assert.equal(JSON.stringify(state),before,'Rendering must not mutate state');
assert.equal((html.match(/data-board-region=/g)||[]).length,7);
assert.deepEqual([...html.matchAll(/data-board-region="([A-Z])"/g)].map(match=>match[1]),['M','E','C','P','A','N','S'],'Use the requested two-row region order');
for(const [id,color] of Object.entries(REGION_COLORS))assert.match(html,new RegExp(`data-board-region="${id}" style="--board-region-color:${color}"`),'Board and event summaries share the region palette');
const withEvents=renderInteractiveBoard(state,cards,{extraSlot:'<aside class="client-events-cell">事件</aside>'});
assert.ok(withEvents.indexOf('client-events-cell')>withEvents.indexOf('data-board-region="S"'),'The event cell follows the seven requested regions');
assert.doesNotMatch(html,/assets\/map\.webp|board-map|board-cartography|board-compass/);
assert.doesNotMatch(html,/board-force-influence|board-force-country|0军队|0介入标记/,'Do not render duplicate power totals or zero force counters');
assert.match(html,/board-region--E board-region--selected/);
assert.match(html,/data-card="visible-a" data-source="regionCountry"/);
assert.match(html,/data-card="visible-b" data-source="regionCountry"/);
assert.doesNotMatch(html,/hidden-country|不应泄露|secret\.webp/);
assert.match(html,/data-board-slot="permanent" data-slot-index="1"[^>]*停用起始槽[^>]*aria-disabled="true"/);
assert.match(html,/data-board-slot="extraPermanent" data-slot-index="0"/);
assert.equal((html.match(/data-board-slot="temporary"/g)||[]).length,Object.values(AREAS).reduce((n,a)=>n+a.temp.length,0));
for(const [id,n] of Object.entries(state.regions.E.armies))assert.ok(html.includes(`data-army-owner="${id}" title="${{US:'美国',CN:'中国',EU:'欧盟',RU:'俄罗斯'}[id]}：${n}军队`));
for(const [id,color] of Object.entries({US:'#52a9e7',CN:'#e56361',EU:'#e4bd43',RU:'#d2d8db'}))assert.match(html,new RegExp(`class="board-force" data-army-owner="${id}"[^>]*--board-force-color:${color}`),'Force icons retain the owning power color');
assert.match(html,/俄罗斯影响力/);assert.match(html,/中国影响力/);
assert.match(html,/欧盟：1军队，2介入标记/);
assert.match(html,/data-army-owner="CN" title="中国：3军队"/);
assert.match(html,/data-army-owner="RU" title="俄罗斯：4军队"/);
assert.match(html,/data-board-owner="neutral"/);
const panels=Object.fromEntries([...html.matchAll(/<section class="board-region [\s\S]*?<\/section>/g)].map(([panel])=>[panel.match(/data-board-region="([A-Z])"/)[1],panel]));
assert.equal((html.match(/class="board-army-count"/g)||[]).length,4,'Only the four nonzero army counts should be rendered');
assert.equal((html.match(/class="board-engage-token"/g)||[]).length,3,'Only nonzero intervention counts should be rendered');
assert.equal((html.match(/class="board-force"/g)||[]).length,5);
assert.match(panels.N,/data-army-owner="RU" title="俄罗斯：3介入标记"/,'Intervention remains visible when the army count is zero');
assert.doesNotMatch(panels.N,/board-army-count/);
for(const id of ['P','S','C','M','A'])assert.doesNotMatch(panels[id],/class="board-force"|board-army-count|board-engage-token/,'Empty regions leave the force area blank');
for(const panel of Object.values(panels))assert.match(panel,/<div class="board-region-state"><div class="board-influence">[\s\S]*?<div class="board-forces"/,'Influence slots and forces share the region state area');

assert.equal(renderInteractiveBoard(state,Object.values(cards),{selectedRegion:'E'}),html);
// The renderer must not even read a private pile, including through a helper.
for(const region of Object.values(state.regions))for(const key of ['deck','countryPiles'])Object.defineProperty(region,key,{get(){throw Error('Private pile accessed');}});
Object.defineProperty(state,'players',{get(){throw Error('Player areas must not be read by region panels');}});
assert.equal(renderInteractiveBoard(state,cards,{selectedRegion:'E'}),html,'Region panels must not inspect private piles or player areas');
console.log('Board UI passed: requested region order and shared palette, real influence slots, nonzero armies and intervention beside influence, public supply only, no player/private-pile access and immutable rendering.');
