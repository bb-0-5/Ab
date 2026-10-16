// AboveBound intentionally offline at the owner's request. Source remains intact.
const HTML = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>404 — AboveBound</title><style>html{background:#111;color:#eee;font:16px system-ui,sans-serif}body{min-height:90vh;display:grid;place-items:center;margin:0}main{text-align:center}h1{font-size:64px;margin:0 0 8px}p{opacity:.75}</style></head><body><main><h1>404</h1><p>AboveBound is offline.</p></main></body></html>';
export default {
 async fetch(request){
  return new Response(request.method==='HEAD'?null:HTML,{
   status:404,headers:{
    'Content-Type':'text/html; charset=utf-8',
    'Cache-Control':'no-store, max-age=0, must-revalidate',
    'Pragma':'no-cache',
    'X-Robots-Tag':'noindex, nofollow, noarchive',
    'X-AboveBound-Status':'offline'
   }
  });
 }
};
