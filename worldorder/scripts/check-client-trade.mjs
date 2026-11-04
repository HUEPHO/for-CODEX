import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createState,applyAction} from '../dist/engine.js';
import {newFlow} from '../dist/flow.js';
import {BASIC_CARDS} from '../dist/basic-actions.js';
import {tradeCapacity,tradePreview} from '../dist/trade.js';
import {renderTradeForm,readTradeForm} from '../dist/trade-ui.js';
import {renderClientTradeForm,handleTradeControl} from '../dist/client-trade-ui.js';

const cards=JSON.parse(readFileSync(new URL('../dist/cards.json',import.meta.url),'utf8'));
const tradeId='c0deaa2d05c13';
function ready(actor='US'){
 const state=createState(cards,{wit:true},()=>.5);
 for(const p of Object.values(state.players))p.openingChoices=p.assetChoices=p.objectiveChoices=null;
 state.current=actor;state.flow=newFlow([actor,...Object.keys(state.players).filter(id=>id!==actor)]);
 state.actionTurns={index:0,completed:{US:0,EU:0,CN:0,RU:0}};
 state.players[actor].hand=Object.keys(BASIC_CARDS);state.players[actor].smart=4;
 return state;
}

// Read real rendered input attributes with a minimal DOM contract, then send
// the resulting command through the existing authoritative trade action.
function controls(html){
 const fields=[...html.matchAll(/<input\b([^>]*)>/g)].map(match=>{
  const attributes=Object.fromEntries([...match[1].matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(([,name,value])=>[name,value??'']));
  const field=new EventTarget();
  Object.assign(field,{attributes,id:attributes.id||'',min:attributes.min||'',max:attributes.max||'',value:attributes.value??'on',checked:'checked' in attributes,disabled:'disabled' in attributes,dataset:Object.fromEntries(Object.entries(attributes).filter(([key])=>key.startsWith('data-')).map(([key,value])=>[key.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase()),value])),ownerDocument:{defaultView:{Event}},matches:()=>field.disabled});
  return field;
 });
 function matches(field,selector){
  if(selector.startsWith('#'))return field.id===selector.slice(1);
  const match=selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\](:checked)?$/);
  return !!match&&match[1] in field.attributes&&(match[2]===undefined||field.attributes[match[1]]===match[2])&&(!match[3]||field.checked);
 }
 return {fields,querySelector:selector=>fields.find(field=>matches(field,selector))||null,querySelectorAll:selector=>fields.filter(field=>matches(field,selector))};
}
function read(html,edit){
 const form=controls(html),prior=globalThis.document;globalThis.document=form;
 try{edit?.(form);return {form,action:readTradeForm()};}finally{if(prior===undefined)delete globalThis.document;else globalThis.document=prior;}
}

let state=ready();state.players.US.allies=['cb427f6dd4283','ce2df59690e60'];
const snapshot=JSON.stringify(state),html=renderClientTradeForm(state,tradeId,BASIC_CARDS[tradeId]);
assert.equal(JSON.stringify(state),snapshot,'rendering must not mutate game state');
assert.deepEqual([...html.matchAll(/data-trade-resource="(\d+)"/g)].map(match=>Number(match[1])),[0,1,2,3,4,6]);
assert.equal(html.includes('data-import-country="6"'),false,'armies cannot be imported');
assert.equal(html.includes('data-import-player="US"'),false,'a player cannot import from themselves');
assert.equal((html.match(/data-trade-region=/g)||[]).length,7);
assert.equal(html.includes('data-trade-region="M" checked'),false,'region selection never spends SP by default');
const {form,action}=read(html,form=>{
 form.querySelector('[data-export-key="4"]').value='1';
 form.querySelector('[data-import-country="0"]').value='1';
 form.querySelector('#trade-player-RU-0').value='3';
 form.querySelector('#trade-player-CN-3').value='1';
});
assert.deepEqual(action.exports,[{key:4,quantity:1}]);
assert.deepEqual(action.imports,[{key:0,countryQuantity:1,players:{RU:3}},{key:3,countryQuantity:0,players:{CN:1,EU:0}}]);
const next=applyAction(state,{type:'playBasicCard',cardId:tradeId,...action});
assert.equal(next.players.US.money,23);assert.equal(next.players.RU.money,24);assert.equal(next.players.CN.money,30);
assert.equal(next.players.RU.commerce.filter(card=>!card.ready).length,1);assert.equal(next.players.CN.commerce.filter(card=>!card.ready).length,1);
assert.equal(JSON.stringify(state),snapshot,'reading and applying a cloned action leave the original state unchanged');

// The plus button edits only its referenced input, emits the normal bubbling
// input event, and cannot operate when permission code disables the input.
const input=form.querySelector('#trade-import-0');input.value='0';input.max='2';
let edits=0,prevented=0;input.addEventListener('input',event=>{assert.ok(event.bubbles);edits++;});
const button={dataset:{tradeInput:input.id,tradeStep:'1'},disabled:false,matches(){return this.disabled;},closest(){return form;}};
const event={target:{closest:()=>button},preventDefault(){prevented++;}};
assert.equal(handleTradeControl(event),true);assert.equal(input.value,'1');assert.equal(edits,1);
input.disabled=true;handleTradeControl(event);assert.equal(input.value,'1');assert.equal(edits,1);
input.disabled=false;button.disabled=true;handleTradeControl(event);assert.equal(input.value,'1');assert.equal(edits,1);
button.disabled=false;button.dataset.tradeStep='-1';handleTradeControl(event);assert.equal(input.value,'0');assert.equal(edits,2);
assert.equal(prevented,4);assert.equal(form.querySelector('#trade-player-RU-0').value,'3');

// Regional-influence cards retain explicit allocations rather than flattening
// exports into a total and silently deciding which region earns influence.
const regional={name:'地区出口',effect:'trade',regionalInfluence:{requirements:{4:1}}};
const capacity=tradeCapacity(state,'US',regional),region=Object.keys(capacity.byRegion).find(id=>capacity.byRegion[id].exports[4]>0);
assert.ok(region);
const regionalHtml=renderClientTradeForm(state,'regional-test',regional);
assert.equal(regionalHtml.includes('data-export-key='),false);
const allocation=read(regionalHtml,form=>{form.querySelector('#trade-export-'+region+'-4').value='1';}).action;
assert.deepEqual(allocation.exports,[{key:4,quantity:1,regions:{[region]:1}}]);
assert.deepEqual(tradePreview(state,allocation,regional).bonusRegions,[region]);

// Clicking extra trade regions adds only a pending SP cost. Explicitly free
// regions and cards that forbid player trades retain their existing scope.
const selected=read(html,form=>{form.querySelector('[data-trade-region="P"]').checked=true;}).action;
assert.deepEqual(selected.tradeRegions,['P']);assert.equal(tradePreview(state,selected,BASIC_CARDS[tradeId]).smartCost,1);
assert.equal(state.players.US.smart,4);
const scoped=renderClientTradeForm(state,'scoped',{name:'限定地区',effect:'trade',tradeOnlyRegions:['E','C'],virtualRegions:['E','C'],playersTrade:false});
assert.equal(scoped.includes('data-trade-region='),false);assert.equal(scoped.includes('data-import-player='),false);
const free=renderClientTradeForm(state,'free',{name:'地区贸易',effect:'trade',virtualRegions:['E']});
assert.equal(free.includes('data-trade-region="E"'),false);

// The regular browser keeps its existing presentation, and native rendering is
// selected without changing the public renderTradeForm call signature.
const oldWindow=globalThis.window;
try{
 globalThis.window=undefined;assert.equal(renderTradeForm(state,tradeId,BASIC_CARDS[tradeId]).includes('client-trade-form'),false);
 globalThis.window={worldOrderDesktop:{}};assert.equal(renderTradeForm(state,tradeId,BASIC_CARDS[tradeId]).includes('client-trade-form'),true);
 state.tradeVersion=0;assert.ok(renderTradeForm(state,tradeId,BASIC_CARDS[tradeId]).includes('commerce-setup'));
}finally{if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;}
console.log('Client trade checks passed: six resource columns, readback through authoritative settlement, permission-safe steppers, explicit regional exports, SP preview only, restricted trade and legacy setup.');
