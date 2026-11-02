"""Live X11 metadata smoke test. Reads no window titles or screen pixels."""
import json, subprocess, sys, time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'desktop'))
import gi
gi.require_version('Gtk','3.0');gi.require_version('GdkX11','3.0')
from gi.repository import Gtk,Gdk,GdkX11
from windows import WindowSurfaces
m=Gdk.Display.get_default().get_primary_monitor();r=m.get_geometry()
s=WindowSurfaces(r.x,r.y,r.width,r.height)
# Only our own temporary fixture is shown/moved/closed; user apps are untouched.
fixture='''import gi,sys
gi.require_version('Gtk','3.0');gi.require_version('GdkX11','3.0')
from gi.repository import Gtk,Gdk,GdkX11,GLib
w=Gtk.Window(title='Pet collision verification');w.set_default_size(400,200);w.set_keep_above(True);w.move(int(sys.argv[1]),int(sys.argv[2]));w.add(Gtk.Label(label='Checking pet window physics…'));w.show_all()
GLib.timeout_add(300,lambda:print(w.get_window().get_xid(),flush=True) or False)
def cmd(source,condition):
 line=source.readline().strip()
 if line=='move':w.move(int(sys.argv[1])+80,int(sys.argv[2])+50)
 return True
GLib.io_add_watch(sys.stdin,GLib.IO_IN,cmd);Gtk.main()
'''
child=subprocess.Popen(['/usr/bin/python3','-u','-c',fixture,str(r.x+350),str(r.y+350)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True)
def wait_for(predicate):
 deadline=time.monotonic()+5
 while time.monotonic()<deadline:
  while Gtk.events_pending():Gtk.main_iteration_do(False)
  edges=s.scan()
  if predicate(edges):return edges
  time.sleep(.05)
 raise AssertionError('Window geometry did not update')
try:
 xid=int(child.stdout.readline());edges=wait_for(lambda edges:any(e.window==xid and e.side=='top' for e in edges))
 roof=next(e for e in edges if e.window==xid and e.side=='top');original=roof.anchor_x
 child.stdin.write('move\n');child.stdin.flush()
 wait_for(lambda edges:any(e.window==xid and e.anchor_x>=original+70 for e in edges))
 child.terminate();child.wait(timeout=3)
 wait_for(lambda edges:not any(e.window==xid for e in edges))
 print(json.dumps({'realWindowDetected':True,'movingWindowUpdated':True,'closedWindowRemoved':True,'noScreenCapture':True}))
finally:
 if child.poll() is None:child.terminate();child.wait(timeout=3)
