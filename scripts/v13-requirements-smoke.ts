import assert from 'node:assert/strict';
import {V13MaterialEngine} from '../src/simulations/v13_material';

const engine=new V13MaterialEngine();
engine.activateElement(6);
const composite=engine.buildComposite([{z:6,fraction:.7},{z:14,fraction:.3}]);
const properties=JSON.stringify(composite.properties);
const geometry=JSON.stringify(composite.topology3D);
engine.receiveRequirement({
 id:'v6:thermal-field',source:'v6',medium:'air',
 minTemperatureK:290,maxTemperatureK:450,
 purpose:'thermal_survival',
 basis:'V6 numerical air temperature envelope (model only)',
});
assert.equal(engine.getRequirementScreenings().length,1);
const screened=engine.getRequirementScreenings()[0];
assert.equal(screened.requirement.source,'v6');
assert.notEqual(screened.status,'awaiting_composite');
assert.match(screened.missingEvidence,/measured phase/);
engine.receiveRequirement({
 ...screened.requirement,maxTemperatureK:5500,
});
assert.equal(engine.getRequirementScreenings().length,1,
 'Updated physical requirements replace their previous condition instead of growing a fake new invention');
assert.equal(engine.getRequirementScreenings()[0].status,'estimated_melt_failure');
assert.equal(engine.getMetrics().requirementCount,1);
for(let frame=0;frame<250;frame++){
 if(frame%15===0)engine.receiveFromSim('v7',{
  score:.01,
  recommendations:{meltingPointAdjust:2_000,conductivityAdjust:99,densityAdjust:2_000,
   regenerateTopology:true},
  refinedTopology:{vertices:[[999,999,999]],faces:[[0,0,0]],normals:[]},
 });
 engine.update(1/60);
}
assert.equal(JSON.stringify(composite.properties),properties,
 'V7 score must not fabricate material property changes or invented degradation per animation frame');
assert.equal(JSON.stringify(composite.topology3D),geometry,
 'Unverified V7 topology must not replace chemistry geometry');
assert.ok(engine.getMetrics().interSimWorkCount<=64,
 'Cross-engine history must stay bounded on mobile');
assert.throws(()=>engine.receiveRequirement({
 ...screened.requirement,maxTemperatureK:Infinity,
}),/Invalid machine-generated material requirement/);
const empty=new V13MaterialEngine();
empty.receiveRequirement(screened.requirement);
assert.equal(empty.getRequirementScreenings()[0].status,'awaiting_composite');
console.log('V6 → V13: typed temperature envelopes, provisional screening, missing empirical evidence and immutable material physics verified.');
