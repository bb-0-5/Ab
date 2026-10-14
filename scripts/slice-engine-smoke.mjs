import assert from 'node:assert/strict';
import {createSliceEngine,advanceSlices,sliceEvidence,bottomTemperature,snapshot,MODEL} from '../public/slice-engine.mjs';

const e=createSliceEngine({n:13,layers:7});
assert.equal(e.T.length,13*13*7);
assert.equal(e.u.length,14*13*7);
assert.equal(e.w.length,13*13*8);
assert.ok(e.u.every(x=>x===0)&&e.v.every(x=>x===0)&&e.w.every(x=>x===0),'fluid initially at rest');
assert.ok(bottomTemperature(.27,0,.31)>bottomTemperature(.27,0,.92),'heat source is asymmetric along z');
console.time('3d coupled solver benchmark');
advanceSlices(e,80);
console.timeEnd('3d coupled solver benchmark');
assert.equal(e.step,80);
for(const [name,a] of Object.entries({T:e.T,p:e.p,u:e.u,v:e.v,w:e.w}))assert.ok(a.every(Number.isFinite),`nonfinite ${name}`);
assert.ok(e.T.every(x=>x>-2&&x<3),'temperature plausible');
const u=(i,j,k)=>(k*13+j)*14+i,v=(i,j,k)=>(k*14+j)*13+i,w=(i,j,k)=>(k*13+j)*13+i;
for(let k=0;k<7;k++)for(let j=0;j<13;j++){
 assert.equal(e.u[u(0,j,k)],0,'x=0 impermeable');
 assert.equal(e.u[u(13,j,k)],0,'x=1 impermeable');
}
for(let k=0;k<7;k++)for(let i=0;i<13;i++){
 assert.equal(e.v[v(i,0,k)],0,'y=0 impermeable');
 assert.equal(e.v[v(i,13,k)],0,'y=1 impermeable');
}
for(let j=0;j<13;j++)for(let i=0;i<13;i++){
 assert.equal(e.w[w(i,j,0)],0,'z=0 impermeable');
 assert.equal(e.w[w(i,j,7)],0,'z=1 impermeable');
}
const proof=sliceEvidence(e);
assert.ok(proof.peakW>1e-5,`physically generated cross-plane flow ${proof.peakW}`);
assert.ok(proof.divergenceMax<MODEL.tolerance*1.2,`projected flow must be almost divergence-free, got ${proof.divergenceMax}`);
assert.ok(proof.preDivergence>proof.divergenceMax*5,'3D pressure projection must correct divergence');
assert.ok(proof.pressureSweeps>0,'projection pressure iterations actually executed');
for(let k=1;k<7;k++){
 const total=Array.from({length:13*13},(_,q)=>e.w[k*13*13+q]).reduce((a,b)=>a+b,0)/(13*13);
 assert.ok(Math.abs(total)<proof.divergenceMax,`no net water can cross a sealed slice, face ${k}: ${total}`);
}
assert.ok(e.w.some(x=>x>1e-5)&&e.w.some(x=>x<-1e-5),'both directions of depth velocity resolved');
assert.ok(proof.priority.length===7&&proof.signals.some(s=>s.id==='perpendicular-flow'));
const save=snapshot(e);
assert.equal(save.slices.length,7);
assert.equal(save.slices[3].w.length,13*13);
assert.equal(save.slices[3].pressure.length,13*13);
assert.equal(save.model.note.includes('3D staggered'),true);
console.log('PASS: 3D MAC velocity, pressure projection, sealed walls, perpendicular advection, evidence diagnostics');
console.log(JSON.stringify({time:e.time,peakW:proof.peakW,divergenceMax:proof.divergenceMax,preDivergence:proof.preDivergence,sweeps:proof.pressureSweeps,focus:proof.focus}));
