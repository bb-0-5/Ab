import assert from 'node:assert/strict';

// Integration-test the ACTUAL public Web Worker module in a tiny self shim.
// No API server, browser DOM, AWS, Supabase service key or external weather
// call is permitted by this worker.
type Message={id:number;kind:string;mode?:string;result?:any;message?:string;error?:string};
const messages:Message[]=[];
const fakeSelf:{onmessage:((event:{data:any})=>void)|null;postMessage:(value:Message)=>void}={
 onmessage:null,postMessage:(value)=>{messages.push(value)},
};
(globalThis as any).self=fakeSelf;
await import('../src/local/compute.worker');
assert.ok(fakeSelf.onmessage,'Worker must install local-only message handler.');
function send(data:Record<string,unknown>){
 messages.length=0;
 fakeSelf.onmessage!({data});
 const last=messages.at(-1);
 assert.ok(last,`Worker did not respond to ${data.mode}`);
 assert.equal(last.id,data.id);
 assert.equal(last.kind,'result',last.error);
 return last.result!;
}
const rf=send({id:1,mode:'circuits',frequencyMHz:100,sourceOhms:50,loadOhms:100});
assert.ok(rf.best.centerDeliveredPowerFraction>=0&&rf.best.centerDeliveredPowerFraction<=1);
assert.ok(rf.microstripExample.predictedImpedanceOhms>0);
const chem=send({id:2,mode:'chemistry',minimumAcceptedFraction:.6});
assert.ok(chem.gate.targetPerInput<=chem.baseline.targetPerInput+.0001);
const membrane=send({id:10,mode:'membrane',task:'heat_spreader',
 condition:{medium:'air',temperatureK:295,pressurePa:101325,flowSpeedMs:2}});
assert.ok(membrane.selected?.thermalConductivityWmK>0);
assert.ok(membrane.discoveries.some((x:any)=>x.kind==='membrane_need'));
const hot=send({id:11,mode:'membrane',task:'flow_membrane',
 condition:{medium:'vacuum',temperatureK:5000,pressurePa:.001,flowSpeedMs:0},
 discoveries:membrane.discoveries});
assert.equal(hot.selected,null);
assert.ok(hot.useCaseSweep.discoveriesTested>0);
const chemistry=send({id:12,mode:'chemistry',minimumAcceptedFraction:.5,
 condition:{medium:'air',temperatureK:295,pressurePa:101325,flowSpeedMs:2},
 timeS:3600,discoveries:membrane.discoveries});
assert.equal(chemistry.calibration,null,'No empirical model without uploaded known reaction yields.');
assert.ok(chemistry.discoveries.some((x:any)=>x.kind==='isotope_hypothesis'));
assert.ok(chemistry.matchedMembraneNeeds.length>0,
 'Membrane requirement must be handed to the chemistry/material search.');
const receiver=send({id:13,mode:'circuits',frequencyMHz:100,sourceOhms:50,loadOhms:100,
 discoveries:chemistry.discoveries});
assert.ok(receiver.crossDomain.some((x:any)=>x.domain==='circuits'&&x.status==='unsupported'),
 'Circuit simulator must test but not invent isotope electrical properties.');
const building=send({id:3,mode:'building',preset:'melbourne',
 areaM2:130,targetTempC:22,seed:1441});
assert.equal(building.seed,1441);
assert.ok(building.siteCandidates>400);
assert.ok(building.mechanicalCandidates>=48);
assert.ok(building.weather.mode==='preset_fitted_degree_days');
assert.ok(building.best===null||building.best.feasible);
assert.deepEqual(building,send({id:4,mode:'building',preset:'melbourne',
 areaM2:130,targetTempC:22,seed:1441}),'Identical local worker inputs must replay identically.');
const failure=(()=>{
 messages.length=0;
 fakeSelf.onmessage!({data:{id:5,mode:'circuits',frequencyMHz:-100,sourceOhms:50,loadOhms:100}});
 return messages.at(-1);
})();
assert.equal(failure?.kind,'error','Bad hardware inputs must not produce spurious recommendations.');
console.log(JSON.stringify({source:'device worker',rfPowerFraction:rf.best.centerDeliveredPowerFraction,
 electronicsTested:rf.tested,probabilityStatesTested:chem.candidatesTested,
 buildingShapesSampled:building.siteCandidates,airflowConfigurations:building.mechanicalCandidates,
 deterministic:true,remoteEndpointsNeeded:false},null,2));
