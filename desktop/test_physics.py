import unittest
from physics import Body, Edge, Physics, visible_edges

A={'id':'viewer','moving':False,'_now':1000}

class PhysicsTests(unittest.TestCase):
    def settle(self,sim,seconds=3,actor=A):
        for _ in range(round(seconds*120)): sim.step(1/120,[actor])
        return sim.bodies['viewer']

    def test_gravity_lands_on_visible_roof(self):
        sim=Physics(1000,700);sim.bodies['viewer']=Body(300,100)
        sim.edges=visible_edges([(7,200,300,400,250)],1000,700)
        b=self.settle(sim);self.assertEqual(b.support,7);self.assertAlmostEqual(b.y,300)

    def test_walking_off_window_falls_to_floor(self):
        sim=Physics(1000,700);sim.bodies['viewer']=Body(590,300,support=7,anchor_x=200,anchor_y=300)
        sim.edges=visible_edges([(7,200,300,400,250)],1000,700)
        b=self.settle(sim,3,{**A,'moving':True,'facing':'right'})
        self.assertGreater(b.x,600);self.assertEqual(b.support,'floor');self.assertAlmostEqual(b.y,697)

    def test_moving_and_closed_window_carry_then_drop(self):
        sim=Physics(1000,700);b=Body(300,300,support=7,anchor_x=200,anchor_y=300);sim.bodies['viewer']=b
        sim.edges=visible_edges([(7,240,350,400,200)],1000,700);sim.step(.01,[A])
        self.assertAlmostEqual(b.x,340);self.assertAlmostEqual(b.y,350)
        sim.edges=[];self.settle(sim);self.assertEqual(b.support,'floor')

    def test_drag_flick_has_inertia_hold_and_drop_do_not(self):
        sim=Physics(1000,700);sim.bodies['viewer']=Body(200,200)
        sim.begin_drag('viewer',200,180,1);sim.drag('viewer',240,180,1.04);sim.drag('viewer',290,170,1.08);sim.release('viewer',1.081)
        b=sim.bodies['viewer'];self.assertTrue(b.thrown);self.assertGreater(b.vx,800);self.assertLess(b.vy,0)
        x=b.x;sim.step(.05,[A]);self.assertGreater(b.x,x)
        sim.begin_drag('viewer',b.x,b.y,2);sim.drag('viewer',400,200,2.05);sim.release('viewer',2.3)
        self.assertFalse(b.thrown);self.assertEqual(b.vx,0)

    def test_side_collision_and_underside_bounce(self):
        sim=Physics(1000,700);sim.edges=visible_edges([(7,400,250,200,200)],1000,700)
        b=Body(340,360,vx=1200,thrown=True);sim.bodies['viewer']=b;sim.step(.05,[A])
        self.assertLess(b.vx,0);self.assertLessEqual(b.x,368)
        b.x=500;b.y=550;b.vx=0;b.vy=-1000;b.support=None
        sim.step(.05,[A]);self.assertGreater(b.vy,0);self.assertGreaterEqual(b.y,524)

    def test_roofs_covered_by_front_window_are_not_platforms(self):
        edges=visible_edges([(1,100,300,600,250),(2,300,200,200,350)],1000,700)
        spans=[(e.start,e.end) for e in edges if e.window==1 and e.side=='top']
        self.assertEqual(spans,[(100,300),(500,700)])

    def test_fast_fall_cannot_tunnel_and_throw_stays_on_monitor(self):
        sim=Physics(1000,700);sim.edges=visible_edges([(7,200,300,500,10)],1000,700)
        b=Body(400,250,vy=9000);sim.bodies['viewer']=b;sim.step(.1,[A]);self.assertEqual(b.support,7)
        b.x=965;b.y=160;b.support=None;b.vx=1500;b.vy=-1000;b.thrown=True
        sim.step(.1,[A]);self.assertLess(b.vx,0);self.assertGreaterEqual(b.y,74);self.assertLessEqual(b.x,968)

    def test_jump_leaves_surface_and_drop_ignores_same_roof(self):
        sim=Physics(1000,700);sim.edges=visible_edges([(7,200,300,500,200)],1000,700)
        b=Body(400,300,support=7,anchor_x=200,anchor_y=300);sim.bodies['viewer']=b
        sim.step(.01,[{**A,'jumpedAt':999}]);self.assertLess(b.y,300);self.assertIsNone(b.support)
        b.y=300;b.vy=0;b.support=7
        sim.step(.01,[{**A,'chatMove':{'y':1,'until':1200}}]);self.assertGreater(b.y,300);self.assertIsNone(b.support)

    def test_walking_turns_at_monitor_border_without_sticking(self):
        sim=Physics(1000,700);sim.bodies['viewer']=Body(960,697,support='floor')
        b=self.settle(sim,1,{**A,'moving':True,'facing':'right'})
        self.assertLess(b.x,940);self.assertLess(b.vx,0)

    def test_work_area_keeps_pets_clear_of_panels(self):
        sim=Physics(1000,700,floor=650,left=70,right=950,ceiling=30)
        sim.bodies['viewer']=Body(100,500,vx=-1500,thrown=True)
        b=self.settle(sim,2)
        self.assertGreaterEqual(b.x,102);self.assertLessEqual(b.x,918)
        self.assertEqual(b.y,650)
        sim.begin_drag('viewer',b.x,b.y,1);sim.drag('viewer',0,0,1.05)
        self.assertEqual(b.x,102);self.assertEqual(b.y,104)

    def test_removed_viewer_drops_local_body_without_changing_other_pet(self):
        sim=Physics(1000,700);sim.sync([A,{'id':'two'}]);sim.bodies['two'].x=600
        sim.sync([{'id':'two'}]);self.assertNotIn('viewer',sim.bodies);self.assertEqual(sim.bodies['two'].x,600)

if __name__=='__main__':unittest.main()
