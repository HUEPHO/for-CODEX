"""Extract reference PDFs and image previews; never execute TTS Lua.

Usage: python scripts/read-sources.py --tts SAVE.json --images IMAGE_DIRECTORY
Cached PDFs are reused. This development aid is not needed to run the game.
"""
import argparse
import json
import urllib.request
from pathlib import Path
from PIL import Image
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--tts', type=Path, required=True)
parser.add_argument('--images', type=Path, required=True)
args = parser.parse_args()
(ROOT / 'reference').mkdir(parents=True, exist_ok=True)
tts = json.loads(args.tts.read_text('utf-8-sig'))
for i, obj in enumerate(o for o in tts['ObjectStates'] if o['Name'] == 'Custom_PDF'):
    path = ROOT / 'reference' / f'tts-document-{i+1}.pdf'
    if not path.exists():
        with urllib.request.urlopen(obj['CustomPDF']['PDFUrl'], timeout=60) as response:
            path.write_bytes(response.read())
    reader = PdfReader(path)
    text = '\n\n'.join(f'=== PAGE {n+1} ===\n' + (p.extract_text() or '') for n,p in enumerate(reader.pages))
    path.with_suffix('.txt').write_text(text, encoding='utf-8')
    print(path.name, len(reader.pages), 'pages')
for path in args.images.glob('*.png'):
    im = Image.open(path)
    print(path.name, im.size)
    preview = im.convert('RGB')
    preview.thumbnail((1800,1800))
    preview.save(ROOT / 'reference' / (path.stem + '-preview.jpg'))
