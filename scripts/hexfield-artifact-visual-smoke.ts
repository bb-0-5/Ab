import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {STAGE_GUIDES,captureRenderArtifact} from '../src/lib/render_artifact';
import {SIMULATION_STAGES} from '../src/lib/sim_sequence';
import {HEXFIELD_SOLIDS} from '../src/components/HexfieldArtifactInspector';
import {V5Engine} from '../src/simulations/v5';
import {V9LatticeEngine} from '../src/simulations/v9_lattice';
import {V10MeshEngine} from '../src/simulations/v10_mesh';
import {V13MaterialEngine} from '../src/simulations/v13_material';
import {V3Engine} from '../src/simulations/v3';
import {V4Engine} from '../src/simulations/v4';

assert.equal(Object.keys(HEXFIELD_SOLIDS).length,5);
assert.deepEqual(Object.keys(HEXFIELD_SOLIDS),[
 'cube','tetrahedron','octahedron','dodecahedron','icosahedron',
],'Hexfield native five Platonic solids must remain the visual vocabulary');
for(const stage of SIMULATION_STAGES){
 const g=STAGE_GUIDES[stage];
 assert.ok(g&&g.input&&g.action&&g.output&&g.watch,
   stage+' must identify what enters, happens, leaves and what to inspect');
}
const scene=new THREE.Scene();
const v5=new V5Engine(scene),v9=new V9LatticeEngine(scene);
const v10=new V10MeshEngine(scene),v13=new V13MaterialEngine();
const v3=new V3Engine(scene),v4=new V4Engine(scene);
try{
 assert.equal(captureRenderArtifact('v5',{v5}),null,
   'No fabricated membrane is allowed before V5 produces boundary planes');
 v9.configure('thermal');v9.setSeed(101);v9.buildLattice();
 const lattice=captureRenderArtifact('v9',{v9},'v9-real-receipt');
 assert.ok(lattice&&lattice.kind==='lattice');
 if(lattice?.kind==='lattice'){
  assert.equal(lattice.id,'v9-real-receipt');
  assert.ok(lattice.sourceCount>=lattice.sites.length);
  assert.ok(lattice.sites.length<=100,'Small model footprint for mobile');
  assert.ok(lattice.sites.every(x=>['Si','Ti','Al','C','Gd','Cu','SiO2','Fe','B-10','Ag'].includes(x.element)));
 }
 v10.configure('thermal');v10.optimizeConnectedChannels(
  v9.compositeField||undefined,'y',
 );
 const membrane=captureRenderArtifact('v10',{v10});
 assert.ok(membrane&&membrane.kind==='porous');
 if(membrane?.kind==='porous'){
  assert.equal(membrane.cutaway.length,membrane.res**2);
  assert.ok(membrane.cutaway.every(v=>v===1||v===0));
  assert.equal(membrane.path.length,Math.min(250,v10.throughPath.length));
  assert.equal(membrane.modelOnly,true);
 }
 v13.buildComposite([{z:14,fraction:.5},{z:22,fraction:.5}]);
 const chemistry=captureRenderArtifact('v13',{v13});
 assert.ok(chemistry&&chemistry.kind==='chemistry');
 if(chemistry?.kind==='chemistry'){
  assert.equal(chemistry.composition.length,2);
  assert.ok(chemistry.composition.every(x=>x.fraction>0));
  assert.ok(chemistry.meltingPointK>0);
 }
 const points=Array.from({length:12},(_,i)=>{
  const a=i*Math.PI/6;
  return new THREE.Vector3(Math.cos(a)*2,Math.sin(a)*2,i%3*.2);
 });
 v3.captureFromV1(points);
 v4.captureFromV2(points.map(p=>new THREE.Vector3(-p.y,p.x,p.z+.2)));
 for(let i=0;i<12;i++){v3.update();v4.update();}
 v5.captureFromV3V4(v3.getNodes(),v3.getEdges(),
  v4.getNodes(),v4.getEdges(),'thermal');
 for(let i=0;i<8;i++)v5.update();
 const planes=captureRenderArtifact('v5',{v5});
 assert.ok(planes&&planes.kind==='membrane');
 if(planes?.kind==='membrane'){
  assert.ok(planes.sourceCount>0);
  assert.ok(planes.planes.length<=28);
  assert.ok(planes.planes.every(p=>Number.isFinite(p.center.x)&&Number.isFinite(p.width)));
 }
 const app=readFileSync('src/App.tsx','utf8');
 assert.match(app,/captureRenderArtifact\(currentVersion/);
 assert.match(app,/frozenRenderArtifactsRef\.current\.set/);
 assert.match(app,/<HexfieldArtifactInspector/);
 assert.match(app,/onVisualEvidence=\{setVisualEvidence\}/);
 const renderer=readFileSync('src/components/HexfieldArtifactInspector.tsx','utf8');
 assert.match(renderer,/bb-0-5\/hexfield\/public\/words\/hexfield-visual\.js/);
 assert.match(renderer,/bb-0-5\/hexfield\/public\/iso\/hexfield-iso\.js/);
 assert.match(renderer,/NOT A MOLECULAR STRUCTURE/);
}finally{
 v3.dispose();v4.dispose();v5.dispose();v9.dispose();v10.dispose();scene.clear();
}
console.log('All 14 plain-language stage guides and actual V5/V9/V10/V13 Platonic visual artifacts traced; no fabricated membrane or molecular structure.');
