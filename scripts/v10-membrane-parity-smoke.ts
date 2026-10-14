import assert from 'node:assert/strict';
import * as THREE from 'three';
import { V10MeshEngine } from '../src/simulations/v10_mesh';
import {buildV10Mask,fromV10SolidMask} from '../public/v10-membrane-masks.mjs';

/** Guard against V10 TPMS formulas drifting apart from the CFD geometry bridge. */
const mesh=new V10MeshEngine(new THREE.Scene());
for(const tpms of ['gyroid','diamond','schwarz_p','lidinoid','neovius'] as const){
 mesh.config={tpms,frequency:.8,threshold:.25,roughness:.025,porosity:.5};
 mesh.buildMesh();
 assert.ok(mesh.solidMask,'original V10 mesh must expose voxel mask');
 const resolution=Math.round(Math.cbrt(mesh.solidMask!.length));
 const v10=fromV10SolidMask(mesh.solidMask!,resolution);
 const local=buildV10Mask({n:resolution,layers:resolution,tpms,frequency:.8,threshold:.25,roughness:.025}).mask;
 assert.deepEqual(Array.from(local),Array.from(v10),`V10 ${tpms} mask semantics drifted`);
}
console.log('PASS: generated CFD solids match actual original V10 solidMask for five TPMS shapes');
