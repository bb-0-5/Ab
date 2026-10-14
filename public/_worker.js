// AboveBound Pages advanced-mode worker.
// The latest membrane/3D-flow laboratory is the PRIMARY site experience.
// Preserve the original V0–V13 application at /simulator.html.
// In particular, do not simply redirect /simulator.html to / (it would loop).
const RELEASE = 'v10-membrane-home-20261015-r2';
function noCache(response) {
  const headers=new Headers(response.headers);
  headers.set('Cache-Control','no-store, max-age=0, must-revalidate');
  headers.set('Pragma','no-cache');
  headers.set('X-AboveBound-Release',RELEASE);
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
export default {
  async fetch(request, env) {
    const url=new URL(request.url),path=url.pathname;
    if ((request.method==='GET'||request.method==='HEAD') &&
      (path==='/'||path==='/index.html')) {
      const target=new URL('/membrane.html',url);
      target.searchParams.set('release',RELEASE);
      return new Response(null,{status:302,headers:{
        Location:target.toString(),
        'Cache-Control':'no-store, max-age=0, must-revalidate',
        'X-AboveBound-Release':RELEASE
      }});
    }
    if (path==='/simulator.html'||path==='/simulator') {
      // ASSETS is the static asset binding, NOT this worker's fetch.
      // Reuse the built root Vite HTML so its hashed asset references work.
      const home=new URL('/',url);
      const original=await env.ASSETS.fetch(new Request(home,request));
      return noCache(original);
    }
    const response=await env.ASSETS.fetch(request);
    if (/^\/(?:fluid|torus-v3|torus-visual|slices|slice-|membrane|v10-membrane)/.test(path))
      return noCache(response);
    return response;
  }
};
