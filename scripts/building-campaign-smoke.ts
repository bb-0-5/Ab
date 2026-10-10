import assert from 'node:assert/strict';
import {addBuildingRun,advanceSeed,buildingKey,emptyCampaign,weatherFingerprint,type BuildingRun} from '../src/local/building_campaign';
const key=buildingKey('melbourne',130,22,'preset');
assert.notEqual(key,buildingKey('melbourne',130,23,'preset'));
assert.notEqual(key,buildingKey('melbourne',130,22,'epw-100-abc'));
assert.notEqual(weatherFingerprint('test one'),weatherFingerprint('test two'));
assert.ok(advanceSeed(481516)>0);
const fixture=(energy:number,eligible=true):BuildingRun=>({
 seed:1,location:'Melbourne',areaM2:130,temperatureC:22,siteCandidates:420,
 mechanicalCandidates:96,eligible:eligible?4:0,comparisonSupported:true,
 qualifiesAsImprovement:energy<200000,baselineLifecycleKWh:200000,
 savingsVsBaselineKWh:200000-energy,explanation:'screened',limitations:[],
 weather:{mode:'preset_fitted_degree_days',stationName:null,weatherHours:null,note:'',stationDistanceKm:null},
 best:eligible?{form:'courtyard',floorAreaM2:130,orientationDeg:0,ventilation:'natural',
 heatRecoveryPercent:0,annualElectricityKWh:2800,lifecycleKWh:energy,
 manufacturedKWh:12000,geometry:[[{x:0,y:0},{x:1,y:0},{x:1,y:1}]],feasible:true}:null,
});
let c=emptyCampaign(key,1);
c=addBuildingRun(c,fixture(190000),1,'2026-10-11');
assert.equal(c.attempts,1);
assert.equal(c.best?.best?.lifecycleKWh,190000);
c=addBuildingRun(c,fixture(190000),1,'2026-10-11');
assert.equal(c.attempts,1,'Same seed must not fabricate progress');
c=addBuildingRun(c,fixture(195000),2,'2026-10-11');
assert.equal(c.best?.best?.lifecycleKWh,190000,'Worse trial does not overwrite incumbent');
c=addBuildingRun(c,fixture(185000),3,'2026-10-11');
assert.equal(c.best?.best?.lifecycleKWh,185000,'Feasible improvement wins');
c=addBuildingRun(c,fixture(1000,false),4,'2026-10-11');
assert.equal(c.best?.best?.lifecycleKWh,185000,'Failed feasibility cannot win');
assert.equal(c.attempts,4);assert.equal(c.viableRuns,3);
assert.equal(c.footprints,420*4);assert.equal(c.mechanical,96*4);
console.log('Building search campaign: comparable inputs, non-duplicate trials and feasible best: OK');
