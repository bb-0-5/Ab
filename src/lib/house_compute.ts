/**
 * The original V12 engineering tools, executed on the user's CPU instead of
 * their former Express /api/house routes. NO derived value is fabricated:
 * dispatch invokes the same numeric modules that the server imported.
 *
 * The browser has no vetted station EPW or verified geospatial obstruction
 * dataset. Explicitly exclude caller-injected provenance and annotate the
 * preset-climate fallback instead of claiming site-specific measurements.
 */
import {
 optimizeSiteGeometry,evaluateSiteHouseDesign,evaluateSiteReference,
 assertSiteDesignWellFormed,SITE_LOCATION_PRESETS,
 type SiteGeometryOptimizationInput,type SiteHouseDesign,
} from './site_geometry_optimizer';
import {screenCoupledSiteAirflow,searchCoupledSiteMechanicalPortfolio} from './site_whole_house_coupling';
import {optimizeWholeHouseSystem,type WholeHouseOptimizerInput} from './whole_house_optimizer';
import {optimizeHvacCycle,type HvacCycleOptimizationInput} from './hvac_cycle_optimizer';
import {discoverAdaptiveWall,type AdaptiveWallOptimizationInput} from './adaptive_wall_optimizer';
import {optimizeRoomLifecycle,type RoomLifecycleOptimizationInput} from './room_lifecycle_optimizer';
import {runExistingHomeAutopilot,type ExistingHomeAutopilotInput} from './existing_home_autopilot';
import {runBuildingPhysicsValidation} from './building_physics_validation';
import {buildAutomaticSiteContext,type GeoJsonFeatureCollection,type SiteContextRoom} from './site_context';

export const BROWSER_HOUSE_ENDPOINTS=[
 '/api/house/optimize-site','/api/house/optimize-site-airflow',
 '/api/house/optimize-whole-system','/api/house/optimize-room',
 '/api/house/optimize-hvac-cycle','/api/house/optimize-adaptive-wall',
 '/api/house/existing-home-autopilot','/api/house/validation-report',
 '/api/house/site-context',
] as const;
export type HouseEndpoint=typeof BROWSER_HOUSE_ENDPOINTS[number];

const BROWSER_CLIMATE_NOTE='Local first-party preset degree-day climate. No externally verified EPW weather station or measured site shading supplied.';
function siteInput(value:unknown):SiteGeometryOptimizationInput{
 if(value!==undefined&&(value===null||typeof value!=='object'||Array.isArray(value)))
  throw new Error('Site optimisation needs an object.');
 const raw=value as SiteGeometryOptimizationInput||{};
 // Strip all cached/results-oriented fields that callers should not be
 // allowed to pass in as evidence.
 const {hourlyOutdoorTemperaturesC:_hourly,hourlyWeatherSource:_source,
 weatherFallbackReason:_reason,learnedDesigns:_inherited,...safe}=raw;
 return {...safe,
  location:{...SITE_LOCATION_PRESETS.custom,...(safe.location||{})},
  hourlyOutdoorTemperaturesC:undefined,
  hourlyWeatherSource:undefined,
  weatherFallbackReason:BROWSER_CLIMATE_NOTE,
  learnedDesigns:[],
 };
}
const obj=(value:unknown):Record<string,unknown>=>{
 if(value===null||typeof value!=='object'||Array.isArray(value))
  throw new Error('Simulation request must be an object.');
 return value as Record<string,unknown>;
};
export function runHouseComputation(path:HouseEndpoint,payload:unknown={},
 cachedGeoJson?:GeoJsonFeatureCollection|null):unknown {
 if(path==='/api/house/validation-report')return runBuildingPhysicsValidation();
 const raw=obj(payload);
 switch(path){
  case '/api/house/site-context':{
   const loc=raw.location&&typeof raw.location==='object'&&!Array.isArray(raw.location)
    ?raw.location as Record<string,unknown>:{};
   const location={...SITE_LOCATION_PRESETS.custom,...loc};
   if(!Number.isFinite(Number(location.latitudeDeg))
    ||!Number.isFinite(Number(location.longitudeDeg)))throw new Error('Invalid site location');
   return buildAutomaticSiteContext({
    location:location as typeof SITE_LOCATION_PRESETS.custom,
    rooms:Array.isArray(raw.rooms)?raw.rooms as SiteContextRoom[]:[],
    searchRadiusM:Number(raw.searchRadiusM)||120,
    cachedGeoJson:cachedGeoJson||null,
   });
  }
  case '/api/house/optimize-site':{
   return optimizeSiteGeometry(siteInput(raw));
  }
  case '/api/house/optimize-site-airflow':{
   const rawInput=siteInput(raw.siteInput);
   // Recompute rather than trust a submitted score, compliance gate, or
   // energy claim. Only genuine geometry may transfer across engines.
   assertSiteDesignWellFormed(raw.proposedDesign);
   const baseline=evaluateSiteReference(rawInput);
   const best=evaluateSiteHouseDesign(raw.proposedDesign,rawInput);
   const location={...SITE_LOCATION_PRESETS.custom,...(rawInput.location||{})};
   const coupled=screenCoupledSiteAirflow({baseline,best,location},{
    lifecycleYears:rawInput.lifecycleYears,
    coolingCOP:rawInput.coolingCOP,
    targetTempC:rawInput.targetIndoorTempC,
    maximumCandidates:108,
   });
   const submitted=Array.isArray(raw.candidateDesigns)
    ?raw.candidateDesigns.slice(0,12):[];
   const candidates=submitted.map(value=>{
    assertSiteDesignWellFormed(value);
    return evaluateSiteHouseDesign(value,rawInput);
   });
   const jointSearch=searchCoupledSiteMechanicalPortfolio(
    {location,baseline,best},candidates,{
     lifecycleYears:rawInput.lifecycleYears,
     coolingCOP:rawInput.coolingCOP,
     targetTempC:rawInput.targetIndoorTempC,
     maximumCandidates:48,
    });
   return {...coupled,jointSearch};
  }
  case '/api/house/optimize-whole-system':{
   const {hourlyOutdoorTemperaturesC:_h,hourlyWeatherSource:_s,
    siteObstruction:_obs,weatherFallbackReason:_note,...rest}=raw;
   return optimizeWholeHouseSystem({
    ...rest,
    hourlyOutdoorTemperaturesC:undefined,
    hourlyWeatherSource:undefined,
    weatherFallbackReason:BROWSER_CLIMATE_NOTE,
    siteObstruction:undefined,
   } as WholeHouseOptimizerInput);
  }
  case '/api/house/optimize-hvac-cycle':
   return optimizeHvacCycle(raw as unknown as HvacCycleOptimizationInput);
  case '/api/house/optimize-adaptive-wall':
   return discoverAdaptiveWall(raw as unknown as AdaptiveWallOptimizationInput);
  case '/api/house/optimize-room':
   return optimizeRoomLifecycle(raw as unknown as RoomLifecycleOptimizationInput);
  case '/api/house/existing-home-autopilot':
   return runExistingHomeAutopilot(raw as unknown as ExistingHomeAutopilotInput);
  default:
   throw new Error('Unimplemented computation route.');
 }
}
