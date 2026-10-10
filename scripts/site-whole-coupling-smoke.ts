import assert from 'node:assert/strict';
import {
  evaluateSiteHouseDesign,
  optimizeSiteGeometry,
  SITE_LOCATION_PRESETS,
} from '../src/lib/site_geometry_optimizer';
import { optimizeWholeHouseSystem } from '../src/lib/whole_house_optimizer';
import {
  roomsFromSiteDesign,
  screenCoupledSiteAirflow,
  searchCoupledSiteMechanicalPortfolio,
} from '../src/lib/site_whole_house_coupling';

// A deterministic synthetic building, NOT a measured Australian building.
const input = {
  location: SITE_LOCATION_PRESETS.bendigo,
  targetFloorAreaM2: 130,
  minFloorAreaM2: 120,
  maxFloorAreaM2: 140,
  lotWidthM: 24,
  lotDepthM: 40,
  targetIndoorTempC: 22,
  lifecycleYears: 30,
  iterations: 120,
  seed: 2419,
  requirements: {
    designWindSpeedMs: 40,
    floodFloorElevationM: 0,
    bushfireAttackLevel: 'none' as const,
    seismicClass: 'low' as const,
    snowLoadKPa: 0,
    maxUnsupportedSpanM: 12,
  },
};
const site = optimizeSiteGeometry(input);
// The site optimiser must keep only a BOUNDED, deterministic feasible
// same-service-area shortlist. It cannot choose winners by shrinking floor area.
assert.ok(site.feasibleShortlist.length > 0 && site.feasibleShortlist.length <= 12,
  'Site search must retain a bounded diverse portfolio.');
assert.deepEqual(site.feasibleShortlist, optimizeSiteGeometry(input).feasibleShortlist,
  'Geometry shortlist must replay deterministically for the same seed.');
for (const geometry of site.feasibleShortlist) {
  assert.equal(geometry.feasible, true);
  assert.ok(Math.abs(geometry.design.floorAreaM2 - site.baseline.design.floorAreaM2)
    <= site.baseline.design.floorAreaM2 * 0.05 + 0.0001,
    'Shortlist cannot claim smaller buildings as equivalent-service savings.');
}
const forms = new Set(site.feasibleShortlist.map(candidate => candidate.design.form));
assert.ok(forms.size >= 2, 'Search needs geometrically diverse forms before mechanical reranking.');

const joint = searchCoupledSiteMechanicalPortfolio(site, site.feasibleShortlist, {
  lifecycleYears: 30, coolingCOP: 3.2, maximumCandidates: 48,
});
assert.deepEqual(joint, searchCoupledSiteMechanicalPortfolio(site, site.feasibleShortlist, {
  lifecycleYears: 30, coolingCOP: 3.2, maximumCandidates: 48,
}), 'Joint portfolio selection must be deterministic.');
assert.equal(joint.mode, 'bounded_joint_geometry_mechanical_selection');
assert.ok(joint.geometryCandidatesEvaluated <= 14 && joint.geometryCandidatesEvaluated >= 2);
assert.ok(joint.mechanicalCandidatesEvaluated >= joint.geometryCandidatesEvaluated * 48);
assert.ok(joint.mechanicalCandidatesEvaluated <= joint.geometryCandidatesEvaluated * 49);
assert.ok(joint.ranked.every(row => Number.isFinite(row.totalLifecycleKWh) && row.totalLifecycleKWh > 0));
if (joint.selected) {
  assert.equal(joint.selected.feasible, true);
  assert.ok(joint.selected.layout.declaredFloorAreaM2 >= site.baseline.design.floorAreaM2 * 0.95 - 0.0001);
  assert.ok(joint.selected.layout.declaredFloorAreaM2 <= site.baseline.design.floorAreaM2 * 1.05 + 0.0001);
  assert.equal(joint.ranked[0].eligible, true);
  // The joint selector must do AT LEAST as well as the selected site-only
  // geometry + mechanical sweep whenever that candidate is comparable.
  if (joint.siteOnlyChoice.feasible
    && Math.abs(joint.siteOnlyChoice.site.design.floorAreaM2 - site.baseline.design.floorAreaM2)
      <= site.baseline.design.floorAreaM2 * 0.05) {
    assert.ok(joint.selected.energy.totalLifecycleKWh <= joint.siteOnlyChoice.energy.totalLifecycleKWh + 0.001,
      'Joint selection must not prefer a more expensive feasible pair over the site-only choice.');
  }
}
const noFeasible = searchCoupledSiteMechanicalPortfolio({
  ...site,
  baseline: { ...site.baseline, feasible: false },
  best: { ...site.best, feasible: false },
}, [], { maximumCandidates: 48 });
assert.equal(noFeasible.selected, null, 'No feasible site must never produce a fictitious winner.');
assert.equal(noFeasible.qualifiesAsImprovement, false);

const same = screenCoupledSiteAirflow(site, { lifecycleYears: 30, maximumCandidates: 48 });
const repeat = screenCoupledSiteAirflow(site, { lifecycleYears: 30, maximumCandidates: 48 });
assert.deepEqual(same, repeat, 'Same site + same input must produce deterministic coupled output.');
assert.equal(same.mode, 'same_site_detached_geometry_plus_mechanical_airflow');
assert.equal(same.baseline.configurationsEvaluated, 48);
assert.equal(same.proposed.configurationsEvaluated, 49);
assert.equal(same.proposed.selectedAirflow.archetype, 'detached', 'Never apply detached geometry as a verified apartment archetype.');
assert.ok(same.baseline.rooms.length >= 4 && same.proposed.rooms.length >= 4);

for (const item of [same.baseline, same.proposed]) {
  assert.ok(Number.isFinite(item.energy.totalLifecycleKWh) && item.energy.totalLifecycleKWh > 0);
  assert.ok(Math.abs(item.layout.scaledRoomAreaM2 - item.layout.declaredFloorAreaM2) < 0.02,
    'Surrogate plan must preserve declared area after normalisation.');
  assert.ok(item.rooms.every(room => room.ceilingHeight === item.site.design.ceilingHeightM && room.width > 0));
  assert.equal(item.energy.siteManufacturingKWh, item.site.manufacturing.totalKWh,
    'Site construction should be counted once, without generic whole-house building manufacturing.');
  assert.ok(item.energy.extraMechanicalManufacturingKWh > 0);
  assert.ok(item.energy.naturalVentilationCreditRemovedElectricalKWh >= 0);
  assert.ok(item.energy.annualSiteElectricalKWh >= item.site.operational.annualTotalKWh - 0.2,
    'Adding mechanical ventilation must not preserve a simultaneous natural ventilation credit.');
  assert.ok(Math.abs(item.energy.annualCombinedElectricalKWh
      - (item.energy.annualSiteElectricalKWh
        + item.energy.annualVentilationElectricalKWh
        + item.energy.annualFanElectricalKWh)) < 0.04,
    'Site and mechanical energies must have separate disjoint accounting.');
  assert.ok(Math.abs(item.energy.totalLifecycleKWh
      - (item.energy.annualCombinedElectricalKWh * 30 + item.energy.combinedManufacturingKWh)) < 0.2,
    'Combined lifecycle must reconcile operation and embodied energy.');
  assert.ok(item.mechanicalScreen.massBalanceResidualLs < 0.1, 'Pressure solve must conserve mass.');
}

const screenedRoomInput = roomsFromSiteDesign(site.best);
const detached = optimizeWholeHouseSystem({
  rooms: screenedRoomInput.rooms,
  location: site.location,
  fixedArchetype: 'detached',
  targetTempC: 18,
  maximumCandidates: 48,
});
assert.equal(detached.candidatesEvaluated, 48);
assert.deepEqual(detached.searchCoverage.detached.evaluated, 48);
assert.equal(detached.archetypeComparisons.length, 1);
assert.equal(detached.best.configuration.archetype, 'detached');

// The NORMAL four-archetype path must still compare all four types.
const general = optimizeWholeHouseSystem({ rooms: screenedRoomInput.rooms, maximumCandidates: 48 });
assert.equal(general.archetypeComparisons.length, 4);
assert.equal(Object.values(general.searchCoverage).reduce((s, x) => s + x.evaluated, 0), 48);

const changedFloorArea = evaluateSiteHouseDesign(
  {
    ...site.best.design,
    floorAreaM2: site.baseline.design.floorAreaM2 * 1.3,
  },
  input,
);
const changed = screenCoupledSiteAirflow({
  location: site.location,
  baseline: site.baseline,
  best: changedFloorArea,
}, { lifecycleYears: 30, maximumCandidates: 48 });
assert.ok(changed.constraints.floorAreaDifferencePercent > 5);
assert.equal(changed.decision.qualifiesAsImprovement, false,
  'Unequal floor area is not an acceptable same-service lifecycle comparison.');
assert.match(changed.decision.reason, /area|feasibility/i);
assert.ok(changed.proposed.energy.annualVentilationElectricalKWh
  !== same.proposed.energy.annualVentilationElectricalKWh,
  'Changing the actual generated room floor area must change airflow demand.');

const bad = structuredClone(site.best);
bad.design.floorAreaM2 = 0;
assert.throws(() => roomsFromSiteDesign(bad), /usable floor area/);

console.log(JSON.stringify({
  mode: same.mode,
  candidateForms: [...forms],
  jointGeometryCount: joint.geometryCandidatesEvaluated,
  jointMechanicalCount: joint.mechanicalCandidatesEvaluated,
  jointWinner: joint.selected?.site.design.form ?? null,
  baselineDesign: same.baseline.site.design.form,
  proposedDesign: same.proposed.site.design.form,
  baselineKWh: same.baseline.energy.totalLifecycleKWh,
  candidateKWh: same.proposed.energy.totalLifecycleKWh,
  accepted: same.decision.qualifiesAsImprovement,
  baselineRoomCount: same.baseline.rooms.length,
  candidateRoomCount: same.proposed.rooms.length,
  siteRoomAreaM2: same.proposed.layout.scaledRoomAreaM2,
}, null, 2));
