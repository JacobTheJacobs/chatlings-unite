#!/usr/bin/env python3
"""Click-through desktop pets driven by Chatlings' authoritative local state.
Uses the transparent/topmost pattern inspected in the user's ClawMate desktop
project. GTK3 provides native X11 input shaping without a .NET installation.
"""
import argparse
import json
import math
import os
from pathlib import Path
import signal
import sys
import threading
import time
from urllib.request import urlopen
from urllib.parse import urlparse

import gi
gi.require_version('Gtk','3.0')
gi.require_version('Gdk','3.0')
gi.require_version('GdkPixbuf','2.0')
gi.require_version('GdkX11','3.0')
from gi.repository import Gtk, Gdk, GdkPixbuf, GLib, GdkX11
import cairo

ROOT=Path(__file__).resolve().parents[1]
DATA=Path(os.environ.get('DATA_DIR',ROOT/'data')).resolve()
STATUS=DATA/'desktop-status.json'
PID=DATA/'desktop-overlay.pid'
SETTINGS=DATA/'desktop-settings.json'
DEFAULT_IDS=['mossbyte','toast-panic','sir-honk','blob-ross','buffer-cat']
ROW_COUNTS=[6,8,8,4,5,8,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6]
EMOTE_ROWS={'dance':20,'spin':13,'love':16,'rage':5,'party':3,'sleep':6}
sys.path.insert(0,str(Path(__file__).resolve().parent))
from physics import Physics
from windows import WindowSurfaces

def rgba(ctx,color,alpha=1):
 color=color.lstrip('#');ctx.set_source_rgba(int(color[:2],16)/255,int(color[2:4],16)/255,int(color[4:6],16)/255,alpha)

def map_position(x,y,width,height):
 return (max(45,min(width-45,45+float(x)/960*(width-90))),max(90,min(height-60,height-265+(float(y)-235)/195*200)))

class Renderer:
 def __init__(self):self.atlases={};self.max_atlases=101
 def retain(self,urls):
  live={(ROOT/'public'/u.lstrip('/')).resolve() for u in urls if isinstance(u,str) and u.startswith('/pets/')}
  for file in list(self.atlases):
   if file not in live:del self.atlases[file]
 def atlas(self,url):
  if not isinstance(url,str) or not url.startswith('/pets/'):return None
  file=(ROOT/'public'/url.lstrip('/')).resolve()
  if not file.is_relative_to((ROOT/'public/pets').resolve()):return None
  if file not in self.atlases:
   try:
    image=GdkPixbuf.Pixbuf.new_from_file(str(file))
    if image.get_width()!=1536 or image.get_height()!=4576:return None
    self.atlases[file]=image.scale_simple(608,1804,GdkPixbuf.InterpType.NEAREST)
    while len(self.atlases)>self.max_atlases:del self.atlases[next(iter(self.atlases))]
   except GLib.Error:return None
  image=self.atlases.pop(file,None)
  if image is not None:self.atlases[file]=image.scale_simple(608,1804,GdkPixbuf.InterpType.NEAREST)
  return image
 def sprite(self,ctx,actor,x,y,t,asset=None,action=None):
  image=self.atlas(asset)
  if image:
   moving=actor.get('moving',False);now=time.time()*1000;emote=actor.get('emote') or {};kind=emote.get('kind') if emote.get('until',0)>now else None
   jumping=actor.get('desktopAirborne',False) or 0<=now-actor.get('jumpedAt',0)<840
   row=4 if jumping else EMOTE_ROWS[kind] if kind in EMOTE_ROWS else 16 if action=='celebrate' else (2 if actor.get('facing')=='left' else 1) if moving else 0
   durations=[280,110,110,140,140,320] if row==0 else [120]*7+[220] if row in (1,2) else [140]*(ROW_COUNTS[row]-1)+[280] if row in (3,4) else [140]*7+[240] if row==5 else [120]*5+[220] if row==7 else [150]*5+[280 if row in (8,18) else 260]
   elapsed=(now-actor.get('jumpedAt',now)) if jumping else (now-(emote.get('until',now)-6000)) if kind else t*1000
   elapsed=max(0,elapsed)%sum(durations);frame=0
   while frame<len(durations)-1 and elapsed>=durations[frame]:elapsed-=durations[frame];frame+=1
   if actor.get('desktopAirborne'):frame=1 if actor.get('desktopVy',0)<0 else 3
   if actor.get('desktopLanding'):row=4;frame=4
   if actor.get('desktopDragging'):row=4;frame=0
   cell=image.new_subpixbuf(frame*76,row*82,76,82)
   ctx.save();ctx.translate(x,y-38);ctx.rotate(actor.get('desktopTilt',0));squash=actor.get('desktopSquash',1);ctx.translate(0,40);ctx.scale(1/squash,squash);ctx.translate(-38,-80);Gdk.cairo_set_source_pixbuf(ctx,cell,0,0);ctx.get_source().set_filter(cairo.FILTER_NEAREST);ctx.paint();ctx.restore()
 def physical_pose(self,actor,body):
  view={**actor,'desktopAirborne':body.support is None and not body.dragging,'desktopDragging':body.dragging,'desktopVy':body.vy,'desktopTilt':body.angle,'desktopLanding':body.settle>0,'desktopSquash':1-.1*(body.settle/.22)*body.impact,'moving':body.support is not None and abs(body.vx)>12}
  if abs(body.vx)>5:view['facing']='left' if body.vx<0 else 'right'
  return view
 def label(self,ctx,text,x,y,color='#e2edcf'):
  ctx.select_font_face('monospace',cairo.FONT_SLANT_NORMAL,cairo.FONT_WEIGHT_BOLD);ctx.set_font_size(11)
  text=str(text)[:40];ext=ctx.text_extents(text);w=ext.width
  rgba(ctx,'#10180f',.78);ctx.rectangle(x-w/2-5,y-12,w+10,17);ctx.fill();rgba(ctx,color);ctx.move_to(x-w/2,y);ctx.show_text(text)
 def bubble(self,ctx,text,x,y,width):
  ctx.select_font_face('sans',cairo.FONT_SLANT_NORMAL,cairo.FONT_WEIGHT_NORMAL);ctx.set_font_size(14)
  lines=[];line=''
  for word in str(text).split():
   for chunk in [word[i:i+27] for i in range(0,len(word),27)]:
    trial=(line+' '+chunk).strip()
    if ctx.text_extents(trial).width>220 and line:lines.append(line);line=chunk
    else:line=trial
  if line:lines.append(line)
  lines=lines[:5];w=max([ctx.text_extents(a).width for a in lines]+[40])+24;h=len(lines)*19+18
  left=max(8,min(width-w-8,x-w/2));top=max(8,y-95-h)
  rgba(ctx,'#fff5dc',.98);ctx.rectangle(left,top,w,h);ctx.fill();ctx.move_to(x-7,top+h);ctx.line_to(x,top+h+9);ctx.line_to(x+7,top+h);ctx.fill()
  rgba(ctx,'#252033')
  for i,line in enumerate(lines):ctx.move_to(left+12,top+23+i*19);ctx.show_text(line)
 def draw(self,ctx,state,width,height,bodies=None):
  ctx.set_operator(cairo.OPERATOR_SOURCE);ctx.set_source_rgba(0,0,0,0);ctx.paint();ctx.set_operator(cairo.OPERATOR_OVER)
  t=time.monotonic();now=time.time()*1000
  ready={}
  for job in state.get('skins',[]):
   if job.get('status')=='ready' and job.get('finishedAt',0)>=ready.get(job['userId'],{}).get('finishedAt',0):ready[job['userId']]=job
  assets=[ready[p['id']]['asset'] if p['id'] in ready else '/pets/'+DEFAULT_IDS[p.get('appearance',{}).get('seed',0)%5]+'.png' for p in state.get('players',[])]
  if state.get('aiPet',{}).get('enabled'):assets.append('/pets/mossbyte.png')
  self.retain(assets)
  for actor in state.get('players',[]):
   if actor.get('joined') and state.get('fusion'):continue
   body=bodies.get(actor['id']) if bodies is not None else None
   if body:
    x,y=body.x,body.y;actor=self.physical_pose(actor,body)
   else:
    x,y=map_position(actor['x'],actor['y'],width,height)
    age=now-actor.get('jumpedAt',0)
    if 0<=age<840:y-=math.sin(age/840*math.pi)*45
   job=ready.get(actor['id']);default=DEFAULT_IDS[actor.get('appearance',{}).get('seed',0)%5]
   asset=job.get('asset') if job else '/pets/'+default+'.png'
   self.sprite(ctx,actor,x,y,t,asset)
   bubble=actor.get('bubble',{})
   if bubble.get('until',0)>now:self.bubble(ctx,bubble.get('text',''),x,y,width)
   self.label(ctx,actor.get('name','viewer')+(' · SIM' if actor.get('simulated') else ''),x,y+25 if y<height-30 else y-87)
   if actor.get('shieldUntil',0)>now:rgba(ctx,'#9de9db',.7);ctx.set_line_width(3);ctx.arc(x,y-25,48,0,2*math.pi);ctx.stroke()
  ai=state.get('aiPet',{});pet=ai.get('pet')
  if ai.get('enabled') and pet:
   body=bodies.get('codex-pet') if bodies is not None else None
   x,y=(body.x,body.y) if body else map_position(pet['x'],pet['y'],width,height)
   if body:pet=self.physical_pose(pet,body)
   self.sprite(ctx,pet,x,y,t,'/pets/mossbyte.png',ai.get('goal',{}).get('action') if ai.get('goal') else None);self.label(ctx,'Mossbyte · '+('CODEX' if ai.get('source')=='codex' else 'LOCAL'),x,y+25 if y<height-30 else y-87)
   if pet.get('shieldUntil',0)>now:rgba(ctx,'#9de9db',.7);ctx.set_line_width(3);ctx.arc(x,y-25,48,0,2*math.pi);ctx.stroke()
  mission=state.get('mission')
  if mission:
   for battery in mission['batteries']:
    if battery.get('delivered'):continue
    x,y=map_position(battery['x'],battery['y'],width,height);rgba(ctx,'#edcf7a');ctx.rectangle(x-8,y-30,16,23);ctx.fill();ctx.rectangle(x-4,y-35,8,5);ctx.fill()
   robot=mission['robot'];x,y=map_position(robot['x'],robot['y'],width,height);rgba(ctx,'#bad79b' if mission.get('completedAt') else '#6d856c');ctx.rectangle(x-30,y-65,60,60);ctx.fill();ctx.rectangle(x-21,y-90,42,30);ctx.fill();self.label(ctx,'GUARDIAN AWAKE!' if mission.get('completedAt') else 'GUARDIAN '+str(mission['delivered'])+'/3',x,y+22)
  fusion=state.get('fusion')
  if fusion:
   x,y=map_position(fusion['x'],fusion['y'],width,height);rgba(ctx,'#afcf9d');ctx.rectangle(x-42,y-80,84,80);ctx.fill();ctx.rectangle(x-28,y-115,56,36);ctx.fill();rgba(ctx,'#304f46');ctx.rectangle(x-20,y-103,40,10);ctx.fill();self.label(ctx,'COMMUNITY GUARDIAN',x,y+25)

class Overlay(Gtk.Window):
 def read_mode(self):
  try:mode=json.loads(SETTINGS.read_text()).get('mode','walk');return mode if mode in ('walk','physics') else 'walk'
  except (OSError,ValueError):return 'walk'
 def set_mode(self,mode):
  SETTINGS.parent.mkdir(exist_ok=True);temp=SETTINGS.with_suffix('.local.tmp');temp.write_text(json.dumps({'mode':mode}));temp.replace(SETTINGS);self.physics.set_mode(mode)
 def __init__(self,url):
  super().__init__(title='Chatlings desktop pets')
  self.url=url;self.state={};self.received=0;self.renderer=Renderer();self.frames=0;self.dragged=None;self.surface_error=None;self.last_tick=time.monotonic();self.last_scan=0
  screen=self.get_screen();visual=screen.get_rgba_visual()
  if not visual or not screen.is_composited():raise RuntimeError('Desktop transparency/compositing is unavailable; refusing to cover the desktop with an opaque window.')
  self.set_visual(visual);self.set_app_paintable(True);self.set_decorated(False);self.set_resizable(False);self.set_keep_above(True);self.set_accept_focus(False);self.set_focus_on_map(False);self.set_skip_taskbar_hint(True);self.set_skip_pager_hint(True);self.set_type_hint(Gdk.WindowTypeHint.DOCK);self.stick()
  monitor=Gdk.Display.get_default().get_primary_monitor() or Gdk.Display.get_default().get_monitor(0);bounds=monitor.get_geometry();self.set_default_size(bounds.width,bounds.height);self.set_size_request(bounds.width,bounds.height);self.move(bounds.x,bounds.y)
  area=monitor.get_workarea()
  self.physics=Physics(bounds.width,bounds.height,floor=min(bounds.height,area.y+area.height-bounds.y)-3,left=max(0,area.x-bounds.x),right=min(bounds.width,area.x+area.width-bounds.x),ceiling=max(0,area.y-bounds.y),mode=self.read_mode());self.surfaces=WindowSurfaces(bounds.x,bounds.y,bounds.width,bounds.height)
  self.add_events(Gdk.EventMask.BUTTON_PRESS_MASK|Gdk.EventMask.BUTTON_RELEASE_MASK|Gdk.EventMask.POINTER_MOTION_MASK)
  self.connect('button-press-event',self.press);self.connect('motion-notify-event',self.motion);self.connect('button-release-event',self.release)
  self.connect('grab-broken-event',self.lost_grab)
  self.connect('realize',self.realized);self.connect('draw',self.paint);self.connect('destroy',lambda *_:Gtk.main_quit())
  threading.Thread(target=self.poll,daemon=True).start();GLib.timeout_add(16,self.tick)
 def realized(self,*_):
  self.get_window().set_pass_through(False);self.get_window().set_cursor(Gdk.Cursor.new_from_name(self.get_display(),'grab'));self.update_input()
 def actors(self):
  if time.monotonic()-self.received>5:return []
  now=time.time()*1000
  actors=[{**p,'_now':now} for p in self.state.get('players',[]) if not(p.get('joined') and self.state.get('fusion'))]
  ai=self.state.get('aiPet',{})
  if ai.get('enabled') and ai.get('pet'):actors.append({**ai['pet'],'id':'codex-pet','_now':now})
  return actors
 def update_input(self):
  if not self.get_realized():return
  region=cairo.Region()
  if time.monotonic()-self.received>5:pass
  elif self.dragged:region.union(cairo.RectangleInt(0,0,self.physics.width,self.physics.height))
  else:
   for body in self.physics.bodies.values():
    region.union(cairo.RectangleInt(max(0,int(body.x-38)),max(0,int(body.y-79)),76,82))
  self.input_shape_combine_region(region);self.get_window().input_shape_combine_region(region,0,0)
 def hit(self,x,y):
  return next((pid for pid,body in reversed(list(self.physics.bodies.items())) if abs(x-body.x)<=38 and body.y-79<=y<=body.y+3),None)
 def press(self,_,event):
  x,y=event.x,event.y;button=event.button if isinstance(event.button,int) else event.get_button()[1]
  pid=self.hit(x,y)
  if not pid:return False
  if button==3:
   menu=Gtk.Menu();walk=Gtk.RadioMenuItem.new_with_label(None,'Walk on screen');full=Gtk.RadioMenuItem.new_with_label_from_widget(walk,'Window physics')
   (walk if self.physics.mode=='walk' else full).set_active(True)
   walk.connect('toggled',lambda item:self.set_mode('walk') if item.get_active() else None);full.connect('toggled',lambda item:self.set_mode('physics') if item.get_active() else None)
   menu.append(walk);menu.append(full);menu.append(Gtk.SeparatorMenuItem())
   drop=Gtk.MenuItem(label='Bring this pet back');drop.connect('activate',lambda *_:self.physics.reset(pid) if pid in self.physics.bodies else None);menu.append(drop);menu.show_all();menu.popup_at_pointer(event);self.context_menu=menu;return True
  if button!=1:return False
  self.dragged=pid;self.physics.begin_drag(pid,x,y,time.monotonic());self.update_input()
  seat=self.get_display().get_default_seat()
  result=seat.grab(self.get_window(),Gdk.SeatCapabilities.POINTER,False,Gdk.Cursor.new_from_name(self.get_display(),'grabbing'),event,None,None)
  self.last_grab_status=str(result)
  if result!=Gdk.GrabStatus.SUCCESS:
   self.physics.release(pid,time.monotonic());self.dragged=None;self.update_input()
  return True
 def motion(self,_,event):
  if not self.dragged:return False
  x,y=event.x,event.y
  if self.dragged in self.physics.bodies:self.physics.drag(self.dragged,x,y,time.monotonic())
  return True
 def release(self,_,event):
  button=event.button if isinstance(event.button,int) else event.get_button()[1]
  if button!=1 or not self.dragged:return False
  x,y=event.x,event.y
  if self.dragged in self.physics.bodies:
   self.physics.drag(self.dragged,x,y,time.monotonic());self.physics.release(self.dragged,time.monotonic())
  self.dragged=None;self.get_display().get_default_seat().ungrab();self.update_input();return True
 def lost_grab(self,_,event):
  if event.keyboard or event.grab_window==self.get_window():return False
  if self.dragged and self.dragged in self.physics.bodies:self.physics.release(self.dragged,time.monotonic())
  self.dragged=None;self.update_input();return False
 def poll(self):
  while True:
   try:
    with urlopen(self.url+'/api/state',timeout=2) as response:
     raw=response.read(2*1024*1024+1)
     if len(raw)>2*1024*1024:raise ValueError('State too large')
     state=json.loads(raw)
    GLib.idle_add(self.accept,state)
   except Exception:pass
   time.sleep(.1)
 def accept(self,state):self.state=state;self.received=time.monotonic();return False
 def tick(self):
  now=time.monotonic();dt=now-self.last_tick;self.last_tick=now
  if now-self.last_scan>.12:
   try:
    self.physics.set_mode(self.read_mode())
    self.physics.edges=self.surfaces.scan() if self.physics.mode=='physics' else [];self.surface_error=None
   except Exception as error:self.surface_error=str(error);self.physics.edges=[]
   self.last_scan=now
  if time.monotonic()-self.received<=5:self.physics.step(dt,self.actors())
  elif self.dragged:
   if self.dragged in self.physics.bodies:
    body=self.physics.bodies[self.dragged];body.dragging=False;body.samples=[];body.vx=body.vy=0
   self.dragged=None;self.get_display().get_default_seat().ungrab()
  if self.dragged not in self.physics.bodies and self.dragged:
   self.dragged=None;self.get_display().get_default_seat().ungrab()
  self.update_input();self.queue_draw();return True
 def paint(self,_,ctx):
  self.renderer.draw(ctx,self.state,self.get_allocated_width(),self.get_allocated_height(),self.physics.bodies);self.frames+=1
  if self.frames%30==1:
   STATUS.parent.mkdir(exist_ok=True);status_temp=STATUS.with_suffix('.tmp');status_temp.write_text(json.dumps({'pid':os.getpid(),'windowId':self.get_window().get_xid(),'clickThroughOutsidePets':True,'mode':self.physics.mode,'mouseGrabEnabled':True,'dragged':self.dragged,'surfaceWindows':self.surfaces.count,'surfaceError':self.surface_error,'bodies':{pid:{'x':round(b.x,1),'y':round(b.y,1),'vx':round(b.vx,1),'vy':round(b.vy,1),'support':b.support,'dragging':b.dragging} for pid,b in self.physics.bodies.items()},'transparent':True,'frames':self.frames,'players':[p.get('name') for p in self.state.get('players',[])],'connected':time.monotonic()-self.received<5}));status_temp.replace(STATUS)
  return True

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--url',default='http://localhost:3010');parser.add_argument('--snapshot');parser.add_argument('--stop',action='store_true');args=parser.parse_args()
 if args.stop:
  if PID.exists():
   pid=int(PID.read_text());cmd=Path('/proc')/str(pid)/'cmdline'
   if cmd.exists() and b'overlay.py' in cmd.read_bytes():os.kill(pid,signal.SIGTERM);print('Desktop pets stopped.')
  return
 parsed=urlparse(args.url)
 if parsed.scheme!='http' or parsed.hostname!='localhost':raise SystemExit('Use the local Chatlings server, for example http://localhost:3010')
 if args.snapshot:
  with urlopen(args.url+'/api/state',timeout=3) as response:state=json.load(response)
  surface=cairo.ImageSurface(cairo.FORMAT_ARGB32,1280,800);Renderer().draw(cairo.Context(surface),state,1280,800);surface.write_to_png(args.snapshot);print('Saved pet-only transparent render: '+args.snapshot);return
 if PID.exists():
  try:
   pid=int(PID.read_text());cmd=Path('/proc')/str(pid)/'cmdline'
   if cmd.exists() and b'overlay.py' in cmd.read_bytes():raise SystemExit('Desktop pets are already running. Use npm run desktop:stop first.')
  except (ValueError,OSError):pass
 PID.parent.mkdir(exist_ok=True);PID.write_text(str(os.getpid()))
 try:
  window=Overlay(args.url);window.show_all();GLib.unix_signal_add(GLib.PRIORITY_DEFAULT,signal.SIGTERM,lambda:Gtk.main_quit() or False);GLib.unix_signal_add(GLib.PRIORITY_DEFAULT,signal.SIGINT,lambda:Gtk.main_quit() or False)
  print('Desktop pet physics running. Left-drag a pet and release to throw. Other clicks pass through. Stop with npm run desktop:stop.',flush=True);Gtk.main()
 finally:PID.unlink(missing_ok=True)

if __name__=='__main__':main()
