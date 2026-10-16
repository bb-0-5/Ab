/**
 * AboveBound — bounded moving-iris / crossed MHD engineering experiment.
 * Geometric four-bar linkage -> membrane chamber area -> volumetric strokes.
 * Each module is its OWN hydraulic loop; coils may interact through mutual
 * inductance. No claimed serial hydraulic connection or field amplification.
 * No CFD, moving-mesh FSI, permanent-magnet FEM or certified predictions.
 */
import {torusPath,flowAtSpeed,FLUIDS} from './toroidal-energy-budget.mjs';
const TAU=2*Math.PI;
const L={ground:.016,crank:.003,coupler:.015,follower:.010};
const requireCondition=(x,msg)=>{if(!x)throw new RangeError(msg)};
const positive=x=>Number.isFinite(x)&&x>0;
const area=r=>Math.PI*r*r;
function solveFourBar(theta){
 const B=[L.crank*Math.cos(theta),L.crank*Math.sin(theta)],D=[L.ground,0];
 const dx=D[0]-B[0],dy=-B[1],sep=Math.hypot(dx,dy);
 if(sep>L.coupler+L.follower||sep<Math.abs(L.coupler-L.follower))
   throw Error('Four-bar branch has no real linkage closure');
 const along=(L.coupler**2-L.follower**2+sep**2)/(2*sep);
 const normal=Math.sqrt(Math.max(0,L.coupler**2-along**2));
 const C=[B[0]+along*dx/sep-normal*dy/sep,
          B[1]+along*dy/sep+normal*dx/sep];
 const followerAngle=Math.atan2(C[1]-D[1],C[0]-D[0]);
 const errorCrank=Math.abs(Math.hypot(C[0]-B[0],C[1]-B[1])-L.coupler);
 const errorFollower=Math.abs(Math.hypot(C[0]-D[0],C[1]-D[1])-L.follower);
 return {A:[0,0],B,C,D,followerAngle,closureErrorM:Math.max(errorCrank,errorFollower)};
}
const range=(()=>{
 let min=Infinity,max=-Infinity;
 for(let i=0;i<=720;i++){
  const gamma=solveFourBar(TAU*i/720).followerAngle;
  min=Math.min(min,gamma);max=Math.max(max,gamma);
 }
 return {min,max};
})();
export function irisLinkage(angle){return solveFourBar(angle)}
export function irisMembrane(angle,{radiusM=.002,strokeFraction=.11,chamberLengthM=.008}={}){
 requireCondition(positive(radiusM)&&strokeFraction>0&&strokeFraction<.35&&positive(chamberLengthM),'Bad membrane dimensions');
 const gamma=solveFourBar(angle).followerAngle;
 const position=2*(gamma-range.min)/(range.max-range.min)-1;
 const r=radiusM*(1+strokeFraction*position);
 const delta=1e-4;
 const displacementRate=radiusM*strokeFraction*2/(range.max-range.min)*
  (solveFourBar(angle+delta).followerAngle-solveFourBar(angle-delta).followerAngle)/(2*delta);
 return {radiusM:r,referenceRadiusM:radiusM,position,volumeM3:area(r)*chamberLengthM,
  dVolumeDangleM3:2*Math.PI*r*chamberLengthM*displacementRate,
  closureErrorM:solveFourBar(angle).closureErrorM};
}
export const CONFIGURATIONS=Object.freeze([
 {id:'single',label:'ONE TORUS · BASELINE',modules:1,angleDeg:0,polarity:1,spin:1,phaseRad:0},
 {id:'aligned',label:'TWO · ALIGNED / N-S',modules:2,angleDeg:0,polarity:1,spin:1,phaseRad:0},
 {id:'orthogonal',label:'TWO · 90° CROSS',modules:2,angleDeg:90,polarity:1,spin:1,phaseRad:Math.PI/2},
 {id:'inverted',label:'TWO · POLARITY / PHASE INVERT',modules:2,angleDeg:0,polarity:-1,spin:1,phaseRad:Math.PI},
 {id:'counter',label:'TWO · COUNTER-ROTATING IRIS',modules:2,angleDeg:90,polarity:1,spin:-1,phaseRad:Math.PI/2},
]);
export function validateConfiguration(choice){
 const c=typeof choice==='string'?CONFIGURATIONS.find(x=>x.id===choice):choice;
 requireCondition(c&&[1,2].includes(c.modules)&&Number.isFinite(c.angleDeg)&&
  Math.abs(c.angleDeg)<=180&&[-1,1].includes(c.spin)&&[-1,1].includes(c.polarity)&&
  Number.isFinite(c.phaseRad),'Invalid stack arrangement');
 return c;
}
export function chamberOutputAt(timeS,{heads=4,frequencyHz=3,spin=1,phaseRad=0}={}){
 requireCondition(Number.isFinite(timeS)&&timeS>=0&&Number.isInteger(heads)&&heads>=1&&heads<=12&&
  positive(frequencyHz)&&frequencyHz<=30,'Invalid iris chronology');
 const omega=TAU*frequencyHz*spin;
 let outputM3S=0,intakeM3S=0,volumeM3=0;
 const chambers=[];
 for(let h=0;h<heads;h++){
  const angle=omega*timeS+phaseRad-h*TAU/heads;
  const mem=irisMembrane(angle);
  const dVdt=mem.dVolumeDangleM3*omega;
  const out=Math.max(0,-dVdt),intake=Math.max(0,dVdt);
  outputM3S+=out;intakeM3S+=intake;volumeM3+=mem.volumeM3;
  chambers.push({head:h,radiusM:mem.radiusM,volumeM3:mem.volumeM3,
   outflowM3S:out,intakeM3S:intake,position:mem.position,linkageErrorM:mem.closureErrorM});
 }
 return {outputM3S,intakeM3S,volumeM3,chambers};
}
function electricalCurrents(modules,Q,oldI,dt,mutual,inductance,resistance,coeff){
 const count=modules;
 const e=Q.map((q,i)=>coeff[i]*q);
 const a=inductance/dt+resistance;
 if(count===1)return {next:[(e[0]+inductance/dt*oldI[0])/a],emf:e};
 const b=mutual/dt,det=a*a-b*b;
 requireCondition(det>0,'Inductance matrix must be passive');
 const rhs0=e[0]+inductance/dt*oldI[0]+b*oldI[1];
 const rhs1=e[1]+inductance/dt*oldI[1]+b*oldI[0];
 return {next:[(a*rhs0-b*rhs1)/det,(a*rhs1-b*rhs0)/det],emf:e};
}
export function simulateIrisStack(choice='orthogonal',options={}){
 const c=validateConfiguration(choice);
 const opts={heads:4,frequencyHz:3,periods:6,stepsPerCycle:480,
  magneticFieldTesla:.45,loadOhm:.0005,internalOhm:.0005,
  inductanceH:.00012,mutualMaximum:.32,
  complianceM3PerPa:6e-10,driveEfficiency:.7,idleWPerModule:.012,
  ...options};
 requireCondition(Number.isInteger(opts.periods)&&opts.periods>=3&&opts.periods<=14&&
  Number.isInteger(opts.stepsPerCycle)&&opts.stepsPerCycle>=300&&opts.stepsPerCycle<=1200&&
  Number.isInteger(opts.heads)&&opts.heads>=1&&opts.heads<=12&&
  positive(opts.frequencyHz)&&opts.frequencyHz<=30&&
  [opts.loadOhm,opts.internalOhm,opts.inductanceH,opts.complianceM3PerPa].every(positive)&&
  opts.mutualMaximum>=0&&opts.mutualMaximum<=.7&&
  opts.magneticFieldTesla>=0&&opts.magneticFieldTesla<=3&&
  opts.driveEfficiency>0&&opts.driveEfficiency<=1&&opts.idleWPerModule>=0,'Invalid model bounds');
 const geometry=torusPath({majorRadiusM:.18,minorRadiusM:.045,
  ductDiameterM:.004,poloidalTurns:1,toroidalTurns:1});
 const fluid=FLUIDS.galinstan,areaM2=area(geometry.ductDiameterM/2);
 const inertance=fluid.rho*geometry.lengthM/areaM2;
 const coeff=Array.from({length:c.modules},(_,i)=>opts.magneticFieldTesla*geometry.ductDiameterM/areaM2*
   (i===1?c.polarity:1));
 // cos(theta) is a coaxial/dipole *proxy*, not a full field map.
 const mutual=c.modules===1?0:opts.inductanceH*opts.mutualMaximum*Math.cos(c.angleDeg*Math.PI/180);
 const totalResistance=opts.loadOhm+opts.internalOhm;
 const dt=1/(opts.frequencyHz*opts.stepsPerCycle),total=opts.periods*opts.stepsPerCycle;
 const states=Array.from({length:c.modules},()=>({Q:0,P:0}));
 let current=Array(c.modules).fill(0);
 let actuatorJ=0,viscousJ=0,electroMechanicalJ=0,loadJ=0,copperJ=0,negativePressureSteps=0;
 let maximumClosureErrorM=0;
 const samples=[],phaseSamples=[];
 const loopModel={geometry,fluid,magneticFieldTesla:0,loadFactor:.5};
 for(let step=0;step<total;step++){
  const t=(step+.5)*dt;
  const chambers=states.map((_,j)=>chamberOutputAt(t,{
   heads:opts.heads,frequencyHz:opts.frequencyHz,
   spin:j===1?c.spin:1,phaseRad:j===1?c.phaseRad:0
  }));
  let Qm=states.map((s,i)=>{
   const curve=flowAtSpeed(loopModel,s.Q/areaM2);
   const magneticLoss=coeff[i]*current[i];
   return Math.max(0,s.Q+.5*dt*(s.P-curve.pressureViscousPa-magneticLoss)/inertance);
  });
  const currents=electricalCurrents(c.modules,Qm,current,dt,mutual,
   opts.inductanceH,totalResistance,coeff);
  const midI=current.map((v,i)=>(v+currents.next[i])/2);
  const midP=states.map((s,i)=>s.P+.5*dt*(chambers[i].outputM3S-s.Q)/opts.complianceM3PerPa);
  const next=states.map((s,i)=>{
   const friction=flowAtSpeed(loopModel,Qm[i]/areaM2).pressureViscousPa;
   const drag=coeff[i]*midI[i];
   const q=Math.max(0,s.Q+dt*(midP[i]-friction-drag)/inertance);
   const p=s.P+dt*(chambers[i].outputM3S-(s.Q+q)/2)/opts.complianceM3PerPa;
   if(p<0){negativePressureSteps++;} // failure of cavitation-free model
   actuatorJ+=Math.max(0,midP[i])*chambers[i].outputM3S*dt;
   viscousJ+=friction*Qm[i]*dt;
   electroMechanicalJ+=(coeff[i]*Qm[i])*midI[i]*dt;
   loadJ+=midI[i]**2*opts.loadOhm*dt;
   copperJ+=midI[i]**2*opts.internalOhm*dt;
   maximumClosureErrorM=Math.max(maximumClosureErrorM,...chambers[i].chambers.map(h=>h.linkageErrorM));
   return {Q:q,P:Math.max(0,p)};
  });
  for(let j=0;j<c.modules;j++)states[j]=next[j];
  current=currents.next;
  if(step%Math.max(1,Math.floor(opts.stepsPerCycle/45))===0||step===total-1){
   const snapshot={tS:(step+1)*dt,modules:states.map((s,i)=>({
    Qm3S:s.Q,pressurePa:s.P,currentA:current[i],
    emittedVm3S:chambers[i].outputM3S,
    membraneRadiiM:chambers[i].chambers.map(x=>x.radiusM),
    headPositions:chambers[i].chambers.map(x=>x.position)})),
    grossElectricalW:current.reduce((sum,I)=>sum+I*I*opts.loadOhm,0)};
   samples.push(snapshot);
   if(step>=2*opts.stepsPerCycle)phaseSamples.push(snapshot);
  }
 }
 const storedFluidJ=states.reduce((sum,s)=>sum+.5*inertance*s.Q*s.Q,0);
 const storedComplianceJ=states.reduce((sum,s)=>sum+.5*opts.complianceM3PerPa*s.P*s.P,0);
 const storedMagneticJ=current.reduce((sum,I)=>sum+.5*opts.inductanceH*I*I,0)
  +(c.modules===2?mutual*current[0]*current[1]:0);
 const duration=opts.periods/opts.frequencyHz;
 const driveJ=actuatorJ/opts.driveEfficiency+opts.idleWPerModule*c.modules*duration;
 const outputW=loadJ/duration,motorW=driveJ/duration;
 const flowMean=states.reduce((sum,_,j)=>sum+phaseSamples.reduce((t,x)=>t+x.modules[j].Qm3S,0)/Math.max(1,phaseSamples.length),0);
 const maxRelativeEnergyError=Math.abs(actuatorJ-(viscousJ+loadJ+copperJ+storedFluidJ+storedComplianceJ+storedMagneticJ))/
  Math.max(actuatorJ,1e-25);
 const electricalClosureErrorJ=electroMechanicalJ-loadJ-copperJ-storedMagneticJ;
 return {configuration:c,options:opts,geometry,fluid,mutualH:mutual,
  couplingCoefficient:mutual/opts.inductanceH,simulationSeconds:duration,stepSeconds:dt,
  meanTotalFlowM3S:flowMean,grossElectricalW:outputW,motorElectricalW:motorW,
  netElectricalW:outputW-motorW,hydraulicInputW:actuatorJ/duration,
  maxRelativeEnergyError,electricalClosureErrorJ,negativePressureSteps,
  linkageClosureErrorM:maximumClosureErrorM,
  finalStored:{fluidJ:storedFluidJ,membraneComplianceJ:storedComplianceJ,magneticJ:storedMagneticJ},
  energy:{actuatorHydraulicJ:actuatorJ,viscousJ,electroMechanicalJ,
   electricalOutputJ:loadJ,copperHeatJ:copperJ,motorElectricalJ:driveJ},
  seriesOpenCircuitVoltageV:coeff.reduce((sum,k,i)=>sum+k*states[i].Q,0),
  samples,
  modelLimitations:['Two hydraulically independent loops with a shared inductive circuit model; not a serial liquid connection',
   'Iris radius follows exact planar four-bar closure, but transfer to circular membrane aperture is assumed',
   'Check-valve rectification and compliance are lumped; no transient 3-D moving-wall CFD',
   'Mutual inductance uses an orientation cosine proxy; real coils and permanent magnets need a field solver',
   'All electrical output comes from externally supplied mechanical pumping energy; no free amplification']};
}
export function compareIrisStacks(options={}){
 return CONFIGURATIONS.map(c=>simulateIrisStack(c,options));
}
