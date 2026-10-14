/**
 * Small steady-state resistor networks for the ACTUAL V10 3D solid/void mask.
 * This replaces pure geometric "flow access" as the final ranking evidence.
 *
 * Fluid network: cubic-cell throats approximated as cylindrical laminar pipes,
 * Hagen–Poiseuille G=πr⁴/(8μℓ), at a DECLARED 1mm pitch and 1Pa Δp.
 * Solid network: quasi-DC bulk Ohm model G=σ A/ℓ, at the same 1mm pitch
 * and 1mV ΔV. Six-neighbour face bonds only, fixed potentials on opposite
 * faces, insulated remaining faces; no fabricated particle trajectories.
 *
 * Neither model is CFD / Navier–Stokes, AC impedance, electrochemistry,
 * effective thermoelectric behavior or contact resistance. The pore radius
 * assumption is not measurable from a binary mask; every result is conditional.
 */
import type {TestMedium} from './auto_transport_sweep';
import {FLUID_REFERENCES} from './auto_transport_sweep';

export type TransportAxis='x'|'y'|'z';
export type NetworkFlowResult={
 mode:'hydraulic'|'ohmic';
 medium:TestMedium|null;
 axis:TransportAxis;
 inlet:number;
 outlet:number;
 voxelPitchM:number;
 drivingDifference:number;
 throatRadiusM:number|null;
 densityKgM3:number|null;
 viscosityPaS:number|null;
 inletOpenSites:number;
 resolvedFlux:number;
 effectiveConductivity:number|null;
 reynoldsEstimate:number|null;
 laminarAssumption:boolean;
 iterations:number;
 maxResidual:number;
 converged:boolean;
 pressureSamples:ReadonlyArray<{position:number;fraction:number}>;
 modelOnly:true;
 limitations:string;
};
const pitch=.001;
const dp=1;
const dv=.001;
export function solveSteadyVoxelTransport(
 mask:Float32Array|Uint8Array,
 res:number,
 mode:'hydraulic'|'ohmic',
 axis:TransportAxis,
 opt:{medium?:TestMedium;bulkElectricalSigmaSm?:number;
      maxIterations?:number;voxelPitchM?:number}={},
):NetworkFlowResult{
 if(!Number.isInteger(res)||res<2||res>32||mask.length!==res**3
   ||!['x','y','z'].includes(axis)||!['hydraulic','ohmic'].includes(mode))
   throw Error('Invalid transport voxel mask and axis');
 if(mode==='hydraulic'&&opt.medium!=='air'&&opt.medium!=='water')
   throw Error('Hydraulic solver requires an identified fluid');
 const bulk=mode==='ohmic'?opt.bulkElectricalSigmaSm:undefined;
 if(mode==='ohmic'&&(bulk===undefined||!Number.isFinite(bulk)||bulk<=0))
   throw Error('Electrical model needs a known bulk electrical conductivity S/m');
 const maxIterations=opt.maxIterations??100;
 const a=opt.voxelPitchM??pitch;
 if(!Number.isSafeInteger(maxIterations)||maxIterations<1||maxIterations>400
  ||!Number.isFinite(a)||a<=0||a>1)
  throw Error('Unphysical dimension or solver budget');
 const fluid=mode==='hydraulic'?FLUID_REFERENCES[opt.medium!]:null;
 const radius=a*.22,mu=fluid?.viscosityPaS||1;
 const bond=mode==='hydraulic'
  ?Math.PI*radius**4/(8*mu*a):bulk!*a;
 const n=mask.length,rs=res*res;
 // Hydraulic transport lives in VOID; Ohmic current in SOLID.
 const active=new Uint8Array(n);
 for(let i=0;i<n;i++){
  if(!Number.isFinite(mask[i])||mask[i]<0||mask[i]>1)
   throw Error('Invalid binary pore mask');
  active[i]=mode==='hydraulic'?Number(mask[i]<.5):Number(mask[i]>=.5);
 }
 const axisPosition=(i:number)=>axis==='x'?Math.floor(i/rs)
  :axis==='y'?Math.floor(i%rs/res):i%res;
 const potential=new Float64Array(n);
 let inletSites=0;
 for(let i=0;i<n;i++)if(active[i]){
  const p=axisPosition(i);
  if(p===0)inletSites++;
  potential[i]=1-p/(res-1);
 }
 const neighbor=(i:number,x:number,y:number,z:number,fn:(j:number)=>void)=>{
  if(x>0)fn(i-rs);
  if(x+1<res)fn(i+rs);
  if(y>0)fn(i-res);
  if(y+1<res)fn(i+res);
  if(z>0)fn(i-1);
  if(z+1<res)fn(i+1);
 };
 let maxResidual=Infinity,iterations=0;
 for(let iter=0;iter<maxIterations;iter++){
  maxResidual=0;
  for(let x=0;x<res;x++)for(let y=0;y<res;y++)for(let z=0;z<res;z++){
   const i=x*rs+y*res+z;
   if(!active[i])continue;
   const coord=axisPosition(i);
   if(coord===0||coord===res-1)continue;
   let sum=0,count=0;
   neighbor(i,x,y,z,j=>{if(active[j]){sum+=potential[j];count++;}});
   if(!count)continue;
   const average=sum/count;
   // Gauss–Seidel relaxation. Clamped physical potentials in [0,1].
   const next=Math.max(0,Math.min(1,
    potential[i]+1.35*(average-potential[i])));
   maxResidual=Math.max(maxResidual,Math.abs(next-potential[i]));
   potential[i]=next;
  }
  iterations=iter+1;
  if(maxResidual<2e-5)break;
 }
 let sumBond=0;
 for(let i=0;i<n;i++)if(active[i]&&axisPosition(i)===0){
  const j=axis==='x'?i+rs:axis==='y'?i+res:i+1;
  if(active[j])sumBond+=Math.max(0,1-potential[j]);
 }
 const totalFlux=bond*sumBond*(mode==='hydraulic'?dp:dv);
 const area=(res*a)**2,length=(res-1)*a;
 const conductivity=mode==='ohmic'
  ?totalFlux*length/(area*dv):null;
 const openFaceArea=Math.max(1,inletSites)*Math.PI*radius*radius;
 const velocity=mode==='hydraulic'?totalFlux/openFaceArea:0;
 const re=mode==='hydraulic'
  ?fluid!.densityKgM3*velocity*(2*radius)/mu:null;
 // Re < 100 is intentionally stricter than pipe transition ~2300, because
 // this crude voxel-throat model cannot represent inertial bends reliably.
 const laminar=re===null||re<100;
 const samples:{position:number;fraction:number}[]=[];
 for(let p=0;p<res;p++){
  let count=0,sum=0;
  for(let i=0;i<n;i++)if(active[i]&&axisPosition(i)===p){
   sum+=potential[i];count++;
  }
  samples.push({position:p/(res-1),fraction:count?sum/count:0});
 }
 return{
  mode,medium:mode==='hydraulic'?opt.medium!:null,axis,
  inlet:mode==='hydraulic'?dp:dv,outlet:0,
  voxelPitchM:a,drivingDifference:mode==='hydraulic'?dp:dv,
  throatRadiusM:mode==='hydraulic'?radius:null,
  densityKgM3:fluid?.densityKgM3??null,
  viscosityPaS:fluid?.viscosityPaS??null,
  inletOpenSites:inletSites,
  resolvedFlux:totalFlux,effectiveConductivity:conductivity,
  reynoldsEstimate:re,laminarAssumption:laminar,
  iterations,maxResidual,converged:maxResidual<2e-5,
  pressureSamples:samples,
  modelOnly:true,
  limitations:mode==='hydraulic'
   ?'Assumed 1mm voxels, 0.22 voxel-radius ideal round throats, 1Pa pressure drop, laminar Poiseuille. No CFD, wall geometry calibration, turbulence, convection, pump design or empirical flow.'
   :'Assumed 1mm voxels, fully conducting cubic bonds, 1mV DC potential, bulk reference σ. No AC impedance, contacts, Joule heating, doping or charge-carrier tracking.',
 };
}
