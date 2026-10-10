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
import { calibrateKnownYields,parseKnownYieldsCSV,screenHypotheticalBarriers } from './kinetics';
import {
  defaultCondition,membraneNeed,screenMembrane,proposeMaterialDiscoveries,
  proposeIsotopeHypotheses,probeDiscovery,checkCondition,searchDiscoveryUseCases,
  type Discovery,type OperatingCondition,type Task,
} from './cross_domain';

type SharedRequest={discoveries?:Discovery[]};
type BuildRequest=SharedRequest&{
  id:number;mode:'building';preset:string;areaM2:number;seed:number;targetTempC:number;
  epwText?:string;
};
type CircuitRequest=SharedRequest&{id:number;mode:'circuits';frequencyMHz:number;sourceOhms:number;loadOhms:number};
type ChemistryRequest=SharedRequest&{id:number;mode:'chemistry';minimumAcceptedFraction:number;
  knownYieldsCSV?:string;reactionId?:string;
  condition?:OperatingCondition;timeS?:number};
type MembraneRequest=SharedRequest&{id:number;mode:'membrane';condition:OperatingCondition;task:Task};
type WorkerRequest=BuildRequest|CircuitRequest|ChemistryRequest|MembraneRequest;
const context=self as unknown as DedicatedWorkerGlobalScope;
context.onmessage=(e:MessageEvent<WorkerRequest>)=>{
 const request=e.data;
 try{
  context.postMessage({id:request.id,kind:'progress',message:'Evaluating candidate configurations on this device…'});
  const prior=Array.isArray(request.discoveries)?request.discoveries.slice(0,24).filter(
   d=>d&&typeof d==='object'&&typeof d.id==='string'&&d.condition&&!checkCondition(d.condition)
  ):[];
  if(request.mode==='membrane'){
   const report=screenMembrane(request.condition,request.task,prior);
   const useCaseSweep=searchDiscoveryUseCases([...prior,...report.discoveries].slice(0,16),12);
   context.postMessage({id:request.id,kind:'result',mode:'membrane',
    result:{...report,useCaseSweep,priorDiscoveriesTested:prior.length}});
   return;
  }
  if(request.mode==='circuits'){
   const raw=optimizeImpedanceMatch(request);
   const condition=defaultCondition('air');
   const finding:Discovery={
    id:`rf:${request.frequencyMHz}:${request.sourceOhms}:${request.loadOhms}`,
    kind:'rf_interface',producer:'circuits',
    label:`${request.frequencyMHz} MHz passive interface`,
    createdAt:'screening_1',evidence:'hypothesis',
    source:'Idealized passive circuit model; no measured S-parameters.',
    condition,
   };
   const discoveries=[finding];
   const crossDomain=[...prior,...discoveries].slice(0,20).flatMap(x=>probeDiscovery(x,condition));
   const useCaseSweep=searchDiscoveryUseCases([...prior,...discoveries],12);
   context.postMessage({id:request.id,kind:'result',mode:'circuits',
    result:{...raw,discoveries,crossDomain,useCaseSweep,
      priorDiscoveriesTested:prior.length}});
   return;
  }
  if(request.mode==='chemistry'){
   const toy=optimizeRouteSelectivity(undefined,request.minimumAcceptedFraction);
   const condition=request.condition||defaultCondition('water');
   const reason=checkCondition(condition);
   if(reason)throw Error(reason);
   const discoveries=[...proposeMaterialDiscoveries(condition),...proposeIsotopeHypotheses(condition)];
   let calibration=null,barrierScreen=null;
   let calibrationStatus='No observed yield CSV supplied; all probability outcomes are hypothetical, not calibrated.';
   // Persist a previously fitted reaction-specific kinetic model in a typed
   // discovery. Reuse only if the held-out benchmark beats a naive constant
   // predictor and temperature/medium are inside the original evidence.
   const previousFit=prior.find(d=>d.kind==='kinetic_fit'
     &&d.kinetics?.reactionId===(request.reactionId||'')
     &&d.kinetics.environment===condition.medium
     &&d.kinetics.gate==='passes_baseline'
     &&condition.temperatureK>=d.kinetics.temperatureRangeK[0]
     &&condition.temperatureK<=d.kinetics.temperatureRangeK[1]);
   if(!request.knownYieldsCSV&&previousFit?.kinetics){
    calibration=previousFit.kinetics;
    calibrationStatus=`Reused saved ${calibration.reactionId} empirical fit; held-out MAE ${(calibration.holdoutMAE*100).toFixed(2)} percentage points. No new observations were added.`;
   }
   if(request.knownYieldsCSV){
    const observations=parseKnownYieldsCSV(request.knownYieldsCSV);
    const reactionId=request.reactionId||observations[0]?.reactionId;
    if(!reactionId)throw Error('Please select a measured reaction identity.');
    calibration=calibrateKnownYields(observations,reactionId,condition.medium);
    barrierScreen=screenHypotheticalBarriers(calibration,condition.temperatureK,
      Math.max(0,request.timeS??3600));
    calibrationStatus=`Held-out MAE ${(calibration.holdoutMAE*100).toFixed(1)} percentage points across ${calibration.holdoutCount} observations; ${calibration.gate}.`;
    discoveries.push({id:`kinetics:${reactionId}:${condition.medium}`,
      kind:'kinetic_fit',producer:'chemistry',label:`Effective kinetics fit: ${reactionId}`,
      createdAt:'measured_yield_fit_v1',
      evidence:calibration.gate==='passes_baseline'?'measured_user_data':'hypothesis',
      source:calibration.sourceRecords.join(' | ').slice(0,220),
      kinetics:calibration,condition});
   }
   // Replayed calibration is needed for the new time horizon, but can never
   // turn a previous fit into a verified catalyst or physical intervention.
   if(calibration&&!barrierScreen)barrierScreen=screenHypotheticalBarriers(
     calibration,condition.temperatureK,Math.max(0,request.timeS??3600));
   const crossDomain=[...discoveries,...prior].slice(0,20).flatMap(x=>probeDiscovery(x,condition));
   const useCaseSweep=searchDiscoveryUseCases([...discoveries,...prior],12);
   // Every V5 membrane request stored in device memory becomes a fresh
   // context-specific material search. No guaranteed candidate if the
   // requirement is outside known metal phase/transport properties.
   const matchedMembraneNeeds=prior.filter(d=>d.kind==='membrane_need'&&d.task)
    .slice(0,6).map(need=>{
      const screen=screenMembrane(need.condition,need.task!,discoveries);
      return {needId:need.id,condition:need.condition,
        candidate:screen.selected,requirements:screen.unmetRequirements};
    });
   const results={...toy,calibration,barrierScreen,calibrationStatus,
    discoveries,crossDomain,useCaseSweep,matchedMembraneNeeds,
    priorDiscoveriesTested:prior.length,
    caution:'No molecular wavefunctions, entropy-derived barriers or isotope chemistry are solved from first principles. A possible event may have an infinitesimal finite-horizon probability.'};
   context.postMessage({id:request.id,kind:'result',mode:'chemistry',result:results});
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
   discoveries:[membraneNeed(defaultCondition('air'),'thermal_barrier')],
   crossDomain:prior.slice(0,20).flatMap(d=>probeDiscovery(d,defaultCondition('air'))),
   useCaseSweep:searchDiscoveryUseCases(prior,12),
   priorDiscoveriesTested:prior.length,
  };
  context.postMessage({id:request.id,kind:'result',mode:'building',result:results});
 }catch(err){
  context.postMessage({id:request.id,kind:'error',error:err instanceof Error?err.message:'Calculation failed'});
 }
};
export {};
