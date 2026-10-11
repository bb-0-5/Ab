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
console.log('Original V0–V13 checkpoint save/load: real browser storage, isolation, size guard and error handling passed.');
