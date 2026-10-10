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
import { DEFAULT_DEGREE_DAY_BASE_TEMP_C } from './degree_day_setpoint';

/**
 * Couples a site design's proposed room topology to a DETACHED-house mechanical
 * airflow sweep. This does not turn the detached-house site geometry into a
 * real-world apartment, a CFD model, or a measured as-built floor plan.
 *
 * Scope of additive lifecycle accounting:
 * - Site engine owns construction, envelope, glazing, solar and natural-vent
 *   operational allowance. Use its full annual and embodied totals.
 * - Whole-house engine owns only NEW mechanical fresh-air + fan electricity and
 *   duct/openings/controls/HRV manufacturing. EXCLUDE its generic building
 *   embodied, opaque-fabric, and solar terms to prevent double counting.
 *
 * Both models use the original site-preset degree-day climate at 18 C base.
 * Hourly EPW weather isn't used here: Site + Shadow is still not hourly and
 * mixing different climate bases into a "combined saving" would be misleading.
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
  isBaseline: boolean,
): CoupledSiteFlowCase {
  const { rooms, layout } = roomsFromSiteDesign(site);
  const input: WholeHouseOptimizerInput = {
    rooms,
    location,
    fixedArchetype: 'detached',
    // Exactly the site model's preset balance temperature; keep the two
    // reduced-order calculations on the SAME weather basis.
    targetTempC: DEFAULT_DEGREE_DAY_BASE_TEMP_C,
    lifecycleYears,
    maximumCandidates,
  };
  const airflow = optimizeWholeHouseSystem(input);
  const selected: EvaluatedWholeHouseConfiguration = isBaseline ? airflow.baseline : airflow.best;
  const annualSiteElectricalKWh = site.operational.annualTotalKWh;
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
  config: { lifecycleYears?: number; maximumCandidates?: number } = {},
): CoupledSiteFlowResult {
  const lifecycleYears = Math.min(100, Math.max(5, Number(config.lifecycleYears) || 30));
  const maximumCandidates = Math.min(1200, Math.max(48, Math.round(Number(config.maximumCandidates) || 108)));
  const baseline = evaluateCase(site.baseline, site.location, lifecycleYears, maximumCandidates, true);
  const proposed = evaluateCase(site.best, site.location, lifecycleYears, maximumCandidates, false);
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
      'Site + Shadow owns the whole envelope, solar, natural ventilation and original building manufacture; Whole System adds ONLY mechanical ventilation, fans and their extra manufacture. Its generic building, fabric and solar totals are explicitly excluded to prevent double counting.',
      'Both components use the site climate preset at an 18 C degree-day balance reference, NOT a verified hourly heat-balance model or an 18 C thermostat requirement. The separately configured EPW hourly route is not applied to this coupled result.',
      'Room rectangles are scaled surrogate topology from the site generator. Rooms conserve total declared area, but this does not prove doorway connections, real footprints, structural layout or occupants.',
      'Comparisons changing floor area by more than 5% fail the equivalence gate; similar area alone does not prove equal amenity or construction constraints.',
      'The mechanical and solar models use simplified independent assumptions; savings remain illustrative until validated against real buildings and engineering standards.',
      'This scenario concerns a detached-house proposal only; apartment archetype comparisons continue as a separate screening question.',
    ],
  };
}
