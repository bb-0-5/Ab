import assert from 'node:assert/strict';
import {resolveMembraneSource,evaluateMembraneGeometry,maskCrossSection} from '../public/toroidal-membrane-bridge.mjs';
import {V10_PRESSURE_SELECTION_KEY} from '../public/v10-pressure-handoff.mjs';
import {simulateSerialIris} from '../public/toroidal-series-loop.mjs';
import {simulateIrisStack} from '../public/toroidal-iris-stack.mjs';
const noSelection={getItem(){return null;}};
const fallback=resolveMembraneSource(noSelection);
const auto=evaluateMembraneGeometry(fallback);
assert.equal(auto.nativeSelection,false);
assert.match(auto.source,/AUTO V10/);
assert.ok(auto.supported&&auto.relativeFlow>0&&auto.relativeFlow<1);
assert.ok(auto.resistanceMultiplier>1&&auto.resistanceMultiplier<30);
assert.equal(maskCrossSection(auto,0).solid.length,auto.n*auto.n);
// Emulate exact exported original-V10 receipt in expected Z-major 4-bit
// format; never reconstruct this selected mask from TPMS parameters.
const n=7,m=new Uint8Array(n**3);
for(let z=0;z<n;z++)for(let y=0;y<n;y++)for(let x=0;x<n;x++)
 m[(z*n+y)*n+x]=x>=5?1:0;
let checksum=2166136261,hex='';
for(const v of m)checksum=Math.imul(checksum^v,16777619)>>>0;
for(let i=0;i<m.length;i+=4){
 let digit=0;for(let k=0;k<4&&i+k<m.length;k++)digit|=m[i+k]<<k;
 hex+=digit.toString(16);
}
const now=1771000000000;
const receipt={schema:1,source:'original-V10-solidMask',resolution:n,bounds:2,
 axis:'y',config:{tpms:'gyroid',frequency:1.3,threshold:.15,roughness:0,porosity:.35},
 maskHex:hex,checksum:checksum.toString(16).padStart(8,'0'),timestamp:now,reason:'test exact mask'};
const storage={getItem(k){return k===V10_PRESSURE_SELECTION_KEY?JSON.stringify(receipt):null;}};
const recovered=resolveMembraneSource(storage,now);
const original=evaluateMembraneGeometry(recovered);
assert.ok(original.nativeSelection);
assert.equal(original.checksum,receipt.checksum);
assert.deepEqual(original.mask,m,'Exact original stored void/solid values preserved');
assert.ok(original.supported);
assert.ok(original.resistanceMultiplier>1);
assert.deepEqual(maskCrossSection(original,3).solid,m.slice(3*n*n,4*n*n));
// Bad checksum MUST NOT silently load a fake original geometry.
const corrupted={getItem(){return JSON.stringify({...receipt,checksum:'deadbeef'})}};
const rejected=resolveMembraneSource(corrupted,now);
assert.equal(rejected.nativeSelection,false,'Broken original mask cannot be admitted');
// Numerical coupling: the V10 topology changes resistance, the pressure
// field and the resulting chronological flow and electrical ledger.
const bare=simulateSerialIris('serial-phase');
const imported=simulateSerialIris('serial-phase',{flowResistanceMultiplier:auto.resistanceMultiplier});
assert.notEqual(imported.meanTotalFlowM3S,bare.meanTotalFlowM3S);
assert.ok(imported.meanTotalFlowM3S<bare.meanTotalFlowM3S,'More geometric pressure drag must reduce through-flow');
assert.ok(imported.maxRelativeEnergyError<.002);
assert.ok(imported.continuityErrorM3.every(x=>Math.abs(x)<1e-14));
const stacked=simulateIrisStack('orthogonal',{flowResistanceMultiplier:auto.resistanceMultiplier});
assert.ok(stacked.maxRelativeEnergyError<.002);
assert.ok(stacked.netElectricalW<0);
assert.throws(()=>simulateSerialIris('serial-phase',{flowResistanceMultiplier:0}),/Invalid/);
assert.throws(()=>simulateIrisStack('orthogonal',{flowResistanceMultiplier:999}),/Invalid/);
console.log('V10->TOROIDAL VERIFIED',JSON.stringify({
 origin:original.source,checksum:original.checksum,
 autoVoidRate:auto.relativeFlow,autoResistanceMultiplier:auto.resistanceMultiplier,
 originalResistanceMultiplier:original.resistanceMultiplier,
 unconditionedFlowM3S:bare.meanTotalFlowM3S,
 importedFlowM3S:imported.meanTotalFlowM3S,
 importedNetElectricW:imported.netElectricalW
},null,2));
