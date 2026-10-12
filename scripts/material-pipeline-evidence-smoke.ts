import assert from 'node:assert/strict';
import * as THREE from 'three';
import {V9LatticeEngine} from '../src/simulations/v9_lattice';
import {V10MeshEngine} from '../src/simulations/v10_mesh';
import {V11HardwareEngine} from '../src/simulations/v11_hardware';
import {V13MaterialEngine} from '../src/simulations/v13_material';
import {screenVoxelChannels} from '../src/lib/voxel_connectivity';
import {screenMaterialPipeline} from '../src/lib/material_pipeline_evidence';

const n=6,blocked=new Float32Array(n**3).fill(1);
const connected=new Float32Array(n**3);
const reference={conductivity:237,dielectricConstant:2.4,density:2700};
const v13=new V13MaterialEngine();
v13.activateElement(6);
for(const bad of [
 [{z:6,fraction:-1}],
 [{z:6,fraction:0}],
 [{z:6,fraction:NaN}],
 [{z:6,fraction:Infinity}],
 [{z:6,fraction:1},{z:6,fraction:1}],
])assert.throws(()=>v13.buildComposite(bad),/fraction|Duplicate/);
assert.throws(()=>v13.buildComposite([]),/1–16/);

const candidate=v13.buildComposite([{z:6,fraction:.6},{z:14,fraction:.4}]);
v13.receiveRequirement({
 id:'v6:thermal-field',source:'v6',medium:'air',minTemperatureK:280,
 maxTemperatureK:600,purpose:'thermal_survival',basis:'V6 computed temperature range',
});
const screening=v13.getRequirementScreenings().find(x=>x.requirement.id==='v6:thermal-field')!;
const open=screenMaterialPipeline({
 v9:reference,v10:screenVoxelChannels(connected,n),v11PortCount:2,
 v13Composite:candidate,v13Screen:screening,preferredAxis:'y',
});
assert.equal(open.model,'v9-v10-v11-v13-geometric-screen-v1');
assert.equal(open.v10.crossFlowGeometricallyOpen,true);
assert.equal(open.v10.minGeometricTortuosity,1);
assert.equal(open.v13!.estimatedThermalConductivityWmK,candidate.properties.thermalConductivity);
assert.equal(open.v13!.estimatedDensityKgM3,candidate.properties.density*1000,
 'g/cm³ to kg/m³ conversion is 1000x');
assert.equal(open.v13!.estimatedElectricalConductivitySm,candidate.properties.conductivity,
 'S/m is electric, NOT thermal conductivity W/(m·K)');
assert.equal(open.v13!.hypotheticalNotApplied,true);
assert.ok(open.caveat.includes('independent'));
const noModel=screenMaterialPipeline({
 v9:reference,v10:screenVoxelChannels(connected,n),v11PortCount:0,
 v13Composite:null,v13Screen:null,preferredAxis:'y',
});
assert.equal(noModel.conclusion,'needs_composite_and_empirical_data');
const blockedScreen=screenMaterialPipeline({
 v9:reference,v10:screenVoxelChannels(blocked,n),v11PortCount:2,
 v13Composite:candidate,v13Screen:screening,preferredAxis:'y',
});
assert.equal(blockedScreen.conclusion,'no_connected_channel');
assert.equal(blockedScreen.v10.minGeometricTortuosity,null);
assert.throws(()=>screenMaterialPipeline({
 v9:{...reference,density:NaN},v10:screenVoxelChannels(connected,n),
 v11PortCount:0,v13Composite:candidate,v13Screen:null,preferredAxis:'x',
}),/Invalid V9/);

// The original connected pipeline can produce all four independent sources.
const scene=new THREE.Scene(),v9=new V9LatticeEngine(scene),
 v10=new V10MeshEngine(scene),v11=new V11HardwareEngine(scene);
try{
 v9.configure('thermal');v10.configure('thermal');v11.configure('thermal');
 v9.buildLattice();
 v10.optimizeConnectedChannels(v9.compositeField||undefined,'y');
 v11.build();
 const material=v9.getMaterialForV1()!;
 const geometry=v10.getConnectivity()!;
 const result=screenMaterialPipeline({
  v9:material,v10:geometry,v11PortCount:v11.getPorts().length,
  v13Composite:candidate,v13Screen:screening,preferredAxis:'y',
 });
 assert.equal(result.v10.componentCount,v10.getMetrics().channelCount);
 assert.equal(result.originalV9.thermalConductivityWmK,material.conductivity);
 assert.equal(result.v11.portCount,v11.getPorts().length);
 assert.ok(result.v13!.candidateElements.includes('C'));
 assert.ok(result.v13!.candidateElements.includes('Si'));
}finally{v9.dispose();v10.dispose();v11.dispose();}

for(let i=0;i<46;i++)v13.buildComposite([{z:6,fraction:.6},{z:14,fraction:.4}]);
assert.ok(v13.getComposites().length<=40,
 'Multiple chemistry proposals must not leak all 3D topology generations forever');
console.log('V9–V13 material pipeline: real mesh connectivity, converted density, separate S/m and W/m/K, no validated-physical claims, bounded chemistry.');
