"""Import supplied TTS assets. Usage: python scripts/import-tts.py AUDIT_DIR SAVE_JSON"""
import pathlib,json,sys,collections,hashlib
from PIL import Image
source=pathlib.Path(sys.argv[1]);save=json.loads(pathlib.Path(sys.argv[2]).read_text());audit=json.loads((source/'audit.json').read_text());out=pathlib.Path('dist/assets');out.mkdir(exist_ok=True,parents=True)
assets={a['url']:a for a in audit['assets']};objs={}
def walk(o):
 if isinstance(o,dict):
  if 'GUID' in o:objs[o['GUID']]=o
  for v in o.values():walk(v)
 elif isinstance(o,list):
  for v in o:walk(v)
walk(save)
byface=collections.defaultdict(list);cards=[];seen=set()
for c in audit['cards']:
 tags=c['tags'];sheet=c['cardId']//100;owner=None;typ=None;module='base'
 if 'ActionCard' in tags:
  typ='ability'
  if 417<=sheet<=464:owner='CN' if sheet<=428 else 'RU' if sheet<=440 else 'US' if sheet<=452 else 'EU';typ='starter'
  elif sheet==509:module='dd'
 elif 'AssetCard' in tags:
  typ='asset';owner={321:'CN',322:'US',475:'EU',324:'RU',500:'CN',501:'US',502:'EU',503:'RU'}.get(sheet)
  if sheet>=500:module='dd'
 elif sheet in [492,493,494,495]:typ='objective';module='dd';owner={492:'CN',493:'EU',494:'RU',495:'US'}[sheet]
 elif 'GrowthCard' in tags:typ='growth';module='dd' if 'Type3' in tags or 'Type4' in tags else 'base'
 elif 'Event' in tags or sheet==508:typ='event';module='wit'
 elif 'EffectCard' in tags or sheet==498:typ='effect';module='wit'
 elif 'CountryCard' in tags and 'MARS' not in c['notes']:
  typ='startingCountry' if 'Starter' in tags else 'country'
  if typ=='startingCountry':
   p=objs[c['guid']]['Transform'];owner=('EU' if p['posZ']>0 else 'US') if p['posX']<0 else ('RU' if p['posZ']>0 else 'CN')
 elif 'ExecutiveOrder' in tags:typ='executive'
 if not typ:continue
 # Card instances need distinct starter cards even if printed text repeats.
 key=(c['face'],c['cell'],typ)
 if key in seen:continue
 seen.add(key);uid='c'+hashlib.sha256((c['face']+str(c['cell'])+typ).encode()).hexdigest()[:12]
 note=c['notes'];name=c['name'] or (note.split('-')[0] if typ in ['country','startingCountry'] else '')
 level=int(note.split('-')[0]) if typ=='growth' else None
 row={'id':uid,'type':typ,'owner':owner,'module':module,'name':name,'notes':note,'level':level,'vp':int(note) if typ=='asset' and note.isdigit() else None,'era':('chain' if sheet==508 else 'II' if sheet==516 else 'I') if typ=='event' else None,'region':note.split('-')[-1] if typ in ['country','startingCountry'] else None,'image':f'assets/{uid}.webp','sourceCardId':c['cardId'],'sourceGuid':c['guid']}
 cards.append(row);byface[c['face']].append((row,c))
for face,entries in byface.items():
 with Image.open(source/assets[face]['key']) as im:
  for row,c in entries:
   cols=c['columns'];rows=c['rows'];n=c['cell'];x=n%cols;y=n//cols
   crop=im.crop((round(x*im.width/cols),round(y*im.height/rows),round((x+1)*im.width/cols),round((y+1)*im.height/rows))).convert('RGB');crop.thumbnail((650,850));crop.save('dist/'+row['image'],'WEBP',quality=87)
for key,name,size in [('c1a65a80618c314c217b','map',(2200,2100)),('1bce01801e15e812dc5a','board-US',(1500,1100)),('9f3fd7bb8c8b19e92d24','board-RU',(1500,1100)),('4a8ff6d08c797781d497','board-CN',(1500,1100)),('3eac5f2a85c63af4775c','board-EU',(1500,1100))]:
 with Image.open(source/key) as im:
  im=im.convert('RGB');im.thumbnail(size);im.save(out/(name+'.webp'),'WEBP',quality=89)
pathlib.Path('dist/cards.json').write_text(json.dumps(cards,ensure_ascii=False));print('cards',len(cards),'types',dict(collections.Counter(c['type'] for c in cards)))
print('starters',dict(collections.Counter(c['owner'] for c in cards if c['type']=='starter')))
