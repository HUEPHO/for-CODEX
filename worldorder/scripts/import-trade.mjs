import fs from 'node:fs';
const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url))).filter(c=>['country','startingCountry'].includes(c.type));
// Transcribed and visually checked from all 93 supplied country faces.
// Left = export symbols; right = import symbols. 0 energy,1 raw,2 food,3 goods,4 services,6 army.
const rows=[
'4|','0|','1|','36|0','34|0','2|','2|','1|','2|','3|','06|4','3|','06|3','06|3','3|','|','4|','03|1','334|22','1|','2|','33|0','13|0','3|','1|','0|','4|','3|','3|','2|','03|2','144|33','1|','2|','00|1',
'2|','4|','2|','34|0','334|00','33|0','24|1','33|2','2|','24|0','33|2','2|','334|00','1|','23|0','033|11','0|','4|','4|','04|2','34|0','3|','24|0','2|','0|','0|','2|','0|','2|','1|','3|','002|33','12|3','001|44','34|2',
'004|33','12|3','03|4','334|11','00|1','1|','3|','003|11','02|3','04|3','004|33','33|0','12|4','12|4','123|00','344|00','12|0','24|0','2|','33|0','011|44','133|44','23|0'];
if(cards.length!==93||rows.length!==93)throw Error('Country trade coverage');const data={};for(let i=0;i<cards.length;i++){const [exp,imp]=rows[i].split('|');data[cards[i].id]={name:cards[i].originalName,exports:[...exp].map(Number),imports:[...imp].map(Number)};}
fs.writeFileSync(new URL('../dist/trade-data.js',import.meta.url),'// Country trade symbols verified from supplied card faces.\nexport const COUNTRY_TRADE='+JSON.stringify(data,null,2)+';\n');
