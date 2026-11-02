"""Desktop physics, independent of GTK. Positions are pet centre-x / feet-y.
Inspired by ClawMate.Core PetSimulationService's drag/throw/perch behaviour.
All coordinates are local to the primary monitor. No screen pixels are read.
"""
from dataclasses import dataclass, field
import math

@dataclass(frozen=True)
class Edge:
    window: int
    side: str
    coord: float
    start: float
    end: float
    anchor_x: float = 0
    anchor_y: float = 0

@dataclass
class Body:
    x: float
    y: float
    vx: float = 0
    vy: float = 0
    support: object = None
    anchor_x: float = 0
    anchor_y: float = 0
    dragging: bool = False
    thrown: bool = False
    sliding: bool = False
    recover_until: float = 0
    settle: float = 0
    impact: float = 0
    angle: float = 0
    omega: float = 0
    last_jump: float = 0
    last_vertical: float = 0
    ignore_window: object = None
    ignore_until: float = 0
    drive: int = 0
    last_intent: int = 0
    last_horizontal: float = 0
    walk_y: object = None
    jump_start: float = -100
    turn_until: float = 0
    landed_at: float = -10
    offset: tuple = (0, 0)
    samples: list = field(default_factory=list)


def subtract_intervals(start, end, covered):
    """Subtract occluding intervals from a visible window edge."""
    segments = [(start, end)]
    for lo, hi in covered:
        next_segments = []
        for a, b in segments:
            if hi <= a or lo >= b:
                next_segments.append((a, b))
            else:
                if lo > a: next_segments.append((a, min(lo, b)))
                if hi < b: next_segments.append((max(hi, a), b))
        segments = next_segments
    return [(a, b) for a, b in segments if b - a > 2]


def visible_edges(windows, width, height):
    """Windows bottom-to-top: (id, x, y, width, height). Hidden edges don't collide."""
    edges = []
    for i, (wid, x, y, w, h) in enumerate(windows):
        above = windows[i + 1:]
        for side, coord, start, end in [('top', y, x, x+w), ('bottom', y+h, x, x+w), ('left', x, y, y+h), ('right', x+w, y, y+h)]:
            horizontal = side in ('top', 'bottom')
            # A pet needs room above a ledge to be visible on this monitor.
            if horizontal and (coord < (78 if side == 'top' else 0) or coord > height): continue
            if not horizontal and not 0 <= coord <= width: continue
            start, end = max(0, start), min(width if horizontal else height, end)
            covered = []
            for _, ax, ay, aw, ah in above:
                if horizontal and ay <= coord < ay+ah: covered.append((ax, ax+aw))
                elif not horizontal and ax <= coord < ax+aw: covered.append((ay, ay+ah))
            for a, b in subtract_intervals(start, end, covered):
                edges.append(Edge(wid, side, coord, a, b, x, y))
    return edges


class Physics:
    HALF = 32
    HEIGHT = 74
    GRAVITY = 1400
    MAX_FALL = 1100
    WALK = 58
    PERCH = 44
    MAX_THROW = 800
    GROUND_FRICTION = 850
    AIR_DRAG = math.log(2)
    RESTITUTION = .18

    def __init__(self, width, height, floor=None, left=0, right=None, ceiling=0, mode="physics"):
        self.width, self.height = width, height
        self.floor = height-3 if floor is None else floor
        self.left = left+self.HALF
        self.right = (width if right is None else right)-self.HALF
        self.ceiling = ceiling+self.HEIGHT
        self.mode = mode
        self.bodies = {}
        self.edges = []
        self.clock = 0

    def sync(self, actors):
        ids = {p['id'] for p in actors}
        self.bodies = {key: body for key, body in self.bodies.items() if key in ids}
        for p in actors:
            if p['id'] not in self.bodies:
                x = 45 + p.get('x', 450)/960*(self.width-90)
                self.bodies[p['id']] = Body(max(self.left, min(self.right, x)), self.floor-34 if self.mode=='walk' else self.ceiling+16)

    def set_mode(self, mode):
        if mode not in ('walk','physics'): raise ValueError('Unknown movement mode')
        if mode == self.mode:return
        self.mode = mode
        for b in self.bodies.values():
            b.x = max(self.left+8, min(self.right-8,b.x))
            b.vx = b.vy = 0; b.thrown = b.sliding = False; b.angle = b.omega = b.settle = 0; b.jump_start = -100
            b.support = 'walk' if mode == 'walk' else None
            b.walk_y = max(self.ceiling,min(self.floor-24,b.y))
            b.y = b.walk_y

    def _drive(self,b,actor,dt):
        if b.sliding:
            b.vx = math.copysign(max(0,abs(b.vx)-self.GROUND_FRICTION*dt),b.vx)
            if abs(b.vx)<1:b.sliding=False;b.recover_until=self.clock+.18
            return
        if self.clock<b.recover_until:return
        direction = (-1 if actor.get('facing') == 'left' else 1) if actor.get('moving') else 0
        emote = actor.get('emote') or {}
        if emote.get('until',0) > actor.get('_now',0): direction = 0
        if direction != b.last_intent:
            if self.clock >= b.turn_until:b.drive = direction
            b.last_intent = direction
        move = actor.get('chatMove') or {}
        if move.get('x') and move.get('until',0) > max(b.last_horizontal,actor.get('_now',0)):
            b.last_horizontal = move['until']; b.drive = -1 if move['x'] < 0 else 1
        if direction and not b.drive:b.drive = direction
        speed=self.PERCH if isinstance(b.support,int) else self.WALK
        desired = b.drive*speed if direction else 0
        b.vx += max(-1200*dt,min(1200*dt,desired-b.vx))

    def _screen_bounds(self,b):
        if b.x <= self.left and b.vx < 0:
            b.x = self.left; b.vx = abs(b.vx)*(.4 if b.support is None else 1)
            b.drive = 1; b.turn_until = self.clock+.8
        elif b.x >= self.right and b.vx > 0:
            b.x = self.right; b.vx = -abs(b.vx)*(.4 if b.support is None else 1)
            b.drive = -1; b.turn_until = self.clock+.8
        b.x = max(self.left,min(self.right,b.x))

    def _walk_step(self,b,actor,dt):
        if b.dragging:return
        if b.thrown:
            b.last_jump=max(b.last_jump,actor.get('jumpedAt',0))
            b.vy = min(self.MAX_FALL,b.vy+self.GRAVITY*dt)
            b.vx *= math.exp(-self.AIR_DRAG*dt)
            b.x += b.vx*dt; self._screen_bounds(b)
            b.y += b.vy*dt
            if b.y < self.ceiling:
                b.y = self.ceiling; b.vy = abs(b.vy)*.15
            if b.y >= self.floor:
                b.y = self.floor; self._land(b,'walk',0,self.floor)
                if not b.thrown:
                    b.walk_y = self.floor; b.jump_start = -100
            return
        if b.walk_y is None:b.walk_y = max(self.ceiling,min(self.floor-24,b.y))
        stamp = actor.get('jumpedAt',0)
        if stamp > b.last_jump:
            b.last_jump = stamp; b.jump_start = self.clock
        self._drive(b,actor,dt); b.x += b.vx*dt; self._screen_bounds(b)
        age = self.clock-b.jump_start
        if age < .6:
            phase = max(0,age/.6); b.y = max(self.ceiling,b.walk_y-4*42*phase*(1-phase))
            b.vy = -280*(1-2*phase); b.support = None
        else:b.y = b.walk_y; b.vy = 0; b.support = 'walk'

    def begin_drag(self, pid, x, y, now):
        body = self.bodies[pid]
        body.dragging = True; body.support = None; body.thrown = body.sliding = False;body.angle=body.omega=0
        body.offset = (x-body.x, y-body.y)
        body.samples = [(now, body.x, body.y)]
        body.vx = body.vy = 0

    def drag(self, pid, x, y, now):
        body = self.bodies[pid]
        body.x = max(self.left, min(self.right, x-body.offset[0]))
        body.y = max(self.ceiling, min(self.floor, y-body.offset[1]))
        body.samples.append((now, body.x, body.y))
        body.samples = [s for s in body.samples if now-s[0] <= .13][-30:]

    def release(self, pid, now):
        body = self.bodies[pid]; body.dragging = False
        recent = [s for s in body.samples if now-s[0] <= .13]
        body.vx = body.vy = 0
        if len(recent)>=2 and now-recent[-1][0]<.08:
            # Fit the latest part of the gesture, not the entire drag. A last-
            # moment reversal must throw in the final direction.
            tail=[s for s in recent if recent[-1][0]-s[0]<=.065]
            if len(tail)<2:tail=recent[-2:]
            origin=tail[-1][0];weights=[math.exp((t-origin)/.035) for t,_,_ in tail]
            total=sum(weights);mean_t=sum(w*(s[0]-origin) for w,s in zip(weights,tail))/total
            variance=sum(w*(s[0]-origin-mean_t)**2 for w,s in zip(weights,tail))
            if variance>1e-8 and tail[-1][0]-tail[0][0]>=.008:
                velocity=lambda axis:sum(w*(s[0]-origin-mean_t)*s[axis] for w,s in zip(weights,tail))/variance
                body.vx=max(-self.MAX_THROW,min(self.MAX_THROW,velocity(1)));body.vy=max(-self.MAX_THROW,min(self.MAX_THROW,velocity(2)))
        body.thrown = abs(body.vx) > 160 or abs(body.vy) > 160
        if not body.thrown: body.vx = body.vy = 0
        body.omega=max(-4,min(4,body.vx/900)) if body.thrown else 0
        body.samples = []; body.support = None
        if self.mode == 'walk' and not body.thrown:
            body.walk_y = max(self.ceiling,min(self.floor,body.y));body.y = body.walk_y
            body.support = 'walk';body.jump_start = -100

    def reset(self, pid):
        body = self.bodies[pid]
        body.x = (self.left+self.right)/2;body.drive=0;body.last_intent=0;body.dragging=False;body.samples=[]
        body.walk_y = self.floor-34 if self.mode=='walk' else None
        body.y = body.walk_y if self.mode=='walk' else self.ceiling+16; body.vx = body.vy = 0; body.support = None; body.thrown = body.sliding = False;body.angle=body.omega=0

    def step(self, dt, actors):
        self.clock += min(max(dt, 0), .1)
        self.sync(actors)
        # Fixed small substeps keep collisions and bounce independent of render rate.
        remaining = min(max(dt, 0), .1)
        while remaining > .000001:
            step = min(remaining, 1/120)
            for actor in actors:
                if self.mode=='walk':self._walk_step(self.bodies[actor['id']],actor,step)
                else:self._body_step(self.bodies[actor['id']],actor,step)
                self._rotation(self.bodies[actor['id']],step)
            remaining -= step

    def _rotation(self,b,dt):
        if b.dragging:return
        b.settle=max(0,b.settle-dt)
        if b.support is None:
            b.omega *= math.exp(-1.5*dt)
            b.angle += b.omega*dt
            b.angle=max(-.22,min(.22,b.angle))
        else:
            # Damped upright recovery lets a hard landing settle naturally.
            b.omega += (-90*b.angle-18*b.omega)*dt
            b.angle += b.omega*dt
            if abs(b.angle)<.002 and abs(b.omega)<.02:b.angle=b.omega=0

    def _body_step(self, b, actor, dt):
        if b.dragging: return
        # Carry a perched pet when its supporting window moves. Detach if hidden/closed.
        if b.support not in (None, 'floor'):
            choices = [e for e in self.edges if e.side == 'top' and e.window == b.support]
            edge = next((e for e in choices if e.start <= b.x+e.anchor_x-b.anchor_x <= e.end), None)
            if edge:
                b.x += edge.anchor_x-b.anchor_x; b.y = edge.coord
                b.anchor_x, b.anchor_y = edge.anchor_x, edge.anchor_y
            else: b.support = None
        if b.support == 'floor': b.y = self.floor
        stamp = actor.get('jumpedAt', 0)
        if stamp > b.last_jump:
            b.last_jump = stamp
            if b.support is not None:
                b.vy = -520; b.support = None
        move = actor.get('chatMove') or {}
        if move.get('until', 0) > max(b.last_vertical,actor.get('_now',0)) and move.get('y'):
            b.last_vertical = move['until']
            if move['y'] < 0 and b.support is not None:
                b.support = None; b.vy = -520
            elif move['y'] > 0 and b.support not in (None, 'floor'):
                b.ignore_window = b.support; b.ignore_until = self.clock+.5
                b.support = None; b.y += 2; b.vy = 80
        if b.support is not None:self._drive(b,actor,dt)
        else:
            b.vy = min(self.MAX_FALL,b.vy+self.GRAVITY*dt)
            b.vx *= math.exp(-self.AIR_DRAG*dt)
        old_x, old_y = b.x, b.y
        b.x += b.vx*dt
        self._screen_bounds(b)
        # Side-wall impact; touching a roof is not a side impact.
        for e in self.edges:
            if e.window == b.ignore_window and self.clock < b.ignore_until: continue
            # A wall beside a monitor edge must not create an impossible narrow pocket.
            if e.side=='left' and e.coord-self.HALF < self.left+12:continue
            if e.side=='right' and e.coord+self.HALF > self.right-12:continue
            if e.side not in ('left', 'right') or not (b.y > e.start+1 and b.y-self.HEIGHT < e.end-1): continue
            if e.side == 'left' and b.vx > 0 and old_x+self.HALF <= e.coord+.01 and b.x+self.HALF >= e.coord:
                b.x = e.coord-self.HALF; b.vx *= -.3
                if b.support is not None:b.drive=-1;b.turn_until=self.clock+.8
            elif e.side == 'right' and b.vx < 0 and old_x-self.HALF >= e.coord-.01 and b.x-self.HALF <= e.coord:
                b.x = e.coord+self.HALF; b.vx *= -.3
                if b.support is not None:b.drive=1;b.turn_until=self.clock+.8
        self._screen_bounds(b)
        if b.support not in (None, 'floor') and not any(e.side == 'top' and e.window == b.support and e.start <= b.x <= e.end for e in self.edges):
            b.support = None
        if b.support is None:
            b.y += b.vy*dt
            if b.vy >= 0:
                candidates = [e for e in self.edges if e.side == 'top' and e.start <= b.x <= e.end and old_y <= e.coord+.01 and b.y >= e.coord and not (e.window == b.ignore_window and self.clock < b.ignore_until)]
                roof = min(candidates, key=lambda e:e.coord) if candidates else None
                if roof:
                    b.y = roof.coord
                    self._land(b, roof.window, roof.anchor_x, roof.anchor_y)
            else:
                ceilings = [e for e in self.edges if e.side == 'bottom' and e.start-self.HALF < b.x < e.end+self.HALF and old_y-self.HEIGHT >= e.coord-.01 and b.y-self.HEIGHT <= e.coord]
                if ceilings:
                    ceiling = max(ceilings, key=lambda e:e.coord)
                    b.y = ceiling.coord+self.HEIGHT; b.vy = abs(b.vy)*.15
            if b.y >= self.floor:
                b.y = self.floor; self._land(b, 'floor', 0, self.floor)
            if b.y < self.ceiling:
                b.y = self.ceiling; b.vy = abs(b.vy)*.15

    def _land(self,b,support,x,y):
        impact=max(0,b.vy)
        # Friction at impact removes a bounded tangential impulse; then ground
        # friction slows the remaining slide instead of the walking motor.
        if b.thrown:
            b.vx=math.copysign(max(0,abs(b.vx)-impact*.12),b.vx)
        if b.thrown and impact>500:
            b.vy=-impact*self.RESTITUTION
            b.support=None;b.y-=.1
        else:
            was_airborne=b.support is None
            b.vy=0;b.thrown=False;b.support=support
            b.sliding=abs(b.vx)>self.WALK*1.4
            if was_airborne:
                b.settle=.22;b.impact=min(1,impact/800);b.recover_until=self.clock+.22
            b.anchor_x,b.anchor_y=x,y;b.landed_at=self.clock
