"""Small, deterministic 3-D closed-cavity Boussinesq flow experiment.

A demonstration / benchmark, NOT a production CFD solver or material validation.
Staggered face velocities, cell-centred pressure and temperature. Pressure
projection conserves volume to solver precision through impermeable faces.
Bottom and top are isothermal, side walls and internal solid are adiabatic.
No inlets/outlets. Internal solid obstacles are stationary and impermeable;
no-slip is approximated with zero-value ghost diffusion at solid boundaries.

Dimensionless free-fall units: length L, velocity sqrt(g*beta*DeltaT*L),
time L/U; viscous coefficient sqrt(Pr/Ra), diffusivity 1/sqrt(Ra*Pr).
This approximates low-Mach incompressible water with buoyancy (Boussinesq).
"""
from __future__ import annotations

from dataclasses import dataclass
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.linalg import factorized


@dataclass(frozen=True)
class Setup:
    n: int = 12
    rayleigh: float = 20000.0
    prandtl: float = 7.0
    dt: float = 0.020
    steps: int = 3200

    def __post_init__(self) -> None:
        if not 6 <= self.n <= 40 or self.rayleigh <= 0 or self.prandtl <= 0:
            raise ValueError('Invalid discretisation or fluid parameters')
        if not 0 < self.dt < 0.2 or self.steps < 0:
            raise ValueError('Invalid time settings')


@dataclass
class Result:
    temperature: np.ndarray
    velocity: np.ndarray  # cell-centre (3,n,n,n), x/y/z; y points up
    solid: np.ndarray
    nusselt: float
    kinetic_energy: float
    max_speed: float
    max_divergence: float
    net_boundary_flux: float
    nusselt_top: float
    plate_flux_gap: float
    final_nusselt_delta_200: float
    steady: bool
    completed_steps: int
    rayleigh: float
    prandtl: float

    def summary(self) -> dict:
        return {k: float(getattr(self, k)) for k in (
            'nusselt', 'kinetic_energy', 'max_speed', 'max_divergence',
            'net_boundary_flux', 'nusselt_top', 'plate_flux_gap',
            'final_nusselt_delta_200', 'rayleigh', 'prandtl') } | {
                'steady': bool(self.steady),
                'grid': int(self.temperature.shape[0]),
                'steps': self.completed_steps,
                'solid_fraction': float(self.solid.mean()),
                'evidence': '3d_boussinesq_coarse_numerical_model_only',
                'limitation': 'Coarse-grid, approximate no-slip and thermal boundaries; not engineering validation',
            }


def obstacle(n: int, kind: str = 'none', shift: float = 0., span: float = .75) -> np.ndarray:
    """Interior insulating solids, kept away from hot/cold boundary plates."""
    x, y, z = np.meshgrid(
        (np.arange(n) + .5) / n, (np.arange(n) + .5) / n,
        (np.arange(n) + .5) / n, indexing='ij')
    if kind == 'none':
        return np.zeros((n, n, n), dtype=bool)
    if kind == 'pillar':
        return ((x-.5)**2 + (z-.5)**2 < .12**2) & (y>.16) & (y<.84)
    if kind == 'split':
        return (abs(x-(.5+shift))<.075) & (y>.20) & (y<.80) & (z<span)
    if kind == 'fins':
        return ((abs(x-.33)<.045) | (abs(x-.67)<.045)) & (y>.25) & (y<.75) & (z>.24) & (z<.76)
    raise ValueError(f'Unknown geometry: {kind}')


class Cavity:
    def __init__(self, setup: Setup, solid: np.ndarray | None = None,
                 buoyancy: bool = True, perturbation: float = .015):
        self.s = setup
        n = setup.n
        self.h = 1. / n
        self.fluid = ~(np.zeros((n,n,n), bool) if solid is None else np.asarray(solid, bool))
        if self.fluid.shape != (n,n,n) or not self.fluid.any():
            raise ValueError('Invalid fluid/obstacle shape')
        if not (self.fluid[:,0,:].all() and self.fluid[:,-1,:].all()):
            raise ValueError('Hot/cold plate interfaces must remain fluid')
        # Each liquid-connected component must have its own pressure gauge.
        # The current geometry catalogue deliberately keeps a single connected volume.
        from scipy.ndimage import label
        labels, components = label(self.fluid)
        if components != 1:
            raise ValueError('For this prototype the liquid must remain connected')
        self.buoyancy = buoyancy
        self.f = self.fluid
        self.open_x = self.f[:-1,:,:] & self.f[1:,:,:]
        self.open_y = self.f[:,:-1,:] & self.f[:,1:,:]
        self.open_z = self.f[:,:,:-1] & self.f[:,:,1:]
        self.u = np.zeros((n+1,n,n), dtype=float)
        self.v = np.zeros((n,n+1,n), dtype=float)
        self.w = np.zeros((n,n,n+1), dtype=float)
        # Linear conductive base profile, plus tiny 3D deterministic perturbation
        # which seeds symmetry breaking in the unstably heated-from-below cube.
        xc, yc, zc = np.meshgrid((np.arange(n)+.5)/n,(np.arange(n)+.5)/n,
                                  (np.arange(n)+.5)/n,indexing='ij')
        self.t = np.broadcast_to(1. - np.arange(n)[None,:,None]/(n-1), (n,n,n)).copy()
        self.t += perturbation*np.sin(2*np.pi*xc)*np.sin(np.pi*yc)*np.cos(np.pi*zc)
        self.t[:,0,:] = 1.; self.t[:,-1,:] = 0.
        self.t[~self.f] = .5
        self._make_pressure_solver()

    def _make_pressure_solver(self) -> None:
        n = self.s.n
        ids = -np.ones(self.f.shape, dtype=np.int32)
        ids[self.f] = np.arange(int(self.f.sum()))
        rows, cols, vals = [], [], []
        for i,j,k in np.argwhere(self.f):
            a=int(ids[i,j,k]); diag=0
            for di,dj,dk in ((1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)):
                ii,jj,kk = i+di,j+dj,k+dk
                if 0<=ii<n and 0<=jj<n and 0<=kk<n and self.f[ii,jj,kk]:
                    diag += 1
                    if a != 0:
                        rows.append(a);cols.append(int(ids[ii,jj,kk]));vals.append(-1.)
            if a != 0:
                rows.append(a); cols.append(a); vals.append(float(diag))
            else:
                rows.append(a);cols.append(a);vals.append(1.)
        mat = coo_matrix((vals,(rows,cols)), shape=(int(self.f.sum()),)*2).tocsc()
        self._pressure_solve = factorized(mat)
        self._ids = ids

    def _divergence(self) -> np.ndarray:
        return ((self.u[1:]-self.u[:-1]) +
                (self.v[:,1:]-self.v[:,:-1]) +
                (self.w[:,:,1:]-self.w[:,:,:-1])) / self.h

    def _lap(self, arr: np.ndarray) -> np.ndarray:
        # Dirichlet-zero ghost layer approximates stationary solid boundaries;
        # impermeable normal components also get explicitly masked below.
        pad = np.pad(arr, 1, mode='constant')
        mid = tuple(slice(1,-1) for _ in range(3))
        out = -6 * pad[mid]
        for axis in range(3):
            lo=list(mid); hi=list(mid)
            lo[axis]=slice(0,-2);hi[axis]=slice(2,None)
            out = out + pad[tuple(lo)] + pad[tuple(hi)]
        return out / self.h**2

    def _momentum(self, dt: float) -> None:
        u,v,w=self.u,self.v,self.w
        # Interpolate the other two staggered components to each face.
        vy_u = np.zeros_like(u); wz_u=np.zeros_like(u)
        vy_u[1:-1] = .25*(v[:-1,:-1]+v[:-1,1:]+v[1:,:-1]+v[1:,1:])
        wz_u[1:-1] = .25*(w[:-1,:,:-1]+w[:-1,:,1:]+w[1:,:,:-1]+w[1:,:,1:])
        ux_v=np.zeros_like(v); wz_v=np.zeros_like(v)
        ux_v[:,1:-1] = .25*(u[:-1,:-1]+u[1:,:-1]+u[:-1,1:]+u[1:,1:])
        wz_v[:,1:-1] = .25*(w[:,:-1,:-1]+w[:,:-1,1:]+w[:,1:,:-1]+w[:,1:,1:])
        ux_w=np.zeros_like(w); vy_w=np.zeros_like(w)
        ux_w[:,:,1:-1] = .25*(u[:-1,:,:-1]+u[1:,:,:-1]+u[:-1,:,1:]+u[1:,:,1:])
        vy_w[:,:,1:-1] = .25*(v[:,:-1,:-1]+v[:,1:,:-1]+v[:,:-1,1:]+v[:,1:,1:])
        def advance(q: np.ndarray, ax: np.ndarray, ay: np.ndarray, az: np.ndarray):
            gx,gy,gz=np.gradient(q,self.h)
            return q + dt*(nu*self._lap(q) - ax*gx - ay*gy - az*gz)
        nu=np.sqrt(self.s.prandtl/self.s.rayleigh)
        next_u=advance(u,u,vy_u,wz_u)
        next_v=advance(v,ux_v,v,wz_v)
        next_w=advance(w,ux_w,vy_w,w)
        if self.buoyancy:
            # Vertical buoyancy theta=y-temperature anomaly; hydrostatic part
            # is eliminated in pressure projection, circulation comes from variations.
            next_v[:,1:-1,:] += dt*.5*(self.t[:,:-1,:]+self.t[:,1:,:] - 1.)
        next_u[1:-1] *= self.open_x
        next_v[:,1:-1] *= self.open_y
        next_w[:,:,1:-1] *= self.open_z
        # Six rigid cube faces remain exactly impermeable at every step.
        next_u[0]=next_u[-1]=0.
        next_v[:,0]=next_v[:,-1]=0.
        next_w[:,:,0]=next_w[:,:,-1]=0.
        self.u,self.v,self.w=next_u,next_v,next_w

    def _project(self, dt: float) -> None:
        # Divergence-free face fluxes: A p = -(h²/dt) div(u*) with
        # A = graph Laplacian (degree - neighbours). Pin one gauge node.
        rhs = -self._divergence()[self.f] * (self.h**2 / dt)
        rhs -= rhs.mean()  # compatibility for pure Neumann domain
        rhs[0]=0.
        p=np.zeros_like(self.t)
        p[self.f]=self._pressure_solve(rhs)
        self.u[1:-1] -= (dt/self.h)*(p[1:]-p[:-1])*self.open_x
        self.v[:,1:-1] -= (dt/self.h)*(p[:,1:]-p[:,:-1])*self.open_y
        self.w[:,:,1:-1] -= (dt/self.h)*(p[:,:,1:]-p[:,:,:-1])*self.open_z

    def _temperature(self, dt: float) -> None:
        t=self.t
        # Conservative upwind advection across open cell faces.
        div=np.zeros_like(t)
        qx=self.u[1:-1] * np.where(self.u[1:-1]>0,t[:-1],t[1:]) * self.open_x
        qy=self.v[:,1:-1] * np.where(self.v[:,1:-1]>0,t[:,:-1],t[:,1:]) * self.open_y
        qz=self.w[:,:,1:-1] * np.where(self.w[:,:,1:-1]>0,t[:,:,:-1],t[:,:,1:]) * self.open_z
        div[:-1] += qx/self.h; div[1:] -= qx/self.h
        div[:,:-1] += qy/self.h; div[:,1:] -= qy/self.h
        div[:,:,:-1] += qz/self.h; div[:,:,1:] -= qz/self.h
        # Conductive transfer through liquid faces only; solids insulated.
        lap=np.zeros_like(t)
        for axis,opened in ((0,self.open_x),(1,self.open_y),(2,self.open_z)):
            l=[slice(None)]*3; r=[slice(None)]*3
            l[axis]=slice(None,-1); r[axis]=slice(1,None)
            diff=(t[tuple(r)]-t[tuple(l)])*opened/(self.h**2)
            lap[tuple(l)] += diff;lap[tuple(r)] -= diff
        kappa=1./np.sqrt(self.s.rayleigh*self.s.prandtl)
        t2=t+dt*(kappa*lap-div)
        t2[:,0,:]=1.;t2[:,-1,:]=0.
        t2[~self.f]=.5
        if not np.all(np.isfinite(t2)) or np.max(np.abs(t2[self.f]))>5:
            raise FloatingPointError('Thermal solver became unstable; reduce dt or resolution')
        self.t=t2

    def run(self) -> Result:
        s=self.s
        prior_nu = 0.0
        for i in range(s.steps):
            if i == max(0, s.steps-200):
                prior_nu = float((self.t[:,0,:]-self.t[:,1,:]).mean()*(s.n-1))
            self._momentum(s.dt)
            self._project(s.dt)
            self._temperature(s.dt)
        velocity=np.stack(((self.u[:-1]+self.u[1:])*.5,
                            (self.v[:,:-1]+self.v[:,1:])*.5,
                            (self.w[:,:,:-1]+self.w[:,:,1:])*.5))
        velocity[:,~self.f] = 0.
        speed=np.sqrt((velocity**2).sum(axis=0))
        # Nusselt = plate flux relative to a linear conductive baseline.
        # Note that with interior solids this is an approximate diagnostic.
        Nu=float((self.t[:,0,:]-self.t[:,1,:]).mean()*(s.n-1))
        Nu_top=float((self.t[:,-2,:]-self.t[:,-1,:]).mean()*(s.n-1))
        flux_gap=abs(Nu-Nu_top)/max(1.,abs(Nu))
        trend=abs(Nu-prior_nu)/max(1.,abs(Nu))
        steady=flux_gap<.02 and trend<.02
        boundaries=(np.abs(self.u[[0,-1]]).sum()+np.abs(self.v[:,[0,-1]]).sum()
                   +np.abs(self.w[:,:,[0,-1]]).sum())
        return Result(self.t.copy(),velocity.copy(),(~self.f).copy(),Nu,
                      float(np.mean(speed[self.f]**2)*.5),float(speed.max()),
                      float(np.max(np.abs(self._divergence()[self.f]))),
                      float(boundaries),Nu_top,float(flux_gap),float(trend),
                      bool(steady),s.steps,s.rayleigh,s.prandtl)


def experiment(s: Setup=Setup(), kind: str='none', buoyancy: bool=True,
               perturbation: float=.015, shift: float=0., span: float=.75) -> Result:
    return Cavity(s,obstacle(s.n,kind,shift,span),buoyancy,perturbation).run()