import assert from 'node:assert/strict';
import {emptyAutoLedger,planNextExperiment,inferNextExperiment,evaluateAutoExperiment,recordAutoOutcome,
 bestComparableObservation,type AutoObservation} from '../src/local/autonomy';
import {materialBenchmark,extractMachineNeeds,needsSummary} from '../src/local/discovery_graph';
import {defaultCondition,membraneNeed,screenMembrane,checkCondition} from '../src/local/cross_domain';
import {optimizeImpedanceMatch} from '../src/local/impedance';
import {advanceSeed} from '../src/local/building_campaign';

const now='2026-10-11T03:00:00Z',seed=advanceSeed(481516);
const empty=emptyAutoLedger();
const first=planNextExperiment(empty,[],seed);
assert.equal(first.mode,'building');
assert.equal(first.index,0);
const built={
 seed,location:'Melbourne',areaM2:130,temperatureC:22,
 eligible:6,siteCandidates:300,mechanicalCandidates:12,
 best:{form:'rectangle',feasible:true,lifecycleKWh:125000,annualElectricityKWh:3500,
  floorAreaM2:130,orientationDeg:45,heatRecoveryPercent:50,manufacturedKWh:20000,
  geometry:[],ventilation:'recover'},
 comparisonSupported:false,qualifiesAsImprovement:false,savingsVsBaselineKWh:null,
 discoveries:[membraneNeed(defaultCondition('air'),'thermal_barrier')],
 weather:{mode:'preset'},limitations:[],explanation:'Synthetic fixture'
};
const buildingObservation=evaluateAutoExperiment(first,built,now);
let ledger=recordAutoOutcome(empty,first,buildingObservation,built);
assert.equal(ledger.nextIndex,1);
assert.equal(ledger.needs?.length,1);
assert.equal(ledger.needs?.[0].status,'pending');
assert.equal(ledger.needs?.[0].originIndex,0);
assert.equal(ledger.needs?.[0].originMode,'building');
assert.match(ledger.needs?.[0].requiredEvidence||'',/conductivity/);

const follow=planNextExperiment(ledger,[],advanceSeed(seed));
assert.equal(follow.mode,'membrane');
assert.equal(follow.originNeedId,ledger.needs?.[0].id);
assert.equal(follow.index,1);
const x=follow.request as {condition:ReturnType<typeof defaultCondition>;task:'thermal_barrier'};
assert.equal(checkCondition(x.condition),null);
assert.equal(follow.benchmark,materialBenchmark(x.task,x.condition));
const material=screenMembrane(x.condition,x.task,[]);
assert.equal(material.selected,null,'no catalogue metal has k<5 W/mK');
const materialResult=evaluateAutoExperiment(follow,material,now);
ledger=recordAutoOutcome(ledger,follow,materialResult,material);
assert.equal(ledger.nextIndex,2);
assert.equal(ledger.needs?.find(n=>n.id===follow.originNeedId)?.status,'blocked');
assert.ok((ledger.needs||[]).some(n=>n.title.includes('Missing material')));
assert.equal(needsSummary(ledger.needs||[]).pending,0);
assert.equal(planNextExperiment(ledger,[],advanceSeed(seed)).originNeedId,undefined,
 'Do not repeatedly send a blocked physical requirement to the same unchanged catalogue');
assert.equal(extractMachineNeeds(follow,material)[0].status,'blocked');
const duplicate=recordAutoOutcome(
 ledger,{...first,index:ledger.nextIndex},
 {...buildingObservation,index:ledger.nextIndex},built);
assert.equal(duplicate.needs?.filter(n=>n.title.includes('Building heat-flow')).length,1,
 'Repeat building runs must not invent duplicate material needs');

const novel=planNextExperiment(ledger,[],123);
assert.equal(novel.mode,'suit','After screening a dependency, try a still-unseen manufacturable context');
const rf0={...inferNextExperiment(1,[],123),index:ledger.nextIndex};
assert.equal(rf0.mode,'circuits');
const r=optimizeImpedanceMatch(rf0.request as {
 frequencyMHz:number;sourceOhms:number;loadOhms:number});
const rfOutcome=evaluateAutoExperiment(rf0,r,now);
const logged=recordAutoOutcome(ledger,rf0,rfOutcome,r);
assert.ok(logged.needs?.some(n=>n.title.includes('RF network')));
const next=planNextExperiment(logged,[],124);
assert.notEqual(next.benchmark,rf0.benchmark,'Do not recompute a static RF benchmark with unchanged input');
assert.throws(()=>recordAutoOutcome(logged,{...rf0,index:logged.nextIndex},rfOutcome,r),/match active causal task|indices/);
const two:AutoObservation[]=[
 {...buildingObservation,index:10,metric:125000},
 {...buildingObservation,index:11,metric:121000},
 {...buildingObservation,index:12,metric:145000,benchmark:'unrelated'},
];
assert.equal(bestComparableObservation(two,first.benchmark)?.metric,121000);

console.log('Discovery graph: physical hand-off, deduplicated needs, blocked-data gate, novel task planning, comparable objective verified.');
