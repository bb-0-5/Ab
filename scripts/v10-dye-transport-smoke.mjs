import assert from 'node:assert/strict';
import {solvePoreNetwork} from '../public/v10-pressure-network.mjs';
import {createDyeTransport,stepDyeTransport,dyeSnapshot} from '../public/v10-dye-transport.mjs';
const n=7,layers=3;
const idx=(x,y,z)=>(z*n+y)*n+x;
function mask(path){const m=new Uint8Array(n*n*layers).fill(1);for(const [x,y,z] of path)m[idx(x,y,z)]=0;return m;}
const straight=[];for(let y=0;y<n;y++)straight.push([3,y,1]);
// Detour that passes through neighbouring Z sheets rather than taking a
// straight path: start in z0, cross to z2 midway, exit at z2.
const zig=[[1,0,0],[1,1,0],[2,1,0],[3,1,0],[3,2,0],[3,3,0],
 [3,3,1],[3,3,2],[3,4,2],[3,5,2],[3,6,2]];
const a=solvePoreNetwork(mask(straight),n,layers),b=solvePoreNetwork(mask(zig),n,layers);
assert.ok(a.converged&&a.flowM3S>0,'straight passage must conduct');
assert.ok(b.converged&&b.flowM3S>0,'3D detour must conduct');
assert.ok(b.flowM3S<a.flowM3S,'longer, across-sheet path should impede flow');
assert.ok(b.fluxZ.some(v=>Math.abs(v)>0),'actual transport through neighbouring XY sheets');
const dtA=createDyeTransport(a),dtB=createDyeTransport(b);
assert.equal(dtA.concentration.length,n*n*layers);
stepDyeTransport(dtA,400);stepDyeTransport(dtB,400);
assert.ok(dtA.breakthroughTimeSec!==null&&dtB.breakthroughTimeSec!==null,'both paths deliver tracer');
assert.ok(dtB.breakthroughTimeSec>dtA.breakthroughTimeSec,'arrangement changes time of arrival');
for(const t of [dtA,dtB]){
 assert.ok(Math.abs(t.balanceM3)<Math.max(t.injectedM3*1e-8,1e-20),'dye mass must be conserved');
 assert.ok(t.concentration.every(v=>v>=0&&v<=1));
 assert.ok(t.outletFraction>=0&&t.outletFraction<=1.00001);
}
const blocked=solvePoreNetwork(new Uint8Array(n*n*layers).fill(1),n,layers);
const tb=createDyeTransport(blocked);stepDyeTransport(tb,20);
assert.equal(tb.exitedM3,0);
const sample=dyeSnapshot(dtA);
assert.equal(sample.step,400);
assert.equal(sample.concentration.length,n*n*layers);
console.log('Chronological conservative dye transport PASS:',{
 straightArrivalSec:dtA.breakthroughTimeSec,detourArrivalSec:dtB.breakthroughTimeSec,
 straightFlux:a.flowM3S,detourFlux:b.flowM3S});
