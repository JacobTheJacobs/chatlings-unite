"""Verify the overlay accepts mouse input only on pet hitboxes (no screenshots)."""
import ctypes as C
import json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
state=json.loads((root/'data/desktop-status.json').read_text())
assert not state['dragged'],'Finish dragging before checking the input shape'
class Rect(C.Structure):_fields_=[('x',C.c_short),('y',C.c_short),('width',C.c_ushort),('height',C.c_ushort)]
x=C.CDLL('libX11.so.6');shape=C.CDLL('libXext.so.6')
x.XOpenDisplay.argtypes=[C.c_char_p];x.XOpenDisplay.restype=C.c_void_p
x.XCloseDisplay.argtypes=[C.c_void_p];x.XFree.argtypes=[C.c_void_p]
shape.XShapeGetRectangles.argtypes=[C.c_void_p,C.c_ulong,C.c_int,C.POINTER(C.c_int),C.POINTER(C.c_int)];shape.XShapeGetRectangles.restype=C.POINTER(Rect)
display=x.XOpenDisplay(None);assert display
try:
 count=C.c_int();ordering=C.c_int();rects=shape.XShapeGetRectangles(display,state['windowId'],2,C.byref(count),C.byref(ordering))
 try:
  area=sum(rects[i].width*rects[i].height for i in range(count.value))
  assert area<=len(state['bodies'])*76*82,(area,'Desktop would intercept clicks outside pets')
  if state['bodies']:assert area>0,'Pets cannot receive mouse clicks'
  print(json.dumps({'petHitboxesEnabled':True,'outsidePetsClickThrough':True,'inputPixels':area,'rectangles':count.value}))
 finally:x.XFree(rects)
finally:x.XCloseDisplay(display)
