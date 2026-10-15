import assert from 'node:assert/strict';
import worker from '../public/_worker.js';
const paths=['/','/index.html','/membrane.html','/simulator.html','/fluid.html',
 '/slices.html','/torus-v3.html','/membrane-worker.mjs','/v10-pressure-network.mjs',
 '/assets/fake.js','/404.html','/anything/nested'];
const env={ASSETS:{fetch(){throw Error('Offline site must never expose assets')}}};
for(const pathname of paths){
  for(const method of ['GET','HEAD']){
    const req=new Request('https://abovebound.org'+pathname,{method});
    const response=await worker.fetch(req,env);
    assert.equal(response.status,404,method+' '+pathname);
    assert.equal(response.headers.get('X-AboveBound-Status'),'offline');
    assert.match(response.headers.get('Cache-Control'),/no-store/);
    assert.match(response.headers.get('X-Robots-Tag'),/noindex/);
    const body=await response.text();
    if(method==='GET'){
      assert.match(body,/404/);
      assert.match(body,/AboveBound is offline/);
      assert.doesNotMatch(body,/script src=|iframe|fetch\(/i);
    }else assert.equal(body,'');
  }
}
console.log('Shutdown PASS: 404 at all known routes and assets, no app served');
