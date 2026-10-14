/**
 * Finite-volume-style steady conduction on the *existing* V9 property
 * voxels carved by V10's actual solid mask. Six-face harmonic conductances,
 * fixed hot/cold opposed faces, insulated remaining boundaries.
 *
 * This is an intentionally limited thermal-conduction proxy. Air is treated
 * as stationary at ~room temperature (k=0.026 W/(m K)); no convection, wind,
 * radiation, moisture, Knudsen effects, contacts or mechanical strength.
 * Not a V13 synthesis yield and not a whole-building U-value.
 */
export type HeatAxis='x'|'y'|'z';
export type VoxelConductionScreen={
 effectiveConductivityWmK:number;
 allSolidReferenceWmK:number;
 solidFraction:number;
 voidFraction:number;
 axis:HeatAxis;
 iterations:number;
 maxUpdate:number;
 converged:boolean;
 medium:'still_air'|'still_water';
 model:'harmonic_face_steady_conduction_only';
};
const harmonic=(a:number,b:number)=>2*a*b/(a+b);
export function screenVoxelHeatConduction(
 mask:Float32Array|Uint8Array,
 solidK:Float32Array,
 res:number,
 axis:HeatAxis='y',
 maxIterations=120,
 poreMedium:'air'|'water'='air',
):VoxelConductionScreen{
 if(!Number.isInteger(res)||res<2||res>32||mask.length!==res**3
  ||solidK.length!==res**3||!['x','y','z'].includes(axis)
  ||!Number.isSafeInteger(maxIterations)||maxIterations<1
  ||maxIterations>500)
  throw new RangeError('Invalid conduction voxel grid or solver budget');
 // 20–25°C approximate values, stationary fluid ONLY. Flow/convection
 // are deliberately excluded and separately screened geometrically.
 const n=mask.length,rs=res*res,gasK=poreMedium==='water'?.60:.026;
 const k=new Float32Array(n);
 let solids=0,meanK=0;
 for(let i=0;i<n;i++){
  if(!Number.isFinite(mask[i])||mask[i]<0||mask[i]>1
    ||!Number.isFinite(solidK[i])||solidK[i]<=0||solidK[i]>1e6)
    throw Error('Invalid finite-volume mask or W/(m K) conductivity');
  meanK+=solidK[i];
  const solid=mask[i]>=.5;
  if(solid)solids++;
  k[i]=solid?solidK[i]:gasK;
 }
 const coords=(i:number):[number,number,number]=>[
  Math.floor(i/rs),Math.floor(i%rs/res),i%res,
 ];
 const pos=(x:number,y:number,z:number)=>
  axis==='x'?x:axis==='y'?y:z;
 const temp=new Float64Array(n);
 for(let i=0;i<n;i++){
  const [x,y,z]=coords(i);
  temp[i]=1-pos(x,y,z)/(res-1);
 }
 let maxUpdate=Infinity,iteration=0;
 const passes=(i:number,x:number,y:number,z:number):number=>{
  let sum=0,weight=0;
  const add=(j:number)=>{
   const w=harmonic(k[i],k[j]);sum+=w*temp[j];weight+=w;
  };
  if(x>0)add(i-rs);
  if(x<res-1)add(i+rs);
  if(y>0)add(i-res);
  if(y<res-1)add(i+res);
  if(z>0)add(i-1);
  if(z<res-1)add(i+1);
  return sum/weight;
 };
 for(let iter=0;iter<maxIterations;iter++){
  maxUpdate=0;
  for(let x=0;x<res;x++)for(let y=0;y<res;y++)for(let z=0;z<res;z++){
   const p=pos(x,y,z);
   if(p===0||p===res-1)continue;
   const i=x*rs+y*res+z;
   const old=temp[i];
   // Over-relaxation speeds convergence for strongly varying k. Keep
   // Dirichlet values exact and avoid overshooting physically possible T.
   const next=Math.max(0,Math.min(1,old+1.25*(passes(i,x,y,z)-old)));
   temp[i]=next;
   maxUpdate=Math.max(maxUpdate,Math.abs(next-old));
  }
  iteration=iter+1;
  if(maxUpdate<1e-5)break;
 }
 // Flux across hot boundary / imposed gradient (ΔT/L=1/(res-1)).
 // Face count = res². This yields EXACT homogeneous k irrespective of res.
 let heatFlux=0;
 for(let x=0;x<res;x++)for(let y=0;y<res;y++)for(let z=0;z<res;z++){
  if(pos(x,y,z)!==0)continue;
  const i=x*rs+y*res+z;
  const j=axis==='x'?i+rs:axis==='y'?i+res:i+1;
  heatFlux+=harmonic(k[i],k[j])*(1-temp[j]);
 }
 const effective=heatFlux*(res-1)/(res*res);
 if(!Number.isFinite(effective)||effective<0)
  throw Error('Conduction model failed numerical validation');
 return {
  effectiveConductivityWmK:effective,
  allSolidReferenceWmK:meanK/n,
  solidFraction:solids/n,voidFraction:(n-solids)/n,
  axis,iterations:iteration,maxUpdate,
  converged:maxUpdate<1e-5,
  medium:poreMedium==='water'?'still_water':'still_air',
  model:'harmonic_face_steady_conduction_only',
 };
}
