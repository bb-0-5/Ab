import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {screenVoxelHeatConduction} from '../src/lib/voxel_heat_conduction';
import {V13MaterialEngine} from '../src/simulations/v13_material';
import {V9LatticeEngine} from '../src/simulations/v9_lattice';
import {V10MeshEngine} from '../src/simulations/v10_mesh';
import {V6Engine} from '../src/simulations/v6';
import {V7Engine} from '../src/simulations/v7';
import {
 CANDIDATE_POOL,selectElementTrial,recordModeledTrial,
 type TrialPending,
} from '../src/lib/cross_sim_material_campaign';

const almost=(a:number,b:number,tolerance=1e-4)=>
 assert.ok(Math.abs(a-b)<tolerance,`Expected ${a} ≈ ${b}`);
for(const res of [4,8]){
 const n=res**3,k=new Float32Array(n).fill(12);
 const allSolid=new Float32Array(n).fill(1);
 const allVoid=new Float32Array(n).fill(0);
 for(const axis of ['x','y','z'] as const){
  const bulk=screenVoxelHeatConduction(allSolid,k,res,axis,100);
  almost(bulk.effectiveConductivityWmK,12);
  assert.equal(bulk.converged,true);
  const air=screenVoxelHeatConduction(allVoid,k,res,axis,100);
  almost(air.effectiveConductivityWmK,.026);
  assert.equal(air.medium,'still_air');
 }
 // Layered air/solid must suppress thermal conduction without fabricating
 // a lower elemental bulk conductivity, and without claiming gas convection.
 const mask=allSolid.slice();
 for(let x=0;x<res;x++)for(let y=0;y<res;y++)for(let z=0;z<res;z++)
  if(y<Math.floor(res/2))mask[x*res*res+y*res+z]=0;
 const layered=screenVoxelHeatConduction(mask,k,res,'y',240);
 assert.ok(layered.effectiveConductivityWmK>.026);
 assert.ok(layered.effectiveConductivityWmK<12);
 assert.equal(layered.allSolidReferenceWmK,12);
}
assert.throws(()=>screenVoxelHeatConduction(
 new Float32Array(7),new Float32Array(8),2,
),/grid/);
const bad=new Float32Array(8).fill(1);bad[1]=NaN;
assert.throws(()=>screenVoxelHeatConduction(
 new Float32Array(8),bad,2,
),/Invalid finite-volume/);

const scene=new THREE.Scene(),chem=new V13MaterialEngine();
const v9=new V9LatticeEngine(scene),v10=new V10MeshEngine(scene);
const v6=new V6Engine(scene),v7=new V7Engine(scene);
try{
 const spec=CANDIDATE_POOL[0];
 const composite=chem.buildComposite(spec.elements.map(e=>({
  z:e.z,fraction:e.massFraction,
 })));
 v9.applyV13ElementalHypothesis(composite);
 v9.setSeed(1903);v9.buildLattice();
 const field=v9.getMaterialForV1();
 assert.ok(field&&v9.compositeField);
 const target=.05;
 const trial=v10.optimizeCoupledThermalGeometry(v9.compositeField!,target);
 assert.equal(trial.evaluated,8);
 assert.equal(trial.modelOnly,true);
 assert.equal(trial.objective,'minimize_modeled_y_heat_conduction');
 assert.ok(trial.winner&&trial.selected,
  'Coupled V10 search must find a non-degenerate open and solid membrane');
 assert.ok(trial.selected!.solidFraction>=.18);
 assert.ok(trial.selected!.solidFraction<=.82);
 assert.equal(v10.getConnectivity()?.spanning.y,true);
 assert.ok(trial.selected!.effectiveConductivityWmK>0);
 assert.ok(Number.isFinite(trial.selected!.effectiveConductivityWmK));
 assert.ok(trial.selected!.effectiveConductivityWmK
  <trial.selected!.allSolidReferenceWmK,
  'Real porosity can reduce modeled conduction vs the same solid reference');
 assert.equal(v9.getMaterialForV1()!.conductivity,field!.conductivity,
  'Geometry search must not overwrite chemical constitutive input');

 const downstream=v6.screenConstructedConduction(
  v10.getSolidMask()!,v9.compositeField!,
 );
 assert.equal(v6.lastConstructedConduction,downstream);
 assert.ok(downstream.effectiveConductivityWmK>0);
 assert.ok(downstream.effectiveConductivityWmK
   <downstream.allSolidReferenceWmK);
 assert.ok(Math.abs(downstream.effectiveConductivityWmK
    -trial.selected!.effectiveConductivityWmK)/
    downstream.effectiveConductivityWmK<.5,
   'Bounded V10 preliminary screen should agree with V6 refined recheck');
 const rank=v7.rankModeledInsulation(downstream,target);
 assert.equal(rank.modelOnly,true);
 assert.ok(Number.isFinite(rank.priority));
 const requirement={
  id:'v12:wall-constituent',source:'v12' as const,
  medium:'air' as const,
  minTemperatureK:275,maxTemperatureK:315,
  purpose:'thermal_survival' as const,
  maxThermalConductivityWmK:target,
  basis:'Modeled room insulation target',
 };
 const makePending=(index:number):TrialPending=>{
  const chosen=CANDIDATE_POOL[index];
  const c=chem.buildComposite(chosen.elements.map(e=>({
   z:e.z,fraction:e.massFraction,
  })));
  return {spec:chosen,composite:c,
   workOrder:requirement,seed:1903+index,atomicSiteRatio:.48,
   startedFrame:1,context:'thermal:room'};
 };
 const p=makePending(0);
 const row=recordModeledTrial(p,{
  conductivity:field!.conductivity,density:field!.density,
 },v10.getConnectivity()!,v6.getMetrics(),null,{
  screen:downstream,geometry:v10.config,rank,
 });
 assert.ok(row.coupledConduction);
 almost(row.coupledConduction!.effectiveConductivityWmK,
  downstream.effectiveConductivityWmK);
 assert.equal(row.v10.tpms,v10.config.tpms);
 assert.equal(row.coupledConduction!.model,
  'harmonic_face_steady_conduction_only');
 assert.match(row.caveat,/not convection\/radiation/);
 assert.equal(selectElementTrial('thermal:room',requirement,[row]).id,
  CANDIDATE_POOL[1].id);
 // The 4th experiment exploits the best observed material+geometry, rather
 // than naively ranking V13 estimates alone; the 5th explores again.
 const others=[1,2].map(i=>{
  const q=makePending(i);
  return {...row,id:'new-'+i,chemistryId:q.spec.id,
   coupledConduction:{...row.coupledConduction!,
     thermalPriority:rank.priority-1-i},
  };
 });
 const cohort=[row,...others];
 assert.equal(selectElementTrial('thermal:room',requirement,cohort).id,
  spec.id);
 assert.equal(selectElementTrial('thermal:room',requirement,
  [...cohort,{...row,id:'fourth',chemistryId:spec.id}]).id,
  CANDIDATE_POOL[3].id);

 // Same V10 geometric mask with a different independent V9 material must
 // produce a different effective thermal solution: material and geometry
 // actually interact in one solver instead of two disconnected scores.
 const mask=v10.getSolidMask()!.slice(),oldK=v9.compositeField!.conductivityField.slice();
 const changed=oldK.map(k=>k*2);
 const changedHeat=screenVoxelHeatConduction(mask,changed,16,'y',120);
 assert.ok(Math.abs(changedHeat.effectiveConductivityWmK-
   trial.selected!.effectiveConductivityWmK)>1e-5);
 assert.ok(changedHeat.effectiveConductivityWmK
   >=trial.selected!.effectiveConductivityWmK*.9);

 const app=readFileSync('src/App.tsx','utf8');
 assert.match(app,/mesh\.optimizeCoupledThermalGeometry\(/);
 assert.match(app,/model\.screenConstructedConduction\(/);
 assert.match(app,/optimizer\.rankModeledInsulation\(/);
 assert.match(app,/recordModeledTrial\(trial,/);
}finally{v7.dispose();v6.dispose();v10.dispose();v9.dispose();scene.clear();}
console.log('V9/V10 jointly optimise actual 3D solid-air thermal conduction; V6 rechecks numeric k; V7 uses modeled thermal results to rank next chemistry.');
