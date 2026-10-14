import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {V9LatticeEngine} from '../src/simulations/v9_lattice';
import {V10MeshEngine} from '../src/simulations/v10_mesh';
import {V12HouseEngine} from '../src/simulations/v12_house';
import {V13MaterialEngine} from '../src/simulations/v13_material';
import {
  rememberFailedGeometryTrial,getFailedGeometryTrials,
} from '../src/lib/sim_artifact_handoffs';

const memory=new Map<string,string>();
Object.assign(globalThis,{localStorage:{
  getItem:(k:string)=>memory.get(k)||null,
  setItem:(k:string,v:string)=>{memory.set(k,v);},
}});
const scene=new THREE.Scene();
const v9=new V9LatticeEngine(scene);
const v10=new V10MeshEngine(scene);
const v12=new V12HouseEngine(scene);
const v13=new V13MaterialEngine();
try {
  v9.configure('thermal');v9.buildLattice();
  v10.configure('thermal');
  // Deliberately create an impossible all-solid starting condition.
  v10.config.threshold=-100;
  v10.buildMesh(v9.compositeField!);
  assert.equal(v10.getConnectivity()!.voidCount,0);
  const broken=v10.optimizeConnectedChannels(v9.compositeField!,'y');
  assert.equal(broken.evaluated,8,'The original V10 sweep remains intact');
  assert.equal(v10.getConnectivity()!.spanning.y,false);

  // New engine must generate actual candidate geometry and test real flood fills.
  const fixed=v10.recoverBlockedChannels(v9.compositeField!,'y','thermal-material-A');
  assert.equal(fixed.evaluated,16,'Bound search per retry to 16 physical voxel masks');
  assert.ok(fixed.recovered,'Automated search should find a connected V9-fed TPMS');
  assert.equal(fixed.exhausted,false);
  const info=v10.getConnectivity()!;
  assert.equal(info.spanning.y,true);
  assert.ok(info.solidCount>0&&info.voidCount>0,'No fully empty or solid pseudo-membrane');
  assert.ok(v10.recoveryHistory[0].tested===16);
  assert.equal(v10.recoveryHistory[0].modelOnly,true);
  assert.ok(info.shortestPathTortuosity.y!==null);
  const unchanged=v10.recoverBlockedChannels(v9.compositeField!,'y','thermal-material-A');
  assert.equal(unchanged.evaluated,0,'Do not waste time retesting working geometry');
  assert.ok(v10.recoveryHistory.length<=3);
  for(let attempt=0;attempt<30;attempt++)
    rememberFailedGeometryTrial({
      context:'thermal',v9ReceiptId:'v9-'+attempt,
      latticeSeed:attempt,axis:'y',tested:48,
      reason:'Exhausted geometry search',modelOnly:true,
    });
  assert.equal(getFailedGeometryTrials().length,16,
    'Unworkable hypotheses must be retained but bounded on mobile');
  assert.throws(()=>rememberFailedGeometryTrial({
    context:'thermal',v9ReceiptId:'v9-bad',latticeSeed:3,
    axis:'y',tested:0,reason:'Invalid',modelOnly:true,
  }),/Invalid failed-geometry evidence/);

  // V12 request must originate in the real live house model, not a user knob.
  for(let i=0;i<103;i++)v12.update('thermal',{},'cooling');
  assert.equal(v12.isStable(),true,'V12 had not numerically stabilised');
  const requirement=v12.getMaterialRequirement();
  assert.ok(requirement,'A simulated wall produces an explicit material need');
  assert.equal(requirement!.source,'v12');
  assert.ok(requirement!.maxThermalConductivityWmK!>0);
  assert.ok(requirement!.maxThermalConductivityWmK!<1);
  assert.ok(requirement!.maxTemperatureK>requirement!.minTemperatureK);
  assert.match(requirement!.basis,/reference layer/);
  const originalWallU=v12.getRooms().map(room=>room.wallType).join(',');
  v13.receiveRequirement(requirement!);
  assert.equal(v13.getRequirementScreenings()[0].status,'awaiting_composite');
  v13.activateElement(6);
  const composite=v13.buildComposite([{z:14,fraction:.467},{z:8,fraction:.533}]);
  const screen=v13.getRequirementScreenings()[0];
  assert.equal(screen.requirement.maxThermalConductivityWmK,requirement!.maxThermalConductivityWmK);
  assert.equal(screen.estimatedThermalConductivityWmK,composite.properties.thermalConductivity);
  assert.ok(['estimated_transport_failure','estimated_melt_failure','conditional_estimate'].includes(screen.status));
  assert.notEqual(screen.status,'awaiting_composite');
  assert.ok(screen.missingEvidence.includes('measured phase'));
  assert.equal(v12.getRooms().map(room=>room.wallType).join(','),originalWallU,
    'A provisional material must NOT silently replace a real wall assembly');
  assert.throws(()=>v13.receiveRequirement({...requirement!,maxThermalConductivityWmK:-1}),
    /Invalid machine-generated material requirement/);
  assert.throws(()=>v13.receiveRequirement({...requirement!,maxThermalConductivityWmK:Infinity}),
    /Invalid machine-generated material requirement/);

  const app=readFileSync('src/App.tsx','utf8');
  assert.match(app,/recoverBlockedChannels\(/);
  assert.match(app,/v12Ref\.current\.getMaterialRequirement\(\)/);
  assert.match(app,/v13Ref\.current\.receiveRequirement\(need\)/);
}finally {
  v12.dispose();v10.dispose();v9.dispose();scene.clear();
}
console.log('V10 failed-geometry recovery and V12→V13 typed property demand: real model results, bounded trials, no fabricated physical validation.');
