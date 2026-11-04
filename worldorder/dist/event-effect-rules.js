// Printed persistent effects; state and gameplay hooks share these identifiers.
export const EFFECT_IDS=Object.freeze({sanctions:'cc83057306d10',unlimited:'c12b545fd816e',start:'c00b5d0118cf2',tradeWar:'cdf7b014a4323',siberia:'c0a8f33fb6048',nordstream:'cffbb59b3d793',ttipUS:'cf48fe9407208',ttipEU:'c78b295d520ca'});
export const EVENT_EFFECTS={
 c93edef6ccf8a:{name:'欧亚经济联盟',owner:'RU',description:'贸易时，亚美尼亚、白俄罗斯、哈萨克斯坦、吉尔吉斯斯坦的出口符号计算两次。'},
 c5e448d194d63:{name:'CAFTA协议',owner:'CN',tradeRegions:['P','S'],description:'可使用亚太与南亚展示国家的贸易符号，禁交国家除外。'},
 cd3f9ccd1ba13:{name:'跨太平洋伙伴关系协定',owner:'US',tradeRegions:['M','P'],description:'可使用美洲与亚太展示国家的贸易符号，禁交国家除外。'},
 c7111682c7ac8:{name:'欧盟—美洲贸易协议',owner:'EU',tradeRegions:['M'],description:'可使用美洲展示国家的贸易符号，禁交国家除外。'},
 c09c854e149a8:{name:'中国—中东欧倡议',owner:'CN',income:true,description:'投资回报时欧盟可购买中国消费品，否则中国选择本轮收益。'},
 ccd84d77f9734:{name:'中伊全面战略伙伴关系',owner:'CN',income:true,description:'投资回报时选择5资金或2能源。'},
 [EFFECT_IDS.sanctions]:{name:'对俄制裁',owner:'global',description:'美国、欧盟不能与俄罗斯彼此贸易；北溪协议暂停使用。'},
 [EFFECT_IDS.unlimited]:{name:'中俄无上限伙伴关系',owner:'global',description:'中国和俄罗斯相互忽略对方的威胁。'},
 [EFFECT_IDS.start]:{name:'新削减战略武器条约',owner:'global',description:'美国和俄罗斯彼此造成的威胁每次失去1分。'},
 [EFFECT_IDS.tradeWar]:{name:'中美贸易战',owner:'global',description:'中美彼此贸易时，每种进口资源额外支付5资金。'},
 [EFFECT_IDS.siberia]:{name:'西伯利亚力量管道协议',owner:'CN',active:'pipeline',description:'每轮一次，向俄罗斯付9资金并翻用其1张贸易卡，获得3能源和1外交。'},
 [EFFECT_IDS.nordstream]:{name:'北溪一号协议',owner:'EU',active:'pipeline',description:'每轮一次，向俄罗斯付9资金并翻用其1张贸易卡，获得3能源和1外交；制裁生效时不能使用。'},
 [EFFECT_IDS.ttipUS]:{name:'TTIP协议（美国）',owner:'US',active:'ttip',description:'投资面：投资回报时获得6资金；交易面：每轮一次向欧盟付10资金，获得1外交及指定资源。'},
 [EFFECT_IDS.ttipEU]:{name:'TTIP协议（欧盟）',owner:'EU',active:'ttip',description:'投资面：投资回报时获得6资金；交易面：每轮一次向美国付10资金，获得1外交及指定资源。'}
};
