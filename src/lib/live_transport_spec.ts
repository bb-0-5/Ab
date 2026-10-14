/**
 * User-facing live design spec. The V1/V2 PSO agents never acquire fictional
 * physical particle properties. Here we distinguish a candidate being
 * screened from the solid currently instantiated by V9 and V10.
 */
import {SOLID_REFERENCES,FLUID_REFERENCES,
 type SweepProgress,type TestMedium,type TransportGoal,
 type ScreenedDesign} from './auto_transport_sweep';
export type LiveTransportSpec={
 status:'searching'|'candidate'|'applied'|'changed_upstream';
 goal:TransportGoal;
 purpose:string;
 liveSolid:string;
 liveStructure:string;
 liveGeometry:string;
 solid:string|null;
 medium:TestMedium|null;
 crystal:string|null;
 tpms:string|null;
 physicalReference:{densityKgM3:number;thermalKwmK:number;
  electricalSigmaSm:number|null}|null;
 fluidReference:{densityKgM3:number;viscosityPaS:number;
  thermalKwmK:number;temperatureC:number}|null;
 solidPercent:number|null;
 voidPercent:number|null;
 openFluidPath:boolean|null;
 openSolidPath:boolean|null;
 flowM3s:number|null;
 modeledElectricalSigmaSm:number|null;
 effectiveThermalKwmK:number|null;
 evaluated:number;
 verified:number;
 reason:string;
 modelOnly:true;
};
export function buildLiveTransportSpec(
 goal:TransportGoal,progress:SweepProgress|null,
 applied:boolean,active:{primary:string;secondary:string;
  structure:string;tpms:string}|null,
):LiveTransportSpec{
 const candidate:ScreenedDesign|null=progress?.best||null;
 const match=Boolean(candidate&&active
   &&active.primary===candidate.candidate
   &&active.secondary===candidate.candidate
   &&active.tpms===candidate.tpms
   &&active.structure===candidate.structure);
 const status:LiveTransportSpec['status']=!candidate?'searching'
   :applied&&match?'applied'
   :applied&&!match?'changed_upstream':'candidate';
 const solid=candidate?.candidate||null;
 const ref=SOLID_REFERENCES.find(s=>s.symbol===solid);
 const fluid=candidate?.fluid?FLUID_REFERENCES[candidate.fluid]:null;
 const solution=candidate?.verified||null;
 const purpose=goal==='electrical'
   ?'Route DC current along X while preserving fluid pores along Y'
   :'Dissipate heat through a solid X scaffold with air/water pore access along Y';
 return {
  status,goal,purpose,
  liveSolid:active?active.primary+(active.secondary!==active.primary
    ?'/'+active.secondary:''):'Not initialized',
  liveStructure:active?.structure||'Not initialized',
  liveGeometry:active?.tpms||'Not initialized',
  solid,medium:candidate?.fluid||null,
  crystal:candidate?.structure||null,tpms:candidate?.tpms||null,
  physicalReference:ref?{
   densityKgM3:ref.density,thermalKwmK:ref.bulkThermalK,
   electricalSigmaSm:ref.bulkElectricalSigma,
  }:null,
  fluidReference:fluid?{
   densityKgM3:fluid.densityKgM3,viscosityPaS:fluid.viscosityPaS,
   thermalKwmK:fluid.conductivityWmK,temperatureC:fluid.temperatureC,
  }:null,
  solidPercent:candidate?candidate.solidFraction*100:null,
  voidPercent:candidate?candidate.openFraction*100:null,
  openFluidPath:candidate?.fluidSpansY??null,
  openSolidPath:candidate?.solidSpansX??null,
  flowM3s:solution?.hydraulic.resolvedFlux??null,
  modeledElectricalSigmaSm:solution?.electricalSigmaSm??null,
  effectiveThermalKwmK:candidate?.modeledEffectiveThermalKWmK??null,
  evaluated:progress?.evaluated||0,
  verified:progress?.verifiedCount||0,
  reason:status==='applied'
   ?'Selected reference design is installed in the current V9/V10 model.'
   :status==='changed_upstream'
     ?'The construction stages have changed the V9/V10 geometry since the earlier selection. Showing selected trial as history, not current material.'
     :status==='candidate'
       ?'Numerical candidate only; not yet installed in the active lattice.'
       :'Autonomous material and fluid screen running. No selected design yet.',
  modelOnly:true,
 };
}
