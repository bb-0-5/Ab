import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {V3Engine} from '../src/simulations/v3';
import {V4Engine} from '../src/simulations/v4';
import {V5Engine} from '../src/simulations/v5';
import {V9LatticeEngine} from '../src/simulations/v9_lattice';
import {V10MeshEngine} from '../src/simulations/v10_mesh';
import {qualifyStage,type StageReceipt} from '../src/lib/sim_artifact_handoffs';
import {screenReferenceMaterial,rankTransportSweep} from '../src/lib/auto_transport_sweep';
import {buildLiveTransportSpec} from '../src/lib/live_transport_spec';

const scene=new THREE.Scene();
const v3=new V3Engine(scene),v4=new V4Engine(scene),v5=new V5Engine(scene);
const lattice=new V9LatticeEngine(scene),mesh=new V10MeshEngine(scene);
try{
 // Regression for reported mobile freeze: the two PSO particle clouds
 // move slightly on EVERY frame. V4 and V5 must not have their readiness
 // clocks reset forever by genuine fresh input geometry.
 let observedV4Ready=false,observedV5Ready=false;
 let biggestPlaneCount=0;
 for(let tick=0;tick<40;tick++){
  const cloud=Array.from({length:14},(_,i)=>{
   const a=2*Math.PI*i/14,wiggle=tick*.001;
   return new THREE.Vector3(2*Math.cos(a)+wiggle,
     Math.sin(a*2)+wiggle*.4,Math.sin(a)+wiggle*.2);
  });
  const rotated=cloud.map(p=>new THREE.Vector3(-p.y,p.x,p.z+.3));
  v3.captureFromV1(cloud);
  v4.captureFromV2(rotated);
  v3.update();v4.update();
  observedV4Ready||=v4.isStable();
  if(v3.isStable()&&v4.isStable())
   v5.captureFromV3V4(v3.getNodes(),v3.getEdges(),
     v4.getNodes(),v4.getEdges(),'thermal');
  v5.update();
  observedV5Ready||=v5.isStable();
  biggestPlaneCount=Math.max(biggestPlaneCount,v5.getBoundaryPlanes().length);
 }
 assert.equal(observedV4Ready,true,
  'V4 must stabilize with moving PSO input, not require exact immobility');
 assert.equal(observedV5Ready,true,
  'V5 must produce a handoff despite evolving upstream route clouds');
 assert.ok(v5.isStable());
 assert.ok(v5.getBoundaryPlanes().length>0);
 assert.ok(biggestPlaneCount<500,
  'V5 must clear prior planes rather than accumulate geometry forever');
 const nowCount=v5.getBoundaryPlanes().length;
 // Input changed but count of architectural planes should not double after
 // recapture of the same topology. This catches the former memory leak.
 const newPts=v3.getNodes().map(p=>p.clone().addScalar(.002));
 v5.captureFromV3V4(newPts,v3.getEdges(),v4.getNodes(),v4.getEdges(),'thermal');
 assert.ok(v5.getBoundaryPlanes().length<nowCount+80,
  'Another V5 capture cannot append all earlier membrane planes');
 for(let i=0;i<8;i++)v5.update();
 assert.ok(v5.isStable());

 const scenario='thermal/cooling';
 const dummy={quantity:1,signal:1,support:1,signature:'numerical-test'};
 const parent:StageReceipt={stage:'v3',phase:'discovery',id:'v3-observation',
  context:scenario,predecessorId:'v2',observation:dummy,modelOnly:true};
 const v4obs={quantity:v4.getMSTEdges().length,
  signal:v4.getMSTLength(),support:v4.getNodes().length,
  signature:JSON.stringify([v4.getNodes().length,v4.getEdges().length])};
 const ready4=qualifyStage('v4',v4obs,parent,scenario);
 assert.ok(ready4.ok&&ready4.receipt);
 const v5obs={quantity:v5.getBoundaryPlanes().length,
  signal:v5.getBoundaryPlanes().reduce((s,p)=>s+p.area,0),
  support:v5.getLoops().length,
  signature:JSON.stringify([
    v5.getBoundaryPlanes().length,v5.getLoops().length,
  ])};
 assert.equal(qualifyStage('v5',v5obs,ready4.receipt!,scenario).ok,true);

 // A real modeled reference candidate, with actual solid X and pore Y
 // connectivity, must be identified as a proposal until the V9/V10 engines
 // actually adopt that same configuration.
 const list=screenReferenceMaterial(lattice,mesh,'thermal',0);
 const prog=rankTransportSweep(list,'thermal',false);
 assert.ok(prog.best);
 const initial=buildLiveTransportSpec('thermal',prog,false,{
  primary:'Cu',secondary:'Cu',structure:prog.best!.structure,
  tpms:prog.best!.tpms,
 });
 assert.equal(initial.status,'candidate');
 assert.ok(initial.reason.includes('not yet installed'));
 assert.equal(initial.solid,'Cu');
 assert.ok(initial.fluidReference?.viscosityPaS);
 assert.ok(initial.physicalReference?.thermalKwmK);
 const selected=buildLiveTransportSpec('thermal',prog,true,{
  primary:prog.best!.candidate,secondary:prog.best!.candidate,
  structure:prog.best!.structure,tpms:prog.best!.tpms,
 });
 assert.equal(selected.status,'applied');
 assert.match(selected.purpose,/heat/i);
 assert.equal(selected.physicalReference?.electricalSigmaSm,5.8e7);
 const changed=buildLiveTransportSpec('thermal',prog,true,{
  primary:'Si',secondary:'C',structure:'diamond_cubic',tpms:'lidinoid',
 });
 assert.equal(changed.status,'changed_upstream');
 assert.equal(changed.liveSolid,'Si/C');
 assert.match(changed.reason,/history, not current material/);
 const pending=buildLiveTransportSpec('electrical',null,false,null);
 assert.equal(pending.status,'searching');
 assert.equal(pending.solid,null);
 assert.match(pending.purpose,/DC current/);

 const app=readFileSync('src/App.tsx','utf8');
 assert.match(app,/simulationFrame%24===0/);
 assert.match(app,/simulationFrame%72===0/);
 assert.match(app,/buildLiveTransportSpec\(/);
 assert.match(app,/<HexfieldArtifactInspector[\s\S]*?spec=\{visualEvidence\.spec\}/);
 const plate=readFileSync('src/components/HexfieldArtifactInspector.tsx','utf8');
 assert.match(plate,/HEXFIELD \/ MATERIAL \+ MEDIUM/);
 assert.match(plate,/V9\/V10 currently contains/);
 assert.match(plate,/spec\.status==='applied'/);
}finally{
 v5.dispose();v4.dispose();v3.dispose();mesh.dispose();lattice.dispose();
 scene.clear();
}
console.log('V4/V5 evolve for 40 successive moving route captures, retain bounded valid geometry and qualify V4→V5; live Hexfield physical spec distinguishes actual V9 design from preview.');
