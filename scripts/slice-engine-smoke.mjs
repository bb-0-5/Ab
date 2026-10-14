import assert from 'node:assert/strict';
import {createSliceEngine,advanceSlices,sliceEvidence,bottomTemperature,snapshot} from '../public/slice-engine.mjs';
const e=createSliceEngine({n:17,layers:9});
assert.equal(e.T.length,17*17*9);
assert.equal(e.u.every(v=>v===0),true,'starts at rest');
assert.ok(bottomTemperature(.5)>bottomTemperature(0),'heated patch');
const delta0=e.T[(4*17*17)+8*17+8]-e.T[(5*17*17)+8*17+8];
assert.equal(delta0,0,'initial layers have identical heat fields');
advanceSlices(e,75);
assert.equal(e.step,75);
for(const arr of [e.T,e.omega,e.psi,e.u,e.v])assert.ok(arr.every(Number.isFinite),'field finite');
assert.ok(e.T.every(x=>x>=-.15&&x<=1.15),'temperature bounded');
const faceSize=17*17;
for(let y=0;y<17;y++)for(let x=0;x<17;x++){
 assert.equal(e.u[y*17+x],0,'front z wall no-slip');
 assert.equal(e.v[(8*faceSize)+y*17+x],0,'back z wall no-slip');
}
for(let k=0;k<9;k++)for(let x=0;x<17;x++){
 assert.ok(Math.abs(e.T[k*faceSize+x]-bottomTemperature(x/16))<1e-10,'heated bottom Dirichlet');
 assert.equal(e.T[k*faceSize+16*17+x],0,'cold top Dirichlet');
}
const ev=sliceEvidence(e);assert.ok(ev.focus>=1&&ev.focus<=7);
assert.ok(ev.signals.find(x=>x.id==='temperature-gradient'));
assert.ok(ev.priority.every(x=>Number.isFinite(x.score)));
const saved=snapshot(e);assert.equal(saved.slices.length,9);assert.equal(saved.slices[3].temperature.length,289);
assert.ok(ev.divergenceMax<1,'restricted 2D streamfunction sufficiently low divergence');
console.log('PASS: 2.5D model numerically finite; walls fixed, heating and coupling checked; gear priorities/evidence emitted; note model is not full 3D CFD.');
console.log(JSON.stringify({steps:e.step,time:e.time,focus:ev.focus,kineticRms:ev.kineticRms,verticalGradient:ev.maxVerticalGradient,divergenceMax:ev.divergenceMax}));
