"""Import original token faces from the supplied TTS save (no Lua execution).

Usage: python scripts/import-tokens.py --tts PATH/TS_Save_13.json
Images are copied byte-for-byte; circular/rounded tile outlines are applied by SVG.
"""
import argparse
import hashlib
import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FACES = {
    'cadre-kpd': ('12a96d', 'front'),
    'cadre-nsdap': ('bc83a0', 'front'),
    'leverage-coalition': ('78ead5', 'front'),
    'leverage-rc': ('1b7349', 'front'),
    'reform': ('816ec2', 'front'),
    'strike': ('771586', 'front'),
    'uprising': ('771586', 'back'),
    'assassination-left': ('018a9f', 'front'),
    'assassination-right': ('018a9f', 'back'),
    'reichswehr': ('fba294', 'front'),
    'militia': ('ee854c', 'front'),
    'sa': ('e182c9', 'front'),
    'freikorps-hidden': ('4c84aa', 'front'),
    'freikorps-loyal': ('385160', 'back'),
    'freikorps-rogue': ('4c84aa', 'back'),
    'progress': ('00c8af', 'front'),
    'reaction': ('21f231', 'front'),
    'economy': ('690a91', 'front'),
    'us': ('4a2c4f', 'front'),
    'ussr': ('fa35d2', 'front'),
    'momentum': ('c2daca', 'front'),
    'year-early': ('185bfe', 'front'),
    'year-late': ('185bfe', 'back'),
    'sequence': ('56a69d', 'front'),
    'dollar-dependence': ('2ee95b', 'front'),
    'general-strike': ('6e2fc3', 'front'),
    'order-coalition': ('40cbce', 'front'),
    'order-kpd': ('4b3aed', 'front'),
    'order-nsdap': ('e91f6b', 'front'),
    'order-rc': ('f1ac0d', 'front'),
    'control-coalition': ('b89044', 'front'),
    'control-kpd': ('e077ef', 'front'),
    'control-nsdap': ('c6c3aa', 'front'),
    'control-rc': ('a734ec', 'front'),
    'unity': ('fe96fc', 'front'),
    'stance-kpd': ('1bee7d', 'front'),
    'stance-nsdap': ('20376a', 'front'),
    'victory-coalition': ('1a246c', 'front'),
    'victory-kpd': ('15ec8e', 'front'),
    'victory-nsdap': ('412357', 'front'),
    'victory-rc': ('c1483b', 'front'),
    'pv-coalition': ('414715', 'front'),
    'pv-kpd': ('519a41', 'front'),
    'pv-nsdap': ('44de27', 'front'),
    'pv-rc': ('77c943', 'front'),
}
MATS = {
    'coalition': ('d02177', 'front'),
    'kpd': ('d28420', 'front'),
    'nsdap': ('0cd382', 'front'),
    'rc': ('ceabfc', 'front'),
}


def walk(value):
    if isinstance(value, dict):
        if 'GUID' in value and 'CustomImage' in value:
            yield value['GUID'], value['CustomImage']
        for child in value.values():
            yield from walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk(child)


def import_group(folder, faces, images, source, source_name):
    destination = ROOT / 'public/assets' / folder
    cache = ROOT / 'reference/original-tokens'
    destination.mkdir(parents=True, exist_ok=True)
    cache.mkdir(parents=True, exist_ok=True)
    entries = []
    for name, (guid, face) in faces.items():
        key = 'ImageURL' if face == 'front' else 'ImageSecondaryURL'
        url = images[guid][key]
        cached = cache / f'{guid}-{face}.png'
        if not cached.exists():
            with urllib.request.urlopen(url, timeout=30) as response:
                cached.write_bytes(response.read())
        data = cached.read_bytes()
        filename = f'{name}.png'
        (destination / filename).write_bytes(data)
        entries.append(dict(file=filename, guid=guid, face=face, url=url,
                            sha256=hashlib.sha256(data).hexdigest()))
    provenance = dict(source=source_name, sourceSha256=hashlib.sha256(source).hexdigest(),
                      processing='Original image bytes; tile outlines clipped only at render time.',
                      physicalPieces='MCS: white pawn; conservative clique: black block; influence: colored cubes.',
                      faces=entries)
    (destination / 'provenance.json').write_text(json.dumps(provenance, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Imported {len(entries)} original {folder} images.')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--tts', type=Path, required=True)
    args = parser.parse_args()
    source = args.tts.read_bytes()
    images = dict(walk(json.loads(source.decode('utf-8-sig'))))
    import_group('tokens', FACES, images, source, args.tts.name)
    import_group('mats', MATS, images, source, args.tts.name)


if __name__ == '__main__':
    main()
