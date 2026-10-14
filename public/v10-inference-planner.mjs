/**
 * Local, bounded experiment steering driven by the numerical results actually obtained.
 * Geometry direction is a HYPOTHESIS to test, not a physics inference proven by this
 * surrogate model. Higher TPMS threshold generally removes solid material, but the
 * flow effect must be recalculated. No optimization result is trusted without solving.
 */
import {HYDRAULICS} from './v10-pressure-network.mjs';
const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
const key=c=>JSON.stringify(c);
function priority(t){
 const s=t.solidFraction,r=t.relativeOpen;
 if(!Number.isFinite(s)||!Number.isFinite(r)||!t.config||!t.converged)return -Infinity;
 // Reward feasibility before hydraulic throughput, but rescue near-feasible failures.
 const deficit=Math.max(0,HYDRAULICS.minSolidFraction-s)+Math.max(0,s-HYDRAULICS.maxSolidFraction)
  +Math.max(0,HYDRAULICS.targetOpenFraction-r);
 return (t.meetsTarget?100:0)+Math.min(1,r)-3*deficit;
}
export function planV10FollowUps(rows,alreadySeen=new Set(),limit=12){
 if(!Array.isArray(rows)||!Number.isInteger(limit)||limit<0||limit>48)throw Error('invalid experiment plan');
 const ranked=rows.filter(x=>x?.config&&Number.isFinite(priority(x))&&priority(x)>-Infinity)
  .sort((a,b)=>priority(b)-priority(a));
 const planned=[],keys=new Set(alreadySeen),parents=ranked.slice(0,3);
 for(const source of parents){
  const c=source.config;let direction=0,reason='';
  if(source.solidFraction<HYDRAULICS.minSolidFraction){
   direction=-1;reason='Too little solid: lower TPMS threshold to add material, then verify the flow penalty';
  }else if(source.solidFraction>HYDRAULICS.maxSolidFraction){
   direction=1;reason='Too much solid: raise TPMS threshold to open more pores';
  }else if(source.relativeOpen<HYDRAULICS.targetOpenFraction){
   direction=1;reason='Flow below target: raise TPMS threshold to test wider connectivity without losing minimum solid';
  }else{
   direction=1;reason='Flow target met: test more open geometry, while enforcing minimum solid fraction';
  }
  const variants=[
   {deltaThreshold:.12*direction,deltaFrequency:0,why:reason},
   {deltaThreshold:.24*direction,deltaFrequency:0,why:reason+' (larger step)'},
   {deltaThreshold:0,deltaFrequency:-.2,why:'Vary channel spacing: test lower TPMS frequency at the same solid threshold'},
   {deltaThreshold:0,deltaFrequency:.2,why:'Vary channel spacing: test higher TPMS frequency at the same solid threshold'},
   {deltaThreshold:.12*direction,deltaFrequency:.2,why:'Coupled adjustment: test porosity and pore spacing together'},
  ];
  for(const v of variants){
   const candidate={...c,
    frequency:+clamp(c.frequency+v.deltaFrequency,.4,2.6).toFixed(5),
    threshold:+clamp(c.threshold+v.deltaThreshold,-1.2,1.2).toFixed(5)};
   if(key(candidate)===key(c)||keys.has(key(candidate)))continue;
   keys.add(key(candidate));
   planned.push({config:candidate,reason:v.why,source:source.name,
    observation:{relativeOpen:source.relativeOpen,solidFraction:source.solidFraction}});
   if(planned.length>=limit)return planned;
  }
 }
 return planned;
}
