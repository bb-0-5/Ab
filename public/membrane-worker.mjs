/** One local Web Worker is the physical job scheduler; no remote CFD. */
import {createSliceEngine,advanceSlices,snapshot,sliceEvidence,MODEL} from './slice-engine.mjs?v=v10-cfd-20261015-r1';
import {buildV10Mask,poreConnectivity,V10_CANDIDATES} from './v10-membrane-masks.mjs?v=v10-cfd-20261015-r1';
let engine=null,ranking=[],winner=null,active=false,timer=null,epoch=0,hotspot=0,stage='idle';
function safeMessage(data){postMessage(data)}
function stop(){active=false;if(timer!==null){clearInterval(timer);timer=null;}}
function publish(){if(!engine)return;safeMessage({type:'state',state:snapshot(engine),ranking,winner,stage});}
function tick(){if(!active||!engine)return;try{advanceSlices(engine,2);publish()}catch(err){stop();safeMessage({type:'error',message:String(err)})}}
function start(){if(!engine){restart();return;}if(active)return;active=true;stage='running';timer=setInterval(tick,175);tick()}
const later=()=>new Promise(resolve=>setTimeout(resolve,0));
async function restart(){
 stop();const request=++epoch;engine=null;ranking=[];winner=null;stage='screening';
 safeMessage({type:'screening',ranking,progress:0,total:V10_CANDIDATES.length+1});
 const options=[{label:'Open cavity · reference',config:null},...V10_CANDIDATES.map((config,i)=>({label:`${config.tpms.replace('_',' ')} · ${config.frequency.toFixed(1)} / ${config.threshold.toFixed(2)}`,config}))];
 try{
  for(let k=0;k<options.length;k++){
   if(epoch!==request)return;
   const {label,config}=options[k];
   const data=config?buildV10Mask({n:13,layers:7,...config}):null;
   const connectivity=data?poreConnectivity(data.mask,13,7):{reachesTop:true,connectedVoidFraction:1,voidFraction:1};
   let result={id:k,label,config,connectivity,accepted:false,plateHeatFlux:null,divergence:null,peakW:null,score:null};
   if(connectivity.reachesTop&&connectivity.connectedVoidFraction>.95&&connectivity.voidFraction>.4){
    const trial=createSliceEngine({n:13,layers:7,hotspot,solidMask:data?.mask||null});
    advanceSlices(trial,65);
    const e=sliceEvidence(trial);
    // All candidates are at the same mesh and time: a transient, not a design rating.
    result={...result,accepted:e.divergenceMax<=MODEL.tolerance&&Number.isFinite(e.plateHeatFlux),plateHeatFlux:e.plateHeatFlux,divergence:e.divergenceMax,peakW:e.peakW};
    if(result.accepted)result.score=e.plateHeatFlux;
   }
   ranking.push(result);safeMessage({type:'screening',ranking:[...ranking],progress:k+1,total:options.length});
   await later(); // browser can show incremental evidence; does not skip any solver work
  }
  if(epoch!==request)return;
  const eligible=ranking.filter(r=>r.accepted&&r.config); // empty cavity is a reference, not a V10 membrane
  if(!eligible.length)throw Error('No V10 membrane geometry passed mass balance and connectivity checks');
  eligible.sort((a,b)=>b.score-a.score);
  for(const candidate of eligible){
   const c=candidate.config?buildV10Mask({n:19,layers:9,...candidate.config}):null;
   const connected=c?poreConnectivity(c.mask,19,9):{reachesTop:true,connectedVoidFraction:1};
   if(!connected.reachesTop||connected.connectedVoidFraction<.95)continue;
   engine=createSliceEngine({n:19,layers:9,hotspot,solidMask:c?.mask||null});
   winner={...candidate,vsEmptyPercent:ranking[0].accepted?100*(candidate.score/ranking[0].score-1):null,coarseGrid:'13×13×7',liveGrid:'19×19×9',connectedAtLiveGrid:connected.reachesTop};
   break;
  }
  if(!engine)throw Error('No winner passed the higher resolution connectivity screen');
  stage='running';publish();start();
 }catch(err){if(epoch===request){stage='error';safeMessage({type:'error',message:String(err)})}}
}
onmessage=({data})=>{
 switch(data?.type){
  case 'start': if(stage==='idle'||stage==='error')restart();else start();break;
  case 'pause':stop();stage='paused';publish();break;
  case 'reset':hotspot=(hotspot+1)%3;restart();break;
  case 'snapshot':publish();break;
 }
};
safeMessage({type:'ready',description:'V10 TPMS mask + sealed 3D pressure-projected CFD, adiabatic solids, locally scheduled'});
