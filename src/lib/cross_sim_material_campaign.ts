/**
 * Original Sims' shared, bounded V12→V13→V9→V10→V6→V7 hypothesis ledger.
 * A V13 recipe is NOT a synthesized compound or validated constituent.
 * V9 uses its independent catalogue properties; numerical V6 observations
 * are confounded by evolving upstream topology and V7 parameter tuning.
 */
import type {V13MaterialRequirement,MaterialComposite} from '../simulations/v13_material';
import type {FlowMetrics} from '../simulations/v6';
import type {VoxelChannelEvidence} from './voxel_connectivity';
import type {VoxelConductionScreen} from './voxel_heat_conduction';

export type ElementTrialSpec={
 id:string;
 elements:ReadonlyArray<{z:number;symbol:string;massFraction:number}>;
};
const binaryPairs=[
 [[14,'Si'],[22,'Ti']],
 [[13,'Al'],[22,'Ti']],
 [[14,'Si'],[13,'Al']],
 [[22,'Ti'],[26,'Fe']],
 [[14,'Si'],[64,'Gd']],
 [[13,'Al'],[29,'Cu']],
] as const;
export const CANDIDATE_POOL:ReadonlyArray<ElementTrialSpec>=binaryPairs.flatMap((p,index)=>
 [0.25,0.50,0.75].map((ratio,j)=>({
  id:'elemental-'+index+'-'+j,
  elements:[
   {z:p[0][0],symbol:p[0][1],massFraction:ratio},
   {z:p[1][0],symbol:p[1][1],massFraction:1-ratio},
  ],
 })));
export type TrialRecord={
 id:string;
 context:string;
 workOrderId:string;
 chemistryId:string;
 source:'v12';
 latticeSeed:number;
 elementSymbols:[string,string];
 atomicSiteRatio:number;
 createdAt:number;
 v13EstimatedThermalConductivityWmK:number;
 v13EstimatedMeltingPointK:number;
 v9ReferenceConductivityWmK:number;
 v9ReferenceDensityKgM3:number;
 targetMaxConductivityWmK:number|null;
 targetMaxTemperatureK:number;
 v10:{connected:boolean;solidFraction:number;voidFraction:number;
       tortuosity:number|null;tpms?:string;frequency?:number;threshold?:number};
 /** Effective composite conductivity: V9 voxel property + V10 pore geometry
  * numerically re-screened by V6. NOT V13's bulk chemistry estimate. */
 coupledConduction?:{
  effectiveConductivityWmK:number;
  solidReferenceWmK:number;
  maxResidual:number;
  converged:boolean;
  thermalPriority:number;
  modeledTargetDeficit:number;
  relativeReduction:number;
  medium:'still_air'|'still_water';
  model:'harmonic_face_steady_conduction_only';
 };
 v6:{flow:number;resistance:number;efficiency:number;pathCount:number;
     bottlenecks:number}|null;
 v7:{score:number;acceptedTrials:number;rejectedTrials:number}|null;
 assessment:'geometry_blocked'|'modeled_flow_observed'|'awaiting_solver_evidence';
 evidence:'model_only_not_empirical';
 caveat:string;
};
export type TrialPending={
 spec:ElementTrialSpec;
 workOrder:V13MaterialRequirement;
 composite:MaterialComposite;
 seed:number;
 atomicSiteRatio:number;
 startedFrame:number;
 context:string;
};
const KEY='abovebound.inter-sim-material-campaign.v1';
const MAX=32;
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
/** Work-order-scoped systematic exploration, then exploit the best *modeled* trial.
 * A different operating need gets a different cohort. Never invent a chemistry yield.
 */
export function selectElementTrial(
 context:string,workOrder:V13MaterialRequirement,
 history:readonly TrialRecord[],
):ElementTrialSpec{
 if(!context||workOrder.source!=='v12')throw Error('Material trial requires V12 work order');
 const compatible=history.filter(r=>r.context===context&&r.workOrderId===workOrder.id);
 const counts=new Map<string,number>();
 for(const r of compatible)counts.set(r.chemistryId,(counts.get(r.chemistryId)||0)+1);
 const unseen=CANDIDATE_POOL.find(spec=>!counts.has(spec.id));
 // Once three different elemental recipes have numerical geometry evidence,
 // revisit the best paired recipe once every four trials. The remaining
 // rounds explore unseen chemistry; do NOT rank only V13 bulk guesses.
 const coupledWinner=compatible
  .filter(r=>r.coupledConduction&&r.v10.connected
    &&Number.isFinite(r.coupledConduction.thermalPriority))
  .sort((a,b)=>b.coupledConduction!.thermalPriority
    -a.coupledConduction!.thermalPriority)[0];
 if(unseen){
  if(compatible.length>=3&&compatible.length%4===3&&coupledWinner){
   return CANDIDATE_POOL.find(s=>s.id===coupledWinner.chemistryId)||unseen;
  }
  return unseen;
 }
 // If all families have been sampled, return to the best modeled family
 // occasionally while maintaining alternate configurations as controls.
 const best=compatible.filter(r=>r.v10.connected&&r.coupledConduction
   &&Number.isFinite(r.coupledConduction.thermalPriority))
  .map(r=>{
   const thermalDeficit=r.targetMaxConductivityWmK
     ?Math.max(0,r.v13EstimatedThermalConductivityWmK/r.targetMaxConductivityWmK-1):0;
   const meltDeficit=Math.max(0,r.targetMaxTemperatureK-r.v13EstimatedMeltingPointK)
     /Math.max(1,r.targetMaxTemperatureK);
   return {id:r.chemistryId,
     score:r.coupledConduction!.thermalPriority
       -Math.log1p(thermalDeficit)*0.02-meltDeficit*.1};
  }).sort((a,b)=>b.score-a.score)[0];
 const least=Math.min(...CANDIDATE_POOL.map(s=>counts.get(s.id)||0));
 const alternates=CANDIDATE_POOL.filter(s=>(counts.get(s.id)||0)===least);
 if(best&&compatible.length%4===0){
  return CANDIDATE_POOL.find(s=>s.id===best.id)||alternates[0];
 }
 return alternates[0]||CANDIDATE_POOL[0];
}
export function recordModeledTrial(
 pending:TrialPending,
 v9:{conductivity:number;density:number},
 channel:VoxelChannelEvidence,
 flow:FlowMetrics|null,
 v7:{score:number;acceptedTrials:number;rejectedTrials:number}|null,
 coupled?:{
  screen:VoxelConductionScreen;
  geometry:{tpms:string;frequency:number;threshold:number};
  rank:{
   priority:number;modeledTargetDeficit:number;
   relativeConductionReduction:number;modelOnly:true;
  };
 },
):TrialRecord{
 const c=pending.composite.properties;
 const n=channel.solidCount+channel.voidCount;
 const connected=channel.spanning.y&&n>0
   &&channel.solidCount/n>=.05&&channel.voidCount/n>=.05;
 if(!Number.isSafeInteger(pending.seed)||pending.seed<0||pending.seed>0xffffffff
  ||!finite(c.meltingPoint)||!finite(c.thermalConductivity)
  ||!finite(v9.conductivity)||!finite(v9.density)
  ||!finite(pending.atomicSiteRatio)||pending.atomicSiteRatio<=0
  ||pending.atomicSiteRatio>=1)
  throw Error('Invalid simulated inter-Sim candidate');
 const usableFlow=connected&&flow&&v7
  &&flow.pathCount>0&&finite(flow.efficiency)
  &&finite(v7.score);
 return {
  id:[pending.context,pending.workOrder.id,pending.spec.id,pending.seed].join(':'),
  context:pending.context,
  workOrderId:pending.workOrder.id,
  chemistryId:pending.spec.id,
  source:'v12',latticeSeed:pending.seed,
  elementSymbols:[
    pending.spec.elements[0].symbol,pending.spec.elements[1].symbol,
  ],
  atomicSiteRatio:pending.atomicSiteRatio,
  createdAt:Date.now(),
  v13EstimatedThermalConductivityWmK:c.thermalConductivity,
  v13EstimatedMeltingPointK:c.meltingPoint,
  v9ReferenceConductivityWmK:v9.conductivity,
  v9ReferenceDensityKgM3:v9.density,
  targetMaxConductivityWmK:pending.workOrder.maxThermalConductivityWmK??null,
  targetMaxTemperatureK:pending.workOrder.maxTemperatureK,
  v10:{connected,solidFraction:n?channel.solidCount/n:0,
    voidFraction:n?channel.voidCount/n:0,
    tortuosity:channel.shortestPathTortuosity.y,
    ...(coupled?{tpms:coupled.geometry.tpms,
      frequency:coupled.geometry.frequency,
      threshold:coupled.geometry.threshold}:{}),
  },
  ...(coupled?{coupledConduction:{
    effectiveConductivityWmK:coupled.screen.effectiveConductivityWmK,
    solidReferenceWmK:coupled.screen.allSolidReferenceWmK,
    maxResidual:coupled.screen.maxUpdate,
    converged:coupled.screen.converged,
    thermalPriority:coupled.rank.priority,
    modeledTargetDeficit:coupled.rank.modeledTargetDeficit,
    relativeReduction:coupled.rank.relativeConductionReduction,
    medium:coupled.screen.medium,model:coupled.screen.model,
  }}:{}),
  v6:usableFlow?{
    flow:flow!.totalFlow,resistance:flow!.avgResistance,
    efficiency:flow!.efficiency,pathCount:flow!.pathCount,
    bottlenecks:flow!.bottleneckCount,
  }:null,
  v7:usableFlow?{...v7!}:null,
  assessment:!connected?'geometry_blocked':
    usableFlow?'modeled_flow_observed':'awaiting_solver_evidence',
  evidence:'model_only_not_empirical',
  caveat:'V13 elemental-mixture properties are heuristic and NOT V9 constitutive inputs. V9 lattice uses independent reference values. V10 porosity + V6 stationary-air conduction are a limited numerical proxy, not convection/radiation, mechanical strength, chemistry, a measured U-value or synthesis yield. V7 uses modeled relative priority, not a controlled material measurement or experimental performance.',
 };
}
export function readMaterialTrials():TrialRecord[]{
 try{
  const raw=JSON.parse(localStorage.getItem(KEY)||'[]');
  return Array.isArray(raw)?raw.slice(0,MAX).filter((r:TrialRecord)=>
   r?.evidence==='model_only_not_empirical'&&typeof r.id==='string'
   &&typeof r.chemistryId==='string'
   &&finite(r?.v13EstimatedThermalConductivityWmK)
   &&finite(r?.v9ReferenceConductivityWmK)
  ):[];
 }catch{return [];}
}
export function saveMaterialTrial(row:TrialRecord):number{
 if(row.evidence!=='model_only_not_empirical'||!row.context
  ||!finite(row.v9ReferenceConductivityWmK)
  ||!finite(row.v13EstimatedThermalConductivityWmK))
  throw Error('Invalid material campaign evidence');
 const existing=readMaterialTrials().filter(x=>x.id!==row.id);
 try{localStorage.setItem(KEY,JSON.stringify([row,...existing].slice(0,MAX)));}catch{}
 return Math.min(MAX,existing.length+1);
}
