import assert from 'node:assert/strict';
import * as THREE from 'three';
import {V9LatticeEngine} from '../src/simulations/v9_lattice';
import {V13MaterialEngine} from '../src/simulations/v13_material';
import {loadMaterialRecipes,recipeIdentity,rememberMaterialRecipe}
 from '../src/lib/material_recipe_archive';

const store=new Map<string,string>();
Object.assign(globalThis,{localStorage:{
 getItem:(key:string)=>store.get(key)||null,
 setItem:(key:string,value:string)=>{store.set(key,value);},
}});
const carbonSilicon=[{z:6,fraction:2},{z:14,fraction:1}];
const siliconCarbon=[{z:14,fraction:1/3},{z:6,fraction:2/3}];
assert.equal(recipeIdentity(carbonSilicon),recipeIdentity(siliconCarbon));
assert.throws(()=>recipeIdentity([{z:6,fraction:0}]),/positive/);
assert.throws(()=>recipeIdentity([{z:6,fraction:-1}]),/positive/);
assert.throws(()=>recipeIdentity([{z:6,fraction:NaN}]),/positive/);
assert.throws(()=>recipeIdentity([{z:6,fraction:1},{z:6,fraction:1}]),/positive/);
rememberMaterialRecipe(carbonSilicon);
rememberMaterialRecipe(siliconCarbon);
assert.equal(loadMaterialRecipes().length,1,'Same chemical fractions are one recipe regardless of input order/scale');
for(let i=1;i<=17;i++)rememberMaterialRecipe([{z:i,fraction:1}]);
assert.ok(loadMaterialRecipes().length<=12);
assert.equal(loadMaterialRecipes()[0].parts[0].z,17);
assert.equal(loadMaterialRecipes()[0].evidence,'hypothesis_only_unmeasured');
rememberMaterialRecipe(carbonSilicon);
const restored=loadMaterialRecipes()[0];
assert.equal(restored.id,recipeIdentity(carbonSilicon));
const engine=new V13MaterialEngine();
engine.activateElement(6);
const hypothetical=engine.buildComposite(restored.parts);
engine.receiveRequirement({
 id:'v6:thermal-field',source:'v6',medium:'air',
 minTemperatureK:290,maxTemperatureK:400,
 purpose:'thermal_survival',basis:'freshly simulated temperature requirement',
});
assert.equal(hypothetical.elements.length,2);
assert.equal(engine.getRequirementScreenings().length,1);
assert.equal(engine.getRequirementScreenings()[0].requirement.maxTemperatureK,400);
assert.equal(engine.getComposites().length,1,
 'The recipe is replayed, not claimed as a physically verified substance');

// Re-running the SAME V9 numerical material experiment is now bit reproducible.
// This makes the inherited V10 porous mesh meaningful across resets.
const scene=new THREE.Scene();
const lattice=new V9LatticeEngine(scene);
try{
 lattice.configure('thermal');
 lattice.setSeed(987654);
 lattice.buildLattice();
 const first=lattice.cells.map(c=>[c.element.atomicNumber,c.occupied,c.bondStrength]);
 const k=lattice.getMaterialForV1()?.conductivity;
 lattice.buildLattice();
 const second=lattice.cells.map(c=>[c.element.atomicNumber,c.occupied,c.bondStrength]);
 assert.deepEqual(second,first,'Same seed and physical parameters => identical alloy/defect realizations');
 assert.equal(lattice.getMaterialForV1()?.conductivity,k);
 lattice.setSeed(987655);
 lattice.buildLattice();
 const altered=lattice.cells.map(c=>[c.element.atomicNumber,c.occupied,c.bondStrength]);
 assert.notDeepEqual(altered,first,'Different seed can actually explore different lattice microstructures');
 assert.throws(()=>lattice.setSeed(-1),/seed/);
 assert.throws(()=>lattice.setSeed(NaN),/seed/);
}finally{lattice.dispose();}
console.log('V9 deterministic microstructure and V13 recipe replay: repeatable trials, no invented measurements, capped device-local chemistry.');
