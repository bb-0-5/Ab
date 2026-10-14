import assert from 'node:assert/strict';
import {decodeV10PressureSelection} from '../public/v10-pressure-handoff.mjs';
const n=7,mask=new Uint8Array(n**3);
for(let z=0;z<n;z++)for(let y=0;y<n;y++)for(let x=0;x<3;x++)mask[(z*n+y)*n+x]=1;
let hash=2166136261;for(const b of mask)hash=Math.imul(hash^b,16777619)>>>0;
let maskHex='';for(let q=0;q<mask.length;q+=4){
 let nib=0;for(let j=0;j<4&&q+j<mask.length;j++)nib|=mask[q+j]<<j;
 maskHex+=nib.toString(16);
}
const receipt={schema:1,source:'original-V10-solidMask',resolution:n,bounds:2,axis:'y',
 config:{tpms:'schwarz_p',frequency:.8,threshold:.35,roughness:0,porosity:.5},
 maskHex,checksum:hash.toString(16).padStart(8,'0'),timestamp:Date.now(),reason:'original V10 stage'};
assert.deepEqual(Array.from(decodeV10PressureSelection(receipt).mask),Array.from(mask));
const messages=[];globalThis.postMessage=x=>messages.push(x);
await import('../public/membrane-worker.mjs');
assert.equal(messages[0].type,'ready');
globalThis.onmessage({data:{type:'source-v10',receipt}});
globalThis.onmessage({data:{type:'start'}});
for(let i=0;i<350;i++){
 if(messages.some(x=>x.type==='complete'||x.type==='error'))break;
 await new Promise(ok=>setTimeout(ok,30));
}
const error=messages.find(x=>x.type==='error');
assert.equal(error,undefined,error?.message);
const original=messages.find(x=>x.type==='source-evidence');
assert.ok(original,'exact selected V10 mask is actually solved');
assert.equal(original.source.checksum,receipt.checksum);
assert.equal(original.current.n,n);
assert.equal(original.current.layers,n);
assert.ok(original.source.flowM3S>0);
assert.ok(original.source.relativeOpen>0&&original.source.relativeOpen<1,
  'solid membrane cannot beat equivalent empty passage on same grid');
assert.equal(original.current.fluxZ.length,n**3,'Z-direction transport in actual 3D network');
const complete=messages.find(x=>x.type==='complete');
assert.ok(complete,'bounded V10 geometry search still terminates');
assert.equal(complete.ranking[0].name,'Open void reference');
assert.ok(messages.some(x=>x.type==='progress'&&x.current.n===13),
  'the separate 13×13×9 screening baseline still exists');
console.log('V10 original selected native voxels → matching open-reference pressure solve → independent search PASS');
