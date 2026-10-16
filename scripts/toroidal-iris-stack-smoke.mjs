import assert from 'node:assert/strict';
import {irisLinkage,irisMembrane,chamberOutputAt,CONFIGURATIONS,
 simulateIrisStack,compareIrisStacks} from '../public/toroidal-iris-stack.mjs';
const near=(x,y,t=1e-7)=>assert.ok(Math.abs(x-y)<=t*Math.max(1,Math.abs(x),Math.abs(y)),x+' != '+y);
let min=Infinity,max=-Infinity;
for(let i=0;i<720;i++){
 const a=2*Math.PI*i/720,k=irisLinkage(a),m=irisMembrane(a);
 assert.ok(k.closureErrorM<1e-13,'Link lengths must satisfy closure exactly');
 assert.ok(m.radiusM>0&&m.radiusM<.003);
 min=Math.min(min,m.volumeM3);max=Math.max(max,m.volumeM3);
}
assert.ok(max>min*1.35,'Moving iris should change cavity volume, not visual decoration');
const period=1/3;
let integral=0,positive=0,negative=0,dt=period/2000;
for(let i=0;i<2000;i++){
 const k=chamberOutputAt((i+.5)*dt,{heads:4,frequencyHz:3});
 integral+=(k.outputM3S-k.intakeM3S)*dt;
 positive+=k.outputM3S*dt;negative+=k.intakeM3S*dt;
}
assert.ok(Math.abs(integral)<1e-10,'Periodic iris must inhale as much as exhale');
assert.ok(positive>0&&negative>0,'Real chamber volume derivative required');
const results=compareIrisStacks();
assert.equal(results.length,CONFIGURATIONS.length);
const byId=Object.fromEntries(results.map(x=>[x.configuration.id,x]));
assert.equal(byId.single.configuration.modules,1);
assert.equal(byId.orthogonal.couplingCoefficient,0,
 'Idealized coaxial pickup orientation at 90 degrees has zero mutual inductance');
assert.ok(byId.aligned.couplingCoefficient>.1);
assert.equal(byId.inverted.configuration.polarity,-1);
for(const r of results){
 assert.ok(r.linkageClosureErrorM<1e-13);
 assert.ok(r.negativePressureSteps===0,'No cavitation allowed in the selected cases');
 assert.ok(r.maxRelativeEnergyError<.004,
  'Net mechanical input must equal stored hydraulic/magnetic energy plus heating/output');
 assert.ok(Math.abs(r.electricalClosureErrorJ)<1e-7);
 assert.ok(r.motorElectricalW>r.grossElectricalW);
 assert.ok(r.netElectricalW<0,'No free power from static magnets/coil orientation');
 assert.ok(r.samples[0].modules.every(m=>m.Qm3S>=0));
 assert.ok(r.samples.at(-1).modules.every(m=>m.pressurePa>=0));
 assert.ok(r.samples.length>100&&r.samples.every(s=>Number.isFinite(s.grossElectricalW)));
}
near(byId.single.netElectricalW,byId.single.grossElectricalW-byId.single.motorElectricalW);
assert.ok(byId.aligned.motorElectricalW>byId.single.motorElectricalW*1.8,
 'Two pumped modules must count two motor loads');
assert.ok(byId.orthogonal.grossElectricalW>0);
// Motor rotation inversion is not permission for the fluid to flow backwards
// through ideal check valves. Electrical polarity must be a separate control.
assert.equal(byId.counter.configuration.spin,-1);
assert.ok(byId.counter.samples.every(s=>s.modules.every(m=>m.Qm3S>=0)));
const noField=simulateIrisStack('orthogonal',{magneticFieldTesla:0});
assert.ok(noField.grossElectricalW===0&&noField.energy.electricalOutputJ===0);
assert.ok(noField.netElectricalW<0);
assert.throws(()=>simulateIrisStack('single',{loadOhm:-1}),/model bounds/);
assert.throws(()=>simulateIrisStack('single',{mutualMaximum:1.5}),/model bounds/);
console.log('Moving iris + crossed stacks: geometry, continuity, passivity and energy budgets PASS');
console.log(JSON.stringify(results.map(x=>({case:x.configuration.id,grossW:x.grossElectricalW,driveW:x.motorElectricalW,
 netW:x.netElectricalW,flow:x.meanTotalFlowM3S,energyRelErr:x.maxRelativeEnergyError})),null,2));
