import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import BuildingProgress from './BuildingProgress';
import AutonomousDiscovery from './AutonomousDiscovery';
import EvidenceVisualizer from './EvidenceVisualizer';
import ResearchBoard from './ResearchBoard';
import {advanceSeed,addBuildingRun,buildingKey,loadCampaign,saveCampaign,weatherFingerprint,
 type BuildingCampaign,type BuildingRun} from './building_campaign';
import type { MatchReport } from './impedance';
import { panelSTL, type FabResult } from './fabrication';
import UnifiedOverlay, {type VisualGoal,type VisualMetrics} from './UnifiedOverlay';
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

type Goal=VisualGoal;
type ChemistryResult=RouteSelectivityResult&{
 calibration:YieldCalibration|null;
 barrierScreen:null|{baseline:{targetFraction:number;sideFraction:number;eventProbability:number};
  bestHypothetical:{deltaTargetBarrierJMol:number;deltaSideBarrierJMol:number;
    prediction:{targetFraction:number;sideFraction:number}};
  contextValidated:boolean;limitation:string};
 calibrationStatus:string;discoveries:Discovery[];crossDomain:Probe[];
 priorDiscoveriesTested:number;caution:string;
};
type SharedResult={discoveries?:Discovery[];crossDomain?:Probe[];priorDiscoveriesTested?:number;
 useCaseSweep?:{discoveriesTested:number;scenariosPerDiscovery:number;reports:Array<{
   discoveryId:string;label:string;probesPerformed:number;
   compatible:Probe[];rejected:number;unknown:number;note:string;
 }>};
 matchedMembraneNeeds?:Array<{needId:string;candidate:{label:string}|null;requirements:string[]}>;
};
type BuildingResult={
  seed:number;location:string;areaM2:number;temperatureC:number;
  weather:{mode:string;stationName:string|null;weatherHours:number|null;note:string;stationDistanceKm:number|null};
  siteCandidates:number;jointCandidates:number;mechanicalCandidates:number;eligible:number;
  best:null|{form:string;floorAreaM2:number;orientationDeg:number;ventilation:string;
    heatRecoveryPercent:number;annualElectricityKWh:number;lifecycleKWh:number;
    manufacturedKWh:number;geometry:Array<Array<{x:number;y:number}>>;feasible:boolean};
  comparisonSupported:boolean;qualifiesAsImprovement:boolean;
  savingsVsBaselineKWh:number|null;baselineLifecycleKWh?:number;
  scenarios?:Array<{form:string;areaM2:number;annualElectricalKWh:number;
   totalLifecycleKWh:number;airflowControl:string;heatRecoveryEfficiency:number;eligible:boolean}>;
  explanation:string;limitations:string[];
};
type Result=BuildingResult|MatchReport|ChemistryResult|MaterialReport|FabResult;
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

const PrintablePreview=lazy(()=>import('./PrintablePreview'));

export default function LocalApp(){
 const [goal,setGoal]=useState<Goal>('building');
 const [showPrintable3D,setShowPrintable3D]=useState(false);
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
 const [partWidthMm,setPartWidthMm]=useState(80);
 const [partLengthMm,setPartLengthMm]=useState(135);
 const [printerBedXmm,setPrinterBedXmm]=useState(220);
 const [printerBedYmm,setPrinterBedYmm]=useState(220);
 const [filamentCostAUDkg,setFilamentCostAUDkg]=useState(30);
 const [printBudgetAUD,setPrintBudgetAUD]=useState(12);
 const [minimumSectionIndexMm4,setMinimumSectionIndexMm4]=useState(90);
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
 const [campaign,setCampaign]=useState<BuildingCampaign>(()=>
  loadCampaign(buildingKey('melbourne',130,22,'preset'),481516));
 const [batch,setBatch]=useState({total:0,completed:0});
 const queueRef=useRef<number[]>([]);
 const busyRef=useRef(false);
 const startRef=useRef<(mode:Goal,overrides?:{seed?:number})=>void>(()=>{});
 const selectionRef=useRef({key:'',goal:'building' as Goal});
 const mountedKeyRef=useRef(false);
 const [cloudUrl,setCloudUrl]=useState(()=>cloudConfig()?.url||'');
 const [cloudKey,setCloudKey]=useState(()=>cloudConfig()?.publishableKey||'');
 const [cloudStatus,setCloudStatus]=useState(isCloudConnected()?'Cloud session stored locally.':'Not connected; device memory only.');
 const [cloudOn,setCloudOn]=useState(isCloudConnected());
 const worker=useRef<Worker|null>(null);
 const pauseAutonomyRef=useRef<()=>void>(()=>{});
 const requestId=useRef(0);
 const weatherId=useMemo(()=>weatherFingerprint(epwText),[epwText]);
 const searchKey=buildingKey(preset,area,temperature,weatherId);
 selectionRef.current={key:searchKey,goal};
 const start=useCallback((mode:Goal,overrides?:{seed?:number})=>{
  pauseAutonomyRef.current();
  worker.current?.terminate();
  const instance=new Worker(new URL('./compute.worker.ts',import.meta.url),{type:'module'});
  worker.current=instance;
  const id=++requestId.current;
  const runSeed=overrides?.seed??seed;
  const runKey=buildingKey(preset,area,temperature,weatherId);
  busyRef.current=true;
  setWorking(true);setStatus('Starting a local calculation…');
  // Keep the last completed result visible while the next search runs.
  const condition:OperatingCondition={medium,temperatureK:operatingK,pressurePa,flowSpeedMs:airflow};
  const prior=extractDiscoveriesFromHistory(loadDeviceResults(),24);
  const input:Record<string,string|number>=mode==='building'
   ?{preset,areaM2:area,seed:overrides?.seed??seed,targetTempC:temperature}
   :mode==='circuits'?{frequencyMHz:frequency,sourceOhms:source,loadOhms:load}
   :mode==='chemistry'?{minimumAcceptedFraction:minimumAccepted,
      reactionId,timeS:durationS,medium,temperatureK:operatingK}
   :mode==='suit'?{printGoal:'flight_suit_concept',
     partWidthMm,partLengthMm,printerBedXmm,printerBedYmm,
     budgetAUD:printBudgetAUD,filamentPriceAUDkg:filamentCostAUDkg,
     minSectionIndexMm4:minimumSectionIndexMm4,
     medium,temperatureK:operatingK,pressurePa}
   :{task:membraneTask,medium,temperatureK:operatingK,pressurePa};
  instance.onmessage=(e:MessageEvent<WorkerMessage>)=>{
   const m=e.data;
   if(m.id!==requestId.current)return;
   if(m.kind==='progress'){setStatus(m.message||'Evaluating candidates…');return;}
   busyRef.current=false;setWorking(false);
   if(m.kind==='error'){
    queueRef.current=[];setBatch({total:0,completed:0});
    setStatus(m.error||'Calculation failed.');return;
   }
   if(!m.result)return;
   const value=m.result;
   const stillSelected=selectionRef.current.goal===mode
    &&(mode!=='building'||selectionRef.current.key===runKey);
   if(mode==='building'){
    const updated=addBuildingRun(loadCampaign(runKey,runSeed),
     value as BuildingRun,runSeed,new Date().toISOString());
    saveCampaign(updated);
    if(stillSelected)setCampaign(updated);
   }
   if(stillSelected){
    setResult(value);setResultGoal(mode);
    setStatus('Trial complete. Results were screened on this device.');
   }
   const name=mode==='building'
    ?`${LOCALES[preset]||preset} · ${area} m² · seed ${overrides?.seed??seed}`
    :mode==='circuits'?`${frequency} MHz · ${source} → ${load} Ω`
     :mode==='membrane'?`${membraneTask} · ${medium} · ${operatingK} K`
     :mode==='suit'?`3D printable suit concept · ${partWidthMm}×${partLengthMm} mm`
     :'Measured-yield / hypothetical chemistry exploration';
   const entry:MemoryEntry={
    id:crypto.randomUUID(),mode,label:name,input,
    savedAt:new Date().toISOString(),result:value,
   };
   if(stillSelected){
    setHistory(saveDeviceResult(entry));
    if(cloudOn){void uploadCloud(entry).catch(err=>setCloudStatus(
     'Result saved on device, but cloud backup failed: '+(err instanceof Error?err.message:String(err))));}
   }
   if(mode==='building'&&stillSelected&&queueRef.current.length){
    setBatch(p=>({...p,completed:p.completed+1}));
    if(typeof document!=='undefined'&&!document.hidden){
     setTimeout(()=>{
      if(selectionRef.current.key===runKey&&selectionRef.current.goal==='building'
       &&!document.hidden&&!busyRef.current&&queueRef.current.length){
       const next=queueRef.current.shift()!;
       startRef.current('building',{seed:next});
      }else if(document.hidden)setStatus('Paused between designs while this tab is hidden.');
     },80);
    }else setStatus('Paused between designs while this tab is hidden.');
   }else if(mode==='building'){
    setBatch(p=>p.total?{...p,completed:Math.min(p.total,p.completed+1)}:p);
   }
  };
  instance.onerror=e=>{if(id!==requestId.current)return;busyRef.current=false;setWorking(false);
   queueRef.current=[];setBatch({total:0,completed:0});
   setStatus('Local worker error: '+(e.message||'Failed to load computation.'))};
  const savedDesign=mode==='building'
   ?loadCampaign(runKey,runSeed).best?.best?.design:null;
  instance.postMessage({...input,id,mode,discoveries:prior,
    ...(mode==='building'&&savedDesign?{learnedDesigns:[savedDesign]}:{}),
    ...(mode==='building'&&epwText?{epwText}:{}),
    ...((mode==='chemistry'||mode==='membrane'||mode==='suit')?{condition}:{}),
    ...(mode==='chemistry'&&knownYieldsCSV?{knownYieldsCSV}:{}),
  });
 },[preset,area,temperature,seed,frequency,source,load,minimumAccepted,epwText,weatherId,cloudOn,
   medium,operatingK,pressurePa,airflow,membraneTask,knownYieldsCSV,reactionId,durationS,
   partWidthMm,partLengthMm,printerBedXmm,printerBedYmm,filamentCostAUDkg,printBudgetAUD,minimumSectionIndexMm4]);
 startRef.current=start;
 // The autonomous discovery queue runs the first experiment; manual starts are optional.
 useEffect(()=>{return()=>{
  queueRef.current=[];requestId.current++;worker.current?.terminate();
 };},[]);
 useEffect(()=>{
  if(!mountedKeyRef.current){mountedKeyRef.current=true;return;}
  queueRef.current=[];setBatch({total:0,completed:0});
  setCampaign(loadCampaign(searchKey,seed));
  if(selectionRef.current.goal==='building'){
   worker.current?.terminate();requestId.current++;busyRef.current=false;setWorking(false);
   setResult(null);setResultGoal(null);
   setStatus('Design inputs changed. Run a new comparison for these conditions.');
  }
 },[searchKey]);
 useEffect(()=>{
  const onVisible=()=>{
   if(!document.hidden&&!busyRef.current&&queueRef.current.length
      &&selectionRef.current.goal==='building'){
    const next=queueRef.current.shift()!;
    startRef.current('building',{seed:next});
   }
  };
  document.addEventListener('visibilitychange',onVisible);
  return()=>document.removeEventListener('visibilitychange',onVisible);
 },[]);
 const stop=()=>{
  queueRef.current=[];requestId.current++;worker.current?.terminate();
  busyRef.current=false;
  setWorking(false);setBatch({total:0,completed:0});
  setStatus('Stopped. Your completed designs remain stored on this device.');
 };
 const continueBuilding=(count:number)=>{
  if(working||count<1||count>25)return;
  const seeds:number[]=[];let next=campaign.nextSeed;
  for(let i=0;i<count;i++){seeds.push(next);next=advanceSeed(next);}
  queueRef.current=seeds.slice(1);setBatch({total:count,completed:0});
  start('building',{seed:seeds[0]});
 };
 const reseed=()=>{const next=campaign.nextSeed;setSeed(next);start('building',{seed:next});};
 const runResearch=(next:Goal)=>{
  pauseAutonomyRef.current();
  stop();setGoal(next);setResult(null);setResultGoal(null);
  setStatus(`Checking ${next} constraints using this device…`);
  // React first changes the visible domain; the next task starts after paint
  // with the current controls and the new goal rather than stale state.
  setTimeout(()=>{if(selectionRef.current.goal===next){
   const input=next==='building'?{seed:loadCampaign(selectionRef.current.key,seed).nextSeed}:undefined;
   startRef.current(next,input);
  }},30);
 };
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
 const onAutoResult=(item:MemoryEntry)=>{
  setHistory(loadDeviceResults());
  setGoal(item.mode);setResult(item.result as Result);setResultGoal(item.mode);
  setWorking(false);
  setStatus('New autonomous experiment completed and saved on this device.');
  if(item.mode==='building')setCampaign(loadCampaign(
   buildingKey('melbourne',130,22,'preset'),481516));
 };
 const selectedBuilding=resultGoal==='building'?result as BuildingResult:null;
 const selectedCircuit=resultGoal==='circuits'?result as MatchReport:null;
 const selectedChem=resultGoal==='chemistry'?result as ChemistryResult:null;
 const selectedMembrane=resultGoal==='membrane'?result as MaterialReport:null;
 const selectedSuit=resultGoal==='suit'?result as FabResult:null;
 const findings=extractDiscoveriesFromHistory(history,24);
 const currentShared=(result||{}) as SharedResult;
 const operatingCondition:OperatingCondition={medium,temperatureK:operatingK,pressurePa,flowSpeedMs:airflow};
 const visualMetrics:VisualMetrics={
  headline:goal==='suit'?'Printable sci-fi suit concept, not flight hardware':
   goal==='membrane'?'Material needs meet environmental constraints':
   goal==='chemistry'?'Competing pathways, entropy and observed yields':
   goal==='circuits'?'Find compatible circuit impedances':
   'Joint site geometry and ventilation',
  subtitle:goal==='suit'
   ?'Automatically screen printable geometry and polymer against frame-section, budget, ambient temperature and print-bed constraints.'
   :'Discoveries from one simulation are checked by the others under their own physics and evidence rules.',
  feasibility:working?'no_result':goal==='suit'&&selectedSuit?(selectedSuit.selected?'conditional':'unsupported'):
   goal==='membrane'&&selectedMembrane?(selectedMembrane.selected?'conditional':'unsupported'):
   goal==='building'&&selectedBuilding?(selectedBuilding.best?'screened':'unsupported'):
   goal==='chemistry'&&selectedChem?(selectedChem.calibration?.gate==='passes_baseline'?'screened':'conditional'):
   goal==='circuits'&&selectedCircuit?(selectedCircuit.recommended?'conditional':'screened'):'no_result',
  tested:goal==='suit'?(selectedSuit?.candidatesEvaluated??0):
   goal==='membrane'?(selectedMembrane?.totalCandidates??0):
   goal==='building'?(selectedBuilding?.siteCandidates??0):
   goal==='chemistry'?(selectedChem?.candidatesTested??0):
   selectedCircuit?.tested??0,
  selected:goal==='suit'?(selectedSuit?.selected?.material||'No supported filament'):
   goal==='membrane'?(selectedMembrane?.selected?.label||'No supported reference'):
   goal==='building'?(selectedBuilding?.best?.form||'Not selected'):
   goal==='chemistry'?(selectedChem?.calibration?'Evidence-fit prototype':'Hypothesis only'):
   selectedCircuit?.best?.topology||'Not calculated',
  materialCostAUD:goal==='suit'?(selectedSuit?.selected?.estimatedTotalCostAUD??null):null,
  remaining:goal==='suit'?'No human-powered flight is inferred; these prints are decorative cosplay only.':
   'The display is a linked schematic, not an FEA, CFD, plasma or quantum field simulation.',
 };
 const saveSTL=()=>{
  if(!selectedSuit?.selected||!selectedSuit.selected.printable)return;
  const mesh=panelSTL(selectedSuit.selected);
  const url=URL.createObjectURL(new Blob([mesh],{type:'model/stl'}));
  const a=document.createElement('a');a.href=url;a.download='abovebound-sci-fi-decorative-panel-mm.stl';
  a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
 };

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
   <AutonomousDiscovery onResult={onAutoResult}
    onRegisterPause={pause=>{pauseAutonomyRef.current=pause;}}/>
   <section className="rounded-3xl border border-cyan-500/20 bg-gradient-to-br from-[#102634] to-[#0c1721] p-6 md:p-10">
    <span className="text-[11px] font-bold uppercase tracking-[.24em] text-cyan-300">Optional manual experiment editor</span>
    <h2 className="mt-2 max-w-4xl text-xl font-black tracking-tight md:text-2xl">
     The original simulation controls are still here.
    </h2>
    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
     Autonomous discovery runs without these fields. Only open this editor when
     you need to test a specific real-world condition or import measurement data.
    </p>
    <details className="mt-4 rounded-xl border border-white/10 bg-black/10 p-4"
      onToggle={event=>{if(event.currentTarget.open)pauseAutonomyRef.current();}}>
    <summary className="cursor-pointer text-sm font-bold text-cyan-200">Advanced: choose exact experimental inputs</summary>
    <div className="mt-6 flex flex-wrap items-end gap-3">
     <label className="block w-full max-w-sm text-xs text-slate-300">
      What are we optimising?
      <select aria-label="Optimisation goal" value={goal}
       onChange={e=>{stop();setGoal(e.target.value as Goal);setResult(null);setResultGoal(null)}}
       className="mt-2 w-full rounded-xl border border-slate-600 bg-[#0a1821] p-3 text-sm text-white">
       <option value="building">A building — solar, shape and ventilation</option>
       <option value="circuits">An electronic interface — passive impedance matching</option>
       <option value="chemistry">Chemistry — calibrated yields &amp; hypothetical barriers</option>
       <option value="membrane">Membranes — materials in water, air or vacuum</option>
       <option value="suit">Iron Man-inspired suits — printable costume parts</option>
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
    {(goal==='chemistry'||goal==='membrane'||goal==='suit')&&<div className="mt-6 grid gap-3 md:grid-cols-4">
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
     {goal==='suit'&&<div className="mt-5 grid gap-3 md:grid-cols-3">
      <label className="text-xs text-slate-300">Costume plate width (mm)
       <input type="number" min="30" max="400" value={partWidthMm}
        onChange={e=>setPartWidthMm(+e.target.value)}
        className="mt-2 block w-full rounded-xl border border-slate-600 bg-[#0a1821] p-3 text-white"/></label>
      <label className="text-xs text-slate-300">Plate length (mm)
       <input type="number" min="40" max="400" value={partLengthMm}
        onChange={e=>setPartLengthMm(+e.target.value)}
        className="mt-2 block w-full rounded-xl border border-slate-600 bg-[#0a1821] p-3 text-white"/></label>
      <label className="text-xs text-slate-300">Max budget (AUD)
       <input type="number" min="0" max="5000" step="1" value={printBudgetAUD}
        onChange={e=>setPrintBudgetAUD(+e.target.value)}
        className="mt-2 block w-full rounded-xl border border-slate-600 bg-[#0a1821] p-3 text-white"/></label>
      <details className="col-span-full rounded-xl border border-slate-700 p-3 text-xs text-slate-300">
       <summary className="cursor-pointer">Printer-bed size, filament price and minimum section</summary>
       <div className="mt-3 grid gap-3 md:grid-cols-4">
        {([
         ['Bed X (mm)',printerBedXmm,setPrinterBedXmm],
         ['Bed Y (mm)',printerBedYmm,setPrinterBedYmm],
         ['Filament (AUD/kg)',filamentCostAUDkg,setFilamentCostAUDkg],
         ['Min section proxy (mm⁴)',minimumSectionIndexMm4,setMinimumSectionIndexMm4],
        ] as const).map(([label,value,set])=>
         <label key={label}>{label}<input type="number" min="0" step="1" value={value}
          onChange={e=>set(+e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-600 bg-[#0a1821] p-2 text-white"/></label>)}
       </div>
       <p className="mt-2 text-amber-200">The thickness³ proxy is geometry only; NOT verified polymer strength or fatigue resistance. No flight hardware is designed here.</p>
      </details>
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
       <p className="text-[11px] text-slate-400">Required CSV: id, reaction_id, environment, temperature_k, duration_s, target_fraction, side_fraction, source. Optional batch_id and protocol_id enable stronger, batch-disjoint validation. Zero or missing side yield cannot be fitted without a detection-limit model. ≥8 observations and ≥6 distinct conditions required; no source labels are verified automatically.</p>
      </div>
      <p className="mt-2 text-xs text-amber-200">No imported observations = no calibrated chemical yields. Kinetic possibilities do not guarantee events within finite time; unknown catalysts or isotope effects cannot be inferred.</p>
    </div>}
    <div className="mt-6 flex flex-wrap items-center gap-3">
     <button onClick={()=>{queueRef.current=[];setBatch({total:0,completed:0});
       start(goal,goal==='building'?{seed:campaign.nextSeed}:undefined)}} disabled={working}
      className="rounded-xl bg-cyan-400 px-5 py-3 text-sm font-black text-[#041019] hover:bg-cyan-300 disabled:cursor-wait disabled:opacity-40">
      {working?'Evaluating…':goal==='building'?'Test another design':'Run this experiment'}</button>
     {goal==='building'&&<button onClick={reseed} disabled={working}
      className="rounded-xl border border-cyan-400/40 px-5 py-3 text-sm font-bold text-cyan-200 disabled:opacity-40">
      Explore a different building</button>}
     {working&&<button onClick={stop} className="rounded-xl border border-rose-400/30 px-4 py-3 text-xs font-bold text-rose-200">Stop</button>}
     <span role="status" aria-live="polite" className="max-w-md text-xs text-slate-300">{status}</span>
    </div>
    </details>
   </section>

   {goal==='building'&&<details className="rounded-2xl border border-white/10 bg-[#0b1720] p-4">
    <summary className="cursor-pointer text-sm font-semibold text-cyan-200">Detailed building campaign (optional)</summary>
    <div className="mt-4"><BuildingProgress campaign={campaign}
     current={selectedBuilding} running={working} batch={batch}
     onContinue={continueBuilding} onStop={stop}/></div>
   </details>}
   <section aria-label="Optimisation result" className="rounded-3xl border border-white/10 bg-[#0a151e] p-6 md:p-8">
    <div className="flex flex-wrap items-center justify-between gap-3">
     <h3 className="text-2xl font-black tracking-tight">{working?'Finding a candidate…':result?'Your result':'Your result will appear here'}</h3>
     <button onClick={exportCurrent} disabled={!result}
      className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 disabled:opacity-30">Save detailed JSON</button>
    </div>
    {selectedCircuit&&<EvidenceVisualizer circuit={selectedCircuit}/>}
    {selectedChem&&<EvidenceVisualizer chemistry={selectedChem}/>}
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
      <Metric label="Worst ±5% part corner" value={`${fmt(selectedCircuit.best.toleranceWorstPowerFraction*100,1)}%`} detail="Five band points × independent L/C deviations"/>
      <Metric label="Combinations searched" value={fmt(selectedCircuit.tested)}/>
     </div>
     <div className="mt-4 rounded-xl border border-cyan-700/30 bg-[#071f28] p-4 text-xs text-slate-300">
      <strong className="text-cyan-200">Example motherboard-like outer-layer microstrip (NOT a measured board)</strong>
      <p className="mt-2">A generic εr={fmt(selectedCircuit.microstripExample.dielectricConstant,1)} dielectric with {fmt(selectedCircuit.microstripExample.substrateHeightMm,2)} mm plane spacing would need about <strong className="text-white">{fmt(selectedCircuit.microstripExample.traceWidthMm,3)} mm</strong> track width for a calculated {fmt(selectedCircuit.microstripExample.targetOhms,1)} Ω single-ended line, about {fmt(selectedCircuit.microstripExample.propagationDelayPsPerMm,2)} ps/mm delay.</p>
      <p className="mt-2 text-amber-200">Actual motherboard stackups require manufacturer specs, controlled-impedance coupons, termination and S-parameter/IBIS validation. This example is a quasi-static microstrip only, not a recommendation for DDR/PCIe routing.</p>
     </div>
     <p className="mt-4 text-sm text-amber-200">Robustness is a discrete ±5% component sensitivity screen, not an independent validation. Use an RF simulator, manufacturer models and impedance/VNA measurements before building real hardware. This simplified circuit model does not optimise a motherboard.</p>
     <details className="mt-3 text-xs text-slate-400"><summary className="cursor-pointer">Model assumptions</summary><ul className="mt-2 list-disc pl-5">{selectedCircuit.limitations.map((x,i)=><li key={i}>{x}</li>)}</ul></details>
    </>}
    {selectedSuit&&<>
      <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-950/15 p-4">
       <h4 className="text-xl font-black text-rose-100">Iron Man-inspired suit design · real home-printing constraints</h4>
       <p className="mt-2 text-xs text-amber-200">{selectedSuit.flightAssessment}</p>
      </div>
      {selectedSuit.selected?<div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
       <Metric label="Lowest supported production cost estimate" value={`${fmt(selectedSuit.selected.estimatedTotalCostAUD,2)} AUD`}/>
       <Metric label="Solid decorative frame mass" value={`${fmt(selectedSuit.selected.massG,1)} g`}/>
       <Metric label="Less material than solid plaque" value={`${fmt(selectedSuit.selected.materialSavingPercent,1)}%`}/>
       <Metric label="Geometric frame-section proxy" value={`${fmt(selectedSuit.selected.sectionIndexMm4)} mm⁴`}/>
      </div>:<p className="mt-4 text-sm text-amber-200">
       No candidate satisfies the required budget, print-bed, illustrative thermal stability and minimum frame section together.
      </p>}
      {selectedSuit.selected&&<div className="mt-4">
       <button type="button" onClick={()=>setShowPrintable3D(v=>!v)}
        className="rounded-lg border border-cyan-400/50 px-4 py-2.5 text-sm font-bold text-cyan-100">
        {showPrintable3D?'Hide printable 3D inspection':'Inspect the actual printable part in 3D'}
       </button>
       {showPrintable3D&&<Suspense fallback={<p className="mt-3 text-xs text-slate-400">Preparing geometry viewer…</p>}>
        <PrintablePreview candidate={selectedSuit.selected}/>
       </Suspense>}
      </div>}
      {selectedSuit.selected&&<div className="mt-4 flex flex-wrap items-center gap-3">
       <strong className="text-cyan-200">{selectedSuit.selected.material} · {fmt(selectedSuit.selected.thicknessMm,1)} mm thick · {fmt(selectedSuit.selected.rimWidthMm,1)} mm rim</strong>
       <button onClick={saveSTL} className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-100">Download STL for slicer check (mm)</button>
       <span className="text-xs text-slate-400">Check the mesh and orientation in your own slicer; actual machine settings and fit are unverified.</span>
      </div>}
      <p className="mt-3 text-xs text-slate-400">{selectedSuit.candidatesEvaluated} material/frame candidates screened with default filament/waste and energy assumptions. One decorative panel only, not an entire costume production estimate.</p>
      <ul className="mt-3 list-disc pl-5 text-xs text-amber-200">{selectedSuit.missingConstraints.map((x,i)=><li key={i}>{x}</li>)}</ul>
      <details className="mt-3 rounded-xl border border-white/10 p-3 text-xs text-slate-400">
       <summary className="cursor-pointer">Cost assumptions, manufacturing and flight limitations</summary>
       <ul className="mt-2 list-disc pl-5">{selectedSuit.limitations.map((x,i)=><li key={i}>{x}</li>)}</ul>
      </details>
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
        <Metric label="Holdout target MAE (pp)" value={fmt(selectedChem.calibration.holdoutMAE*100,2)}/>
        <Metric label="Holdout side-product MAE (pp)" value={fmt(selectedChem.calibration.holdoutSideMAE*100,2)}/>
        <Metric label="Constant-baseline target MAE (pp)" value={fmt(selectedChem.calibration.holdoutBaselineMAE*100,2)}/>
       </div>}
       {selectedChem.calibration&&<p className="mt-3 text-xs text-amber-200">
        Validation type: {selectedChem.calibration.validationSplit.replaceAll('_',' ')}.
        {selectedChem.calibration.reusableAcrossRuns
          ?' May be reused provisionally for the same reaction, protocol, medium and fitted conditions.'
          :' No automatic learned rate transfer: independent batch evidence and a consistent reaction protocol are required.'}
        {selectedChem.calibration.warning}
       </p>}
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
       {currentShared.useCaseSweep&&<p className="mt-3 rounded-lg border border-white/10 p-2 text-xs text-slate-300">
        Searched {currentShared.useCaseSweep.scenariosPerDiscovery} environmental contexts for {currentShared.useCaseSweep.discoveriesTested} discoveries.
        {currentShared.useCaseSweep.reports.filter(x=>x.compatible.length>0).length} have at least one conditional use case; none are certified material solutions.
       </p>}
       {currentShared.matchedMembraneNeeds?.slice(0,4).map((need,i)=><div key={i} className="mt-2 text-xs text-slate-300">
        Chemistry rechecked stored membrane request: <strong>{need.candidate?.label||'no supported material'}</strong>.
        {need.requirements.join(' ')}
       </div>)}
       {currentShared.discoveries?.slice(0,10).map((d:Discovery)=><div key={d.id} className="mt-2 rounded-lg bg-black/25 p-2 text-xs text-slate-300"><strong className="text-cyan-200">{d.label}</strong> · {d.kind.replaceAll('_',' ')} · {d.evidence}</div>)}
       {currentShared.crossDomain?.slice(0,12).map((p:Probe,i)=><div key={i} className="mt-1 border-t border-slate-700/40 pt-1 text-[11px] text-slate-400">{titleCase(p.domain)}: {p.status} — {p.message}</div>)}
      </details>}
     {!result&&!working&&<p className="mt-3 text-sm text-slate-400">Choose a domain and run a sweep. Results are saved locally, even without an account.</p>}
   </section>

   <details className="rounded-2xl border border-white/10 bg-[#0b1720] p-5">
    <summary className="cursor-pointer text-sm font-bold text-cyan-100">
     Explore the connected simulations · illustrative system map
    </summary>
    <p className="mt-2 text-xs text-slate-400">A conceptual network, not a measured physical field. Select a node to switch to its own calculations.</p>
    <div className="mt-4">
     <UnifiedOverlay goal={goal} condition={operatingCondition} findings={findings}
      metrics={visualMetrics} budgetAUD={printBudgetAUD}
      frontier={selectedSuit?.alternatives.map(x=>({
       cost:x.estimatedTotalCostAUD,section:x.sectionIndexMm4,
       acceptable:x.printable,material:x.material,
      }))||[]}
      onSelectGoal={next=>{stop();setGoal(next);setResult(null);setResultGoal(null);
       setStatus('Select constraints, then run the calculation.');}}/>
    </div>
   </details>
   <details className="rounded-2xl border border-white/10 bg-[#0b1720] p-4">
    <summary className="cursor-pointer text-sm font-semibold text-cyan-200">Full research log and individual engine controls (optional)</summary>
    <div className="mt-4"><ResearchBoard history={history} findings={findings}
     working={working} active={goal} onRun={runResearch}/></div>
   </details>
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
