import assert from 'node:assert/strict';
import {
 inferNextExperiment,evaluateAutoExperiment,errorObservation,emptyAutoLedger,
 addAutoObservation,bestComparableObservation,
} from '../src/local/autonomy';
import {advanceSeed} from '../src/local/building_campaign';
import {defaultCondition,type Discovery} from '../src/local/cross_domain';
import {optimizeImpedanceMatch} from '../src/local/impedance';
import {screenMembrane} from '../src/local/cross_domain';
import {optimizeFabricationPortfolio} from '../src/local/fabrication';

const cases=Array.from({length:14},(_,i)=>inferNextExperiment(i,[],advanceSeed(i)));
assert.deepEqual(cases.slice(0,7).map(x=>x.mode),
 ['building','circuits','membrane','building','suit','membrane','circuits']);
assert.equal(new Set(cases.map(x=>x.index)).size,cases.length);
assert.equal(cases[0].benchmark,cases[3].benchmark,'same building reference before ranking');
assert.notEqual(cases[1].benchmark,cases[6].benchmark,'do not compare different RF conditions');
for(const task of cases){
 assert.ok(task.why.length>30);
 assert.ok(task.objective.length>30);
 assert.ok(Object.keys(task.request).length>=4);
 assert.equal(task.request.mode,task.mode);
 assert.ok(!Object.keys(task.request).includes('userObjective'));
}
const discoveredNeed:Discovery={kind:'membrane_need',task:'thermal_barrier',
 condition:defaultCondition('air'),label:'Saved thermal requirement',producer:'building',
 id:'test:thermal',evidence:'hypothesis',source:'building-energy screening',createdAt:'test'};
const dependent=inferNextExperiment(2,[discoveredNeed],1234);
assert.equal(dependent.request.task,'thermal_barrier');
assert.deepEqual(dependent.request.condition,discoveredNeed.condition);
assert.match(dependent.why,/prior subsystem/);
const need5000=cases[12];
assert.equal(need5000.mode,'membrane');
assert.equal((need5000.request.condition as {temperatureK:number}).temperatureK,1200);

const circuitCase=cases[1];
const actualCircuit=optimizeImpedanceMatch(circuitCase.request as {
 frequencyMHz:number;sourceOhms:number;loadOhms:number});
const observation=evaluateAutoExperiment(circuitCase,actualCircuit,'2026-10-11T00:00:00Z');
assert.equal(observation.evidence,'model_only');
assert.ok(observation.metric!==null&&observation.metric>=0&&observation.metric<=1);
assert.match(observation.comparison,/baseline/);
if(observation.grade==='feasible')
 assert.ok(actualCircuit.best.toleranceWorstPowerFraction>actualCircuit.baselineDeliveredPowerFraction+.005);
const materialCase=cases[2];
const materialResult=screenMembrane(materialCase.request.condition as any,
 materialCase.request.task as any,[]);
const material=evaluateAutoExperiment(materialCase,materialResult,'2026-10-11T00:00:00Z');
assert.equal(material.evidence,'reference_screen');
assert.notEqual(material.grade,'feasible','a reference metal is never an independently validated invention');

const fabricationCase=cases[4];
const f=fabricationCase.request;
const fab=optimizeFabricationPortfolio({
 goal:'decorative_panel',
 widthMm:f.partWidthMm as number,lengthMm:f.partLengthMm as number,
 minimumRibWidthMm:8,minimumSectionIndexMm4:f.minSectionIndexMm4 as number,
 printerBedXmm:f.printerBedXmm as number,printerBedYmm:f.printerBedYmm as number,
 budgetAUD:f.budgetAUD as number,filamentPriceAUDkg:f.filamentPriceAUDkg as number,
 ambientTemperatureK:295,
});
const fb=evaluateAutoExperiment(fabricationCase,fab,'2026-10-11T00:00:01Z');
assert.equal(fb.evidence,'assumption_only');
assert.notEqual(fb.grade,'feasible','decorative panel is conditional pending print');
const base=emptyAutoLedger();
const first=addAutoObservation(base,observation);
assert.equal(first.completed,1);
assert.throws(()=>addAutoObservation(first,observation),/out-of-order/);
const second=addAutoObservation(first,{...material,index:1});
assert.equal(second.completed,2);
assert.equal(second.records[0].mode,'membrane');
const fail=errorObservation(cases[0],'Local worker timed out','2026-10-11T00:00:01Z');
assert.equal(fail.metric,null);assert.equal(fail.grade,'error');
assert.equal(bestComparableObservation([
 { ...observation,benchmark:'sample-a',index:10,metric:.45,grade:'feasible'},
 { ...observation,benchmark:'sample-a',index:11,metric:.55,grade:'feasible'},
 { ...observation,benchmark:'sample-b',index:12,metric:.98,grade:'feasible'},
],'sample-a')?.metric,.55);
console.log('Autonomous agenda: zero-input physical tasks, cross-domain need, evidence gates, conservative comparisons passed.');
