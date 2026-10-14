"""Numerical integrity smoke tests; not external CFD validation."""
from pathlib import Path
import sys
import unittest
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from cavity_flow import Cavity,Setup,experiment,obstacle


class CavityPhysicsChecks(unittest.TestCase):
    def test_conduction_reference_and_static_water(self):
        r=experiment(Setup(n=10,steps=80),buoyancy=False,perturbation=0.)
        self.assertAlmostEqual(r.nusselt,1.,places=10)
        self.assertAlmostEqual(r.nusselt_top,1.,places=10)
        self.assertEqual(r.max_speed,0.)
        self.assertEqual(r.net_boundary_flux,0.)

    def test_pressure_projection_conserves_volume(self):
        r=experiment(Setup(n=10,steps=180))
        self.assertEqual(r.net_boundary_flux,0.)
        self.assertLess(r.max_divergence,1e-9)
        self.assertGreater(r.max_speed,0.)
        self.assertTrue(np.isfinite(r.temperature).all())

    def test_barrier_impermeability(self):
        s=Setup(n=12,steps=160)
        cavity=Cavity(s,obstacle(s.n,'split'))
        r=cavity.run()
        self.assertLess(r.max_divergence,1e-9)
        self.assertEqual(r.net_boundary_flux,0.)
        self.assertEqual(float(np.max(np.abs(r.velocity[:,r.solid]))),0.)
        self.assertTrue(np.allclose(cavity.u[1:-1][~cavity.open_x],0.))
        self.assertTrue(np.allclose(cavity.v[:,1:-1][~cavity.open_y],0.))
        self.assertTrue(np.allclose(cavity.w[:,:,1:-1][~cavity.open_z],0.))

    def test_fixed_seed_reproducible(self):
        s=Setup(n=9,steps=35)
        a=experiment(s); b=experiment(s)
        np.testing.assert_array_equal(a.temperature,b.temperature)
        np.testing.assert_array_equal(a.velocity,b.velocity)

    def test_invalid_solid_shape_rejected(self):
        with self.assertRaises(ValueError):
            Cavity(Setup(),np.zeros((2,2,2),dtype=bool))


if __name__ == '__main__': unittest.main()
