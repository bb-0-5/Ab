import assert from 'node:assert/strict';
const messages=[];
globalThis.postMessage=x=>{messages.push(x)};
await import('../public/membrane-worker.mjs');
assert.equal(messages[0]?.type,'ready');
globalThis.onmessage({data:{type:'start'}});
for(let i=0;i<750;i++){
 if(messages.some(x=>x.type==='complete'||x.type==='error'))break;
 await new Promise(ok=>setTimeout(ok,25));
}
const errors=messages.filter(x=>x.type==='error');
assert.equal(errors.length,0,JSON.stringify(errors));
const complete=messages.find(x=>x.type==='complete');
assert.ok(complete,'bounded automatic campaign must terminate');
assert.ok(complete.ranking.length>=7,'open + 6 masks');
const open=complete.ranking[0];
assert.equal(open.name,'Open void reference');
assert.ok(open.flowM3S>0);
assert.ok(complete.ranking.every(r=>r.flowM3S<=open.flowM3S*(1+1e-8)),'no geometry can beat unconstrained reference with identical bonds');
if(complete.winner){
 assert.ok(complete.winner.meetsTarget);
 assert.ok(complete.winner.solidFraction>=.25&&complete.winner.solidFraction<=.75);
}
assert.ok(messages.some(x=>x.type==='progress'&&x.current?.pressure?.length),'must display computed pressure while screening');
assert.ok(messages.some(x=>x.type==='dye-step'&&x.transport?.concentration?.length),'must show time-stepped computed dye, not drawn random motion');
assert.ok(complete.transport?.step>=150,'chosen geometry should retain chronological final state');
assert.ok(complete.ranking.slice(1).some(x=>x.chronologicalSteps>0),'candidate results have time-domain evidence');
console.log('PASS campaign', {trials:complete.ranking.length,winner:complete.winner?.name||'no feasible',referenceQ:open.flowM3S,accepted:complete.ranking.filter(x=>x.meetsTarget).length});
