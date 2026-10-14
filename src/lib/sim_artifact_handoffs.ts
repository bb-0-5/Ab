/**
 * Evidence-based handoffs for the ORIGINAL V0–V13 simulation viewport.
 *
 * V0–V8 are discovery instruments; V9–V13 are construction/screening
 * instruments. A visible stage is not a completed stage: promotion requires
 * a numerical or geometric artifact and an exact upstream dependency.
 *
 * These receipts are model outputs, NOT measurements, a patent, or a
 * claim that an uncalibrated candidate can be manufactured.
 */
import {SIMULATION_STAGES,indexOfStage,type NumberedSimVersion} from './sim_sequence';

export type StageObservation={
  /** A real produced thing: nodes, edges, planes, paths, voxels, etc. */
  quantity:number;
  /** A domain-specific numeric result, not necessarily an improvement. */
  signal:number;
  /** Experiments, candidate evaluations, or other source evidence. */
  support:number;
  /** A concise, reproducible reference to the producing engine's data. */
  signature:string;
};
export type StageReceipt={
  stage:NumberedSimVersion;
  phase:'discovery'|'construction';
  id:string;
  predecessorId:string|null;
  context:string;
  observation:StageObservation;
  modelOnly:true;
};
export type StageDecision={
  ok:boolean;
  reason:string;
  receipt:StageReceipt|null;
};
const KEY='abovebound.sim-handoffs.v1';
const MAX=56;
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
function fingerprint(s:string):string{
  // Deterministic content ID for deduplication, NOT cryptographic evidence.
  let hash=2166136261;
  for(let i=0;i<s.length;i++){
    hash=Math.imul(hash^s.charCodeAt(i),16777619);
  }
  return (hash>>>0).toString(16).padStart(8,'0');
}
export function stagePhase(stage:NumberedSimVersion):'discovery'|'construction'{
  return indexOfStage(stage)<=8?'discovery':'construction';
}
export function qualifyStage(
  stage:NumberedSimVersion,
  observation:StageObservation|null,
  predecessor:StageReceipt|null,
  context:string,
):StageDecision{
  const idx=indexOfStage(stage);
  const previous=idx===0?null:SIMULATION_STAGES[idx-1];
  if(!context||context.length>180)return {ok:false,reason:'Invalid experiment context',receipt:null};
  if(previous&&(!predecessor||predecessor.stage!==previous
    ||predecessor.context!==context))
    return {ok:false,reason:'Waiting for an artifact from '+previous.toUpperCase(),receipt:null};
  if(!observation)return {ok:false,reason:'Waiting for '+stage.toUpperCase()+' output',receipt:null};
  const {quantity,signal,support,signature}=observation;
  if(!finite(quantity)||quantity<=0||!finite(signal)||!finite(support)||support<0
    ||typeof signature!=='string'||signature.length<1||signature.length>300)
    return {ok:false,reason:'No valid output to hand off',receipt:null};
  if(stage==='v7'&&support<1)
    return {ok:false,reason:'V7 has not compared a candidate against V6 yet',receipt:null};
  if(stage==='v8'&&support<1)
    return {ok:false,reason:'V8 has not produced a mathematical analysis',receipt:null};
  if(stage==='v10'&&signal<=0)
    return {ok:false,reason:'V10 has not found a connected transport channel',receipt:null};
  if((stage==='v9'||stage==='v11'||stage==='v12'||stage==='v13')&&support<1)
    return {ok:false,reason:'Construction stage needs a generated or evaluated artifact',receipt:null};
  const clean:StageObservation={quantity,signal,support,signature};
  const predecessorId=predecessor?.id||null;
  const id=stage+'-'+fingerprint(JSON.stringify([context,predecessorId,clean]));
  return {ok:true,reason:'Artifact ready',receipt:{
    stage,phase:stagePhase(stage),id,predecessorId,context,
    observation:clean,modelOnly:true,
  }};
}
/**
 * Discovery influences the NEXT lattice trial's arrangement/defects, never
 * its material constitutive properties. Candidate must be re-evaluated.
 */
export function seedFromDiscovery(discovery:StageReceipt,oldSeed:number):number{
  if(discovery.stage!=='v8'||discovery.phase!=='discovery'
    ||!Number.isSafeInteger(oldSeed)||oldSeed<0||oldSeed>0xffffffff)
    throw new Error('Only a completed V8 discovery can seed V9');
  const seed=parseInt(fingerprint(discovery.id+':'+oldSeed),16)>>>0;
  return seed===oldSeed?((seed+1)>>>0):seed;
}
export function rememberStageReceipt(receipt:StageReceipt):void{
  try{
    const old=JSON.parse(localStorage.getItem(KEY)||'[]') as StageReceipt[];
    const safe=Array.isArray(old)?old.filter(r=>r&&r.modelOnly===true
      &&typeof r.id==='string'&&r.id!==receipt.id):[];
    localStorage.setItem(KEY,JSON.stringify([receipt,...safe].slice(0,MAX)));
  }catch{/* Storage unavailable must not count as a laboratory result. */}
}
export function getStageReceipts():StageReceipt[]{
  try{
    const records=JSON.parse(localStorage.getItem(KEY)||'[]');
    return Array.isArray(records)?records.slice(0,MAX).filter(
      r=>r?.modelOnly===true&&typeof r?.id==='string'
    ):[];
  }catch{return [];}
}

/** Keep failed construction evidence separate from successful receipts. */
export type FailedGeometryTrial={
  context:string;
  v9ReceiptId:string;
  latticeSeed:number;
  axis:'x'|'y'|'z';
  tested:number;
  reason:string;
  modelOnly:true;
};
const FAILED_KEY='abovebound.v10.failed-geometry.v1';
export function getFailedGeometryTrials():FailedGeometryTrial[]{
  try{
    const raw=JSON.parse(localStorage.getItem(FAILED_KEY)||'[]');
    return Array.isArray(raw)?raw.slice(0,16).filter(
      x=>x?.modelOnly===true&&typeof x?.v9ReceiptId==='string'
        &&Number.isSafeInteger(x?.latticeSeed)
        &&Number.isSafeInteger(x?.tested)&&x.tested>0):[];
  }catch{return [];}
}
export function rememberFailedGeometryTrial(trial:FailedGeometryTrial):number{
  if(!trial||!trial.context||trial.context.length>180
    ||!trial.v9ReceiptId||trial.v9ReceiptId.length>120
    ||!Number.isSafeInteger(trial.latticeSeed)||trial.latticeSeed<0
    ||trial.latticeSeed>0xffffffff
    ||!['x','y','z'].includes(trial.axis)
    ||!Number.isSafeInteger(trial.tested)||trial.tested<1||trial.tested>1000
    ||!trial.reason||trial.reason.length>240
    ||trial.modelOnly!==true)throw Error('Invalid failed-geometry evidence');
  const old=getFailedGeometryTrials();
  const rest=old.filter(x=>x.v9ReceiptId!==trial.v9ReceiptId
    ||x.latticeSeed!==trial.latticeSeed||x.axis!==trial.axis);
  try{localStorage.setItem(FAILED_KEY,
    JSON.stringify([trial,...rest].slice(0,16)));
    return Math.min(16,1+rest.length);
  }catch{return old.length;}
}
