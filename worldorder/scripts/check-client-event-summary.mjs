import assert from 'node:assert/strict';
import fs from 'node:fs';
import {clientEventSummaryModel,renderClientEventSummary} from '../dist/client-event-summary.js';
import {POWERS} from '../dist/game-constants.js';
import {REGION_COLORS} from '../dist/region-presentation.js';

const publicId='c963b6d849299',globalId='c16291ef10b12',personalId='ca8e271f31adf';
const state={config:{wit:true},current:'CN',events:[publicId],eventBoard:{slots:[null,publicId,globalId],personal:{US:'c98613bb22860',CN:personalId,EU:null,RU:null}},flow:{eventResolution:{cardId:globalId,mode:'bid',stage:'bid'}}};
const before=JSON.stringify(state),model=clientEventSummaryModel(state);
assert.deepEqual(model.public.events.map(event=>event.id),[publicId,globalId]);
assert.equal(model.public.events[0].title,'明斯克协议');
assert.equal(model.public.events[0].typeLabel,'共同协议');
assert.equal(model.public.events[0].regionLabel,'欧洲');
assert.equal(model.public.events[0].participantLabel,'欧盟、俄罗斯');
assert.deepEqual(model.public.events[0].regionIds,['E']);
assert.deepEqual(model.public.events[0].participantIds,['EU','RU']);
assert.equal(model.public.events[1].regionLabel,'牌面未指定区域','No inference of a worldwide region from an empty printed region list');
assert.equal(model.public.events[1].status,'正在结算');
assert.deepEqual(model.personal.events.map(event=>event.id),['c98613bb22860',personalId]);
assert.equal(model.personal.title,'个人事件');
assert.deepEqual(model.personal.events.map(event=>[event.owner,event.ownerLabel,event.self]),[['US','美国',false],['CN','中国',true]]);
assert.equal(clientEventSummaryModel(state,{}, {viewer:'US'}).personal.events[0].self,true);
assert.equal(clientEventSummaryModel(state,{}, {viewer:null}).personal.events.some(event=>event.self),false);
const duplicate={config:{wit:true},current:'RU',eventBoard:{slots:[],personal:{US:personalId,CN:null,EU:personalId,RU:null}}};
assert.deepEqual(clientEventSummaryModel(duplicate).personal.events.map(event=>[event.id,event.owner]),[[personalId,'US'],[personalId,'EU']],'Keep every supplied public owner entry, without inventing events for empty seats');
assert.equal((renderClientEventSummary(duplicate).match(/data-client-event-id=/g)||[]).length,2);
assert.equal(JSON.stringify(state),before,'Summary projection is immutable');

// The view must stay safe even when given full local state rather than a
// server-sanitized seat view. Fail on access, not just on accidental rendering.
const secret=()=>{throw Error('Private event information accessed');};
for(const key of ['eraDeck','era2Deck','eventHistory','players'])Object.defineProperty(state,key,{get:secret});
for(const key of ['choice','queued','seen','revealQueue'])Object.defineProperty(state.eventBoard,key,{get:secret});
for(const key of ['submissions','totals','sideTotals','receipts','before','modifiers','rewardQueue'])Object.defineProperty(state.flow.eventResolution,key,{get:secret});
const html=renderClientEventSummary(state);
assert.equal((html.match(/<section /g)||[]).length,2);
assert.equal((html.match(/data-client-event-id=/g)||[]).length,4);
assert.match(html,new RegExp(`data-client-event-id="${publicId}" data-client-event-group="public"`));
assert.match(html,new RegExp(`data-client-event-id="${personalId}" data-client-event-group="personal"`));
assert.match(html,/class="client-event-row is-self"[^>]*data-client-event-owner="CN"/);
assert.doesNotMatch(html,/data-card-action|event-submit|投标数/);
assert.deepEqual(clientEventSummaryModel(state),model);
state.flow.eventResolution.stage='result';
assert.equal(clientEventSummaryModel(state).public.events[1].status,'结果待确认');

const disabled={config:{wit:false}};
Object.defineProperty(disabled,'eventBoard',{get:secret});
assert.deepEqual(clientEventSummaryModel(disabled).public.events,[]);
assert.match(renderClientEventSummary(disabled),/本局未开启 WIT 事件扩展/);
const empty=clientEventSummaryModel({config:{wit:true},current:'EU',eventBoard:{slots:[null,null,null],personal:{}}});
assert.equal(empty.public.empty,'当前没有公共事件');
assert.equal(empty.personal.empty,'当前没有已公开的个人事件');

const unknown='unknown\"<event>';
const legacy={config:{wit:true},current:'RU',events:[unknown,null]};
assert.equal(clientEventSummaryModel(legacy,{[unknown]:{name:'未知 <牌面>'}}).public.events[0].title,'未知 <牌面>');
assert.match(renderClientEventSummary(legacy,{[unknown]:{name:'未知 <牌面>'}}),/未知 &lt;牌面&gt;/);
assert.doesNotMatch(renderClientEventSummary(legacy),/unknown"<event>/);

const eventHtml=id=>renderClientEventSummary({config:{wit:true},events:[id],current:'US'});
const titleHtml=id=>eventHtml(id).match(/<span class="client-event-title">(.*?)<\/span><span class="client-event-meta">/)[1];
assert.match(eventHtml(publicId),new RegExp(`--client-event-background:color-mix\\(in srgb,${REGION_COLORS.E} 34%,#0c1c28\\)`));
assert.doesNotMatch(eventHtml(globalId),/--client-event-background:/,'Events with no printed region retain a neutral background');
const multi=eventHtml('cfeeeba9da48c');
assert.match(multi,/--client-event-background:linear-gradient\(115deg,/);
for(const region of ['E','N','S'])assert.ok(multi.includes(REGION_COLORS[region]),'Multi-region event uses every printed region color');
for(const owner of ['EU','RU'])assert.match(eventHtml(publicId),new RegExp(`data-event-power="${owner}" style="--client-event-power-color:${POWERS[owner].color}"><img[^>]*data-power-flag="${owner}"[^>]*>${POWERS[owner].name}<`));
assert.match(titleHtml('cb7934569eecb'),/data-event-power="RU"[^>]*><img[^>]*data-power-flag="RU"[^>]*>俄罗斯<\/span>—朝鲜同盟/);
assert.match(titleHtml('ce97d5ccaf589'),/data-event-power="CN"[^>]*><img[^>]*data-power-flag="CN"[^>]*><\/span><span[^>]*data-event-power="US"[^>]*><img[^>]*data-power-flag="US"[^>]*><\/span>贸易战/);
assert.match(titleHtml('caa9567066a40'),/data-event-power="CN"[^>]*><img[^>]*data-power-flag="CN"[^>]*><\/span><span[^>]*data-event-power="RU"[^>]*><img[^>]*data-power-flag="RU"[^>]*><\/span>美洲纽带/);
assert.doesNotMatch(titleHtml('c7787ad7ef400'),/data-event-power=/,'Do not color Central Asia as China');
assert.doesNotMatch(titleHtml('c2a6d1615b971'),/data-event-power=/,'Do not color Middle East as China');
const escaped=renderClientEventSummary(legacy,{[unknown]:{name:'<img src=x>中国&美国'}});
assert.match(escaped,/&lt;img src=x&gt;/);assert.doesNotMatch(escaped,/<img src=x>/);
assert.match(escaped,/data-event-power="CN"/);assert.match(escaped,/&amp;/);
// Supplying the real catalogue displays original faces for already public IDs.
// The existing guarded state still rejects all hidden decks and event bids.
const catalogue=Object.fromEntries(JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url),'utf8')).map(card=>[card.id,card]));
const illustrated=renderClientEventSummary(state,catalogue);
assert.equal((illustrated.match(/class="client-event-art"/g)||[]).length,4);
assert.match(illustrated,new RegExp(`src="${catalogue[publicId].image}"`));
assert.match(illustrated,/client-event-row--art/);
assert.doesNotMatch(illustrated,/class="client-event-title"|class="client-event-meta"/,'Printed faces replace repeated metadata and titles');
assert.match(illustrated,/data-client-event-owner="CN"/);assert.match(illustrated,/结果待确认/);
console.log('Client event summary passed: public ownership, metadata-only region colors and power names, neutral/multiple regions, safe title coloring, escaping and no private event reads.');
