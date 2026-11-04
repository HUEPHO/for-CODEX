import fs from 'node:fs';
const translations={
 'Norway':'挪威','Belarus':'白俄罗斯','Armenia':'亚美尼亚','Canada':'加拿大','Mexico':'墨西哥','Iraq':'伊拉克','Jordan':'约旦','Syria':'叙利亚','Nigeria':'尼日利亚','South Africa':'南非','India':'印度','Laos':'老挝','Japan':'日本','Pakistan':'巴基斯坦','Tajikistan':'塔吉克斯坦','EU Member States':'欧盟成员国','Iceland':'冰岛',
 'Chile':'智利','Brazil':'巴西','Georgia':'格鲁吉亚','Kazakhstan':'哈萨克斯坦','Azerbaijan':'阿塞拜疆','Turkmenistan':'土库曼斯坦','Afghanistan':'阿富汗','Uzbekistan':'乌兹别克斯坦','Kyrgystan':'吉尔吉斯斯坦','Mongolia':'蒙古','Bosnia and Herzegovina':'波斯尼亚和黑塞哥维那','Switzerland':'瑞士','Serbia':'塞尔维亚','Albania':'阿尔巴尼亚','Ukraine':'乌克兰','Moldova':'摩尔多瓦','Croatia':'克罗地亚',
 'Colombia':'哥伦比亚','Peru':'秘鲁','Argentina':'阿根廷','Honduras':'洪都拉斯','Venezuela':'委内瑞拉','Ecuador':'厄瓜多尔','El Salvador':'萨尔瓦多','Cuba':'古巴','Sudan':'苏丹','Mali':'马里','Niger':'尼日尔','Burkina Faso':'布基纳法索','Ethiopia':'埃塞俄比亚','Angola':'安哥拉','Equatorial Guinea':'赤道几内亚','Djibouti':'吉布提','Kenya':'肯尼亚','Central African Republic':'中非共和国',
 'Sri Lanka':'斯里兰卡','Nepal':'尼泊尔','Maldives':'马尔代夫','Bhutan':'不丹','Myanmar':'缅甸','Bangladesh':'孟加拉国','New Zealand':'新西兰','South Korea':'韩国','Vietnam':'越南','Singapore':'新加坡','Australia':'澳大利亚','North Korea':'朝鲜','Cambodia':'柬埔寨','Indonesia':'印度尼西亚','Philippines':'菲律宾','Thailand':'泰国','Qatar':'卡塔尔','Egypt':'埃及','Iran':'伊朗','Saudi Arabia':'沙特阿拉伯','Algeria':'阿尔及利亚','Libya':'利比亚','UAE':'阿联酋','Israel':'以色列','Turkey':'土耳其'
};
const path=new URL('../dist/cards.json',import.meta.url),cards=JSON.parse(fs.readFileSync(path));let count=0;
for(const c of cards.filter(c=>['country','startingCountry'].includes(c.type))){c.originalName??=c.name;if(!translations[c.originalName])throw Error('Missing translation: '+c.originalName);c.name=translations[c.originalName];count++;}
fs.writeFileSync(path,JSON.stringify(cards,null,2)+'\n');console.log('Localized '+count+' country cards.');
