import assert from 'node:assert/strict';
import {optimizeImpedanceMatch} from '../src/local/impedance';
import {rfSpiceNetlist} from '../src/local/rf_spice';
for(const [source,load] of [[50,100],[100,50],[50,50]]){
 const report=optimizeImpedanceMatch({frequencyMHz:100,sourceOhms:source,loadOhms:load});
 const net=rfSpiceNetlist(report);
 assert.match(net,/V_SOURCE source 0 AC 1/);
 assert.match(net,/R_SOURCE source rf_in/);
 assert.match(net,/R_LOAD rf_out 0/);
 assert.match(net,/L_(SERIES|SHUNT)/);
 assert.match(net,/C_(SERIES|SHUNT)/);
 assert.match(net,/\.ac dec 100/);
 assert.match(net,/\.print ac vm\(rf_out\)/);
 const L=report.best.series.type==='L'?report.best.series:report.best.shunt;
 const C=report.best.series.type==='C'?report.best.series:report.best.shunt;
 assert.ok(net.includes(Number(L.value).toExponential(9)));
 assert.ok(net.includes(Number(C.value).toExponential(9)));
 const lines=net.split('\n');
 const branch=lines.find(x=>x.startsWith('R_SHUNT_ESR '));
 assert.ok(branch?.includes(report.best.topology==='series_then_shunt'?'rf_out':'rf_in'));
}
console.log('SPICE: matched topology, ESR, source/load, nominal parts and frequency sweep verified');
