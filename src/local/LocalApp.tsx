import { useCallback, useEffect, useRef, useState } from 'react';
import type { MatchReport } from './impedance';
import type { RouteSelectivityResult } from './selectivity';
import type { YieldCalibration } from './kinetics';
import {
  defaultCondition,extractDiscoveriesFromHistory,
  type MaterialReport,type OperatingCondition,type Medium,type Task,type Discovery,type Probe,
} from './cross_domain';
import {
  cloudConfig, configureCloud, connectCloud, isCloudConnected,
  loadDeviceResults, readCloud, saveDeviceResult, uploadCloud,
  type MemoryEntry,
} from './memory';

type Goal='building'|'circuits'|'chemistry'|'membrane';
type ChemistryResult=RouteSelectivityResult&{
 calibration:YieldCalibration|null;
 barrierScreen:null|{baseline:{targetFraction:number;sideFraction:number;eventProbability:number};
  bestHypothetical:{deltaTargetBarrierJMol:number;deltaSideBarrierJMol:number;
    prediction:{targetFraction:number;sideFraction:number}};
  contextValidated:boolean;limitation:string};
 calibrationStatus:string;discoveries:Discovery[];crossDomain:Probe[];
 priorDiscoveriesTested:number;caution:string;
};
type SharedResult={discoveries?:Discovery[];crossDomain?:Probe[];priorDiscoveriesTested?:number};
type BuildingResult={
  seed:number;location:string;areaM2:number;temperatureC:number;
  weather:{mode:string;stationName:string|null;weatherHours:number|null;note:string;stationDistanceKm:number|null};
  siteCandidates:number;jointCandidates:number;mechanicalCandidates:number;eligible:number;
  best:null|{form:string;floorAreaM2:number;orientationDeg:number;ventilation:string;
    heatRecoveryPercent:number;annualElectricityKWh:number;lifecycleKWh:number;
    manufacturedKWh:number;geometry:Array<Array<{x:number;y:number}>>;feasible:boolean};
  comparisonSupported:boolean;qualifiesAsImprovement:boolean;
  savingsVsBaselineKWh:number|null;explanation:string;limitations:string[];
};
type Result=BuildingResult|MatchReport|ChemistryResult|MaterialReport;
type WorkerMessage={id:number;kind:'progress'|'error'|'result';mode?:Goal;message?:string;error?:string;result?:Result};
const LOCALES:{[key:string]:string}={
  melbourne:'Melbourne, Victoria',bendigo:'Bendigo, Victoria',
  sydney:'Sydney, NSW',brisbane:'Brisbane, Queensland',
  darwin:'Darwin, NT',alice_springs:'Alice Springs, NT',hobart:'Hobart, Tasmania',
};
const fmt=(v:number|undefined|null,digits=0)=>v==null?'—':
  v.toLocaleString('en-AU',{maximumFractionDigits:digits});
const titleCase=(s:string)=>s.replaceAll('_',' ').replace(/\b\w/g,x=>x.toUpperCase());

function Plan({points}:{points:BuildingResult['best']}){
 if(!points?.geometry?.length)return null;
 const ps=points.geometry.flat();
 const xs=ps.map(p=>p.x),ys=ps.map(p=>p.y);
 if(!xs.every(Number.isFinite)||!ys.every(Number.isFinite))return null;
 const minX=Math.min(...xs),minY=Math.min(...ys),maxX=Math.max(...xs),maxY=Math.max(...ys);
 return <div className="rounded-2xl border border-slate-700/80 bg-[#091720] p-4">
  <div className="mb-3 flex items-center justify-between gap-3 text-xs text-cyan-200">
   <strong>Proposed footprint</strong><span className="text-slate-400">Schematic · not architectural drawings</span>
  </div>
  <svg role="img" aria-label="Computer-generated building plan footprint" className="h-52 w-full"
    viewBox={`${minX-1} ${minY-1} ${Math.max(1,maxX-minX)+2} ${Math.max(1,maxY-minY)+2}`}>
    <defs><pattern id="planGrid" width="1" height="1" patternUnits="userSpaceOnUse">
     <path d="M1 0 L0 0 0 1" fill="none" stroke="#173b4a" strokeWidth=".03"/></pattern></defs>
    <rect x={minX-1} y={minY-1} width={Math.max(1,maxX-minX)+2}
     height={Math.max(1,maxY-minY)+2} fill="url(#planGrid)"/>
    {points.geometry.map((polygon,i)=><polygon key={i}
     points={polygon.map(p=>`${p.x},${p.y}`).join(' ')} fill="#0c5665"
     stroke="#67e8f9" strokeWidth=".13"/>)}
  </svg>
  <p className="mt-2 text-xs text-slate-400">
   {fmt(points.floorAreaM2,1)} m² · facing {fmt(points.orientationDeg)}° · generated room surrogate
  </p>
 </div>;
}
function Metric({label,value,detail}:{label:string;value:string;detail?:string}){
 return <div className="min-w-0 rounded-xl border border-slate-700/50 bg-[#101e2a] p-4">
  <p className="text-xs text-slate-400">{label}</p>
  <p className="mt-1 break-words text-xl font-bold tracking-tight text-white">{value}</p>
  {detail&&<p className="mt-1 text-[11px] text-slate-500">{detail}</p>}
 </div>;
}

export default function LocalApp(){
 const [goal,setGoal]=useState<Goal>('building');
 const [preset,setPreset]=useState('melbourne');
 const [area,setArea]=useState(130);
 const [temperature,setTemperature]=useState(22);
 const [seed,setSeed]=useState(481516);
 const [frequency,setFrequency]=useState(100);
 const [source,setSource]=useState(50);
 const [load,setLoad]=useState(100);
 const [minimumAccepted,setMinimumAccepted]=useState(.5);
 const [medium,setMedium]=useState<Medium>('air');
 const [operatingK,setOperatingK]=useState(295);
 const [pressurePa,setPressurePa]=useState(101325);
 const [airflow,setAirflow]=useState(1);
 const [membraneTask,setMembraneTask]=useState<Task>('heat_spreader');
 const [knownYieldsCSV,setKnownYieldsCSV]=useState('');
 const [knownYieldsName,setKnownYieldsName]=useState('');
 const [reactionId,setReactionId]=useState('');
 const [durationS,setDurationS]=useState(3600);
 const [epwText,setEpwText]=useState('');
 const [epwName,setEpwName]=useState('');
 const [result,setResult]=useState<Result|null>(null);
 const [resultGoal,setResultGoal]=useState<Goal|null>(null);
 const [status,setStatus]=useState('Ready to optimise on this device.');
 const [working,setWorking]=useState(false);
 const [history,setHistory]=useState<MemoryEntry[]>(()=>loadDeviceResults());
 const [cloudUrl,setCloudUrl]=useState(()=>cloudConfig()?.url||'');
 const [cloudKey,setCloudKey]=useState(()=>cloudConfig()?.publishableKey||'');
 const [cloudStatus,setCloudStatus]=useState(isCloudConnected()?'Cloud session stored locally.':'Not connected; device memory only.');
 const [cloudOn,setCloudOn]=useState(isCloudConnected());
 const worker=useRef<Worker|null>(null);
 const requestId=useRef(0);
 const start=useCallback((mode:Goal,overrides?:{seed?:number})=>{
  worker.current?.terminate();
  const instance=new Worker(new URL('./compute.worker.ts',import.meta.url),{type:'module'});
  worker.current=instance;
  const id=++requestId.current;
  setWorking(true);setStatus('Starting a local calculation…');
  setResult(null);setResultGoal(null);
  const condition:OperatingCondition={medium,temperatureK:operatingK,pressurePa,flowSpeedMs:airflow};
  const prior=extractDiscoveriesFromHistory(loadDeviceResults(),24);
  const input:Record<string,string|number>=mode==='building'
   ?{preset,areaM2:area,seed:overrides?.seed??seed,targetTempC:temperature}
   :mode==='circuits'?{frequencyMHz:frequency,sourceOhms:source,loadOhms:load}
   :mode==='chemistry'?{minimumAcceptedFraction:minimumAccepted,
      reactionId,timeS:durationS,medium,temperatureK:operatingK}
   :{task:membraneTask,medium,temperatureK:operatingK,pressurePa};
  instance.onmessage=(e:MessageEvent<WorkerMessage>)=>{
   const m=e.data;
   if(m.id!==requestId.current)return;
   if(m.kind==='progress'){setStatus(m.message||'Evaluating candidates…');return;}
   setWorking(false);
   if(m.kind==='error'){setStatus(m.error||'Calculation failed.');return;}
   if(!m.result)return;
   const value=m.result;
   setResult(value);setResultGoal(mode);
   setStatus('Completed locally. No server performed this calculation.');
   const name=mode==='building'
    ?`${LOCALES[preset]||preset} · ${area} m² · seed ${overrides?.seed??seed}`
    :mode==='circuits'?`${frequency} MHz · ${source} → ${load} Ω`
     :mode==='membrane'?`${membraneTask} · ${medium} · ${operatingK} K`
     :'Measured-yield / hypothetical chemistry exploration';
   const entry:MemoryEntry={
    id:crypto.randomUUID(),mode,label:name,input,
    savedAt:new Date().toISOString(),result:value,
   };
   setHistory(saveDeviceResult(entry));
   if(cloudOn){void uploadCloud(entry).catch(err=>setCloudStatus(
    'Result saved on device, but cloud backup failed: '+(err instanceof Error?err.message:String(err))));}
  };
  instance.onerror=e=>{if(id!==requestId.current)return;setWorking(false);
   setStatus('Local worker error: '+(e.message||'Failed to load computation.'))};
  instance.postMessage({...input,id,mode,discoveries:prior,
    ...(mode==='building'&&epwText?{epwText}:{}),
    ...((mode==='chemistry'||mode==='membrane')?{condition}:{}),
    ...(mode==='chemistry'&&knownYieldsCSV?{knownYieldsCSV}:{}),
  });
 },[preset,area,temperature,seed,frequency,source,load,minimumAccepted,epwText,cloudOn,
   medium,operatingK,pressurePa,airflow,membraneTask,knownYieldsCSV,reactionId,durationS]);
 useEffect(()=>{start('building');return()=>worker.current?.terminate();},[]); // initial simulation only
 const reseed=()=>{const next=(seed+7919)%2147483647;setSeed(next);start('building',{seed:next});};
 const uploadFile=async(e:React.ChangeEvent<HTMLInputElement>)=>{
  const file=e.target.files?.[0];if(!file)return;
  if(file.size>5*1024*1024){setStatus('Choose an EPW under 5 MB.');return;}
  try{setEpwText(await file.text());setEpwName(file.name);setStatus('Weather file ready; run search to use it locally.');}
  catch{setStatus('Could not read weather file on this device.');}
 };
 const uploadKnownYields=async(e:React.ChangeEvent<HTMLInputElement>)=>{
  const file=e.target.files?.[0];if(!file)return;
  if(file.size>2_000_000){setStatus('Yield CSV must be under 2 MB.');return;}
  try{setKnownYieldsCSV(await file.text());setKnownYieldsName(file.name);
   setStatus('Measured-yield CSV loaded locally. Specify its reaction_id for calibration.');
  }catch{setStatus('Cannot read the measured yield CSV.');}
 };
 const setMediumDefaults=(next:Medium)=>{
  setMedium(next);const c=defaultCondition(next);
  setOperatingK(c.temperatureK);setPressurePa(c.pressurePa);setAirflow(c.flowSpeedMs);
 };
 const saveCloud=async()=>{
  setCloudStatus('Checking private project connection…');
  try{
   configureCloud(cloudUrl,cloudKey);const uid=await connectCloud();setCloudOn(true);
   setCloudStatus(`Connected to Supabase as ${uid.slice(0,8)}… with private RLS. Anonymous sign-in does not recover history on a different device.`);
   const rows=await readCloud();const current=loadDeviceResults();
   const map=new Map<string,MemoryEntry>();
   [...rows,...current].forEach(item=>map.set(item.id,item));
   // Materialise verified owner-scoped cloud history into device storage so
   // users retain their own reports even when offline on the next visit.
   const merged=[...map.values()].sort((a,b)=>b.savedAt.localeCompare(a.savedAt)).slice(0,32);
   for(const item of [...merged].reverse())saveDeviceResult(item);
   setHistory(loadDeviceResults());
   const newest=current[0];if(newest)await uploadCloud(newest);
  }catch(err){setCloudOn(false);setCloudStatus(err instanceof Error?err.message:String(err));}
 };
 const exportCurrent=()=>{
  if(!result)return;
  const blob=new Blob([JSON.stringify({mode:resultGoal,result},null,2)],{type:'application/json'});
  const href=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=href;a.download=`abovebound-${resultGoal||'result'}-${Date.now()}.json`;
  a.click();setTimeout(()=>URL.revokeObjectURL(href),30000);
 };
 const selectedBuilding=resultGoal==='building'?result as BuildingResult:null;
 const selectedCircuit=resultGoal==='circuits'?result as MatchReport:null;
 const selectedChem=resultGoal==='chemistry'?result as ChemistryResult:null;
 const selectedMembrane=resultGoal==='membrane'?result as MaterialReport:null;
 const findings=extractDiscoveriesFromHistory(history,24);
 const currentShared=(result||{}) as SharedResult;

 return <div className="min-h-screen bg-[#071016] text-slate-100 selection:bg-cyan-700">
  <header className="border-b border-white/10 px-4 py-4 md:px-8">
   <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
    <div><h1 className="text-xl font-black tracking-tight">AboveBound<span className="text-cyan-400">.</span></h1>
     <p className="text-xs text-slate-400">Local-first design laboratory</p></div>
    <div className="rounded-full border border-cyan-400/25 bg-cyan-500/10 px-3 py-2 text-[11px] font-medium text-cyan-200">
     Processing on your device
    </div>
   </div>
  </header>
  <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 md:px-8">
   <section className="rounded-3xl border border-cyan-500/20 bg-gradient-to-br from-[#102634] to-[#0c1721] p-6 md:p-10">
    <span className="text-[11px] font-bold uppercase tracking-[.24em] text-cyan-300">One page · automatic exploration</span>
    <h2 className="mt-3 max-w-4xl text-3xl font-black tracking-tight md:text-5xl">
     Describe the goal. Let your computer explore the configurations.
    </h2>
    <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300">
     Physics-informed screening for building designs and passive RF interfaces;
     a separate probability demonstration tests when eliminating unwanted pathways
     helps selectivity but hurts throughput. No remote calculation server.
    </p>
    <div className="mt-6 flex flex-wrap items-end gap-3">
     <label className="block w-full max-w-sm text-xs text-slate-300">
      What are we optimising?
      <select aria-label="Optimisation goal" value={goal}
       onChange={e=>{setGoal(e.target.value as Goal);setResult(null);setResultGoal(null)}}
       className="mt-2 w-full rounded-xl border border-slate-600 bg-[#0a1821] p-3 text-sm text-white">
       <option value="building">A building — solar, shape and ventilation</option>
       <option value="circuits">An electronic interface — passive impedance matching</option>
       <option value="chemistry">Chemistry — calibrated yields &amp; hypothetical barriers</option>
       <option value="membrane">Membranes — materials in water, air or vacuum</option>
      </select>
     </label>
     <p className="max-w-md text-xs leading-5 text-slate-400">The goal determines the applicable equations and constraints. Unrelated V8 prime patterns and graphical effects never adjust physical scores.</p>
    </div>
    {goal==='building'&&<div className="mt-6 grid gap-4 md:grid-cols-3">
     <label className="text-xs text-slate-300">Climate location
      <select value={preset} onChange={e=>setPreset(e.target.value)}
       className="mt-2 block w-full rounded-xl border border-slate-600 bg-[#0a1821] p-3 text-sm text-white">
       {Object.entries(LOCALES).map(([key,name])=><option key={key} value={key}>{name}</option>)}
      </select></label>
     <label className="text-xs text-slate-300">Home floor area (m²)
      <input type="number" min="35" max="500" step="5" value={area} onChange={e=>setArea(+e.target.value)}
       className="mt-2 block w-full rounded-xl border border-slate-600 bg-[#0a1821] p-3 text-sm text-white"/></label>
     <label className="text-xs text-slate-300">Indoor balance temperature (°C)
      <input type="number" min="16" max="28" step="1" value={temperature} onChange={e=>setTemperature(+e.target.value)}
       className="mt-2 block w-full rounded-xl border border-slate-600 bg-[#0a1821] p-3 text-sm text-white"/></label>
     <label className="col-span-full block max-w-xl text-xs text-slate-400">Optional EPW weather file — read by your device, not uploaded
      <input aria-label="Optional local EPW weather file" type="file" accept=".epw,text/plain" onChange={uploadFile}
       className="mt-2 block w-full text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-slate-700 file:px-3 file:py-2 file:text-white"/>
      {epwName&&<span className="mt-1 block text-cyan-300">{epwName} ready</span>}
     </label>
    </div>}
    {goal==='circuits'&&<div className="mt-6 grid gap-4 md:grid-cols-3">
     {([[frequency,setFrequency,'Frequency (MHz)',1,1000],
       [source,setSource,'Source resistance (Ω)',1,1000],
       [load,setLoad,'Load resistance (Ω)',1,1000]] as const).map(([v,set,label,min,max])=>
       <label key={label} className="text-xs text-slate-300">{label}
        <input type="number" min={min} max={max} value={v} onChange={e=>set(+e.target.value)}
         className="mt-2 block w-full rounded-xl border border-slate-600 bg-[#0a1821] p-3 text-sm text-white"/>
       </label>)}
     <p className="col-span-full text-xs text-amber-200">For passive, narrow-band RF interfaces only. Not a motherboard signal-integrity signoff or component datasheet.</p>
    </div>}
    {(goal==='chemistry'||goal==='membrane')&&<div className="mt-6 grid gap-3 md:grid-cols-4">
      <label className="text-xs text-slate-300">Medium
       <select aria-label="Operating medium" value={medium} onChange={e=>setMediumDefaults(e.target.value as Medium)}
        className="mt-2 block w-full rounded-xl border border-slate-600 bg-[#0a1821] p-3 text-white">
        <option value="air">Air</option><option value="water">Liquid water</option>
        <option value="vacuum">Vacuum</option></select></label>
      <label className="text-xs text-slate-300">Temperature (K)
       <input type="number" min="1" max="10000" value={operatingK} onChange={e=>setOperatingK(+e.target.value)}
        className="mt-2 block w-full rounded-xl border border-slate-600 bg-[#0a1821] p-3 text-white"/></label>
      <label className="text-xs text-slate-300">Pressure (Pa)
       <input type="number" min="0" value={pressurePa} onChange={e=>setPressurePa(+e.target.value)}
        className="mt-2 block w-full rounded-xl border border-slate-600 bg-[#0a1821] p-3 text-white"/></label>
      <label className="text-xs text-slate-300">Current speed (m/s)
       <input type="number" min="0" max="500" step=".5" value={airflow} onChange={e=>setAirflow(+e.target.value)}
        className="mt-2 block w-full rounded-xl border border-slate-600 bg-[#0a1821] p-3 text-white"/></label>
      <p className="col-span-full text-xs text-amber-200">No gas convection in a vacuum. Liquid water is not a meaningful medium at 5000 K; high-temperature material stability needs phase and corrosion evidence.</p>
     </div>}
     {goal==='membrane'&&<div className="mt-4 max-w-md">
      <label className="text-xs text-slate-300">Required membrane function
       <select value={membraneTask} onChange={e=>setMembraneTask(e.target.value as Task)}
        className="mt-2 block w-full rounded-xl border border-slate-600 bg-[#0a1821] p-3 text-white">
        <option value="heat_spreader">Spread heat by solid conduction</option>
        <option value="thermal_barrier">Block conductive heat flow</option>
        <option value="flow_membrane">Build a fluid-transfer channel</option></select>
      </label>
      <p className="mt-3 text-xs text-slate-400">A membrane specifies its needs; the chemistry/material search checks known candidate properties against operating conditions and returns an unmet requirement when none qualify. It cannot guarantee a new substance exists.</p>
     </div>}
     {goal==='chemistry'&&<div className="mt-6 max-w-md">
     <label className="text-xs text-slate-300">Minimum feed allowed through: {fmt(minimumAccepted*100)}%
      <input className="mt-3 w-full accent-cyan-400" type="range" min=".1" max="1" step=".05"
       value={minimumAccepted} onChange={e=>setMinimumAccepted(+e.target.value)}/>
     </label>
     <div className="mt-4 space-y-3 rounded-xl border border-white/10 p-3">
       <p className="text-xs text-slate-300">Calibrate a reaction against its measured target AND side-product yields. No fabricated literature records are shipped as observations.</p>
       <label className="block text-xs text-slate-300">Reaction ID in your data
        <input value={reactionId} onChange={e=>setReactionId(e.target.value)}
         placeholder="Unique reaction_id"
         className="mt-1 block w-full rounded-lg border border-slate-600 bg-[#0a1821] p-2 text-white"/></label>
       <label className="block text-xs text-slate-300">Reaction duration (seconds)
        <input type="number" min="0" max="1000000000" value={durationS} onChange={e=>setDurationS(+e.target.value)}
         className="mt-1 block w-full rounded-lg border border-slate-600 bg-[#0a1821] p-2 text-white"/></label>
       <label className="block text-xs text-slate-300">Measured yields CSV (stays on this device)
        <input type="file" accept=".csv,text/csv" onChange={uploadKnownYields}
         className="mt-2 block w-full text-xs file:mr-2 file:rounded-lg file:border-0 file:bg-slate-600 file:px-3 file:py-2"/>
        {knownYieldsName&&<span className="block text-cyan-200">{knownYieldsName} loaded</span>}</label>
       <p className="text-[11px] text-slate-400">Required CSV columns: id, reaction_id, environment, temperature_k, duration_s, target_fraction, side_fraction, source. At least eight observations, six distinct conditions and a real source reference are required.</p>
      </div>
      <p className="mt-2 text-xs text-amber-200">No imported observations = no calibrated chemical yields. Kinetic possibilities do not guarantee events within finite time; unknown catalysts or isotope effects cannot be inferred.</p>
    </div>}
    <div className="mt-6 flex flex-wrap items-center gap-3">
     <button onClick={()=>start(goal)} disabled={working}
      className="rounded-xl bg-cyan-400 px-5 py-3 text-sm font-black text-[#041019] hover:bg-cyan-300 disabled:cursor-wait disabled:opacity-40">
      {working?'Evaluating…':'Optimise on this device'}</button>
     {goal==='building'&&<button onClick={reseed} disabled={working}
      className="rounded-xl border border-cyan-400/40 px-5 py-3 text-sm font-bold text-cyan-200 disabled:opacity-40">
      Explore a different building</button>}
     <span role="status" className="max-w-md text-xs text-slate-400">{status}</span>
    </div>
   </section>

   <section aria-label="Optimisation result" className="rounded-3xl border border-white/10 bg-[#0a151e] p-6 md:p-8">
    <div className="flex flex-wrap items-center justify-between gap-3">
     <h3 className="text-2xl font-black tracking-tight">{working?'Finding a candidate…':result?'Your result':'Your result will appear here'}</h3>
     <button onClick={exportCurrent} disabled={!result}
      className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 disabled:opacity-30">Save detailed JSON</button>
    </div>
    {selectedBuilding&&<>
     <p className={`mt-4 rounded-xl border p-3 text-sm ${selectedBuilding.qualifiesAsImprovement?'border-emerald-700/50 bg-emerald-950/20 text-emerald-200':'border-amber-800/40 bg-amber-950/20 text-amber-200'}`}>
      {selectedBuilding.best
       ? selectedBuilding.qualifiesAsImprovement?'Promising screening improvement over the reference.':'Best tested passing candidate; no supported improvement claim.'
       :'No comparable design passed the screening constraints.'}
     </p>
     <p className="mt-3 text-sm leading-6 text-slate-300">{selectedBuilding.explanation}</p>
     {selectedBuilding.best&&<>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
       <div className="space-y-3">
        <h4 className="text-2xl font-black text-cyan-100">{titleCase(selectedBuilding.best.form)} home</h4>
        <p className="text-sm text-slate-300">{fmt(selectedBuilding.best.floorAreaM2,1)} m² · {titleCase(selectedBuilding.best.ventilation)} ventilation · {selectedBuilding.best.heatRecoveryPercent}% indicative heat recovery</p>
        <div className="grid grid-cols-2 gap-3">
         <Metric label="Estimated annual electricity" value={`${fmt(selectedBuilding.best.annualElectricityKWh)} kWh`}/>
         <Metric label="30-year modeled energy" value={`${fmt(selectedBuilding.best.lifecycleKWh)} kWh`}/>
         <Metric label="Footprints sampled" value={fmt(selectedBuilding.siteCandidates)}/>
         <Metric label="Mechanical cases checked" value={fmt(selectedBuilding.mechanicalCandidates)}/>
        </div>
       </div><Plan points={selectedBuilding.best}/>
      </div>
     </>}
     <p className="mt-4 text-xs text-slate-400">Weather basis: {selectedBuilding.weather.mode==='epw_hourly_temperature'
      ?`Locally uploaded ${selectedBuilding.weather.stationName} EPW dry-bulb (${fmt(selectedBuilding.weather.weatherHours)} hours)`
      :'Fitted degree-day climate preset; no observed station file'}.
      Heating/cooling balance point {selectedBuilding.temperatureC}°C. {selectedBuilding.weather.note}</p>
     <details className="mt-4 rounded-xl border border-white/10 p-3 text-sm">
      <summary className="cursor-pointer font-semibold text-slate-300">What was tested, and what is unverified?</summary>
      <p className="mt-3 text-xs text-slate-300">{selectedBuilding.jointCandidates} joint forms, {selectedBuilding.eligible} passing comparable-area combinations.</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-400">{selectedBuilding.limitations.map((x,i)=><li key={i}>{x}</li>)}</ul>
     </details>
    </>}
    {selectedCircuit&&<>
     <p className="mt-4 text-sm text-slate-300">Best illustrative E12 passive L-match at {fmt(selectedCircuit.requested.frequencyMHz)} MHz (with assumed component Q). Source {fmt(selectedCircuit.requested.sourceOhms)} Ω → load {fmt(selectedCircuit.requested.loadOhms)} Ω.</p>
     <p className={`mt-4 rounded-xl border p-3 text-sm ${selectedCircuit.recommended?'border-emerald-700/40 text-emerald-200':'border-amber-700/40 text-amber-200'}`}>{selectedCircuit.recommendationReason}</p>
     <h4 className="mt-4 text-xl font-black text-cyan-200">{selectedCircuit.recommended?'Suggested example network':'Lowest-loss explored network (not recommended)'}: {titleCase(selectedCircuit.best.topology)} · {selectedCircuit.best.series.label} series + {selectedCircuit.best.shunt.label} shunt</h4>
     <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
      <Metric label="Unmatched delivered power" value={`${fmt(selectedCircuit.baselineDeliveredPowerFraction*100,1)}%`}/>
      <Metric label="Matched delivered power" value={`${fmt(selectedCircuit.best.centerDeliveredPowerFraction*100,1)}%`}/>
      <Metric label="Worst tested band point" value={`${fmt(selectedCircuit.best.worstBandPowerFraction*100,1)}%`}/>
      <Metric label="Combinations searched" value={fmt(selectedCircuit.tested)}/>
     </div>
     <div className="mt-4 rounded-xl border border-cyan-700/30 bg-[#071f28] p-4 text-xs text-slate-300">
      <strong className="text-cyan-200">Example motherboard-like outer-layer microstrip (NOT a measured board)</strong>
      <p className="mt-2">A generic εr={fmt(selectedCircuit.microstripExample.dielectricConstant,1)} dielectric with {fmt(selectedCircuit.microstripExample.substrateHeightMm,2)} mm plane spacing would need about <strong className="text-white">{fmt(selectedCircuit.microstripExample.traceWidthMm,3)} mm</strong> track width for a calculated {fmt(selectedCircuit.microstripExample.targetOhms,1)} Ω single-ended line, about {fmt(selectedCircuit.microstripExample.propagationDelayPsPerMm,2)} ps/mm delay.</p>
      <p className="mt-2 text-amber-200">Actual motherboard stackups require manufacturer specs, controlled-impedance coupons, termination and S-parameter/IBIS validation. This example is a quasi-static microstrip only, not a recommendation for DDR/PCIe routing.</p>
     </div>
     <p className="mt-4 text-sm text-amber-200">Use an RF simulator, manufacturer models and impedance/VNA measurements before building real hardware. This simplified circuit model does not optimise a motherboard.</p>
     <details className="mt-3 text-xs text-slate-400"><summary className="cursor-pointer">Model assumptions</summary><ul className="mt-2 list-disc pl-5">{selectedCircuit.limitations.map((x,i)=><li key={i}>{x}</li>)}</ul></details>
    </>}
    {selectedMembrane&&<>
      <p className="mt-3 text-sm text-slate-300">{titleCase(selectedMembrane.task)} · {selectedMembrane.condition.medium} at {fmt(selectedMembrane.condition.temperatureK)} K and {fmt(selectedMembrane.condition.pressurePa,2)} Pa</p>
      {selectedMembrane.selected?<div className="mt-4">
       <h4 className="text-xl font-black text-cyan-200">Conditional candidate: {selectedMembrane.selected.label}</h4>
       <p className="mt-2 text-sm text-amber-200">{selectedMembrane.selected.reason}</p>
       <div className="mt-3 grid grid-cols-2 gap-3">
        <Metric label="Indicative thermal conductivity" value={`${fmt(selectedMembrane.selected.thermalConductivityWmK)} W/(m·K)`}/>
        <Metric label="Metal melt reference" value={`${fmt(selectedMembrane.selected.meltingPointK)} K`}/>
       </div>
      </div>:<div className="mt-4 rounded-xl border border-amber-700/40 bg-amber-950/20 p-4 text-sm text-amber-100">
       No known catalogue material passes the stated constraints. A new material needs independent physical measurements; the engine cannot invent a valid one.
      </div>}
      <div className="mt-3 rounded-lg border border-white/10 bg-black/25 p-3 text-xs text-slate-300">
       <strong>Environmental transport:</strong> {titleCase(selectedMembrane.environmentHeatTransfer.regime)}.
       Estimated heat flux for an assumed 15 K surface difference: {selectedMembrane.environmentHeatTransfer.heatFluxWm2===null?'Unsupported':
         `${fmt(selectedMembrane.environmentHeatTransfer.heatFluxWm2,1)} W/m²`}.
       <p className="mt-1 text-[11px] text-amber-200">{selectedMembrane.environmentHeatTransfer.method}</p>
      </div>
      <p className="mt-3 text-sm text-slate-400">Tested {selectedMembrane.totalCandidates} reference candidates; {selectedMembrane.passingCandidates} conditionally pass a thermal-only screen.</p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-amber-100">{selectedMembrane.unmetRequirements.map((x,i)=><li key={i}>{x}</li>)}</ul>
      <details className="mt-3 text-xs text-slate-400"><summary className="cursor-pointer">All tested materials and limits</summary>
       {selectedMembrane.alternatives.map(item=><p key={item.id} className="mt-2">{item.label}: {item.status} — {item.reason}</p>)}
       <ul className="mt-3 list-disc pl-5">{selectedMembrane.limitations.map((x,i)=><li key={i}>{x}</li>)}</ul>
      </details>
     </>}
     {selectedChem&&<>
     <p className="mt-4 text-sm text-slate-300">This filters hypothetical routes before processing. It does NOT change a reaction's underlying probabilities.</p>
     <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
      <Metric label="Before: target selectivity" value={`${fmt(selectedChem.baseline.selectivity*100,1)}%`}/>
      <Metric label="After: target selectivity" value={`${fmt(selectedChem.gate.selectivity*100,1)}%`}/>
      <Metric label="Target per ORIGINAL feed" value={`${fmt(selectedChem.gate.targetPerInput*100,1)}%`} detail={`Previously ${fmt(selectedChem.baseline.targetPerInput*100,1)}%`}/>
      <Metric label="Feed processed" value={`${fmt(selectedChem.gate.acceptedFraction*100,1)}%`}/>
     </div>
     <p className="mt-4 text-sm font-semibold text-amber-100">{selectedChem.insight}</p>
     <div className="mt-4 rounded-xl border border-white/15 bg-black/20 p-4">
       <h4 className="font-semibold text-cyan-100">Measured-yield calibration &amp; error</h4>
       <p className="mt-2 text-xs text-slate-300">{selectedChem.calibrationStatus}</p>
       {selectedChem.calibration&&<div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Train records" value={fmt(selectedChem.calibration.trainCount)}/>
        <Metric label="Held-out observations" value={fmt(selectedChem.calibration.holdoutCount)}/>
        <Metric label="Holdout MAE (percentage points)" value={fmt(selectedChem.calibration.holdoutMAE*100,2)}/>
        <Metric label="Constant-baseline MAE" value={fmt(selectedChem.calibration.holdoutBaselineMAE*100,2)}/>
       </div>}
       {selectedChem.barrierScreen&&<p className="mt-3 text-xs text-amber-200">
        An imaginary change to reaction barriers would predict {fmt(selectedChem.barrierScreen.bestHypothetical.prediction.targetFraction*100,1)}% target versus {fmt(selectedChem.barrierScreen.baseline.targetFraction*100,1)}% fitted baseline.
        No actual catalyst or membrane mechanism has been shown to produce this shift.
        {selectedChem.barrierScreen.contextValidated?' Temperature is within fitted bounds.':' Outside measured training temperatures: extrapolation unsupported.'}
       </p>}
       <p className="mt-2 text-xs text-amber-200">{selectedChem.caution}</p>
      </div>
      <p className="mt-3 text-xs text-slate-400">Selected allowed routes: {selectedChem.gate.allowed.join(', ')||'none'} · {selectedChem.candidatesTested} filters checked.</p>
     <details className="mt-3 text-xs text-slate-400"><summary className="cursor-pointer">Why this is not a chemistry yield prediction</summary><ul className="mt-2 list-disc pl-5">{selectedChem.limitations.map((x,i)=><li key={i}>{x}</li>)}</ul></details>
    </>}
    {result&&<details className="mt-5 rounded-xl border border-cyan-500/20 bg-[#0b2028] p-4">
       <summary className="cursor-pointer font-bold text-cyan-100">Cross-simulation discoveries · {currentShared.discoveries?.length||0} new / {currentShared.crossDomain?.length||0} checks</summary>
       <p className="mt-2 text-xs text-slate-300">Findings become typed hypotheses that other simulations can evaluate under their own physics and environmental constraints. Unsupported properties are never treated as measured advantages.</p>
       {currentShared.discoveries?.slice(0,10).map((d:Discovery)=><div key={d.id} className="mt-2 rounded-lg bg-black/25 p-2 text-xs text-slate-300"><strong className="text-cyan-200">{d.label}</strong> · {d.kind.replaceAll('_',' ')} · {d.evidence}</div>)}
       {currentShared.crossDomain?.slice(0,12).map((p:Probe,i)=><div key={i} className="mt-1 border-t border-slate-700/40 pt-1 text-[11px] text-slate-400">{titleCase(p.domain)}: {p.status} — {p.message}</div>)}
      </details>}
     {!result&&!working&&<p className="mt-3 text-sm text-slate-400">Choose a domain and run a sweep. Results are saved locally, even without an account.</p>}
   </section>

   <section className="rounded-2xl border border-white/10 bg-[#0b1720] p-5">
    <details>
     <summary className="cursor-pointer text-sm font-semibold text-cyan-100">Shared discovery memory · {findings.length} hypotheses / {history.length} local runs</summary>
     <p className="mt-3 text-xs text-slate-400">The most recent 32 calculations are stored on this browser. Results are yours: export them or optionally back up summaries to a Supabase project with owner-only RLS.</p>
     <div className="mt-3 space-y-1">{history.slice(0,10).map(item=>
      <button key={item.id} onClick={()=>{setGoal(item.mode);setResultGoal(item.mode);setResult(item.result as Result);setStatus('Restored stored result; no new calculation run.');}}
       className="flex w-full justify-between gap-4 rounded-lg border border-white/5 px-3 py-2 text-left text-xs text-slate-300 hover:border-cyan-500/40">
       <span>{item.label}</span><time className="shrink-0 text-slate-500">{new Date(item.savedAt).toLocaleDateString('en-AU')}</time>
      </button>)}</div>
     <details className="mt-5 rounded-xl border border-slate-700/70 bg-black/20 p-3">
      <summary className="cursor-pointer text-sm text-slate-300">Optional private Supabase backup</summary>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
       <label className="text-xs text-slate-300">Supabase project HTTPS URL
        <input value={cloudUrl} onChange={e=>setCloudUrl(e.target.value)} placeholder="https://project.supabase.co"
         className="mt-1 block w-full rounded-lg border border-slate-600 bg-[#0a1821] p-2 text-white"/></label>
       <label className="text-xs text-slate-300">Publishable key only (never a secret)
        <input value={cloudKey} onChange={e=>setCloudKey(e.target.value)} type="password" placeholder="sb_publishable_…"
         className="mt-1 block w-full rounded-lg border border-slate-600 bg-[#0a1821] p-2 text-white"/></label>
      </div>
      <p className="mt-2 text-xs text-slate-400">Install the included owner-only SQL schema first. Anonymous sign-in must be enabled in the chosen Supabase project. Anonymous accounts are not recoverable across devices after browser data is deleted.</p>
      <button onClick={saveCloud} className="mt-3 rounded-lg bg-cyan-800 px-3 py-2 text-xs text-white hover:bg-cyan-700">Connect private cloud memory</button>
      <p role="status" className="mt-2 text-xs text-slate-400">{cloudStatus}</p>
     </details>
    </details>
   </section>
   <footer className="pb-8 text-center text-xs leading-5 text-slate-500">
    Runs entirely on this device. Supabase only stores optional user-owned summaries.
    Calculations are preliminary, uncalibrated screens — not certified engineering, chemical reaction models or hardware specifications.
   </footer>
  </main>
 </div>;
}
