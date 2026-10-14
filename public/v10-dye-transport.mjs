/**
 * Stepwise passive dye transport on the *same resolved, steady* hydraulic
 * pore network. Tracks residence and outlet arrival by conservative upwind
 * advection. It is chronological scalar transport, NOT unsteady CFD.
 * Fluid-cell storage is assumed to be one entire cubic voxel volume.
 * All throats are equal assumed radius (from v10-pressure-network.mjs).
 */
import {HYDRAULICS} from './v10-pressure-network.mjs';
const index=(x,y,z,n)=>(z*n+y)*n+x;
export function createDyeTransport(flow,options={}){
 const {n,layers,active,fluxX,fluxY,fluxZ}=flow;
 if(!flow?.converged||!active||active.length!==n*n*layers)throw Error('steady network must be converged before chronological tracer');
 const poreVolumeM3=(options.poreVolumeM3??HYDRAULICS.pitchM**3);
 if(!Number.isFinite(poreVolumeM3)||poreVolumeM3<=0)throw Error('invalid fluid-cell storage volume');
 const out=new Float64Array(active.length);
 let maxOut=0;
 for(let z=0;z<layers;z++)for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const q=index(x,y,z,n);if(!active[q])continue;
  let outgoing=0;
  for(const [v,s] of [[x+1<n?fluxX[q]:0,1],[x>0?fluxX[q-1]:0,-1],
    [y+1<n?fluxY[q]:0,1],[y>0?fluxY[q-n]:0,-1],
    [z+1<layers?fluxZ[q]:0,1],[z>0?fluxZ[q-n*n]:0,-1]]){
   outgoing+=Math.max(0,v*s);
  }
  if(y!==0&&y!==n-1)maxOut=Math.max(maxOut,outgoing);
 }
 const dtSec=maxOut>0?0.40*poreVolumeM3/maxOut:1;
 if(!Number.isFinite(dtSec)||dtSec<=0)throw Error('invalid tracer time step');
 return {flow,n,layers,concentration:out,poreVolumeM3,dtSec,timeSec:0,step:0,
  injectedM3:0,exitedM3:0,storedM3:0,balanceM3:0,outletFraction:0,
  breakthroughTimeSec:null,maxOut};
}
export function stepDyeTransport(t,steps=1){
 if(!Number.isInteger(steps)||steps<0||steps>600)throw Error('invalid chronological steps');
 const {flow,n,layers,concentration:c,dtSec,poreVolumeM3:vol}=t,delta=new Float64Array(c.length);
 const {active,fluxX,fluxY,fluxZ}=flow;
 const classify=(q)=>Math.floor(q/n)%n;
 for(let s=0;s<steps;s++){
  delta.fill(0);
  let dyeIn=0,dyeOut=0;
  function move(q1,q2,flux){
   if(!flux||!active[q1]||!active[q2])return;
   const up=flux>=0?q1:q2,down=flux>=0?q2:q1;
   const yUp=classify(up),yDown=classify(down);
   const cin=yUp===0?1:yUp===n-1?0:c[up];
   const transported=Math.abs(flux)*dtSec*cin;
   if(yUp===0)dyeIn+=transported;else if(yUp!==n-1)delta[up]-=transported;
   if(yDown===n-1)dyeOut+=transported;else if(yDown!==0)delta[down]+=transported;
  }
  for(let z=0;z<layers;z++)for(let y=0;y<n;y++)for(let x=0;x<n;x++){
   const q=index(x,y,z,n);if(!active[q])continue;
   if(x+1<n)move(q,q+1,fluxX[q]);
   if(y+1<n)move(q,q+n,fluxY[q]);
   if(z+1<layers)move(q,q+n*n,fluxZ[q]);
  }
  let stored=0;
  for(let q=0;q<c.length;q++){
   if(!active[q])continue;
   const y=classify(q);
   if(y===0){c[q]=1;continue;}
   if(y===n-1){c[q]=0;continue;}
   c[q]+=delta[q]/vol;
   if(c[q]<-1e-9||c[q]>1+1e-9||!Number.isFinite(c[q]))
     throw Error('tracer CFL / conservation instability');
   c[q]=Math.max(0,Math.min(1,c[q]));
   stored+=c[q]*vol;
  }
  t.injectedM3+=dyeIn;t.exitedM3+=dyeOut;
  t.storedM3=stored;t.balanceM3=t.injectedM3-t.exitedM3-stored;
  t.timeSec+=dtSec;t.step++;
  // Concentration-weighted outlet flux is the actual breakthrough metric;
  // it is never inferred from arbitrary graphics or slice proximity.
  t.outletFraction=flow.flowM3S>0?dyeOut/(dtSec*flow.flowM3S):0;
  if(t.breakthroughTimeSec===null&&t.outletFraction>=0.01)
   t.breakthroughTimeSec=t.timeSec;
 }
 return t;
}
export function dyeSnapshot(t){
 return {step:t.step,timeSec:t.timeSec,dtSec:t.dtSec,outletFraction:t.outletFraction,
  breakthroughTimeSec:t.breakthroughTimeSec,concentration:Array.from(t.concentration),
  injectedM3:t.injectedM3,exitedM3:t.exitedM3,storedM3:t.storedM3,balanceM3:t.balanceM3,
  model:'Passive dye on steady pressure network; conservative upwind steps, fluid voxel storage assumed'};
}
