import assert from 'node:assert/strict';
import { optimizeImpedanceMatch } from '../src/local/impedance';
import { optimizeRouteSelectivity, ILLUSTRATIVE_ROUTES } from '../src/local/selectivity';

// Passive RF power conservation, relative to an ideal Thevenin source.
const matched=optimizeImpedanceMatch({frequencyMHz:100,sourceOhms:50,loadOhms:50});
assert.equal(matched.baselineDeliveredPowerFraction,1);
assert.ok(matched.best.centerDeliveredPowerFraction<=1+1e-9);
assert.ok(matched.best.centerDeliveredPowerFraction>=0);
assert.ok(matched.tested>=200);
const unmatched=optimizeImpedanceMatch({frequencyMHz:100,sourceOhms:50,loadOhms:100});
assert.ok(unmatched.baselineDeliveredPowerFraction<1);
assert.ok(unmatched.best.centerDeliveredPowerFraction<=1+1e-9,'Passive circuit cannot create power.');
assert.ok(unmatched.best.bandAveragePowerFraction<=1);
assert.ok(unmatched.best.bandAveragePowerFraction>=0);
assert.ok(unmatched.best.worstBandPowerFraction<=unmatched.best.bandAveragePowerFraction+1e-9);
assert.deepEqual(unmatched,optimizeImpedanceMatch({frequencyMHz:100,sourceOhms:50,loadOhms:100}));
assert.throws(()=>optimizeImpedanceMatch({frequencyMHz:1e6,sourceOhms:50,loadOhms:100}),/1–1000/);
assert.throws(()=>optimizeImpedanceMatch({frequencyMHz:100,sourceOhms:-1,loadOhms:100}),/1–1000/);
assert.ok(Math.abs(unmatched.baselineDeliveredPowerFraction-8/9)<1e-10);

// A passive gate can reduce side products in a toy process, but must not
// imply that total target output from the same input material has increased.
const sample=optimizeRouteSelectivity(ILLUSTRATIVE_ROUTES,.5);
assert.ok(sample.candidatesTested>=15);
assert.ok(sample.gate.selectivity>=sample.baseline.selectivity-1e-4);
assert.ok(sample.gate.targetPerInput<=sample.baseline.targetPerInput+1e-4);
assert.ok(sample.gate.acceptedFraction>=.5-1e-4);
assert.ok(sample.gate.acceptedFraction<=1);
assert.ok(sample.gate.allowed.length>0);
assert.deepEqual(sample,optimizeRouteSelectivity(ILLUSTRATIVE_ROUTES,.5));
const everything=optimizeRouteSelectivity(ILLUSTRATIVE_ROUTES,1);
assert.equal(everything.gate.acceptedFraction,1);
assert.equal(everything.gate.targetPerInput,everything.baseline.targetPerInput);
assert.throws(()=>optimizeRouteSelectivity([{label:'fake',prevalence:1,desiredProbability:.8,unwantedProbability:.6}]),/bounded/);
assert.throws(()=>optimizeRouteSelectivity([{label:'not normalized',prevalence:.2,desiredProbability:.5,unwantedProbability:.1}]),/sum to 1/);

// No server client or cloud import required for numerical execution.
console.log(JSON.stringify({
  deviceOnly:true,
  passivePowerConserved:true,
  circuitsTested:unmatched.tested,
  unmatchedDelivered:unmatched.baselineDeliveredPowerFraction,
  bestRFDelivered:unmatched.best.centerDeliveredPowerFraction,
  sideRouteFiltersTested:sample.candidatesTested,
  toyBaselineTargetPerInput:sample.baseline.targetPerInput,
  toyGatedTargetPerInput:sample.gate.targetPerInput,
  illustrationNotKinetics:true,
},null,2));
