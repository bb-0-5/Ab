// AboveBound restored by owner request. Preserve ORIGINAL V0-V13 root app.
// Current engineering lab lives at /toroidal-iris.html; do not overwrite
// /simulator.html or mistake the new toroidal model for real validated CFD.
const release='iris-two-stack-20261016-r1';
function noCache(res){
 const h=new Headers(res.headers);
 h.set('Cache-Control','no-store, max-age=0, must-revalidate');
 h.set('X-AboveBound-Release',release);
 return new Response(res.body,{status:res.status,statusText:res.statusText,headers:h});
}
export default {
 async fetch(request,env){
  const u=new URL(request.url),path=u.pathname;
  if(path==='/simulator'||path==='/simulator.html'){
   // Fetch the built root Vite app directly from the static ASSETS binding.
   return noCache(await env.ASSETS.fetch(new Request(new URL('/',u),request)));
  }
  const response=await env.ASSETS.fetch(request);
  if(path==='/'||path==='/index.html'||path.endsWith('.html')||
    /^\/(?:toroidal-iris|toroidal-energy-budget|membrane|v10-)/.test(path))
   return noCache(response);
  return response;
 }
};
