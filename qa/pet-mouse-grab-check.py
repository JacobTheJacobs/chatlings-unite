"""Exercise native grab handlers in a transparent probe, without moving/clicking the OS pointer."""
import sys,json,time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'desktop'))
from overlay import Overlay, Gtk, Gdk, GLib
from physics import Body

class Probe(Overlay):
    def poll(self):pass
    def tick(self):return True
    def paint(self,*_):return True

window=Probe('http://localhost:9');window.physics.set_mode('physics');window.physics.bodies={'qa':Body(200,400)}
window.show_all();errors=[];result={}

def event(kind,x,y,button=1):
    e=Gdk.Event.new(kind);e.window=window.get_window();e.x=x;e.y=y;e.button=button;e.time=Gdk.CURRENT_TIME
    e.set_device(window.get_display().get_default_seat().get_pointer());return e

def finish():
    window.get_display().get_default_seat().ungrab();window.destroy();Gtk.main_quit();return False

def guard(action):
    def wrapped():
        try:action()
        except Exception as error:errors.append(str(error));finish()
        return False
    return wrapped

def press():
    window.press(window,event(Gdk.EventType.BUTTON_PRESS,200,380))
    assert window.dragged=='qa' and window.physics.bodies['qa'].dragging,('Native pointer grab failed',window.dragged,window.physics.bodies['qa'].dragging,getattr(window,'last_grab_status','not attempted'),window.hit(200,380))
    result['nativeGrab']=True

def release():
    window.release(window,event(Gdk.EventType.BUTTON_RELEASE,265,335))
    b=window.physics.bodies['qa']
    assert window.dragged is None and not b.dragging,'Release did not end dragging'
    assert b.thrown and b.vx>500 and b.vy<0,('Flick did not throw',b.vx,b.vy)
    result.update({'releaseThrows':True,'vx':round(b.vx),'vy':round(b.vy),'noOSMouseMovement':True})
    finish()

GLib.timeout_add(150,guard(press))
GLib.timeout_add(180,guard(lambda:window.motion(window,event(Gdk.EventType.MOTION_NOTIFY,230,350))))
GLib.timeout_add(210,guard(lambda:window.motion(window,event(Gdk.EventType.MOTION_NOTIFY,265,335))))
GLib.timeout_add(225,guard(release))
GLib.timeout_add_seconds(3,finish)
Gtk.main()
if errors:raise AssertionError(errors)
assert result.get('releaseThrows'),result
print(json.dumps(result))
