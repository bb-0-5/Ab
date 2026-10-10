import assert from 'node:assert/strict';
import {
  evaluateSiteReference,
  evaluateSiteHouseDesign,
  optimizeSiteGeometry,
  SITE_LOCATION_PRESETS,
} from '../src/lib/site_geometry_optimizer';
import { adjustDegreeDaysForSetpoint } from '../src/lib/degree_day_setpoint';
import { hourlyDegreeDays } from '../src/lib/hourly_weather';
import { screenCoupledSiteAirflow } from '../src/lib/site_whole_house_coupling';

const near = (a: number, b: number, max = 0.01) =>
  assert.ok(Math.abs(a - b) <= max, `Expected ${a} ≈ ${b}`);

const location = SITE_LOCATION_PRESETS.bendigo;
const baselinePreset = evaluateSiteReference({ location, targetIndoorTempC: 18 });
const warmerPreset = evaluateSiteReference({ location, targetIndoorTempC: 22 });
near(baselinePreset.operational.envelopeHeatingKWh,
  baselinePreset.operational.envelopeHeatingKWh, 0);
assert.ok(warmerPreset.operational.envelopeHeatingKWh > baselinePreset.operational.envelopeHeatingKWh,
  'Raising indoor balance temperature must raise preset heating demand.');
assert.ok(warmerPreset.operational.envelopeCoolingKWh < baselinePreset.operational.envelopeCoolingKWh,
  'Raising indoor balance temperature must reduce preset cooling demand.');
const expectedPreset = adjustDegreeDaysForSetpoint(location, 22);
const baselineUa = baselinePreset.operational.envelopeHeatingKWh * 1000
  / (location.heatingDegreeDays * 24);
near(warmerPreset.operational.envelopeHeatingKWh, baselineUa * expectedPreset.heatingDegreeDays * 24 / 1000, 0.1);

const cold = Array(8760).fill(10) as number[];
const input = {
  location,
  targetFloorAreaM2: 130,
  minFloorAreaM2: 125,
  maxFloorAreaM2: 135,
  iterations: 300,
  seed: 10091,
  hourlyOutdoorTemperaturesC: cold,
  hourlyWeatherSource: {
    stationName: 'Synthetic fixed 10 C station',
    source: 'UNIT TEST; NOT A REAL STATION',
    stationDistanceKm: 0,
  },
};
const site20 = optimizeSiteGeometry({ ...input, targetIndoorTempC: 20 });
const site21 = optimizeSiteGeometry({ ...input, targetIndoorTempC: 21 });
assert.equal(site20.weatherContext.mode, 'epw_hourly_temperature');
assert.equal(site20.weatherContext.weatherHours, 8760);
assert.equal(site20.weatherContext.stationName, 'Synthetic fixed 10 C station');
near(site20.weatherContext.heatingDegreeDays, 3650);
near(site20.weatherContext.coolingDegreeDays, 0);
near(site21.weatherContext.heatingDegreeDays, 4015);
assert.ok(site21.baseline.operational.envelopeHeatingKWh > site20.baseline.operational.envelopeHeatingKWh);
near(site20.baseline.operational.envelopeHeatingKWh,
  baselineUa * 3650 * 24 / 1000, 0.2);
const expected = hourlyDegreeDays(cold, 20);
near(expected.heatingDegreeDays, site20.weatherContext.heatingDegreeDays, 0);
assert.deepEqual(site20, optimizeSiteGeometry({ ...input, targetIndoorTempC: 20 }),
  'Given same station data and seed, site results must be reproducible.');

const evaluated = evaluateSiteHouseDesign(site20.best.design, {
  ...input, targetIndoorTempC: 20,
});
near(evaluated.totalLifecycleEnergyKWh, site20.best.totalLifecycleEnergyKWh, 0.1);
const connected = screenCoupledSiteAirflow(site20, {
  targetTempC: 20,
  hourlyOutdoorTemperaturesC: cold,
  lifecycleYears: 30,
  maximumCandidates: 48,
});
near(connected.proposed.site.operational.annualTotalKWh, site20.best.operational.annualTotalKWh, 0.01);
assert.ok(Number.isFinite(connected.proposed.energy.totalLifecycleKWh));
const warmer = screenCoupledSiteAirflow(site21, {
  targetTempC: 21,
  hourlyOutdoorTemperaturesC: cold,
  maximumCandidates: 48,
});
assert.ok(warmer.baseline.energy.annualSiteElectricalKWh > connected.baseline.energy.annualSiteElectricalKWh);
assert.notEqual(warmer.proposed.energy.annualVentilationElectricalKWh,
  connected.proposed.energy.annualVentilationElectricalKWh,
  'Connected mechanical ventilation must see the SAME changed degree-day climate as the site.');
const preset = optimizeSiteGeometry({
  location, iterations: 300, seed: input.seed, targetIndoorTempC: 20,
  weatherFallbackReason: 'EPW station was too far from this site',
});
assert.equal(preset.weatherContext.mode, 'preset_fitted_degree_days');
assert.match(preset.weatherContext.note, /too far/);
console.log(JSON.stringify({
  verified: true,
  presetSetpointHeatingMonotonic: true,
  epwHours: site20.weatherContext.weatherHours,
  epwHeatDegreeDays: site20.weatherContext.heatingDegreeDays,
  linkedSetpointAndClimateConsistent: true,
  skippedHourlyIrradiance: true,
}, null, 2));
