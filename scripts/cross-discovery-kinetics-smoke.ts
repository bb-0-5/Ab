import assert from 'node:assert/strict';
import {
  calibrateKnownYields,parseKnownYieldsCSV,predictFromCalibration,
  screenHypotheticalBarriers,transitionStateEventProbability,GAS_R,
  type YieldObservation,
} from '../src/local/kinetics';
import {
 defaultCondition,checkCondition,proposeIsotopeHypotheses,proposeMaterialDiscoveries,
 screenMembrane,membraneNeed,probeDiscovery,searchDiscoveryUseCases,extractDiscoveriesFromHistory,
 screenEnvironmentHeatExchange,
 type OperatingCondition,
} from '../src/local/cross_domain';

// Synthetic mathematical fixture is NOT experimental data.
// The live app NEVER ships these numerical observations as known yields.
const k=(T:number,kref:number,Ea:number)=>
 kref*Math.exp(-Ea/GAS_R*(1/T-1/330));
const observations:YieldObservation[]=[];
const temperatures=[290,300,310,320,330,340,350,360,370,380,390,400];
for(let i=0;i<temperatures.length;i++){
 const T=temperatures[i],a=k(T,.0018,21000),b=k(T,.0007,11500),time=90+i*15;
 const conversion=-Math.expm1(-(a+b)*time);
 observations.push({id:`synthetic-${i}`,reactionId:'toy-rx',environment:'air',
  temperatureK:T,durationS:time,
  targetFraction:conversion*a/(a+b),sideFraction:conversion*b/(a+b),
  source:'SYNTHETIC_MATH_TEST_NOT_EXPERIMENTAL'});
}
const csv=[
 'id,reaction_id,environment,temperature_k,duration_s,target_fraction,side_fraction,source',
 ...observations.map(x=>[x.id,x.reactionId,x.environment,x.temperatureK,x.durationS,
  x.targetFraction,x.sideFraction,x.source].join(',')),
].join('\n');
assert.deepEqual(parseKnownYieldsCSV(csv),observations);
const fit=calibrateKnownYields(observations,'toy-rx','air');
assert.ok(fit.trainCount>=8);
assert.ok(fit.holdoutCount>=2);
assert.ok(fit.holdoutMAE<.0000001,
 'On exact synthetic competing first-order data the held-out yield error must vanish.');
assert.ok(fit.holdoutMAE<fit.holdoutBaselineMAE);
assert.equal(fit.gate,'passes_baseline');
assert.ok(Math.abs(fit.targetFit.activationEnergyJMol-21000)<.01);
assert.ok(Math.abs(fit.sideFit.activationEnergyJMol-11500)<.01);
const replay=predictFromCalibration(fit,333,200);
assert.ok(replay.targetFraction>0&&replay.targetFraction<1);
assert.ok(Math.abs(replay.targetFraction+replay.sideFraction+replay.unreactedFraction-1)<1e-10);
assert.deepEqual(fit,calibrateKnownYields(observations,'toy-rx','air'));
const sweep=screenHypotheticalBarriers(fit,330,180);
assert.equal(sweep.scenarios.length,16);
assert.ok(sweep.bestHypothetical.prediction.targetFraction>=sweep.baseline.targetFraction);
assert.equal(sweep.bestHypothetical.validatedImprovement,false);
assert.throws(()=>calibrateKnownYields(observations.slice(0,4),'toy-rx','air'),/eight/);
assert.throws(()=>calibrateKnownYields(observations,'toy-rx','water'),/eight/);
assert.throws(()=>calibrateKnownYields([observations[0],...observations],'toy-rx','air'),/Duplicate/);
assert.throws(()=>parseKnownYieldsCSV('invalid columns\na,b'),/requires/);
const eyring=transitionStateEventProbability({
 temperatureK:300,activationEnthalpyJMol:85000,
 activationEntropyJMolK:-100,durationS:1,
});
assert.ok(eyring.probabilityWithinHorizon>0 && eyring.probabilityWithinHorizon<1);
const longer=transitionStateEventProbability({
 temperatureK:300,activationEnthalpyJMol:85000,
 activationEntropyJMolK:-100,durationS:100000,
});
assert.ok(longer.probabilityWithinHorizon>eyring.probabilityWithinHorizon);
assert.equal(transitionStateEventProbability({temperatureK:300,activationEnthalpyJMol:85000,
 activationEntropyJMolK:-100,durationS:0}).probabilityWithinHorizon,0);
assert.throws(()=>transitionStateEventProbability({temperatureK:0,activationEnthalpyJMol:10,
 activationEntropyJMolK:0,durationS:1}),/bounded/);

const ambient=defaultCondition('air');
const airCalm=screenEnvironmentHeatExchange({...ambient,flowSpeedMs:0});
const airMoving=screenEnvironmentHeatExchange({...ambient,flowSpeedMs:12});
const waterMoving=screenEnvironmentHeatExchange({...defaultCondition('water'),flowSpeedMs:12});
const vacuumOnly=screenEnvironmentHeatExchange(defaultCondition('vacuum'));
assert.ok(airMoving.heatFluxWm2!>airCalm.heatFluxWm2!);
assert.ok(waterMoving.heatFluxWm2!>airMoving.heatFluxWm2!);
assert.equal(vacuumOnly.regime,'thermal_radiation_only');
assert.equal(vacuumOnly.coefficientWm2K,null);
assert.ok(vacuumOnly.heatFluxWm2!>0);
const extremeRadiation=screenEnvironmentHeatExchange({
 medium:'vacuum',temperatureK:5000,pressurePa:.001,flowSpeedMs:0,
});
assert.ok(extremeRadiation.heatFluxWm2!>vacuumOnly.heatFluxWm2!,
 'High temperature vacuum radiative flux is not zero merely because convection vanishes.');

const nearVacuum=defaultCondition('vacuum');
const water=defaultCondition('water');
const extreme:OperatingCondition={medium:'vacuum',temperatureK:5000,
 pressurePa:.001,flowSpeedMs:0};
assert.equal(checkCondition(extreme),null,'Hot vacuum is physically specifiable even if catalog materials fail.');
assert.match(checkCondition({...water,temperatureK:5000})||'',/critical/);
assert.match(checkCondition({...nearVacuum,pressurePa:101325})||'',/Vacuum/);
const roomMembrane=screenMembrane(ambient,'heat_spreader');
assert.ok(roomMembrane.passingCandidates>=1);
assert.ok(roomMembrane.selected?.thermalConductivityWmK);
const insulated=screenMembrane(ambient,'thermal_barrier');
assert.equal(insulated.selected,null,'None of the bounded bulk metals is an acceptable insulation solution.');
const severe=screenMembrane(extreme,'heat_spreader');
assert.equal(severe.selected,null,'5000K vacuum cannot auto-conjure a melting-point qualified solid.');
assert.ok(Math.abs(severe.requiredProperties.minimumReferenceMeltingPointK-6250)<1e-9,
  'At 5000K with 20% phase safety margin the requested reference melt threshold is 6250K.');
assert.ok(severe.unmetRequirements.some(x=>x.includes('6250')));

assert.ok(severe.alternatives.every(x=>x.status==='rejected'));
const isotopes=proposeIsotopeHypotheses(ambient);
assert.equal(isotopes.length,3);
assert.ok(isotopes.every(x=>x.property?.thermalConductivityWmK===null));
assert.ok(probeDiscovery(isotopes[0],ambient).every(x=>x.status==='unsupported'),
 'An isotope mass must never fabricate PCB, chemistry or membrane properties.');
const pastMembrane=membraneNeed(extreme,'flow_membrane');
const chemistryMaterial=proposeMaterialDiscoveries(ambient);
const catalog=searchDiscoveryUseCases([...chemistryMaterial,...isotopes,pastMembrane]);
const calibratedDiscovery={...chemistryMaterial[0],
  id:'kinetics:toy-rx:air',kind:'kinetic_fit' as const,evidence:'measured_user_data' as const,
  kinetics:fit,label:'Previously fitted toy kinetics'};
const chemistryProbe=probeDiscovery(calibratedDiscovery,{...ambient,temperatureK:330});
assert.ok(chemistryProbe.some(x=>x.domain==='chemistry'&&x.status==='conditional'));
const extrapolation=probeDiscovery(calibratedDiscovery,{...ambient,temperatureK:500});
assert.ok(extrapolation.some(x=>x.domain==='chemistry'&&x.status==='unsupported'));
assert.ok(chemistryProbe.filter(x=>x.domain!=='chemistry').every(x=>x.status==='unsupported'));

assert.equal(catalog.discoveriesTested,7);
assert.ok(catalog.reports.some(x=>x.compatible.length>0));
assert.ok(catalog.reports.filter(x=>x.discoveryId.startsWith('isotope:')).every(x=>x.compatible.length===0));
const stored=extractDiscoveriesFromHistory([
 {result:{discoveries:[...chemistryMaterial,...isotopes]}},
 {result:{discoveries:[pastMembrane]}}
]);
assert.equal(stored.length,7,'Other sims must access typed discoveries from old user runs.');
assert.deepEqual(stored,extractDiscoveriesFromHistory([{result:{discoveries:[...chemistryMaterial,...isotopes]}},{result:{discoveries:[pastMembrane]}}]));
console.log(JSON.stringify({syntheticHoldoutErrorPctPoints:fit.holdoutMAE*100,
 modelConservesProbability:true,eventNotGuaranteed:true,
 candidateRoomMembrane:roomMembrane.selected?.id,
 extremeVacuumSupportedMaterial:severe.selected,
 verifiedIsotopeUsecases:0,crossDomainCases:catalog.reports.length,
 realExperimentalCalibrationAvailable:false,
},null,2));
