import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {V9LatticeEngine} from '../src/simulations/v9_lattice';
import {V10MeshEngine} from '../src/simulations/v10_mesh';
import {screenVoxelHeatConduction} from '../src/lib/voxel_heat_conduction';
import {
 SOLID_REFERENCES,FLUID_REFERENCES,screenReferenceMaterial,
 rankTransportSweep,buildSelectedTransportDesign,GEOMETRY_OPTIONS,
} from '../src/lib/auto_transport_sweep';
const scene=new THREE.Scene(),v9=new V9LatticeEngine(scene),
 v10=new V10MeshEngine(scene);
try{
 assert.equal(SOLID_REFERENCES.length,5);
 assert.ok(SOLID_REFERENCES.every(x=>x.bulkThermalK>0));
 assert.equal(FLUID_REFERENCES.air.conductivityWmK,.026);
 assert.equal(FLUID_REFERENCES.water.conductivityWmK,.60);
 const homogeneous=new Float32Array(4**3).fill(1);
 const solidK=new Float32Array(4**3).fill(50);
 for(const fluid of ['air','water'] as const){
  const allSolid=screenVoxelHeatConduction(homogeneous,solidK,4,'x',80,fluid);
  assert.ok(Math.abs(allSolid.effectiveConductivityWmK-50)<1e-4);
  homogeneous.fill(0);
  const allFluid=screenVoxelHeatConduction(homogeneous,solidK,4,'x',80,fluid);
  assert.ok(Math.abs(allFluid.effectiveConductivityWmK-
    FLUID_REFERENCES[fluid].conductivityWmK)<1e-5);
  assert.equal(allFluid.medium,fluid==='water'?'still_water':'still_air');
  homogeneous.fill(1);
 }
 const thermal=[],electrical=[];
 for(let idx=0;idx<SOLID_REFERENCES.length;idx++){
  const a=screenReferenceMaterial(v9,v10,'thermal',idx);
  const b=screenReferenceMaterial(v9,v10,'electrical',idx);
  assert.equal(a.length,GEOMETRY_OPTIONS.length*2);
  assert.equal(b.length,GEOMETRY_OPTIONS.length*2);
  assert.ok(a.every(x=>x.candidate===SOLID_REFERENCES[idx].symbol));
  assert.ok(a.every(x=>x.referenceOnly===true));
  assert.ok(a.every(x=>x.solidFraction+x.openFraction>=.999));
  assert.ok(b.every(x=>x.estimatedSolidPathSigmaSm===null||
    x.estimatedSolidPathSigmaSm>=0));
  thermal.push(...a);electrical.push(...b);
 }
 const heat=rankTransportSweep(thermal,'thermal',true);
 const wires=rankTransportSweep(electrical,'electrical',true);
 assert.equal(heat.evaluated,40);
 assert.equal(heat.testedMaterials.length,5);
 assert.equal(wires.testedMaterials.length,5);
 assert.ok(heat.best?.score&&heat.airBest?.score);
 assert.ok(heat.waterBest?.score);
 assert.ok(wires.best?.score,'Must find a solid X conductivity route and Y fluid path');
 assert.ok(wires.best!.estimatedSolidPathSigmaSm!>0);
 assert.ok(heat.best!.fluid==='air',
  'Never silently substitute water cooling for a default air scenario');
 assert.ok(heat.best!.solidSpansX&&heat.best!.fluidSpansY,
  'A membrane with no solid heat path or no fluid channel cannot qualify');
 buildSelectedTransportDesign(v9,v10,heat.best!);
 assert.equal(v9.primaryElement,heat.best!.candidate);
 assert.equal(v9.secondaryElement,heat.best!.candidate);
 assert.equal(v9.defectRate,0);
 assert.equal(v10.config.tpms,heat.best!.tpms);
 assert.equal(v10.getConnectivity()?.spanning.y,true);
 assert.ok(v9.compositeField&&v10.getFitnessField());
 const app=readFileSync('src/App.tsx','utf8');
 assert.match(app,/screenReferenceMaterial\(/);
 assert.match(app,/buildSelectedTransportDesign\(/);
 assert.match(app,/SEARCH PROBES · NOT MOLECULES/);
 assert.match(app,/currentVersion==='v1'/);
 const inspector=readFileSync('src/components/HexfieldArtifactInspector.tsx','utf8');
 assert.match(inspector,/THESE DOTS ARE NOT ELECTRONS, AIR OR WATER/);
 console.log('Automatic 40-case physical-reference screen: five solids, four geometries, air/water, solid X route and fluid Y path; V1 markers correctly PSO only.');
}finally{v10.dispose();v9.dispose();scene.clear();}
