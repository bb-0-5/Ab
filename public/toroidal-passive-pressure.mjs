/**
 * Passive fixed-wall torus: linear 1-D compressible acoustics with spatially
 * varying bore area/resistance inherited from a real V10 solid/void mask.
 *
 * NO motor, iris stroke, prescribed circulation, valves, source term or
 * pressurization work after initial conditions. Uniform static pressure is
 * EXACTLY stationary. A one-off pressure perturbation splits into travelling
 * disturbances and dissipates by positive viscous + MHD back-reaction.
 *
 * Numerical model: a closed ring with nodal pressure perturbation p_i [Pa],
 * edge volume flow Q_i [m3/s], compliance C_i=A_i*dx/K [m3/Pa], inertance
 * L_i=rho*dx/Aedge [Pa*s2/m3]. Passive resistor R_i [Pa*s/m3].
 *   C_i dp_i/dt = Q_(i-1) - Q_i
 *   L_i dQ_i/dt = p_i-p_(i+1) - R_i Q_i
 * Crank-Nicolson with converged fixed-point solve conserves discrete pressure
 * mass, has a positive-definite energy and dissipates at R*Qmid². Nothing
 * is inferred about unmodeled 3D vortices or actual membrane motion.
 */
export const PRESSURE_MATERIALS={
 water20C:{name:'WATER, 20°C · weakly conductive',rho:998.2,mu:1.002e-3,bulkPa:2.2e9,sigma:5e-4},
 galinstan:{name:'GALINSTAN · IDEAL CLEAN METAL',rho:6440,mu:2.4e-3,bulkPa:4.8e10,sigma:2.3e6}
};
const invariant=(ok,message)=>{if(!ok)throw Error(message)};
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
export function buildPassiveRing(evidence=null,{
 segments=96,majorRadiusM=.18,ductDiameterM=.004,
 material='water20C',fieldTesla=.45,loadFactor=.5,
 basePressurePa=1e7,initialPulsePa=800,sourceCell=12,
 mode='pulse'
}={}){
 invariant(Number.isInteger(segments)&&segments>=24&&segments<=256,'Bad mesh segments');
 invariant(['pulse','uniform'].includes(mode),'Bad pressure mode');
 invariant(PRESSURE_MATERIALS[material]&&majorRadiusM>0&&ductDiameterM>0 &&
  basePressurePa>=101325&&basePressurePa<=5e7&&initialPulsePa>=0&&initialPulsePa<=basePressurePa*.01,
  'Bad fluid, geometry or pressure');
 invariant(fieldTesla>=0&&fieldTesla<=3&&loadFactor>0&&loadFactor<1,'Bad magnetic configuration');
 const fluid=PRESSURE_MATERIALS[material],baseArea=Math.PI*ductDiameterM**2/4;
 const circumference=2*Math.PI*majorRadiusM,dx=circumference/segments;
 const sourceMask=evidence?.mask&&evidence.n&&evidence.layers?evidence:null;
 const occupancy=new Float64Array(segments);
 const trace=new Float64Array(segments);
 // Exact V10 z-major voxel layout [z*n*n+y*n+x]. Its original slices,
 // not a newly painted synthetic membrane, determine the local constriction.
 for(let i=0;i<segments;i++){
  if(!sourceMask){occupancy[i]=1;trace[i]=1;continue;}
  const z=Math.floor(i/segments*evidence.layers);
  const n=evidence.n,offset=z*n*n;
  let open=0,transverse=0;
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
   const v=1-evidence.mask[offset+y*n+x];
   open+=v;
   if(x>0&&v&&!(evidence.mask[offset+y*n+x-1]))transverse++;
  }
  const phi=open/(n*n);
  occupancy[i]=clamp(phi,.12,1);
  trace[i]=clamp((transverse/(n*n)+.02)/.4,.15,2);
 }
 const C=new Float64Array(segments),L=new Float64Array(segments),R=new Float64Array(segments);
 const Rmhd=new Float64Array(segments),Rvisc=new Float64Array(segments);
 const areaNode=new Float64Array(segments);
 // A local V10 resistance proxy is applied only where the user/source
 // geometry has enough valid throughflow to support a bounded estimate.
 const multiplier=evidence?.supported?evidence.resistanceMultiplier:1;
 invariant(multiplier>=1&&multiplier<=30,'Unbounded V10 hydraulic resistance');
 for(let i=0;i<segments;i++){
  areaNode[i]=baseArea*occupancy[i];
  C[i]=areaNode[i]*dx/fluid.bulkPa;
 }
 for(let i=0;i<segments;i++){
  const a=2*areaNode[i]*areaNode[(i+1)%segments]/
   (areaNode[i]+areaNode[(i+1)%segments]);
  L[i]=fluid.rho*dx/a;
  // Poiseuille resistance for each finite segment of equivalent area.
  // The original V10 water-network transport is NOT a calibrated constitutive
  // law for this torus or for conducting liquid metals.
  Rvisc[i]=(8*Math.PI*fluid.mu*dx/(baseArea*baseArea))*
   multiplier/(trace[i]);
  // Quasi-static uniform-field, constant-load Faraday generator reference.
  // Rmag = sigma B² (1-K) l/A in Ohm-hydraulic equivalent. This positive
  // damping cannot increase fluid kinetic/acoustic energy.
  Rmhd[i]=fluid.sigma*fieldTesla**2*(1-loadFactor)*dx/a;
  R[i]=Rvisc[i]+Rmhd[i];
 }
 // CFL-like bound chosen for fast, well-conditioned implicit fixed point.
 const waveSpeed=Math.sqrt(fluid.bulkPa/fluid.rho);
 const dt=.20*dx/waveSpeed;
 const state={segments,fluid,material,mode,basePressurePa,initialPulsePa,loadFactor,fieldTesla,
  sourceMask:!!sourceMask,sourceId:evidence?.checksum||null,
  sourceLabel:evidence?.source||'OPEN REFERENCE; NO V10 MASK',
  areaNode,occupancy,trace,C,L,R,Rvisc,Rmhd,
  pressure:new Float64Array(segments),flow:new Float64Array(segments),
  dx,dt,timeS:0,step:0,lengthM:circumference,waveSpeed,
  electricalJ:0,viscousHeatJ:0,mhdJouleHeatJ:0,
  powerInputAfterStartJ:0,numericalResidualJ:0,maximumFlowM3S:0};
 if(mode==='pulse'&&initialPulsePa>0){
  const width=segments*.04;let mean=0,totalC=0;
  for(let i=0;i<segments;i++){
   const dist=Math.min(Math.abs(i-sourceCell),segments-Math.abs(i-sourceCell));
   state.pressure[i]=initialPulsePa*Math.exp(-.5*(dist/width)**2);
   mean+=state.pressure[i]*C[i];totalC+=C[i];
  }
  mean/=totalC;
  for(let i=0;i<segments;i++)state.pressure[i]-=mean;
 }
 state.initialEnergyJ=passiveAcousticEnergy(state);
 state.totalMassPressureM3=state.pressure.reduce((v,p,i)=>v+p*C[i],0);
 return state;
}
export function passiveAcousticEnergy(s){
 let energy=0;
 for(let i=0;i<s.segments;i++)energy+=.5*s.C[i]*s.pressure[i]**2+
  .5*s.L[i]*s.flow[i]**2;
 return energy;
}
export function advancePassiveRing(s,steps=1){
 invariant(Number.isInteger(steps)&&steps>=0&&steps<=5000,'Invalid passive steps');
 const {segments:n,dt,pressure:p,flow:q,C,L,R,Rvisc,Rmhd}=s;
 for(let step=0;step<steps;step++){
  const oldE=passiveAcousticEnergy(s),oldP=p.slice(),oldQ=q.slice();
  const nextP=oldP.slice(),nextQ=oldQ.slice();
  // Implicit midpoint iteration. Small CFL = fast fixed-point contraction.
  for(let k=0;k<20;k++){
   let maxDp=0;
   for(let i=0;i<n;i++){
    const next=(i+1)%n,scale=dt/(2*L[i]),drag=dt*R[i]/(2*L[i]);
    nextQ[i]=((1-drag)*oldQ[i]+scale*
      (oldP[i]-oldP[next]+nextP[i]-nextP[next]))/(1+drag);
   }
   for(let i=0;i<n;i++){
    const prev=(i+n-1)%n;
    const refined=oldP[i]+dt/(2*C[i])*
     (oldQ[prev]+nextQ[prev]-oldQ[i]-nextQ[i]);
    maxDp=Math.max(maxDp,Math.abs(refined-nextP[i]));
    nextP[i]=refined;
   }
   if(maxDp<1e-10)break;
  }
  // Recompute final implicit flux from final pressure iterate.
  for(let i=0;i<n;i++){
   const next=(i+1)%n,scale=dt/(2*L[i]),drag=dt*R[i]/(2*L[i]);
   nextQ[i]=((1-drag)*oldQ[i]+scale*
    (oldP[i]-oldP[next]+nextP[i]-nextP[next]))/(1+drag);
  }
  let heat=0,magnetLoss=0,load=0,mhdJoule=0,peak=0;
  for(let i=0;i<n;i++){
   const qmid=(oldQ[i]+nextQ[i])/2;
   heat+=dt*Rvisc[i]*qmid*qmid;
   const loss=dt*Rmhd[i]*qmid*qmid;
   magnetLoss+=loss;load+=s.loadFactor*loss;mhdJoule+=(1-s.loadFactor)*loss;
   p[i]=nextP[i];q[i]=nextQ[i];
   peak=Math.max(peak,Math.abs(q[i]));
  }
  s.timeS+=dt;s.step++;s.maximumFlowM3S=Math.max(s.maximumFlowM3S,peak);
  s.viscousHeatJ+=heat;s.electricalJ+=load;
  s.mhdJouleHeatJ+=mhdJoule;
  s.numericalResidualJ+=(oldE-passiveAcousticEnergy(s))-heat-magnetLoss;
  // No external source term: the initial compressed state is the only energy.
 }
 return s;
}
export function passiveSnapshot(s){
 const n=s.segments,accum=Array.from(s.flow).reduce((a,b)=>a+b,0);
 const E=passiveAcousticEnergy(s);
 const closure=(s.initialEnergyJ-(E+s.viscousHeatJ+s.electricalJ+s.mhdJouleHeatJ));
 return {
  material:s.material,mode:s.mode,timeS:s.timeS,step:s.step,
  basePressurePa:s.basePressurePa,initialPulsePa:s.initialPulsePa,
  lengthM:s.lengthM,waveSpeedMPerS:s.waveSpeed,
  pressurePerturbationPa:Array.from(s.pressure),
  flowM3S:Array.from(s.flow),occupancy:Array.from(s.occupancy),
  meanCirculationM3S:accum/n,maxFlowM3S:Math.max(...s.flow.map(Math.abs)),
  initialStoredJ:s.initialEnergyJ,remainingStoredJ:E,
  viscousHeatJ:s.viscousHeatJ,electricalJ:s.electricalJ,
  mhdJouleHeatJ:s.mhdJouleHeatJ,powerInputAfterStartJ:0,
  closureResidualJ:closure,
  closureRelative:s.initialEnergyJ>0?closure/s.initialEnergyJ:0,
  sourceLabel:s.sourceLabel,sourceId:s.sourceId,modelType:'ONE-DIMENSIONAL COMPRESSIBLE RING, STATIC MEMBRANE CONSTRICTIONS'
 };
}
export function passiveCampaign(evidence,config={}){
 const tests=[
  ['UNIFORM PRESSURE','uniform','water20C'],
  ['ONE-TIME PRESSURE DISTURBANCE','pulse','water20C'],
  ['CONDUCTIVE LIQUID · MAGNETIC LOAD','pulse','galinstan']
 ];
 return tests.map(([name,mode,material])=>{
  const s=buildPassiveRing(evidence,{...config,mode,material});
  advancePassiveRing(s,900);
  return {name,...passiveSnapshot(s)};
 });
}
