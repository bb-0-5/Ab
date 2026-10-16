import assert from 'node:assert/strict';
import worker from '../public/_worker.js';
const paths=['/','/index.html','/simulator','/simulator.html','/membrane.html',
'/passive-torus.html','/toroidal-iris.html','/slices.html','/fluid.html',
'/torus-v3.html','/membrane-worker.mjs','/toroidal-passive-pressure.mjs',
'/assets/sim.js','/api/test','/404.html','/random/deep/route'];
const env={ASSETS:{fetch(){throw Error('Offline site must never serve any asset')}}};
for(const path of paths)for(const method of ['GET','HEAD','POST']){
 const res=await worker.fetch(new Request('https://abovebound.org'+path,{method}),env);
 assert.equal(res.status,404,method+' '+path);
 assert.equal(res.headers.get('X-AboveBound-Status'),'offline');
 assert.match(res.headers.get('Cache-Control'),/no-store/);
 assert.match(res.headers.get('X-Robots-Tag'),/noindex/);
 const body=await res.text();
 if(method==='HEAD')assert.equal(body,'');
 else{assert.match(body,/404/);assert.match(body,/AboveBound is offline/);}
}
console.log('AboveBound retirement: HTTP 404 for all routes and assets PASS');
