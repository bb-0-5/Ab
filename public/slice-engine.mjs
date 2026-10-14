/** Experimental three-component, coupled finite-volume MAC slice solver.
 * XY planes are real Z-indexed cells. Pressure projection connects ALL planes
 * through one 3-D Poisson equation and allows W through inter-plane faces.
 * Not a certified CFD implementation, not a numerical proof of regularity.
 * Non-dimensional incompressible Boussinesq, small fixed timestep, rigid walls.
 */
export const MODEL = Object.freeze({n:19, layers:9, dt:0.0015, nu:0.015, alpha:0.01, buoyancy:14, tolerance:0.002, maxPressureSweeps:180});
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const norm=v=>Number.isFinite(v)?v:0;
export function bottomTemperature(x,seed=0,z=.5){
  const c=[.27,.5,.73][((seed%3)+3)%3];
  const zc=[.31,.70,.44][((seed%3)+3)%3];
  return 0.24+0.76*Math.exp(-((x-c)**2/.055+(z-zc)**2/.105));
}
export function createSliceEngine({n=MODEL.n,layers=MODEL.layers,hotspot=0}={}){
  if(!Number.isInteger(n)||n<7||n>39||!Number.isInteger(layers)||layers<5||layers>19)throw Error('invalid 3D grid');
  const N=n*n*layers;
  const e={n,layers,hotspot,dx:1/n,dz:1/layers,dt:MODEL.dt,step:0,time:0,
    T:new Float64Array(N),Tnext:new Float64Array(N),p:new Float64Array(N),
    u:new Float64Array((n+1)*n*layers),v:new Float64Array(n*(n+1)*layers),w:new Float64Array(n*n*(layers+1)),
    uNext:new Float64Array((n+1)*n*layers),vNext:new Float64Array(n*(n+1)*layers),wNext:new Float64Array(n*n*(layers+1)),
    lastPressureSweeps:0,divergenceMax:0,preDivergence:0,pressureResidual:0,projectionConverged:false,pressureActive:false,
    maxSpeed:0,initialEnergy:0};
  for(let k=0;k<layers;k++)for(let j=0;j<n;j++)for(let i=0;i<n;i++){
    const y=(j+.5)/n,zb=(k+.5)/layers;
    e.T[(k*n+j)*n+i]=(1-y)*bottomTemperature((i+.5)/n,hotspot,zb);
  }
  return e;
}
function physicsStep(e){
  const {n,layers:nz,dx,dz,dt,T,Tnext,p,u,v,w,uNext,vNext,wNext}=e;
  const N=n*n*nz,xx=1/(dx*dx),zz=1/(dz*dz);
  const C=(i,j,k)=>(k*n+j)*n+i;
  const U=(i,j,k)=>(k*n+j)*(n+1)+i;
  const V=(i,j,k)=>(k*(n+1)+j)*n+i;
  const W=(i,j,k)=>(k*n+j)*n+i;
  // Dirichlet normal velocity on all six walls; mirrored ghosts for tangential
  // viscous derivatives enforce an approximate no-slip at the solid boundaries.
  const uVal=(i,j,k)=>i<0||i>n||j<0||j>=n||k<0||k>=nz?0:u[U(i,j,k)];
  const vVal=(i,j,k)=>i<0||i>=n||j<0||j>n||k<0||k>=nz?0:v[V(i,j,k)];
  const wVal=(i,j,k)=>i<0||i>=n||j<0||j>=n||k<0||k>nz?0:w[W(i,j,k)];
  const deriv=(minus,center,plus,s,h)=>s>=0?(center-minus)/h:(plus-center)/h;
  // Update the three staggered velocity components. All three advect and
  // diffuse across Z: perpendicular flux is not invented by a graphics layer.
  uNext.fill(0);vNext.fill(0);wNext.fill(0);
  for(let k=0;k<nz;k++)for(let j=0;j<n;j++)for(let i=1;i<n;i++){
    const q=U(i,j,k),a=u[q];
    const vy=(vVal(i-1,j,k)+vVal(i,j,k)+vVal(i-1,j+1,k)+vVal(i,j+1,k))*.25;
    const wz=(wVal(i-1,j,k)+wVal(i,j,k)+wVal(i-1,j,k+1)+wVal(i,j,k+1))*.25;
    const xm=uVal(i-1,j,k),xp=uVal(i+1,j,k),ym=uVal(i,j-1,k),yp=uVal(i,j+1,k),zm=uVal(i,j,k-1),zp=uVal(i,j,k+1);
    const adv=a*deriv(xm,a,xp,a,dx)+vy*deriv(ym,a,yp,vy,dx)+wz*deriv(zm,a,zp,wz,dz);
    // Tangential wall ghost values are antisymmetric: velocity = 0 at wall.
    const lap=(xp+xm-2*a)*xx+((j===0?-a:ym)+(j===n-1?-a:yp)-2*a)*xx+((k===0?-a:zm)+(k===nz-1?-a:zp)-2*a)*zz;
    uNext[q]=norm(a+dt*(MODEL.nu*lap-adv));
  }
  for(let k=0;k<nz;k++)for(let j=1;j<n;j++)for(let i=0;i<n;i++){
    const q=V(i,j,k),a=v[q];
    const ux=(uVal(i,j-1,k)+uVal(i+1,j-1,k)+uVal(i,j,k)+uVal(i+1,j,k))*.25;
    const wz=(wVal(i,j-1,k)+wVal(i,j,k)+wVal(i,j-1,k+1)+wVal(i,j,k+1))*.25;
    const xm=vVal(i-1,j,k),xp=vVal(i+1,j,k),ym=vVal(i,j-1,k),yp=vVal(i,j+1,k),zm=vVal(i,j,k-1),zp=vVal(i,j,k+1);
    const adv=ux*deriv(xm,a,xp,ux,dx)+a*deriv(ym,a,yp,a,dx)+wz*deriv(zm,a,zp,wz,dz);
    const lap=((i===0?-a:xm)+(i===n-1?-a:xp)-2*a)*xx+(yp+ym-2*a)*xx+((k===0?-a:zm)+(k===nz-1?-a:zp)-2*a)*zz;
    const temp=.5*(T[C(i,j-1,k)]+T[C(i,j,k)]);
    vNext[q]=norm(a+dt*(MODEL.nu*lap-adv+MODEL.buoyancy*temp));
  }
  for(let k=1;k<nz;k++)for(let j=0;j<n;j++)for(let i=0;i<n;i++){
    const q=W(i,j,k),a=w[q];
    const ux=(uVal(i,j,k-1)+uVal(i+1,j,k-1)+uVal(i,j,k)+uVal(i+1,j,k))*.25;
    const vy=(vVal(i,j,k-1)+vVal(i,j+1,k-1)+vVal(i,j,k)+vVal(i,j+1,k))*.25;
    const xm=wVal(i-1,j,k),xp=wVal(i+1,j,k),ym=wVal(i,j-1,k),yp=wVal(i,j+1,k),zm=wVal(i,j,k-1),zp=wVal(i,j,k+1);
    const adv=ux*deriv(xm,a,xp,ux,dx)+vy*deriv(ym,a,yp,vy,dx)+a*deriv(zm,a,zp,a,dz);
    const lap=((i===0?-a:xm)+(i===n-1?-a:xp)-2*a)*xx+((j===0?-a:ym)+(j===n-1?-a:yp)-2*a)*xx+(zp+zm-2*a)*zz;
    wNext[q]=norm(a+dt*(MODEL.nu*lap-adv));
  }
  const divergence=(uu,vv,ww,i,j,k)=>(uu[U(i+1,j,k)]-uu[U(i,j,k)])/dx+(vv[V(i,j+1,k)]-vv[V(i,j,k)])/dx+(ww[W(i,j,k+1)]-ww[W(i,j,k)])/dz;
  let pre=0;
  for(let k=0;k<nz;k++)for(let j=0;j<n;j++)for(let i=0;i<n;i++)pre=Math.max(pre,Math.abs(divergence(uNext,vNext,wNext,i,j,k)));
  e.preDivergence=pre;e.pressureActive=pre>1e-10;
  // Pressure Poisson on all cells with zero-normal-gradient boundary condition,
  // one global gauge. Iterative corrector increases work until tolerance met.
  // For Neumann Laplacian the RHS has zero volume mean: all boundary normals=0.
  let sweeps=0,residual=0;
  if(e.pressureActive){
    const tolerance=MODEL.tolerance;const target=tolerance/dt;
    // Warm-start pressure by adjusting from the previous timestep.
    const rhs=new Float64Array(N);
    for(let k=0;k<nz;k++)for(let j=0;j<n;j++)for(let i=0;i<n;i++)rhs[C(i,j,k)]=divergence(uNext,vNext,wNext,i,j,k)/dt;
    let rhsMean=0;for(let q=0;q<N;q++)rhsMean+=rhs[q];rhsMean/=N;
    for(let q=0;q<N;q++)rhs[q]-=rhsMean;
    for(sweeps=1;sweeps<=MODEL.maxPressureSweeps;sweeps++){
      for(let k=0;k<nz;k++)for(let j=0;j<n;j++)for(let i=0;i<n;i++){
        const q=C(i,j,k);let sum=0,den=0;
        if(i>0){sum+=xx*p[C(i-1,j,k)];den+=xx;}if(i<n-1){sum+=xx*p[C(i+1,j,k)];den+=xx;}
        if(j>0){sum+=xx*p[C(i,j-1,k)];den+=xx;}if(j<n-1){sum+=xx*p[C(i,j+1,k)];den+=xx;}
        if(k>0){sum+=zz*p[C(i,j,k-1)];den+=zz;}if(k<nz-1){sum+=zz*p[C(i,j,k+1)];den+=zz;}
        p[q]=p[q]+1.54*((sum-rhs[q])/den-p[q]);
      }
      if(sweeps%12===0||sweeps===MODEL.maxPressureSweeps){
        residual=0;
        for(let k=0;k<nz;k++)for(let j=0;j<n;j++)for(let i=0;i<n;i++){
          const q=C(i,j,k);let lap=0;
          if(i>0)lap+=xx*(p[C(i-1,j,k)]-p[q]);if(i<n-1)lap+=xx*(p[C(i+1,j,k)]-p[q]);
          if(j>0)lap+=xx*(p[C(i,j-1,k)]-p[q]);if(j<n-1)lap+=xx*(p[C(i,j+1,k)]-p[q]);
          if(k>0)lap+=zz*(p[C(i,j,k-1)]-p[q]);if(k<nz-1)lap+=zz*(p[C(i,j,k+1)]-p[q]);
          residual=Math.max(residual,Math.abs(lap-rhs[q]));
        }
        if(residual<=target)break;
      }
    }
    let mean=0;for(let q=0;q<N;q++)mean+=p[q];mean/=N;for(let q=0;q<N;q++)p[q]-=mean;
    for(let k=0;k<nz;k++)for(let j=0;j<n;j++)for(let i=1;i<n;i++)uNext[U(i,j,k)]-=dt*(p[C(i,j,k)]-p[C(i-1,j,k)])/dx;
    for(let k=0;k<nz;k++)for(let j=1;j<n;j++)for(let i=0;i<n;i++)vNext[V(i,j,k)]-=dt*(p[C(i,j,k)]-p[C(i,j-1,k)])/dx;
    for(let k=1;k<nz;k++)for(let j=0;j<n;j++)for(let i=0;i<n;i++)wNext[W(i,j,k)]-=dt*(p[C(i,j,k)]-p[C(i,j,k-1)])/dz;
  }
  e.lastPressureSweeps=Math.min(sweeps,MODEL.maxPressureSweeps);e.pressureResidual=residual;
  e.divergenceMax=0;e.maxSpeed=0;
  for(let k=0;k<nz;k++)for(let j=0;j<n;j++)for(let i=0;i<n;i++){
    e.divergenceMax=Math.max(e.divergenceMax,Math.abs(divergence(uNext,vNext,wNext,i,j,k)));
    const q=C(i,j,k),uc=(uNext[U(i,j,k)]+uNext[U(i+1,j,k)])*.5,vc=(vNext[V(i,j,k)]+vNext[V(i,j+1,k)])*.5,wc=(wNext[W(i,j,k)]+wNext[W(i,j,k+1)])*.5;
    e.maxSpeed=Math.max(e.maxSpeed,Math.hypot(uc,vc,wc));
  }
  // Scalar advection in 3D, conservative face-flux form. Face velocities
  // are from the pressure-projected, impermeable MAC field.
  const temp=(i,j,k)=>{
    if(j<0)return 2*bottomTemperature((i+.5)/n,e.hotspot,(k+.5)/nz)-T[C(i,0,k)];
    if(j>=n)return -T[C(i,n-1,k)]; // cold upper Dirichlet face
    return T[C(clamp(i,0,n-1),j,clamp(k,0,nz-1))]; // insulated x,z walls
  };
  for(let k=0;k<nz;k++)for(let j=0;j<n;j++)for(let i=0;i<n;i++){
    const q=C(i,j,k),q0=T[q];
    const l=temp(i-1,j,k),r=temp(i+1,j,k),b=temp(i,j-1,k),t=temp(i,j+1,k),back=temp(i,j,k-1),front=temp(i,j,k+1);
    const faces=[uNext[U(i,j,k)],uNext[U(i+1,j,k)],vNext[V(i,j,k)],vNext[V(i,j+1,k)],wNext[W(i,j,k)],wNext[W(i,j,k+1)]];
    const fluxX=(faces[1]*(faces[1]>=0?q0:r)-faces[0]*(faces[0]>=0?l:q0))/dx;
    const fluxY=(faces[3]*(faces[3]>=0?q0:t)-faces[2]*(faces[2]>=0?b:q0))/dx;
    const fluxZ=(faces[5]*(faces[5]>=0?q0:front)-faces[4]*(faces[4]>=0?back:q0))/dz;
    const lap=(l+r+b+t-4*q0)*xx+(back+front-2*q0)*zz;
    Tnext[q]=q0+dt*(MODEL.alpha*lap-fluxX-fluxY-fluxZ);
    if(!Number.isFinite(Tnext[q])||Math.abs(Tnext[q])>1e4)throw Error('unstable thermal step');
  }
  e.T=Tnext;e.Tnext=T;e.u=uNext;e.uNext=u;e.v=vNext;e.vNext=v;e.w=wNext;e.wNext=w;
  e.step++;e.time+=dt;
  return e;
}
export function advanceSlices(e,steps=1){
  if(!Number.isInteger(steps)||steps<0||steps>1000)throw Error('invalid step count');
  for(let q=0;q<steps;q++)physicsStep(e);
  return e;
}
export function sliceEvidence(e){
 const {n,layers:nz,T,p,u,v,w,dx,dz}=e,N=n*n*nz;
 const C=(i,j,k)=>(k*n+j)*n+i;
 const U=(i,j,k)=>(k*n+j)*(n+1)+i;
 const V=(i,j,k)=>(k*(n+1)+j)*n+i;
 const W=(i,j,k)=>(k*n+j)*n+i;
 const priority=[],flux=[],sliceSpeeds=[],gradients=[];
 let wTotal=0,wMax=0,fluxAbs=0,energy=0;
 for(let k=0;k<nz;k++){
   let grad=0,speed=0,wSlice=0,net=0;
   for(let j=0;j<n;j++)for(let i=0;i<n;i++){
     const q=C(i,j,k),uc=(u[U(i,j,k)]+u[U(i+1,j,k)])*.5,vc=(v[V(i,j,k)]+v[V(i,j+1,k)])*.5,wc=(w[W(i,j,k)]+w[W(i,j,k+1)])*.5;
     if(i>0&&i<n-1&&j>0&&j<n-1)grad+=Math.hypot((T[C(i+1,j,k)]-T[C(i-1,j,k)])/(2*dx),(T[C(i,j+1,k)]-T[C(i,j-1,k)])/(2*dx));
     speed+=Math.hypot(uc,vc,wc);energy+=uc*uc+vc*vc+wc*wc;
     wSlice+=Math.abs(wc);wMax=Math.max(wMax,Math.abs(wc));
     if(k<nz-1){const face=w[W(i,j,k+1)];net+=face;fluxAbs+=Math.abs(face)*dx*dx;}
   }
   const m=n*n;gradients.push(grad/m);sliceSpeeds.push(speed/m);flux.push(k<nz-1?net*dx*dx:0);
   wTotal+=wSlice;
 }
 const selected=Math.max(0,...sliceSpeeds),main=Math.floor(nz/2);
 let focus=main,topScore=-Infinity;
 for(let k=1;k<nz-1;k++){
   const kCross=Math.abs(flux[k-1])+Math.abs(flux[k]);
   const score=gradients[k]+1.5*sliceSpeeds[k]+4*kCross;
   if(score>topScore){topScore=score;focus=k;}
 }
 for(let k=0;k<nz;k++){
   const distance=Math.abs(k-focus),cross=Math.abs(flux[Math.max(0,k-1)])+Math.abs(flux[k]);
   priority.push({k,distance,physicalDistance:distance*dz,
     score:Math.exp(-distance*dz/.3)*(gradients[k]+sliceSpeeds[k]+4*cross+.01),
     temperatureGradient:gradients[k],motion:sliceSpeeds[k],crossSliceGradient:cross});
 }
 const signals=[];
 signals.push({id:'pressure-projection',type:e.projectionConverged?'necessary':'warning',text:`3D MASS CONSERVATION: pressure correction ${e.lastPressureSweeps} sweeps; ∇·u max = ${e.divergenceMax.toExponential(2)}${e.divergenceMax>MODEL.tolerance?' (needs tighter convergence)':''}.`});
 if(wMax>1e-5)signals.push({id:'perpendicular-flow',type:'observed',text:`PERPENDICULAR FLOW OBSERVED: w(z) crosses neighbouring planes; peak |w| ${wMax.toFixed(4)}. Flux is signed; a zero net flux does not mean no local exchange.`});
 else signals.push({id:'perpendicular-flow',type:'necessary',text:'Z FLOW CHECK: perpendicular velocity is solved every step; physical symmetry or startup can produce nearly zero cross-plane motion.'});
 signals.push({id:'heat-advection',type:'necessary',text:'3D HEAT TRANSPORT: cross-plane advection w·∂zT + diffusion; all three momentum components are coupled.'});
 signals.push({id:'gear-scheduler',type:'observed',text:`AUTO GEARS: pressure iterates to tolerance; all cells remain coupled. Priority selects the most informative display slice, not which physics is allowed to run.`});
 signals.push({id:'limitations',type:'limit',text:'RESEARCH SOLVER: low resolution, approximate tangential wall treatment, no obstacle masks or external CFD benchmarks. Not certified engineering prediction.'});
 const physical={perpendicularRms:Math.sqrt(w.reduce((acc,s)=>acc+s*s,0)/w.length),peakW:wMax,interlayerThroughput:fluxAbs,
   kineticRms:Math.sqrt(energy/N),pressureResidual:e.pressureResidual,divergenceMax:e.divergenceMax,preDivergence:e.preDivergence,pressureSweeps:e.lastPressureSweeps,projectionConverged:e.divergenceMax<=MODEL.tolerance};
 e.projectionConverged=physical.projectionConverged;
 return {focus,priority,signals,...physical,kineticRms:physical.kineticRms,maxVerticalGradient:Math.max(...gradients),modelTime:e.time,step:e.step,flux};
}
export function snapshot(e){
 const {n,layers,T,p,u,v,w}=e,evidence=sliceEvidence(e),slices=[];
 const C=(i,j,k)=>(k*n+j)*n+i,U=(i,j,k)=>(k*n+j)*(n+1)+i,V=(i,j,k)=>(k*(n+1)+j)*n+i,W=(i,j,k)=>(k*n+j)*n+i;
 for(let k=0;k<layers;k++){
   const slab={temperature:[],u:[],v:[],w:[],pressure:[]};
   for(let j=0;j<n;j++)for(let i=0;i<n;i++){
     slab.temperature.push(T[C(i,j,k)]);slab.pressure.push(p[C(i,j,k)]);
     slab.u.push((u[U(i,j,k)]+u[U(i+1,j,k)])*.5);
     slab.v.push((v[V(i,j,k)]+v[V(i,j+1,k)])*.5);
     slab.w.push((w[W(i,j,k)]+w[W(i,j,k+1)])*.5);
   }slices.push(slab);
 }
 return {n,layers,time:e.time,step:e.step,slices,evidence,
  model:{nu:MODEL.nu,alpha:MODEL.alpha,buoyancy:MODEL.buoyancy,dt:e.dt,note:'Prototype 3D staggered velocity + pressure projection. XY slices are 2D views of a coupled 3D model, not independent 2D CFD.'}};
}
