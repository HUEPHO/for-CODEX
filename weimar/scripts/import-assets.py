"""Reproducible, read-only TTS import and Chinese card atlas extraction.

The Lua text is parsed as source data. It is NEVER executed.
Usage: python scripts/import-assets.py --tts SAVE.json --images IMAGE_DIRECTORY
"""
import argparse, json, re, hashlib
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
(ROOT / 'reference').mkdir(parents=True, exist_ok=True)
parser = argparse.ArgumentParser()
parser.add_argument('--tts', type=Path, required=True)
parser.add_argument('--images', type=Path, required=True)
args = parser.parse_args()
data = json.loads(args.tts.read_text('utf-8-sig'))
lua = data['LuaScript']

def table(name):
    match = re.search(r'^' + re.escape(name) + r'\s*=\s*\{', lua, re.M)
    if not match:
        raise ValueError(f'Missing TTS data table: {name}')
    start = match.end() - 1
    depth, quoted, escaped = 0, False, False
    for end in range(start, len(lua)):
        ch = lua[end]
        if ch == '"' and not escaped: quoted = not quoted
        if not quoted:
            depth += (ch == '{') - (ch == '}')
            if depth == 0: return lua[start:end+1]
        escaped = ch == '\\' and not escaped
    raise ValueError(name)

spaces = []
pattern = r'name = "([^"]+)", display = "([^"]+)", kind = "([^"]+)".*?population = (\d+), political = (\d+)'
for name, display, kind, pop, pv in re.findall(pattern, table('SPACES'), re.S):
    spaces.append(dict(id=name, name=display, region=name if kind in ('City','State') else kind,
                       kind=kind, population=int(pop), politicalValue=int(pv)))
assert len(spaces) == 26
setups = {}
for scenario, block in re.findall(r'(\w+) = \{(.*?)(?=\n    \},)', table('SCENARIO_CUBES'), re.S):
    setups[scenario] = {space: {f:int(n) for f,n in re.findall(r'(\w+) = (\d+)',counts)}
                        for space,counts in re.findall(r'\["([^"]+)"\] = \{([^}]+)\}',block)}
titles = {int(n):name for n,name in re.findall(r'n =\s*(\d+), title = "([^"]+)"',lua)}
notes = ROOT / 'reference/tts-document-2.txt'
if notes.exists():
    for n,title in re.findall(r'^(\d+)\.\s+([^\n]+)',notes.read_text('utf-8'),re.M):
        if 1 <= int(n) <= 151: titles[int(n)] = title.strip()
cards = []
out = ROOT / 'public/assets/cards'
out.mkdir(parents=True, exist_ok=True)
for filename, start, count, era in [('01_Crisis.png',1,52,'crisis'),('02_Golden_Twenties.png',53,60,'golden'),('03_Decline.png',113,39,'decline')]:
    sheet = Image.open(args.images/filename)
    assert sheet.size == (6000,5880)
    for slot in range(count):
        number = start + slot
        box = (slot%10*600,slot//10*840,(slot%10+1)*600,(slot//10+1)*840)
        sheet.crop(box).save(out/f'{number:03}.webp',quality=88)
        cards.append(dict(id=number, title=titles.get(number,f'Event {number}'), era=era, image=f'/assets/cards/{number:03}.webp', sourceSheet=filename, sourceSlot=slot))
for n in (152,153,154):
    path = next(args.images.glob(f'*Election_{n}.png'))
    Image.open(path).save(out/f'{n:03}.webp',quality=90)
    cards.append(dict(id=n,title='Election',era=['crisis','golden','decline'][n-152],image=f'/assets/cards/{n:03}.webp',sourceSheet=path.name,sourceSlot=0))
Image.open(args.images/'04_Map.png').save(ROOT/'public/assets/board.webp',quality=88)
for path in args.images.glob('*Player_Aid*.png'):
    Image.open(path).save(ROOT/'public/assets'/f'{path.stem}.webp',quality=85)
generated = ROOT/'src/data/generated'
generated.mkdir(parents=True,exist_ok=True)
for filename, value in [('spaces.json',spaces),('setups.json',setups),('cards.json',cards)]:
    (generated/filename).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n','utf-8')
(generated/'provenance.json').write_text(json.dumps(dict(saveName=data['SaveName'], saveSha256=hashlib.sha256(args.tts.read_bytes()).hexdigest(), source='User supplied TS_Save_13.json and Weimar_Chinese_Images.zip', spaces=len(spaces), eventCards=151, electionFaces=3),ensure_ascii=False,indent=2)+'\n','utf-8')
for group, numbers in enumerate(([1,2,3,4,11,12,17,21],[22,29,30,33,34,35,36,39],[41,42,43,44,45,46,47,48],[49,50,51,52,54,57,59,92])):
    contact=Image.new('RGB',(2400,1680),'white')
    for i,n in enumerate(numbers): contact.paste(Image.open(out/f'{n:03}.webp'),((i%4)*600,(i//4)*840))
    contact.save(ROOT/'reference'/f'cards-review-{group}.jpg')
print(f'Imported {len(spaces)} spaces, {len(setups)} influence setups, {len(cards)} card faces. Titles: {len(titles)}')
