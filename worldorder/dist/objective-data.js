// All 32 supplied D&D objective faces. Thresholds are round 3 / round 6.
const task=(metric,label,threshold=1,options={})=>({metric,label,threshold,...options});
const inf=(regions,n)=>task('influence',`${regions||'主地图'}地区影响力至少 {n}`,n,{regions});
const armies=(regions,n)=>task('armies',`${regions}地区军队合计至少 {n}`,n,{regions});
const allies=(regions,n)=>task('allies',`${regions||'全部'}地区盟国至少 {n}`,n,{regions});
const lead=(metric,regions,compare='most',opponents)=>task(metric,`${regions||'主地图'}地区${metric==='influence'?'影响力':'军队'}${compare==='most'?'最多（允许并列）':compare==='sum'?'多于其他玩家总和':'严格多于'+(opponents?.join('／')||'每位其他玩家')}`,1,{regions,compare,opponents});
const coverage=(metric,minimum,n,compare)=>task('coverage',`至少 {n} 个地区${compare?(metric==='armies'?'军队':'影响力')+(compare==='most'?'最多（允许并列）':'严格多于每位其他玩家'):`拥有至少 ${minimum} ${metric==='allies'?'个盟国':metric==='armies'?'支军队':'点影响力'}`}`,n,{of:metric,minimum,compare});
const resource=(key,n)=>task('resource',`${['能源','原料','粮食','消费品','服务','外交','待命军队'][key]}至少 {n}`,n,{key});
const production=(keys,n=1)=>task('productionEach',`${keys.map(k=>['能源','原料','粮食','消费品','服务','外交','军队'][k]).join('、')}产能各提升至少 {n}`,n,{keys});
const money=n=>task('money','资金至少 {n}',n);
const prosperity=n=>task('prosperity','繁荣至少提升 {n} 次',n);
const growth=()=>task('growth','至少 {n} 张发展卡',[3,4]);
const deck=()=>task('deckSize','牌组至少 {n} 张能力牌（含手牌、打出区和弃牌）',[16,19]);
const fdi=(n,options={})=>task('fdiCountries',`${options.regions?options.regions+'地区':''}至少 {n} 个${options.ownAllies?'本方盟国':'国家'}有本方投资标记${options.direction?'，且可向其出口能源或原料':''}`,n,options);
const objective=(owner,name,rewards,tasks)=>({owner,name,rewards:[0,...rewards],tasks});
const low=[1,3,5],mid=[2,4,7],high=[3,6,9];
export const OBJECTIVE_DATA={
 c58ee9a4d1ba1:objective('EU','创新中心',low,[growth(),task('productionByRound','服务／消费品与服务产能均已提升',1,{keys:[[4],[3,4]]}),resource(4,2)]),
 c32f13f01ac98:objective('EU','规范力量',low,[task('allies','盟国数严格多于每位其他玩家',1,{compare:'more'}),coverage('allies',2,[4,5]),task('engage','主地图至少 {n} 个本方介入标记')]),
 c0dc699bce5c0:objective('EU','欧洲道路',low,[resource(5,4),allies(null,[8,12]),coverage('allies',1,[6,7])]),
 c80f90470f195:objective('EU','边境安全',mid,[lead('influence','E'),inf('N',[3,4]),armies('EN',[3,5])]),
 c6a32c8dd0221:objective('EU','欧盟邻国稳定',mid,[allies('E',[4,5]),armies('E',[2,4]),fdi([2,3],{regions:'E',ownAllies:true})]),
 c9605624cbc07:objective('EU','丰饶之地',mid,[prosperity([3,5]),resource(2,2),money([50,100])]),
 ce024e3be0134:objective('EU','挑战巨熊',high,[inf('C',[1,2]),lead('influence','E','more',['RU']),lead('influence','N','more',['RU'])]),
 cc56f30de4420:objective('EU','后殖民秩序',high,[lead('influence','N'),lead('influence','A','more'),inf('MSP',[3,4])]),
 cfb5c1739f010:objective('RU','新思维2.0',low,[prosperity([2,3]),task('productionTypes','至少 {n} 种二级资源产能已提升',[2,3],{keys:[3,4,5,6]}),money([40,80])]),
 cf1553be72bc5:objective('RU','亚洲秩序',low,[inf('C',[2,3]),inf('S',[1,2]),inf('P',[1,2])]),
 cf0d19c5c1026:objective('RU','能源巨人',low,[task('productionByRound','能源／能源与原料产能均已提升',1,{keys:[[0],[0,1]]}),task('tradeCountries','可向其出口能源或原料的盟国至少 {n}',[6,7],{direction:'exports',keys:[0,1]}),fdi([1,3],{direction:'exports',keys:[0,1],ownAllies:true})]),
 c9e34c90c88b3:objective('RU','俄罗斯再崛起',mid,[coverage('influence',2,[3,4]),lead('influence','C','sum'),coverage('armies',0,[2,3],'more')]),
 c7f989b04d4ff:objective('RU','西方霸权挑战者',mid,[inf(null,[8,13]),task('influence','E地区影响力严格超过美国、欧盟中任意一方',1,{regions:'E',compare:'any',opponents:['US','EU']}),inf('N',[2,3])]),
 c46b845dbfe22:objective('RU','重振苏联势力范围',mid,[lead('influence','E'),lead('influence','C','more'),armies('EC',[4,7])]),
 c54500e841f2e:objective('RU','征服全球南方',high,[inf('S',[2,3]),inf('A',[1,2]),inf('M',[1,2])]),
 cc2a9183f6307:objective('RU','挑战门罗主义',high,[allies('M',[2,3]),armies('M',[1,2]),fdi([1,2],{regions:'M'})]),
 c2f5c4cd5cf4c:objective('US','最大经济体',low,[fdi([2,4],{ownAllies:true}),task('money','资金最多（允许并列）',1,{compare:'most'}),task('productionTotal','产能合计提升至少 {n} 点',[2,4])]),
 c417e787af243:objective('US','美国梦',low,[prosperity([2,4]),production([3],[1,2]),money([40,80])]),
 cd0a93915b9e4:objective('US','研发先驱',low,[growth(),deck(),resource(4,2)]),
 ca87cb77fc169:objective('US','军事霸权',mid,[production([6],[1,2]),coverage('armies',3,[2,4]),lead('armies',null)]),
 c92e5f25b4e81:objective('US','控制海洋',mid,[armies('EN',[3,6]),armies('PS',[2,4]),armies('MA',[1,2])]),
 c3a1f3d04f69d:objective('US','西方霸权',mid,[lead('influence','M','more'),lead('influence','E'),inf('P',[3,4])]),
 c29a828867e4c:objective('US','双线遏制',high,[lead('influence','P','more',['CN']),lead('influence','E','more',['RU']),inf('C',[1,2])]),
 c812c29415745:objective('US','全球支配',high,[coverage('influence',1,[5,7]),coverage('influence',2,[4,5]),lead('influence',null)]),
 c4eaa28a7f140:objective('CN','能源安全',low,[task('productionByRound','能源／能源与原料产能均已提升',1,{keys:[[0],[0,1]]}),task('tradeCountries','可从其进口能源或原料的盟国至少 {n}',[2,3],{direction:'imports',keys:[0,1]}),resource(0,4)]),
 c461fae2f1f35:objective('CN','创新巨龙',low,[growth(),deck(),production([4],[1,2])]),
 ccd05575411b9:objective('CN','出口龙头',low,[task('exportSymbols','盟国出口符号合计至少 {n}',[10,15]),task('tradeCountries','可向其出口消费品的盟国至少 {n}',[5,6],{direction:'exports',keys:[3]}),task('exportTypes','盟国不同出口符号至少 {n} 种',[5,6])]),
 cc98959e1210e:objective('CN','经济霸权',mid,[task('money','资金最多（允许并列）',1,{compare:'most'}),fdi([4,8]),task('productionTypes','至少 {n} 种产能已提升',[4,7],{keys:[0,1,2,3,4,5,6]})]),
 c101b43ca1ad5:objective('CN','中国经济奇迹',mid,[prosperity([3,5]),resource(3,2),money([40,80])]),
 c06699171a812:objective('CN','新丝绸之路',mid,[coverage('allies',1,[6,7]),task('fdiLeads','至少 {n} 个地区投资标记严格多于每位其他玩家',[3,5]),task('bestFdiReturn','曾在一次投资回报步骤仅靠投资标记获得至少 {n} 资金',[10,20])]),
 ca098e7b5c10b:objective('CN','迈向新太平洋',high,[lead('influence','P','more',['US']),lead('armies','P','more',['US']),task('allies','亚太盟国严格多于美国',1,{regions:'P',compare:'more',opponents:['US']})]),
 ca55a59acbf45:objective('CN','新世界秩序',high,[coverage('influence',1,[4,6]),coverage('influence',0,[2,3],'most'),lead('influence',null)])
};
