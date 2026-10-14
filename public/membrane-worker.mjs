/** AboveBound experiment 003. Real steady pressure-driven THROAT NETWORK,
 * not a transient closed-cavity heat model and not 3D CFD. */
import {buildV10Mask,V10_CANDIDATES} from './v10-membrane-masks.mjs';
import {HYDRAULICS,solvePoreNetwork,assessMembrane,hydraulicEvidence} from './v10-pressure-network.mjs';
import {decodeV10PressureSelection} from './v10-pressure-handoff.mjs';
import {planV10FollowUps} from './v10-inference-planner.mjs?v=inference-r7';
import {createDyeTransport,stepDyeTransport,dyeSnapshot} from './v10-dye-transport.mjs?v=chronology-r8';
const n=13,layers=9;
const seedConfigs=V10_CANDIDATES.map(x=>({...x}));
const name=c=>c===null?'Open void reference':`${c.tpms} · f=${c.frequency.toFixed(2)} · threshold=${c.threshold.toFixed(2)}`;
const send=x=>postMessage(x);
let generation=0,paused=false,ended=false,seen=new Set(),queue=[],ranking=[],reference=null,focus=null,best=null,serial=0,initialCount=0,plannedCount=0;
let originalV10=null;
function makeShape(config){
  const mask=config?buildV10Mask({n,layers,...config}).mask:new Uint8Array(n*n*layers);
  const result=solvePoreNetwork(mask,n,layers);
  const assessment=reference?assessMembrane(result,reference):{status:'REFERENCE',valid:true,meetsTarget:false,reason:'Unconstrained open-void upper bound',relativeOpen:1};
  const targetFlowM3S=(reference?.flowM3S||result.flowM3S)*HYDRAULICS.targetOpenFraction;
  const pressureAtTargetPa=result.flowM3S>0?targetFlowM3S*HYDRAULICS.pressureDifferencePa/result.flowM3S:null;
  return {config,name:name(config),result,assessment,pressureAtTargetPa};
}
function concise(v){
 const {result:r,config,assessment:a,pressureAtTargetPa}=v;
 return {name:v.name,config,assessment:a.status,reason:a.reason,valid:a.valid,meetsTarget:a.meetsTarget,
  relativeOpen:a.relativeOpen,flowM3S:r.flowM3S,pressureAtTargetPa,
  permeabilityM2:r.permeabilityM2,solidFraction:r.solidFraction,iterations:r.iterations,
  converged:r.converged,residual:r.residual,imbalanceM3S:r.imbalanceM3S,throughCells:r.throughCells};
}
function current(){
 const qualified=ranking.filter(x=>x.meetsTarget&&x.config);
 return qualified.length?qualified.sort((a,b)=>b.flowM3S-a.flowM3S)[0]:null;
}
const reasons=new Map();
const pauseTick=()=>new Promise(ok=>setTimeout(ok,20));
/** Dye is time-stepped while pressures/flows remain steady. No animation-only
 * particle motion, every transported quantity comes from solved 3D bond flux.
 */
async function followDye(g,trial,label,frames=5,stepsPerFrame=30){
 if(!trial?.result?.converged||trial.result.flowM3S<=0)return null;
 const tracer=createDyeTransport(trial.result);
 for(let f=0;f<frames;f++){
  if(g!==generation)return null;
  while(paused&&g===generation)await pauseTick();
  if(g!==generation)return null;
  stepDyeTransport(tracer,stepsPerFrame);
  send({type:'dye-step',transport:dyeSnapshot(tracer),label,reason:'Calculated dye advection through this geometry at fixed steady pore pressures'});
  await pauseTick();
 }
 return tracer;
}
function pushMutations(){
 const planned=planV10FollowUps(ranking,seen,12);
 plannedCount=planned.length;
 for(const trial of planned){
  const key=JSON.stringify(trial.config);
  seen.add(key);
  reasons.set(key,trial.reason);
  queue.push(trial.config);
 }
 return planned;
}

async function explore(g){
 try{
  if(originalV10){
   // Evaluate exactly what V10 selected, including voxel defects and roughness.
   // The matched open reference uses the same n³ cells (separate from 13x13x9 sweep).
   const {mask,n:actualN,layers:actualLayers,receipt}=originalV10;
   send({type:'source-progress',message:'ORIGINAL V10 '+actualN+'³ geometry received · testing same-grid open reference'});
   await new Promise(ok=>setTimeout(ok,0));
   if(g!==generation)return;
   const open=solvePoreNetwork(new Uint8Array(mask.length),actualN,actualLayers);
   if(!open.converged||open.flowM3S<=0)throw Error('Original V10 matched open reference did not converge');
   const flow=solvePoreNetwork(mask,actualN,actualLayers);
   const assessment=assessMembrane(flow,open);
   const relativeOpen=flow.flowM3S/open.flowM3S;
   const required=open.flowM3S*HYDRAULICS.targetOpenFraction;
   const pressureAtTargetPa=flow.flowM3S>0?required*HYDRAULICS.pressureDifferencePa/flow.flowM3S:null;
   const source={source:'V10MeshEngine.getSolidMask',checksum:receipt.checksum,
     config:receipt.config,resolution:actualN,reason:receipt.reason,
     valid:assessment.valid,meetsTarget:assessment.meetsTarget,flowM3S:flow.flowM3S,
     relativeOpen,pressureAtTargetPa,solidFraction:flow.solidFraction,
     converged:flow.converged,imbalanceM3S:flow.imbalanceM3S,
     assessment:assessment.status,verdict:assessment.reason};
   send({type:'source-evidence',source,current:hydraulicEvidence(flow)});
   await followDye(g,{result:flow},'ORIGINAL V10 MASK · CHRONOLOGICAL DYE',7,24);
   await new Promise(ok=>setTimeout(ok,0));
   if(g!==generation)return;
  }
  const ref=makeShape(null);if(!ref.result.converged||ref.result.flowM3S<=0)throw Error('Open-reference pressure network failed its analytic gate');
  reference=ref.result;focus=ref;
  ranking.push(concise(ref));send({type:'progress',done:1,total:7,stage:'REFERENCE VERIFIED',ranking:ranking.slice(),current:hydraulicEvidence(ref.result),focus:concise(ref)});
  queue=originalV10?[originalV10.receipt.config,...seedConfigs]:seedConfigs.slice();
  queue=queue.filter(c=>{const key=JSON.stringify(c);if(seen.has(key))return false;seen.add(key);return true;});
  initialCount=queue.length;
  let done=0,mutated=false;
  while(queue.length){
   if(g!==generation)return;
   if(paused){await new Promise(ok=>setTimeout(ok,80));continue;}
   const cfg=queue.shift(),trial=makeShape(cfg),small=concise(trial);
   const inference=reasons.get(JSON.stringify(cfg))||'Evaluate an original V10 geometry against measured hydraulic constraints';
   // Publish the SOLID MASK first, then inject a calculated tracer step-by-step.
   // Screens show the actual membrane throughout the chronological experiment.
   focus=trial;
   send({type:'progress',done:done+1,total:mutated?1+initialCount+plannedCount:1+initialCount,
     stage:mutated?'CHRONOLOGICAL FLOW TEST':'SCREENING V10 MASKS',reason:inference,ranking:ranking.slice(),
     current:hydraulicEvidence(trial.result),focus:small,winner:best?concise(best):null});
   const tracer=await followDye(g,trial,small.name,5,30);
   if(g!==generation)return;
   small.breakthroughTimeSec=tracer?.breakthroughTimeSec??null;
   small.chronologicalSteps=tracer?.step??0;
   ranking.push(small);done++;
   if(trial.assessment.meetsTarget&&(!best||trial.result.flowM3S>best.result.flowM3S))best=trial;
   send({type:'progress',done:done+1,total:mutated?1+initialCount+plannedCount:1+initialCount,
     stage:'TRIAL MEASURED',reason:inference,ranking:ranking.slice(),current:hydraulicEvidence(trial.result),focus:small,
     winner:best?concise(best):null});
   if(!queue.length&&!mutated){mutated=true;const plan=pushMutations();send({type:'decision',stage:'AUTOMATIC GEAR',message:`Tested ${initialCount} V10 masks. ${plan.length} numerical follow-ups selected from measured flow/solid constraints. ${plan[0]?.reason||'No valid candidate for more tests'}.`,winner:best?concise(best):null});}
  }
  if(g!==generation)return;
  ended=true;
  const winner=best?concise(best):null;
  const display=best||focus;
  send({type:'progress',done:ranking.length,total:ranking.length,stage:'REPLAYING SELECTED GEOMETRY',
    current:hydraulicEvidence(display.result),focus:concise(display),ranking:ranking.slice(),winner});
  await followDye(g,display,display.name,9,30);
  if(g!==generation)return;
  send({type:'complete',done:ranking.length,total:ranking.length,stage:'SEARCH FINISHED',ranking:ranking.slice(),
    current:hydraulicEvidence(display.result),focus:concise(display),winner,
    message:best?`Provisional pore-network candidate: ${best.name}. Δp needed for a fixed flow ≈ ${winner.pressureAtTargetPa.toFixed(3)} Pa vs open reference ${HYDRAULICS.targetOpenFraction.toFixed(2)} Pa. Requires CFD and experimental validation.`:
      'No tested solid membrane met the preset solid fraction and flow target. No fabricated improvement.'});
 }catch(error){ended=true;send({type:'error',message:String(error)})}
}
function start(){paused=false;if(ended){return;}if(!generation){generation++;explore(generation);}}
function reset(){generation++;paused=false;ended=false;ranking=[];reference=null;focus=null;best=null;seen.clear();reasons.clear();queue=[];plannedCount=0;send({type:'starting'});explore(generation);}
globalThis.onmessage=({data})=>{
 switch(data?.type){case 'source-v10':
  try{originalV10=data.receipt?decodeV10PressureSelection(data.receipt):null;}
  catch(error){originalV10=null;send({type:'source-error',message:String(error)});}
  break;case 'start':start();break;case 'pause':paused=true;send({type:'paused'});break;case 'resume':paused=false;send({type:'resumed'});break;case 'reset':reset();break;
 case 'snapshot':send({type:'progress',done:ranking.length,ranking:ranking.slice(),current:focus?hydraulicEvidence(focus.result):null,focus:focus?concise(focus):null,winner:best?concise(best):null});break;}
};
send({type:'ready',description:'V10 pressure-driven pore-network optimizer, mass-conserving, finite-campaign'});
