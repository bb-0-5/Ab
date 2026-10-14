/** Coupled 2D Boussinesq slice model (2.5D), local-first research prototype.
 * Each XY slice contains temperature T, streamfunction psi and vorticity omega.
 * Adjacent Z slices exchange heat and momentum by their measured finite differences.
 * Model restrictions: w=0, no Z advection or Z pressure solve; NOT full 3D CFD.
 * Grid is non-dimensional, fixed bottom heating and top cooling. Numerical result
 * is exploratory and should not be treated as a validated fluid prediction.
 */
export const MODEL = Object.freeze({n:25, layers:11, dt:0.004, nu:0.014, alpha:0.009, buoyancy:12, poissonSweeps:26});
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const idx=(k,y,x,n)=>k*n*n+y*n+x;
const clampValue=(v)=>Number.isFinite(v)?clamp(v,-1e6,1e6):0;

export function createSliceEngine({n=MODEL.n,layers=MODEL.layers,hotspot=0}={}){
 if(!Number.isInteger(n)||n<9||n>49||!Number.isInteger(layers)||layers<5||layers>21)throw Error('invalid slice resolution');
 const count=n*n*layers, h=1/(n-1), dz=1/(layers-1);
 const e={n,layers,hotspot,dt:MODEL.dt,step:0,time:0,h,dz,
   T:new Float64Array(count),psi:new Float64Array(count),omega:new Float64Array(count),
   u:new Float64Array(count),v:new Float64Array(count),psiWork:new Float64Array(count),
   tempWork:new Float64Array(count),omegaWork:new Float64Array(count)};
 // The bottom wall is a known forcing condition, not randomly animated fluid.
 for(let k=0;k<layers;k++)for(let y=0;y<n;y++)for(let x=0;x<n;x++){
   const at=idx(k,y,x,n);e.T[at]=1-y/(n-1);
 }
 applyThermalBoundaries(e);return e;
}
export function bottomTemperature(x,hotspot=0){
 const peaks=[[.5],[.32,.68],[.23,.5,.78]][((hotspot%3)+3)%3];
 let s=0;for(const c of peaks)s+=Math.exp(-Math.pow((x-c)/.14,2));
 return .48+.52*clamp(s,0,1);
}
function applyThermalBoundaries(e){
 const {n,layers,T,hotspot}=e;
 for(let k=0;k<layers;k++)for(let x=0;x<n;x++){
  T[idx(k,0,x,n)]=bottomTemperature(x/(n-1),hotspot);
  T[idx(k,n-1,x,n)]=0;
 }
 // Neumann zero horizontal heat flux across left/right walls.
 for(let k=0;k<layers;k++)for(let y=1;y<n-1;y++){
  T[idx(k,y,0,n)]=T[idx(k,y,1,n)];
  T[idx(k,y,n-1,n)]=T[idx(k,y,n-2,n)];
 }
}
function solveStreamfunction(e){
 const {n,layers,omega,psi,u,v,h}=e;
 const inv=1/(4);
 // Dirichlet streamfunction=0 on the rigid boundaries.
 for(let sweeps=0;sweeps<MODEL.poissonSweeps;sweeps++){
  for(let k=1;k<layers-1;k++)for(let y=1;y<n-1;y++)for(let x=1;x<n-1;x++){
   const q=idx(k,y,x,n);
   const val=(psi[q-1]+psi[q+1]+psi[q-n]+psi[q+n]+h*h*omega[q])*inv;
   // Stabilised Gauss–Seidel to reduce lag without changing elliptic model.
   psi[q]=.96*val+.04*psi[q];
  }
 }
 u.fill(0);v.fill(0);
 for(let k=1;k<layers-1;k++)for(let y=1;y<n-1;y++)for(let x=1;x<n-1;x++){
  const q=idx(k,y,x,n);u[q]=(psi[q+n]-psi[q-n])/(2*h);v[q]=-(psi[q+1]-psi[q-1])/(2*h);
 }
 // Vorticity at a stationary solid wall from the adjacent streamfunction.
 const ih2=1/(h*h);
 for(let k=0;k<layers;k++){
  for(let x=0;x<n;x++){
   omega[idx(k,0,x,n)]=-2*psi[idx(k,1,x,n)]*ih2;
   omega[idx(k,n-1,x,n)]=-2*psi[idx(k,n-2,x,n)]*ih2;
  }
  for(let y=1;y<n-1;y++){
   omega[idx(k,y,0,n)]=-2*psi[idx(k,y,1,n)]*ih2;
   omega[idx(k,y,n-1,n)]=-2*psi[idx(k,y,n-2,n)]*ih2;
  }
 }
 // The front and back are also stationary rigid plates, with no in-plane slip.
 for(const k of [0,layers-1])for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const q=idx(k,y,x,n);psi[q]=0;omega[q]=0;u[q]=0;v[q]=0;
 }
}
const upwind=(minus,center,plus,velocity,invH)=>velocity>=0?(center-minus)*invH:(plus-center)*invH;
export function advanceSlices(e,steps=1){
 const {n,layers,T,omega,u,v,dt,h,dz,tempWork,omegaWork}=e;
 const idxy=n*n, ih=1/h,ih2=ih*ih,iz2=1/(dz*dz);
 for(let s=0;s<steps;s++){
  solveStreamfunction(e);
  tempWork.set(T);omegaWork.set(omega);
  for(let k=1;k<layers-1;k++)for(let y=1;y<n-1;y++)for(let x=1;x<n-1;x++){
   const q=idx(k,y,x,n);
   const advT=u[q]*upwind(T[q-1],T[q],T[q+1],u[q],ih)+v[q]*upwind(T[q-n],T[q],T[q+n],v[q],ih);
   const advW=u[q]*upwind(omega[q-1],omega[q],omega[q+1],u[q],ih)+v[q]*upwind(omega[q-n],omega[q],omega[q+n],v[q],ih);
   const lapT=(T[q-1]+T[q+1]+T[q-n]+T[q+n]-4*T[q])*ih2+(T[q-idxy]+T[q+idxy]-2*T[q])*iz2;
   const lapW=(omega[q-1]+omega[q+1]+omega[q-n]+omega[q+n]-4*omega[q])*ih2+(omega[q-idxy]+omega[q+idxy]-2*omega[q])*iz2;
   const buoyantVorticity=MODEL.buoyancy*(T[q+1]-T[q-1])*.5*ih;
   tempWork[q]=clamp(T[q]+dt*(MODEL.alpha*lapT-advT),-.15,1.15);
   omegaWork[q]=clampValue(omega[q]+dt*(MODEL.nu*lapW-advW+buoyantVorticity));
  }
  T.set(tempWork);omega.set(omegaWork);
  // Solid front and back walls have zero velocity. Their temperature obeys
  // zero normal heat flux, so copy neighboring layer temperature.
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
   T[idx(0,y,x,n)]=T[idx(1,y,x,n)];
   T[idx(layers-1,y,x,n)]=T[idx(layers-2,y,x,n)];
  }
  applyThermalBoundaries(e);
  e.step++;e.time+=dt;
 }
 solveStreamfunction(e);
 return e;
}
export function sliceEvidence(e){
 const {n,layers,T,omega,u,v,dz,h}=e,area=n*n,iz=1/dz;
 const signals=[];let maxKinetic=0,maxVerticalContrast=0,divergenceMax=0,enthalpy=0;
 const gradients=new Float64Array(layers),motion=new Float64Array(layers),interlayer=new Float64Array(layers),flux=new Float64Array(layers);
 let sum=0;const ih=1/h;
 for(let k=1;k<layers-1;k++){
  let tg=0,ke=0,mx=0,fluxNet=0;
  for(let y=1;y<n-1;y++)for(let x=1;x<n-1;x++){
   const q=idx(k,y,x,n);const gx=(T[q+1]-T[q-1])*.5*ih,gy=(T[q+n]-T[q-n])*.5*ih;
   const tempJump=(T[q+area]-T[q-area])*.5*iz;
   const en=u[q]*u[q]+v[q]*v[q];
   tg+=Math.hypot(gx,gy);ke+=en;mx+=Math.abs(tempJump);
   fluxNet+=MODEL.alpha*tempJump;
   const div=(u[q+1]-u[q-1]+v[q+n]-v[q-n])*.5*ih;
   divergenceMax=Math.max(divergenceMax,Math.abs(div));
  }
  const samples=(n-2)**2;gradients[k]=tg/samples;motion[k]=Math.sqrt(ke/samples);
  interlayer[k]=mx/samples;flux[k]=fluxNet/samples;
  maxKinetic=Math.max(maxKinetic,motion[k]);maxVerticalContrast=Math.max(maxVerticalContrast,interlayer[k]);
  sum+=motion[k];
 }
 // Strongly varying heat footprint and motion define the highest-information
 // slice; in a uniform cubic voxel volume all slices have equal geometric area.
 // Persistence weighting prevents the focus changing every animation frame.
 let focus=Math.floor(layers/2),best=-Infinity;
 for(let k=1;k<layers-1;k++){
  const areaWeight=1; // every cross-section in this unobstructed example is equal.
  const score=areaWeight*(gradients[k]+2.5*motion[k]+0.35*interlayer[k]);
  if(score>best){best=score;focus=k;}
 }
 if(gradients[focus]>0.01)signals.push({id:'temperature-gradient',type:'observed',text:'Temperature differs across the main slice → thermal diffusion must be computed.',score:gradients[focus]});
 if(maxKinetic>0.001)signals.push({id:'fluid-motion',type:'observed',text:'In-plane circulation is active → advect temperature and vorticity.',score:maxKinetic});
 if(maxVerticalContrast>0.001)signals.push({id:'vertical-coupling',type:'necessary',text:'Adjacent slices disagree in temperature → cross-slice heat flux is required.',score:maxVerticalContrast});
 if(divergenceMax>0.1)signals.push({id:'divergence-warning',type:'warning',text:'Planar divergence is high: increase streamfunction convergence before trusting results.',score:divergenceMax});
 signals.push({id:'reduced-model',type:'limit',text:'Out-of-plane velocity is fixed at zero. These layers do NOT constitute full 3D Navier–Stokes.',score:0});
 // A confidence/likelihood score is NOT physical probability; this is measured
 // proximity-based salience for which evidence should be rendered/refreshed.
 const priority=Array.from({length:layers},(_,k)=>{
  const distance=Math.abs(k-focus);
  return {k,distance,physicalDistance:distance*dz,score:Math.exp(-distance*dz/.25)*(.1+gradients[k]+2.5*motion[k]+interlayer[k]),temperatureGradient:gradients[k],motion:motion[k],crossSliceGradient:interlayer[k]};
 });
 return {focus,priority,signals,kineticRms:sum/(layers-2),maxVerticalGradient:maxVerticalContrast,divergenceMax,modelTime:e.time,step:e.step,flux:Array.from(flux)};
}
export function snapshot(e){
 const {n,layers,T,u,v}=e, ev=sliceEvidence(e);
 const every=[];
 for(let k=0;k<layers;k++){
  const slice={temperature:[],u:[],v:[]};
  for(let i=0;i<n*n;i++){const q=k*n*n+i;slice.temperature.push(T[q]);slice.u.push(u[q]);slice.v.push(v[q]);}
  every.push(slice);
 }
 return {n,layers,time:e.time,step:e.step,slices:every,evidence:ev,model:{nu:MODEL.nu,alpha:MODEL.alpha,buoyancy:MODEL.buoyancy,dt:MODEL.dt,note:'Coupled XY vorticity-streamfunction slices with Z diffusion; not full 3D CFD'}};
}
