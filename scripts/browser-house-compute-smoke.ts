import assert from 'node:assert/strict';
import {
 runHouseComputation,BROWSER_HOUSE_ENDPOINTS,
} from '../src/lib/house_compute';
import {SITE_LOCATION_PRESETS,optimizeSiteGeometry,type SiteGeometryOptimizationResult} from '../src/lib/site_geometry_optimizer';
import type {CoupledSiteFlowResult} from '../src/lib/site_whole_house_coupling';
import type {WholeHouseOptimizationResult} from '../src/lib/whole_house_optimizer';

const input={location:SITE_LOCATION_PRESETS.bendigo,seed:1024,
 targetFloorAreaM2:130,minFloorAreaM2:124,maxFloorAreaM2:136,
 targetIndoorTempC:22,iterations:300,lifecycleYears:30};
const direct=optimizeSiteGeometry(input);
const via=runHouseComputation('/api/house/optimize-site',{
 ...input,hourlyOutdoorTemperaturesC:Array(8760).fill(-300),
 hourlyWeatherSource:{stationName:'Forged station',source:'fake',stationDistanceKm:0},
 learnedDesigns:[{malicious:'injected'}],
}) as SiteGeometryOptimizationResult;
assert.equal(via.best.score,direct.best.score,'identical actual solver (not invented output)');
assert.equal(via.weatherContext.mode,'preset_fitted_degree_days',
 'Never accept caller-supplied unverifiable weather');
assert.ok(!JSON.stringify(via.weatherContext).includes('Forged station'));
assert.equal(via.candidatesEvaluated,direct.candidatesEvaluated);
assert.ok(via.best.design && typeof via.best.feasible==='boolean');
const candidate=via.best.design;
const coupled=runHouseComputation('/api/house/optimize-site-airflow',{
 siteInput:input,proposedDesign:candidate,
 candidateDesigns:via.feasibleShortlist.slice(0,4).map(x=>x.design),
}) as CoupledSiteFlowResult & {jointSearch:unknown};
assert.ok(coupled.jointSearch,'V12 site to airflow handoff now reaches the real coupled solver');
assert.equal(coupled.proposed.site.design.form,candidate.form);
assert.throws(()=>runHouseComputation('/api/house/optimize-site-airflow',{
 siteInput:input,proposedDesign:{...candidate,widthM:-20},
}),/widthM/,'invalid geometry must be rejected instead of magically passing compliance');
const whole=runHouseComputation('/api/house/optimize-whole-system',{
 location:SITE_LOCATION_PRESETS.bendigo,
 maximumCandidates:60, targetTempC:22,
 hourlyOutdoorTemperaturesC:Array(8760).fill(-100),
 siteObstruction:{summerShadePotentialPercent:100,winterSolarAccessPercent:0,confidencePercent:100,source:'fake'},
}) as WholeHouseOptimizationResult;
assert.ok(whole.candidatesEvaluated>0);
assert.equal(whole.weatherContext.mode,'preset_fitted_degree_days');
const hvac=runHouseComputation('/api/house/optimize-hvac-cycle',{
 roomName:'Bedroom',mode:'cooling',floorAreaM2:18,
});
assert.ok(hvac && typeof hvac==='object');
const wall=runHouseComputation('/api/house/optimize-adaptive-wall',{
 mode:'cooling',wallAreaM2:20,
});
assert.ok(wall && typeof wall==='object');
const retrofit=runHouseComputation('/api/house/existing-home-autopilot',{
 constructionEra:'pre_1980',floorAreaM2:130,
});
assert.ok(retrofit && typeof retrofit==='object');
const room=runHouseComputation('/api/house/optimize-room',{
 targetTempC:22, minFloorAreaM2:18,
});
assert.ok(room && typeof room==='object');
const siteContext=runHouseComputation('/api/house/site-context',{
 location:SITE_LOCATION_PRESETS.bendigo,rooms:[],
}) as {source:string;uncertainty:{band:string};neighbours:unknown[]};
assert.equal(siteContext.source,'engine_geometry',
 'Missing geographic observations must remain an explicit model fallback');
const measuredFootprints=runHouseComputation('/api/house/site-context',{
 location:SITE_LOCATION_PRESETS.bendigo,rooms:[],
},{
 type:'FeatureCollection',
 features:[{type:'Feature',geometry:{type:'Polygon',coordinates:[[
  [144.2799,-36.7601],[144.2801,-36.7601],
  [144.2801,-36.7599],[144.2799,-36.7599],[144.2799,-36.7601]
 ]]},properties:{height:3.5}}],
}) as {source:string;uncertainty:{band:string}};
assert.equal(measuredFootprints.source,'cached_open_buildings');
const validation=runHouseComputation('/api/house/validation-report');
assert.ok(validation && typeof validation==='object');
assert.equal(BROWSER_HOUSE_ENDPOINTS.length,9);
console.log('Browser V12: real site → coupled airflow, whole house, room, HVAC, wall, retrofit, evidence and validation calculations; forged site evidence rejected.');
