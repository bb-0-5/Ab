/** Original V10 -> pore network handoff. Same-origin only, no upload.
 * A saved solid mask is used AS IS at native resolution, not reconstructed.
 */
export const V10_PRESSURE_SELECTION_KEY='abovebound:v10-pressure-selection:v1';
export const V10_PRESSURE_FEEDBACK_KEY='abovebound:v10-pressure-feedback:v1';
const names=new Set(['gyroid','diamond','schwarz_p','lidinoid','neovius']);
export function decodeV10PressureSelection(raw,now=Date.now()){
 const r=typeof raw==='string'?JSON.parse(raw):raw;
 if(!r||r.schema!==1||r.source!=='original-V10-solidMask'||r.axis!=='y')throw Error('Not an original V10 receipt');
 const n=r.resolution;
 if(!Number.isInteger(n)||n<5||n>39||!Number.isFinite(r.bounds)||r.bounds<=0||
   !r.config||!names.has(r.config.tpms)||
   ![r.config.frequency,r.config.threshold,r.config.roughness,r.config.porosity].every(Number.isFinite)||
   !Number.isFinite(r.timestamp)||r.timestamp>now+300000||now-r.timestamp>7*86400e3)
   throw Error('Invalid or stale V10 selected geometry');
 const count=n**3;
 if(typeof r.maskHex!=='string'||r.maskHex.length!==Math.ceil(count/4)||!/^[0-9a-f]+$/.test(r.maskHex))
   throw Error('Invalid mask length or encoding');
 const mask=new Uint8Array(count);let h=2166136261;
 for(let q=0;q<count;q++){
  mask[q]=(parseInt(r.maskHex[q>>2],16)>>(q&3))&1;
  h=Math.imul(h^mask[q],16777619)>>>0;
 }
 if(h.toString(16).padStart(8,'0')!==r.checksum)throw Error('V10 mask checksum mismatch');
 return {receipt:r,mask,n,layers:n};
}
export function readSelectedV10PressureGeometry(store,now=Date.now()){
 try{
  const s=store??globalThis.localStorage;
  const raw=s?.getItem(V10_PRESSURE_SELECTION_KEY);
  return raw?decodeV10PressureSelection(raw,now):null;
 }catch{return null;}
}
export function storePressureFeedback(source,feedback,store,now=Date.now()){
 if(!source||!Number.isFinite(feedback?.flowM3S))return false;
 try{
  const s=store??globalThis.localStorage;
  s?.setItem(V10_PRESSURE_FEEDBACK_KEY,JSON.stringify({
   schema:1,selectionChecksum:source.checksum,timestamp:now,
   flowM3S:feedback.flowM3S,relativeOpen:feedback.relativeOpen,
   valid:feedback.valid,meetsTarget:feedback.meetsTarget,
   reason:feedback.reason,pressureAtTargetPa:feedback.pressureAtTargetPa,
   model:'equal-radius pore network, not validated CFD'
  }));
  return !!s;
 }catch{return false;}
}
