/**
 * Persistent, bounded local search ledger for a single, truly comparable
 * detached-building problem. Different climate/data inputs must NEVER compete
 * on one leaderboard. No off-device computation or invented performance data.
 */
export interface BuildingRun {
  seed:number;
  location:string;
  areaM2:number;
  temperatureC:number;
  siteCandidates:number;
  mechanicalCandidates:number;
  eligible:number;
  comparisonSupported:boolean;
  qualifiesAsImprovement:boolean;
  baselineLifecycleKWh?:number;
  savingsVsBaselineKWh:number|null;
  best:null|{
    form:string;floorAreaM2:number;orientationDeg:number;ventilation:string;
    heatRecoveryPercent:number;annualElectricityKWh:number;lifecycleKWh:number;
    manufacturedKWh:number;geometry:Array<Array<{x:number;y:number}>>;feasible:boolean;
  };
  weather:{mode:string;stationName:string|null;weatherHours:number|null;note:string;stationDistanceKm:number|null};
  explanation:string;limitations:string[];
}
export interface Sample {
  seed:number;
  lifecycleKWh:number|null;
  annualKWh:number|null;
  eligible:boolean;
  improvement:boolean;
}
export interface BuildingCampaign {
  key:string;
  attempts:number;
  viableRuns:number;
  footprints:number;
  mechanical:number;
  nextSeed:number;
  samples:Sample[];
  best:BuildingRun|null;
  updatedAt:string;
}
const LEDGER_KEY='abovebound.building-campaigns.v2';
const MAX_CAMPAIGNS=12;
const MAX_SAMPLES=64;
export const advanceSeed=(n:number)=>((Math.floor(n)+7919)%2147483646+2147483646)%2147483646+1;
export function weatherFingerprint(text:string):string{
  if(!text)return 'preset';
  // Hash all bytes/characters, not only the filename, to prevent comparing
  // outcomes computed from different local weather files.
  let h=2166136261;
  for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}
  return `epw-${text.length}-${(h>>>0).toString(16)}`;
}
export function buildingKey(preset:string,area:number,temperature:number,weatherId:string):string{
  return JSON.stringify(['detached-joint-v2',preset,area,temperature,weatherId]);
}
export function emptyCampaign(key:string,seed:number):BuildingCampaign{
  return {key,attempts:0,viableRuns:0,footprints:0,mechanical:0,
    nextSeed:advanceSeed(seed),samples:[],best:null,updatedAt:''};
}
export function addBuildingRun(
  previous:BuildingCampaign,run:BuildingRun,seed:number,at:string,
):BuildingCampaign{
  if(!Number.isFinite(seed) || previous.samples.some(s=>s.seed===seed))return previous;
  const eligible=Boolean(run.best?.feasible&&Number.isFinite(run.best.lifecycleKWh)
    &&run.best.lifecycleKWh>0&&run.eligible>0);
  const sample:Sample={seed,lifecycleKWh:eligible?run.best!.lifecycleKWh:null,
    annualKWh:eligible?run.best!.annualElectricityKWh:null,eligible,
    improvement:eligible&&run.comparisonSupported&&run.qualifiesAsImprovement};
  const replaces=eligible && (!previous.best?.best?.feasible
    || run.best!.lifecycleKWh<previous.best.best.lifecycleKWh);
  return {
    ...previous,
    attempts:previous.attempts+1,
    viableRuns:previous.viableRuns+Number(eligible),
    footprints:previous.footprints+Math.max(0,run.siteCandidates||0),
    mechanical:previous.mechanical+Math.max(0,run.mechanicalCandidates||0),
    nextSeed:advanceSeed(seed),
    samples:[...previous.samples,sample].slice(-MAX_SAMPLES),
    best:replaces?run:previous.best,
    updatedAt:at,
  };
}
export function loadCampaign(key:string,seed:number):BuildingCampaign{
  try{
    const raw=JSON.parse(localStorage.getItem(LEDGER_KEY)||'[]');
    const found=Array.isArray(raw)?raw.find((c:BuildingCampaign)=>c?.key===key):null;
    if(found&&Number.isFinite(found.attempts)&&Array.isArray(found.samples))return found;
  }catch{/* private browsing or storage disabled */}
  return emptyCampaign(key,seed);
}
export function saveCampaign(value:BuildingCampaign):void{
  try{
    const raw=JSON.parse(localStorage.getItem(LEDGER_KEY)||'[]');
    const others=(Array.isArray(raw)?raw:[]).filter((c:BuildingCampaign)=>c?.key!==value.key);
    localStorage.setItem(LEDGER_KEY,JSON.stringify([value,...others].slice(0,MAX_CAMPAIGNS)));
  }catch{/* Storing progress is optional; calculations must still work. */}
}
