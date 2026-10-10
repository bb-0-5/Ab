import type { WholeHouseOptimizationResult } from './whole_house_optimizer';

/**
 * Plain-language screening handoff for a non-specialist.
 * All figures are outputs of AboveBound's deterministic reduced-order model,
 * not measured bills, energy certificates, or a construction approval.
 */
export function buildWholeHouseDecisionBrief(result: WholeHouseOptimizationResult): string {
  const fmt = (value: number) => Number.isFinite(value)
    ? Math.round(value).toLocaleString('en-AU')
    : 'not available';
  const best = result.best;
  const stress = result.embodiedAssumptionStressTest;
  const annualDifference = result.baseline.annual.totalOperationalKWh - best.annual.totalOperationalKWh;
  const lifecycleDifference = result.baseline.totalLifecycleEnergyKWh - best.totalLifecycleEnergyKWh;
  const sorted = [...result.archetypeComparisons].sort((a, b) => Number(b.feasible) - Number(a.feasible) || a.lifecycleEnergyKWh - b.lifecycleEnergyKWh);

  return [
    'ABOVEBOUND | BUILDING-ENERGY SCREENING BRIEF',
    '=================================================',
    '',
    'LOCATION / MODEL',
    `Climate/site label: ${result.location.name}`,
    `Coordinates: ${result.location.latitudeDeg.toFixed(3)}, ${result.location.longitudeDeg.toFixed(3)}`,
    `Configurations evaluated: ${result.candidatesEvaluated}`,
    'A location label or preset is NOT evidence of the exact property, weather, materials or zoning.',
    '',
    'RESULT (COMPARATIVE SCREENING, NOT AN ENGINEERING RECOMMENDATION)',
    `Model-selected dwelling type: ${sorted.find(row => row.archetype === best.configuration.archetype)?.label || best.configuration.archetype}`,
    `Feasible under project-defined constraints: ${best.feasible ? 'YES' : 'NO'}`,
    `Annual operational electrical energy: ${fmt(best.annual.totalOperationalKWh)} kWh/year`,
    `Building, duct and equipment manufacturing allowance: ${fmt(best.manufacturing.totalKWh)} kWh`,
    `Total lifecycle energy: ${fmt(best.totalLifecycleEnergyKWh)} kWh`,
    `Annual energy difference vs model detached baseline: ${fmt(annualDifference)} kWh/year`,
    `Lifecycle difference vs model detached baseline: ${fmt(lifecycleDifference)} kWh`,
    `Screening gate: ${result.improvement.qualifiesAsImprovement ? 'PASSES' : 'DOES NOT PASS'}`,
    `Reason: ${result.improvement.reason}`,
    '',
    'DWELLING COMPARISON (ASSUMED EMBODIED FACTORS)',
    ...sorted.map((row, i) =>
      `${i + 1}. ${row.label}: ${fmt(row.annualOperationalKWh)} kWh/year operational; ${fmt(row.lifecycleEnergyKWh)} kWh lifecycle; gate ${row.feasible ? 'PASS' : 'FAIL'}; building factor ${fmt(row.embodiedKWhPerM2)} kWh/m2 [${row.embodiedEvidence.confidence}]`),
    '',
    'AUTOMATIC SEARCH COVERAGE',
    ...Object.entries(result.searchCoverage).map(([id, entry]) =>
      `- ${id}: ${entry.evaluated} evaluated; ${entry.feasible} met model comfort/noise/mass-balance limits`),
    '',
    'CONSTRUCTION-ENERGY ASSUMPTION STRESS TEST',
    `Result: ${stress.verdict.replaceAll('_', ' ')}`,
    `Base-case winner remains first: ${stress.baselineWinnerWins} of ${stress.scenariosEvaluated} WHAT-IF scenarios.`,
    `Eligible dwelling types: ${stress.feasibleArchetypes} of 4`,
    ...Object.entries(stress.winnerCounts).map(([id, wins]) => `- ${id}: ${wins} scenarios`),
    stress.note,
    'These scenario counts are NOT likelihoods or calibrated probabilities.',
    '',
    'IMPORTANT LIMITATIONS AND NEXT EVIDENCE',
    '- Model weather is degree-day based, not an hourly weather file.',
    '- Dwelling archetype structure factors are UNSOURCED; comparable product-specific EPDs are necessary before real construction decisions.',
    '- Shared apartment walls are assumed conditioned; real party-wall and neighbour conditions need evidence.',
    '- Steady linear-conductance airflow is not CFD, smoke modelling or commissioning.',
    '- Local NCC, fire, flood, bushfire, wind, structural and planning requirements are not verified by this tool.',
    '- No ASHRAE Standard 140 / BESTEST certification has been established.',
    '- Obtain surveyed site details, verifiable material quantities, comparable EPD factors and design weather before treating a ranking as actionable.',
    '',
    'This brief is generated from AboveBound screening results. It is not advice to build, purchase or retrofit.',
  ].join('\n');
}
