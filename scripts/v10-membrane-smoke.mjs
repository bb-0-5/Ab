import assert from 'node:assert/strict';
import {buildV10Mask,fromV10SolidMask,poreConnectivity,V10_CANDIDATES,tpmsValue} from '../public/v10-membrane-masks.mjs';
import {createSliceEngine,advanceSlices,sliceEvidence,snapshot,MODEL} from '../public/slice-engine.mjs';
const n=13,layers=7;
for(const c of V10_CANDIDATES){
 const generated=buildV10Mask({n,layers,...c}),info=poreConnectivity(generated.mask,n,layers);
 assert.ok(info.reachesTop,`not spanning ${c.tpms}`);
 assert.ok(info.voidFraction>=.30&&info.voidFraction<=.85);
 assert.ok(info.connectedVoidFraction>.95);
 const e=createSliceEngine({n,layers,solidMask:generated.mask});
 advanceSlices(e,35);
 const p=sliceEvidence(e);
 for(const [name,arr] of Object.entries({u:e.u,v:e.v,w:e.w,T:e.T,p:e.p}))assert.ok(arr.every(Number.isFinite),`Nonfinite ${c.tpms} ${name}`);
 assert.ok(p.divergenceMax<MODEL.tolerance*1.2,`${c.tpms} divergence ${p.divergenceMax}`);
 assert.ok(p.plateHeatFlux>=0&&p.voidFraction<1,`${c.tpms} plate flux`);
 const C=(i,j,k)=>(k*n+j)*n+i,U=(i,j,k)=>(k*n+j)*(n+1)+i,V=(i,j,k)=>(k*(n+1)+j)*n+i,W=(i,j,k)=>(k*n+j)*n+i;
 for(let k=0;k<layers;k++)for(let j=0;j<n;j++)for(let i=0;i<n;i++){
  const q=C(i,j,k);if(generated.mask[q]){
   assert.equal(e.T[q],0);assert.equal(e.p[q],0);
  }
  if(i<n-1 && (generated.mask[q]||generated.mask[C(i+1,j,k)]))assert.equal(e.u[U(i+1,j,k)],0);
  if(j<n-1 && (generated.mask[q]||generated.mask[C(i,j+1,k)]))assert.equal(e.v[V(i,j+1,k)],0);
  if(k<layers-1 && (generated.mask[q]||generated.mask[C(i,j,k+1)]))assert.equal(e.w[W(i,j,k+1)],0);
 }
 const s=snapshot(e);assert.equal(s.slices[0].solid.length,n*n);
 console.log(`${c.tpms} f=${c.frequency}: void=${info.voidFraction.toFixed(3)}, heat=${p.plateHeatFlux.toFixed(6)}, max∇·u=${p.divergenceMax.toExponential(1)}, peakW=${p.peakW.toFixed(4)}`);
}
const allSolid=new Float32Array(n**3).fill(1);allSolid[(2*n+3)*n+4]=0;
const converted=fromV10SolidMask(allSolid,n);assert.equal(converted[(4*n+3)*n+2],0);
assert.throws(()=>fromV10SolidMask(new Float32Array(4),13));
assert.equal(tpmsValue('gyroid',0,0,0,2),0);
console.log('PASS: exact V10 TPMS, native mask-order adapter, connected channels, impermeable obstacles, pressure projection, plate flux');
