import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {screenVoxelChannels} from '../src/lib/voxel_connectivity';
import {V9LatticeEngine} from '../src/simulations/v9_lattice';
import {V10MeshEngine} from '../src/simulations/v10_mesh';
import {V1Engine} from '../src/simulations/v1';
import {V13MaterialEngine} from '../src/simulations/v13_material';

const n=6,i=(x:number,y:number,z:number)=>x*n*n+y*n+z;
const solid=new Float32Array(n**3).fill(1);
const empty=new Float32Array(n**3);
const full=screenVoxelChannels(solid,n);
assert.equal(full.voidCount,0);
assert.equal(full.componentCount,0);
assert.deepEqual(full.spanning,{x:false,y:false,z:false});
assert.equal(full.shortestPathTortuosity.x,null);
const open=screenVoxelChannels(empty,n);
assert.equal(open.componentCount,1);
assert.deepEqual(open.spanning,{x:true,y:true,z:true});
assert.equal(open.shortestPathTortuosity.x,1);
assert.equal(open.spanningVoidFraction,1);
const isolated=solid.slice();
isolated[i(1,1,1)]=0;isolated[i(4,4,4)]=0;
const two=screenVoxelChannels(isolated,n);
assert.equal(two.componentCount,2);
assert.equal(two.spanningVoidFraction,0);
const tube=solid.slice();
for(let x=0;x<n;x++)tube[i(x,2,2)]=0;
const pass=screenVoxelChannels(tube,n);
assert.equal(pass.componentCount,1);
assert.deepEqual(pass.spanning,{x:true,y:false,z:false});
assert.equal(pass.shortestPathTortuosity.x,1);
const bends=solid.slice();
for(const [x,y] of [[0,1],[1,1],[1,2],[1,3],[2,3],[3,3],[4,3],[4,2],[4,1],[5,1]])
 bends[i(x,y,2)]=0;
const winding=screenVoxelChannels(bends,n);
assert.equal(winding.spanning.x,true);
assert.ok((winding.shortestPathTortuosity.x||0)>1,
 'A real winding channel must have a longer shortest path than a straight line');
assert.throws(()=>screenVoxelChannels(new Float32Array(23),6),/mismatch/);
const invalid=tube.slice();invalid[1]=NaN;
assert.throws(()=>screenVoxelChannels(invalid,6),/invalid/i);

// The originals run as actual engines, not a parallel fake topology model.
const scene=new THREE.Scene(),v9=new V9LatticeEngine(scene),
 v10=new V10MeshEngine(scene),v1=new V1Engine(scene);
try {
 v9.configure('thermal');v9.buildLattice();
 const material=v9.getMaterialForV1();
 assert.ok(material&&v9.compositeField);
 const initial=v10.config;
 v10.buildMesh(v9.compositeField!);
 const baselineInfo=v10.getConnectivity()!;
 assert.equal(baselineInfo.resolution,v10.getResolution());
 assert.equal(v10.getMetrics().channelCount,baselineInfo.componentCount,
  'V10 channel count must be real six-connected void regions, not freq²*porosity');
 assert.equal(v10.getMetrics().porosity,
  baselineInfo.voidCount/(baselineInfo.voidCount+baselineInfo.solidCount));
 assert.ok(v10.getMetrics().surfaceArea>0);
 const search=v10.optimizeConnectedChannels(v9.compositeField!,'y');
 assert.equal(search.evaluated,8);
 assert.ok(search.bestScore>=search.baselineScore);
 assert.equal(v10.getMetrics().channelCount,v10.getConnectivity()!.componentCount);
 assert.equal(v10.lastSearch?.modeledOnly,true);
 assert.ok(v10.getFitnessField()?.length===v10.getResolution()**3);
 const source=v10.getFitnessField()!;
 const field=new Float32Array(source);
 v1.setMaterial({...material!,geometry:'custom',customField:field});
 assert.equal(v1.getMaterial().conductivity,material!.conductivity);
 assert.equal(v1.getMaterial().density,material!.density);
 assert.equal(v1.getMaterial().data.length,field.length);
 for(const at of [0,80,500,1800,field.length-1])
  assert.equal(v1.getMaterial().data[at],field[at],
   'The exact V10 discovered geometry must reach the original V1 PSO');
 const sample=v1.sampleField(new THREE.Vector3(-2,-2,-2));
 assert.equal(sample,field[0]);
 field.fill(888);
 assert.notEqual(v1.getMaterial().data[0],888,'V1 owns its numerical field');
 assert.throws(()=>v1.setMaterial({...material!,customField:new Float32Array(8)}),/grid/);
 const bad=source.slice();bad[1]=Infinity;
 assert.throws(()=>v1.setMaterial({...material!,customField:bad}),/invalid fitness/);
 // A V13 theoretical composite is not a measured constitutive field. It
 // must NEVER replace V9/V10 lattice k (W/m/K) with S/m or g/cm³ with kg/m³.
 const v13=new V13MaterialEngine();
 v13.activateElement(6);
 const before=v1.getMaterial().conductivity;
 const candidate=v13.buildComposite([{z:6,fraction:.65},{z:14,fraction:.35}]);
 assert.ok(candidate.properties.thermalConductivity>=0);
 assert.equal(v1.getMaterial().conductivity,before);
 assert.ok(initial.tpms);
 const app=readFileSync('src/App.tsx','utf8');
 assert.ok(app.includes('v10Ref.current.optimizeConnectedChannels('));
 assert.ok(app.includes('customField:v10Ref.current.getFitnessField()'));
 assert.ok(!app.includes('conductivity: topo.properties.conductivity,'),
  'V13 electrical S/m must never feed the V1 thermal W/m/K field');
 assert.ok(!app.includes('dielectricConstant: 1 / (topo.properties.opticalBandgap || 1),'),
  'Bandgap eV is not automatically relative permittivity');
}finally{v1.dispose();v10.dispose();v9.dispose();}
console.log('V9→V10→V1 real voxel transfer: actual six-connected channels, accurate surface interfaces, bounded TPMS sweep, no V13 unit mixups.');
