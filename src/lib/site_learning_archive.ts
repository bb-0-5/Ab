/**
 * Bounded experiment memory for the ORIGINAL V12 site/flow simulator.
 *
 * Only geometries and simulated evidence are retained. A new experiment
 * ALWAYS recomputes performance and hard constraints with its current model.
 * The archive never supplies a score, compliance result, material property,
 * or weather provenance to the solver.
 */
import type {
  SiteGeometryOptimizationInput, SiteGeometryOptimizationResult,
  SiteHouseDesign, EvaluatedSiteHouseDesign, HouseForm,
} from './site_geometry_optimizer';

const KEY='abovebound.v12.site-experiments.v1';
const MAX_CONTEXTS=8;
const MAX_DESIGNS_PER_FORM=3;
const MAX_DESIGNS=12;
const VERSION='site-preset-dd-physics-1';

/** All solver-relevant user inputs, EXCLUDING search seed, budget, and fake provenance. */
const KEYS=[
 'location','requirements','targetFloorAreaM2','minFloorAreaM2','maxFloorAreaM2',
 'lotWidthM','lotDepthM','targetIndoorTempC','wallRValue','roofRValue',
 'floorRValue','windowUValue','windowSHGC','airLeakageACH','heatingCOP',
 'coolingCOP','lifecycleYears','baseline',
] as const;
const LOCATION_KEYS=[
 'latitudeDeg','longitudeDeg','averageDailySolarMJm2','summerDesignTempC',
 'winterDesignTempC','heatingDegreeDays','coolingDegreeDays',
] as const;
const REQUIREMENT_KEYS=[
 'designWindSpeedMs','floodFloorElevationM','bushfireAttackLevel',
 'seismicClass','snowLoadKPa','minWallRValue','maxWindowToWallRatio',
 'minRoofPitchDeg','maxRoofPitchDeg','maxUnsupportedSpanM','minimumSetbackM',
] as const;

type JSONValue=string|number|boolean|null|JSONValue[]|{[key:string]:JSONValue};
const pick=(source:unknown,keys:readonly string[]):Record<string,JSONValue>=>{
  if(!source||typeof source!=='object'||Array.isArray(source))return {};
  const record=source as Record<string,unknown>;
  const result:Record<string,JSONValue>={};
  for(const key of keys){
    const value=record[key];
    if(typeof value==='number'&&Number.isFinite(value))result[key]=value;
    else if(typeof value==='string'&&value.length<150)result[key]=value;
    else if(typeof value==='boolean')result[key]=value;
  }
  return result;
};

/**
 * Exact benchmark equality for inputs presented to the browser solver.
 * The untrusted hourly/station arrays are explicitly excluded because
 * the static worker discards them and labels its degree-day fallback.
 * The name of a city is not physics; its numeric climate conditions are.
 * Missing vs supplied values remain distinct (conservative non-reuse).
 */
export function siteExperimentKey(input:SiteGeometryOptimizationInput):string{
  const values:Record<string,JSONValue>={};
  const record=input as Record<string,unknown>;
  for(const key of KEYS){
    if(key==='location')values.location=pick(record.location,LOCATION_KEYS);
    else if(key==='requirements')values.requirements=pick(record.requirements,REQUIREMENT_KEYS);
    else if(key==='baseline'){
      // Explicit user baseline influences both comparison and search.
      const value=pick(record.baseline,[
        'form','orientationDeg','floorAreaM2','widthM','depthM','ceilingHeightM',
        'wingRatio','eaveEquatorM','eaveOtherM','roofPitchDeg',
        'equatorGlazingRatio','otherGlazingRatio','floorElevationM',
        'structuralSystem','resilientShell',
      ]);
      values.baseline=value;
    }else {
      const value=record[key];
      if(typeof value==='number'&&Number.isFinite(value))values[key]=value;
    }
  }
  return JSON.stringify({version:VERSION,physics:values,
    climate:'local_preset_degree_days_unverified'});
}
interface ArchivedDesign {
  design:SiteHouseDesign;
  /** Historical modeled ranking ONLY. Re-evaluate before use. */
  modeledLifecycleKWh:number;
  sourceSeed:number;
  evidence:'simulated_not_measured';
}
interface Campaign {
  key:string;
  updatedAt:number;
  attempted:number;
  designs:ArchivedDesign[];
}
type Archive={version:string;contexts:Campaign[]};
const read=():Archive=>{
  try{
    const value=JSON.parse(localStorage.getItem(KEY)||'null') as Archive|null;
    if(value?.version===VERSION&&Array.isArray(value.contexts))
      return {version:VERSION,contexts:value.contexts.slice(0,MAX_CONTEXTS)};
  }catch{/* Storage may be unavailable or corrupted. */}
  return {version:VERSION,contexts:[]};
};
const validDesign=(design:SiteHouseDesign|undefined):design is SiteHouseDesign=>{
  if(!design||typeof design!=='object')return false;
  // Cheap structural guard here; the PHYSICS worker revalidates all
  // selected geometries using assertSiteDesignWellFormed + current gates.
  const numbers=[
    design.orientationDeg,design.floorAreaM2,design.widthM,design.depthM,
    design.ceilingHeightM,design.wingRatio,design.eaveEquatorM,
    design.eaveOtherM,design.roofPitchDeg,design.equatorGlazingRatio,
    design.otherGlazingRatio,design.floorElevationM,
  ];
  return ['rectangle','elongated','l_shape','courtyard'].includes(design.form)
    && ['braced_timber','reinforced_masonry','steel_frame'].includes(design.structuralSystem)
    && ['standard','enhanced','hardened'].includes(design.resilientShell)
    && numbers.every(x=>typeof x==='number'&&Number.isFinite(x));
};
export function rememberedSiteDesigns(input:SiteGeometryOptimizationInput):SiteHouseDesign[]{
  try{
    const key=siteExperimentKey(input);
    const match=read().contexts.find(c=>c.key===key);
    if(!match||!Array.isArray(match.designs))return [];
    return match.designs.filter(e=>e?.evidence==='simulated_not_measured'
      &&validDesign(e.design)).slice(0,MAX_DESIGNS).map(e=>({...e.design}));
  }catch{return [];}
}
/** Pure ranking: selection by actual solver score, not a submitted score. */
export function selectSiteMemories(
  result:SiteGeometryOptimizationResult,prior:ArchivedDesign[]=[],
):ArchivedDesign[]{
  const serviceArea=result.baseline.design.floorAreaM2;
  const candidates=[
    ...prior,
    ...[result.best,...result.feasibleShortlist].map((c:EvaluatedSiteHouseDesign)=>({
      design:c.design,modeledLifecycleKWh:c.totalLifecycleEnergyKWh,
      sourceSeed:result.searchSeed,evidence:'simulated_not_measured' as const,
      _evaluated:c,
    })),
  ];
  const unique=new Map<string,ArchivedDesign>();
  for(const candidate of candidates){
    if(!validDesign(candidate.design)
      ||!Number.isFinite(candidate.modeledLifecycleKWh)
      ||candidate.modeledLifecycleKWh<=0
      ||Math.abs(candidate.design.floorAreaM2-serviceArea)>serviceArea*.05)continue;
    // Only store designs the solver marked feasible AND whose own
    // modeled energy beats the same-service baseline.
    const evaluated='_evaluated' in candidate
      ?candidate._evaluated as EvaluatedSiteHouseDesign:undefined;
    if(evaluated&&(!evaluated.feasible||evaluated.totalLifecycleEnergyKWh
      >=result.baseline.totalLifecycleEnergyKWh))continue;
    // Prior archived candidates are never trusted by the actual solver.
    // Their history can be ranked for exploration, but not accepted as a result.
    const fingerprint=JSON.stringify(candidate.design);
    const old=unique.get(fingerprint);
    if(!old||candidate.modeledLifecycleKWh<old.modeledLifecycleKWh)
      unique.set(fingerprint,{
        design:{...candidate.design},
        modeledLifecycleKWh:candidate.modeledLifecycleKWh,
        sourceSeed:candidate.sourceSeed,
        evidence:'simulated_not_measured',
      });
  }
  const groups=new Map<HouseForm,ArchivedDesign[]>();
  const sorted=[...unique.values()].sort((a,b)=>a.modeledLifecycleKWh-b.modeledLifecycleKWh);
  for(const item of sorted){
    const form=item.design.form;
    const group=groups.get(form)||[];
    if(group.length<MAX_DESIGNS_PER_FORM)group.push(item);
    groups.set(form,group);
  }
  return [...groups.values()].flat().slice(0,MAX_DESIGNS);
}
export function retainSiteExperiment(
  input:SiteGeometryOptimizationInput,result:SiteGeometryOptimizationResult,
):number{
  try{
    // Exclude unverified exceptional climates from the preset archive.
    if(result.weatherContext.mode!=='preset_fitted_degree_days'
      ||!Number.isFinite(result.baseline.totalLifecycleEnergyKWh)
      ||!Number.isFinite(result.searchSeed))return 0;
    const key=siteExperimentKey(input);
    const archive=read();
    const old=archive.contexts.find(c=>c.key===key);
    const designs=selectSiteMemories(result,old?.designs||[]);
    const updated:Campaign={
      key,attempted:Math.min(10_000,(old?.attempted||0)+1),
      updatedAt:Date.now(),designs,
    };
    const contexts=[updated,...archive.contexts.filter(c=>c.key!==key)]
      .slice(0,MAX_CONTEXTS);
    localStorage.setItem(KEY,JSON.stringify({version:VERSION,contexts}));
    return designs.length;
  }catch{return 0;}
}
/** Only summary, never a fake empirical certification. */
export function siteLearningSummary(input:SiteGeometryOptimizationInput){
  const c=read().contexts.find(x=>x.key===siteExperimentKey(input));
  return {attempts:c?.attempted||0,retainedDesigns:c?.designs?.length||0};
}
