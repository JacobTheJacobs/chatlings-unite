"""Package existing generated idle frames for the website; never synthesizes art."""
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[1]/'public/pets'
(root/'previews').mkdir(exist_ok=True)
for name in ['mossbyte','toast-panic','sir-honk','blob-ross','buffer-cat']:
 with Image.open(root/(name+'.png')) as image:
  image.crop((0,0,1536,208)).save(root/'previews'/(name+'.png'),optimize=True)
