const DEFINITIONS={
 energy:{label:'能源'},raw:{label:'原料'},food:{label:'粮食'},goods:{label:'消费品'},services:{label:'服务'},diplomacy:{label:'外交'},army:{label:'军队'},money:{label:'资金'},smart:{label:'SP'},vp:{label:'胜利分'},research:{label:'研究力'}
};
const SOLID_RESOURCES=new Set(['energy','raw','food','goods','services','diplomacy']);
export const resourceIconPath=id=>`assets/icon-${id}.${SOLID_RESOURCES.has(id)?'png':'svg'}`;
const aliases={'Smart Power':'smart',SP:'smart','胜利分':'vp','研究力':'research','资金':'money','能源':'energy','原料':'raw','粮食':'food','消费品':'goods','服务':'services','外交':'diplomacy','军队':'army'};
const escapeRegex=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function resourceTokenizer(protectedNames=[]){const protectedSet=new Set(protectedNames.filter(Boolean)),words=[...new Set([...protectedSet,...Object.keys(aliases)])].sort((a,b)=>b.length-a.length),pattern=new RegExp(words.map(escapeRegex).join('|'),'g');return text=>{const parts=[];let last=0;for(const match of text.matchAll(pattern)){if(match.index>last)parts.push({text:text.slice(last,match.index)});parts.push(protectedSet.has(match[0])?{text:match[0]}:{icon:aliases[match[0]]});last=match.index+match[0].length;}if(last<text.length)parts.push({text:text.slice(last)});return parts;};}
function makeIcon(id,document){const def=DEFINITIONS[id],span=document.createElement('span');span.className='resource-icon resource-icon--'+id;span.title=def.label;span.setAttribute('role','img');span.setAttribute('aria-label',def.label);if(id!=='army')span.style.backgroundImage=`url("${resourceIconPath(id)}")`;return span;}
export function installResourceIcons(protectedNames=[]){const tokenize=resourceTokenizer([...protectedNames,'内政焦点','外交焦点','军事焦点','外交与霸权']);const skip='.resource-icon,.cardmeta,h1,h2,script,style,textarea,[data-keep-resource-text]';
 function convert(root){if(root.nodeType!==1||root.closest(skip))return;
  // Native select options cannot contain artwork. Keep their Chinese labels
  // instead of replacing the printed symbols with unrelated emoji.
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes=[];while(walker.nextNode()){const node=walker.currentNode;if(!node.parentElement?.closest(skip+',option')&&tokenize(node.data).some(p=>p.icon))nodes.push(node);}
  for(const node of nodes){const fragment=document.createDocumentFragment();for(const part of tokenize(node.data))fragment.append(part.icon?makeIcon(part.icon,document):document.createTextNode(part.text));node.replaceWith(fragment);}
 }
 const observer=new MutationObserver(records=>{observer.disconnect();const roots=new Set(records.map(r=>r.target.nodeType===1?r.target:r.target.parentElement).filter(Boolean));for(const root of roots)convert(root);observer.observe(document.body,{childList:true,characterData:true,subtree:true});});convert(document.body);observer.observe(document.body,{childList:true,characterData:true,subtree:true});return ()=>observer.disconnect();
}
