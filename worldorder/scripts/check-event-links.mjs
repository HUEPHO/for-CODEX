import assert from 'node:assert/strict';
import fs from 'node:fs';
import {EVENT_DATA} from '../dist/event-data.js';
import {EVENT_EFFECTS} from '../dist/event-effect-rules.js';
import {DECISION_RULES} from '../dist/event-decision-rules.js';
import {AGREEMENT_EVENTS} from '../dist/event-agreements.js';
import {EVENT_CHAINS,TURNING_EVENT_CHAINS} from '../dist/event-links.js';
import {relatedEventCards,renderEventLinks} from '../dist/event-related-cards.js';
const cards=Object.fromEntries(JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url))).map(card=>[card.id,card]));
const referenced=new Set();
for(const id of Object.keys(EVENT_DATA)){
 const related=relatedEventCards(id);assert.equal(new Set(related).size,related.length);
 for(const target of related){assert.ok(cards[target],`Missing catalogue reference from ${id}: ${target}`);assert.ok(fs.existsSync(new URL('../dist/'+cards[target].image,import.meta.url)));referenced.add(target);}
 for(const target of [...(EVENT_CHAINS[id]||[]),...(TURNING_EVENT_CHAINS[id]||[])])assert.ok(related.includes(target));
 const effect=DECISION_RULES[id]?.effect||AGREEMENT_EVENTS[id]?.effect?.cardId;if(effect)assert.ok(related.includes(effect));
}
for(const id of Object.keys(EVENT_EFFECTS))assert.ok(referenced.has(id),`Effect missing from its source event: ${id}`);
const crimea=relatedEventCards('c2356e9f50f6e');for(const id of ['cc83057306d10','c963b6d849299','cf7c0ffc48316'])assert.ok(crimea.includes(id));
const html=renderEventLinks('c2356e9f50f6e',cards);assert.equal((html.match(/data-source="view"/g)||[]).length,3);assert.doesNotMatch(html,/data-card-action|data-command/);
console.log('Event references passed: all printed chains and persistent effects have valid catalogue images; Crimea links remain view-only.');
