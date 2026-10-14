/**
 * Exact six-neighbour connectivity in an existing V10 solid/void voxel mask.
 * Geometry only: it does NOT estimate permeability, Reynolds number,
 * experimental yield, pressure drop, or material chemistry.
 */
export type VoxelChannelEvidence = {
 resolution:number;
 voidCount:number;
 solidCount:number;
 /** Number of distinct six-connected void components, including isolated pores. */
 componentCount:number;
 /** At least one open channel connecting opposing faces along each axis. */
 spanning:{x:boolean;y:boolean;z:boolean};
 /** Shortest path length through voids / straight voxel-grid distance; null if blocked. */
 shortestPathTortuosity:{x:number|null;y:number|null;z:number|null};
 /** Fraction of void cells in components spanning at least one axis. */
 spanningVoidFraction:number;
 evidence:'six_neighbour_voxel_geometry_only';
};
type Axis='x'|'y'|'z';
const axisMap:{[K in Axis]:number}={x:0,y:1,z:2};
export function screenVoxelChannels(mask:Float32Array|Uint8Array|number[],res:number):VoxelChannelEvidence{
 if(!Number.isInteger(res)||res<2||res>64||mask.length!==res**3)
  throw new RangeError('Voxel mask resolution/length mismatch');
 const n=mask.length;
 const open=new Uint8Array(n);
 let voidCount=0;
 for(let i=0;i<n;i++){
  const value=mask[i];
  if(!Number.isFinite(value)||value<0||value>1)throw Error('Invalid solid mask value');
  if(value<.5){open[i]=1;voidCount++;}
 }
 const mark=new Uint8Array(n),queue=new Int32Array(n);
 const spanning={x:false,y:false,z:false};
 let components=0,spanningCount=0;
 const rs=res*res;
 const neighbor=(idx:number,x:number,y:number,z:number,push:(j:number)=>void)=>{
  if(x>0)push(idx-rs);
  if(x+1<res)push(idx+rs);
  if(y>0)push(idx-res);
  if(y+1<res)push(idx+res);
  if(z>0)push(idx-1);
  if(z+1<res)push(idx+1);
 };
 for(let start=0;start<n;start++){
  if(!open[start]||mark[start])continue;
  components++;
  let head=0,tail=1,faces=0;
  queue[0]=start;mark[start]=1;
  while(head<tail){
   const idx=queue[head++];
   const x=Math.floor(idx/rs),y=Math.floor((idx%rs)/res),z=idx%res;
   if(x===0)faces|=1;if(x===res-1)faces|=2;
   if(y===0)faces|=4;if(y===res-1)faces|=8;
   if(z===0)faces|=16;if(z===res-1)faces|=32;
   neighbor(idx,x,y,z,j=>{
    if(open[j]&&!mark[j]){mark[j]=1;queue[tail++]=j;}
   });
  }
  const spansX=(faces&3)===3,spansY=(faces&12)===12,spansZ=(faces&48)===48;
  spanning.x ||=spansX;spanning.y ||=spansY;spanning.z ||=spansZ;
  if(spansX||spansY||spansZ)spanningCount+=tail;
 }
 const shortestPath=(axis:Axis):number|null=>{
  if(!spanning[axis])return null;
  const axisId=axisMap[axis];
  const steps=new Int32Array(n).fill(-1);
  let head=0,tail=0;
  for(let i=0;i<n;i++){
   if(!open[i])continue;
   const p=axisId===0?Math.floor(i/rs)
     :axisId===1?Math.floor((i%rs)/res):i%res;
   if(p===0){steps[i]=0;queue[tail++]=i;}
  }
  while(head<tail){
   const idx=queue[head++],depth=steps[idx];
   const x=Math.floor(idx/rs),y=Math.floor((idx%rs)/res),z=idx%res;
   const pos=axisId===0?x:axisId===1?y:z;
   if(pos===res-1)return Math.max(1,depth/(res-1));
   neighbor(idx,x,y,z,j=>{
    if(open[j]&&steps[j]===-1){steps[j]=depth+1;queue[tail++]=j;}
   });
  }
  return null;
 };
 return {
  resolution:res,voidCount,solidCount:n-voidCount,componentCount:components,
  spanning,shortestPathTortuosity:{
   x:shortestPath('x'),y:shortestPath('y'),z:shortestPath('z'),
  },
  spanningVoidFraction:voidCount>0?spanningCount/voidCount:0,
  evidence:'six_neighbour_voxel_geometry_only',
 };
}

/**
 * One EXACT six-neighbour face-to-face path through void voxels.
 * Returned indices are physically adjacent; an empty result means no
 * qualifying passage. This is geometry, not a particle-flow measurement.
 */
export function traceVoxelThroughPath(
 mask:Float32Array|Uint8Array|number[],res:number,axis:'x'|'y'|'z'='y',
):number[]{
 if(!Number.isInteger(res)||res<2||res>64||mask.length!==res**3
   ||!['x','y','z'].includes(axis))
   throw new RangeError('Invalid path mask dimensions or axis');
 const n=res**3,rs=res*res,queue=new Int32Array(n);
 const parent=new Int32Array(n).fill(-1);
 const pos=(i:number)=>axis==='x'?Math.floor(i/rs):
   axis==='y'?Math.floor(i%rs/res):i%res;
 let head=0,tail=0,last=-1;
 for(let i=0;i<n;i++)if(pos(i)===0&&mask[i]<.5){
   parent[i]=i;queue[tail++]=i;
 }
 while(head<tail){
   const i=queue[head++],x=Math.floor(i/rs);
   const y=Math.floor(i%rs/res),z=i%res;
   if(pos(i)===res-1){last=i;break;}
   const nbrs=[
    x>0?i-rs:-1,x+1<res?i+rs:-1,
    y>0?i-res:-1,y+1<res?i+res:-1,
    z>0?i-1:-1,z+1<res?i+1:-1,
   ];
   for(const j of nbrs)if(j>=0&&parent[j]<0&&mask[j]<.5){
     parent[j]=i;queue[tail++]=j;
   }
 }
 if(last<0)return [];
 const path:number[]=[];
 while(parent[last]!==last){
   path.push(last);last=parent[last];
 }
 path.push(last);
 return path.reverse();
}
