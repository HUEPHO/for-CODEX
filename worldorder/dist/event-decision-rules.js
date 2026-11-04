// Personal decisions describe their printed choices here. No state, reducer or
// view imports: adding another decision with these mechanics adds only data.
const definitions={
 c171711d668df:{
  key:'rcep',name:'区域全面经济伙伴关系',owner:'CN',
  prompt:'支付外交（基础5，每个亚太盟国减1），获得2 SP并提升一项产能1级；之后可在亚太正常付费投资一位本方盟国。',
  cost:{diplomacy:5},discounts:[{regions:['P'],amount:1}],smart:2,
  production:{amount:1},investment:{regions:['P']}
 },
 cf7279a3c54ad:{
  key:'saudiIran',name:'沙特—伊朗和解',owner:'CN',
  prompt:'支付外交（基础4，伊朗、沙特阿拉伯每个盟国减2），获得2 SP并在中东添加1影响力。',
  cost:{diplomacy:4},discounts:[{countries:['Iran','Saudi Arabia'],amount:2}],smart:2,influence:{region:'N'}
 },
 cc241e068f335:{
  key:'abraham',name:'亚伯拉罕协议',owner:'US',
  prompt:'支付外交（基础6，每个中东盟国减1；以色列、苏丹、阿联酋每个盟国额外减1），获得2 SP并在中东添加1影响力。',
  cost:{diplomacy:6},discounts:[{regions:['N'],amount:1},{countries:['Israel','Sudan','UAE'],amount:1}],smart:2,influence:{region:'N'},chain:{cardId:'c2a6d1615b971',when:'always'}
 },
 c98613bb22860:{
  key:'usmca',name:'美墨加协定（USMCA）',owner:'US',
  prompt:'支付15资金和2外交（拥有加拿大盟国时免外交），获得2 SP、提升一项产能1级并在美洲添加1影响力。',
  cost:{money:15,diplomacy:2},discounts:[{countries:['Canada'],amount:2}],smart:2,production:{amount:1},influence:{region:'M'}
 },
 c7e6c1d828339:{
  key:'eaeu',name:'欧亚经济联盟',owner:'RU',
  prompt:'支付10资金、2能源和外交（基础2，哈萨克斯坦、吉尔吉斯斯坦每个盟国减1），获得2 SP、中亚1影响力和欧亚经济联盟持续贸易效果。',
  cost:{money:10,energy:2,diplomacy:2},discounts:[{countries:['Kazakhstan','Kyrgyzstan'],amount:1}],smart:2,influence:{region:'C'},effect:'c93edef6ccf8a'
 },
 c0e00a3125aa7:{
  key:'cee',name:'中国—中东欧16+1倡议',owner:'CN',
  prompt:'支付25资金和2外交，获得1 SP、欧洲1影响力及中国—中东欧倡议持续收益效果；欧盟立即获得10资金。',
  cost:{money:25,diplomacy:2},smart:1,influence:{region:'E'},effect:'c09c854e149a8',otherMoney:[{owner:'EU',amount:10}]
 },
 c2885a67a8cb7:{
  key:'iran',name:'中伊全面战略伙伴关系',owner:'CN',
  prompt:'支付20资金和2外交（拥有伊朗盟国时免外交），获得2 SP、中东1影响力及中伊全面战略伙伴关系持续收益效果。',
  cost:{money:20,diplomacy:2},discounts:[{countries:['Iran'],amount:2}],smart:2,influence:{region:'N'},effect:'ccd84d77f9734'
 }
};
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
export const DECISION_RULES=freeze(definitions);
export function decisionDefinition(id){return Object.hasOwn(DECISION_RULES,id)?DECISION_RULES[id]:null;}
