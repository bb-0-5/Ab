/**
 * Evidence ledger for the actual original V9 → V10 → V11 → V6 → V13 chain.
 *
 * All dimensions are explicit. No TPMS geometry implies an observed flow
 * rate and no crude V13 mixing-rule prediction is called a viable invention.
 */
import type {VoxelChannelEvidence} from './voxel_connectivity';
import type {MaterialComposite,V13RequirementScreen} from '../simulations/v13_material';

export type MaterialPipelineEvidence={
  model:'v9-v10-v11-v13-geometric-screen-v1';
  originalV9:{
    thermalConductivityWmK:number;densityKgM3:number;
    dielectricConstant:number;
  };
  v10:{
    porosity:number;componentCount:number;
    sixConnectedSpan:{x:boolean;y:boolean;z:boolean};
    minGeometricTortuosity:number|null;
    crossFlowAxis:'x'|'y'|'z';
    crossFlowGeometricallyOpen:boolean;
    geometryUnitsNotMetric:true;
  };
  v11:{portCount:number;portsAreUnverified:true};
  v13:{
    candidateElements:string[];
    /** Heuristic mixing rule; unknown properties require measurement. */
    estimatedThermalConductivityWmK:number;
    estimatedDensityKgM3:number;
    estimatedElectricalConductivitySm:number;
    estimatedMeltingK:number;
    thermalScreen:V13RequirementScreen['status']|'no_live_requirement';
    hypotheticalNotApplied:true;
  }|null;
  conclusion:'no_connected_channel'|'needs_composite_and_empirical_data'|
     'estimated_melt_failure'|'provisional_geometry_and_thermal_only';
  caveat:string;
};
type NumericMaterial={
 conductivity:number;density:number;dielectricConstant:number;
};
const isPositive=(x:number)=>Number.isFinite(x)&&x>0;
export function screenMaterialPipeline(input:{
  v9:NumericMaterial;
  v10:VoxelChannelEvidence;
  v11PortCount:number;
  v13Composite:MaterialComposite|null;
  v13Screen:V13RequirementScreen|null;
  preferredAxis:'x'|'y'|'z';
}):MaterialPipelineEvidence{
 const {v9,v10,v11PortCount,v13Composite,v13Screen,preferredAxis}=input;
 if(!isPositive(v9.conductivity)||!isPositive(v9.density)
   ||!isPositive(v9.dielectricConstant)
   ||!Number.isInteger(v11PortCount)||v11PortCount<0
   ||!['x','y','z'].includes(preferredAxis))
   throw new Error('Invalid V9/V11 engineering input');
 const n=v10.voidCount+v10.solidCount;
 if(n===0||!Number.isFinite(n)||v10.evidence!=='six_neighbour_voxel_geometry_only')
   throw new Error('Invalid V10 topology evidence');
 const connected=v10.spanning[preferredAxis];
 const candidate=v13Composite?.properties;
 // CRITICAL: V13 density is g/cm³; V9/V1 density is kg/m³.
 // V13 electrical conductivity (S/m) is NOT thermal conductivity (W/m/K).
 const v13=candidate?{
   candidateElements:v13Composite!.elements.map(c=>c.element.sym),
   estimatedThermalConductivityWmK:candidate.thermalConductivity,
   estimatedDensityKgM3:candidate.density*1000,
   estimatedElectricalConductivitySm:candidate.conductivity,
   estimatedMeltingK:candidate.meltingPoint,
   thermalScreen:v13Screen?.status||'no_live_requirement' as const,
   hypotheticalNotApplied:true as const,
 }:null;
 const conclusion=!connected?'no_connected_channel' as const:
   !v13||v13.thermalScreen==='no_live_requirement'||
     v13.thermalScreen==='awaiting_composite'
    ?'needs_composite_and_empirical_data' as const:
   v13.thermalScreen==='estimated_melt_failure'?'estimated_melt_failure' as const:
   'provisional_geometry_and_thermal_only' as const;
 return {
   model:'v9-v10-v11-v13-geometric-screen-v1',
   originalV9:{
    thermalConductivityWmK:v9.conductivity,densityKgM3:v9.density,
    dielectricConstant:v9.dielectricConstant,
   },
   v10:{
    porosity:v10.voidCount/n,
    componentCount:v10.componentCount,
    sixConnectedSpan:{...v10.spanning},
    minGeometricTortuosity:v10.shortestPathTortuosity[preferredAxis],
    crossFlowAxis:preferredAxis,
    crossFlowGeometricallyOpen:connected,
    geometryUnitsNotMetric:true,
   },
   v11:{portCount:v11PortCount,portsAreUnverified:true},
   v13,conclusion,
   caveat:'Numerical geometry and constituent-property heuristics only; flow capacity, resistance, actual ports, processing yield, phase stability and full constitutive response require independent physical models and measured calibration.',
 };
}
