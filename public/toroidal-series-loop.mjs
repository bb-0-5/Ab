/**
 * Two iris-actuated volumes IN THE SAME closed fluid circuit.
 * Finite-volume continuity: C_i dp_i/dt = Q_in - Q_out - dV_i/dt.
 * Directed 0->1 and 1->0 connections model ideal one-way valves.
 * Pressures, liquid inertia, magnetic current and work evolve step by step.
 * This is lumped dynamics, NOT CFD or a manufactured pump validation.
 */
import {torusPath,flowAtSpeed,FLUIDS} from './toroidal-energy-budget.mjs';
import {irisMembrane} from './toroidal-iris-stack.mjs';
const TAU=2*Math.PI,good=x=>Number.isFinite(x)&&x>0;
export const SERIAL_ARRANGEMENTS=Object.freeze([
 {id:'serial-phase',label:'IN SERIES · 90° · ALTERNATING STROKES',modules:2,angleDeg:90,polarity:1,spin:1,phaseRad:Math.PI,hydraulic:'series'},
 {id:'serial-sync',label:'IN SERIES · 90° · SAME-PHASE STROKES',modules:2,angleDeg:90,polarity:1,spin:1,phaseRad:0,hydraulic:'series'}
]);
function electricStep(old,Q,dt,mutual,L,R,gain){
 const diag=L/dt+R,b=mutual/dt,det=diag*diag-b*b;
 if(!(det>0))throw Error('Inductance matrix not positive definite');
 const rhs=Q.map((q,i)=>gain[i]*q+L/dt*old[i]+b*old[1-i]);
 return [(diag*rhs[0]-b*rhs[1])/det,(diag*rhs[1]-b*rhs[0])/det];
}
export function simulateSerialIris(selected='serial-phase',user={}){
 const c=typeof selected==='string'?SERIAL_ARRANGEMENTS.find(x=>x.id===selected):selected;
 if(!c||c.hydraulic!=='series'||c.modules!==2||!Number.isFinite(c.phaseRad))
  throw RangeError('Invalid serial arrangement');
 const o={frequencyHz:3,periods:7,stepsPerCycle:640,fieldTesla:.45,
  complianceM3PerPa:2e-10,loadOhm:.0005,internalOhm:.0005,
  inductanceH:.00012,mutualMax:.32,motorEfficiency:.7,idleWPerModule:.012,
  flowResistanceMultiplier:1,fluidOpenFraction:1,...user};
 if(!good(o.frequencyHz)||o.frequencyHz>25||!Number.isInteger(o.periods)||o.periods<3||o.periods>14||
  !Number.isInteger(o.stepsPerCycle)||o.stepsPerCycle<300||o.stepsPerCycle>1500||
  ![o.complianceM3PerPa,o.loadOhm,o.internalOhm,o.inductanceH,o.motorEfficiency].every(good)||
  o.motorEfficiency>1||!Number.isFinite(o.mutualMax)||o.mutualMax<0||o.mutualMax>.7||
  !Number.isFinite(o.fieldTesla)||o.fieldTesla<0||o.fieldTesla>3||!good(o.idleWPerModule)||
  !Number.isFinite(o.flowResistanceMultiplier)||o.flowResistanceMultiplier<1||o.flowResistanceMultiplier>30||
  !good(o.fluidOpenFraction)||o.fluidOpenFraction>1)
  throw RangeError('Invalid serial model parameters');
 const geometry=torusPath({majorRadiusM:.18,minorRadiusM:.045,ductDiameterM:.004,poloidalTurns:1,toroidalTurns:1});
 const fluid=FLUIDS.galinstan,A=Math.PI*(geometry.ductDiameterM/2)**2,hydraulicL=fluid.rho*geometry.lengthM/(2*A);
 const gain=[1,c.polarity].map(p=>p*o.fieldTesla*geometry.ductDiameterM/A);
 const tilt=Math.cos(c.angleDeg*Math.PI/180);
 const mutual=Math.abs(tilt)<1e-12?0:o.inductanceH*o.mutualMax*tilt;
 const dt=1/(o.frequencyHz*o.stepsPerCycle),steps=o.periods*o.stepsPerCycle,duration=steps*dt;
 const model={geometry,fluid,magneticFieldTesla:0,loadFactor:.5};
 // The V10 matched-grid Poiseuille Q_open/Q_mask ratio is an explicitly
 // unvalidated multiplier of curved-duct drag, NOT validated toroidal CFD.
 const friction=q=>flowAtSpeed(model,Math.max(0,q)/A).pressureViscousPa/2*o.flowResistanceMultiplier;
 const radius=(i,t)=>irisMembrane(TAU*o.frequencyHz*t+(i===1?c.phaseRad:0),{
  chamberLengthM:.028,fluidOpenFraction:o.fluidOpenFraction});
 let P=[0,0],Q=[0,0],I=[0,0],wallWorkJ=0,positiveWallJ=0,viscJ=0,loadJ=0,copperJ=0,magneticWorkJ=0;
 let clampedSteps=0,cavitationRiskSteps=0,flowSamples=0,lateCount=0,maximumFlowM3S=0;
 const massIn=[0,0],massOut=[0,0],wallVolumeChanges=[0,0],samples=[];
 for(let j=0;j<steps;j++){
  const t=j*dt,motion=[0,1].map(i=>({
   a:radius(i,t),m:radius(i,t+dt/2),b:radius(i,t+dt)
  }));
  const dV=motion.map(x=>x.b.volumeM3-x.a.volumeM3);
  const rate=dV.map(v=>v/dt);
  const Qhalf=[0,1].map(i=>Math.max(0,Q[i]+dt/2*
   (P[i]-P[1-i]-friction(Q[i])-gain[i]*I[i])/hydraulicL));
  const nextI=electricStep(I,Qhalf,dt,mutual,o.inductanceH,o.loadOhm+o.internalOhm,gain);
  const Ih=I.map((v,i)=>(v+nextI[i])/2);
  const Ph=[
   P[0]+dt/2*(Q[1]-Q[0]-rate[0])/o.complianceM3PerPa,
   P[1]+dt/2*(Q[0]-Q[1]-rate[1])/o.complianceM3PerPa
  ];
  const trialQ=[0,1].map(i=>Q[i]+dt*(Ph[i]-Ph[1-i]-friction(Qhalf[i])-gain[i]*Ih[i])/hydraulicL);
  const nextQ=trialQ.map(q=>Math.max(0,q));
  if(trialQ.some(q=>q<0))clampedSteps++;
  const qIn=[(Q[1]+nextQ[1])/2,(Q[0]+nextQ[0])/2],
        qOut=[(Q[0]+nextQ[0])/2,(Q[1]+nextQ[1])/2];
  const nextP=P.map((p,i)=>p+dt*(qIn[i]-qOut[i]-rate[i])/o.complianceM3PerPa);
  if(nextP.some(p=>p< -90000))cavitationRiskSteps++;
  for(let i=0;i<2;i++){
   const work=-Ph[i]*dV[i];wallWorkJ+=work;positiveWallJ+=Math.max(0,work);
   viscJ+=friction(Qhalf[i])*Qhalf[i]*dt;
   magneticWorkJ+=gain[i]*Qhalf[i]*Ih[i]*dt;
   copperJ+=Ih[i]*Ih[i]*o.internalOhm*dt;
   loadJ+=Ih[i]*Ih[i]*o.loadOhm*dt;
   massIn[i]+=qIn[i]*dt;massOut[i]+=qOut[i]*dt;wallVolumeChanges[i]+=dV[i];
  }
  Q=nextQ;P=nextP;I=nextI;
  if(j>=2*o.stepsPerCycle){lateCount++;const flow=(Q[0]+Q[1])/2;flowSamples+=flow;maximumFlowM3S=Math.max(maximumFlowM3S,flow)}
  if(j%Math.max(1,Math.floor(o.stepsPerCycle/45))===0||j===steps-1){
   samples.push({tS:(j+1)*dt,
    modules:[0,1].map(i=>({Qm3S:Q[i],pressurePa:P[i],currentA:I[i],
     emittedVm3S:-rate[i],membraneRadiiM:[motion[i].m.radiusM],headPositions:[motion[i].m.position]})),
    grossElectricalW:loadJ/((j+1)*dt)});
  }
 }
 const fluidJ=hydraulicL*(Q[0]*Q[0]+Q[1]*Q[1])/2,
  membraneComplianceJ=o.complianceM3PerPa*(P[0]*P[0]+P[1]*P[1])/2,
  magneticJ=o.inductanceH*(I[0]*I[0]+I[1]*I[1])/2+mutual*I[0]*I[1];
 const closureJ=wallWorkJ-viscJ-loadJ-copperJ-fluidJ-membraneComplianceJ-magneticJ;
 const denom=Math.max(positiveWallJ,Math.abs(wallWorkJ),
  viscJ+loadJ+copperJ+fluidJ+membraneComplianceJ+magneticJ,1e-16);
 const motorJ=positiveWallJ/o.motorEfficiency+2*o.idleWPerModule*duration;
 const continuityErrorM3=[0,1].map(i=>o.complianceM3PerPa*P[i]+wallVolumeChanges[i]-massIn[i]+massOut[i]);
 return {configuration:c,options:o,geometry,fluid,mutualH:mutual,
  couplingCoefficient:mutual/o.inductanceH,simulationSeconds:duration,stepSeconds:dt,
  meanTotalFlowM3S:flowSamples/Math.max(1,lateCount),maximumFlowM3S,
  grossElectricalW:loadJ/duration,motorElectricalW:motorJ/duration,
  netElectricalW:(loadJ-motorJ)/duration,hydraulicInputW:wallWorkJ/duration,
  maxRelativeEnergyError:Math.abs(closureJ)/denom,
  electricalClosureErrorJ:magneticWorkJ-loadJ-copperJ-magneticJ,
  continuityErrorM3,negativePressureSteps:cavitationRiskSteps,cavitationRiskSteps,
  valveClampedSteps:clampedSteps,linkageClosureErrorM:0,
  finalStored:{fluidJ,membraneComplianceJ,magneticJ},
  energy:{signedWallWorkJ:wallWorkJ,positiveWallWorkJ:positiveWallJ,viscousJ:viscJ,
   loadJ,copperJ,magneticWorkJ,motorJ,closureJ},
  samples,
  modelLimitations:['Two moving control volumes in ONE closed circuit with two ideal oriented one-way valves',
    'Signed wall volume changes obey two-cell fluid mass conservation',
    'No 3-D CFD, physical valve characterization, casing compliance validation or elastomer FSI',
    'Mutual inductance uses ideal cosine orientation, not Maxwell field mapping',
    'External motor powers membrane motion; net generator energy is calculated including this input']};
}
