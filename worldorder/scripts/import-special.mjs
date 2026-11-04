import fs from 'node:fs';
import {ASSET_NAMES,EXECUTIVE_BY_POWER} from '../dist/special-data.js';
const path=new URL('../dist/cards.json',import.meta.url),cards=JSON.parse(fs.readFileSync(path));
for(const c of cards){if(ASSET_NAMES[c.id])c.name=ASSET_NAMES[c.id];const owner=Object.keys(EXECUTIVE_BY_POWER).find(p=>EXECUTIVE_BY_POWER[p]===c.id);if(owner){c.name='行政命令';c.owner=owner;}}
fs.writeFileSync(path,JSON.stringify(cards,null,2)+'\n');
