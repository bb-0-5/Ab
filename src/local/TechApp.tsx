import {lazy,Suspense,useCallback,useEffect,useMemo,useRef,useState} from 'react';
import TechnologyCanvas,{type TechMode} from './TechnologyCanvas';
import './tech.css';
import {saveSpiceNetlist} from './rf_spice';
import type {MatchReport} from './impedance';
import type {MaterialReport,Medium,OperatingCondition,Task,Discovery} from './cross_domain';
import {defaultCondition,extractDiscoveriesFromHistory} from './cross_domain';
import type {RouteSelectivityResult} from './selectivity';
import type {FabResult} from './fabrication';
import {panelSTL} from './fabrication';
import {buildingKey,loadCampaign,addBuildingRun,saveCampaign,type BuildingRun} from './building_campaign';
import {loadDeviceResults,saveDeviceResult,type MemoryEntry} from './memory';

const LegacyLab=lazy(()=>import('./LocalApp'));
const PrintablePreview=lazy(()=>import('./PrintablePreview'));
type Result=MatchReport|MaterialReport|RouteSelectivityResult|FabResult|BuildingRun;
type Message={id:number;kind:'result'|'progress'|'error';mode?:TechMode;result?:Result;message?:string;error?:string};
const MODES:{id:TechMode;index:string;short:string;name:string;caption:string}[]=[
 {id:'circuits',index:'01',short:'RF',name:'RF networks',caption:'Passive matching'},
 {id:'membrane',index:'02',short:'TH',name:'Thermal systems',caption:'Material selection'},
 {id:'chemistry',index:'03',short:'CH',name:'Process chemistry',caption:'Pathway selectivity'},
 {id:'building',index:'04',short:'EN',name:'Energy systems',caption:'Building / airflow'},
 {id:'suit',index:'05',short:'CAD',name:'Fabrication',caption:'3D printable parts'},
];
const TITLES:Record<TechMode,{eyebrow:string;title:string;description:string;warning:string}>={
 circuits:{
  eyebrow:'ELECTRONICS / RF DESIGN',
  title:'Build a better signal path.',
  description:'Calculate a passive L-network, inspect the selected topology, sweep real circuit equations and export a nominal SPICE model.',
  warning:'Lumped RF calculation, not a routed PCB or a measured impedance network.',
 },
 membrane:{
  eyebrow:'THERMAL / MATERIALS ENGINEERING',
  title:'Choose the material for the conditions.',
  description:'Screen reference metal properties and heat-transfer regimes, including why a candidate fails in vacuum or at high temperature.',
  warning:'Thermal-only reference screening, not a certified material or CFD solution.',
 },
 chemistry:{
  eyebrow:'CHEMISTRY / REACTION SELECTIVITY',
  title:'Separate useful product from waste.',
  description:'Search route gates with explicit original-feed mass balance. Bring measurements before claiming an actual yield gain.',
  warning:'Probability demonstration unless independent reaction-yield observations are supplied.',
 },
 building:{
  eyebrow:'ENERGY / COUPLED SYSTEMS',
  title:'Reduce energy without breaking constraints.',
  description:'Generate building geometry, couple airflow alternatives and retain the best feasible simulated candidate for comparable input conditions.',
  warning:'Parametric building screen, not a surveyed site, EnergyPlus or structural design.',
 },
 suit:{
  eyebrow:'CAD / ADDITIVE MANUFACTURING',
  title:'From constraints to a printable part.',
  description:'Screen real printer-bed geometry, material cost and thermal assumptions, then download the generated decorative STL mesh.',
  warning:'Decorative part only: no structural, protective, propulsion or flight qualification.',
 },
};
const fmt=(n:number|null|undefined,places=1)=>n==null||!Number.isFinite(n)?'—':n.toLocaleString('en-AU',{maximumFractionDigits:places});
type Inputs={frequency:number;source:number;load:number;location:string;area:number;indoorTemp:number;
 medium:Medium;temperatureK:number;pressurePa:number;flow:number;task:Task;minFeed:number;
 partWidth:number;partLength:number;budget:number};
function parameterKey(mode:TechMode,p:Inputs):string{
 if(mode==='circuits')return JSON.stringify([mode,p.frequency,p.source,p.load]);
 if(mode==='building')return JSON.stringify([mode,p.location,p.area,p.indoorTemp]);
 if(mode==='chemistry')return JSON.stringify([mode,p.medium,p.temperatureK,p.pressurePa,p.flow,p.minFeed]);
 if(mode==='membrane')return JSON.stringify([mode,p.medium,p.temperatureK,p.pressurePa,p.flow,p.task]);
 return JSON.stringify([mode,p.medium,p.temperatureK,p.pressurePa,p.flow,p.partWidth,p.partLength,p.budget]);
}
const asNum=(n:string)=>Number(n);
function Stat({tag,value,unit,detail}:{tag:string;value:string;unit?:string;detail?:string}){
 return <div className="tech-stat"><span className="tech-micro">{tag}</span>
  <div className="tech-stat-value">{value}<small>{unit||''}</small></div>
  {detail&&<span className="tech-stat-detail">{detail}</span>}</div>;
}
function Slider({title,value,min,max,step=1,onChange,unit}:{title:string;value:number;min:number;max:number;step?:number;unit:string;onChange:(v:number)=>void}){
 return <label className="tech-field">
  <span className="tech-field-head"><span>{title}</span><strong>{fmt(value,step<1?2:0)} {unit}</strong></span>
  <input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(asNum(e.target.value))}/>
  <span className="tech-field-bounds"><span>{min} {unit}</span><span>{max} {unit}</span></span>
 </label>;
}
function Numeric({title,value,min,max,step=1,onChange,unit}:{title:string;value:number;min:number;max:number;step?:number;unit:string;onChange:(v:number)=>void}){
 return <label className="tech-numeric"><span>{title}</span><div>
  <input type="number" value={value} min={min} max={max} step={step}
   onChange={e=>onChange(asNum(e.target.value))}/>
  <span>{unit}</span></div></label>;
}
function FrequencyPlot({report}:{report:MatchReport}){
 const p=report.frequencyResponse||[];if(p.length<2)return null;
 const min=p[0].frequencyMHz,max=p[p.length-1].frequencyMHz;
 const x=(v:number)=>48+520*(max===min?0:(v-min)/(max-min));
 const y=(v:number)=>166-Math.max(0,Math.min(1,v))*126;
 const path=p.map((v,i)=>`${i===0?'M':'L'}${x(v.frequencyMHz).toFixed(2)} ${y(v.deliveredPowerFraction).toFixed(2)}`).join(' ');
 return <div className="tech-graph">
  <div className="tech-section-heading"><div><span className="tech-micro">NETWORK ANALYSIS</span><h3>Frequency response</h3></div>
   <span className="tech-badge">21 SAMPLES</span></div>
  <svg viewBox="0 0 610 218" role="img" aria-label="Calculated nominal delivered power fraction across the selected RF frequency band" className="tech-plot-svg">
   {[0,.25,.5,.75,1].map(f=><g key={f}>
    <line x1="48" y1={y(f)} x2="574" y2={y(f)} stroke="#293b44" strokeDasharray="2 5"/>
    <text x="40" y={y(f)+4} textAnchor="end" fontSize="11" fill="#8b9eab">{Math.round(f*100)}%</text>
   </g>)}
   <line x1="48" x2="574" y1={y(report.baselineDeliveredPowerFraction)}
    y2={y(report.baselineDeliveredPowerFraction)} stroke="#d6a66b" strokeWidth="2" strokeDasharray="7 5"/>
   <path d={path} stroke="#8ce7d5" strokeWidth="3" fill="none" strokeLinejoin="round"/>
   <g fill="#9aadb7" fontSize="11"><text x="48" y="197">{fmt(min,2)} MHz</text>
    <text x="574" y="197" textAnchor="end">{fmt(max,2)} MHz</text></g>
  </svg>
  <div className="tech-legend"><span><i className="tech-legend-line green"/>Calculated network</span>
   <span><i className="tech-legend-line amber"/>Direct termination</span></div>
  <p className="tech-footnote">Delivered power ÷ available source power. Nominal parts, illustrative constant Q. Vertical axis starts at zero.</p>
 </div>;
}
function SectionResult({mode,data,onExport}:{mode:TechMode;data:Result|null;onExport:()=>void}){
 if(!data)return <div className="tech-placeholder"><div className="tech-placeholder-mark">◈</div>
  <strong>No design has been calculated.</strong><p>Choose realistic constraints and run the local solver to populate the engineering record.</p></div>;
 if(mode==='circuits'){
  const r=data as MatchReport;
  return <><FrequencyPlot report={r}/>
   <div className="tech-panel tech-result">
    <div className="tech-section-heading"><div><span className="tech-micro">SELECTED HARDWARE</span><h3>Nominal component selection</h3></div>
     <span className={`tech-badge ${r.recommended?'tech-badge-success':'tech-badge-warn'}`}>{r.recommended?'IMPROVED IN SCREEN':'NO PROVEN GAIN'}</span></div>
    <div className="tech-bom">
     <div><span>01 / SERIES</span><strong>{r.best.series.label}</strong><small>{r.best.series.type==='L'?'Inductor':'Capacitor'}</small></div>
     <div><span>02 / SHUNT</span><strong>{r.best.shunt.label}</strong><small>{r.best.shunt.type==='L'?'Inductor':'Capacitor'}</small></div>
     <div><span>03 / NETWORK</span><strong>{r.best.topology==='series_then_shunt'?'Series → shunt':'Shunt → series'}</strong><small>Two-element L topology</small></div>
    </div>
    <p className="tech-note">{r.recommendationReason}</p>
    <div className="tech-toolbar"><button className="tech-button tech-button-primary" onClick={onExport}>↓ Export SPICE netlist</button>
     <span className="tech-footnote">Modelled ESR at centre frequency; actual parasitics are unknown.</span></div>
   </div></>;
 }
 if(mode==='membrane'){
  const r=data as MaterialReport;
  return <div className="tech-panel tech-result">
   <div className="tech-section-heading"><div><span className="tech-micro">THERMAL SCREEN REPORT</span><h3>{r.selected?.label||'No qualifying reference material'}</h3></div>
    <span className={`tech-badge ${r.selected?'tech-badge-success':'tech-badge-warn'}`}>{r.passingCandidates} / {r.totalCandidates} PASSED</span></div>
   <div className="tech-metric-grid">
    <Stat tag="REFERENCE CONDUCTIVITY" value={fmt(r.selected?.thermalConductivityWmK)} unit="W/m·K"/>
    <Stat tag="REFERENCE MELT POINT" value={fmt(r.selected?.meltingPointK)} unit="K"/>
    <Stat tag="SCREENED HEAT FLUX" value={fmt(r.environmentHeatTransfer.heatFluxWm2)} unit="W/m²" detail="Assumed 15 K difference"/>
   </div>
   <p className="tech-note">{r.selected?.reason||r.unmetRequirements.join(' ')||'No supported candidate under these constraints.'}</p>
   <details><summary>All reference materials and model restrictions</summary>
    <div className="tech-details">{r.alternatives.map(x=><p key={x.id}><b>{x.label}:</b> {x.status} — {x.reason}</p>)}
    {r.limitations.map((x,i)=><p key={i}>{x}</p>)}</div></details>
  </div>;
 }
 if(mode==='chemistry'){
  const r=data as RouteSelectivityResult;
  return <div className="tech-panel tech-result">
   <div className="tech-section-heading"><div><span className="tech-micro">MASS BALANCE</span><h3>Same starting feed. Two route policies.</h3></div>
     <span className="tech-badge tech-badge-warn">HYPOTHETICAL</span></div>
   <div className="tech-metric-grid">
    <Stat tag="BASELINE TARGET / FEED" value={fmt(r.baseline.targetPerInput*100)} unit="%"/>
    <Stat tag="GATED TARGET / FEED" value={fmt(r.gate.targetPerInput*100)} unit="%"/>
    <Stat tag="SELECTIVITY AFTER GATE" value={fmt(r.gate.selectivity*100)} unit="%"/>
   </div>
   <p className="tech-note">{r.insight}</p>
   <p className="tech-footnote">Requires empirical reaction records to predict real yields. This illustrates route probabilities, not synthesis.</p>
  </div>;
 }
 if(mode==='building'){
  const r=data as BuildingRun;
  return <div className="tech-panel tech-result">
   <div className="tech-section-heading"><div><span className="tech-micro">COUPLED ENERGY ANALYSIS</span><h3>{r.best?.form.replaceAll('_',' ')||'No eligible design found'}</h3></div>
    <span className={`tech-badge ${r.best?'tech-badge-success':'tech-badge-warn'}`}>{r.eligible} PASSING CONFIGURATIONS</span></div>
   <div className="tech-metric-grid">
    <Stat tag="ANNUAL ELECTRICITY" value={fmt(r.best?.annualElectricityKWh,0)} unit="kWh"/>
    <Stat tag="30 YEAR MODELED" value={fmt(r.best?.lifecycleKWh,0)} unit="kWh"/>
    <Stat tag="GEOMETRY TRIALS" value={fmt(r.siteCandidates,0)}/>
    <Stat tag="HVAC CASES" value={fmt(r.mechanicalCandidates,0)}/>
   </div>
   <p className="tech-note">{r.explanation}</p>
   <p className="tech-footnote">Floor area, climate and surrogate layout assumptions affect the results. The depicted wall height is illustrative.</p>
  </div>;
 }
 const r=data as FabResult;
 return <div className="tech-panel tech-result">
  <div className="tech-section-heading"><div><span className="tech-micro">ADDITIVE MANUFACTURING SCREEN</span><h3>{r.selected?'Printable decorative frame':'No candidate passes constraints'}</h3></div>
    <span className={`tech-badge ${r.selected?'tech-badge-success':'tech-badge-warn'}`}>{r.candidatesEvaluated} CHECKED</span></div>
  <div className="tech-metric-grid">
   <Stat tag="PRINTABLE MATERIAL" value={r.selected?.material||'—'}/>
   <Stat tag="ESTIMATED COST" value={fmt(r.selected?.estimatedTotalCostAUD,2)} unit="AUD"/>
   <Stat tag="PART MASS" value={fmt(r.selected?.massG)} unit="g"/>
  </div>
  <p className="tech-note">{r.selected?'Geometry and cost passed illustrative filters; verify the STL in a slicer before printing.':r.missingConstraints.join(' ')}</p>
  <p className="tech-footnote">No human flight, personal protection or structural capacity is established.</p>
 </div>;
}
export default function TechApp(){
 const [legacy,setLegacy]=useState(false);
 const [mode,setMode]=useState<TechMode>('circuits');
 const [frequency,setFrequency]=useState(100);
 const [source,setSource]=useState(50);
 const [load,setLoad]=useState(100);
 const [location,setLocation]=useState('melbourne');
 const [area,setArea]=useState(130);
 const [indoorTemp,setIndoorTemp]=useState(22);
 const [medium,setMedium]=useState<Medium>('air');
 const [temperatureK,setTemperatureK]=useState(295);
 const [pressurePa,setPressurePa]=useState(101325);
 const [flow,setFlow]=useState(1);
 const [task,setTask]=useState<Task>('heat_spreader');
 const [minFeed,setMinFeed]=useState(.5);
 const [partWidth,setPartWidth]=useState(80);
 const [partLength,setPartLength]=useState(135);
 const [budget,setBudget]=useState(12);
 const [status,setStatus]=useState('Starting local solver.');
 const [busy,setBusy]=useState(false);
 const [current,setCurrent]=useState<{mode:TechMode;data:Result;parameters:string}|null>(null);
 const [history,setHistory]=useState<MemoryEntry[]>(()=>loadDeviceResults());
 const [showMesh,setShowMesh]=useState(false);
 const [showAdvanced,setShowAdvanced]=useState(false);
 const worker=useRef<Worker|null>(null);
 const seq=useRef(0);
 const modeRef=useRef<TechMode>('circuits');
 modeRef.current=mode;
 const key=buildingKey(location,area,indoorTemp,'preset');
 const [seed,setSeed]=useState(()=>loadCampaign(buildingKey('melbourne',130,22,'preset'),481516).nextSeed);
 const parameters=parameterKey(mode,{frequency,source,load,location,area,indoorTemp,medium,temperatureK,
  pressurePa,flow,task,minFeed,partWidth,partLength,budget});
 const parameterRef=useRef(parameters);parameterRef.current=parameters;
 const selected=current?.mode===mode&&current.parameters===parameters?current.data:null;
 const rf=mode==='circuits'?selected as MatchReport|null:null;
 const building=mode==='building'?selected as BuildingRun|null:null;
 const chemical=mode==='chemistry'?selected as RouteSelectivityResult|null:null;
 const material=mode==='membrane'?selected as MaterialReport|null:null;
 const fabricated=mode==='suit'?selected as FabResult|null:null;
 const selectedMode=MODES.find(d=>d.id===mode)!;
 const meta=TITLES[mode];
 const discoveries=useMemo(()=>extractDiscoveriesFromHistory(history,24),[history]);
 const start=useCallback((target:TechMode,seedOverride?:number)=>{
  worker.current?.terminate();const id=++seq.current;
  const parametersAtStart=parameterRef.current;
  setBusy(true);setStatus('Device worker → evaluating physical constraints…');
  setShowMesh(false);
  let condition:OperatingCondition={medium,temperatureK,pressurePa,flowSpeedMs:flow};
  const nextSeed=seedOverride??loadCampaign(buildingKey(location,area,indoorTemp,'preset'),seed).nextSeed;
  const input:Record<string,unknown>=target==='circuits'
   ?{frequencyMHz:frequency,sourceOhms:source,loadOhms:load}
   :target==='building'?{preset:location,areaM2:area,targetTempC:indoorTemp,seed:nextSeed}
   :target==='chemistry'?{minimumAcceptedFraction:minFeed,timeS:3600,condition}
   :target==='membrane'?{task,condition}
   :{printGoal:'decorative_panel',partWidthMm:partWidth,partLengthMm:partLength,
      printerBedXmm:220,printerBedYmm:220,budgetAUD:budget,filamentPriceAUDkg:30,
      minSectionIndexMm4:90,condition};
  try{
   const instance=new Worker(new URL('./compute.worker.ts',import.meta.url),{type:'module'});
   worker.current=instance;
   instance.onmessage=(event:MessageEvent<Message>)=>{
    const msg=event.data;if(msg.id!==seq.current)return;
    if(msg.kind==='progress'){setStatus(msg.message||'Checking configurations…');return;}
    setBusy(false);
    if(msg.kind==='error'){setStatus(msg.error||'Unable to calculate this configuration.');return;}
    if(!msg.result)return;
    const data=msg.result;
    if(target==='building'){
     const campaignKey=buildingKey(location,area,indoorTemp,'preset');
     const c=addBuildingRun(loadCampaign(campaignKey,nextSeed),data as BuildingRun,nextSeed,new Date().toISOString());
     saveCampaign(c);setSeed(c.nextSeed);
    }
    if(modeRef.current!==target)return;
    if(parameterRef.current===parametersAtStart){
     setCurrent({mode:target,data,parameters:parametersAtStart});
     setStatus('Completed locally · assumptions and uncertainties retained.');
    }else setStatus('Previous parameters completed. Run again to evaluate your edited inputs.');
    const name=target==='circuits'?`${frequency} MHz · ${source}→${load} Ω`
     :target==='building'?`${location}, ${area} m², seed ${nextSeed}`
     :target==='membrane'?`${task}, ${medium} ${temperatureK} K`
     :target==='suit'?`FDM frame ${partWidth}×${partLength} mm`:'Process selectivity screen';
    const entry:MemoryEntry={id:crypto.randomUUID(),savedAt:new Date().toISOString(),
     mode:target,label:name,input:input as Record<string,number|string>,result:data};
    setHistory(saveDeviceResult(entry));
   };
   instance.onerror=e=>{if(id!==seq.current)return;setBusy(false);setStatus(e.message||'Worker failed to load.');};
   instance.postMessage({...input,id,mode:target,discoveries:extractDiscoveriesFromHistory(loadDeviceResults(),24)});
  }catch(err){setBusy(false);setStatus(err instanceof Error?err.message:'Worker unavailable.');}
 },[medium,temperatureK,pressurePa,flow,frequency,source,load,location,area,indoorTemp,
  seed,minFeed,task,partWidth,partLength,budget]);
 useEffect(()=>{
  start('circuits');
  return()=>{seq.current++;worker.current?.terminate();};
 // The first default computation is intentional; later changes require RUN.
 },[]);
 const navigate=(next:TechMode)=>{
  worker.current?.terminate();seq.current++;setBusy(false);
  setMode(next);setCurrent(null);setShowMesh(false);setStatus('Parameters ready — run the selected solver.');
 };
 const chooseMedium=(next:Medium)=>{const p=defaultCondition(next);setMedium(next);
  setTemperatureK(p.temperatureK);setPressurePa(p.pressurePa);setFlow(p.flowSpeedMs);};
 const restoreSaved=(item:MemoryEntry)=>{
  worker.current?.terminate();seq.current++;setBusy(false);setShowMesh(false);
  const x=item.input as Record<string,any>;
  const condition=(x.condition||(item.result as any)?.condition||{}) as Partial<OperatingCondition>;
  const values:Inputs={frequency,source,load,location,area,indoorTemp,medium,temperatureK,pressurePa,
   flow,task,minFeed,partWidth,partLength,budget};
  if(item.mode==='circuits'){
   values.frequency=Number(x.frequencyMHz??frequency);
   values.source=Number(x.sourceOhms??source);
   values.load=Number(x.loadOhms??load);
   setFrequency(values.frequency);setSource(values.source);setLoad(values.load);
  }else if(item.mode==='building'){
   values.location=String(x.preset??location);
   values.area=Number(x.areaM2??area);
   values.indoorTemp=Number(x.targetTempC??indoorTemp);
   setLocation(values.location);setArea(values.area);setIndoorTemp(values.indoorTemp);
  }else{
   values.medium=condition.medium||String(x.medium||medium) as Medium;
   values.temperatureK=Number(condition.temperatureK??x.temperatureK??temperatureK);
   values.pressurePa=Number(condition.pressurePa??x.pressurePa??pressurePa);
   values.flow=Number(condition.flowSpeedMs??flow);
   setMedium(values.medium);setTemperatureK(values.temperatureK);
   setPressurePa(values.pressurePa);setFlow(values.flow);
   if(item.mode==='chemistry'){
    values.minFeed=Number(x.minimumAcceptedFraction??minFeed);
    setMinFeed(values.minFeed);
   }else if(item.mode==='membrane'){
    values.task=String(x.task||task) as Task;setTask(values.task);
   }else{
    values.partWidth=Number(x.partWidthMm??partWidth);
    values.partLength=Number(x.partLengthMm??partLength);
    values.budget=Number(x.budgetAUD??budget);
    setPartWidth(values.partWidth);setPartLength(values.partLength);setBudget(values.budget);
   }
  }
  setMode(item.mode);
  setCurrent({mode:item.mode,data:item.result as Result,parameters:parameterKey(item.mode,values)});
  setStatus('Loaded the recorded result and its original controls. No new simulation has run.');
 };
 const saveResultJSON=()=>{
  if(!selected)return;
  const blob=new Blob([JSON.stringify({mode,result:selected,exportedAt:new Date().toISOString()},null,2)],
   {type:'application/json'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');
  a.href=url;a.download=`abovebound-${mode}-${Date.now()}.json`;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
 };
 const saveSTL=()=>{
  if(!fabricated?.selected)return;
  const data=panelSTL(fabricated.selected);
  const url=URL.createObjectURL(new Blob([data],{type:'model/stl'}));
  const a=document.createElement('a');a.href=url;a.download='abovebound-decorative-frame-mm.stl';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
 };
 if(legacy)return <><div className="tech-legacy-return">
   <button className="tech-button tech-button-primary" onClick={()=>setLegacy(false)}>← Return to technology workspace</button>
  </div><Suspense fallback={<div className="tech-loading">Opening previous lab…</div>}><LegacyLab/></Suspense></>;
 const total=history.length;
 const stats=mode==='circuits'?
   [{tag:'DELIVERED POWER',value:rf?`${fmt(rf.best.centerDeliveredPowerFraction*100)}`:'—',unit:'%',detail:'At centre frequency'},
    {tag:'WORST PART CORNER',value:rf?`${fmt(rf.best.toleranceWorstPowerFraction*100)}`:'—',unit:'%',detail:'±5% nominal components'},
    {tag:'NETWORKS SCREENED',value:rf?fmt(rf.tested,0):'—',detail:'E12 passive candidates'}]
  :mode==='building'?
   [{tag:'30-YEAR ENERGY',value:fmt(building?.best?.lifecycleKWh,0),unit:'kWh'},
    {tag:'GEOMETRIES',value:fmt(building?.siteCandidates,0)},
    {tag:'MECHANICAL TRIALS',value:fmt(building?.mechanicalCandidates,0)}]
  :mode==='membrane'?
   [{tag:'CANDIDATES',value:fmt(material?.totalCandidates,0)},
    {tag:'CONSTRAINT PASS',value:fmt(material?.passingCandidates,0)},
    {tag:'REFERENCE K',value:fmt(material?.selected?.thermalConductivityWmK),unit:'W/m·K'}]
  :mode==='chemistry'?
   [{tag:'FEED UTILISATION',value:chemical?`${fmt(chemical.gate.acceptedFraction*100)}`:'—',unit:'%'},
    {tag:'TARGET / INPUT',value:chemical?`${fmt(chemical.gate.targetPerInput*100)}`:'—',unit:'%'},
    {tag:'GATES EVALUATED',value:fmt(chemical?.candidatesTested,0)}]
  :[{tag:'PRINTABLE CANDIDATES',value:fmt(fabricated?.candidatesEvaluated,0)},
    {tag:'PART MASS',value:fmt(fabricated?.selected?.massG),unit:'g'},
    {tag:'COST ESTIMATE',value:fmt(fabricated?.selected?.estimatedTotalCostAUD,2),unit:'AUD'}];
 return <div className="tech-app">
  <header className="tech-header">
   <div className="tech-brand">
    <div className="tech-brand-symbol">A<span>/</span>B</div>
    <div><strong>ABOVEBOUND</strong><span>ENGINEERING WORKSPACE</span></div>
   </div>
   <div className="tech-header-center">LOCAL DESIGN SYSTEM <span className="tech-signal">●</span> SIMULATION TOOLS</div>
   <button className="tech-text-button" onClick={()=>setLegacy(true)}>Open archive ↗</button>
  </header>
  <div className="tech-layout">
   <aside className="tech-sidebar">
    <span className="tech-micro tech-side-title">WORKSPACES <em>05</em></span>
    <nav className="tech-nav" aria-label="Engineering disciplines">
     {MODES.map(x=><button key={x.id} className={`tech-nav-item ${mode===x.id?'active':''}`}
      onClick={()=>navigate(x.id)} aria-current={mode===x.id?'page':undefined}>
      <span className="tech-nav-glyph">{x.short}</span>
      <span className="tech-nav-label"><strong>{x.name}</strong><small>{x.caption}</small></span>
      <span className="tech-nav-index">{x.index}</span>
     </button>)}
    </nav>
    <div className="tech-side-bottom">
     <div className="tech-mini-ledger">
      <span className="tech-micro">LOCAL RESEARCH</span>
      <strong>{total.toString().padStart(2,'0')} <small>records</small></strong>
      <p>{discoveries.length} typed hypotheses available for condition checks.</p>
     </div>
     <div className="tech-side-disclaimer">SIMULATIONS ON DEVICE<br/>NO CLOUD COMPUTE REQUIRED</div>
    </div>
   </aside>
   <main className="tech-main">
    <div className="tech-project-top"><span><b>PROJECT</b> / AB-001 / {selectedMode.index}</span>
     <span>{new Date().toLocaleDateString('en-AU',{day:'2-digit',month:'short',year:'numeric'}).toUpperCase()}</span></div>
    <div className="tech-intro"><div>
     <span className="tech-eyebrow"><i/> {meta.eyebrow}</span>
     <h1>{meta.title}</h1><p>{meta.description}</p></div>
     <div className="tech-run-id">DESIGN ID <strong>AB-{selectedMode.index}</strong><span>LOCAL • PROVISIONAL</span></div>
    </div>
    <div className="tech-content-grid">
     <div className="tech-center-column">
      <TechnologyCanvas mode={mode} working={busy} rf={rf} building={building}
       chemistry={chemical} membrane={material} suit={fabricated}/>
      <div className="tech-stat-grid">{stats.map(item=><Stat key={item.tag} {...item}/>)}</div>
      <div className="tech-progress-banner">
       <span className={`tech-live-indicator ${busy?'pulsing':''}`}/>
       <div><strong>{busy?'Simulation in progress':'Local solver'}</strong><span role="status" aria-live="polite">{status}</span></div>
       {busy&&<button className="tech-text-button" onClick={()=>{worker.current?.terminate();seq.current++;
        setBusy(false);setStatus('Run cancelled; previous results kept.');}}>Stop</button>}
      </div>
      <SectionResult mode={mode} data={selected} onExport={()=>rf&&saveSpiceNetlist(rf)}/>
      {mode==='suit'&&fabricated?.selected&&<div className="tech-panel tech-result">
       <div className="tech-section-heading"><div><span className="tech-micro">MANUFACTURABLE OUTPUT</span><h3>Inspect the actual mesh</h3></div>
        <span className="tech-badge">STL / MM</span></div>
       <div className="tech-toolbar"><button className="tech-button tech-button-primary" onClick={saveSTL}>↓ Download STL</button>
        <button className="tech-button" onClick={()=>setShowMesh(v=>!v)}>{showMesh?'Close mesh viewer':'View actual 3D mesh'}</button></div>
       {showMesh&&<Suspense fallback={<p className="tech-footnote">Loading mesh renderer…</p>}><PrintablePreview candidate={fabricated.selected}/></Suspense>}
      </div>}
      <div className="tech-bottom-note"><strong>ENGINEERING NOTE</strong><p>{meta.warning}</p></div>
     </div>
     <aside className="tech-inspector">
      <div className="tech-inspector-header"><div><span className="tech-micro">DESIGN PARAMETERS</span><h2>Configuration</h2></div><span className="tech-inspector-icon">⌘</span></div>
      <div className="tech-inputs">
       {mode==='circuits'&&<>
        <Slider title="Centre frequency" value={frequency} min={1} max={1000} onChange={setFrequency} unit="MHz"/>
        <Numeric title="Source resistance" value={source} min={1} max={1000} onChange={setSource} unit="Ω"/>
        <Numeric title="Load resistance" value={load} min={1} max={1000} onChange={setLoad} unit="Ω"/>
        <div className="tech-assumption-box"><span>SWEEP SPECIFICATION</span>
         <b>±15% frequency band</b><b>L Q = 40 · C Q = 80</b><b>E12 nominal values</b>
         <small>Candidate robustness: 5 frequency points × 9 independent ±5% part corners.</small></div>
       </>}
       {mode==='building'&&<>
        <label className="tech-numeric"><span>Climate region</span><select value={location} onChange={e=>{setLocation(e.target.value);setSeed(loadCampaign(buildingKey(e.target.value,area,indoorTemp,'preset'),481516).nextSeed)}}>
          {['melbourne','sydney','brisbane','hobart','darwin','bendigo'].map(x=><option value={x} key={x}>{x}</option>)}</select></label>
        <Numeric title="Floor area" value={area} min={35} max={500} onChange={v=>{setArea(v);setSeed(loadCampaign(buildingKey(location,v,indoorTemp,'preset'),481516).nextSeed)}} unit="m²"/>
        <Slider title="Indoor balance" value={indoorTemp} min={16} max={28} onChange={v=>{setIndoorTemp(v);setSeed(loadCampaign(buildingKey(location,area,v,'preset'),481516).nextSeed)}} unit="°C"/>
        <div className="tech-assumption-box"><span>SEARCH CAMPAIGN</span>
          <b>{loadCampaign(key,seed).attempts} prior seed trials</b>
          <small>Each run explores a new reproducible geometry seed. Best comparable candidate is stored on this device.</small></div>
       </>}
       {(mode==='membrane'||mode==='chemistry'||mode==='suit')&&<>
        <label className="tech-numeric"><span>Operating medium</span>
         <select value={medium} onChange={e=>chooseMedium(e.target.value as Medium)}>
          <option value="air">Air</option><option value="water">Liquid water</option><option value="vacuum">Vacuum</option>
         </select></label>
        <Numeric title="Temperature" value={temperatureK} min={1} max={10000} onChange={setTemperatureK} unit="K"/>
        <Numeric title="Pressure" value={pressurePa} min={0} max={1e9} onChange={setPressurePa} unit="Pa"/>
        {mode==='membrane'&&<>
         <label className="tech-numeric"><span>Required function</span><select value={task} onChange={e=>setTask(e.target.value as Task)}>
          <option value="heat_spreader">Spread heat</option><option value="thermal_barrier">Thermal barrier</option><option value="flow_membrane">Fluid transfer</option>
         </select></label>
         <Numeric title="Medium velocity" value={flow} min={0} max={500} step={.5} onChange={setFlow} unit="m/s"/>
        </>}
        {mode==='chemistry'&&<Slider title="Minimum feed accepted" value={minFeed*100} min={10} max={100} step={5}
         onChange={v=>setMinFeed(v/100)} unit="%"/>}
        {mode==='suit'&&<>
         <Numeric title="Panel width" value={partWidth} min={30} max={400} onChange={setPartWidth} unit="mm"/>
         <Numeric title="Panel length" value={partLength} min={40} max={400} onChange={setPartLength} unit="mm"/>
         <Numeric title="Max cost" value={budget} min={0} max={5000} onChange={setBudget} unit="AUD"/>
        </>}
       </>}
      </div>
      <div className="tech-inspector-actions">
       <button className="tech-button tech-button-primary tech-run" disabled={busy} onClick={()=>start(mode)}>
        <span>▶</span> {busy?'RUNNING SOLVER…':selected?'RUN AGAIN / OPTIMISE':'RUN SIMULATION'}</button>
       <button className="tech-button tech-button-outline" disabled={!selected} onClick={saveResultJSON}>↓ Save results (.json)</button>
      </div>
      <details className="tech-advanced" open={showAdvanced} onToggle={e=>setShowAdvanced((e.target as HTMLDetailsElement).open)}>
       <summary>How reliable is this output?</summary>
       <p>{meta.warning} The interface presents a model's actual outputs. Labels distinguish calculations, hypothetical inputs and unmeasured constraints.</p>
       <p>Compare candidates under identical parameters. For engineering decisions, confirm material datasheets, real dimensions, environmental conditions and independent bench measurements.</p>
      </details>
      <div className="tech-recent"><span className="tech-micro">RECENT LOCAL EXPERIMENTS</span>
       {history.length?history.slice(0,4).map(item=><button key={item.id}
        onClick={()=>restoreSaved(item)}>
        <span className="tech-history-dot"/><span>{item.label}</span><small>↗</small></button>)
        :<p className="tech-footnote">Previous calculations will appear here.</p>}
      </div>
     </aside>
    </div>
    <footer className="tech-footer"><span>ABOVEBOUND / PHYSICS-INFORMED DESIGN LAB</span>
     <span>Experimental models • Not engineering certification</span></footer>
   </main>
  </div>
 </div>;
}
