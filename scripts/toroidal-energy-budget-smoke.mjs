import assert from 'node:assert/strict';
import {FLUIDS,torusPath,whiteDarcy,flowAtSpeed,operatingPoint,phasedHead,
 simulatePhasedDrive,automaticToroidalAudit} from '../public/toroidal-energy-budget.mjs';
const near=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<=t*Math.max(1,Math.abs(a),Math.abs(b)),'Difference '+a+' vs '+b);
const base={majorRadiusM:.18,minorRadiusM:.045,ductDiameterM:.004,
 poloidalTurns:1,toroidalTurns:1,actuatorHeadPa:1500,pumpEfficiency:.75,
 driveParasiticW:.1,fluid:'galinstan'};
const circle=torusPath({...base,poloidalTurns:0});
near(circle.lengthM,2*Math.PI*(.18+.045));
near(circle.meanCurvatureRadiusM,.225);
assert.ok(torusPath({...base,poloidalTurns:1,toroidalTurns:2}).lengthM>circle.lengthM);
assert.throws(()=>torusPath({...base,majorRadiusM:.03}),/clearance/);
assert.throws(()=>torusPath({...base,poloidalTurns:99}),/winding/);
near(whiteDarcy(400,2,.02),64/400);
assert.ok(whiteDarcy(400,80,.02)>64/400);
assert.equal(whiteDarcy(4000,300,.02),null);
const off=operatingPoint({...base,magneticFieldTesla:0});
const mhd=operatingPoint({...base,magneticFieldTesla:.75});
const moreMhd=operatingPoint({...base,magneticFieldTesla:1.5});
assert.ok(off.flow.flowM3S>mhd.flow.flowM3S);
assert.ok(mhd.flow.flowM3S>moreMhd.flow.flowM3S);
assert.equal(off.flow.loadElectricalW,0);
assert.equal(off.flow.pressureMagneticPa,0);
assert.ok(mhd.flow.loadElectricalW>0);
assert.ok(mhd.flow.lorentzWorkW>=mhd.flow.loadElectricalW);
near(mhd.flow.lorentzWorkW,mhd.flow.loadElectricalW+mhd.flow.jouleHeatW,1e-8);
near(mhd.flow.pressureTotalPa,base.actuatorHeadPa,1e-8);
assert.ok(mhd.driveElectricalW>mhd.flow.loadElectricalW);
assert.ok(mhd.netElectricW<0);
assert.equal(mhd.validated,false);
assert.throws(()=>operatingPoint({...base,magneticFieldTesla:-1}),/magnetic/);
assert.throws(()=>operatingPoint({...base,pumpEfficiency:1.2}),/drive/);
assert.throws(()=>operatingPoint({...base,loadFactor:1}),/load/);
let f1=0,f4=0;for(let i=0;i<720;i++){
 f1+=phasedHead(2*Math.PI*i/720,1)/720;
 f4+=phasedHead(2*Math.PI*i/720,4)/720;
}
near(f1,1,2e-5);near(f4,1,2e-5);
const one=simulatePhasedDrive(mhd,{heads:1,hertz:3,periods:5});
const four=simulatePhasedDrive(mhd,{heads:4,hertz:3,periods:5});
assert.ok(four.flowRippleCV<one.flowRippleCV,
 'Multiple heads should reduce ripple at the same mean prescribed actuator pressure');
for(const result of [one,four]){
 assert.ok(result.meanFlowM3S>0);
 assert.ok(result.energy.actuatorHydraulicJ>0);
 assert.ok(Math.abs(result.energy.closureErrorJ)<.01*result.energy.actuatorHydraulicJ,
  'Inertance energy balance must close');
 near(result.energy.lorentzWorkJ,
   result.energy.electricalOutputJ+result.energy.jouleHeatJ,1e-8);
 assert.ok(result.history.length>60);
 assert.ok(result.history.every(x=>x.flowM3S>=0&&x.storedKineticJ>=0));
}
const rows=automaticToroidalAudit().rows;
assert.equal(rows.length,5);
assert.ok(rows.every(x=>x.validated===false&&x.netElectricW<0));
assert.ok(rows.some(x=>x.model.fluid.name===FLUIDS.water20C.name));
console.log('TOROIDAL ENERGY TESTS PASS',JSON.stringify({
 torusLengthM:mhd.geometry.lengthM,
 sameHeadFlowWithoutB:off.flow.flowM3S,
 flowWithB:mhd.flow.flowM3S,
 grossElectricW:mhd.flow.loadElectricalW,
 externalDriveW:mhd.driveElectricalW,
 netElectricW:mhd.netElectricW,
 oneHeadRipple:one.flowRippleCV,
 fourHeadRipple:four.flowRippleCV,
 energyResidualFraction:four.energy.closureErrorJ/four.energy.actuatorHydraulicJ
},null,2));
