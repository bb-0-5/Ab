import {useCallback,useEffect,useRef,useState} from 'react';
import {inferNextExperiment,evaluateAutoExperiment,errorObservation,
 addAutoObservation,bestComparableObservation,loadAutoLedger,saveAutoLedger,
 type AutoExperiment,type AutoLedger,type AutoObservation} from './autonomy';
import {extractDiscoveriesFromHistory} from './cross_domain';
import {addBuildingRun,buildingKey,loadCampaign,saveCampaign,type BuildingRun} from './building_campaign';
import {loadDeviceResults,saveDeviceResult,type MemoryEntry} from './memory';

const BENCHMARK=buildingKey('melbourne',130,22,'preset');
const BATCH=7;
const MAX_WORKER_MS=90_000;
type WorkerReport={id:number;kind:'progress'|'result'|'error';result?:unknown;message?:string;error?:string};
const modeLabels:Record<string,string>={
 building:'Energy & geometry',circuits:'Electronic circuits',membrane:'Materials & membranes',
 suit:'Manufacturing',chemistry:'Reaction chemistry',
};
const fmt=(v:number|null,digits=1)=>v===null?'—':v.toLocaleString('en-AU',{maximumFractionDigits:digits});
function SummaryCard({record}:{record:AutoObservation}){
 const supported=record.grade==='feasible'||record.grade==='conditional';
 return <article className="rounded-xl border border-white/10 bg-[#0c1b23] p-4">
  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
   <strong className="text-cyan-100">{modeLabels[record.mode]}</strong>
   <span className={supported?'text-emerald-300':'text-amber-300'}>
    {record.grade==='feasible'?'Passed model gate':
     record.grade==='conditional'?'Conditional':
     record.grade==='no_gain'?'No improvement':
     record.grade==='unsupported'?'Unresolved':'Failed'}
   </span>
  </div>
  <h4 className="mt-3 text-sm font-semibold text-white">{record.title}</h4>
  <p className="mt-2 text-xs leading-5 text-slate-300">{record.summary}</p>
  <p className="mt-3 text-xs text-cyan-200">{record.metricLabel}: <strong>
   {fmt(record.metric,record.mode==='building'?0:3)} {record.unit}</strong></p>
  <p className="mt-2 text-[11px] leading-5 text-slate-400">{record.comparison}</p>
 </article>;
}

/**
 * The browser is the only scheduler and compute device. No imaginary cloud
 * agent, invisible service, learned physics or claim of work after tab close.
 * The first bounded cycle starts without any settings or human-chosen goal.
 */
export default function AutonomousDiscovery({
 onResult,onRegisterPause,
}:{
 onResult:(entry:MemoryEntry)=>void;
 onRegisterPause:(pause:()=>void)=>void;
}){
 const [ledger,setLedger]=useState<AutoLedger>(()=>loadAutoLedger());
 const [running,setRunning]=useState(false);
 const [message,setMessage]=useState('Discovering the next physically constrained experiment.');
 const [active,setActive]=useState<AutoExperiment|null>(null);
 const ledgerRef=useRef(ledger);
 const callbackRef=useRef(onResult);
 callbackRef.current=onResult;
 const state=useRef<{running:boolean;left:number;worker:Worker|null;timer:number|null;
  timeout:number|null;token:number;}>({
  running:false,left:0,worker:null,timer:null,timeout:null,token:0,
 });
 const launchRef=useRef<()=>void>(()=>{});
 const clearActive=()=>{
  const r=state.current;
  if(r.timer!==null)clearTimeout(r.timer);
  if(r.timeout!==null)clearTimeout(r.timeout);
  r.timer=null;r.timeout=null;
  r.worker?.terminate();r.worker=null;
 };
 const pause=useCallback(()=>{
  state.current.running=false;
  state.current.left=0;state.current.token++;
  clearActive();
  setActive(null);setRunning(false);
  setMessage('Paused. Completed experiments and comparable best designs remain on this device.');
 },[]);
 const finishBatch=()=>{
  state.current.running=false;state.current.left=0;
  setRunning(false);setActive(null);
  setMessage('This bounded search cycle is complete. Next visit resumes at the next unseen experiment.');
 };
 const scheduleNext=()=>{
  if(!state.current.running)return;
  if(state.current.left<=0){finishBatch();return;}
  if(document.hidden){
   setMessage('Paused because this tab is hidden. Search resumes when you return.');
   setActive(null);return;
  }
  state.current.timer=window.setTimeout(()=>launchRef.current(),120);
 };
 const finish=(
  experiment:AutoExperiment,
  record:AutoObservation,
  result?:unknown,
 )=>{
  const r=state.current;
  if(!r.running)return;
  clearActive();
  const current=ledgerRef.current;
  if(record.index!==current.nextIndex)return;
  if(result!==undefined){
   if(experiment.mode==='building'){
    const seed=Number(experiment.request.seed);
    const run=result as BuildingRun;
    const next=addBuildingRun(loadCampaign(BENCHMARK,481516),run,seed,record.at);
    saveCampaign(next);
   }
   const entry:MemoryEntry={
    id:crypto.randomUUID(),savedAt:record.at,mode:experiment.mode,
    label:`AUTO · ${experiment.title}`,
    input:Object.fromEntries(Object.entries(experiment.request).filter(
      ([,v])=>typeof v==='string'||typeof v==='number')) as Record<string,string|number>,
    result,
   };
   saveDeviceResult(entry);
   callbackRef.current(entry);
  }
  const updated=addAutoObservation(current,record);
  ledgerRef.current=updated;setLedger(updated);
  const persisted=saveAutoLedger(updated);
  r.left--;
  setMessage(!persisted?'Experiment recorded in memory; browser storage is unavailable.':
   record.grade==='error'?`Engine error recorded; continuing without learning from it.`:
   `${modeLabels[experiment.mode]}: ${record.grade.replaceAll('_',' ')}. Selecting next physical question.`);
  setActive(null);
  scheduleNext();
 };
 launchRef.current=()=>{
  const r=state.current;
  if(!r.running||document.hidden||r.worker)return;
  if(r.left<=0){finishBatch();return;}
  const current=ledgerRef.current;
  const history=loadDeviceResults();
  const prior=extractDiscoveriesFromHistory(history,24);
  const campaign=loadCampaign(BENCHMARK,481516);
  const job=inferNextExperiment(current.nextIndex,prior,campaign.nextSeed);
  setActive(job);
  setMessage(job.why);
  const id=++r.token;
  try{
   const worker=new Worker(new URL('./compute.worker.ts',import.meta.url),{type:'module'});
   r.worker=worker;
   worker.onmessage=(event:MessageEvent<WorkerReport>)=>{
    const data=event.data;
    if(!r.running||id!==r.token||data.id!==id)return;
    if(data.kind==='progress')return;
    const at=new Date().toISOString();
    if(data.kind==='error')finish(job,errorObservation(job,data.error||'Model rejected the experiment.',at));
    else if(data.result!==undefined){
     try{
      const record=evaluateAutoExperiment(job,data.result,at);
      finish(job,record,data.result);
     }catch(error){
      finish(job,errorObservation(job,error instanceof Error?error.message:'Unsupported solver result.',at));
     }
    }else finish(job,errorObservation(job,'Solver returned no result.',at));
   };
   worker.onerror=(e)=>{
    if(!r.running||id!==r.token)return;
    finish(job,errorObservation(job,e.message||'Local worker failed.',new Date().toISOString()));
   };
   r.timeout=window.setTimeout(()=>{
    if(!r.running||id!==r.token)return;
    finish(job,errorObservation(job,'Time budget exceeded; candidate skipped, no evidence added.',new Date().toISOString()));
   },MAX_WORKER_MS);
   worker.postMessage({...job.request,id,discoveries:prior});
  }catch(e){finish(job,errorObservation(job,e instanceof Error?e.message:'Worker creation failed.',new Date().toISOString()));}
 };
 const begin=useCallback((count:number)=>{
  const r=state.current;
  if(r.running)return;
  r.running=true;r.left=count;
  setRunning(true);
  setMessage('Deriving next task from existing records and physical constraints…');
  if(!document.hidden)r.timer=window.setTimeout(()=>launchRef.current(),80);
 },[]);
 useEffect(()=>{
  onRegisterPause(pause);
  begin(BATCH);
  const visible=()=>{
   const r=state.current;
   if(document.hidden){
    if(r.running){
     r.token++;clearActive();
     setActive(null);setMessage('Paused while hidden; no background calculations.');
    }
   }else if(r.running&&!r.worker){
    setMessage('Resuming autonomous search on this device…');
    r.timer=window.setTimeout(()=>launchRef.current(),90);
   }
  };
  document.addEventListener('visibilitychange',visible);
  return()=>{
   document.removeEventListener('visibilitychange',visible);
   state.current.running=false;state.current.token++;clearActive();
   onRegisterPause(()=>{});
  };
 // mount once: React StrictMode cleanup correctly cancels abandoned Workers
 },[]);
 const latest=new Map<string,AutoObservation>();
 for(const entry of ledger.records)if(!latest.has(entry.mode))latest.set(entry.mode,entry);
 const checked=ledger.records.reduce((sum,record)=>sum+record.checks,0);
 const bestEnergy=bestComparableObservation(ledger.records,'building:melbourne:130m2:22C:preset');
 return <section aria-label="Autonomous discovery engine"
  className="rounded-3xl border border-cyan-400/30 bg-gradient-to-b from-[#102731] to-[#0a1720] p-5 md:p-8">
  <div className="flex flex-wrap items-start justify-between gap-4">
   <div className="max-w-3xl">
    <div className="text-[11px] font-black uppercase tracking-[.22em] text-cyan-300">AboveBound · autonomous discovery</div>
    <h2 className="mt-3 text-2xl font-black tracking-tight text-white md:text-4xl">
     The machine chooses what to test next.
    </h2>
    <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
     No objectives to write. No parameter forms to complete. It proposes feasible
     configurations, calculates consequences, checks limits, keeps comparable
     improvements and makes the next question from what previous engines found.
    </p>
   </div>
   <div className="rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-center">
    <div className="font-mono text-[10px] uppercase tracking-widest text-slate-400">Experiments</div>
    <div className="mt-1 text-3xl font-black tabular-nums text-cyan-100">{ledger.completed}</div>
    <div className="text-[11px] text-slate-400">persisted attempts</div>
   </div>
  </div>
  <div className="mt-6 flex flex-wrap items-center gap-3">
   <span className={`inline-block h-2.5 w-2.5 rounded-full ${running?'animate-pulse bg-emerald-300':'bg-slate-500'}`}/>
   <p role="status" aria-live="polite" className="min-w-[190px] flex-1 text-sm text-slate-200">
    {message}</p>
   {running?<button type="button" onClick={pause}
    className="min-h-11 rounded-lg border border-amber-400/50 px-5 py-2 text-sm font-semibold text-amber-100">
    Pause</button>:
    <button type="button" onClick={()=>begin(BATCH)}
     className="min-h-11 rounded-lg bg-cyan-300 px-5 py-2 text-sm font-black text-slate-950">
     Continue discovery</button>}
  </div>
  {active&&<div className="mt-4 rounded-xl border border-cyan-500/30 bg-black/20 p-4">
   <p className="text-xs font-bold text-cyan-200">Now exploring: {active.title}</p>
   <p className="mt-2 text-xs leading-5 text-slate-300">Inferred objective: {active.objective}</p>
   <p className="mt-1 font-mono text-[11px] text-slate-500">Case #{active.index+1} · {active.mode}</p>
  </div>}
  <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
   {[
    ['Physical screens',String(ledger.completed)],
    ['Cross-engine checks',String(checked)],
    ['Best comparable building',bestEnergy?`${fmt(bestEnergy.metric,0)} kWh`:'—'],
    ['Validated inventions','0'],
   ].map(([label,value])=><div key={label} className="rounded-lg border border-slate-600/40 bg-black/20 p-3">
    <p className="text-[11px] text-slate-400">{label}</p>
    <p className="mt-1 text-lg font-bold text-slate-100">{value}</p>
   </div>)}
  </div>
  <div className="mt-5 grid gap-3 md:grid-cols-2">
   {['building','circuits','membrane','suit'].map(domain=>latest.has(domain)&&
    <SummaryCard key={domain} record={latest.get(domain)!}/>)}
  </div>
  <details className="mt-5 rounded-xl border border-white/10 p-4 text-sm text-slate-300">
   <summary className="cursor-pointer font-bold text-cyan-200">What can the system really discover?</summary>
   <div className="mt-3 space-y-3 text-xs leading-6 text-slate-300">
    <p>It explores numerically defined engineering questions without human input.
     Feasibility takes priority, then each domain applies its physical resource measure:
     lifecycle energy, robust delivered power, known phase limits or material and print cost.</p>
    <p>Results from one engine are sent to the other engines as typed hypotheses or unmet
     material requirements. The same configuration is not compared against a different
     environment. An unsupported material remains unsupported even if a toy simulation likes it.</p>
    <p>Reaction chemistry is blocked from autonomous yield claims until independent measured
     target and side-product data are available. No quantum materials, catalyst or
     isotope yield is inferred from entropy alone. Nor can a website infer what real device
     anyone needs without any boundary conditions: initial experiments use explicit,
     labelled reference problems rather than pretending they are yours.</p>
    <p>Runs on this browser only, in a bounded series, and pauses while the tab is hidden.
     Results persist on this device when local storage is available. No autonomous
     off-device activity or validated inventions are claimed.</p>
   </div>
  </details>
 </section>;
}
