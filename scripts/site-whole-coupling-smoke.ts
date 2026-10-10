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
  baselineDesign: same.baseline.site.design.form,
  proposedDesign: same.proposed.site.design.form,
  baselineKWh: same.baseline.energy.totalLifecycleKWh,
  candidateKWh: same.proposed.energy.totalLifecycleKWh,
  accepted: same.decision.qualifiesAsImprovement,
  baselineRoomCount: same.baseline.rooms.length,
  candidateRoomCount: same.proposed.rooms.length,
  siteRoomAreaM2: same.proposed.layout.scaledRoomAreaM2,
}, null, 2));
