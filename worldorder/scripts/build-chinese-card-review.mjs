// Review-only asset production. Never writes into dist or changes game imports.
// Run with Node 24; sharp/playwright are resolved from the local authoring runtime.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {ALLY_BACK_IMAGES} from '../dist/ally-card-art.js';
import {REGIONS} from '../dist/game-constants.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(path.join(root,'.ui-pptx-build/package.json'));
const sharp=require('sharp'),{chromium}=require('playwright');
const out=path.join(root,'output/中文卡牌审阅_2026-11-05');
const catalog=JSON.parse(await fs.readFile(path.join(root,'dist/cards.json'),'utf8'));
const extra=[{id:'c11dd78abad1e',name:'朝鲜（2024）',originalName:'North Korea (2024)',region:'P'},
 {id:'cf7c0ffc48316',name:'乌克兰（2014）',originalName:'Ukraine (2014)',region:'E'},
 {id:'c2172fd0f8650',name:'英国',originalName:'United Kingdom',region:'E'}];
const cards=[...catalog.filter(c=>['country','startingCountry'].includes(c.type)),...extra];
const multi=new Set(['c5b01c4f40686','c663faca7acf4','c03315dd1d1b0','c11dd78abad1e','cf7c0ffc48316','c2172fd0f8650']);
const sha=b=>createHash('sha256').update(b).digest('hex');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
await fs.mkdir(path.join(out,'素材'),{recursive:true});await fs.mkdir(path.join(out,'原图'),{recursive:true});
const browser=await chromium.launch({headless:true,channel:'msedge'}),page=await browser.newPage();
const manifest=[];let frontMasks=new Map();
function bounds(c,w,h){return {x:Math.floor((c.id==='c2172fd0f8650'?.055:.083)*w),y:Math.floor((c.id==='cdbdcea711dd5'?.486:multi.has(c.id)?.551:.616)*h),right:Math.ceil(.742*w),bottom:Math.ceil(.748*h)};}
function dilate(mask,w,h,r){const result=new Uint8Array(mask.length);for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(mask[y*w+x])for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){const xx=x+dx,yy=y+dy;if(xx>=0&&xx<w&&yy>=0&&yy<h)result[yy*w+xx]=1;}return result;}
function textMask(data,w,h,c){
 const b=bounds(c,w,h),mask=new Uint8Array(w*h);
 for(let y=b.y;y<b.bottom;y++)for(let x=b.x;x<b.right;x++){const p=(y*w+x)*4,[r,g,v]=data.subarray(p,p+3);if(Math.min(r,g,v)>190&&Math.max(r,g,v)-Math.min(r,g,v)<70)mask[y*w+x]=1;}
 return dilate(mask,w,h,8);
}
// Fill the small glyph holes from their surrounding original map colors.
// Only the marked lettering pixels change; all flags, values and icons stay exact.
function erase(data,mask,w,h){
 const result=Buffer.from(data),pending=new Set();for(let i=0;i<mask.length;i++)if(mask[i])pending.add(i);
 while(pending.size){const fill=[];for(const i of pending){const x=i%w,y=Math.floor(i/w),sum=[0,0,0],neighbors=[];
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy,j=yy*w+xx;if((dx||dy)&&xx>=0&&xx<w&&yy>=0&&yy<h&&!pending.has(j))neighbors.push(j);}
  if(neighbors.length){for(const j of neighbors)for(let k=0;k<3;k++)sum[k]+=result[j*4+k];fill.push([i,sum.map(n=>Math.round(n/neighbors.length))]);}
 }if(!fill.length)throw Error('Unfillable mask');for(const [i,rgb] of fill){for(let k=0;k<3;k++)result[i*4+k]=rgb[k];pending.delete(i);}}
 // Smooth the reconstructed holes to avoid the angular wavefront pattern.
 const indices=[];for(let i=0;i<mask.length;i++)if(mask[i])indices.push(i);
 for(let pass=0;pass<70;pass++)for(const i of indices){const x=i%w,y=Math.floor(i/w);if(x<1||x>=w-1||y<1||y>=h-1)continue;for(let k=0;k<3;k++)result[i*4+k]=Math.round((result[(i-1)*4+k]+result[(i+1)*4+k]+result[(i-w)*4+k]+result[(i+w)*4+k])/4);}
 return result;
}
async function textLayer(w,h,lines){
 const url=await page.evaluate(({w,h,lines})=>{const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');
  for(const l of lines){ctx.fillStyle=l.color||'#fff';let size=l.size;const font=()=>{ctx.font=`${l.bold?'700':'400'} ${size}px "Microsoft YaHei",sans-serif`;};font();while(l.maxWidth&&ctx.measureText(l.text).width>l.maxWidth&&size>24){size--;font();}ctx.textBaseline='alphabetic';ctx.textAlign=l.align||'left';ctx.shadowColor=l.shadow?'#0007':'transparent';ctx.shadowBlur=0;ctx.shadowOffsetX=0;ctx.shadowOffsetY=l.shadow?1:0;ctx.fillText(l.text,l.x,l.y);}
  return canvas.toDataURL('image/png');},{w,h,lines});return Buffer.from(url.split(',')[1],'base64');
}
async function writeAsset({source,file,name,english,region,side,kind,translated,build}){
 const sourceBytes=await fs.readFile(path.join(root,'dist',source)),decoded=await sharp(sourceBytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const {width:w,height:h}=decoded.info;const result=await build(decoded.data,w,h);
 const originalFile='原图/'+path.basename(source),assetFile='素材/'+file;
 await fs.copyFile(path.join(root,'dist',source),path.join(out,originalFile));
 await fs.writeFile(path.join(out,assetFile),result);
 // Re-decoding must preserve every original pixel outside the text area.
 const final=await sharp(result).ensureAlpha().raw().toBuffer();let changed=0,outside=0;
 const b=kind==='trade'?{x:55,y:35,right:585,bottom:213}:bounds(cards.find(c=>source.includes(c.id)),w,h);
 for(let i=0;i<w*h;i++){let different=false;for(let k=0;k<4;k++)if(decoded.data[i*4+k]!==final[i*4+k])different=true;if(different){changed++;const x=i%w,y=Math.floor(i/w);if(kind==='country'&&(x<b.x-10||x>b.right+10||y<b.y-10||y>b.bottom+10))outside++;if(kind==='trade'&&![[70,49,201,65],[70,136,201,65],[427,40,155,104]].some(([xx,yy,ww,hh])=>x>=xx&&x<xx+ww&&y>=yy&&y<yy+hh))outside++;}}
 if(outside)throw Error(`${file}: ${outside} pixels outside lettering bounds changed`);
 manifest.push({name,english,region,side,kind,translated,source,original:originalFile,file:assetFile,width:w,height:h,changedPixels:changed,sourceSHA256:sha(sourceBytes),sha256:sha(result)});
}
try{
 for(const c of cards){
  for(const side of ['正面','背面']){
   const back=side==='背面',source=back?ALLY_BACK_IMAGES[c.id]:`assets/${c.id}.webp`;
   const translated=!(back&&c.type==='startingCountry');
   await writeAsset({source,file:`${c.id}${back?'-back':''}.zh-CN.png`,name:c.name,english:c.originalName,region:REGIONS[c.region],side,kind:'country',translated,
    build:async(raw,w,h)=>{
     if(!translated)return sharp(raw,{raw:{width:w,height:h,channels:4}}).png().toBuffer();
     let mask;if(!back){mask=textMask(raw,w,h,c);frontMasks.set(c.id,{mask,w,h});}
     else {const f=frontMasks.get(c.id);mask=new Uint8Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++)mask[y*w+x]=f.mask[Math.min(f.h-1,Math.round(y*f.h/h))*f.w+Math.min(f.w-1,Math.round(x*f.w/w))];mask=dilate(mask,w,h,1);}
     const clean=erase(raw,mask,w,h),b=bounds(c,w,h),scale=w/485;
     const title=c.name==='波斯尼亚和黑塞哥维那'?['波斯尼亚和','黑塞哥维那']:[c.name];
     const color=back?'#d3c4a7':'#fff',left=(c.id==='c2172fd0f8650'?.075:.098)*w;
     const lines=title.map((text,i)=>({text,x:left,y:(.678-(title.length-1-i)*.063)*h,size:(title.length>1?43:52)*scale,bold:true,color,shadow:true,maxWidth:.63*w}));
     if(c.id!=='ca03520c27e87')lines.push({text:REGIONS[c.region],x:left,y:.737*h,size:38*scale,bold:false,color,shadow:true});
     return sharp(clean,{raw:{width:w,height:h,channels:4}}).composite([{input:await textLayer(w,h,lines)}]).png().toBuffer();
    }});
  }
 }
 for(const owner of ['US','CN','EU','RU']){
  await writeAsset({source:`assets/trade-${owner}.webp`,file:`trade-${owner}.zh-CN.png`,name:'贸易协定 · '+({US:'美国',CN:'中国',EU:'欧盟',RU:'俄罗斯'}[owner]),english:'TRADE DEALS / EXPORTS / IMPORTS',region:'贸易协定',side:'正面',kind:'trade',translated:true,
   build:async(raw,w,h)=>{const clean=Buffer.from(raw);const rects=[[70,49,201,65,70,50],[70,136,201,65,70,139],[427,40,155,104,425,40]];
    for(const [x,y,ww,hh,sx,sy] of rects){const color=[...raw.subarray((sy*w+sx)*4,(sy*w+sx)*4+3)];for(let yy=y;yy<y+hh;yy++)for(let xx=x;xx<x+ww;xx++)for(let k=0;k<3;k++)clean[(yy*w+xx)*4+k]=color[k];}
    const lines=[{text:'出口',x:168,y:99,size:53,align:'center'},{text:'进口',x:168,y:186,size:53,align:'center'},{text:'贸易',x:505,y:85,size:49,align:'center'},{text:'协定',x:505,y:137,size:49,bold:true,align:'center'}];
    return sharp(clean,{raw:{width:w,height:h,channels:4}}).composite([{input:await textLayer(w,h,lines)}]).png().toBuffer();
   }});
 }
 await fs.writeFile(path.join(out,'素材清单.json'),JSON.stringify(manifest,null,2));
 const summary={total:manifest.length,translated:manifest.filter(a=>a.translated).length,unchanged:manifest.filter(a=>!a.translated).length,gameImported:false};
 console.log(JSON.stringify(summary));
 await fs.writeFile(path.join(out,'翻译对照.csv'),'\ufeff'+['类别,名称,英文,地区,面,是否翻译,图片',...manifest.map(m=>[m.kind,m.name,m.english,m.region,m.side,m.translated?'是':'原图无英文',m.file].map(s=>'"'+String(s).replaceAll('"','""')+'"').join(','))].join('\r\n'));
 const tiles=manifest.map(m=>`<article data-search="${esc([m.name,m.english,m.region,m.side].join(' '))}" data-region="${esc(m.region)}" data-side="${m.side}"><h2>${esc(m.name)} <small>${m.side}${m.translated?'':' · 无英文，保留原图'}</small></h2><div class="pair"><figure><img loading="lazy" src="${m.original}"><figcaption>原图</figcaption></figure><figure><a href="${m.file}"><img loading="lazy" src="${m.file}"></a><figcaption>中文素材 · 点击查看原尺寸</figcaption></figure></div></article>`).join('');
 await fs.writeFile(path.join(out,'审阅.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>World Order 中文卡牌审阅</title><style>body{margin:0;background:#101c24;color:#e6edf0;font:16px "Microsoft YaHei",sans-serif}header{position:sticky;top:0;z-index:3;padding:18px 24px;background:#122b36f5;border-bottom:1px solid #526471}h1{margin:0 0 8px;font-size:22px;color:#e7c785}p{margin:8px 0}input,select{padding:8px;margin-right:10px;background:#203844;border:1px solid #617b87;color:white;border-radius:5px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:18px;padding:24px}article{padding:14px;border:1px solid #526471;border-radius:8px;background:#172b36}article[hidden]{display:none}h2{font-size:17px;margin:0 0 12px}small{font-size:12px;color:#b7c7ce;font-weight:400}.pair{display:flex;gap:8px;align-items:start}figure{margin:0;width:50%}img{width:100%;height:auto;border-radius:7px}figcaption{font-size:11px;text-align:center;margin-top:6px;color:#adc1cc}a{color:#e7c785}</style><header><h1>World Order · 中文卡牌审阅</h1><p>96 张盟国卡正反面 + 4 张贸易协定，共 196 张 PNG。179 张含文字替换，17 张起始盟国背面无英文，原样保留。尚未导入游戏。</p><input id="search" placeholder="搜索国家 / 英文名"><select id="region"><option value="">全部地区</option>${[...Object.values(REGIONS),'贸易协定'].map(r=>`<option>${r}</option>`).join('')}</select><select id="side"><option value="">正反面</option><option>正面</option><option>背面</option></select><span id="count"></span></header><main>${tiles}</main><script>function filter(){let n=0;for(const a of document.querySelectorAll('article')){a.hidden=!(a.dataset.search.toLowerCase().includes(document.querySelector('#search').value.toLowerCase())&&(!region.value||a.dataset.region===region.value)&&(!side.value||a.dataset.side===side.value));if(!a.hidden)n++;}document.querySelector('#count').textContent=n+' 张';}for(const id of ['search','region','side'])document.getElementById(id).addEventListener('input',filter);filter();</script></html>`);
}finally{await browser.close();}
