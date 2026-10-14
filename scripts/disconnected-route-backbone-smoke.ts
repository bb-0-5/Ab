import assert from 'node:assert/strict';
import * as THREE from 'three';
import {V3Engine} from '../src/simulations/v3';
import {V4Engine} from '../src/simulations/v4';
import {V5Engine} from '../src/simulations/v5';

const scene=new THREE.Scene();
const v3=new V3Engine(scene),v4=new V4Engine(scene),v5=new V5Engine(scene);
try{
 // Two completely separated PSO basins: each site has its k-nearest
 // neighbors only INSIDE its own cluster, so the original KNN graph is
 // disconnected and Prim's MST would stop before reaching the other half.
 const nodes=Array.from({length:16},(_,i)=>{
  const basin=i<8?0:80,j=i%8;
  return new THREE.Vector3(basin+(j%4)*.03,Math.floor(j/4)*.05,
   (j%3)*.01);
 });
 const rotated=nodes.map(p=>new THREE.Vector3(-p.y,p.x,p.z+.03));
 v3.captureFromV1(nodes);
 v4.captureFromV2(rotated);
 for(let i=0;i<30;i++){v3.update();v4.update();}
 for(const [engine,name] of [[v3,'V3'],[v4,'V4']] as const){
  assert.equal(engine.getMSTEdges().length,nodes.length-1,
   name+' must propose a complete numerical backbone across PSO basins');
  assert.ok(engine.syntheticBridges>=1,name+' missing cross-basin proposals');
  assert.ok(engine.isStable(),name+' remains stuck after full route construction');
  assert.ok(Number.isFinite(engine.getMSTLength()));
  assert.ok(engine.getMSTLength()>50,
   'Actual distant points must not be presented as zero-length connections');
 }
 v5.captureFromV3V4(v3.getNodes(),v3.getEdges(),
  v4.getNodes(),v4.getEdges(),'thermal');
 for(let i=0;i<12;i++)v5.update();
 assert.equal(v5.isStable(),true);
 assert.ok(v5.getBoundaryPlanes().length>0);
 assert.ok(v5.getBoundaryPlanes().length<500);
 console.log('V3/V4 closed disconnected PSO basin gaps using actual shortest geometric link proposals; V5 received valid bounded planes.');
}finally{v5.dispose();v4.dispose();v3.dispose();scene.clear();}
