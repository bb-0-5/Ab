import assert from 'node:assert/strict';
import {
  rememberedSiteDesigns,retainSiteExperiment,siteExperimentKey,
  siteLearningSummary,selectSiteMemories,
} from '../src/lib/site_learning_archive';
import {runHouseComputation} from '../src/lib/house_compute';
import {
 SITE_LOCATION_PRESETS,evaluateSiteHouseDesign,
 type SiteGeometryOptimizationInput,type SiteGeometryOptimizationResult,
} from '../src/lib/site_geometry_optimizer';

// Actual on-device archive storage, not a server stub.
const values=new Map<string,string>();
Object.assign(globalThis,{localStorage:{
 getItem:(key:string)=>values.get(key)||null,
 setItem:(key:string,value:string)=>{values.set(key,value);},
}});
const input:SiteGeometryOptimizationInput={
 location:SITE_LOCATION_PRESETS.bendigo,
 targetFloorAreaM2:130,minFloorAreaM2:124,maxFloorAreaM2:136,
 wallRValue:3.2,targetIndoorTempC:22,lifecycleYears:30,
 lotWidthM:24,lotDepthM:40,iterations:280,seed:1201,
};
const initial=runHouseComputation('/api/house/optimize-site',input) as SiteGeometryOptimizationResult;
assert.equal(initial.weatherContext.mode,'preset_fitted_degree_days');
assert.ok(initial.best.feasible);
const expected=selectSiteMemories(initial).length;
const retained=retainSiteExperiment(input,initial);
assert.equal(retained,expected);
assert.ok(retained>0,'The test benchmark must produce real feasible models that can actually be reused.');
assert.equal(siteLearningSummary(input).attempts,1);
const sameBenchmark={...input,seed:4567,iterations:320,location:{
 ...SITE_LOCATION_PRESETS.bendigo,name:'A renamed location with identical numerical climate',
}};
assert.equal(siteExperimentKey(input),siteExperimentKey(sameBenchmark),
 'A different label, random seed, or search budget cannot alter physics');
assert.equal(siteExperimentKey(input),siteExperimentKey({...input,
 hourlyWeatherSource:{stationName:'forged',source:'fake',stationDistanceKm:0},
 hourlyOutdoorTemperaturesC:[999],weatherFallbackReason:'forged',
 }),
 'Client-provided station metadata is discarded on static Pages');
const learned=rememberedSiteDesigns(sameBenchmark);
assert.equal(learned.length,retained);
if(retained>0) {
 const cold=runHouseComputation('/api/house/optimize-site',sameBenchmark) as SiteGeometryOptimizationResult;
 const warm=runHouseComputation('/api/house/optimize-site',sameBenchmark,
  null,learned) as SiteGeometryOptimizationResult;
 assert.equal(warm.candidatesEvaluated,cold.candidatesEvaluated+learned.length,
  'Actual old geometries are re-evaluated, not painted onto old charts');
 const previousBest=Math.min(...learned.map(x=>evaluateSiteHouseDesign(x,sameBenchmark).score));
 assert.ok(warm.best.score<=previousBest+1e-7,
  'A warm-start must consider the best retained prior geometry');
 assert.equal(warm.weatherContext.mode,'preset_fitted_degree_days');
 const forged=runHouseComputation('/api/house/optimize-site',{
  ...sameBenchmark,learnedDesigns:[{fake:'impossible'}],
 }) as SiteGeometryOptimizationResult;
 assert.equal(forged.candidatesEvaluated,cold.candidatesEvaluated,
  'An API caller may not inject fabricated material or a winning geometry');
 const testedInvalid=runHouseComputation('/api/house/optimize-site',sameBenchmark,
  null,[{...learned[0],floorAreaM2:-300},...learned]) as SiteGeometryOptimizationResult;
 assert.equal(testedInvalid.candidatesEvaluated,warm.candidatesEvaluated,
  'Stale or invalid saved genomes are rejected, never passed to the solver');
}
const changedSite={...input,targetIndoorTempC:24};
const changedWeather={...input,location:{...SITE_LOCATION_PRESETS.bendigo,heatingDegreeDays:900}};
const changedMaterials={...input,wallRValue:4.2};
const changedLot={...input,lotDepthM:42};
const changedHazard={...input,requirements:{designWindSpeedMs:60}};
const changedBaseline={...input,baseline:{form:'rectangle' as const}};
for(const different of [changedSite,changedWeather,changedMaterials,
 changedLot,changedHazard,changedBaseline]){
 assert.notEqual(siteExperimentKey(different),siteExperimentKey(input));
 assert.equal(rememberedSiteDesigns(different).length,0,
  'Changing any physical constraint invalidates prior warm-start conditions');
}
const another=runHouseComputation('/api/house/optimize-site',sameBenchmark) as SiteGeometryOptimizationResult;
retainSiteExperiment(sameBenchmark,another);
assert.equal(siteLearningSummary(input).attempts,2);
assert.ok(rememberedSiteDesigns(input).length<=12);
console.log('V12 memory: same-model warm starts, repeatable geometry re-screening, strict benchmark isolation, invalid-hint quarantine, bounded local evidence.');
