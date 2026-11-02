"""Transparent native probe: no screen captures or OS pointer movement."""
import json,sys,time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'desktop'))
from overlay import Overlay,Renderer,Gtk,DATA,PID,SETTINGS
from physics import Body
class Probe(Overlay):
 def poll(self):pass
 def paint(self,*args):return True
window=Probe('http://localhost:9');window.show_all()
actor={'id':'qa','x':400,'y':300,'name':'qa','appearance':{'seed':0}}
window.state={'players':[actor]};window.received=time.monotonic()-10
window.physics.bodies={'qa':Body(600,250,vx=150,vy=-300,walk_y=250,support='walk')}
window.last_scan=time.monotonic();Overlay.tick(window)
b=window.physics.bodies['qa'];assert (b.x,b.y,b.vx,b.vy)==(600,250,150,-300)
window.accept({'players':[actor]});window.last_scan=time.monotonic();Overlay.tick(window)
assert window.physics.bodies['qa'] is b
renderer=Renderer();image=renderer.atlas('/pets/mossbyte.png');assert image.get_width()==608
assert image.get_byte_length()<5*1024**2
renderer.retain(['/pets/toast-panic.png']);assert not renderer.atlases
assert PID.parent==DATA and SETTINGS.parent==DATA
print(json.dumps({'outagePreservesBodies':True,'reconnectReusesBodies':True,'scaledAtlasBytes':image.get_byte_length(),'unusedAtlasEvicted':True,'isolatedDataDir':str(DATA)}))
window.hide()
