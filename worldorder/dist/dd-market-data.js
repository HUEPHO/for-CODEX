// Diplomacy & Dominance ability faces verified from the supplied TTS images.
const detente={name:'外交缓和',module:'dd',effect:'sequence',steps:[{type:'effect',card:{effect:'engage'}},{type:'returnArmy',region:'$region',cost:{resources:{5:1}},optional:true}]};
const subversion={name:'金融颠覆',module:'dd',effect:'sequence',steps:[{type:'foreignInvestment',optional:true}]};
const showOfForce={name:'力量展示',module:'dd',effect:'sequence',steps:[{type:'effect',card:{effect:'base'}},{type:'chooseActions',count:1,note:'可支付通常移动费5资金，把1军队移入刚建基地的地区；然后其他每位玩家各自横置当地1个未横置盟国。',options:{move:[{type:'effect',card:{effect:'reinforce',armyGain:0,minMoves:1,maxMoves:1,onlyDestination:'$region',destinationOverride:'$region'}},{type:'exhaustOpponents',region:'$region'}],skip:[]}}]};
const intelligence={name:'情报窃取',module:'dd',effect:'sequence',steps:[{type:'inspectOpponent'},{type:'copyAbility',player:'$inspectedPlayer'}]};
export const DD_MARKET_CARDS={ceae8326b655e:detente,c97673dfea828:detente,c033be37f442d:subversion,c2381e267cd41:subversion,cbf79cb4a95c0:showOfForce,cf813d3206bfa:showOfForce,c8bdff4e4f259:intelligence,c4c7a1bd4db53:intelligence};
