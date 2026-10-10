import {
  type EvaluatedSiteHouseDesign,
  type SiteLocationProfile,
} from './site_geometry_optimizer';
import {
  optimizeWholeHouseSystem,
  type WholeHouseOptimizerInput,
  type WholeHouseRoomInput,
  type EvaluatedWholeHouseConfiguration,
  type WholeHouseConfiguration,
} from './whole_house_optimizer';
// The site model and mechanical proxy MUST use the same occupant balance
// temperature and climate inputs; defaulting mechanics to 18°C while site
// loads follow a 22°C user setpoint invents inconsistent savings.

/**
 * Couples a site design's proposed room topology to a DETACHED-house mechanical
 * airflow sweep. This does not turn the detached-house site geometry into a
 * real-world apartment, a CFD model, or a measured as-built floor plan.
 *
 * Scope of additive lifecycle accounting:
 * - Site engine owns construction, envelope, glazing and solar. Recompute its
 *   cooling load WITHOUT its natural-ventilation credit when mechanical
 *   ventilation is installed, to avoid taking two incompatible credits.
 * - Whole-house engine owns only NEW mechanical fresh-air + fan electricity and
 *   duct/openings/controls/HRV manufacturing. EXCLUDE its generic building
 *   embodied, opaque-fabric, and solar terms to prevent double counting.
 *
 * Both models use the same indoor balance point and source: the fitted
 * climate profile or the SAME validated EPW dry-bulb series. Neither model
 * becomes an hourly heat-balance solver or uses EPW solar irradiance.
 * All output is screening only, with explicit area/layout evidence limits.
 */

export interface CoupledSiteFlowCase {
  site: EvaluatedSiteHouseDesign;
  rooms: WholeHouseRoomInput[];
  layout: {
    source: 'site_optimizer_generated_room_surrogate';
    declaredFloorAreaM2: number;
    rawRoomAreaM2: number;
    scaledRoomAreaM2: number;
    linearScale: number;
  };
  selectedAirflow: WholeHouseConfiguration;
  mechanicalScreen: {
    feasible: boolean;
    meanComfortDeviationC: number;
    estimatedNoiseDbA: number;
    massBalanceResidualLs: number;
  };
  energy: {
    annualSiteElectricalKWh: number;
    /** Foregone natural-ventilation cooling credit under mechanical control. */
    naturalVentilationCreditRemovedElectricalKWh: number;
    annualVentilationElectricalKWh: number;
    annualFanElectricalKWh: number;
    annualCombinedElectricalKWh: number;
    siteManufacturingKWh: number;
    extraMechanicalManufacturingKWh: number;
    combinedManufacturingKWh: number;
    totalLifecycleKWh: number;
  };
  feasible: boolean;
  configurationsEvaluated: number;
}

export interface CoupledSiteFlowResult {
  mode: 'same_site_detached_geometry_plus_mechanical_airflow';
  location: SiteLocationProfile;
  lifecycleYears: number;
  baseline: CoupledSiteFlowCase;
  proposed: CoupledSiteFlowCase;
  decision: {
    qualifiesAsImprovement: boolean;
    annualElectricalSavingsKWh: number;
    lifecycleEnergySavingsKWh: number;
    lifecycleEnergySavingsPercent: number;
    reason: string;
  };
  constraints: {
    bothSiteDesignsFeasible: boolean;
    bothMechanicalDesignsFeasible: boolean;
    equalFloorArea: boolean;
    floorAreaDifferencePercent: number;
  };
  limitations: string[];
  jointSearch?: JointSiteMechanicalSearch;
}

/**
 * Bounded JOINT SELECTION, not a globally optimal building design.
 * The site optimiser generates a diverse same-area geometry portfolio;
 * we evaluate a balanced mechanical sub-sweep against EACH geometry and
 * compare on the same non-double-counted lifecycle accounting boundary.
 */
export interface JointSiteMechanicalSearch {
  mode: 'bounded_joint_geometry_mechanical_selection';
  geometryCandidatesEvaluated: number;
  mechanicalCandidatesEvaluated: number;
  feasibleEquivalentAreaCandidates: number;
  maximumMechanicalCandidatesPerSite: number;
  selected: CoupledSiteFlowCase | null;
  siteOnlyChoice: CoupledSiteFlowCase;
  baseline: CoupledSiteFlowCase;
  ranked: Array<{
    form: string;
    areaM2: number;
    annualElectricalKWh: number;
    totalLifecycleKWh: number;
    airflowControl: WholeHouseConfiguration['control'];
    heatRecoveryEfficiency: number;
    eligible: boolean;
  }>;
  lifecycleSavingsAgainstReferenceKWh: number | null;
  lifecycleSavingsVsSiteOnlyChoiceKWh: number | null;
  qualifiesAsImprovement: boolean;
  outcome: string;
  limitations: string[];
}

const round = (n: number, places = 2) => {
  const k = 10 ** places;
  return Math.round(n * k) / k;
};

export function roomsFromSiteDesign(site: EvaluatedSiteHouseDesign): {
  rooms: WholeHouseRoomInput[];
  layout: CoupledSiteFlowCase['layout'];
} {
  const floorArea = site.design.floorAreaM2;
  if (!Number.isFinite(floorArea) || floorArea <= 0
    || !Number.isFinite(site.design.ceilingHeightM) || site.design.ceilingHeightM <= 0
    || !Array.isArray(site.rooms) || site.rooms.length === 0) {
    throw new Error('Site geometry is missing usable floor area, ceiling height or rooms.');
  }
  const rawArea = site.rooms.reduce((sum, room) => {
    if (![room.x, room.y, room.width, room.depth, room.internalLoadW].every(Number.isFinite)
      || room.width <= 0 || room.depth <= 0) {
      throw new Error('Site room surrogate contains invalid or missing geometry.');
    }
    return sum + room.width * room.depth;
  }, 0);
  if (!(rawArea > 0)) throw new Error('Cannot scale empty site rooms.');
  // This makes the V12-style room surrogate conserve the *declared dwelling
  // area*, even for L/courtyard plans whose sketch rooms do not fit the exact
  // footprint. It is NOT an architectural plan or proof of adjacency.
  const linearScale = Math.sqrt(floorArea / rawArea);
  const rooms = site.rooms.map(room => ({
    id: room.id,
    name: room.name,
    x: round(room.x * linearScale, 5),
    y: round(room.y * linearScale, 5),
    width: round(room.width * linearScale, 5),
    height: round(room.depth * linearScale, 5),
    ceilingHeight: site.design.ceilingHeightM,
    targetTemp: room.targetTempC,
    internalLoad: room.internalLoadW,
  }));
  const scaledRoomArea = rooms.reduce((sum, room) => sum + room.width * room.height, 0);
  return {
    rooms,
    layout: {
      source: 'site_optimizer_generated_room_surrogate',
      declaredFloorAreaM2: round(floorArea, 2),
      rawRoomAreaM2: round(rawArea, 2),
      scaledRoomAreaM2: round(scaledRoomArea, 2),
      linearScale: round(linearScale, 5),
    },
  };
}

function evaluateCase(
  site: EvaluatedSiteHouseDesign,
  location: SiteLocationProfile,
  lifecycleYears: number,
  maximumCandidates: number,
  coolingCOP: number,
  isBaseline: boolean,
  targetTempC: number,
  hourlyOutdoorTemperaturesC?: number[],
): CoupledSiteFlowCase {
  const { rooms, layout } = roomsFromSiteDesign(site);
  const input: WholeHouseOptimizerInput = {
    rooms,
    location,
    fixedArchetype: 'detached',
    // Exactly the site model's selected indoor balance temperature and
    // (if supplied) the same operator-provided validated EPW series.
    targetTempC,
    hourlyOutdoorTemperaturesC,
    lifecycleYears,
    maximumCandidates,
  };
  const airflow = optimizeWholeHouseSystem(input);
  // The site engine already owns building geometry, fabric and construction.
  // Ranking on Whole System's generic lifecycle (which also includes them)
  // can choose a different ventilation package from the genuine additive
  // objective. Re-rank EVERY fixed-archetype feasible mechanical option on
  // the actual electricity + equipment-manufacturing marginal cost.
  const mechanicalCost = (candidate: EvaluatedWholeHouseConfiguration) =>
    (candidate.annual.ventilationElectricalKWh + candidate.annual.fanElectricalKWh) * lifecycleYears
    + candidate.manufacturing.ductAndOpeningsKWh
    + candidate.manufacturing.controlsAndHeatRecoveryKWh;
  const selected: EvaluatedWholeHouseConfiguration = isBaseline ? airflow.baseline
    : airflow.ranked.filter(candidate => candidate.feasible).reduce(
      (lowest, candidate) => !lowest || mechanicalCost(candidate) < mechanicalCost(lowest)
        ? candidate : lowest,
      null as EvaluatedWholeHouseConfiguration | null,
    ) || airflow.best;
  // Site + Shadow assumes a natural ventilation cooling benefit. It cannot
  // ALSO be credited while claiming a mechanical HRV/fan strategy. Recalculate
  // the source cooling formula without the natural-ventilation term, keeping
  // the solar and sensible load contribution on Site + Shadow's boundary.
  const coolingWithoutNaturalCreditKWh = Math.max(0,
    (site.operational.envelopeCoolingKWh + site.solar.coolingSolarPenaltyKWh * 0.9) / coolingCOP);
  const annualSiteElectricalKWh = site.operational.annualHeatingElectricalKWh
    + coolingWithoutNaturalCreditKWh;
  const naturalVentilationCreditRemovedElectricalKWh = Math.max(0,
    annualSiteElectricalKWh - site.operational.annualTotalKWh);
  const annualVentilationElectricalKWh = selected.annual.ventilationElectricalKWh;
  const annualFanElectricalKWh = selected.annual.fanElectricalKWh;
  const annualCombinedElectricalKWh = annualSiteElectricalKWh
    + annualVentilationElectricalKWh + annualFanElectricalKWh;
  const siteManufacturingKWh = site.manufacturing.totalKWh;
  const extraMechanicalManufacturingKWh = selected.manufacturing.ductAndOpeningsKWh
    + selected.manufacturing.controlsAndHeatRecoveryKWh;
  const combinedManufacturingKWh = siteManufacturingKWh + extraMechanicalManufacturingKWh;
  return {
    site,
    rooms,
    layout,
    selectedAirflow: selected.configuration,
    mechanicalScreen: {
      feasible: selected.feasible,
      meanComfortDeviationC: selected.performance.meanComfortDeviationC,
      estimatedNoiseDbA: selected.performance.estimatedNoiseDbA,
      massBalanceResidualLs: selected.performance.maximumMassBalanceResidualLs,
    },
    energy: {
      annualSiteElectricalKWh: round(annualSiteElectricalKWh),
      naturalVentilationCreditRemovedElectricalKWh: round(naturalVentilationCreditRemovedElectricalKWh),
      annualVentilationElectricalKWh: round(annualVentilationElectricalKWh),
      annualFanElectricalKWh: round(annualFanElectricalKWh),
      annualCombinedElectricalKWh: round(annualCombinedElectricalKWh),
      siteManufacturingKWh: round(siteManufacturingKWh),
      extraMechanicalManufacturingKWh: round(extraMechanicalManufacturingKWh),
      combinedManufacturingKWh: round(combinedManufacturingKWh),
      totalLifecycleKWh: round(annualCombinedElectricalKWh * lifecycleYears + combinedManufacturingKWh),
    },
    feasible: site.feasible && selected.feasible,
    configurationsEvaluated: airflow.candidatesEvaluated + (isBaseline ? 0 : 1),
  };
}

/**
 * Re-evaluates the PRE-SELECTED form, but does not optimise forms under the
 * combined objective. It compares a fixed baseline site + reference ventilation
 * against the site optimiser's chosen form + screened mechanical configuration.
 */
export function screenCoupledSiteAirflow(
  site: { baseline: EvaluatedSiteHouseDesign; best: EvaluatedSiteHouseDesign; location: SiteLocationProfile },
  config: {
    lifecycleYears?: number; maximumCandidates?: number; coolingCOP?: number;
    targetTempC?: number; hourlyOutdoorTemperaturesC?: number[];
  } = {},
): CoupledSiteFlowResult {
  const lifecycleYears = Math.min(100, Math.max(5, Number(config.lifecycleYears) || 30));
  // Mirror Site + Shadow's default and 1..8 clipping for cooling COP.
  const coolingCOP = Math.min(8, Math.max(1, Number(config.coolingCOP) || 3.2));
  const targetTempC = Math.min(28, Math.max(16, Number(config.targetTempC) || 22));
  const maximumCandidates = Math.min(1200, Math.max(48, Math.round(Number(config.maximumCandidates) || 108)));
  const baseline = evaluateCase(site.baseline, site.location, lifecycleYears, maximumCandidates, coolingCOP, true, targetTempC, config.hourlyOutdoorTemperaturesC);
  const proposed = evaluateCase(site.best, site.location, lifecycleYears, maximumCandidates, coolingCOP, false, targetTempC, config.hourlyOutdoorTemperaturesC);
  const areaDelta = Math.abs(baseline.layout.declaredFloorAreaM2 - proposed.layout.declaredFloorAreaM2);
  const floorAreaDifferencePercent = areaDelta / Math.max(1, baseline.layout.declaredFloorAreaM2) * 100;
  // Comparing differently-sized homes can look like an energy saving while
  // delivering a different floor area; treat > 5% area difference as a
  // comparison failure, with a conspicuous limit instead of a winner.
  const equalFloorArea = floorAreaDifferencePercent <= 5;
  const annualSavings = baseline.energy.annualCombinedElectricalKWh
    - proposed.energy.annualCombinedElectricalKWh;
  const lifecycleSavings = baseline.energy.totalLifecycleKWh
    - proposed.energy.totalLifecycleKWh;
  const qualifiesAsImprovement = baseline.feasible && proposed.feasible && equalFloorArea
    && lifecycleSavings > Math.max(10, baseline.energy.totalLifecycleKWh * 0.001);
  const reason = !baseline.feasible || !proposed.feasible
    ? 'No joint improvement: the baseline or candidate site/airflow design fails a project-defined feasibility screen.'
    : !equalFloorArea
      ? 'Not comparable: the selected design changes floor area by more than 5%; compare equivalent-area buildings before claiming savings.'
      : qualifiesAsImprovement
        ? 'Screened improvement under the same assumed detached-house geometry, climate and manufacturing accounting. Validate inputs before a construction decision.'
        : 'No verified positive lifecycle-energy difference under this coupled screening objective.';

  return {
    mode: 'same_site_detached_geometry_plus_mechanical_airflow',
    location: site.location,
    lifecycleYears,
    baseline,
    proposed,
    decision: {
      qualifiesAsImprovement,
      annualElectricalSavingsKWh: round(annualSavings),
      lifecycleEnergySavingsKWh: round(lifecycleSavings),
      lifecycleEnergySavingsPercent: round(lifecycleSavings / Math.max(1, baseline.energy.totalLifecycleKWh) * 100, 1),
      reason,
    },
    constraints: {
      bothSiteDesignsFeasible: baseline.site.feasible && proposed.site.feasible,
      bothMechanicalDesignsFeasible: baseline.mechanicalScreen.feasible && proposed.mechanicalScreen.feasible,
      equalFloorArea,
      floorAreaDifferencePercent: round(floorAreaDifferencePercent, 2),
    },
    limitations: [
      'This is a linked evaluation of a preselected site form and detached-house mechanical options, NOT a joint geometry/HVAC optimiser or CFD.',
      'Site + Shadow owns the whole envelope, solar and original building manufacture. Its natural-ventilation cooling credit is REMOVED before adding mechanically supplied ventilation and fans, to avoid claiming both benefits. Whole System adds ONLY mechanical ventilation, fans and extra manufacture; generic building, fabric and solar totals are excluded.',
      'Both components use the same selected indoor balance point and climate degree-day source (preset fit or station dry-bulb EPW). Even EPW-derived degree days do not make this an hourly dynamic heat-balance, irradiance, infiltration or HVAC simulation.',
      'Room rectangles are scaled surrogate topology from the site generator. Rooms conserve total declared area, but this does not prove doorway connections, real footprints, structural layout or occupants.',
      'Comparisons changing floor area by more than 5% fail the equivalence gate; similar area alone does not prove equal amenity or construction constraints.',
      'The mechanical and solar models use simplified independent assumptions; savings remain illustrative until validated against real buildings and engineering standards.',
      'This scenario concerns a detached-house proposal only; apartment archetype comparisons continue as a separate screening question.',
    ],
  };
}

/**
 * Jointly RANK a bounded geometry x mechanical portfolio:
 *  - source geometry generation remains site-only and deterministic;
 *  - mechanical configuration is re-evaluated for EACH generated footprint;
 *  - both subsystem gates and the equivalent-service (±5% area) rule apply.
 *
 * An ineligible site form may be reported for comparison but NEVER "win".
 * A failed reference gate prevents a defensible savings claim.
 */
export function searchCoupledSiteMechanicalPortfolio(
  site: { baseline: EvaluatedSiteHouseDesign; best: EvaluatedSiteHouseDesign; location: SiteLocationProfile },
  alternatives: EvaluatedSiteHouseDesign[],
  config: {
    lifecycleYears?: number; maximumCandidates?: number; coolingCOP?: number;
    targetTempC?: number; hourlyOutdoorTemperaturesC?: number[];
  } = {},
): JointSiteMechanicalSearch {
  const lifecycleYears = Math.min(100, Math.max(5, Number(config.lifecycleYears) || 30));
  const coolingCOP = Math.min(8, Math.max(1, Number(config.coolingCOP) || 3.2));
  const targetTempC = Math.min(28, Math.max(16, Number(config.targetTempC) || 22));
  const maximumCandidates = Math.min(108, Math.max(48, Math.round(Number(config.maximumCandidates) || 48)));
  const baseline = evaluateCase(site.baseline, site.location, lifecycleYears, maximumCandidates, coolingCOP, true, targetTempC, config.hourlyOutdoorTemperaturesC);

  // Server callers must re-evaluate EVERY proposal using the same site input
  // before calling this routine. Limit the portfolio independently of callers.
  const proposals = [site.baseline, site.best, ...alternatives.slice(0, 12)];
  const seen = new Set<string>();
  const cases: CoupledSiteFlowCase[] = [];
  for (const proposal of proposals) {
    const signature = JSON.stringify(proposal.design);
    if (seen.has(signature)) continue;
    seen.add(signature);
    cases.push(evaluateCase(proposal, site.location, lifecycleYears, maximumCandidates, coolingCOP, false, targetTempC, config.hourlyOutdoorTemperaturesC));
  }
  const siteOnlyChoice = cases.find(candidate =>
    JSON.stringify(candidate.site.design) === JSON.stringify(site.best.design))!;
  const areaReference = baseline.layout.declaredFloorAreaM2;
  const eligible = (candidate: CoupledSiteFlowCase) => candidate.feasible
    && Math.abs(candidate.layout.declaredFloorAreaM2 - areaReference) <= areaReference * 0.05;

  // Feasible-first deterministic ranking, breaking exact ties by insertion
  // order. Never compare an ineligible design as though it were a real saving.
  const rankedCases = [...cases].sort((a, b) =>
    Number(eligible(b)) - Number(eligible(a))
    || a.energy.totalLifecycleKWh - b.energy.totalLifecycleKWh);
  const selected = rankedCases.find(eligible) || null;
  const feasibleEquivalentAreaCandidates = cases.filter(eligible).length;
  const mechanicalCandidatesEvaluated = cases.reduce((sum, c) => sum + c.configurationsEvaluated, 0);
  const verifiedReference = baseline.feasible;
  const difference = selected && verifiedReference
    ? baseline.energy.totalLifecycleKWh - selected.energy.totalLifecycleKWh : null;
  const improvementVsSiteOnly = selected && eligible(siteOnlyChoice)
    ? siteOnlyChoice.energy.totalLifecycleKWh - selected.energy.totalLifecycleKWh : null;
  const qualifiesAsImprovement = difference !== null && difference >
    Math.max(10, baseline.energy.totalLifecycleKWh * 0.001);
  const outcome = !selected
    ? 'No jointly feasible comparable-area geometry and ventilation combination was found in the bounded portfolio.'
    : !verifiedReference
      ? 'A feasible geometry/ventilation pairing was identified, but the reference fails feasibility screening; energy savings cannot be claimed against it.'
      : qualifiesAsImprovement
        ? 'The lowest-lifecycle-energy feasible geometry/ventilation pairing in the tested portfolio beats the reference under stated assumptions; not a global optimum or verified build.'
        : 'No tested feasible pairing demonstrated an improvement beyond the screening threshold against the reference.';

  return {
    mode: 'bounded_joint_geometry_mechanical_selection',
    geometryCandidatesEvaluated: cases.length,
    mechanicalCandidatesEvaluated,
    feasibleEquivalentAreaCandidates,
    maximumMechanicalCandidatesPerSite: maximumCandidates,
    selected,
    siteOnlyChoice,
    baseline,
    ranked: rankedCases.slice(0, 6).map(item => ({
      form: item.site.design.form,
      areaM2: item.site.design.floorAreaM2,
      annualElectricalKWh: item.energy.annualCombinedElectricalKWh,
      totalLifecycleKWh: item.energy.totalLifecycleKWh,
      airflowControl: item.selectedAirflow.control,
      heatRecoveryEfficiency: item.selectedAirflow.heatRecoveryEfficiency,
      eligible: eligible(item),
    })),
    lifecycleSavingsAgainstReferenceKWh: difference === null ? null : round(difference),
    lifecycleSavingsVsSiteOnlyChoiceKWh: improvementVsSiteOnly === null ? null : round(improvementVsSiteOnly),
    qualifiesAsImprovement,
    outcome,
    limitations: [
      'Bounded joint SELECTION across at most 14 site/ventilation pairings. Geometry candidates were generated by a site-only objective, NOT by a fully co-optimised physical model; no global optimality claim.',
      'Geometry shortlist spans up to three distinct eligible designs per form, plus the site-only choice and the original baseline; untested site designs may outperform them.',
      'Surrogate rooms are generated, uniformly area-corrected rectangles, not a surveyed architectural plan or measured doorway/cavity network.',
      'All options are fixed detached-house building archetypes; do not generalise conclusions to apartment party walls or common services.',
      'Site envelope, windows, sun and embodied construction are counted once; mechanically supplied ventilation, fans and extra equipment are additional. Natural-ventilation credits are removed under mechanical control.',
      'Site + Shadow and airflow use the same selected indoor balance temperature; EPW hourly dry-bulb may supply both climate inputs, otherwise both use a fitted preset. Solar, fabric dynamics and HVAC remain simplified: not calibrated EnergyPlus/CFD or ASHRAE Standard 140 certified.',
      'Only comparable floor areas within 5% and project-screen feasible candidates can be selected. Matching floor area alone cannot prove equal liveability.',
      'Manufacturing allowances are not product EPD evidence; confirm building permissions, costs, surveyed geometry and local hazards before making a real construction choice.',
    ],
  };
}
