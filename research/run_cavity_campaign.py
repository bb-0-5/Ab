"""One-command local closed-cavity heat-transfer discovery demonstration.

Runs CPU jobs in separate Python processes; emits a machine-readable
2D midplane field for a Hexfield adapter without touching abovebound.org.
"""
from __future__ import annotations

from concurrent.futures import ProcessPoolExecutor
from dataclasses import asdict, dataclass
from pathlib import Path
import argparse
import json
import os

from cavity_flow import Setup, Result, experiment


@dataclass(frozen=True)
class Design:
    name: str
    kind: str
    shift: float = 0.0
    span: float = .75


def evaluate(job: tuple[Setup, Design]) -> tuple[Design, Result]:
    s, d = job
    return d, experiment(s, d.kind, shift=d.shift, span=d.span)


def batch(setup: Setup, designs: list[Design], workers: int) -> list[tuple[Design, Result]]:
    if workers == 1:
        return [evaluate((setup, d)) for d in designs]
    with ProcessPoolExecutor(max_workers=workers) as pool:
        return list(pool.map(evaluate, ((setup, d) for d in designs)))


def choose(rows: list[tuple[Design, Result]]) -> tuple[Design, Result]:
    trustworthy = [(d,r) for d,r in rows if r.steady and r.max_divergence<1e-8
                   and r.net_boundary_flux<1e-12]
    if not trustworthy:
        raise RuntimeError('No numerically stable, approximately steady model candidate')
    return max(trustworthy, key=lambda item: item[1].nusselt_top)


def campaign(output: Path, *, workers: int=2, setup: Setup=Setup()) -> dict:
    output.mkdir(parents=True, exist_ok=True)
    baseline = Design('empty_cube', 'none')
    primary = [baseline, Design('pillar','pillar'), Design('split_baffle','split'),
               Design('parallel_fins','fins')]
    rows = batch(setup, primary, workers)
    # Automatically revise the best stage-1 geometry rather than demanding
    # any user-selected materials, properties or optimiser parameters.
    stage1_best = choose(rows)[0]
    mutations = [Design('baffle_shift_left', 'split', -.10),
                 Design('baffle_shift_right', 'split', .10),
                 Design('baffle_shorter', 'split', 0, .65),
                 Design('baffle_longer', 'split', 0, .85)]
    rows.extend(batch(setup, mutations, workers))
    winner, best = choose(rows)
    original = next(r for d,r in rows if d.name==baseline.name)
    improvement=(best.nusselt_top/original.nusselt_top - 1.)*100
    ranking=[{'candidate':d.name, 'parameters':asdict(d), **r.summary(),
              'delta_vs_empty_percent':(r.nusselt_top/original.nusselt_top-1)*100}
             for d,r in sorted(rows, key=lambda z:z[1].nusselt_top,reverse=True)]
    # Independent grid spacing check against exactly the same operating
    # regime and benchmark; refinement does NOT prove PDE correctness.
    finer=Setup(n=16, dt=setup.dt, steps=setup.steps,
                rayleigh=setup.rayleigh, prandtl=setup.prandtl)
    refined=batch(finer, [baseline,winner] if winner.name!=baseline.name else [baseline],workers)
    fine_base=refined[0][1]
    fine_winner=refined[-1][1]
    refined_delta=(fine_winner.nusselt_top/fine_base.nusselt_top-1.)*100
    refinement_agrees=((improvement>0 and refined_delta>0) or
                       (abs(improvement)<.01 and abs(refined_delta)<.01))
    report={
        'experiment':'sealed_cubic_water_cavity_hot_bottom_cold_top',
        'stage1_best':stage1_best.name,
        'selected_geometry':asdict(winner),
        'evaluated':len(rows),
        'objective':'maximise top-wall heat extraction at fixed DeltaT with an insulating interior structure',
        'cube':'six impermeable stationary walls; bottom T=1, top T=0, sidewall insulated',
        'medium':'single-phase water represented by Ra/Pr Boussinesq approximation',
        'search_settings':asdict(setup),
        'relative_top_heat_flux_percent':improvement,
        'refinement':{'grid':finer.n,'winner_nusselt_top':fine_winner.nusselt_top,
                      'empty_nusselt_top':fine_base.nusselt_top,
                      'relative_gain_percent':refined_delta,
                      'gain_sign_reproduced':refinement_agrees,
                      'numerical_convergence_not_established':True},
        'ranked_candidates':ranking,
        'evidence':'modeled_only_not_experimental',
        'limitations':[
          'Low-resolution proof of concept, not an engineering-grade CFD solver.',
          'Approximately enforced tangential no-slip; pressure projection enforces zero normal flux.',
          'Insulating ideal solids without conjugate conduction or material strength.',
          'No turbulence closure, compressibility, phase change, radiation or validation measurements.',
          'Do not claim engineering improvement unless grid/time-step convergence and external benchmarks pass.',
        ],
    }
    (output/'report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
    import numpy as np
    np.savez_compressed(output/'winner_fields.npz',temperature=best.temperature,
                        velocity=best.velocity,solid=best.solid)
    k=setup.n//2
    spec={'schema':'abovebound.cavity.midplane.v1','coords':{'x':'horizontal','y':'up','z_index':k},
          'quantity_units':{'temperature':'normalised, hot=1 cold=0',
                            'velocity':'free-fall velocity units'},
          'temperature':best.temperature[:,:,k].tolist(),
          'vx':best.velocity[0,:,:,k].tolist(),
          'vy':best.velocity[1,:,:,k].tolist(),
          'solid':best.solid[:,:,k].astype(int).tolist(),
          'experimental_status':'numerical_model_only'}
    (output/'winner_midplane.json').write_text(json.dumps(spec)+'\n',encoding='utf8')
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        fig,ax=plt.subplots(figsize=(7,7))
        t=best.temperature[:,:,k].T
        ax.imshow(t, origin='lower',extent=(0,1,0,1),vmin=0,vmax=1,cmap='coolwarm')
        mask=np.ma.masked_where(~best.solid[:,:,k].T,best.solid[:,:,k].T)
        ax.imshow(mask,origin='lower',extent=(0,1,0,1),cmap='Greys',vmin=0,vmax=1)
        idx=np.arange(1,setup.n-1,2)
        X,Y=np.meshgrid((idx+.5)/setup.n,(idx+.5)/setup.n,indexing='ij')
        ax.quiver(X,Y,best.velocity[0,:,:,k][np.ix_(idx,idx)],
                  best.velocity[1,:,:,k][np.ix_(idx,idx)],color='black',scale=.7)
        ax.set(xlabel='x / cube length',ylabel='y / cube length',
               title=f'3D cube midplane — {winner.name}\nCold top ↑  |  Hot bottom ↓')
        fig.tight_layout(); fig.savefig(output/'winner_midplane.png',dpi=150)
        plt.close(fig)
    except ImportError:
        pass
    return report


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=Path('cavity-results'))
    parser.add_argument('--workers',type=int,default=min(2,os.cpu_count() or 1))
    args=parser.parse_args()
    if not 1<=args.workers<=16:parser.error('--workers must be 1..16')
    report=campaign(args.output,workers=args.workers)
    print(json.dumps({k:report[k] for k in
          ('selected_geometry','evaluated','relative_top_heat_flux_percent','refinement','evidence')},indent=2))
    print('Numerical results stored in',args.output.resolve())
