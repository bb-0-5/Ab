import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {V12HouseEngine} from '../src/simulations/v12_house';
import {V13MaterialEngine} from '../src/simulations/v13_material';
import {V9LatticeEngine} from '../src/simulations/v9_lattice';
import {V10MeshEngine} from '../src/simulations/v10_mesh';
import {V1Engine} from '../src/simulations/v1';
import {V2Engine} from '../src/simulations/v2';
import {V3Engine} from '../src/simulations/v3';
import {V4Engine} from '../src/simulations/v4';
import {V5Engine} from '../src/simulations/v5';
import {V6Engine} from '../src/simulations/v6';
import {V7Engine} from '../src/simulations/v7';
import {
 CANDIDATE_POOL,selectElementTrial,recordModeledTrial,
 saveMaterialTrial,readMaterialTrials,type TrialPending,
} from '../src/lib/cross_sim_material_campaign';

const data=new Map<string,string>();
Object.assign(globalThis,{localStorage:{
 getItem:(k:string)=>data.get(k)||null,
 setItem:(k:string,v:string)=>{data.set(k,v);},
}});
const scene=new THREE.Scene();
const house=new V12HouseEngine(scene),chem=new V13MaterialEngine();
const lattice=new V9LatticeEngine(scene),mesh=new V10MeshEngine(scene);
const swarm=new V1Engine(scene),orthogonal=new V2Engine(scene);
const v3=new V3Engine(scene),v4=new V4Engine(scene);
const v5=new V5Engine(scene),v6=new V6Engine(scene),v7=new V7Engine(scene);
try{
 for(let i=0;i<8;i++)house.update('thermal',{},'cooling');
 assert.ok(!house.isStable(),'Provisional V12 work orders precede HVAC convergence');
 const need=house.getMaterialRequirement();
 assert.ok(need&&need.source==='v12');
 assert.ok(need.maxThermalConductivityWmK!>0);
 chem.receiveRequirement(need);
 assert.equal(chem.getRequirementScreenings()[0].status,'awaiting_composite');
 const context='["thermal","cooling",1]';
 const first=selectElementTrial(context,need,[]);
 assert.equal(first.id,CANDIDATE_POOL[0].id);
 const composite=chem.buildComposite(first.elements.map(e=>({
  z:e.z,fraction:e.massFraction,
 })));
 const predictedK=composite.properties.thermalConductivity;
 const ratio=lattice.applyV13ElementalHypothesis(composite);
 const n1=first.elements[0].massFraction/composite.elements[0].element.mass;
 const n2=first.elements[1].massFraction/composite.elements[1].element.mass;
 assert.ok(Math.abs(ratio-n1/(n1+n2))<1e-12);
 assert.notEqual(ratio,first.elements[0].massFraction,
  'Mass fraction must not be confused with atomic site occupancy');
 assert.equal(lattice.v13Hypothesis?.modelOnly,true);
 lattice.setSeed(1001);
 lattice.buildLattice();
 const field=lattice.getMaterialForV1();
 assert.ok(field&&field.conductivity>0);
 assert.equal(lattice.v13Hypothesis?.v13EstimatedThermalConductivityWmK,predictedK);
 assert.ok(Math.abs(field.conductivity-predictedK)>0.01,
  'V13 guessed transport properties must not overwrite V9 reference physics');
 const initialSearch=mesh.optimizeConnectedChannels(lattice.compositeField||undefined,'y');
 assert.equal(initialSearch.modelledOnly,undefined);
 assert.equal(initialSearch.modeledOnly,true);
 const connected=mesh.getConnectivity();
 assert.ok(connected&&connected.voidCount>0);
 const applied=mesh.getFitnessField();
 assert.ok(applied);
 swarm.setMaterial({...field!,geometry:'custom',customField:applied!});
 orthogonal.setMaterialRef(swarm);
 assert.equal(swarm.getMaterial().conductivity,field!.conductivity);
 assert.equal(swarm.getMaterial().data.length,applied!.length);

 // Exercise real V3–V7 engines to obtain the observation (not a fake grade).
 const circle=Array.from({length:12},(_,i)=>{
  const a=i*Math.PI/6;
  return new THREE.Vector3(Math.cos(a)*2,Math.sin(a)*2,(i%3)*.2);
 });
 const other=circle.map(p=>new THREE.Vector3(-p.y,p.x,p.z+.2));
 v3.captureFromV1(circle);v4.captureFromV2(other);
 for(let i=0;i<12;i++){v3.update();v4.update();}
 v5.captureFromV3V4(v3.getNodes(),v3.getEdges(),
   v4.getNodes(),v4.getEdges(),'thermal');
 for(let i=0;i<8;i++)v5.update();
 v6.captureChain([],v3.getMSTEdges(),v3.getNodes(),
   v4.getMSTEdges(),v4.getNodes(),v5.getLoops(),'thermal','cooling');
 v6.captureBoundaryPlanes(v5.getBoundaryPlanes());
 for(let i=0;i<20;i++)v6.update('thermal','cooling',1);
 for(let i=0;i<21;i++){
  v7.captureFromV6(v6.getMetrics(),v6.getFlowPaths(),
    v5.getLoops(),v6.getThermalField(),v6.getGridSize());
  v7.update(1);
 }
 const pending:TrialPending={spec:first,workOrder:need,
  composite,seed:1001,atomicSiteRatio:ratio,
  startedFrame:1,context};
 const obs=recordModeledTrial(pending,{
  conductivity:field!.conductivity,density:field!.density,
 },connected!,v6.getMetrics(),{
  score:v7.getScore(),acceptedTrials:v7.acceptedTrials,
  rejectedTrials:v7.rejectedTrials,
 });
 assert.equal(obs.source,'v12');
 assert.equal(obs.v13EstimatedThermalConductivityWmK,predictedK);
 assert.equal(obs.v9ReferenceConductivityWmK,field!.conductivity);
 assert.equal(obs.v10.connected,connected!.spanning.y&&
  connected!.solidCount>0&&connected!.voidCount>0);
 assert.ok(['modeled_flow_observed','awaiting_solver_evidence',
  'geometry_blocked'].includes(obs.assessment));
 assert.equal(obs.evidence,'model_only_not_empirical');
 assert.match(obs.caveat,/not a controlled material measurement/);
 saveMaterialTrial(obs);
 assert.equal(readMaterialTrials().length,1);
 assert.notEqual(selectElementTrial(context,need,readMaterialTrials()).id,first.id,
  'The next V12 work order trial must explore a different constituent hypothesis');
 assert.equal(selectElementTrial('different-context',need,readMaterialTrials()).id,first.id);
 // Disconnected geometry must not be mislabeled as observed success.
 mesh.config.threshold=-100;
 mesh.buildMesh(lattice.compositeField||undefined);
 const failure=recordModeledTrial(pending,{
  conductivity:field!.conductivity,density:field!.density,
 },mesh.getConnectivity()!,v6.getMetrics(),{
  score:v7.getScore(),acceptedTrials:0,rejectedTrials:0,
 });
 assert.equal(failure.assessment,'geometry_blocked');
 assert.equal(failure.v6,null);

 // The chemical proposal cannot be treated as a named physical oxide.
 const silica=chem.buildComposite([{z:14,fraction:.467},{z:8,fraction:.533}]);
 assert.throws(()=>lattice.applyV13ElementalHypothesis(silica),/No physically identified/);
 for(let i=0;i<45;i++)saveMaterialTrial({
  ...obs,id:'unique-'+i,chemistryId:'chem-'+i,
 });
 assert.equal(readMaterialTrials().length,32,'Mobile browser ledger must stay bounded');

 const app=readFileSync('src/App.tsx','utf8');
 assert.match(app,/chemistry\.buildComposite\(spec\.elements\.map/);
 assert.match(app,/lattice\.applyV13ElementalHypothesis\(composite\)/);
 assert.match(app,/mesh\.optimizeConnectedChannels\(/);
 assert.match(app,/v6Ref\.current\.getMetrics\(\)/);
 assert.match(app,/v7Ref\.current/);
 assert.match(app,/saveMaterialTrial\(report\)/);
}finally{
 for(const engine of [v7,v6,v5,v4,v3,orthogonal,swarm,mesh,lattice,house])
  engine.dispose();
 scene.clear();
}
console.log('Original V12→V13→V9→V10→V1/2→V6/V7 material co-evolution: real solver outputs, bounded evidence, safe unit/reference separation.');
