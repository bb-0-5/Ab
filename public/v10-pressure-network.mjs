/**
 * AboveBound V10: explicitly bounded, single-phase pressure-driven PORE-NETWORK surrogate.
 * NO Navier–Stokes / resolved CFD. Each connected pair of void voxels has an
 * assumed equal-radius cylindrical laminar throat (Hagen–Poiseuille law).
 * Pressures obey nodal mass conservation; solid voxels eliminate throat bonds.
 * Water, 20°C; geometry length scale and radii are hypotheses, not V10 measurements.
 */
export const HYDRAULICS = Object.freeze({
  pitchM: 0.001, radiusM: 0.00025, viscosityPaS: 0.001002,
  pressureDifferencePa: 1, minSolidFraction: 0.25, maxSolidFraction: 0.75,
  targetOpenFraction: 0.20, tolerance: 1e-7, maxIterations: 3000,
});
const I = (x,y,z,n) => (z*n+y)*n+x;
const neighbors=(q,n,layers)=>{
  const x=q%n,y=Math.floor(q/n)%n,z=Math.floor(q/(n*n)),list=[];
  if(x>0)list.push(q-1);if(x<n-1)list.push(q+1);
  if(y>0)list.push(q-n);if(y<n-1)list.push(q+n);
  if(z>0)list.push(q-n*n);if(z<layers-1)list.push(q+n*n);
  return list;
};
function flood(mask,n,layers,edgeY){
  const queue=new Int32Array(mask.length),seen=new Uint8Array(mask.length);
  let tail=0,head=0;
  for(let z=0;z<layers;z++)for(let x=0;x<n;x++){
    const q=I(x,edgeY,z,n);if(!mask[q]){queue[tail++]=q;seen[q]=1;}
  }
  while(head<tail){const q=queue[head++];for(const v of neighbors(q,n,layers)){
    if(!seen[v]&&!mask[v]){seen[v]=1;queue[tail++]=v;}
  }}
  return seen;
}
export function solvePoreNetwork(mask,n,layers,settings=HYDRAULICS){
  if(!Number.isInteger(n)||n<3||n>39||!Number.isInteger(layers)||layers<2||layers>39||!mask||mask.length!==n*n*layers)throw Error('invalid pore lattice');
  const {pitchM,radiusM,viscosityPaS,pressureDifferencePa,tolerance,maxIterations}=settings;
  if(![pitchM,radiusM,viscosityPaS,pressureDifferencePa,tolerance,maxIterations].every(Number.isFinite)||
    pitchM<=0||radiusM<=0||radiusM>=pitchM/2||viscosityPaS<=0||pressureDifferencePa<=0||tolerance<=0||!Number.isInteger(maxIterations)||maxIterations<1)throw Error('invalid physical properties');
  const total=mask.length,solids=Array.from(mask,x=>x>0.5?1:0),solidFraction=solids.reduce((a,b)=>a+b,0)/total;
  const fromIn=flood(solids,n,layers,0),fromOut=flood(solids,n,layers,n-1);
  const active=Uint8Array.from(solids,(s,i)=>s?0:(fromIn[i]&&fromOut[i]?1:0));
  const throughCells=active.reduce((a,b)=>a+b,0),inlets=[],outlets=[],inner=[];
  for(let q=0;q<total;q++)if(active[q]){
    const y=Math.floor(q/n)%n;
    if(y===0)inlets.push(q);else if(y===n-1)outlets.push(q);else inner.push(q);
  }
  const pressure=new Float64Array(total),fluxX=new Float64Array(total),fluxY=new Float64Array(total),fluxZ=new Float64Array(total);
  // Work in dimensionless pressure; scale computed bond currents by Δp × conductance.
  for(let q=0;q<total;q++)if(active[q])pressure[q]=1-(Math.floor(q/n)%n)/(n-1);
  const adj=inner.map(q=>neighbors(q,n,layers).filter(v=>active[v]));
  let converged=throughCells===0,iterations=0,residual=0;
  if(throughCells>0){
    for(let k=1;k<=maxIterations;k++){
      let delta=0;
      for(let j=0;j<inner.length;j++){
        const q=inner[j],a=adj[j];let sum=0;for(const v of a)sum+=pressure[v];
        const next=sum/a.length,old=pressure[q];
        // Gauss-Seidel with bounded over-relaxation. All conductances positive.
        pressure[q]=old+1.55*(next-old);
        delta=Math.max(delta,Math.abs(pressure[q]-old));
      }
      iterations=k;
      if(delta<tolerance){converged=true;break;}
    }
    for(let j=0;j<inner.length;j++){
      const q=inner[j],a=adj[j];let imbalance=0;
      for(const v of a)imbalance+=pressure[q]-pressure[v];
      residual=Math.max(residual,Math.abs(imbalance));
    }
    converged=converged && residual<Math.max(tolerance*10,1e-6);
  }
  const throatConductance=Math.PI*radiusM**4/(8*viscosityPaS*pitchM);
  // Fluxes are stored on +X,+Y,+Z edges from each cell, in m^3/s.
  for(let z=0;z<layers;z++)for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const q=I(x,y,z,n);if(!active[q])continue;
    if(x+1<n&&active[q+1])fluxX[q]=throatConductance*pressureDifferencePa*(pressure[q]-pressure[q+1]);
    if(y+1<n&&active[q+n])fluxY[q]=throatConductance*pressureDifferencePa*(pressure[q]-pressure[q+n]);
    if(z+1<layers&&active[q+n*n])fluxZ[q]=throatConductance*pressureDifferencePa*(pressure[q]-pressure[q+n*n]);
  }
  let inletFlowM3S=0,outletFlowM3S=0;
  for(const q of inlets)if(active[q+n])inletFlowM3S+=fluxY[q];
  for(const q of outlets)if(active[q-n])outletFlowM3S+=fluxY[q-n];
  const flowM3S=(inletFlowM3S+outletFlowM3S)/2;
  const imbalanceM3S=Math.abs(inletFlowM3S-outletFlowM3S);
  const areaM2=(n*pitchM)*(layers*pitchM),lengthM=(n-1)*pitchM;
  const permeabilityM2=flowM3S*viscosityPaS*lengthM/(areaM2*pressureDifferencePa);
  return {
    kind:'pressure-driven-pore-network',n,layers,solid:Uint8Array.from(solids),pressure,fluxX,fluxY,fluxZ,active,
    inletFlowM3S,outletFlowM3S,flowM3S,imbalanceM3S,permeabilityM2,
    solidFraction,throughCells,iterations,residual,converged,
    throatConductance,areaM2,lengthM,
    model:'Equal-radius HP cylindrical throats; 6-neighbour network, single-phase steady laminar flow; no resolved CFD',
  };
}
export function assessMembrane(result,open,settings=HYDRAULICS){
  if(!(open?.converged&&open.flowM3S>0))return {status:'INVALID REFERENCE',valid:false,reason:'Reference pressure solve invalid'};
  const relativeOpen=result.flowM3S/open.flowM3S;
  const solidOk=result.solidFraction>=settings.minSolidFraction&&result.solidFraction<=settings.maxSolidFraction;
  const quality=result.converged&&result.throughCells>0&&result.flowM3S>0&&result.imbalanceM3S<=Math.max(1e-14,result.flowM3S*0.001);
  const valid=solidOk&&quality;
  const meetsTarget=valid&&relativeOpen>=settings.targetOpenFraction;
  const reason=!solidOk?'Rejected: solid fraction outside required 25–75%':!quality?'Rejected: no converged through-flow and mass balance':!meetsTarget?'Below automatically chosen 20% of open-cavity flow target':'Meets modeled solid and throughput constraints';
  return {status:meetsTarget?'FEASIBLE (MODEL)':valid?'BELOW TARGET':'REJECTED',valid,meetsTarget,relativeOpen,reason};
}
export function hydraulicEvidence(result){
  return {
    n:result.n,layers:result.layers,pressure:Array.from(result.pressure),solid:Array.from(result.solid),active:Array.from(result.active),
    fluxX:Array.from(result.fluxX),fluxY:Array.from(result.fluxY),fluxZ:Array.from(result.fluxZ),
    flowM3S:result.flowM3S,permeabilityM2:result.permeabilityM2,
    inletFlowM3S:result.inletFlowM3S,outletFlowM3S:result.outletFlowM3S,
    solidFraction:result.solidFraction,residual:result.residual,converged:result.converged,
    iterations:result.iterations,throughCells:result.throughCells,
  };
}
