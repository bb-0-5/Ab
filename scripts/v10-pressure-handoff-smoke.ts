import assert from 'node:assert/strict';
import * as THREE from 'three';
import {V10MeshEngine} from '../src/simulations/v10_mesh';
import {encodeV10PressureSelection,publishV10PressureSelection,
  readV10PressureFeedback,V10_PRESSURE_SELECTION_KEY} from '../src/lib/v10_pressure_bridge';
import {decodeV10PressureSelection,storePressureFeedback} from '../public/v10-pressure-handoff.mjs';

const n=7,values=new Float32Array(n**3);
values[(6*n+4)*n+2]=1;
values[(1*n+2)*n+3]=1;
const fixture={
 getSolidMask:()=>values,getResolution:()=>n,getBounds:()=>2,
 config:{tpms:'gyroid' as const,frequency:1.5,threshold:.2,porosity:.5,roughness:0},
};
const r=encodeV10PressureSelection(fixture,'test');
const decoded=decodeV10PressureSelection(r);
const at=(x:number,y:number,z:number)=>(z*n+y)*n+x;
assert.equal(decoded.mask[at(6,4,2)],1,'V10 X-major → hydraulic Z-major must be exact');
assert.equal(decoded.mask[at(1,2,3)],1);
assert.equal(decoded.mask.reduce((a:number,b:number)=>a+b,0),2);
assert.throws(()=>decodeV10PressureSelection({...r,maskHex:'f'+r.maskHex.slice(1)}),/checksum/i);
assert.throws(()=>decodeV10PressureSelection(r,r.timestamp+8*86400e3),/stale/i);
const m=new Map<string,string>();
const storage={getItem:(k:string)=>m.get(k)||null,setItem:(k:string,v:string)=>{m.set(k,v)}};
assert.equal(publishV10PressureSelection(fixture,'test',storage),true);
assert.equal(publishV10PressureSelection(fixture,'test',storage),false,'unchanged mask not rewritten on frames');
const source=JSON.parse(m.get(V10_PRESSURE_SELECTION_KEY)!);
assert.deepEqual(Array.from(decodeV10PressureSelection(source).mask),Array.from(decoded.mask));
assert.ok(storePressureFeedback(source,{flowM3S:1e-12,relativeOpen:.2,valid:true,
  meetsTarget:true,reason:'numerical only',pressureAtTargetPa:1},storage));
assert.ok(readV10PressureFeedback(storage));
m.set(V10_PRESSURE_SELECTION_KEY,JSON.stringify({...source,checksum:'wrong'}));
assert.equal(readV10PressureFeedback(storage),null,'stale result cannot be assigned to a new design');
// End-to-end with the actual ORIGINAL V10 engine, not an invented mock.
const v10=new V10MeshEngine(new THREE.Scene());
v10.buildMesh();
const live=decodeV10PressureSelection(encodeV10PressureSelection(v10));
const native=v10.getSolidMask()!,dim=v10.getResolution();
assert.equal(live.n,dim);
for(let x=0;x<dim;x++)for(let y=0;y<dim;y++)for(let z=0;z<dim;z++){
 assert.equal(live.mask[(z*dim+y)*dim+x],
   native[(x*dim+y)*dim+z]>.5?1:0);
}
v10.dispose();
console.log('Original V10 → exact native mask → validated pressure handoff PASS');
