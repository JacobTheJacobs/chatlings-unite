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
    last_jump: float = 0
    last_vertical: float = 0
    ignore_window: object = None
    ignore_until: float = 0
    drive: int = 0
    last_intent: int = 0
    last_horizontal: float = 0
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
    MAX_FALL = 1200
    WALK = 70

    def __init__(self, width, height, floor=None, left=0, right=None, ceiling=0):
        self.width, self.height = width, height
        self.floor = height-3 if floor is None else floor
        self.left = left+self.HALF
        self.right = (width if right is None else right)-self.HALF
        self.ceiling = ceiling+self.HEIGHT
        self.bodies = {}
        self.edges = []
        self.clock = 0

    def sync(self, actors):
        ids = {p['id'] for p in actors}
        self.bodies = {key: body for key, body in self.bodies.items() if key in ids}
        for p in actors:
            if p['id'] not in self.bodies:
                x = 45 + p.get('x', 450)/960*(self.width-90)
                self.bodies[p['id']] = Body(max(self.left, min(self.right, x)), self.ceiling+16)

    def begin_drag(self, pid, x, y, now):
        body = self.bodies[pid]
        body.dragging = True; body.support = None; body.thrown = False
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
        if len(recent) >= 2 and now-recent[-1][0] < .08:
            first, last = recent[0], recent[-1]
            duration = max(.015, last[0]-first[0])
            body.vx = max(-1500, min(1500, (last[1]-first[1])/duration))
            body.vy = max(-1300, min(1300, (last[2]-first[2])/duration))
        body.thrown = abs(body.vx) > 160 or abs(body.vy) > 160
        if body.thrown and body.vy > -100:
            body.vy = -abs(body.vx)*.35
        if not body.thrown: body.vx = body.vy = 0
        body.samples = []; body.support = None

    def reset(self, pid):
        body = self.bodies[pid]
        body.y = self.ceiling+16; body.vx = body.vy = 0; body.support = None; body.thrown = False

    def step(self, dt, actors):
        self.clock += min(max(dt, 0), .1)
        self.sync(actors)
        # Fixed small substeps keep collisions and bounce independent of render rate.
        remaining = min(max(dt, 0), .1)
        while remaining > .000001:
            step = min(remaining, 1/120)
            for actor in actors:
                self._body_step(self.bodies[actor['id']], actor, step)
            remaining -= step

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
                b.vy = -560; b.support = None
        move = actor.get('chatMove') or {}
        if move.get('until', 0) > max(b.last_vertical,actor.get('_now',0)) and move.get('y'):
            b.last_vertical = move['until']
            if move['y'] < 0 and b.support is not None:
                b.support = None; b.vy = -560
            elif move['y'] > 0 and b.support not in (None, 'floor'):
                b.ignore_window = b.support; b.ignore_until = self.clock+.5
                b.support = None; b.y += 2; b.vy = 80
        if b.support is not None:
            direction = (-1 if actor.get('facing') == 'left' else 1) if actor.get('moving') else 0
            emote = actor.get('emote') or {}
            if emote.get('until', 0) > actor.get('_now', 0): direction = 0
            if direction != b.last_intent:
                b.drive = direction; b.last_intent = direction
            if move.get('x') and move.get('until',0) > max(b.last_horizontal,actor.get('_now',0)):
                b.last_horizontal = move['until']; b.drive = -1 if move['x'] < 0 else 1
            desired = b.drive*self.WALK if direction else 0
            b.vx += max(-1100*dt, min(1100*dt, desired-b.vx))
        else:
            b.vy = min(self.MAX_FALL, b.vy+self.GRAVITY*dt)
            b.vx *= math.exp(-.18*dt)
        old_x, old_y = b.x, b.y
        b.x += b.vx*dt
        if b.x < self.left or b.x > self.right:
            b.x = max(self.left, min(self.right, b.x)); b.vx *= -.55
            if b.support is not None:b.drive=1 if b.x==self.left else -1
        # Side-wall impact; touching a roof is not a side impact.
        for e in self.edges:
            if e.window == b.ignore_window and self.clock < b.ignore_until: continue
            if e.side not in ('left', 'right') or not (b.y > e.start+1 and b.y-self.HEIGHT < e.end-1): continue
            if e.side == 'left' and b.vx > 0 and old_x+self.HALF <= e.coord+.01 and b.x+self.HALF >= e.coord:
                b.x = e.coord-self.HALF; b.vx *= -.55
                if b.support is not None:b.drive=-1
            elif e.side == 'right' and b.vx < 0 and old_x-self.HALF >= e.coord-.01 and b.x-self.HALF <= e.coord:
                b.x = e.coord+self.HALF; b.vx *= -.55
                if b.support is not None:b.drive=1
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
                    b.y = ceiling.coord+self.HEIGHT; b.vy = abs(b.vy)*.3
            if b.y >= self.floor:
                b.y = self.floor; self._land(b, 'floor', 0, self.floor)
            if b.y < self.ceiling:
                b.y = self.ceiling; b.vy = abs(b.vy)*.3

    def _land(self, b, support, x, y):
        if b.thrown and b.vy > 300:
            b.vy *= -.28; b.vx *= .78
            b.support = None; b.y -= .1
        else:
            b.vy = 0; b.thrown = False; b.support = support
            b.anchor_x, b.anchor_y = x, y; b.landed_at = self.clock
