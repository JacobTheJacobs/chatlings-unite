"""Package existing generated idle frames for the website; never synthesizes art."""
import sys,re
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[1]/'public/pets'
(root/'previews').mkdir(exist_ok=True)
names=sys.argv[1:] or ['mossbyte','toast-panic','sir-honk','blob-ross','buffer-cat']
for name in names:
 if not re.fullmatch(r'[a-zA-Z0-9_-]+',name):raise ValueError('Invalid pet ID')
 with Image.open(root/(name+'.png')) as image:
  image.crop((0,0,1536,208)).save(root/'previews'/(name+'.png'),optimize=True)
