// Import the user-approved large-type review images without replacing originals.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(path.join(root,'.ui-pptx-build/package.json')),sharp=require('sharp');
const review=path.join(root,'output/中文卡牌审阅_2026-11-05'),dest=path.join(root,'dist/assets/zh-CN');
const sha=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(await fs.readFile(path.join(review,'素材清单.json'),'utf8'));
await fs.mkdir(dest,{recursive:true});
const imported=[];
for(const item of manifest.filter(i=>i.translated)){
 const source=await fs.readFile(path.join(review,item.file));
 if(sha(source)!==item.sha256)throw Error('Reviewed image changed: '+item.file);
 const bytes=await sharp(source).webp({lossless:true,effort:5}).toBuffer();
 const originalPixels=await sharp(source).ensureAlpha().raw().toBuffer(),pixels=await sharp(bytes).ensureAlpha().raw().toBuffer();
 if(!originalPixels.equals(pixels))throw Error('Lossless conversion changed pixels: '+item.file);
 const target='assets/zh-CN/'+path.basename(item.source);await fs.writeFile(path.join(root,'dist',target),bytes);
 imported.push({name:item.name,side:item.side,source:item.source,target,review:item.file,reviewSHA256:item.sha256,sha256:sha(bytes)});
}
// This extra variant is an asset, not a change to the standard US trade limit.
// Reuse the printed "3" from the approved CN imports box to match its exact font.
const us=await fs.readFile(path.join(review,'素材/trade-US.zh-CN.png'));
const numberBox={left:289,top:133,width:74,height:73};
const three=await sharp(path.join(review,'素材/trade-CN.zh-CN.png')).extract(numberBox).png().toBuffer();
const variant=await sharp(us).composite([{input:three,left:numberBox.left,top:numberBox.top}]).png().toBuffer();
await fs.writeFile(path.join(review,'素材/trade-US-import3.zh-CN.png'),variant);
const variantWebp=await sharp(variant).webp({lossless:true,effort:5}).toBuffer();
await fs.writeFile(path.join(dest,'trade-US-import3.webp'),variantWebp);
const variants=[{name:'美国贸易协定：出口2／进口3',source:'assets/zh-CN/trade-US.webp',target:'assets/zh-CN/trade-US-import3.webp',review:'素材/trade-US-import3.zh-CN.png',default:false,sha256:sha(variantWebp)}];
await fs.writeFile(path.join(root,'references/chinese-card-art.json'),JSON.stringify({approved:'2026-11-05',imported,variants},null,2)+'\n');

const targets=new Map(imported.map(i=>[i.source,i.target]));
const cardsPath=path.join(root,'dist/cards.json');let text=await fs.readFile(cardsPath,'utf8');
for(const [source,target] of targets)text=text.replaceAll(`"image": "${source}"`,`"image": "${target}"`);
await fs.writeFile(cardsPath,text);
const backsPath=path.join(root,'dist/ally-card-art.js');text=await fs.readFile(backsPath,'utf8');
for(const [source,target] of targets)text=text.replaceAll(`'${source}'`,`'${target}'`);
await fs.writeFile(backsPath,text);
for(const name of ['client-player-board.js','client-trade-ui.js','trade-ui.js']){
 const file=path.join(root,'dist',name);text=await fs.readFile(file,'utf8');text=text.replaceAll('src="assets/trade-${','src="assets/zh-CN/trade-${');await fs.writeFile(file,text);
}
console.log(`Imported ${imported.length} localized images, retained 17 unchanged starting backs, added US imports=3 variant.`);
