/**
 * AboveBound toroidal iris/MHD audit. A deliberately reduced-order engineering
 * model, NOT moving-wall CFD, FSI, resolved vortices or a free-energy device.
 * Derived from the supplied diagonal torus + diaphragm + Faraday system papers.
 * A pump head is an external energy input, never a generated resource.
 */
export const FLUIDS=Object.freeze({
 water20C:{name:'water, 20 C',rho:998.2,mu:1.002e-3,sigma:5e-4},
 galinstan:{name:'Galinstan, ideal clean surface',rho:6440,mu:2.4e-3,sigma:2.3e6}
});
const TAU=2*Math.PI;
const good=x=>Number.isFinite(x)&&x>0;
function requireState(ok,msg){if(!ok)throw new RangeError(msg);}
export function torusPath({majorRadiusM:R,minorRadiusM:r,ductDiameterM:d,poloidalTurns:p=1,toroidalTurns:q=1,samples=360}){
 requireState([R,r,d].every(good)&&R>r+d/2,'Invalid torus/duct clearance');
 requireState(Number.isInteger(p)&&p>=0&&p<=8&&Number.isInteger(q)&&q>=1&&q<=8
  &&Number.isInteger(samples)&&samples>=120&&samples<=2048,'Invalid winding/resolution');
 let length=0,curvatureDs=0,maxK=0;
 for(let i=0;i<samples;i++){
  const t=TAU*i/samples,theta=q*t,phi=p*t;
  const a=R+r*Math.cos(phi),b=-r*p*Math.sin(phi),c=-r*p*p*Math.cos(phi);
  const x1=b*Math.cos(theta)-a*q*Math.sin(theta);
  const y1=b*Math.sin(theta)+a*q*Math.cos(theta),z1=r*p*Math.cos(phi);
  const x2=(c-a*q*q)*Math.cos(theta)-2*b*q*Math.sin(theta);
  const y2=(c-a*q*q)*Math.sin(theta)+2*b*q*Math.cos(theta),z2=-r*p*p*Math.sin(phi);
  const speed=Math.hypot(x1,y1,z1);
  const k=Math.hypot(y1*z2-z1*y2,z1*x2-x1*z2,x1*y2-y1*x2)/speed**3;
  const ds=speed*TAU/samples;length+=ds;curvatureDs+=ds*k;maxK=Math.max(maxK,k);
 }
 const meanK=curvatureDs/length;
 return {lengthM:length,meanCurvatureRadiusM:1/meanK,
  minimumCurvatureRadiusM:1/maxK,relativeCurvature:d*meanK/2,
  ductDiameterM:d,majorRadiusM:R,minorRadiusM:r,poloidalTurns:p,toroidalTurns:q};
}
export function whiteDarcy(Re,De,curvature){
 if(!good(Re))return 0;
 if(De<=11.6)return 64/Re;
 if(De>2000||Re>=2000||curvature>0.066)return null;
 const x=1-(11.6/De)**.45;
 return 64/Re/(1-x**2.22);
}
export function flowAtSpeed(model,speed){
 requireState(Number.isFinite(speed)&&speed>=0,'Invalid flow speed');
 const {geometry:g,fluid:f,magneticFieldTesla:B,loadFactor:K}=model;
 const A=Math.PI*(g.ductDiameterM/2)**2,L=g.lengthM,Q=A*speed;
 if(speed===0)return {velocityMPerS:0,flowM3S:0,Re:0,De:0,
  pressureViscousPa:0,pressureMagneticPa:0,pressureTotalPa:0,
  hydraulicViscousW:0,lorentzWorkW:0,loadElectricalW:0,jouleHeatW:0,
  electricalBalanceErrorW:0,openCircuitV:0,validCurvature:g.poloidalTurns===0};
 const Re=f.rho*speed*g.ductDiameterM/f.mu;
 const De=Re*Math.sqrt(g.ductDiameterM/(2*g.meanCurvatureRadiusM));
 let friction=whiteDarcy(Re,De,g.relativeCurvature);
 // White's calibration assumes a uniformly curved circular duct. Actual
 // diagonal torus knots have torsion and varying curvature: flag unsupported.
 const validCurvature=friction!==null&&g.poloidalTurns===0;
 // Straight-duct extrapolation is a DIAGNOSTIC only, never a validated win.
 if(friction===null)friction=Re<2300?64/Re:0.3164/Re**.25;
 const pressureViscousPa=friction*L/g.ductDiameterM*f.rho*speed**2/2;
 const pressureMagneticPa=f.sigma*B**2*speed*(1-K)*L;
 const mhdVolume=A*L;
 const lorentzWorkW=pressureMagneticPa*Q;
 const loadElectricalW=f.sigma*speed**2*B**2*mhdVolume*K*(1-K);
 const jouleHeatW=f.sigma*speed**2*B**2*mhdVolume*(1-K)**2;
 return {velocityMPerS:speed,flowM3S:Q,Re,De,friction,
  pressureViscousPa,pressureMagneticPa,pressureTotalPa:pressureViscousPa+pressureMagneticPa,
  hydraulicViscousW:pressureViscousPa*Q,lorentzWorkW,loadElectricalW,jouleHeatW,
  electricalBalanceErrorW:lorentzWorkW-loadElectricalW-jouleHeatW,
  openCircuitV:speed*B*g.ductDiameterM,validCurvature};
}
export function operatingPoint(cfg){
 const {fluid='galinstan',magneticFieldTesla=0.75,loadFactor=.5,
  actuatorHeadPa=1500,pumpEfficiency=.7,driveParasiticW=.1}=cfg;
 const f=typeof fluid==='string'?FLUIDS[fluid]:fluid;
 requireState(f&&good(f.rho)&&good(f.mu)&&Number.isFinite(f.sigma)&&f.sigma>=0,'Invalid fluid');
 requireState(Number.isFinite(magneticFieldTesla)&&magneticFieldTesla>=0&&magneticFieldTesla<=5,'Invalid magnetic field');
 requireState(loadFactor>0&&loadFactor<1,'Invalid load');
 requireState(good(actuatorHeadPa)&&actuatorHeadPa<=1e7,'Invalid actuator supply');
 requireState(pumpEfficiency>0&&pumpEfficiency<=1&&Number.isFinite(driveParasiticW)&&driveParasiticW>=0,'Invalid drive losses');
 const geometry=torusPath(cfg);
 const model={geometry,fluid:f,magneticFieldTesla,loadFactor};
 let lo=0,hi=.05;
 while(flowAtSpeed(model,hi).pressureTotalPa<actuatorHeadPa&&hi<16)hi*=2;
 requireState(hi<16,'Flow beyond bounded model search');
 for(let i=0;i<55;i++){
  const mid=(hi+lo)/2;
  if(flowAtSpeed(model,mid).pressureTotalPa>actuatorHeadPa)hi=mid;else lo=mid;
 }
 const flow=flowAtSpeed(model,(hi+lo)/2);
 const driveElectricalW=flow.pressureTotalPa*flow.flowM3S/pumpEfficiency+driveParasiticW;
 const netElectricW=flow.loadElectricalW-driveElectricalW;
 return {model,geometry,flow,actuatorHeadPa,pumpEfficiency,driveParasiticW,
  driveElectricalW,netElectricW,harvestToDriveRatio:flow.loadElectricalW/driveElectricalW,
  validated:false,correlationApplicable:flow.validCurvature,
  status:flow.validCurvature?'REDUCED-ORDER ONLY':'CURVED-FLOW CORRELATION UNSUPPORTED',
  caveats:['Fixed external actuator pressure: not a free-running fluid loop',
   'Equivalent circular duct; no iris/membrane FSI, torsion-dependent Dean CFD, oxide rheology or electrode end effects',
   'MHD Ohmic and Lorentz energy flows enforced; generated load power is bounded by pump work']};
}
/** A normalized array of displaced-volume pump heads, represented as a
 * prescribed pressure source. The mean is 1 independent of number of heads.
 */
export function phasedHead(t,heads){
 requireState(Number.isInteger(heads)&&heads>=1&&heads<=16,'Invalid heads');
 let s=0;for(let i=0;i<heads;i++)s+=Math.max(0,Math.sin(t-TAU*i/heads));
 return Math.PI*s/heads;
}
/** Chronological inertance response: Lh * dQ/dt = p_act(t)-p_loss(Q).
 * The check-valve proxy clips reverse flow; it does not simulate valve FSI.
 */
export function simulatePhasedDrive(point,{heads=4,hertz=2,periods=5,stepsPerPeriod=640}={}){
 requireState(Number.isInteger(heads)&&heads>=1&&heads<=16&&good(hertz)&&hertz<=50
  &&Number.isInteger(periods)&&periods>=3&&periods<=12
  &&Number.isInteger(stepsPerPeriod)&&stepsPerPeriod>=200&&stepsPerPeriod<=1600,'Invalid chronology');
 const {geometry:g,model,actuatorHeadPa:head}=point;
 const area=Math.PI*(g.ductDiameterM/2)**2;
 const inertance=model.fluid.rho*g.lengthM/area,dt=1/(hertz*stepsPerPeriod);
 let Q=0,workJ=0,viscJ=0,lorentzJ=0,electricJ=0,jouleJ=0;
 let count=0,sum=0,sumsq=0,min=Infinity,max=0;
 const history=[];
 for(let i=0;i<periods*stepsPerPeriod;i++){
  const t=(i+.5)*dt,dpDrive=head*phasedHead(t*TAU*hertz,heads);
  const old=flowAtSpeed(model,Q/area);
  const midQ=Math.max(0,Q+.5*dt*(dpDrive-old.pressureTotalPa)/inertance);
  const mid=flowAtSpeed(model,midQ/area);
  Q=Math.max(0,Q+dt*(dpDrive-mid.pressureTotalPa)/inertance);
  workJ+=dpDrive*midQ*dt;viscJ+=mid.hydraulicViscousW*dt;lorentzJ+=mid.lorentzWorkW*dt;
  electricJ+=mid.loadElectricalW*dt;jouleJ+=mid.jouleHeatW*dt;
  if(i>=2*stepsPerPeriod){count++;sum+=Q;sumsq+=Q*Q;min=Math.min(min,Q);max=Math.max(max,Q)}
  if(i%Math.floor(stepsPerPeriod/20)===0||i===periods*stepsPerPeriod-1)
   history.push({timeS:(i+1)*dt,flowM3S:Q,actuatorPressurePa:dpDrive,
    outputElectricalW:mid.loadElectricalW,storedKineticJ:.5*inertance*Q*Q});
 }
 const kineticJ=.5*inertance*Q*Q,mean=sum/count;
 return {heads,hertz,stepS:dt,meanFlowM3S:mean,minimumFlowM3S:min,maximumFlowM3S:max,
  flowRippleCV:Math.sqrt(Math.max(0,sumsq/count-mean*mean))/Math.max(1e-30,mean),
  energy:{actuatorHydraulicJ:workJ,viscousLossJ:viscJ,lorentzWorkJ:lorentzJ,
   electricalOutputJ:electricJ,jouleHeatJ:jouleJ,fluidKineticEndJ:kineticJ,
   closureErrorJ:workJ-viscJ-lorentzJ-kineticJ,
   electricBalanceErrorJ:lorentzJ-electricJ-jouleJ},
  history,validated:false,model:'1D hydraulic inertance + prescribed phased pressure; NOT membrane CFD'};
}
export function automaticToroidalAudit(){
 const input={majorRadiusM:.18,minorRadiusM:.045,ductDiameterM:.004,
  poloidalTurns:1,toroidalTurns:1,actuatorHeadPa:1500,pumpEfficiency:.7,driveParasiticW:.1};
 // Reference circle and two alternative diagonal channel arrangements.
 // Compare all cases at exactly the same external pressure head and duct size.
 const paths=[
  {poloidalTurns:0,toroidalTurns:1},
  {poloidalTurns:1,toroidalTurns:1},
  {poloidalTurns:1,toroidalTurns:2}
 ];
 const variations=paths.flatMap(path=>[0,.25,.75,1.5].map(B=>({
  ...path,fluid:'galinstan',magneticFieldTesla:B
 }))).concat([{poloidalTurns:1,toroidalTurns:1,fluid:'water20C',magneticFieldTesla:.75}]);
 const rows=variations.map(v=>operatingPoint({...input,...v}));
 return {input,rows,
  modeledReference:rows.filter(r=>r.geometry.poloidalTurns===0),
  diagonalHypotheses:rows.filter(r=>r.geometry.poloidalTurns>0),
  purpose:'Conserve energy and vary route winding, field and working fluid at the same externally supplied pressure head. Diagonal torsion remains unvalidated.'};
}
