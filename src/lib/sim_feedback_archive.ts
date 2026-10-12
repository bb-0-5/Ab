/**
 * Small, browser-local V6/V7/V13 experiment evidence ledger.
 * Scores represent numerically modeled flow; NO material properties, observed
 * yields, or successful experiments are invented by this archive.
 */
import type {FlowMetrics} from '../simulations/v6';
import type {V13MaterialRequirement,V13RequirementScreen} from '../simulations/v13_material';
import type {TuningParam} from '../simulations/v7';

const KEY='abovebound.v6-v7-v13.evidence.v1';
const LIMIT=32;
const SCHEMA=1;
export type FeedbackScenario={
 optimizer:'thermal'|'electrical'|'blockchain'|'math';
 thermalMode:'heating'|'cooling';
 compressionLevel:number;
 materialSignature:string;
 loopCount:number;
};
export type LearningEvidence={
 scenario:FeedbackScenario;
 timestamp:number;
 solverVersion:'v6-v7-model-1';
 flow:Pick<FlowMetrics,'totalFlow'|'avgResistance'|'efficiency'|'pathCount'|'bottleneckCount'>;
 v7:{
  bestScore:number;acceptedTrials:number;rejectedTrials:number;
  bestParams:Array<{name:string;value:number}>;
 };
 requirement:V13MaterialRequirement|null;
 materialScreens:Array<{id:string;status:V13RequirementScreen['status'];
   maxTemperatureK:number;estimatedMeltingPointK:number|null}>;
 evidence:'model_only_not_measured';
};
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
export function feedbackScenarioKey(s:FeedbackScenario):string{
 if(!s||!['thermal','electrical','blockchain','math'].includes(s.optimizer)
   ||!['heating','cooling'].includes(s.thermalMode)
   ||!finite(s.compressionLevel)||s.compressionLevel<0
   ||!Number.isInteger(s.loopCount)||s.loopCount<0
   ||typeof s.materialSignature!=='string'||s.materialSignature.length>300)
   throw Error('Invalid simulation scenario');
 return JSON.stringify([SCHEMA,s.optimizer,s.thermalMode,
  s.compressionLevel,s.materialSignature,s.loopCount]);
}
function read():LearningEvidence[]{
 try{
  const raw=JSON.parse(localStorage.getItem(KEY)||'[]') as LearningEvidence[];
  return Array.isArray(raw)?raw.slice(0,LIMIT).filter(r=>r?.evidence==='model_only_not_measured'
   &&r?.solverVersion==='v6-v7-model-1'
   &&r?.scenario&&r?.flow&&finite(r.flow.totalFlow)
   &&r?.v7&&finite(r.v7.bestScore)
   &&Number.isSafeInteger(r.v7.acceptedTrials)
   &&Array.isArray(r.v7.bestParams)
   &&Array.isArray(r.materialScreens)):[];
 }catch{return [];}
}
export function getFeedbackArchive():LearningEvidence[]{return read();}
export function findCompatibleFeedback(
 scenario:FeedbackScenario,reference:FlowMetrics,
):LearningEvidence|null{
 const key=feedbackScenarioKey(scenario);
 if(!finite(reference.totalFlow)||!finite(reference.avgResistance)
  ||!finite(reference.efficiency)||!finite(reference.pathCount))return null;
 const matches=read().filter(record=>{
  // Browser storage is user-controlled and can contain stale/corrupt JSON.
  // One bad record must never halt the live RAF simulation chain.
  try{if(feedbackScenarioKey(record.scenario)!==key)return false;}
  catch{return false;}
  // This is a heuristic consistency gate. State changes are still independently
  // tested by V7, and archive scores do not become current measurements.
  const expected=record.flow;
  return finite(expected.totalFlow)&&finite(expected.avgResistance)
   && Math.abs(reference.pathCount-expected.pathCount)<=Math.max(2,expected.pathCount*.4)
   && Math.abs(reference.totalFlow-expected.totalFlow)<=Math.max(1,Math.abs(expected.totalFlow)*.4);
 });
 matches.sort((a,b)=>b.v7.bestScore-a.v7.bestScore);
 return matches[0]||null;
}
export function rememberFeedback(record:LearningEvidence):number{
 try{
  feedbackScenarioKey(record.scenario);
  if(record.solverVersion!=='v6-v7-model-1'||record.evidence!=='model_only_not_measured'
   ||!finite(record.v7.bestScore)||record.v7.acceptedTrials<1
   ||!finite(record.flow.totalFlow)||!finite(record.flow.efficiency)
   ||!finite(record.flow.avgResistance)||!finite(record.flow.pathCount)
   ||!Array.isArray(record.v7.bestParams))return read().length;
  const names=new Set<string>();
  const bestParams=record.v7.bestParams.slice(0,12).filter(param=>{
   if(!param||typeof param.name!=='string'||param.name.length>80
    ||!finite(param.value)||names.has(param.name))return false;
   names.add(param.name);return true;
  });
  if(!bestParams.length)return read().length;
  const safe:LearningEvidence={
   ...record,timestamp:Date.now(),
   flow:{totalFlow:record.flow.totalFlow,
    avgResistance:record.flow.avgResistance,
    efficiency:record.flow.efficiency,
    pathCount:record.flow.pathCount,
    bottleneckCount:record.flow.bottleneckCount},
   v7:{...record.v7,bestParams},
   requirement:record.requirement?{...record.requirement}:null,
   materialScreens:record.materialScreens.slice(0,8).map(row=>({...row})),
  };
  // Retain diverse accepted experimental snapshots, not 32 identical
  // writes every 10 seconds. A newer/better one replaces a weaker identical
  // scenario + same best-parameter vector.
  const existing=read();
  const fingerprint=JSON.stringify([feedbackScenarioKey(safe.scenario),safe.v7.bestParams]);
  const previous=existing.find(x=>JSON.stringify([feedbackScenarioKey(x.scenario),x.v7.bestParams])===fingerprint);
  if(previous&&previous.v7.bestScore>=safe.v7.bestScore)return existing.length;
  const rest=existing.filter(x=>{
    try{return JSON.stringify([feedbackScenarioKey(x.scenario),x.v7.bestParams])!==fingerprint;}
    catch{return false;}
  });
  localStorage.setItem(KEY,JSON.stringify([safe,...rest].slice(0,LIMIT)));
  return Math.min(LIMIT,1+rest.length);
 }catch{return read().length;}
}
/** Pick only previously optimized target coordinates. Reject arbitrary keys. */
export function validTuningHints(hints:LearningEvidence['v7']['bestParams'],
 current:readonly TuningParam[],
):Array<{name:string;value:number}>{
 if(!Array.isArray(hints))return [];
 return hints.filter(h=>{
  const candidate=current.find(p=>p.name===h?.name);
  return candidate&&finite(h.value)&&h.value>=candidate.min&&h.value<=candidate.max
   &&Math.abs(h.value-candidate.value)>1e-10;
 }).slice(0,5).map(h=>({...h}));
}
