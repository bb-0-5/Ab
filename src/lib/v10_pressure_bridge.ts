/** Export the EXACT realized original V10 solidMask, not resampled TPMS. */
import type {V10MeshEngine,MeshConfig} from '../simulations/v10_mesh';
export const V10_PRESSURE_SELECTION_KEY='abovebound:v10-pressure-selection:v1';
export const V10_PRESSURE_FEEDBACK_KEY='abovebound:v10-pressure-feedback:v1';
export interface V10PressureSelection {
 schema:1;source:'original-V10-solidMask';resolution:number;bounds:number;axis:'y';
 config:MeshConfig;maskHex:string;checksum:string;timestamp:number;reason:string;
}
export function encodeV10PressureSelection(
 mesh:Pick<V10MeshEngine,'getSolidMask'|'getResolution'|'getBounds'|'config'>,
 reason='selected V10 geometry',timestamp=Date.now(),
):V10PressureSelection {
 const n=mesh.getResolution(),src=mesh.getSolidMask(),bounds=mesh.getBounds();
 if(!Number.isInteger(n)||n<5||n>39||!src||src.length!==n**3||
    !Number.isFinite(bounds)||bounds<=0)throw Error('V10 has no complete geometry to transfer');
 // V10 is [x*n*n+y*n+z]; pore network is [z*n*n+y*n+x].
 const out=new Uint8Array(n**3);let hash=2166136261;
 for(let z=0;z<n;z++)for(let y=0;y<n;y++)for(let x=0;x<n;x++){
   const v=src[(x*n+y)*n+z];
   if(!Number.isFinite(v))throw Error('Non-finite V10 voxel');
   out[(z*n+y)*n+x]=v>0.5?1:0;
 }
 for(const v of out)hash=Math.imul(hash^v,16777619)>>>0;
 let maskHex='';
 for(let i=0;i<out.length;i+=4){
   let v=0;for(let k=0;k<4&&i+k<out.length;k++)v|=out[i+k]<<k;
   maskHex+=v.toString(16);
 }
 const {tpms,frequency,threshold,roughness,porosity}=mesh.config;
 return {schema:1,source:'original-V10-solidMask',resolution:n,bounds,axis:'y',
  config:{tpms,frequency,threshold,roughness,porosity},
  maskHex,checksum:hash.toString(16).padStart(8,'0'),timestamp,reason};
}
let last='';
export function publishV10PressureSelection(
 mesh:Pick<V10MeshEngine,'getSolidMask'|'getResolution'|'getBounds'|'config'>,
 reason='selected V10 geometry',store?:Pick<Storage,'getItem'|'setItem'>,
):boolean {
 const r=encodeV10PressureSelection(mesh,reason);
 const identity=r.checksum+'|'+JSON.stringify(r.config);
 if(identity===last)return false;
 try{
  const s=store??(typeof window!=='undefined'?window.localStorage:null);if(!s)return false;
  const old=s.getItem(V10_PRESSURE_SELECTION_KEY);
  if(old){try{
    const p=JSON.parse(old) as V10PressureSelection;
    if(p.checksum===r.checksum&&JSON.stringify(p.config)===JSON.stringify(r.config)
      &&Number.isFinite(p.timestamp)&&Date.now()-p.timestamp<86400e3){last=identity;return false;}
  }catch{/* replace corrupt storage */}}
  s.setItem(V10_PRESSURE_SELECTION_KEY,JSON.stringify(r));last=identity;return true;
 }catch{return false;}
}
export function readV10PressureFeedback(store?:Pick<Storage,'getItem'>):unknown {
 try{
  const s=store??(typeof window!=='undefined'?window.localStorage:null);
  const raw=s?.getItem(V10_PRESSURE_FEEDBACK_KEY);if(!raw)return null;
  const r=JSON.parse(raw),selected=s?.getItem(V10_PRESSURE_SELECTION_KEY);
  if(r?.schema!==1||!Number.isFinite(r.flowM3S)||
     !Number.isFinite(r.timestamp)||Date.now()-r.timestamp>7*86400e3||
     !selected||JSON.parse(selected).checksum!==r.selectionChecksum)return null;
  return r;
 }catch{return null;}
}
