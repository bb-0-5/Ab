import assert from 'node:assert/strict';
import {engineCheckpoint} from '../src/lib/local_sim_checkpoint';

const items=new Map<string,string>();
const localStorage={
 getItem:(key:string)=>items.get(key)??null,
 setItem:(key:string,value:string)=>{items.set(key,value);},
};
Object.assign(globalThis,{localStorage});
const endpoint=new URL('https://abovebound.org/api/sim-state/v6');
const payload={flow:[1,3,5],persistence:'actual engine snapshot'};
const saved=engineCheckpoint(endpoint,{method:'POST',body:JSON.stringify({state:payload})},'test_user');
assert.equal(saved?.status,200);
assert.equal((await saved?.json()).mode,'browser_local');
const loaded=engineCheckpoint(endpoint,{method:'GET'},'test_user');
assert.deepEqual(await loaded?.json(),payload);
const other=engineCheckpoint(endpoint,{method:'GET'},'other_user');
assert.equal(await other?.json(),null,'checkpoints must not leak between workspaces');
const missing=engineCheckpoint(new URL('https://abovebound.org/api/not-simulated'),{method:'GET'},'test_user');
assert.equal(missing,null,'unrelated APIs must not return invented success');
assert.equal(engineCheckpoint(endpoint,{method:'POST',body:JSON.stringify({state:'a'.repeat(360_000)})},'test_user')?.status,413);
assert.equal(engineCheckpoint(endpoint,{method:'POST',body:JSON.stringify({})},'test_user')?.status,400);
assert.deepEqual(await engineCheckpoint(endpoint,{method:'GET'},'test_user')?.json(),payload,
 'oversize invalid writes must not overwrite a good checkpoint');
const historyUrl=new URL('https://abovebound.org/api/workspace');
const saveEvent=engineCheckpoint(new URL('https://abovebound.org/api/workspace/events'),
 {method:'POST',body:JSON.stringify({
  type:'manual_checkpoint',category:'thermal',version:'v6',
  summary:'Genuine V6 screenshot-less metrics checkpoint',stats:{efficiency:.5},
 })},'test_user');
assert.equal(saveEvent?.status,200);
const workspace=await engineCheckpoint(historyUrl,{method:'GET'},'test_user')?.json();
assert.equal(workspace.recordCount,2);
assert.deepEqual(workspace.savedVersions,['v6']);
assert.equal(workspace.records[0].version,'v6');
assert.equal(workspace.records[0].stats.efficiency,.5);
assert.equal((await engineCheckpoint(historyUrl,{method:'GET'},'other_user')?.json()).recordCount,0);
const signatureUrl=new URL('https://abovebound.org/api/novelty-check');
const observation=(who:string)=>
 engineCheckpoint(signatureUrl,{method:'POST',body:JSON.stringify({stateHash:'v6:flow:0.635'})},who);
const newSignature=await observation('test_user')?.json();
assert.equal(newSignature.unique,true);
assert.equal(newSignature.memorySize,1);
assert.equal(newSignature.mode,'browser_local_hashes_not_physical_novelty');
const duplicate=await observation('test_user')?.json();
assert.equal(duplicate.unique,false);
assert.equal(duplicate.memorySize,1);
assert.equal((await observation('other_user')?.json()).unique,true);
console.log('Original V0–V13 checkpoint save/load: real browser storage, isolation, size guard and error handling passed.');
