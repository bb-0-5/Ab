import {
  hourlyDegreeDays,
  parseEpwTemperatureProfile,
  weatherStationDistanceKm,
} from '../src/lib/hourly_weather';
import { optimizeWholeHouseSystem } from '../src/lib/whole_house_optimizer';

function assertNear(actual: number, expected: number, label: string, tolerance = 1e-7) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: ${actual} did not equal ${expected}`);
  }
}
function expectedToThrow(name: string, fn: () => unknown) {
  let threw = false;
  try { fn(); } catch { threw = true; }
  if (!threw) throw new Error(`Invalid EPW was incorrectly accepted: ${name}`);
}
function makeEpw(year: number, temperatureC: (hour: number) => number): string {
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const hours = (leap ? 366 : 365) * 24;
  const lines = [
    'LOCATION,Bendigo,VIC,AUS,SYNTHETIC_TEST,000000,-36.760,144.280,10,225',
    'DESIGN CONDITIONS,0',
    'TYPICAL/EXTREME PERIODS,0',
    'GROUND TEMPERATURES,0',
    'HOLIDAYS/DAYLIGHT SAVINGS,No,0,0,0',
    'COMMENTS 1,Synthetic tests, not measured weather',
    'COMMENTS 2,No solar data',
    'DATA PERIODS,1,1,Data,Sunday, 1/ 1,12/31',
  ];
  for (let index = 0; index < hours; index += 1) {
    const date = new Date(Date.UTC(year, 0, 1 + Math.floor(index / 24)));
    const row = Array(35).fill('0');
    row[0] = String(year);
    row[1] = String(date.getUTCMonth() + 1);
    row[2] = String(date.getUTCDate());
    row[3] = String(index % 24 + 1);
    row[4] = '60';
    row[5] = '?0';
    row[6] = String(temperatureC(index));
    lines.push(row.join(','));
  }
  return lines.join('\n');
}

const constantTen = parseEpwTemperatureProfile(makeEpw(2025, () => 10));
if (constantTen.weatherHours !== 8760 || constantTen.stationName !== 'Bendigo') {
  throw new Error('EPW header or 365-day record count not preserved.');
}
const annual = hourlyDegreeDays(constantTen.outdoorTemperaturesC, 20);
assertNear(annual.heatingDegreeDays, 3650, '10 C whole-year heat demand at 20 C');
assertNear(annual.coolingDegreeDays, 0, '10 C whole-year cooling demand at 20 C');
const leap = parseEpwTemperatureProfile(makeEpw(2024, () => 10));
if (leap.weatherHours !== 8784) throw new Error('Leap EPW record count not preserved.');
assertNear(hourlyDegreeDays(leap.outdoorTemperaturesC, 20).heatingDegreeDays, 3650, 'Leap annualisation');
assertNear(hourlyDegreeDays(new Array(8760).fill(25), 20).coolingDegreeDays, 1825, 'Hourly cooling');
const mixed = hourlyDegreeDays(new Array(8760).fill(0).map((_, hour) => hour % 2 ? 25 : 15), 20);
assertNear(mixed.heatingDegreeDays, 912.5, 'Mixed heating');
assertNear(mixed.coolingDegreeDays, 912.5, 'Mixed cooling');
assertNear(weatherStationDistanceKm(-36.76, 144.28, -36.76, 144.28), 0, 'Same site distance');
if (weatherStationDistanceKm(-36.76, 144.28, 0, 0) < 75) {
  throw new Error('Distant station was incorrectly considered local.');
}
const valid = makeEpw(2025, () => 10);
expectedToThrow('missing dry bulb', () => parseEpwTemperatureProfile(valid.replace(',10,0,0,0,', ',99.9,0,0,0,')));
expectedToThrow('truncated', () => parseEpwTemperatureProfile(valid.split('\n').slice(0, -1).join('\n')));
const lines = valid.split('\n');
lines[8] = lines[8].replace(',1,1,1,', ',1,1,2,');
expectedToThrow('duplicate hour', () => parseEpwTemperatureProfile(lines.join('\n')));
expectedToThrow('invalid hours', () => hourlyDegreeDays(new Array(8759).fill(10), 20));
expectedToThrow('invalid temperature', () => hourlyDegreeDays(new Array(8760).fill(99.9), 20));

const input = {
  maximumCandidates: 48,
  targetTempC: 20,
  hourlyOutdoorTemperaturesC: constantTen.outdoorTemperaturesC,
  hourlyWeatherSource: { stationName: constantTen.stationName, source: 'SYNTHETIC_TEST', stationDistanceKm: 0 },
};
const run = optimizeWholeHouseSystem(input);
if (run.weatherContext.mode !== 'epw_hourly_temperature' || run.weatherContext.weatherHours !== 8760) {
  throw new Error('Whole-house optimizer failed to select the hourly data source.');
}
assertNear(run.weatherContext.heatingDegreeDays, 3650, 'Weather propagated to optimisation');
const warmerSetpoint = optimizeWholeHouseSystem({ ...input, targetTempC: 21 });
assertNear(warmerSetpoint.weatherContext.heatingDegreeDays, 4015, 'Temperature setpoint propagated');
if (warmerSetpoint.best.annual.envelopeElectricalKWh <= run.best.annual.envelopeElectricalKWh) {
  throw new Error('Higher heating setpoint must increase heat-loss demand under constant-cold weather.');
}
const fallback = optimizeWholeHouseSystem({
  maximumCandidates: 48,
  weatherFallbackReason: 'synthetic station too distant',
});
if (fallback.weatherContext.mode !== 'preset_fitted_degree_days'
  || !fallback.weatherContext.note.includes('station too distant')) {
  throw new Error('Fallback provenance and warning were lost.');
}
console.log(JSON.stringify({
  verified: true,
  hours: [constantTen.weatherHours, leap.weatherHours],
  hourlyHeatingDegreeDays: run.weatherContext.heatingDegreeDays,
  stationDistanceKm: 0,
  heatingSetpointMonotonic: true,
}, null, 2));
