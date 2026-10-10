/**
 * Deterministic, offline EnergyPlus Weather (EPW) temperature ingestion.
 *
 * EPW: 8 header rows, then 8760/8784 one-hour rows; field 7 (zero-based
 * index 6) is dry-bulb temperature in deg C, with 99.9 meaning missing.
 *
 * We intentionally DO NOT use GHI as vertical-facade solar gains. This file
 * replaces the synthetic degree-day profile with observed/typical hourly air
 * temperatures only, for reduced-order HVAC/fabric load screening. It is not
 * an EnergyPlus simulation, a validation, or an hourly dynamic thermal model.
 *
 * Reference: EnergyPlus Auxiliary Programs, "EPW Weather File Format".
 */

export interface EpwTemperatureProfile {
  stationName: string;
  stationRegion: string;
  country: string;
  source: string;
  stationLatitudeDeg: number;
  stationLongitudeDeg: number;
  stationElevationM: number;
  weatherHours: 8760 | 8784;
  outdoorTemperaturesC: number[];
}

export interface HourlyDegreeDayResult {
  heatingDegreeDays: number;
  coolingDegreeDays: number;
}

const MONTH_DAYS_365 = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function requiredNumber(text: string, label: string): number {
  const value = Number(text?.trim());
  if (!text?.trim() || !Number.isFinite(value)) throw new Error(`Invalid EPW ${label}.`);
  return value;
}

/** Reject bad/missing samples instead of silently synthesising an ideal year. */
export function parseEpwTemperatureProfile(sourceText: string): EpwTemperatureProfile {
  if (typeof sourceText !== 'string' || sourceText.length > 5_000_000) {
    throw new Error('EPW content must be text no larger than 5 MB.');
  }
  const rows = sourceText.replace(/^\uFEFF/, '').replace(/\r/g, '').trim().split('\n');
  if (rows.length < 8 + 8760) throw new Error('EPW is missing hourly data.');
  const location = rows[0].split(',');
  if (location[0]?.trim().toUpperCase() !== 'LOCATION' || location.length < 10) {
    throw new Error('Missing EPW LOCATION header.');
  }
  const stationLatitudeDeg = requiredNumber(location[6], 'latitude');
  const stationLongitudeDeg = requiredNumber(location[7], 'longitude');
  const stationElevationM = requiredNumber(location[9], 'elevation');
  if (Math.abs(stationLatitudeDeg) > 90 || Math.abs(stationLongitudeDeg) > 180) {
    throw new Error('EPW station coordinates are out of range.');
  }
  const data = rows.slice(8).filter(line => line.trim() !== '');
  if (data.length !== 8760 && data.length !== 8784) {
    throw new Error('EPW must have exactly 8760 or 8784 hourly records.');
  }
  const weatherHours = data.length as 8760 | 8784;
  const monthDays = [...MONTH_DAYS_365];
  if (weatherHours === 8784) monthDays[1] = 29;
  const expectedDates: Array<{ month: number; day: number }> = [];
  for (let month = 1; month <= 12; month += 1) {
    for (let day = 1; day <= monthDays[month - 1]; day += 1) {
      expectedDates.push({ month, day });
    }
  }

  const outdoorTemperaturesC = new Array<number>(weatherHours);
  for (let index = 0; index < weatherHours; index += 1) {
    const fields = data[index].split(',');
    if (fields.length < 35) throw new Error(`EPW hour ${index + 1}: incomplete data row.`);
    const expected = expectedDates[Math.floor(index / 24)];
    if (requiredNumber(fields[1], 'month') !== expected.month
      || requiredNumber(fields[2], 'day') !== expected.day
      || requiredNumber(fields[3], 'hour') !== index % 24 + 1) {
      throw new Error(`EPW hour ${index + 1}: missing, repeated or unordered timestamp.`);
    }
    const temperature = requiredNumber(fields[6], 'dry-bulb temperature');
    if (temperature < -70 || temperature > 70) {
      throw new Error(`EPW hour ${index + 1}: invalid or missing dry-bulb temperature.`);
    }
    outdoorTemperaturesC[index] = temperature;
  }
  return {
    stationName: location[1]?.trim() || 'Unknown station',
    stationRegion: location[2]?.trim() || '',
    country: location[3]?.trim() || '',
    source: location[4]?.trim() || 'EPW station file',
    stationLatitudeDeg,
    stationLongitudeDeg,
    stationElevationM,
    weatherHours,
    outdoorTemperaturesC,
  };
}

/** Great-circle station-to-site distance; comparisons have NO survey precision. */
export function weatherStationDistanceKm(
  stationLatDeg: number,
  stationLonDeg: number,
  siteLatDeg: number,
  siteLonDeg: number,
): number {
  const coords = [stationLatDeg, stationLonDeg, siteLatDeg, siteLonDeg];
  if (!coords.every(Number.isFinite) || Math.abs(stationLatDeg) > 90
    || Math.abs(siteLatDeg) > 90 || Math.abs(stationLonDeg) > 180
    || Math.abs(siteLonDeg) > 180) return Infinity;
  const rad = Math.PI / 180;
  const dLat = (siteLatDeg - stationLatDeg) * rad;
  const dLon = (siteLonDeg - stationLonDeg) * rad;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(stationLatDeg * rad) * Math.cos(siteLatDeg * rad) * Math.sin(dLon / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Sum one-hour heating/cooling deltas / 24 h per day.
 * A leap year's 8784 samples are normalised to 365 days for a comparable
 * annual screening horizon; caller reports this annualisation explicitly.
 */
export function hourlyDegreeDays(
  temperaturesC: readonly number[],
  balanceTemperatureC: number,
): HourlyDegreeDayResult {
  if ((temperaturesC.length !== 8760 && temperaturesC.length !== 8784)
    || !Number.isFinite(balanceTemperatureC) || balanceTemperatureC < -70 || balanceTemperatureC > 70) {
    throw new Error('Annual hourly degree days need 8760 or 8784 hours and a finite balance temperature.');
  }
  let heating = 0;
  let cooling = 0;
  for (const temperature of temperaturesC) {
    if (!Number.isFinite(temperature) || temperature < -70 || temperature > 70) {
      throw new Error('Annual temperature profile contains missing or invalid hours.');
    }
    if (temperature < balanceTemperatureC) heating += balanceTemperatureC - temperature;
    else cooling += temperature - balanceTemperatureC;
  }
  const annualise = 8760 / temperaturesC.length / 24;
  return {
    heatingDegreeDays: heating * annualise,
    coolingDegreeDays: cooling * annualise,
  };
}
