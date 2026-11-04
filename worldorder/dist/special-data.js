// Card faces verified against the supplied TTS images, never inferred from cost.
import {DD_ASSET_NAMES,DD_ASSET_CARDS} from './dd-asset-data.js';
const E=(effect,props={})=>({type:'effect',card:{effect,...props}});
const I=props=>({type:'influence',...props}),C=options=>({type:'chooseActions',count:1,options}),G=gain=>({type:'gain',gain}),P=cost=>({type:'pay',cost});
const M=(region,minMoves,maxMoves,moveCost=5)=>E('reinforce',{armyGain:0,minMoves,maxMoves,moveCost,destinationOverride:region,onlyDestination:region});
const asset=(owner,id,steps)=>({source:'asset',owner,name:ASSET_NAMES[id],effect:'sequence',steps});
export const EXECUTIVE_BY_POWER={US:'ceee39575b136',CN:'c1cdddb29f30a',EU:'ce28c89c59c1e',RU:'c43ba0184ec58'};
export const ASSET_NAMES={
 ...DD_ASSET_NAMES,
 ca58c2d75ac35:'美国海军',cd9aca36eefd7:'研发冠军',c9cdadd802619:'武器出口',c75585a29d3f6:'北约',c65d379ffec4d:'联合国赞助人',
 c51627f6d0b9e:'一带一路倡议',c505b0ec5fbae:'金砖国家',cdf8936ad3068:'南海扩张',c5897c7e5dfcb:'快速工业化',c1f29fbd68d66:'上海合作组织',
 ce4421896167f:'北约',c08f0d8a00ec7:'欧盟睦邻政策',c7a839a0105f2:'欧洲品牌',c8a402f5325e9:'欧洲中央银行',cd373c6b79e0f:'欧盟扩张',
 cc55c9955c210:'新能源市场',c47cee26aebf3:'私营军事集团',cf64a7ea0ed57:'武器出口',c0c78fc3e0cad:'集体安全条约组织',c78120c3201e6:'网络攻击'
};
const executives=Object.fromEntries(Object.entries(EXECUTIVE_BY_POWER).map(([owner,id])=>[id,{source:'executive',owner,name:'行政命令',effect:'sequence',steps:[{type:'chooseActions',count:1,options:{
 relations:[E('relations')],engage:[E('engage')],trade:[E('trade')],invest:[E('invest')],move:[E('reinforce',{armyGain:1,maxMoves:owner==='RU'?3:2})],base:[E('base')],growth:[E('domestic',{domesticMode:'growth'})],produce:[E('domestic',{domesticMode:'produce',maxProduction:3})]
}}]}]));
export const SPECIAL_CARDS={...executives,...DD_ASSET_CARDS,
 ca58c2d75ac35:asset('US','ca58c2d75ac35',[{type:'regions',min:0,max:2,excludeRegion:'C',note:'每个所选地区移动2军队，每支共支付10资金；全部移动完成后，再依次添加影响力。'},{type:'forRegions',steps:[M('$region',2,2,10)]},{type:'forRegions',steps:[I({region:'$region'})]}]),
 cd9aca36eefd7:asset('US','cd9aca36eefd7',[E('domestic',{domesticMode:'produce',maxProduction:2}),E('domestic',{domesticMode:'growth'})]),
 c9cdadd802619:asset('US','c9cdadd802619',[I({cost:{resources:{6:2}},gain:{money:20}})]),
 cf64a7ea0ed57:asset('RU','cf64a7ea0ed57',[I({cost:{resources:{6:2}},gain:{money:20}})]),
 c75585a29d3f6:asset('US','c75585a29d3f6',[{type:'region',regions:['E','N','C']},M('$region',2,2),I({region:'$region',permanent:true}),G({resources:{5:2}})]),
 ce4421896167f:asset('EU','ce4421896167f',[I({regions:['E','N','C'],cost:{money:10,resources:{5:2}},supplyArmies:2,permanent:true})]),
 cdf8936ad3068:asset('CN','cdf8936ad3068',[M('P',1,3),I({region:'P',permanent:true})]),
 c0c78fc3e0cad:asset('RU','c0c78fc3e0cad',[P({resources:{5:1}}),M('C',0,2,0),I({region:'C',permanent:true})]),
 c47cee26aebf3:asset('RU','c47cee26aebf3',[I({regions:['E','N','A','C'],cost:{money:20},supplyArmies:1}),C({repeat:[I({regions:['E','N','A','C'],excludeRegion:'$region',cost:{money:20},supplyArmies:1})],skip:[]})]),
 c78120c3201e6:asset('RU','c78120c3201e6',[I({cost:{resources:{4:1}},resetBefore:true})]),
 c65d379ffec4d:asset('US','c65d379ffec4d',[{type:'fundDiplomacy'},E('engage',{allowNoAlly:true})]),
 c51627f6d0b9e:asset('CN','c51627f6d0b9e',[E('invest'),C({invest:[E('invest',{moneySurcharge:10,excludeRegion:'$region'})],skip:[]})]),
 c505b0ec5fbae:asset('CN','c505b0ec5fbae',[{type:'regions',min:2,max:2,regions:['M','A','S'],note:'支付30资金，依次添加影响力；之后由俄罗斯决定是否参与剩下的地区。'},P({money:30}),{type:'forRegions',steps:[I({region:'$region'})]},{type:'response',player:'RU',region:'$remainingRegion',upToMoney:20}]),
 c5897c7e5dfcb:asset('CN','c5897c7e5dfcb',[{type:'industrialize'},{type:'extra'}]),
 c1f29fbd68d66:asset('CN','c1f29fbd68d66',[E('relations',{allowedRegions:['N','C','S','P']}),C({invest:[E('invest',{targetCountry:'$country'})],base:[E('base',{targetCountry:'$country'})],engage:[E('engage',{targetRegion:'$region'})],skip:[]})]),
 c08f0d8a00ec7:asset('EU','c08f0d8a00ec7',[E('engage',{allowedRegions:['E','N','C'],allowNoAlly:true}),C({repeat:[E('engage',{allowedRegions:['E','N','C'],allowNoAlly:true,moneySurcharge:10,excludeRegion:'$region'})],skip:[]})]),
 c8a402f5325e9:asset('EU','c8a402f5325e9',[G({money:20}),E('domestic',{domesticMode:'growth',serviceMoneyCost:10})]),
 c7a839a0105f2:asset('EU','c7a839a0105f2',[{type:'region',excludeRegion:'E'},E('trade',{virtualRegions:['$region'],regionalInfluence:{regions:['$region'],requirements:{3:1,4:1}}})]),
 cc55c9955c210:asset('RU','cc55c9955c210',[{type:'regions',min:2,max:2,note:'仅与这两个地区的盟国和展示国家贸易；能源符号加倍。分别出口至少4能源的地区各添加1影响力。'},E('trade',{tradeOnlyRegions:'$regions',virtualRegions:'$regions',doubleEnergy:true,playersTrade:false,regionalInfluence:{regions:'$regions',requirements:{0:4}}})]),
 cd373c6b79e0f:asset('EU','cd373c6b79e0f',[E('relations',{allowedRegions:['E']}),C({extend:[I({region:'E',cost:{resources:{5:2}},permanent:true})],skip:[]})])
};
