/**
 * Browser-local material/geometry exploration for EXISTING V9/V10 solvers.
 *
 * None of these are electron, air, or water particle trajectories. V1/V2 are
 * dimensionless PSO search agents. Material references below are approximate
 * room-temperature bulk properties for identified solids, not synthesized
 * mixtures or validated printed membranes.
 *
 * Heat-dissipation objective: conduct heat along X through a solid scaffold
 * while offering an open pore route along Y to a cooling fluid. Transport
 * steering is a geometric proxy, not CFD, Reynolds, pressure-drop or cooling
 * capacity. Electrical conductivity is separate from thermal conductivity:
 * σ [S/m] is never confused with k [W/(m K)].
 */
import type {V9LatticeEngine,CompositeField,CrystalStructure} from '../simulations/v9_lattice';
import type {V10MeshEngine,MeshConfig} from '../simulations/v10_mesh';
import {screenVoxelChannels} from './voxel_connectivity';
import {screenVoxelHeatConduction} from './voxel_heat_conduction';
import {
 solveSteadyVoxelTransport,type NetworkFlowResult,
} from './steady_transport_network';

export type TestMedium='air'|'water';
export const FLUID_REFERENCES:Readonly<Record<TestMedium,{
 name:string;densityKgM3:number;viscosityPaS:number;
 conductivityWmK:number;temperatureC:number;
 caveat:string;
}>>={
 air:{name:'Air',densityKgM3:1.2,viscosityPaS:1.81e-5,
  conductivityWmK:.026,temperatureC:20,
  caveat:'Stationary conduction plus geometric flow path; convection not solved'},
 water:{name:'Water',densityKgM3:998,viscosityPaS:1.002e-3,
  conductivityWmK:.60,temperatureC:20,
  caveat:'Stationary conduction plus geometric flow path; viscosity is reference only; no CFD or corrosion'},
};
export const SOLID_REFERENCES=[
 {symbol:'Cu',label:'Copper',structure:'fcc',bulkThermalK:401,
  bulkElectricalSigma:5.8e7,density:8960},
 {symbol:'Al',label:'Aluminium',structure:'fcc',bulkThermalK:237,
  bulkElectricalSigma:3.5e7,density:2700},
 {symbol:'Ti',label:'Titanium',structure:'hcp',bulkThermalK:6.7,
  bulkElectricalSigma:2.4e6,density:4430},
 {symbol:'Fe',label:'Iron',structure:'bcc',bulkThermalK:80,
  bulkElectricalSigma:1.0e7,density:7874},
 {symbol:'Si',label:'Intrinsic silicon',structure:'diamond_cubic',bulkThermalK:150,
  bulkElectricalSigma:null,density:2330},
] as const;
export type ReferenceSolid=typeof SOLID_REFERENCES[number];
export type TransportGoal='thermal'|'electrical';
export type ScreenedDesign={
 candidate:string;
 candidateLabel:string;
 fluid:TestMedium;
 structure:CrystalStructure;
 tpms:MeshConfig['tpms'];
 frequency:number;
 threshold:number;
 solidFraction:number;
 openFraction:number;
 fluidSpansY:boolean;
 solidSpansX:boolean;
 geometricSteering:number;
 relativeFlowAccess:number;
 referenceThermalK:number;
 referenceElectricalSigma:number|null;
 modeledEffectiveThermalKWmK:number;
 /** NOT a frequency-dependent impedance or transport measurement */
 estimatedSolidPathSigmaSm:number|null;
 score:number;
 verified?:{
   hydraulic:NetworkFlowResult;
   electric:NetworkFlowResult|null;
   normalizedHydraulicThroughput:number;
   electricalSigmaSm:number|null;
   validatedRankingScore:number;
   modelOnly:true;
 };
 referenceOnly:true;
};
export type SweepProgress={
 goal:TransportGoal;evaluated:number;best:ScreenedDesign|null;
 airBest:ScreenedDesign|null;waterBest:ScreenedDesign|null;
 testedMaterials:string[];
 complete:boolean;
 verifiedCount:number;
 targetVerificationCount:number;
};
export const SOLID_OPTIONS=SOLID_REFERENCES.length;
export const GEOMETRY_OPTIONS:ReadonlyArray<{
 tpms:MeshConfig['tpms'];frequency:number;threshold:number;
}>=[
 {tpms:'gyroid',frequency:1.5,threshold:-.18},
 {tpms:'diamond',frequency:2.0,threshold:.05},
 {tpms:'schwarz_p',frequency:1.6,threshold:.10},
 {tpms:'lidinoid',frequency:1.7,threshold:-.12},
];
const candidates=SOLID_REFERENCES;
const valid=(v:number)=>Number.isFinite(v)&&v>=0;
function prepareMaterial(
 lattice:V9LatticeEngine,material:ReferenceSolid,seed:number,
):CompositeField{
 // Pure REFERENCE solid, no invented alloy mixing. Correct reference crystal
 // phase: Cu/Al FCC, Fe BCC, Ti HCP, Si diamond cubic at ~room temperature.
 lattice.primaryElement=material.symbol;
 lattice.secondaryElement=material.symbol;
 lattice.structure=material.structure as CrystalStructure;
 lattice.alloyRatio=1;
 lattice.defectRate=0;
 lattice.v13Hypothesis=null;
 lattice.setSeed(seed);
 lattice.buildLattice();
 const field=lattice.compositeField;
 if(!field)throw Error('V9 failed to construct reference property field');
 return field;
}
export function screenReferenceMaterial(
 lattice:V9LatticeEngine,mesh:V10MeshEngine,
 goal:TransportGoal,index:number,seed=20261014,
):ScreenedDesign[]{
 if(!Number.isInteger(index)||index<0||index>=candidates.length)
  throw new RangeError('Reference index out of bounds');
 const reference=candidates[index];
 const field=prepareMaterial(lattice,reference,seed);
 const results:ScreenedDesign[]=[];
 const base={...mesh.config};
 for(const shape of GEOMETRY_OPTIONS){
  mesh.config={...base,...shape,porosity:.5,roughness:0};
  mesh.buildMesh(field);
  const mask=mesh.getSolidMask(),channels=mesh.getConnectivity();
  if(!mask||!channels)continue;
  const n=channels.voidCount+channels.solidCount;
  const solid=channels.solidCount/n,open=channels.voidCount/n;
  // Solid scaffold for heat/current on X, fluid through-channel on Y.
  const flipped=new Uint8Array(mask.length);
  for(let i=0;i<mask.length;i++)flipped[i]=mask[i]>.5?0:1;
  const backbone=screenVoxelChannels(flipped,field.resolution);
  const solidRoute=backbone.spanning.x;
  const path=channels.shortestPathTortuosity.y||Infinity;
  const flowAccess=channels.spanning.y
    ?open/(path*path):0;
  // 1 = channel steers preferentially along Y, lower = also open X/Z.
  const steering=channels.spanning.y
    ?1/(1+Number(channels.spanning.x)+Number(channels.spanning.z))
    :0;
  const solidTau=backbone.shortestPathTortuosity.x||Infinity;
  const approxSigma=reference.bulkElectricalSigma===null?null:
    solidRoute?reference.bulkElectricalSigma*solid/(solidTau*solidTau):0;
  for(const fluid of ['air','water'] as const){
   const screen=screenVoxelHeatConduction(
    mask,field.conductivityField,field.resolution,'x',55,fluid,
   );
   const k=screen.effectiveConductivityWmK;
   // Same finite-voxel, phase-independent score across solids. A thermal
   // heat sink prefers HIGH k (opposite V12 insulation); signal routing
   // prefers HIGH solid path σ, not the thermal conductivity field.
   const conduction=goal==='electrical'
     ?Math.log1p((approxSigma||0)/1e5)
     :Math.log1p(k);
   const geometricValid=solid>=.18&&solid<=.82&&solidRoute
     &&channels.spanning.y;
   const score=geometricValid&&valid(k)
     ?conduction*(.2+flowAccess)*(.75+.25*steering):0;
   results.push({
    candidate:reference.symbol,candidateLabel:reference.label,fluid,
    structure:reference.structure as CrystalStructure,
    tpms:shape.tpms,frequency:shape.frequency,threshold:shape.threshold,
    solidFraction:solid,openFraction:open,
    fluidSpansY:channels.spanning.y,solidSpansX:solidRoute,
    geometricSteering:steering,relativeFlowAccess:flowAccess,
    referenceThermalK:reference.bulkThermalK,
    referenceElectricalSigma:reference.bulkElectricalSigma,
    modeledEffectiveThermalKWmK:k,
    estimatedSolidPathSigmaSm:approxSigma,
    score,referenceOnly:true,
   });
  }
 }
 return results;
}
export function rankTransportSweep(
 results:readonly ScreenedDesign[],goal:TransportGoal,complete=false,
):SweepProgress{
 // Verified resistive pressure/current networks take precedence over mere
 // geometrical connectivity. Keep non-verified entries only as previews.
 const ranked=results.filter(x=>Number.isFinite(x.score)&&x.score>0);
 const checked=ranked.filter(x=>x.verified);
 const sorted=[...(checked.length?checked:ranked)].sort((a,b)=>
   (b.verified?.validatedRankingScore??b.score)-
   (a.verified?.validatedRankingScore??a.score));
 const airBest=sorted.find(x=>x.fluid==='air')||null;
 const waterBest=sorted.find(x=>x.fluid==='water')||null;
 // A water circuit is not automatically assumed from a higher k.
 // Rank an air-cooled reference design by default for thermal work; keep
 // independently optimized water design to compare, no pump sizing.
 const best=goal==='thermal'?(airBest||waterBest):(airBest||waterBest);
 return {goal,evaluated:results.length,best,airBest,waterBest,
  testedMaterials:[...new Set(results.map(x=>x.candidate))],complete,
  verifiedCount:results.filter(x=>x.verified).length,
  targetVerificationCount:Math.min(10,results.filter(x=>x.score>0).length),
 };
}
export function buildSelectedTransportDesign(
 lattice:V9LatticeEngine,mesh:V10MeshEngine,
 selected:ScreenedDesign,seed=20261014,
):void{
 const ref=candidates.find(x=>x.symbol===selected.candidate);
 if(!ref)throw Error('Cannot use material outside reference catalogue');
 const field=prepareMaterial(lattice,ref,seed);
 mesh.config={...mesh.config,tpms:selected.tpms,
  threshold:selected.threshold,frequency:selected.frequency,
  porosity:.5,roughness:0};
 mesh.buildMesh(field);
 const actual=mesh.getConnectivity();
 if(!actual||!actual.spanning.y)
  throw Error('Chosen membrane no longer has its screened pore route');
 mesh.lastSearch={
  evaluated:GEOMETRY_OPTIONS.length*SOLID_OPTIONS,
  axis:'y',baselineScore:0,bestScore:selected.score,
  selected:{...mesh.config},modeledOnly:true,
 };
}

/** Choose top screen for each known reference and test fluid; this prevents
 * a high-conductivity material from monopolising the verification queue. */
export function verificationShortlist(
 rows:readonly ScreenedDesign[],
):ScreenedDesign[]{
 const selected:ScreenedDesign[]=[];
 for(const medium of ['air','water'] as const){
  for(const reference of SOLID_REFERENCES){
   const row=rows.filter(x=>x.fluid===medium
     &&x.candidate===reference.symbol
     &&x.score>0).sort((a,b)=>b.score-a.score)[0];
   if(row)selected.push(row);
  }
 }
 return selected;
}
/**
 * Rebuild the actual V9 material and V10 mask, then solve steady hydraulic
 * pressure drop through pores and DC potential through its solid phase.
 * Ranks using these measured MODEL fluxes; not just a connected path count.
 * Each call is bounded and intended to run on a different animation frame.
 */
export function verifyTransportCandidate(
 lattice:V9LatticeEngine,mesh:V10MeshEngine,
 row:ScreenedDesign,goal:TransportGoal,
):ScreenedDesign{
 const ref=candidates.find(x=>x.symbol===row.candidate);
 if(!ref)throw Error('Unknown physical reference');
 const material=prepareMaterial(lattice,ref,20261014);
 mesh.config={...mesh.config,tpms:row.tpms,frequency:row.frequency,
  threshold:row.threshold,porosity:.5,roughness:0};
 mesh.buildMesh(material);
 const mask=mesh.getSolidMask();
 if(!mask)throw Error('Missing V10 solid/void mask');
 const hydraulic=solveSteadyVoxelTransport(
  mask,material.resolution,'hydraulic','y',
  {medium:row.fluid,maxIterations:135},
 );
 const electrical=ref.bulkElectricalSigma===null?null:
  solveSteadyVoxelTransport(mask,material.resolution,'ohmic','x',{
   bulkElectricalSigmaSm:ref.bulkElectricalSigma,maxIterations:135,
  });
 // Normalize flow to an ideal 100%-open array of identical pore throats.
 // The score is comparative under identical assumed 1Pa, 1mm, tube radius.
 const r=hydraulic.throatRadiusM!,a=hydraulic.voxelPitchM;
 const fluid=FLUID_REFERENCES[row.fluid];
 const single=Math.PI*r**4/(8*fluid.viscosityPaS*a);
 const ideal=single*material.resolution**2/(material.resolution-1);
 const relative=ideal>0?hydraulic.resolvedFlux/ideal:0;
 const sigma=electrical?.effectiveConductivity??null;
 const connected=hydraulic.resolvedFlux>0&&row.fluidSpansY
  &&row.solidSpansX&&hydraulic.laminarAssumption;
 const physicalTransfer=goal==='electrical'
  ?Math.log1p((sigma||0)/1e5)
  :Math.log1p(row.modeledEffectiveThermalKWmK);
 const valid=connected&&Number.isFinite(relative)&&relative>=0
  &&(goal!=='electrical'||Boolean(sigma&&sigma>0));
 const ranked=valid?physicalTransfer*(.1+relative)
  *(.75+.25*row.geometricSteering):0;
 return {...row,verified:{
  hydraulic,electric:electrical,
  normalizedHydraulicThroughput:relative,
  electricalSigmaSm:sigma,
  validatedRankingScore:ranked,modelOnly:true,
 }};
}
