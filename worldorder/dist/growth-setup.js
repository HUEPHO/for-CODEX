// Four-player physical stock: base rulebook p.5/p.8, D&D p.3/p.18,
// cross-checked against individual GrowthCard GUIDs in the supplied TTS save.
// Catalog rows are faces, not quantities. A repeated ID here is a separate copy;
// growth is public and a player can only own one card of each level.
export const GROWTH_FAMILIES=[
 {level:1,module:'base',ids:['c4d47a6c6a782','c572f0882386c','ce336ecf1308a']},
 {level:1,module:'base',ids:Array(3).fill('c7efaad90fb20')},
 {level:2,module:'base',ids:['cd3313f35a370','c0b656530511c']},
 {level:2,module:'base',ids:['c7909871b7d55','c92d9ad4ae11a']},
 {level:3,module:'base',ids:['cee1874f2f132','ce43169d9bd50']},
 {level:3,module:'base',ids:['c386219d064c0','c5cc292049dc5']},
 {level:4,module:'base',ids:['cc77fe93f8768','cc645d3e86dbb']},
 {level:4,module:'base',ids:['c2ac1e1f24d0a','cce29904c1493']},
 {level:5,module:'base',ids:['c1bf67a041724']},
 {level:5,module:'base',ids:['c636f4238eeba']},
 {level:1,module:'dd',ids:Array(3).fill('cd18c8e5a0461')},
 {level:1,module:'dd',ids:Array(3).fill('c74931cfb3833')},
 {level:2,module:'dd',ids:Array(2).fill('cfeb2319d6850')},
 {level:2,module:'dd',ids:Array(2).fill('c0ec0ed27c8bf')},
 {level:3,module:'dd',ids:Array(2).fill('ca11b52d5e0ad')},
 {level:3,module:'dd',ids:Array(2).fill('c142f2edba533')},
 {level:4,module:'dd',ids:Array(2).fill('c70881ee5c146')},
 {level:4,module:'dd',ids:Array(2).fill('c2b12b9e97150')},
 {level:5,module:'dd',ids:['ce1643bee59d6']},
 {level:5,module:'dd',ids:['ca9c4244506cd']}
];
export const GROWTH_MODES={base:'基础发展牌',expansion:'仅扩展发展牌',families:'每级随机两种能力',mixed:'每级混洗抽取'};
const familyById=new Map(GROWTH_FAMILIES.flatMap((family,index)=>family.ids.map(id=>[id,index])));
// Display one stack per printed ability while retaining every physical ID in state.
export function growthSupplyGroups(ids){
 const groups=new Map();
 for(const id of ids){const key=familyById.get(id)??id;let group=groups.get(key);if(!group){group={id,ids:[],count:0};groups.set(key,group);}group.count++;if(!group.ids.includes(id))group.ids.push(id);}
 return [...groups.values()];
}
export function growthMode(config){
 if(!config.dd)return 'base';
 const mode=config.growthMode??'families';if(!Object.hasOwn(GROWTH_MODES,mode))throw Error('无效的发展牌配置');return mode;
}
function shuffled(items,rng){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
export function buildGrowthSupply(config,rng=Math.random){
 const mode=growthMode(config),supply=[];
 for(let level=1;level<=5;level++){
  const families=GROWTH_FAMILIES.filter(g=>g.level===level);
  if(mode==='mixed')supply.push(...shuffled(families.flatMap(g=>g.ids),rng).slice(0,level===1?6:level===5?2:4));
  else supply.push(...(mode==='families'?shuffled(families,rng).slice(0,2):families.filter(g=>g.module===(mode==='expansion'?'dd':'base'))).flatMap(g=>g.ids));
 }
 return supply;
}
