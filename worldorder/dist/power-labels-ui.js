import {POWERS} from './game-constants.js';
import {powerFlagPath} from './power-identity.js';

const escapeRegex=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function powerLabelTokenizer(protectedNames=[]){
 const aliases=new Map();
 for(const [id,power] of Object.entries(POWERS))for(const label of [id,power.name,power.flag,`${id} ${power.name}`,`${id}${power.name}`,`${power.flag} ${power.name}`])aliases.set(label,id);
 const protectedSet=new Set(protectedNames.filter(name=>name&&!aliases.has(name)));
 const words=[...new Set([...protectedSet,...aliases.keys()])].sort((a,b)=>b.length-a.length);
 const pattern=new RegExp(words.map(word=>Object.hasOwn(POWERS,word)?`\\b${word}\\b`:escapeRegex(word)).join('|'),'g');
 return text=>{
  const parts=[];let last=0;
  for(const match of text.matchAll(pattern)){if(match.index>last)parts.push({text:text.slice(last,match.index)});parts.push(protectedSet.has(match[0])?{text:match[0]}:{owner:aliases.get(match[0])});last=match.index+match[0].length;}
  if(last<text.length)parts.push({text:text.slice(last)});return parts;
 };
}

// Presentation only: saved logs, command IDs, input values and accessible labels
// remain text. Native options cannot contain SVG images.
export function installPowerLabels(protectedNames=[]){
 const tokenize=powerLabelTokenizer(protectedNames),skip='script,style,option,textarea,input,code,pre,.power-flag,.resource-icon,[contenteditable],[data-keep-power-text]';
 function convert(root){
  if(root.nodeType!==1||root.closest(skip))return;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes=[];
  while(walker.nextNode()){const node=walker.currentNode;if(!node.parentElement.closest(skip)&&tokenize(node.data).some(part=>part.owner))nodes.push(node);}
  for(const node of nodes){
   const fragment=document.createDocumentFragment();
   for(const part of tokenize(node.data)){
    if(!part.owner){fragment.append(document.createTextNode(part.text));continue;}
    const img=document.createElement('img');img.className='power-flag power-inline-flag';img.dataset.powerFlag=part.owner;img.src=powerFlagPath(part.owner);img.alt=POWERS[part.owner].name;img.title=POWERS[part.owner].name;img.draggable=false;fragment.append(img);
   }
   node.replaceWith(fragment);
  }
 }
 const observer=new MutationObserver(records=>{observer.disconnect();const roots=new Set(records.map(record=>record.target.nodeType===1?record.target:record.target.parentElement).filter(Boolean));for(const root of roots)convert(root);observer.observe(document.body,{childList:true,characterData:true,subtree:true});});
 convert(document.body);observer.observe(document.body,{childList:true,characterData:true,subtree:true});return ()=>observer.disconnect();
}
