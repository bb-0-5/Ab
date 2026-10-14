/** Experimental V10 3D CFD. Streams *computed* cross-sections during screening.
 * Candidate ranking is a coarse transient surrogate, not validated permeability.
 */
import {createSliceEngine,advanceSlices,snapshot,sliceEvidence,MODEL} from './slice-engine.mjs?v=visible-20261015-r3';
import {buildV10Mask,poreConnectivity,V10_CANDIDATES} from './v10-membrane-masks.mjs?v=visible-20261015-r3';
import {selectScreeningResult,shouldPromote,compareToReference} from './discovery-gates.mjs?v=evidence-20261015-r4';
const SMALL={n:13,layers:7},BIG={n:19,layers:9},TRIAL=65,CHUNK=5;
const options=[{label:'Open cavity · reference',config:null},...V10_CANDIDATES.map(c=>({label:`${c.tpms.replace('_',' ')} · ${c.frequency.toFixed(1)} / ${c.threshold.toFixed(2)}`,config:c}))];
let engine=null,ranking=[],winner=null,active=false,timer=null,epoch=0,hotspot=0,stage='idle';
let remaining=[],trial=null,nextTrialAt=80,trialId=0;
const send=d=>postMessage(d),later=()=>new Promise(ok=>setTimeout(ok,0));
function stop(){active=false;if(timer!==null){clearInterval(timer);timer=null}}
function publish(){if(engine)send({type:'state',state:snapshot(engine),ranking,winner,stage})}
function trialSetup(config,size){
 const data=config?buildV10Mask({...size,...config}):null;
 const connectivity=data?poreConnectivity(data.mask,size.n,size.layers):{reachesTop:true,connectedVoidFraction:1,voidFraction:1};
 const valid=connectivity.reachesTop&&connectivity.connectedVoidFraction>.95&&connectivity.voidFraction>.4;
 return {connectivity,valid,sim:valid?createSliceEngine({...size,hotspot,solidMask:data?.mask||null}):null};
}
function resultFor(id,label,config,connectivity,sim){
 const e=sim?sliceEvidence(sim):null;
 const accepted=Boolean(e&&e.divergenceMax<=MODEL.tolerance&&Number.isFinite(e.plateHeatFlux));
 return {id,label,config,connectivity,accepted,plateHeatFlux:accepted?e.plateHeatFlux:null,divergence:e?.divergenceMax??null,peakW:e?.peakW??null,score:accepted?e.plateHeatFlux:null};
}
function mutationalCandidates(seed){
 if(!seed)return [];
 const found=new Set(),all=[];
 for(const f of [-.40,-.20,.20,.40])for(const t of [-.2,0,.2]){
  const config={...seed,frequency:Math.max(.5,Math.min(2.5,seed.frequency+f)),threshold:Math.max(-1,Math.min(1,seed.threshold+t))};
  const label=`${config.tpms} · ${config.frequency.toFixed(2)} / ${config.threshold.toFixed(2)}`;
  if(!found.has(label)){found.add(label);all.push({label,config})}
 }return all;
}
async function restart(){
 stop();const ticket=++epoch;engine=null;winner=null;ranking=[];remaining=[];trial=null;trialId=options.length;nextTrialAt=80;stage='screening';
 send({type:'screening',ranking:[],progress:0,total:options.length,activeLabel:'Starting reference physics',step:0,steps:TRIAL});
 try{
  for(let k=0;k<options.length;k++){
   if(ticket!==epoch)return;
   const opt=options[k],{valid,connectivity,sim}=trialSetup(opt.config,SMALL);
   send({type:'screening',ranking:[...ranking],progress:k,total:options.length,activeLabel:opt.label,step:0,steps:TRIAL});
   if(valid)for(let s=0;s<TRIAL;s+=CHUNK){
    if(ticket!==epoch)return;
    advanceSlices(sim,Math.min(CHUNK,TRIAL-s));
    // Render the actual masked field, before screening is complete.
    send({type:'preview',state:snapshot(sim),activeLabel:opt.label,progress:k,total:options.length,step:sim.step,steps:TRIAL});
    await later();
   }
   ranking.push(resultFor(k,opt.label,opt.config,connectivity,sim));
   send({type:'screening',ranking:[...ranking],progress:k+1,total:options.length,activeLabel:opt.label,step:TRIAL,steps:TRIAL});
   await later();
  }
  if(ticket!==epoch)return;
  const decision=selectScreeningResult(ranking);
  if(decision.status==='invalid-reference')throw Error(decision.reason);
  // Never promote a membrane whose modeled flux is worse than the open cavity.
  const eligible=ranking.filter(x=>x.config&&compareToReference(decision.reference,x).ok).sort((a,b)=>b.score-a.score);
  for(const best of eligible){
    const fine=trialSetup(best.config,BIG);if(!fine.valid)continue;
    engine=fine.sim;winner={...best,vsEmptyPercent:100*(best.score/decision.reference.score-1),
      coarseGrid:'13×13×7',liveGrid:'19×19×9',connectedAtLiveGrid:true,provisional:true};break;
  }
  if(!engine){
   engine=createSliceEngine({...BIG,hotspot});winner=decision.incumbent;
  }
  // An unsuccessful geometry can still seed bounded revisions, without being called a discovery.
  remaining=mutationalCandidates((winner.config||decision.seed?.config)??null);
  send({type:'decision',winner,reason:decision.reason,ranking:[...ranking],remaining:remaining.length});
  stage='running';active=true;publish();loop();
 }catch(e){if(ticket!==epoch)return;stop();stage='error';send({type:'error',message:String(e)})}
}
function evaluateMutation(){
 if(!trial){
  if(engine.step<nextTrialAt||!remaining.length)return;
  const opt=remaining.shift(),setup=trialSetup(opt.config,SMALL);
  trial={...opt,...setup,id:trialId++};
  send({type:'exploring',activeLabel:opt.label,step:0,steps:TRIAL,remaining:remaining.length,ranking:[...ranking]});
 }
 if(trial.sim){
  advanceSlices(trial.sim,Math.min(CHUNK,TRIAL-trial.sim.step));
  send({type:'exploring',activeLabel:trial.label,step:trial.sim.step,steps:TRIAL,remaining:remaining.length,ranking:[...ranking]});
  if(trial.sim.step<TRIAL)return;
 }
 const result=resultFor(trial.id,trial.label,trial.config,trial.connectivity,trial.sim);
 ranking.push(result);
 if(shouldPromote(ranking[0],winner,result).ok){
  const fine=trialSetup(result.config,BIG);
  if(fine.valid){
    const previous=winner.label;
    winner={...result,vsEmptyPercent:100*(result.score/ranking[0].score-1),coarseGrid:'13×13×7',liveGrid:'19×19×9',connectedAtLiveGrid:true,provisional:true};
    engine=fine.sim;
    send({type:'discovery',winner,previous,ranking:[...ranking]});
  }
 }
 nextTrialAt=engine.step+4;trial=null;
 send({type:'exploring',activeLabel:result.label,step:TRIAL,steps:TRIAL,remaining:remaining.length,ranking:[...ranking],winner});
 if(!remaining.length){
  stage='complete';publish();
  send({type:'campaign-complete',winner,ranking:[...ranking],tested:ranking.length,
   reason:winner.config?'A coarse numerical candidate exceeded the reference; independent validation required.':
   'No membrane beat the open cavity; the bounded search ended without fabricating a gain.'});
  stop();
 }
}
function tick(){if(!active||!engine)return;try{
 advanceSlices(engine,2);publish();evaluateMutation();
 }catch(e){stop();stage='error';send({type:'error',message:String(e)})}}
function loop(){if(timer!==null)clearInterval(timer);timer=setInterval(tick,190);tick()}
onmessage=({data})=>{switch(data?.type){
 case 'start':if(stage==='idle'||stage==='error'||stage==='paused-screening')restart();else if(engine&&!active){active=true;stage='running';loop()}break;
 case 'pause':if(stage==='screening'){++epoch;stage='paused-screening';send({type:'paused-screening',message:'Screening paused; resume restarts the bounded search.'})}stop();if(stage!=='paused-screening')stage='paused';publish();break;
 case 'reset':hotspot=(hotspot+1)%3;restart();break;
 case 'snapshot':publish();break;
}};
send({type:'ready',description:'V10 CFD computed-field streaming with bounded autonomous geometry refinement'});