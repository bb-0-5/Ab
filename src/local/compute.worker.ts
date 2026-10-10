/// <reference lib="webworker" />
/**
 * AboveBound local compute runner. No Express, Docker, AWS, account or cloud
 * solver. All candidate loops execute inside the visitor's own browser Worker
 * so React remains responsive. Cloud sync transports summaries ONLY.
 */
import { optimizeSiteGeometry, SITE_LOCATION_PRESETS, type SiteGeometryOptimizationInput } from '../lib/site_geometry_optimizer';
import { screenCoupledSiteAirflow, searchCoupledSiteMechanicalPortfolio } from '../lib/site_whole_house_coupling';
import { parseEpwTemperatureProfile, weatherStationDistanceKm } from '../lib/hourly_weather';
import { optimizeImpedanceMatch } from './impedance';
import { optimizeRouteSelectivity } from './selectivity';

type BuildRequest={
  id:number;mode:'building';preset:string;areaM2:number;seed:number;targetTempC:number;
  epwText?:string;
};
type CircuitRequest={id:number;mode:'circuits';frequencyMHz:number;sourceOhms:number;loadOhms:number};
type ChemistryRequest={id:number;mode:'chemistry';minimumAcceptedFraction:number};
type WorkerRequest=BuildRequest|CircuitRequest|ChemistryRequest;
const context=self as unknown as DedicatedWorkerGlobalScope;
context.onmessage=(e:MessageEvent<WorkerRequest>)=>{
 const request=e.data;
 try{
  context.postMessage({id:request.id,kind:'progress',message:'Evaluating candidate configurations on this device…'});
  if(request.mode==='circuits'){
   const result=optimizeImpedanceMatch(request);
   context.postMessage({id:request.id,kind:'result',mode:'circuits',result});
   return;
  }
  if(request.mode==='chemistry'){
   const result=optimizeRouteSelectivity(undefined,request.minimumAcceptedFraction);
   context.postMessage({id:request.id,kind:'result',mode:'chemistry',result});
   return;
  }
  const preset=SITE_LOCATION_PRESETS[request.preset]||SITE_LOCATION_PRESETS.melbourne;
  const area=Math.max(35,Math.min(500,request.areaM2));
  const targetTempC=Math.max(16,Math.min(28,request.targetTempC));
  let weather:SiteGeometryOptimizationInput['hourlyWeatherSource'];
  let temperatures:number[]|undefined;
  let weatherFallbackReason='';
  if(request.epwText){
   const epw=parseEpwTemperatureProfile(request.epwText);
   const km=weatherStationDistanceKm(epw.stationLatitudeDeg,epw.stationLongitudeDeg,
     preset.latitudeDeg,preset.longitudeDeg);
   if(km<=75){
    temperatures=epw.outdoorTemperaturesC;
    weather={stationName:epw.stationName,source:epw.source,stationDistanceKm:km};
   } else weatherFallbackReason=`Uploaded EPW weather station is ${km.toFixed(0)} km away (>75 km). Using climate preset instead.`;
  }
  const siteInput:SiteGeometryOptimizationInput={
   location:preset,targetFloorAreaM2:area,
   minFloorAreaM2:Math.max(30,area*0.95),
   maxFloorAreaM2:Math.min(600,area*1.05),
   seed:Math.round(request.seed),
   iterations:420,
   targetIndoorTempC:targetTempC,
   lifecycleYears:30,
   hourlyOutdoorTemperaturesC:temperatures,
   hourlyWeatherSource:weather,
   weatherFallbackReason,
  };
  const site=optimizeSiteGeometry(siteInput);
  context.postMessage({id:request.id,kind:'progress',message:
   `Screened ${site.candidatesEvaluated} footprints; examining ventilation strategies…`});
  const shared={lifecycleYears:30,coolingCOP:siteInput.coolingCOP,
   targetTempC, hourlyOutdoorTemperaturesC:temperatures,maximumCandidates:48};
  const linked=screenCoupledSiteAirflow(site,shared);
  const joint=searchCoupledSiteMechanicalPortfolio(site,site.feasibleShortlist,shared);
  const results={
   mode:'building' as const,
   seed:request.seed,
   location:preset.name,
   areaM2:area,
   temperatureC:targetTempC,
   weather:site.weatherContext,
   siteCandidates:site.candidatesEvaluated,
   jointCandidates:joint.geometryCandidatesEvaluated,
   mechanicalCandidates:joint.mechanicalCandidatesEvaluated,
   eligible:joint.feasibleEquivalentAreaCandidates,
   best:joint.selected?{
    form:joint.selected.site.design.form,
    floorAreaM2:joint.selected.site.design.floorAreaM2,
    orientationDeg:joint.selected.site.design.orientationDeg,
    ventilation:joint.selected.selectedAirflow.control,
    heatRecoveryPercent:Math.round(joint.selected.selectedAirflow.heatRecoveryEfficiency*100),
    annualElectricityKWh:joint.selected.energy.annualCombinedElectricalKWh,
    lifecycleKWh:joint.selected.energy.totalLifecycleKWh,
    manufacturedKWh:joint.selected.energy.combinedManufacturingKWh,
    geometry:joint.selected.site.footprintPolygons,
    feasible:joint.selected.feasible,
   }:null,
   baselineLifecycleKWh:linked.baseline.energy.totalLifecycleKWh,
   comparisonSupported:joint.lifecycleSavingsAgainstReferenceKWh!==null,
   qualifiesAsImprovement:joint.qualifiesAsImprovement,
   savingsVsBaselineKWh:joint.lifecycleSavingsAgainstReferenceKWh,
   scenarios:joint.ranked,
   explanation:joint.outcome,
   limitations:joint.limitations,
  };
  context.postMessage({id:request.id,kind:'result',mode:'building',result:results});
 }catch(err){
  context.postMessage({id:request.id,kind:'error',error:err instanceof Error?err.message:'Calculation failed'});
 }
};
export {};
