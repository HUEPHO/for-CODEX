import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {regionSelectionModel,activateRegionField,selectRegionTarget} from '../dist/region-selection.js';
import {readBasicForm,updateBasicForm} from '../dist/basic-actions-ui.js';
import {createState} from '../dist/engine.js';
import {newFlow} from '../dist/flow.js';
import {countryInfo,relationCountries} from '../dist/country-actions.js';
import {RESEARCH_DATA} from '../dist/research-data.js';
import {syncInfluence} from '../dist/world.js';

// Minimal form controls for the adapter contract; no game rules or UI algorithm
// is reproduced here. Actual browser interaction is checked separately.
const camel=value=>value.replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase());
class Option{
 constructor(value,{label=value,disabled=false,hidden=false,groupDisabled=false,groupHidden=false,dataset={}}={}){Object.assign(this,{value,label,textContent:label,disabled,hidden,groupDisabled,groupHidden,dataset});}
 matches(){return this.disabled;}
 closest(selector){return selector==='optgroup[disabled]'&&this.groupDisabled||selector==='optgroup[hidden]'&&this.groupHidden?{}:null;}
}
class Field extends EventTarget{
 constructor(id,values,{attributes={},label=id,hidden=false,disabled=false,type='select'}={}){
  super();Object.assign(this,{id,attributes,label,hidden,disabled,type,style:{},dataset:{},checked:false,ownerDocument:{defaultView:{Event}}});
  for(const [key,value] of Object.entries(attributes))if(key.startsWith('data-'))this.dataset[camel(key.slice(5))]=value;
  this.options=values.map(value=>typeof value==='string'?new Option(value):value);this.value=this.options[0]?.value||'';
 }
 get value(){return this._value;}
 set value(value){this._value=this.options.some(option=>option.value===value)?value:'';}
 get labels(){return [{childNodes:[{textContent:this.label},this]}];}
 getAttribute(name){return this.attributes[name]??null;}
 hasAttribute(name){return name in this.attributes;}
 matches(selector){return selector===':disabled'?this.disabled||this.groupNode?.disabled:selector===this.type;}
 closest(selector){if(selector==='label')return this.labelNode||null;if(selector==='fieldset')return this.groupNode||null;return selector.startsWith('[hidden]')&&(this.hidden||this.parentElement?.hidden||this.labelNode?.hidden||this.groupNode?.hidden)?{}:null;}
}
class Form{
 constructor(...fields){this.fields=fields;this.changes=[];for(const field of fields){field.parentElement=this;field.addEventListener('change',event=>this.changes.push({field,bubbles:event.bubbles,value:field.value,checked:field.checked}));}}
 querySelector(selector){return this.fields.find(field=>selector==='#'+field.id)||null;}
 querySelectorAll(selector){return this.fields.filter(field=>selector==='select'?field.type==='select':/^input\[data-(sequence|trade)-region\]$/.test(selector)&&field.hasAttribute(selector.slice(6,-1)));}
}

// Two movement rows cannot silently edit the first destination, and reserve /
// no-move options write the same values the existing form reader consumes.
const from0=new Field('', ['reserve','E','N'],{attributes:{'data-military-from':'0'}});
const to0=new Field('', ['', 'E','N'],{attributes:{'data-military-to':'0'}});
const from1=new Field('', ['reserve','E','N'],{attributes:{'data-military-from':'1'}});
const to1=new Field('', ['', 'E','N'],{attributes:{'data-military-to':'1'}});
const military=new Form(from0,to0,from1,to1);
assert.equal(regionSelectionModel(military).activeFieldId,null);
assert.equal(selectRegionTarget('N',{},military),false);
assert.equal(activateRegionField('military-to:1',military),true);
assert.equal(selectRegionTarget('N',{},military),true);
assert.equal(to0.value,'');assert.equal(to1.value,'N');
assert.equal(military.changes.length,1);assert.equal(military.changes[0].field,to1);assert.equal(military.changes[0].bubbles,true);
assert.equal(activateRegionField(from1,military),true);
assert.equal(selectRegionTarget('E',{},military),true);
assert.equal(selectRegionTarget('reserve',{},military),true);assert.equal(from1.value,'reserve');
assert.equal(activateRegionField('military-to:1',military),true);
assert.equal(selectRegionTarget(null,{value:''},military),true);assert.equal(to1.value,'');
military.fields=[new Field('', ['', 'E','N'],{attributes:{'data-military-to':'1'}}),new Field('', ['', 'E','N'],{attributes:{'data-military-to':'2'}})];
assert.equal(regionSelectionModel(military).activeFieldId,null,'a new DOM form must not inherit old field activation');
assert.equal(selectRegionTarget('E',{},military),false);

// Disabled/hidden controls and options cannot be edited even after activation.
const region=new Field('basic-region',['E',new Option('N',{disabled:true}),new Option('M',{hidden:true}),new Option('P',{groupDisabled:true})]);
const hidden=new Field('quick-to',['C'],{hidden:true});
const controls=new Form(region,hidden);
assert.deepEqual(regionSelectionModel(controls).fields.map(field=>field.id),['basic-region']);
assert.equal(selectRegionTarget('N',{},controls),false);assert.equal(selectRegionTarget('M',{},controls),false);assert.equal(selectRegionTarget('P',{},controls),false);
region.disabled=true;assert.equal(regionSelectionModel(controls),null);assert.equal(selectRegionTarget('E',{},controls),false);
region.disabled=false;controls.hidden=true;assert.equal(regionSelectionModel(controls),null);

// Selecting intervention and placement edits one real field at a time. Ordinary
// placement accepts a track, not arbitrary placement indexes invented by the UI.
const engageRegion=new Field('basic-region',['N','E']);
const placement=new Field('basic-slot',['permanent','temporary']);
const engage=new Form(engageRegion,placement);
assert.equal(activateRegionField('basic-region',engage),true);
assert.equal(selectRegionTarget('E',{},engage),true);
assert.equal(placement.value,'permanent');
assert.equal(activateRegionField('basic-slot',engage),true);
assert.equal(selectRegionTarget('N',{kind:'temporary'},engage),false);
assert.equal(selectRegionTarget('E',{kind:'temporary',index:99},engage),true);
assert.equal(placement.value,'temporary');assert.equal(selectRegionTarget('E',{kind:'extraPermanent'},engage),false);
assert.equal(engage.changes.length,2);

// Country-dependent placement follows the currently selected country, including
// foreign-investment host:country IDs, without retaining the previous region.
const country=new Field('sequence-foreign-country',['US:one','EU:two']);
const countrySlot=new Field('sequence-slot',['permanent','temporary']);
const investment=new Form(country,countrySlot),context={countryRegion:id=>({one:'N',two:'E'})[id]};
assert.equal(regionSelectionModel(investment,context).options[0].region,'N');
country.value='EU:two';
assert.equal(selectRegionTarget('N',{kind:'temporary'},investment,context),false);
assert.equal(selectRegionTarget('E',{kind:'temporary'},investment,context),true);
const fixed=new Form(new Field('bid-slot',['permanent','temporary'],{attributes:{'data-region-value':'S'}}));
assert.equal(regionSelectionModel(fixed).options[0].region,'S');

// A before-placement conversion changes the layout: expose only track choice,
// without promising that the new piece lands in the old board's vacant cell.
const projectedSlot=new Field('basic-slot',['permanent','temporary'],{attributes:{'data-region-value':'E'}});
const timing=new Field('basic-resilience',['before','after']);const projectedForm=new Form(projectedSlot,timing);
assert.equal(regionSelectionModel(projectedForm).projected,true);
assert.ok(regionSelectionModel(projectedForm).options.every(option=>option.projected));
assert.equal(selectRegionTarget('E',{kind:'temporary'},projectedForm),true);
timing.value='after';assert.equal(regionSelectionModel(projectedForm).projected,undefined);

// Reset/convert/swap preserve exact positions (including index zero and extra
// permanent slots); clicking a different kind/index must never pick a fallback.
const reset=new Field('sequence-reset',['E:0','N:2']);const resetForm=new Form(reset);
assert.equal(selectRegionTarget('N',{kind:'temporary',index:1},resetForm),false);
assert.equal(selectRegionTarget('N',{kind:'temporary',index:2},resetForm),true);assert.equal(reset.value,'N:2');
assert.equal(selectRegionTarget('E',{kind:'permanent',index:0},resetForm),false);
assert.equal(selectRegionTarget('E',{kind:'temporary',index:0},resetForm),true);assert.equal(reset.value,'E:0');
const swap=new Field('sequence-swap-permanent',[new Option('extraPermanent:1',{dataset:{kind:'extraPermanent',index:'1'}})],{attributes:{'data-region-value':'P'}});
assert.equal(selectRegionTarget('P',{kind:'extraPermanent',index:1},new Form(swap)),true);

// Region checkboxes set or clear only the clicked district; repeated selection is inert.
const boxE=new Field('',[],{type:'input',label:'欧洲',attributes:{'data-sequence-region':'E'}});
const boxN=new Field('',[],{type:'input',label:'中东',attributes:{'data-sequence-region':'N'}});
const multi=new Form(boxE,boxN);
assert.equal(regionSelectionModel(multi).kind,'regions');
assert.equal(selectRegionTarget('N',{},multi),true);assert.equal(boxN.checked,true);assert.equal(boxE.checked,false);
assert.equal(selectRegionTarget('N',{},multi),true);assert.equal(boxN.checked,true);assert.equal(multi.changes.length,1);
assert.equal(selectRegionTarget('N',{selected:false},multi),true);assert.equal(boxN.checked,false);assert.equal(multi.changes.length,2);
assert.ok(multi.changes.every(change=>change.field===boxN&&change.bubbles));

// Trade clicks reuse the same explicit SP-region checkboxes. They alter the
// pending form only; selecting twice cancels the region before any settlement.
const tradeM=new Field('',[],{type:'input',label:'美洲',attributes:{'data-trade-region':'M'}});
const tradeP=new Field('',[],{type:'input',label:'亚太',attributes:{'data-trade-region':'P'}});
const tradeHidden=new Field('',[],{type:'input',label:'欧洲',hidden:true,attributes:{'data-trade-region':'E'}});
const tradeDisabled=new Field('',[],{type:'input',label:'中东',disabled:true,attributes:{'data-trade-region':'N'}});
const tradeRegions=new Form(tradeM,tradeP,tradeHidden,tradeDisabled);
assert.equal(regionSelectionModel(tradeRegions).activeFieldId,'trade-regions');
assert.deepEqual(regionSelectionModel(tradeRegions).options.map(option=>option.region),['M','P']);
assert.equal(selectRegionTarget('P',{},tradeRegions),true);assert.equal(tradeP.checked,true);assert.equal(tradeM.checked,false);
assert.equal(selectRegionTarget('P',{},tradeRegions),true);assert.equal(tradeP.checked,true);
assert.equal(selectRegionTarget('P',{selected:false},tradeRegions),true);assert.equal(tradeP.checked,false);
assert.equal(selectRegionTarget('N',{},tradeRegions),false);assert.equal(selectRegionTarget('E',{},tradeRegions),false);
assert.ok(tradeRegions.changes.every(change=>change.field===tradeP&&change.bubbles));
const mixedRegions=new Form(boxE,boxN,tradeM,tradeP);
assert.equal(regionSelectionModel(mixedRegions).activeFieldId,null);
assert.equal(activateRegionField('trade-regions',mixedRegions),true);
assert.equal(selectRegionTarget('M',{},mixedRegions),true);assert.equal(tradeM.checked,true);assert.equal(boxE.checked,false);

// The actual basic-action preview distinguishes a new ally (no influence) from
// upgrading a ready starting ally. Switching targets must restore controls and
// must discard an optional conversion that no longer applies to the new ally.
const cards=JSON.parse(readFileSync(new URL('../dist/cards.json',import.meta.url),'utf8'));
const state=createState(cards,{dd:true,wit:true},()=>.5),player=state.players.US;
state.round=4;state.phase='行动';state.flow=newFlow(['US','CN','EU','RU'],4);state.actionTurns={index:0,completed:{US:0,CN:0,EU:0,RU:0}};
for(const p of Object.values(state.players)){p.openingChoices=null;p.assetChoices=null;p.objectiveChoices=null;}
player.hand=['c27ef4c355438'];player.growth=['cc77fe93f8768'];player.money=100;player.resources[5]=10;player.exhaustedAllies=[];
const names=new Set(player.allies.map(id=>countryInfo(id).countryName));
const upgrade=Object.keys(RESEARCH_DATA).find(id=>RESEARCH_DATA[id].countryName&&names.has(RESEARCH_DATA[id].countryName)&&!RESEARCH_DATA[id].starting&&!RESEARCH_DATA[id].blockedPowers.includes('US'));
const newcomer=relationCountries(state).find(id=>!names.has(countryInfo(id).countryName));
assert.ok(upgrade&&newcomer);
state.regions[countryInfo(upgrade).region].available.push(upgrade);
state.regions[countryInfo(upgrade).region].temporary=['US'];syncInfluence(state.regions[countryInfo(upgrade).region]);
const allyField=new Field('basic-country',[newcomer,upgrade]);
const allySlot=new Field('basic-slot',['temporary','permanent']);allySlot.labelNode={hidden:false};
const resilience=new Field('basic-resilience',['','before','after']);resilience.groupNode={hidden:false,disabled:false};
const conversion=new Field('basic-convert',['0']);conversion.groupNode=resilience.groupNode;
const submit=new Field('commit-basic',[],{type:'button'}),output=new Field('basic-preview',[],{type:'p'});
const allyForm=new Form(allyField,allySlot,resilience,conversion,submit,output);allyForm.dataset={cardId:'c27ef4c355438'};
const previousDocument=globalThis.document;
globalThis.document={querySelector:selector=>selector==='#basic-form'?allyForm:allyForm.querySelector(selector),querySelectorAll:selector=>allyForm.querySelectorAll(selector)};
try{
 const catalogue=Object.fromEntries(cards.map(card=>[card.id,card])),snapshot=JSON.stringify(state),lookup={countryRegion:id=>countryInfo(id).region};
 updateBasicForm(state,catalogue);assert.equal(allySlot.labelNode.hidden,true);assert.equal(allySlot.disabled,true);assert.equal(regionSelectionModel(allyForm,lookup),null);assert.equal(submit.disabled,false);
 allyField.value=upgrade;updateBasicForm(state,catalogue);assert.equal(allySlot.labelNode.hidden,false);assert.equal(allySlot.disabled,false);assert.ok(regionSelectionModel(allyForm,lookup).fields.some(field=>field.id==='basic-slot'));
 resilience.value='before';allyField.value=newcomer;updateBasicForm(state,catalogue);
 assert.equal(allySlot.labelNode.hidden,true);assert.equal(resilience.groupNode.hidden,true);assert.equal(resilience.value,'');assert.equal(readBasicForm().resilience,null);assert.equal(submit.disabled,false);
 allyField.value=upgrade;updateBasicForm(state,catalogue);assert.equal(allySlot.labelNode.hidden,false);assert.equal(allySlot.value,'temporary');assert.equal(submit.disabled,false);
 assert.equal(JSON.stringify(state),snapshot,'form visibility and preview must not change game state');
}finally{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;}
console.log('Region selection checks passed: explicit movement fields, reserve/cancel, stale form isolation, hidden/disabled targets, placement context, exact slots and checkbox change events.');
