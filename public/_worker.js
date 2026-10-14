// AboveBound static Cloudflare Pages: original V0–V13 preserved.
// The experiments change frequently; browsers should not reuse stale JS.
export default {
 async fetch(request,env){
   const url=new URL(request.url),response=await env.ASSETS.fetch(request);
   if (!/^\/(?:fluid|torus-v3|torus-visual|slices|slice-)/.test(url.pathname)) return response;
   const headers=new Headers(response.headers);
   headers.set('Cache-Control','no-store, max-age=0, must-revalidate');
   headers.set('Pragma','no-cache');
   return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
 }
};
