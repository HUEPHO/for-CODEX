import { CARDS } from './cards.ts';

/** Scope inventory, not executable card definitions or certified rules text.
 * Each row was read from the supplied Chinese card face. Ambiguities stay explicit.
 * Tags describe requirements across all eras, including mechanisms not yet implemented.
 */
export const CAPABILITIES = {
  influence: {
    name: '影响力放置与移除',
    state: 'partial',
    gap: '事件目标、数量和跨地区分配须统一',
  },
  replacement: {
    name: '原子替换',
    state: 'missing',
    gap: '影响力／杠杆替换不能模拟成普通先移除再放置',
  },
  pieces: {
    name: '棋子部署、移动、归还',
    state: 'partial',
    gap: '区分普通行动与事件指定部署、任意存放格',
  },
  reveal: { name: '隐藏身份与翻面', state: 'partial', gap: '地图与备用区翻面、永久所属与隐藏视图' },
  permanent: { name: '永久移出', state: 'missing', gap: 'removed 区域及不得重新部署的实体状态' },
  tracks: {
    name: '轨道设置、移动与限制',
    state: 'partial',
    gap: '向稳定移动、实际位移回执、完整时代限制',
  },
  momentum: { name: 'momentum 归属', state: 'existing', gap: '与触发器集成' },
  actions: {
    name: '事件授予行动',
    state: 'missing',
    gap: '跨阵营、种类组合、范围与独立次数，不扣普通行动预算',
  },
  selectors: {
    name: '目标查询与聚合',
    state: 'partial',
    gap: '领导／占据／议会／存在须区分，支持集合并集、去重和比较',
  },
  sequence: { name: '顺序与结算栈', state: 'partial', gap: '子行动完整结算后恢复父事件，显式续点' },
  branch: { name: '条件与可选分支', state: 'partial', gap: '决策者、可选性、无合法目标和择一语义' },
  iteration: {
    name: '重复与逐实体处理',
    state: 'missing',
    gap: '次数快照、每地区一次、按年度顺序轮转',
  },
  receipts: {
    name: '前一步实际结果绑定',
    state: 'missing',
    gap: '实际移动／移除数、受影响地区集合、刚获得的牌',
  },
  dice: { name: '可重放随机', state: 'existing', gap: '统一记录投骰结果与派生数值' },
  hands: {
    name: '手牌与随机转移',
    state: 'partial',
    gap: '保护强制／选举牌、物理卡实例、完整时代牌库',
  },
  visibility: { name: '信息可见性', state: 'partial', gap: '当前热座共享；联机需按玩家投影' },
  stance: { name: '阵营立场', state: 'missing', gap: '教程固定务实；完整规则中的立场与库存联动' },
  modifiers: {
    name: '持续规则修正',
    state: 'partial',
    gap: '替换／加成／禁止／许可／上下限的类型化规则查询',
  },
  triggers: {
    name: '触发与响应窗口',
    state: 'partial',
    gap: '领导权变化、行动完成、死敌、总罢工与递归防护',
  },
  lifecycle: {
    name: '事件生命周期',
    state: 'partial',
    gap: '前置、取消、到期、直到下次选举、直到永久移除',
  },
  parliament: {
    name: '议会牌与席位',
    state: 'partial',
    gap: '转交、重新可用、临时封锁、多次使用计数',
  },
  elections: {
    name: '正常选举',
    state: 'partial',
    gap: '阶段预约与完整时代；牌面编号不等于内部 face ID',
  },
  specialElection: {
    name: '特殊选举',
    state: 'missing',
    gap: '公投与提前选举使用独立政策，不能直接跑普通选举清场',
  },
  victory: {
    name: 'PV 查询与即时胜利',
    state: 'partial',
    gap: '无副作用当前 PV 查询、事件专属胜利条件',
  },
  responses: {
    name: '取消权限与使用次数',
    state: 'partial',
    gap: '第48条持有／可用／永久移除及按出牌方限制',
  },
  combat: {
    name: '突击子流程',
    state: 'partial',
    gap: '事件授予、同次行动多地、规则修正和父流程恢复',
  },
} as const;
export type Capability = keyof typeof CAPABILITIES;

// id | Chinese title | capabilities | scope summary | unresolved interpretation
const rows = `
1|煽动民众|triggers,momentum,modifiers|NSDAP新获领导权时取得momentum
2|布劳恩联盟|momentum,parliament,replacement,selectors,branch|取得momentum；按普鲁士议会控制在两个不同省份替换影响力|替换与通用同回合放置／移除限制的优先级
3|拉特瑙遇刺|pieces,tracks,lifecycle,sequence|RC归还中产支持至任意空格；根据左翼暗杀降低反动
4|弗里德里希·艾伯特|responses,modifiers,dice,influence,lifecycle|团结条件下重复使用第48条并支付掷骰决定的影响力代价
5|卡普政变|parliament,lifecycle,pieces,tracks,triggers|封锁柏林议会至下次选举；部署部队与罢工，设置团结
6|巴伐利亚苏维埃共和国|influence,pieces,branch,lifecycle,triggers|指定地区部署影响力与民兵，按结算后数量判断起义
7|鲁尔占领|pieces,reveal,actions,sequence,triggers|两省罢工与未揭示自由军团部署后翻面，RC获得行动
8|鲁尔起义|influence,pieces,branch,lifecycle,triggers|指定省份影响力与部队；数量门槛下放置或翻为起义
9|埃尔茨贝格尔遇刺|pieces,actions,branch|移除黑杠杆至任意空格；暗杀条件下授予联盟MCS行动
10|自由军团复员|branch,tracks,reveal,permanent,lifecycle|降低团结或全体翻面并永久移出备用区忠诚军团；取消16
11|上西里西亚起义|influence,pieces,selectors,iteration|指定省份任意组合移除影响力、杠杆和干部
12|波兰走廊|selectors,momentum|指定四省累计影响力最多者取得momentum|并列最多的处理未核实
13|三人执政集团|actions,selectors,branch,iteration|RC在巴伐利亚及邻接地区执行行动，条件下增加不同地区数
14|胡戈·施廷内斯|pieces,tracks,selectors,sequence|放黑杠杆后按地图黑杠杆数移动经济
15|背后一刀论|modifiers,replacement,actions,branch|momentum及反动条件满足时，将右翼移除行动改为替换|需核实替换库存不足及普通限制优先级
16|猎犬主义|modifiers,combat,iteration,lifecycle|联盟一次突击行动可选两地区；分别完整结算
17|拉帕洛条约|tracks,stance,lifecycle|提升苏联协定，再改变KPD立场
18|慕尼黑政变|pieces,stance,actions,branch,lifecycle,triggers|部署冲锋队，革命立场下授予影响力行动
19|《我的奋斗》出版|stance,modifiers,lifecycle|改变NSDAP立场行动的最大步数
20|军国主义|combat,modifiers,lifecycle|提高联盟忠诚检定的进步相对反动门槛
21|《人民观察家报》|actions,selectors,iteration|按NSDAP地图干部数授予影响力行动
22|每周48小时工作制|influence,selectors,iteration|按改革数选择不同地区，移除指定阵营影响力
23|领事组织|pieces,influence,branch,sequence|RC指定地区部署后，可移除一个阵营至多两影响力
24|私刑暗杀|influence,selectors,iteration|按地图左翼暗杀数分配联盟／KPD影响力移除
25|伦敦赔款计划|tracks,branch|经济位置决定向通胀方向的强制或可选位移
26|独立社民党分裂|momentum,influence,selectors,branch|按momentum决定受益阵营与不同地区数量
27|柏林骚乱|pieces,combat,actions,sequence,triggers,momentum|部署民兵与联盟单位，联盟可突击，再检查残存民兵
28|库诺大罢工|pieces,dice,iteration,triggers|柏林罢工，再逐省投骰与KPD影响力比较后放罢工
29|全国青少年福利法|actions,influence,selectors,iteration|MCS行动后，按改革数逐次在一座城市移除至多两影响力
30|履约政策|tracks,receipts,influence,iteration,sequence|联盟移动经济；按实际移动格数让RC、NSDAP依次放置
31|NSDAP被禁|influence,selectors,branch,lifecycle|先在不同地区移除，再按momentum或干部条件由NSDAP放置
32|白色恐怖|dice,influence,pieces,reveal,branch,lifecycle|投骰决定移除数，再选部署叛离军团或指定两地全部翻面
33|奥斯瓦尔德·斯宾格勒|actions,tracks,iteration,sequence|RC先、NSDAP后，按反动值取得影响力行动
34|王公财产没收|stance,momentum|KPD立场转向革命，RC取得momentum
35|国家艺术专员|tracks,influence,selectors,branch|进步条件下选择两座不同城市放置联盟影响力
36|会场械斗|pieces,selectors,iteration,triggers|NSDAP在至多两处本方存在地区部署冲锋队
37|黑色国防军|pieces,reveal,branch|柏林部署叛离军团，苏联协定条件下翻开一支地图军团
38|屈斯特林政变|pieces,influence,sequence|勃兰登堡部署叛离军团与RC影响力
39|阿塔曼联盟|influence,iteration|四个固定省份分别放NSDAP影响力
40|汉堡起义|pieces,stance,branch,triggers|汉堡起义与民兵，数量由KPD立场决定
41|图勒协会|branch,influence,actions|选择慕尼黑RC影响力或NSDAP移动中产支持
42|表现主义|actions,tracks,branch,sequence|联盟影响力行动；进步大于反动时追加MCS行动
43|泛德意志联盟|actions,momentum,branch,sequence|RC移动MCS后，按momentum决定NSDAP追加行动
44|合理化改造|dice,selectors,tracks|投骰与已部署杠杆总量比较，调整经济
45|退伍军人|reveal,iteration,pieces,selectors,branch|至多三支军团翻面；反动条件下RC、NSDAP依次部署
46|法团主义|pieces,branch|选择任意颜色的可用杠杆及地图／轨道目的地
47|政党政治|branch,parliament,tracks,influence,iteration|消耗席位、降低团结、或逐阵营移除影响力
48|镇压|momentum,pieces,selectors|按momentum批量清除暗杀及／或罢工，保留起义
49|阶级叛徒|hands,dice,branch|随机弃牌并保护强制／选举牌
50|变节者|hands,dice,momentum,receipts,branch|随机取得对手牌，按momentum选择是否弃掉刚取得牌
51|知识分子|hands,momentum,receipts,branch|抽牌并按momentum选择是否弃掉刚抽牌
52|大众媒体|hands,visibility,selectors|指定查看手牌的目标阵营
53|地产抵押马克|tracks,pieces,branch,lifecycle|设置稳定经济，再选择三类全局清除之一
54|古斯塔夫·施特雷泽曼|modifiers,tracks,elections,lifecycle|团结下限与区域选举黄色杠杆PV替换
55|党卫队|modifiers,combat,lifecycle|NSDAP突击修正|中文掷骰修正的正负表达须与英文战斗例外核对
56|施特拉塞主义|modifiers,influence,momentum,lifecycle|momentum条件下覆盖NSDAP影响力行动数量
57|保罗·冯·兴登堡|modifiers,combat,elections,lifecycle|叛离军团SV及地图黑杠杆PV替换
58|褐衫军|modifiers,pieces,selectors|放宽NSDAP单位部署的目标条件
59|斯大林主义|modifiers,stance,elections|KPD立场行动步数与干部PV替换
60|种族理论|triggers,actions,momentum|NSDAP执行移动MCS行动时取得momentum
61|巴尔马特丑闻|actions,iteration,influence,selectors,sequence|RC按反动执行行动，再让NSDAP在RC领导地区放置
62|红色阵线战士同盟|modifiers,pieces,selectors,lifecycle|放宽KPD单位部署条件；与83前置取消关联
63|血腥五月|tracks,influence,selectors,iteration|降低团结，KPD可逐个本方领导地区移除联盟影响力
64|《世界舞台》|actions|KPD可执行MCS行动
65|海外贷款|actions,tracks,branch,sequence|MCS行动后，按美国协定条件再选放置或移除行动
66|爵士文化|influence,selectors,iteration,tracks,sequence|联盟选城市放置，RC选非城市移除；数量分别由轨道决定
67|教育改革|actions,selectors,momentum,sequence|改革行动后检查普鲁士改革，决定momentum
68|城市犯罪|pieces,tracks,iteration|按4减进步的数量归还联盟MCS|负数量应如何归零需统一数量表达式约定
69|道威斯计划|actions,iteration,tracks,branch|按美国协定数执行放置／移除行动任意组合
70|洛迦诺公约|tracks,receipts,actions,branch,lifecycle|经济向稳定、美国协定提高；新增美元依赖时额外行动
71|国际联盟|momentum,tracks,influence,branch,lifecycle|取得momentum，协定合计门槛下放置影响力
72|恩斯特·荣格|actions,tracks,influence,selectors,branch|RC任意行动后，反动条件下在城市放置
73|卡尔·施米特|momentum,branch|仅在NSDAP与RC之间切换momentum
74|贝托尔特·布莱希特|actions,selectors,iteration|按KPD地图干部数授予MCS行动
75|柏林滕珀尔霍夫机场|actions,parliament,influence,branch|MCS行动后，柏林议会控制条件下移除对手影响力
76|现代主义住宅区|actions,selectors,branch|MCS行动后，地图改革条件下追加放置行动
77|法兰克福学派|stance,actions,pieces,branch|改变KPD立场，MCS条件下选择影响力行动
78|住房改革|pieces,actions,branch|移除任意干部，改革条件下联盟取得MCS行动
79|包豪斯|branch,actions,iteration|二选一：至多两次影响力行动或一次MCS行动
80|杨格计划|actions,tracks,iteration,lifecycle|按美国协定数授予RC影响力行动，作为公投前置
81|兴登堡大赦|influence,iteration,sequence,lifecycle|KPD、NSDAP、RC依次分配至多两影响力
82|全民公投|specialElection,victory,momentum,branch,lifecycle|RC持有momentum时立即选举；仅RC胜利结果生效
83|红色阵线战士同盟被禁|pieces,branch,actions,lifecycle|择一移除民兵或干部，再授予KPD行动，并取消62
84|钢盔团|selectors,iteration,actions,branch,reveal|按RC军力占据（Supremacy）地区数授予部署或检验忠诚行动
85|国旗团|selectors,iteration,actions,branch|联盟在每个军力占据（Supremacy）地区执行至多一次放置或移除行动
86|德意志国家人民党入阁|branch,parliament,tracks,pieces|转交国会议席或按团结条件归还联盟MCS
87|阿尔伯特·爱因斯坦|influence,selectors,branch|任意城市移除一个NSDAP或RC影响力
88|康采恩|pieces,tracks,sequence|从地图／轨道移除杠杆，再调整经济
89|容克|selectors,influence,pieces,sequence|选五个东部省份之一，放RC影响力与黑杠杆
90|中产阶级|momentum,actions,iteration,branch|按momentum决定当前行动方可执行的MCS次数
91|新女性|actions,pieces,iteration,sequence,branch|联盟、RC依次按各自MCS数执行放置／移除行动组合
92|城市化|modifiers,elections,selectors|全国选举时按城市领导权增加PV
93|新客观主义|momentum,selectors,actions,branch|取得momentum；按部署标记总数与进步比较授予MCS行动
94|实用主义|branch,tracks,influence|降低反动或两个固定地区放联盟影响力
95|托马斯·曼|actions,tracks,iteration|联盟必须执行等于进步与反动绝对差值的放置行动
96|大众文化|actions,selectors,iteration,sequence|按城市两色杠杆数量分别授予联盟／RC行动
97|东欧犹太人|replacement,momentum,actions,branch,sequence|柏林联盟影响力替换为RC，再由NSDAP取得momentum并行动
98|生活改革运动|influence,selectors,receipts,iteration,sequence|从城市移除对手及本方影响力；按实际移除数放至非城市
99|堕落艺术|momentum,actions,tracks,iteration,branch|右翼momentum方可按进步与反动绝对差值执行影响力行动组合
100|地铁|actions,parliament,influence,branch|与75相同类型：MCS后按柏林议会控制移除对手影响力
101|巴伯尔斯贝格|actions,selectors,momentum,branch|限柏林的放置／移除行动后检查黄色杠杆
102|柏林广播塔|branch,tracks,influence|与94相同：反动降低或两地区放置
103|白领雇员|pieces|联盟必须归还一个MCS至任意空存放格
104|柏林条约|tracks,actions,sequence|提高苏联协定，再由KPD、联盟依次执行放置行动
105|经济党|iteration,pieces,sequence|按当前年度顺序，各阵营分别归还MCS
106|恩斯特·尼基施|replacement,branch|萨克森联盟影响力替换为RC或KPD
107|政党政治|branch,parliament,tracks,influence,iteration|与47共用效果模板
108|镇压|momentum,pieces,selectors|与48共用效果模板
109|阶级叛徒|hands,dice,branch|与49共用效果模板
110|变节者|hands,dice,momentum,receipts,branch|与50共用效果模板
111|知识分子|hands,momentum,receipts,branch|与51共用效果模板
112|大众媒体|hands,visibility,selectors|与52共用效果模板
113|弗朗茨·冯·巴本获任|replacement,selectors,iteration,lifecycle|各RC领导且人口已满地区替换一影响力；取消119
114|冯·施莱歇尔获任|actions,selectors,iteration,lifecycle|按RC领导或议会控制地区的并集数量授予NSDAP行动
115|普鲁士政变|branch,influence,parliament,tracks,lifecycle|按反动移除普鲁士联盟影响力，或夺取并重置普鲁士议会牌
116|群众集会|modifiers,actions,selectors,momentum|momentum条件下取消NSDAP放置／移除行动的势力范围要求
117|希特勒就职|momentum,actions,selectors,iteration,specialElection,lifecycle|按右翼领导非城市数授予行动，然后立即提前选举
118|授权法|victory,parliament,momentum,lifecycle|无副作用计算当前PV，结合席位与momentum检查立即获胜
119|海因里希·布吕宁|tracks,responses,permanent,lifecycle|调整经济与团结，永久移除第48条并建立前置关系
120|东部援助|selectors,pieces,influence|东部五省择一，放黄色杠杆与联盟影响力
121|格雷戈尔·施特拉塞辞职|influence,momentum,selectors,branch,lifecycle|英文原牌：NSDAP持momentum时移除2个地区，否则3个地区各1个NSDAP；再限本方存在地区放置，取消56
122|哈尔茨堡阵线|victory,hands,dice,branch|当前NSDAP PV决定RC／NSDAP随机取得对方手牌
123|奥地利信贷银行崩溃|tracks|经济向大规模失业移动
124|兴登堡再度参选|modifiers,responses,parliament,lifecycle|右翼国会议席可用两次；限制第48条对右翼事件的取消权
125|等级团体|pieces,replacement,iteration|按RC中产支持数，将地图黄色杠杆替换为可用黑杠杆
126|新教|momentum,selectors,pieces,influence,iteration|momentum方按MCS数在北部／普鲁士分配移除
127|国会纵火案|momentum,parliament,influence,selectors|取得momentum、条件转交并重置席位牌、三个不同地区移除KPD
128|洛桑会议|tracks,modifiers|经济向稳定移动，受最右美元依赖限制
129|冲锋队改组|selectors,iteration,pieces,triggers|NSDAP干部或军力占据地区并集，逐地部署冲锋队
130|铁阵线|pieces,branch|择一移除冲锋队、民兵或叛离军团
131|青年一代|momentum,branch,influence,actions|极端派momentum方选择指定地区两影响力或MCS行动
132|血与土|victory,influence,selectors,branch|当前NSDAP PV达到门槛时选择两个非城市放置
133|大空间政策|pieces,selectors,lifecycle|从可用库存或地图调动国防军至指定东部两省之一
134|精神分析|dice,branch,actions,pieces|投骰决定执行MCS行动或归还当前方MCS
135|埃里希·鲁登道夫|influence,momentum,branch,sequence|巴伐利亚移除NSDAP，RC持momentum时放RC；当前按6.0同一步移除／放置限制顺序执行|当前采用6.0通则解释；未见本牌特例勘误，详见衰落时代说明
136|天主教|momentum,selectors,pieces,influence,iteration|momentum方按MCS数在南部／巴伐利亚分配移除
137|冲锋队被禁|pieces,receipts,influence,selectors,branch,iteration,lifecycle|移除至多四冲锋队，再逐个实际受影响地区放影响力或干部
138|托洛茨基主义|pieces,influence,branch,stance|干部／民兵／影响力三选一移除，再由KPD选择立场方向
139|马丁·海德格尔|pieces,actions,selectors,iteration|巴登部署干部后，按当前干部数执行影响力行动组合
140|施滕内斯叛乱|pieces,selectors|移除柏林所有冲锋队
141|黑色阵线|replacement,selectors,iteration|限RC存在地区，将至多两NSDAP影响力替换为RC
142|性科学研究所遭焚毁|branch,influence|NSDAP选择柏林放本方或移除任一方影响力
143|人口过密|influence|柏林移除一个联盟影响力
144|关税同盟|momentum,dice,branch|仅在联盟momentum时掷骰决定新momentum方
145|霍斯特·威塞尔遇刺|stance,actions,branch|NSDAP立场转向革命，并选择放置或移除行动
146|优生学|victory,selectors,momentum|比较NSDAP与RC当前PV，平局保持momentum
147|阿尔托纳血腥星期日|actions,pieces,selectors,branch,sequence|NSDAP部署或移动后，检查指定省冲锋队以追加MCS行动
148|阶级叛徒|hands,dice,branch|与49共用效果模板
149|变节者|hands,dice,momentum,receipts,branch|与50共用效果模板
150|知识分子|hands,momentum,receipts,branch|与51共用效果模板
151|大众媒体|hands,visibility,selectors|与52共用效果模板
152|危机时代选举牌面|elections,momentum,responses,hands|取得momentum，预约本轮末选举与清场；受同轮及弃牌限制|当前事件实现缺少牌面的momentum步骤；需单独修复
153|黄金年代选举牌面|elections,momentum,responses,hands|同类选举牌面，必须与物理实例分离|内部faceId153对应图片印刷编号154；不是同一编号系统
154|衰落时代选举牌面|elections,momentum,responses,hands|同类选举牌面，必须与物理实例分离|内部faceId154对应图片印刷编号156；不是同一编号系统
`.trim();

export interface CardSurvey {
  faceId: number;
  name: string;
  era: 'crisis' | 'golden' | 'decline';
  scopeStatus: 'surveyed';
  capabilities: Capability[];
  summary: string;
  questions: string[];
  sourceImage: string;
  templateOf?: number;
  printedNumber: number;
}
const aliases: Record<number, number> = {
  100: 75,
  102: 94,
  107: 47,
  108: 48,
  109: 49,
  110: 50,
  111: 51,
  112: 52,
  148: 49,
  149: 50,
  150: 51,
  151: 52,
};
export const CARD_SURVEY: CardSurvey[] = rows.split('\n').map((row) => {
  const [id, name, tags, summary, question] = row.split('|');
  const faceId = Number(id),
    card = CARDS.find((c) => c.id === faceId)!;
  return {
    faceId,
    name,
    era: card.era,
    scopeStatus: 'surveyed',
    capabilities: tags.split(',') as Capability[],
    summary,
    questions: question ? [question] : [],
    sourceImage: card.image,
    templateOf: aliases[faceId],
    printedNumber: faceId === 153 ? 154 : faceId === 154 ? 156 : faceId,
  };
});
export function surveyReport() {
  return {
    events: CARD_SURVEY.filter((c) => c.faceId <= 151).length,
    electionFaces: CARD_SURVEY.filter((c) => c.faceId > 151).length,
    questions: CARD_SURVEY.filter((c) => c.questions.length).map((c) => ({
      card: c.faceId,
      questions: c.questions,
    })),
    capabilities: Object.entries(CAPABILITIES).map(([id, info]) => ({
      ...info,
      id,
      cards: CARD_SURVEY.filter((c) => c.capabilities.includes(id as Capability)).map(
        (c) => c.faceId,
      ),
    })),
  };
}
