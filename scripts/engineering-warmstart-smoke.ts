import assert from 'node:assert/strict';
import {SITE_LOCATION_PRESETS,optimizeSiteGeometry,assertSiteDesignWellFormed} from '../src/lib/site_geometry_optimizer';
import {emptyCampaign,addBuildingRun,type BuildingRun} from '../src/local/building_campaign';

const input={
 location:SITE_LOCATION_PRESETS.melbourne,
 targetFloorAreaM2:130,minFloorAreaM2:123.5,maxFloorAreaM2:136.5,
 targetIndoorTempC:22,lifecycleYears:30,
 iterations:300,
};
const initial=optimizeSiteGeometry({...input,seed:105});
assertSiteDesignWellFormed(initial.best.design);
const raw=optimizeSiteGeometry({...input,seed:9981});
const improved=optimizeSiteGeometry({...input,seed:9981,
 learnedDesigns:[initial.best.design]});
assert.equal(improved.candidatesEvaluated,raw.candidatesEvaluated+1);
assert.ok(improved.best.score<=initial.best.score+1e-5,
 'New search must consider retained geometry and not discard the known site optimum.');
assert.ok(improved.best.score<=raw.best.score+1e-5,
 'Warm-start should not suppress fresh random exploration.');
assert.deepEqual(improved,optimizeSiteGeometry({...input,seed:9981,
 learnedDesigns:[initial.best.design]}),'warm-start must be deterministic');
assert.throws(()=>assertSiteDesignWellFormed({...initial.best.design,wallRValue:Infinity,
 widthM:-42}),/invalid widthM/);

const record:BuildingRun={
 seed:105,location:'Melbourne',areaM2:130,temperatureC:22,
 siteCandidates:initial.candidatesEvaluated,mechanicalCandidates:1,eligible:1,
 comparisonSupported:false,qualifiesAsImprovement:false,savingsVsBaselineKWh:null,
 best:{form:initial.best.design.form,floorAreaM2:initial.best.design.floorAreaM2,
 orientationDeg:initial.best.design.orientationDeg,ventilation:'illustrative',
 heatRecoveryPercent:0,annualElectricityKWh:1500,lifecycleKWh:100_000,
 manufacturedKWh:25_000,geometry:initial.best.footprintPolygons,
 design:initial.best.design,feasible:true},
 weather:{mode:'preset_fitted_degree_days',stationName:null,weatherHours:null,note:'test',stationDistanceKm:null},
 explanation:'Test fixture',limitations:[],learnedDesignsUsed:0,
};
const campaign=addBuildingRun(emptyCampaign('test:fixed-same-physics',105),
 record,105,'2026-10-11T00:00:00Z');
assert.deepEqual(campaign.best?.best?.design,initial.best.design);
assert.equal(campaign.attempts,1);
const worse=addBuildingRun(campaign,{
 ...record,seed:106,learnedDesignsUsed:1,
 best:{...record.best!,lifecycleKWh:110_000,design:raw.best.design},
},106,'2026-10-11T00:00:01Z');
assert.equal(worse.best?.best?.lifecycleKWh,100_000);
assert.deepEqual(worse.best?.best?.design,initial.best.design,
 'Even a recently computed full genome cannot overwrite better feasible engineering geometry.');
console.log('Warm-start: exact validated design genome survives persistence, reduces local objective, and never overwrites the incumbent with worse design.');
