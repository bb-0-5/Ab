/** AboveBound experiment 003. Real steady pressure-driven THROAT NETWORK,
 * not a transient closed-cavity heat model and not 3D CFD. */
import {buildV10Mask,V10_CANDIDATES} from './v10-membrane-masks.mjs';
import {HYDRAULICS,solvePoreNetwork,assessMembrane,hydraulicEvidence} from './v10-pressure-network.mjs';
const n=13,layers=9;
const seedConfigs=V10_CANDIDATES.map(x=>({...x}));
const name=c=>c===null?'Open void reference':`${c.tpms} · f=${c.frequency.toFixed(2)} · threshold=${c.threshold.toFixed(2)}`;
const send=x=>postMessage(x);
let generation=0,paused=false,ended=false,seen=new Set(),queue=[],ranking=[],reference=null,focus=null,best=null,serial=0,initialCount=0;
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
function pushMutations(){
 const starters=ranking.filter(x=>x.valid&&x.config).sort((a,b)=>b.flowM3S-a.flowM3S).slice(0,2);
 if(!starters.length)return;
 let count=0;
 for(const starter of starters){
  for(const df of [-.25,.25])for(const dt of [-.18,0,.18]){
   const x=starter.config,c={...x,frequency:Math.min(2.6,Math.max(.4,x.frequency+df)),threshold:Math.min(1.2,Math.max(-1.2,x.threshold+dt))};
   const key=JSON.stringify(c);if(seen.has(key))continue;seen.add(key);queue.push(c);
   count++;if(count>=12)return;
  }
 }
}
async function explore(g){
 try{
  const ref=makeShape(null);if(!ref.result.converged||ref.result.flowM3S<=0)throw Error('Open-reference pressure network failed its analytic gate');
  reference=ref.result;focus=ref;
  ranking.push(concise(ref));send({type:'progress',done:1,total:7,stage:'REFERENCE VERIFIED',ranking:ranking.slice(),current:hydraulicEvidence(ref.result),focus:concise(ref)});
  queue=seedConfigs.slice();queue.forEach(c=>seen.add(JSON.stringify(c)));initialCount=queue.length;
  let done=0,mutated=false;
  while(queue.length){
   if(g!==generation)return;
   if(paused){await new Promise(ok=>setTimeout(ok,80));continue;}
   const cfg=queue.shift(),trial=makeShape(cfg),small=concise(trial);
   ranking.push(small);done++;
   if(trial.assessment.meetsTarget&&(!best||trial.result.flowM3S>best.result.flowM3S))best=trial;
   // Display each actual pressure solution for a moment, while retaining best separately.
   focus=trial;
   send({type:'progress',done:done+1,total:mutated?1+initialCount+12:1+initialCount,
     stage:mutated?'REFINING GEOMETRY':'SCREENING V10 MASKS',ranking:ranking.slice(),current:hydraulicEvidence(trial.result),focus:small,
     winner:best?concise(best):null});
   await new Promise(ok=>setTimeout(ok,45));
   if(!queue.length&&!mutated){mutated=true;pushMutations();send({type:'decision',stage:'AUTOMATIC GEAR',message:`Tested ${initialCount} V10 masks. ${queue.length} local revisions selected from physically admissible candidates. Open cavity remains the upper bound.`,winner:best?concise(best):null});}
  }
  if(g!==generation)return;
  ended=true;
  const winner=best?concise(best):null;
  const display=best||focus;
  send({type:'complete',done:ranking.length,total:ranking.length,stage:'SEARCH FINISHED',ranking:ranking.slice(),
    current:hydraulicEvidence(display.result),focus:concise(display),winner,
    message:best?`Provisional pore-network candidate: ${best.name}. Δp needed for a fixed flow ≈ ${winner.pressureAtTargetPa.toFixed(3)} Pa vs open reference ${HYDRAULICS.targetOpenFraction.toFixed(2)} Pa. Requires CFD and experimental validation.`:
      'No tested solid membrane met the preset solid fraction and flow target. No fabricated improvement.'});
 }catch(error){ended=true;send({type:'error',message:String(error)})}
}
function start(){paused=false;if(ended){return;}if(!generation){generation++;explore(generation);}}
function reset(){generation++;paused=false;ended=false;ranking=[];reference=null;focus=null;best=null;seen.clear();queue=[];send({type:'starting'});explore(generation);}
globalThis.onmessage=({data})=>{
 switch(data?.type){case 'start':start();break;case 'pause':paused=true;send({type:'paused'});break;case 'resume':paused=false;send({type:'resumed'});break;case 'reset':reset();break;
 case 'snapshot':send({type:'progress',done:ranking.length,ranking:ranking.slice(),current:focus?hydraulicEvidence(focus.result):null,focus:focus?concise(focus):null,winner:best?concise(best):null});break;}
};
send({type:'ready',description:'V10 pressure-driven pore-network optimizer, mass-conserving, finite-campaign'});
