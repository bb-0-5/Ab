import assert from 'node:assert/strict';
import {SERIAL_ARRANGEMENTS,simulateSerialIris} from '../public/toroidal-series-loop.mjs';
assert.equal(SERIAL_ARRANGEMENTS.length,2);
const sequence=simulateSerialIris('serial-phase');
const simultaneous=simulateSerialIris('serial-sync');
assert.equal(sequence.configuration.hydraulic,'series');
assert.ok(sequence.samples[0].modules.every(m=>m.Qm3S>=0));
assert.ok(sequence.meanTotalFlowM3S>1e-8,'Alternating wall volumes create real sequential through-flow');
assert.equal(simultaneous.meanTotalFlowM3S,0,'Both walls in phase produce no differential pressure and no circulating flow');
assert.equal(simultaneous.grossElectricalW,0,'No fluid motion means no MHD electrical energy');
assert.ok(sequence.grossElectricalW>0);
assert.ok(sequence.netElectricalW<0&&simultaneous.netElectricalW<0);
assert.ok(sequence.motorElectricalW>sequence.grossElectricalW);
assert.equal(sequence.couplingCoefficient,0,'Ideal 90° mutual coupling assumption');
for(const s of [sequence,simultaneous]){
 assert.ok(s.maxRelativeEnergyError<.002,'Measured membrane work must close against losses and stored fluid/field energy');
 assert.ok(Math.abs(s.electricalClosureErrorJ)<1e-8,'Motional EMF work must equal resistive and magnetic-energy changes');
 assert.ok(s.continuityErrorM3.every(v=>Math.abs(v)<1e-14),'Moving wall source terms must conserve volume exactly');
 assert.equal(s.cavitationRiskSteps,0,'Chosen case cannot enter cavitation-risk gauge pressure');
 assert.ok(s.samples.length>100&&s.samples.every(x=>x.modules.every(m=>Number.isFinite(m.Qm3S)&&Number.isFinite(m.pressurePa))));
 assert.ok(s.samples.every(x=>x.modules.every(m=>m.Qm3S>=0)));
}
const noMagnetic=simulateSerialIris('serial-phase',{fieldTesla:0});
assert.equal(noMagnetic.grossElectricalW,0);
assert.ok(noMagnetic.meanTotalFlowM3S>0,'Fluid can move without a magnet if externally driven');
assert.throws(()=>simulateSerialIris('serial-phase',{motorEfficiency:1.5}),/Invalid/);
assert.throws(()=>simulateSerialIris('serial-phase',{loadOhm:0}),/Invalid/);
console.log('TRUE SERIAL IRIS PASS',JSON.stringify({
 alternatingFlowM3S:sequence.meanTotalFlowM3S,
 synchronousFlowM3S:simultaneous.meanTotalFlowM3S,
 grossElectricalW:sequence.grossElectricalW,
 externalMotorW:sequence.motorElectricalW,
 energyBudgetErrorFraction:sequence.maxRelativeEnergyError,
 continuityM3:sequence.continuityErrorM3
},null,2));
