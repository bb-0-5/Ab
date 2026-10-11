/**
 * Machine-discovered requirements are generated from actual solver output,
 * NOT from a user-authored list. A requirement is either an executable
 * follow-up for an existing solver or an explicit evidence gap. Unsupported
 * physics never becomes a free parameter that a search can magically solve.
 */
import type {Discovery,OperatingCondition,Task} from './cross_domain';
import {checkCondition} from './cross_domain';
import type {AutoExperiment,AutoObservation,AutoMode} from './autonomy';
import type {BuildingRun} from './building_campaign';
import type {MaterialReport} from './cross_domain';
import type {MatchReport} from './impedance';
import type {FabResult} from './fabrication';

export type NeedState='pending'|'screened'|'blocked';
export interface ResearchNeed {
 id:string;originIndex:number;originMode:AutoMode;originBenchmark:string;
 title:string;reason:string;requiredEvidence:string;
 target:'membrane'|'external_evidence';status:NeedState;
 request?:{mode:'membrane';task:Task;condition:OperatingCondition};
 benchmark?:string;
 followUpIndex?:number;followUp?:string;
}
export const materialBenchmark=(task:Task,c:OperatingCondition)=>
 `membrane:${task}:${c.medium}:${c.temperatureK}K:${c.pressurePa}Pa:${c.flowSpeedMs}`;
const safe=(x:unknown,max=500)=>String(x??'').replace(/[<>]/g,'').slice(0,max);
const evidenceGap=(job:AutoExperiment,key:string,title:string,reason:string,requiredEvidence:string):ResearchNeed=>({
 id:`evidence:${job.benchmark}:${key}`,
 originIndex:job.index,originMode:job.mode,originBenchmark:job.benchmark,
 title,reason,requiredEvidence,target:'external_evidence',status:'blocked',
});
const sortByStatus=(a:ResearchNeed,b:ResearchNeed)=>(
 a.status==='pending'? -1:b.status==='pending'?1:0
)||b.originIndex-a.originIndex;

/** Only accept typed need objects with compatible physical environments. */
export function extractMachineNeeds(job:AutoExperiment,result:unknown):ResearchNeed[]{
 const needs:ResearchNeed[]=[];
 if(job.mode==='building'){
  const building=result as BuildingRun & {discoveries?:Discovery[]};
  const requests=Array.isArray(building.discoveries)?building.discoveries:[];
  for(const d of requests){
   if(d?.kind!=='membrane_need'||!d.task||!d.condition||checkCondition(d.condition))continue;
   const benchmark=materialBenchmark(d.task,d.condition);
   const prop=d.requiredProperties;
   const constraint=prop?
    `Reference melt ≥${Math.round(prop.minimumReferenceMeltingPointK)} K; `+
    `conductivity bounds ${prop.minimumThermalConductivityWmK??'unbounded'}..${prop.maximumThermalConductivityWmK??'unbounded'} W/(m·K).`:
    'A traceable material property envelope and conditions.';
   needs.push({
    id:`followup:${job.benchmark}:${benchmark}`,
    originIndex:job.index,originMode:job.mode,originBenchmark:job.benchmark,
    title:'Building heat-flow requirement → material screen',
    reason:'The energy solver reported an insulating/thermal material requirement. Check that exact medium and temperature with the reference materials engine; a positive catalogue screen is NOT a verified wall assembly.',
    requiredEvidence:constraint,
    target:'membrane',status:'pending',benchmark,
    request:{mode:'membrane',task:d.task,condition:d.condition},
   });
  }
  if(!building.best){
   needs.push(evidenceGap(job,'building-site','Building feasibility unresolved',
    'No equivalent-area geometry and mechanical combination passed the model.',
    'Inspect building and airflow screening failures; obtain actual site, weather and assembly constraints.'));
  }
 }else if(job.mode==='membrane'){
  const material=result as MaterialReport;
  if(!material.selected){
   needs.push(evidenceGap(job,'new-material-property','Missing material with supported properties',
    safe(material.unmetRequirements?.join(' ')),
    'Independent temperature-dependent phase, conductivity and mechanical/chemical compatibility data or a broader traceable materials dataset. Re-running the same catalogue changes nothing.'));
  }else{
   needs.push(evidenceGap(job,'verify-material','Promising material requires physical qualification',
    safe(material.selected.reason),
    'Constitutive law at the actual temperature and medium; thermal cycling, oxidation/corrosion, geometry and measured heat transfer. A reference-screen pass is not a working membrane.'));
  }
 }else if(job.mode==='circuits'){
  const circuit=result as MatchReport;
  needs.push(evidenceGap(job,'rf-physical-validation','Verify modelled RF network on actual hardware',
   circuit.recommended?'Lumped model predicts more delivered power under screening tolerances.':'Direct connection is not beaten by the screened nominal components.',
   'Manufacturer L/C package values, ESR/SRF, actual stackup and reference-plane layout; SPICE and measured VNA S-parameters.'));
 }else if(job.mode==='suit'){
  const fdm=result as FabResult;
  needs.push(evidenceGap(job,'slicer-validation','Validate printable geometry with a real manufacturing process',
   fdm.selected?'A decorative frame passes modelled print-bed and cost constraints.':safe(fdm.missingConstraints?.join(' ')),
   'Actual slicer settings, vendor filament properties, printer calibration, fit and test print.'));
 }
 return needs.slice(0,8);
}
const LIMIT=48;
export function updateNeeds(
 previous:readonly ResearchNeed[],job:AutoExperiment,observation:AutoObservation,result?:unknown,
):ResearchNeed[]{
 const incoming=result===undefined?[]:extractMachineNeeds(job,result);
 const done=previous.map(need=>{
  if(job.originNeedId!==need.id||need.status!=='pending')return need;
  return {...need,status:observation.grade==='conditional'||observation.grade==='feasible'?
   'screened' as const:'blocked' as const,
   followUpIndex:job.index,followUp:safe(observation.summary,420)};
 });
 const seen=new Set(done.map(n=>n.id));
 for(const need of incoming)if(!seen.has(need.id)){seen.add(need.id);done.push(need);}
 return done.sort(sortByStatus).slice(0,LIMIT);
}
export function nextUnscreenedNeed(needs:readonly ResearchNeed[]):ResearchNeed|null{
 return needs.filter(n=>n.status==='pending'&&n.target==='membrane'&&n.request)
  .sort((a,b)=>a.originIndex-b.originIndex)[0]||null;
}
export function needsSummary(needs:readonly ResearchNeed[]){
 return {pending:needs.filter(n=>n.status==='pending').length,
  screened:needs.filter(n=>n.status==='screened').length,
  blocked:needs.filter(n=>n.status==='blocked').length};
}
