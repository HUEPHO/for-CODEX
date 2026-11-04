import fs from 'node:fs';
const url=new URL('../dist/cards.json',import.meta.url),cards=JSON.parse(fs.readFileSync(url));
// All 33 base faces and their second copies visually checked against supplied TTS assets.
const names=['改善后勤','军事演习','强权游戏','加强同盟','周密计划','激活盟友','分配新外交官','建立新大使馆','真知灼见','外交出访','支配力量','战略再评估','开拓新市场','保障地区和平','新战略伙伴','建设性谈判','产业扩张','探索新方案','启动重组','优化官僚机构','新议程','优化流程','繁荣时代','重审协议','经济扩张','建立贸易路线','关键经济伙伴','量化宽松','投资回报','稳定伙伴关系','贸易机会','秘密军事行动','全球部署'];
const E=(effect,props={})=>({type:'effect',card:{effect,...props}}),X={type:'extra'},D=count=>({type:'draw',count}),C=(options,count=1)=>({type:'chooseActions',options,count});
const effects={
 0:{effect:'base',maxBaseArmies:3,freeBaseDeployment:true},
 1:{effect:'reinforce',armyGain:0,maxMoves:3,resetAfterMoves:true},
 2:{effect:'base',permanentOverflow:true},
 3:{effect:'base',baseLimit:2},
 4:{effect:'sequence',steps:[D(1),E('base')]},
 5:{effect:'engage',readyBefore:2},
 6:{effect:'sequence',steps:[E('relations'),E('relations')]},
 7:{effect:'sequence',steps:[E('relations',{relationDiscount:1}),{type:'reset',region:'$region',optional:true}]},
 8:{effect:'choice',choices:['relations','engage'],diplomacyBefore:2},
 9:{effect:'sequence',steps:[E('relations'),E('engage',{targetRegion:'$region'})]},
 10:{effect:'engage',engageDiscount:'armies'},
 11:{effect:'sequence',steps:[C({relations:[E('relations')],trade:[E('trade')],move:[E('reinforce',{armyGain:0,maxMoves:2})]},2)]},
 12:{effect:'sequence',steps:[E('relations'),C({invest:[E('invest',{targetCountry:'$country'})],trade:[E('trade')]})]},
 13:{effect:'engage',engageDiscount:'allies'},
 14:{effect:'sequence',steps:[E('relations'),C({base:[E('base',{targetCountry:'$country'})],move:[E('reinforce',{armyGain:0,maxMoves:2,destinationOverride:'$region',onlyDestination:'$region'})]})]},
 15:{effect:'sequence',steps:[{type:'readyAlly'},{type:'searchRegion'}]},
 16:{effect:'sequence',steps:[{type:'upgradeProduce'},X]},
 17:{effect:'sequence',steps:[D(2),X]},
 18:{effect:'sequence',steps:[D(1),{type:'trashToPlay'}]},
 19:{effect:'sequence',trashOnPlay:true,steps:[{type:'researchPlay',maxCost:6}]},
 20:{effect:'sequence',steps:[D(3),{type:'discardToPlay',count:2}]},
 21:{effect:'sequence',steps:[E('domestic',{domesticMode:'produce',maxProduction:1}),E('domestic',{domesticMode:'growth'})]},
 22:{effect:'sequence',steps:[E('domestic',{domesticMode:'produce',maxProduction:1,fixedProductionKey:3}),C({prosperity:[{type:'prosperity',cost:2}],extra:[X]})]},
 23:{effect:'sequence',steps:[{type:'reset'},D(1),X]},
 24:{effect:'sequence',steps:[E('trade'),E('invest')]},
 25:{effect:'sequence',steps:[{type:'region'},E('trade',{virtualRegions:['$region']}),{type:'reset',region:'$region'}]},
 26:{effect:'invest',readyTarget:true,keepReady:true},
 27:{effect:'invest',moneyBefore:10},
 28:{effect:'invest',moneyPerFDI:4},
 29:{effect:'invest',investmentLimit:2},
 30:{effect:'sequence',steps:[E('trade',{maxTradeTypes:1}),X]},
 31:{effect:'base',produceArmies:true},
 32:{effect:'reinforce',armyGain:0,maxMoves:3,produceArmies:true}
};
const data={};let count=0;for(const c of cards.filter(c=>c.type==='ability'&&c.module==='base')){const index=c.sourceCardId-31900;if(!Number.isInteger(index)||index<0||index>=66)throw Error('Unverified market source '+c.id);const group=Math.floor(index/2);c.name=names[group];if(effects[group])data[c.id]={name:c.name,...effects[group]};count++;}
if(count!==66||Object.keys(data).length!==66)throw Error('Unexpected market count');
fs.writeFileSync(url,JSON.stringify(cards,null,2)+'\n');fs.writeFileSync(new URL('../dist/market-data.js',import.meta.url),'// Explicitly verified base market effects; other faces remain manual.\nexport const MARKET_CARDS='+JSON.stringify(data,null,2)+';\n');
