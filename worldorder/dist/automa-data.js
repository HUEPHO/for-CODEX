// D&D pp.3–15; all twelve faces transcribed from the supplied Chinese sheet.
// Each row is US, EU, RU, CN. P=permanent, T=temporary.
const owners=['US','EU','RU','CN'],focus={D:'内政焦点',F:'外交焦点',M:'军事焦点'};
const faces=[
 ['MFMD',['EU','RU','CN','RU'],'TPPTTP','A',1],
 ['FMFM',['EU','RU','CN','RU'],'PPPTPP','B',2],
 ['DFDF',['EU','RU','CN','RU'],'TTPPPP','A',3],
 ['MDMD',['CN','RU',null,'RU'],'PPPTTP','B',1],
 ['FFDM',['CN','RU',null,'EU'],'TPPTPP','A',2],
 ['DMMF',['CN','US','EU','RU'],'PTPPPP','B',3],
 ['MFFD',['RU','US','EU','RU'],'TPPTTP','A',1],
 ['FDMM',['RU','CN','EU','RU'],'PPPTPP','B',2],
 ['DFDF',['RU','CN','EU',null],'TTPPPP','A',3],
 ['MDMD',[null,'RU','EU','US'],'PPPTTP','B',1],
 ['FMDM',[null,'RU','EU','US'],'TPPTPP','A',2],
 ['DDFD',[null,'RU','US','EU'],'PTPPPP','B',3]
];
export const AUTOMA_DECISIONS=faces.map(([fs,trade,influence,binary,ternary],i)=>({id:i+1,rows:owners.map((owner,k)=>({owner,focus:focus[fs[k]],trade:trade[k]})),influence:[...influence].map(x=>x==='P'?'permanent':'temporary'),binary,ternary}));
export const AUTOMA_PLAYERS={
 US:{money:50,market:['military','diplomatic','domestic','economic'],cubes:['base','engage','invest'],prosperityCosts:[10,15,25,35,45],prosperityVP:[2,3,4,5,8]},
 EU:{money:45,market:['diplomatic','economic','domestic','military'],cubes:['engage','invest','base'],prosperityCosts:[10,15,25,35,45],prosperityVP:[2,4,6,9,12]},
 RU:{money:30,market:['military','economic','diplomatic','domestic'],cubes:['base','invest','engage'],prosperityCosts:[15,20,30,40,50],prosperityVP:[3,4,5,7,10]},
 CN:{money:35,market:['economic','military','diplomatic','domestic'],cubes:['invest','base','engage'],prosperityCosts:[15,20,30,40,50],prosperityVP:[3,4,5,8,11]}
};
export const AUTOMA_RESOURCE_MONEY=[3,3,3,10,10,5,10];
export const AUTOMA_ACTION_NAMES={relations:'改善关系',engage:'外交介入',invest:'投资',trade:'贸易',base:'建立基地',move:'调遣',growth:'购买发展'};
export const AUTOMA_CUBE_TYPES={diplomatic:['engage','relations'],economic:['invest','trade'],military:['base','move']};
export const AUTOMA_MARKET_CUBE={c1572d344b120:'economic',ccde924d96e22:'economic',cc5811cf03bcd:'military',ccf3fe3c30b0b:'military'};
