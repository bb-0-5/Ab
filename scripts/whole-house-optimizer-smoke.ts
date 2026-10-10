import {
  optimizeWholeHouseSystem,
  stressTestEmbodiedAssumptions,
  type DwellingArchetype,
} from '../src/lib/whole_house_optimizer';
import { buildWholeHouseDecisionBrief } from '../src/lib/whole_house_decision_brief';

const rooms = [
  { id: 'living', name: 'Living Area', x: 0, y: 0, width: 5.5, height: 4.5, ceilingHeight: 2.7, internalLoad: 720 },
  { id: 'kitchen', name: 'Kitchen', x: 5.5, y: 0, width: 3.2, height: 4.5, ceilingHeight: 2.7, internalLoad: 1100 },
  { id: 'bed', name: 'Bedroom', x: 0, y: 4.5, width: 4.2, height: 3.8, ceilingHeight: 2.9, internalLoad: 260 },
  { id: 'bath', name: 'Bathroom', x: 4.2, y: 4.5, width: 2.4, height: 3.8, ceilingHeight: 2.7, internalLoad: 430 },
  { id: 'study', name: 'Study', x: 6.6, y: 4.5, width: 2.1, height: 3.8, ceilingHeight: 2.7, internalLoad: 390 },
];

const input = {
  rooms,
  location: {
    name: 'Bendigo test', latitudeDeg: -36.76, longitudeDeg: 144.28,
    averageDailySolarMJm2: 17.2, summerDesignTempC: 40, winterDesignTempC: 1,
    heatingDegreeDays: 1700, coolingDegreeDays: 360,
  },
  maximumCandidates: 576,
};
const first = optimizeWholeHouseSystem(input);
const second = optimizeWholeHouseSystem(input);

if (first.candidatesEvaluated < 400) throw new Error('Expected a broad automatic configuration sweep.');
if (first.archetypeComparisons.length !== 4) throw new Error('Expected detached, terrace and apartment comparisons.');
if (!first.best.rooms.every(room => Math.abs(room.massBalanceResidualLs) < 0.1)) throw new Error('Pressure network is not mass balanced.');
if (JSON.stringify(first.best) !== JSON.stringify(second.best)) throw new Error('Optimizer must be deterministic for remembered computations.');
if (!Number.isFinite(first.best.totalLifecycleEnergyKWh) || first.best.totalLifecycleEnergyKWh <= 0) throw new Error('Lifecycle energy is invalid.');

// Regression: the first 48 configurations must NOT all belong to the
// first archetype. Low-budget sweeps still compare all four building forms.
const constrainedSweep = optimizeWholeHouseSystem({ ...input, maximumCandidates: 48 });
const coverage = Object.values(constrainedSweep.searchCoverage);
if (coverage.some(item => item.evaluated !== 12)) {
  throw new Error('A 48-candidate sweep must allocate 12 configurations to each archetype.');
}
if (coverage.reduce((sum, item) => sum + item.evaluated, 0) !== constrainedSweep.candidatesEvaluated) {
  throw new Error('Search coverage counts do not reconcile to the number evaluated.');
}
const unevenSweep = optimizeWholeHouseSystem({ ...input, maximumCandidates: 49 });
const unevenCoverage = Object.values(unevenSweep.searchCoverage).map(item => item.evaluated);
if (Math.max(...unevenCoverage) - Math.min(...unevenCoverage) > 1) {
  throw new Error('Reduced sweep budgets must remain balanced within one candidate.');
}

// The stress test is a deterministic what-if analysis, not a confidence bound.
const stress = first.embodiedAssumptionStressTest;
if (stress.scenariosEvaluated !== 81 || Object.values(stress.winnerCounts).reduce((a, b) => a + b, 0) !== 81) {
  throw new Error('Expected all 81 independent embodied assumption scenarios to have winners.');
}
if (JSON.stringify(stress) !== JSON.stringify(second.embodiedAssumptionStressTest)) {
  throw new Error('Assumption stress tests must be deterministic.');
}
if (stress.baselineWinner !== first.best.configuration.archetype) {
  throw new Error('The base case winner must be the same in the stress report.');
}

// Fabricated deliberately-close energies demonstrate the test can detect a
// ranking reversal without claiming these figures are measured building data.
const ids: DwellingArchetype[] = ['detached', 'terrace_mid', 'lowrise_apartment_mid', 'tower_apartment_mid'];
const synthetic = ids.map((id, index) => ({
  ...first.baseline,
  configuration: { ...first.baseline.configuration, archetype: id },
  manufacturing: { ...first.baseline.manufacturing, buildingKWh: 1000 },
  totalLifecycleEnergyKWh: 1000 + index * 100,
  score: 1000 + index * 100,
  feasible: true,
}));
const reversal = stressTestEmbodiedAssumptions(synthetic, 'detached');
if (reversal.verdict !== 'ranking_changes' || reversal.winnerCounts.detached === 81) {
  throw new Error('An embodied-cost-driven ranking reversal went undetected.');
}
const infeasible = stressTestEmbodiedAssumptions(synthetic.map(candidate => ({ ...candidate, feasible: false })), null);
if (infeasible.verdict !== 'no_feasible_design' || infeasible.scenariosEvaluated !== 0) {
  throw new Error('A stress report must not rank infeasible designs as successes.');
}

const plainBrief = buildWholeHouseDecisionBrief(first);
if (!plainBrief.includes('NOT AN ENGINEERING RECOMMENDATION')
  || !plainBrief.includes('CONSTRUCTION-ENERGY ASSUMPTION STRESS TEST')
  || !plainBrief.includes(`${stress.baselineWinnerWins} of ${stress.scenariosEvaluated}`)
  || plainBrief.includes('undefined') || plainBrief.includes('NaN')) {
  throw new Error('Plain-language screening brief is incomplete or misleading.');
}
if (plainBrief !== buildWholeHouseDecisionBrief(second)) {
  throw new Error('Decision briefs must be deterministic for identical inputs.');
}

console.log(JSON.stringify({
  candidates: first.candidatesEvaluated,
  searchCoverage: first.searchCoverage,
  embodiedAssumptionStressTest: first.embodiedAssumptionStressTest,
  winner: first.best.configuration,
  lifecycleSavedPercent: first.improvement.lifecycleEnergySavedPercent,
  apartments: first.archetypeComparisons,
}, null, 2));
