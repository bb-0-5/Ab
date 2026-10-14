import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {taylorGreen,periodic,decodeCavity,cubeCell} from '../public/fluid-physics.mjs';
import {torusPoint,torusNormal,torusChartVelocity,TORUS_VISUAL_META} from '../public/torus-visual.mjs';
// Periodicity / divergence / exact exponential energy decay on the two-dimensional torus.
for(let i=0;i<12;i++){
 const x=i*.419,y=i*.318,t=.2+i*.09,nu=.04,h=1e-5;
 const a=taylorGreen(x,y,t,nu);
 const bx=taylorGreen(x+2*Math.PI,y,t,nu),by=taylorGreen(x,y+2*Math.PI,t,nu);
 assert.ok(Math.abs(a.u-bx.u)<1e-12 && Math.abs(a.v-by.v)<1e-12);
 const ux=(taylorGreen(x+h,y,t,nu).u-taylorGreen(x-h,y,t,nu).u)/(2*h);
 const vy=(taylorGreen(x,y+h,t,nu).v-taylorGreen(x,y-h,t,nu).v)/(2*h);
 assert.ok(Math.abs(ux+vy)<1e-9, 'Analytical T² field must remain divergence-free');
 assert.ok(Math.abs(a.kineticEnergyFraction-Math.exp(-4*nu*t))<1e-13);
}
assert.equal(periodic(-.3,1),.7);
assert.equal(periodic(1.3,1),.30000000000000004);
// Original Python-generated numerical 3D field: bounds, voxel typing and impermeable baffle.
const raw=JSON.parse(readFileSync(new URL('../public/fluid-fields.json',import.meta.url),'utf8'));
const field=decodeCavity(raw);assert.equal(field.n,12);assert.equal(field.temperature.length,12**3);
let nSolid=0,maxVelocity=0;for(let z=0;z<field.n;z++)for(let y=0;y<field.n;y++)for(let x=0;x<field.n;x++){
 const c=cubeCell(field,x,y,z);
 if(c.solid)nSolid++;
 assert.ok(c.temp>=0&&c.temp<=1);
 for(const v of [c.vx,c.vy,c.vz]) assert.ok(Number.isFinite(v));
 maxVelocity=Math.max(maxVelocity,Math.hypot(c.vx,c.vy,c.vz));
}
assert.ok(nSolid>0&&maxVelocity>.05&&maxVelocity<.3);
assert.ok(field.metadata.relative_gain_percent>0&&field.metadata.benchmark_validated===false);
// Verify render files exist, and explicitly disclose no prize proof / no experimental validation.
const page=readFileSync(new URL('../public/fluid.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../public/fluid-lab.js',import.meta.url),'utf8');
assert.match(page,/not fiction/i);
assert.match(page,/3D DOUGHNUT/);
assert.match(js,/not a proof for every 3-D flow|not.*pipe|does not establish global smoothness/i);
assert.match(js,/torusView:'donut'/);
assert.match(js,/renderPeriodicTorus/);
assert.equal(TORUS_VISUAL_META.surface,'T²');
assert.match(TORUS_VISUAL_META.representation,/embedding only/);
for(let i=0;i<11;i++){
 const a=i*.37,b=i*.23;
 for(const [p,q] of [[torusPoint(a,b),torusPoint(a+2*Math.PI,b)],
                    [torusPoint(a,b),torusPoint(a,b+2*Math.PI)]]){
  assert.ok(p.every((v,k)=>Math.abs(v-q[k])<1e-12),'3D torus mesh must glue both periodic edges');
 }
 const v=torusChartVelocity(a,b,.3,.04),n=torusNormal(a,b);
 assert.ok(Math.abs(v.reduce((sum,e,k)=>sum+e*n[k],0))<1e-12,'Displayed chart velocity must be tangent to the donut surface');
}

console.log('PASS: exact T² dynamics; genuinely toroidal 3D topology rendering and tangent mapped flow; archived 3D field integrity');
