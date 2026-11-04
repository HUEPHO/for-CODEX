// Names and effects transcribed from the supplied D&D card faces.
export const DD_ASSET_NAMES={
 c3dc6bb01a4f1:'贸易顺差',c06283f0fe2f0:'北京共识',c673c7b050e62:'全球制造中心',
 c09d55b7002c1:'中央情报局',ca1a2248b231e:'经济与军事援助',c4ec4c6092f1b:'政权更迭',
 c5a55e16cba89:'经济巨头',cba3601ccacd0:'“全球门户”倡议',cb0fb3de3c6c2:'共同外交与安全政策',
 ce1c7bf1695c3:'核子试爆',c64bb44df5c8b:'政权更迭',c22451cc98803:'金砖国家'
};
const E=(effect,props={})=>({type:'effect',card:{effect,...props}});
const I=props=>({type:'influence',...props});
const asset=(owner,id,steps)=>({source:'asset',module:'dd',owner,name:DD_ASSET_NAMES[id],effect:'sequence',steps});
export const DD_ASSET_CARDS={
 c06283f0fe2f0:asset('CN','c06283f0fe2f0',[{type:'beijingConsensus'},E('engage',{allowNoAlly:true})]),
 cb0fb3de3c6c2:asset('EU','cb0fb3de3c6c2',[E('domestic',{domesticMode:'produce',maxProduction:2,allowedProductionKeys:[5,6],exhaustAlly:'ca03520c27e87',exhaustAllyLabel:'欧盟成员国'}),{type:'chooseActions',count:1,options:{engage:[E('engage')],base:[E('base')]}}]),
 c4ec4c6092f1b:asset('US','c4ec4c6092f1b',[{type:'regimeChange',excludePlayers:['EU']},I({region:'$region'})]),
 c64bb44df5c8b:asset('RU','c64bb44df5c8b',[{type:'regimeChange',excludePlayers:['CN']},I({region:'$region'})]),
 ca1a2248b231e:asset('US','ca1a2248b231e',[{type:'aidAllies'},{type:'forRegions',steps:[I({region:'$region'})]}]),
 c09d55b7002c1:asset('US','c09d55b7002c1',[{type:'swapInfluence',cost:{money:10}},{type:'chooseActions',count:1,options:{repeat:[{type:'swapInfluence',excludeRegion:'$region',cost:{resources:{4:1}}}],skip:[]}}]),
 c3dc6bb01a4f1:asset('CN','c3dc6bb01a4f1',[E('trade',{regionalInfluence:{minimumRevenue:35}})]),
 c673c7b050e62:asset('CN','c673c7b050e62',[{type:'chooseActions',count:2,options:{trade:[E('trade')],produce:[E('domestic',{domesticMode:'produce',maxProduction:3,allowedProductionKeys:[0,1,3]})]}}]),
 ce1c7bf1695c3:asset('RU','ce1c7bf1695c3',[{type:'pay',cost:{money:25,resources:{4:1}}},{type:'supplyArmies',regions:['E','C','P'],count:1},I({regions:['E','C','P']})]),
 c22451cc98803:asset('RU','c22451cc98803',[{type:'regions',min:2,max:2,regions:['M','A','S'],note:'支付30资金，依次添加影响力；之后由中国决定是否参与剩下的地区。'},{type:'pay',cost:{money:30}},{type:'forRegions',steps:[I({region:'$region'})]},{type:'response',player:'CN',region:'$remainingRegion',upToMoney:20}]),
 c5a55e16cba89:asset('EU','c5a55e16cba89',[{type:'chooseActions',count:2,options:{trade:[E('trade')],produce:[E('domestic',{domesticMode:'produce',maxProduction:2})],invest:[E('invest')]}}]),
 cba3601ccacd0:asset('EU','cba3601ccacd0',[E('invest'),{type:'chooseActions',count:1,options:{invest:[E('invest',{moneySurcharge:10,excludeRegion:'$region'})],skip:[]}}])
};
