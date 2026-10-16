import assert from 'node:assert/strict';
import {buildPassiveRing,advancePassiveRing,passiveSnapshot,passiveAcousticEnergy} from '../public/toroidal-passive-pressure.mjs';
import {resolveMembraneSource,evaluateMembraneGeometry} from '../public/toroidal-membrane-bridge.mjs';
const almost=(a,b,tol=1e-9)=>assert.ok(Math.abs(a-b)<=tol*Math.max(1,Math.abs(a),Math.abs(b)),a+' vs '+b);
const store={getItem(){return null;}};
const source=resolveMembraneSource(store);
const membrane=evaluateMembraneGeometry(source);
assert.ok(membrane.supported&&membrane.mask.length===membrane.n**2*membrane.layers);
const blank=buildPassiveRing(membrane,{mode:'uniform',basePressurePa:1e7});
const initialEmpty=passiveAcousticEnergy(blank);
assert.equal(initialEmpty,0);
advancePassiveRing(blank,1800);
const staticResult=passiveSnapshot(blank);
assert.equal(staticResult.initialStoredJ,0);
assert.equal(staticResult.remainingStoredJ,0);
assert.equal(staticResult.electricalJ,0);
assert.equal(staticResult.meanCirculationM3S,0);
assert.equal(staticResult.maxFlowM3S,0);
assert.equal(staticResult.powerInputAfterStartJ,0);
assert.ok(blank.pressure.every(x=>x===0));
const highPressure=buildPassiveRing(membrane,{mode:'uniform',basePressurePa:4e7});
advancePassiveRing(highPressure,700);
assert.equal(passiveSnapshot(highPressure).maxFlowM3S,0,
 'Raising uniform background pressure should not spontaneously pump liquid');
const pulse=buildPassiveRing(membrane,{mode:'pulse'});
assert.ok(pulse.initialEnergyJ>0);
const startMass=pulse.totalMassPressureM3;
const captured=[];
for(let n=0;n<1200;n++){
 advancePassiveRing(pulse,1);
 if(n%180===0)captured.push(passiveSnapshot(pulse));
}
const out=passiveSnapshot(pulse);
assert.ok(out.maxFlowM3S>0,'Initial pressure disturbance actually propagates');
assert.ok(out.remainingStoredJ<out.initialStoredJ,'Positive drag must dissipate energy');
assert.ok(out.viscousHeatJ>0);
assert.ok(out.electricalJ>=0);
assert.ok(out.powerInputAfterStartJ===0);
assert.ok(Math.abs(out.closureRelative)<1e-5,'Energy balance must close after absorption');
assert.ok(out.remainingStoredJ+out.viscousHeatJ+out.electricalJ+out.mhdJouleHeatJ
 <=out.initialStoredJ*(1+1e-7));
almost(pulse.pressure.reduce((sum,p,i)=>sum+p*pulse.C[i],0),startMass,1e-14);
assert.ok(captured.some(s=>s.pressurePerturbationPa[12]!==captured[0].pressurePerturbationPa[12]),
 'Initially localized pressure must evolve');
const directional=new Uint8Array(7*7*7);
for(let z=0;z<7;z++)for(let x=2;x<7;x++)directional[z*49+x]=1;
const mapped=buildPassiveRing({n:7,layers:7,mask:directional,supported:false},{segments:56,mode:'uniform'});
assert.ok(mapped.occupancy[0]<mapped.occupancy[20], 'V10 original Y-normal cross-section should constrain first torus arc');
const noSource=buildPassiveRing(null,{mode:'pulse'});
assert.equal(noSource.sourceMask,false);
const withSource=buildPassiveRing(membrane,{mode:'pulse'});
assert.ok(withSource.sourceMask);
assert.ok(withSource.sourceLabel.includes('V10'));
assert.notDeepEqual(Array.from(noSource.occupancy),Array.from(withSource.occupancy),
 'Exact 3D source material must modify the actual 1D acoustic circuit');
const conductive=buildPassiveRing(membrane,{mode:'pulse',material:'galinstan',fieldTesla:.75});
advancePassiveRing(conductive,900);
const metal=passiveSnapshot(conductive);
assert.ok(metal.electricalJ>0,'Only kinetic/acoustic energy can be harvested');
assert.ok(metal.electricalJ<metal.initialStoredJ);
assert.ok(metal.remainingStoredJ<metal.initialStoredJ);
assert.ok(Math.abs(metal.closureRelative)<1e-5);
const noB=buildPassiveRing(membrane,{mode:'pulse',material:'galinstan',fieldTesla:0});
advancePassiveRing(noB,900);
assert.equal(noB.electricalJ,0,'Without magnetic field there is no generator load power');
assert.ok(passiveSnapshot(noB).remainingStoredJ>=metal.remainingStoredJ,
 'Additional magnetic load should not generate fluid energy');
assert.throws(()=>buildPassiveRing(null,{mode:'other'}),/pressure mode/);
assert.throws(()=>buildPassiveRing(null,{initialPulsePa:1e7}),/Bad fluid/);
console.log('PASS passive static-pressure, wave transport, exact V10 geometry, energy closure and MHD back-reaction',JSON.stringify({
 source:membrane.source,
 uniformFlowM3S:staticResult.maxFlowM3S,
 pulsedFlowM3S:out.maxFlowM3S,
 initialEnergyJ:out.initialStoredJ,
 heatJ:out.viscousHeatJ,
 conductivityEnergyJ:metal.electricalJ,
 energyResidual:out.closureRelative,
 sourceChangedCrossSections:true
},null,2));
