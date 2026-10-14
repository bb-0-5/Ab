import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {solveSteadyVoxelTransport} from '../src/lib/steady_transport_network';
import {V9LatticeEngine} from '../src/simulations/v9_lattice';
import {V10MeshEngine} from '../src/simulations/v10_mesh';
import {
 screenReferenceMaterial,verificationShortlist,verifyTransportCandidate,
 rankTransportSweep,FLUID_REFERENCES,buildSelectedTransportDesign,
} from '../src/lib/auto_transport_sweep';
const near=(a:number,b:number,rel=.025)=>{
 assert.ok(Math.abs(a-b)<=rel*Math.max(Math.abs(b),1e-18),
  'Expected '+a+' close to '+b);
};
for(const res of [4,8]){
 const mask=new Float32Array(res**3);
 const fluid=solveSteadyVoxelTransport(mask,res,'hydraulic','y',{
  medium:'air',maxIterations:220,
 });
 const r=fluid.throatRadiusM!,a=fluid.voxelPitchM,mu=fluid.viscosityPaS!;
 const expected=res*res*Math.PI*r**4/(8*mu*a)/(res-1);
 assert.equal(fluid.mode,'hydraulic');
 assert.equal(fluid.medium,'air');
 assert.equal(fluid.drivingDifference,1);
 assert.ok(fluid.converged);
 near(fluid.resolvedFlux,expected);
 assert.ok(fluid.reynoldsEstimate!==null&&fluid.reynoldsEstimate<100);
 assert.equal(fluid.pressureSamples.length,res);
 near(fluid.pressureSamples[0].fraction,1);
 near(fluid.pressureSamples[res-1].fraction,0,1e-9);
 const water=solveSteadyVoxelTransport(mask,res,'hydraulic','y',{
  medium:'water',maxIterations:220,
 });
 near(fluid.resolvedFlux/water.resolvedFlux,
   FLUID_REFERENCES.water.viscosityPaS/FLUID_REFERENCES.air.viscosityPaS);
 // Fluid cannot pass through a fully solid wall, no matter how open
 // the cross section looks on either side.
 for(let x=0;x<res;x++)for(let z=0;z<res;z++)
  mask[x*res*res+Math.floor(res/2)*res+z]=1;
 const sealed=solveSteadyVoxelTransport(mask,res,'hydraulic','y',{
  medium:'air',maxIterations:220,
 });
 assert.ok(sealed.resolvedFlux>=0);
 assert.ok(sealed.resolvedFlux<fluid.resolvedFlux*.001,
  'Sealed fluid circuit must have zero through flux');
 const solid=new Float32Array(res**3).fill(1);
 const conductor=solveSteadyVoxelTransport(solid,res,'ohmic','x',{
  bulkElectricalSigmaSm:5.8e7,maxIterations:220,
 });
 assert.equal(conductor.medium,null);
 assert.equal(conductor.mode,'ohmic');
 assert.ok(conductor.converged);
 near(conductor.effectiveConductivity!,5.8e7);
 const insulating=new Float32Array(res**3).fill(0);
 const noCurrent=solveSteadyVoxelTransport(insulating,res,'ohmic','x',{
  bulkElectricalSigmaSm:5.8e7,maxIterations:220,
 });
 assert.equal(noCurrent.resolvedFlux,0);
 assert.equal(noCurrent.effectiveConductivity,0);
}
assert.throws(()=>solveSteadyVoxelTransport(new Float32Array(64),4,
 'ohmic','x',{}),/bulk electrical conductivity/);
const scene=new THREE.Scene(),v9=new V9LatticeEngine(scene),
 v10=new V10MeshEngine(scene);
try{
 const fast=[];
 for(let i=0;i<5;i++)
  fast.push(...screenReferenceMaterial(v9,v10,'thermal',i));
 assert.equal(fast.length,40);
 const shortlist=verificationShortlist(fast);
 assert.equal(shortlist.length,10);
 const verified=shortlist.map(row=>verifyTransportCandidate(
  v9,v10,row,'thermal',
 ));
 assert.equal(verified.length,10);
 assert.ok(verified.every(row=>row.verified?.hydraulic.mode==='hydraulic'));
 assert.ok(verified.every(row=>row.verified?.hydraulic.pressureSamples.length===16));
 const chosen=rankTransportSweep(verified,'thermal',true);
 assert.ok(chosen.best?.verified);
 assert.ok(chosen.best!.verified!.hydraulic.resolvedFlux>0);
 assert.ok(chosen.best!.verified!.hydraulic.laminarAssumption);
 assert.ok(chosen.best!.verified!.hydraulic.drivingDifference===1);
 buildSelectedTransportDesign(v9,v10,chosen.best!);
 assert.equal(v9.primaryElement,chosen.best!.candidate);
 assert.equal(v10.getConnectivity()?.spanning.y,true);
 const ef=fast.flatMap(x=>x.fluid==='air'?[x]:[]);
 const wire=verifyTransportCandidate(v9,v10,
   ef.find(x=>x.candidate==='Cu')!,'electrical');
 assert.ok(wire.verified?.electric?.effectiveConductivity!>0);
 assert.ok(wire.verified!.electric!.resolvedFlux>0);
 assert.ok(wire.verified!.hydraulic.resolvedFlux>0);
 const silicon=verifyTransportCandidate(v9,v10,
  fast.find(x=>x.candidate==='Si'&&x.fluid==='air')!,'electrical');
 assert.equal(silicon.verified?.electric,null,
  'Undoped/intrinsic silicon has no invented electrical bulk sigma');
 const app=readFileSync('src/App.tsx','utf8');
 assert.match(app,/verifyTransportCandidate\(/);
 assert.match(app,/state\.complete&&outcome\.best\?\.verified/);
 console.log('Network physics: actual Y pressure-fluid and X electrical field potentials solved across 3D V10 solid/void masks; sealed walls block transport.');
}finally{v10.dispose();v9.dispose();scene.clear();}
