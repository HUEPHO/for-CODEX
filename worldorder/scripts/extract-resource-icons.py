"""Extract existing printed symbols from the supplied board; no redrawing."""
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[1]
board=Image.open(root/'dist/assets/board-US.webp').convert('RGB')
boxes={'energy':(56,190,92,241),'raw':(563,189,610,241),'food':(1020,186,1060,243),'goods':(56,516,94,568),'services':(49,616,98,656),'diplomacy':(523,538,570,582),'army':(995,540,1059,581),'money':(1348,715,1378,746)}
for name,box in boxes.items():
 crop=board.crop(box);rgba=Image.new('RGBA',crop.size)
 # Board symbols are white. Preserve their antialiased edges and discard blue paper.
 rgba.putdata([(255,255,255,max(0,min(255,round((min(r,g,b)-125)*255/90)))) for r,g,b in crop.getdata()])
 bounds=rgba.getbbox()
 if not bounds:raise ValueError(name)
 rgba=rgba.crop(bounds);rgba.thumbnail((50,50),Image.Resampling.LANCZOS)
 icon=Image.new('RGBA',(56,56));icon.alpha_composite(rgba,((56-rgba.width)//2,(56-rgba.height)//2))
 icon.save(root/f'dist/assets/icon-{name}.webp',lossless=True)
