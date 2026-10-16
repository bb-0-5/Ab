import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../public/_worker.js';
const got=[];
const env={ASSETS:{async fetch(req){
 const path=new URL(req.url).pathname;got.push(path);
 return new Response('built:'+path,{status:200,headers:{'Content-Type':'text/html'}});
}}};
for(const path of ['/','/index.html','/simulator','/simulator.html',
 '/toroidal-iris.html','/toroidal-iris-view.mjs','/toroidal-iris-stack.mjs',
 '/membrane.html','/fluid.html']){
 const response=await worker.fetch(new Request('https://abovebound.org'+path),env);
 assert.equal(response.status,200,'Restore '+path);
 const expected=path==='/simulator.html'||path==='/simulator'?'built:/':'built:'+path;
 assert.equal(await response.text(),expected);
 assert.match(response.headers.get('Cache-Control'),/no-store/);
}
assert.ok(got.includes('/'),'old simulator must be served from true Vite index');
const other=await worker.fetch(new Request('https://abovebound.org/assets/app-1234.js'),env);
assert.equal(other.status,200);
assert.equal(other.headers.get('Cache-Control'),null,'hash-named bundles can cache');
const page=readFileSync(new URL('../index.html',import.meta.url),'utf8');
assert.match(page,/src\/main.tsx/,'Do not replace original V0–V13 React app');
assert.match(page,/toroidal-iris.html/,'Make new engineering lab discoverable');
const lab=readFileSync(new URL('../public/toroidal-iris.html',import.meta.url),'utf8');
assert.match(lab,/toroidal-iris-view.mjs/);
assert.match(lab,/ORIGINAL V0–V13/);
console.log('Restored original AboveBound root plus new MHD iris workbench routes PASS');
