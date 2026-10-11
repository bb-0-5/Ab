/**
 * Local persistence adapter for the original V0–V13 engine checkpoints.
 * Static Pages has no Express /api/sim-state route. A 200 response means
 * bytes were actually saved to this browser; storage failures are errors.
 */
const MAX_CHARS=350_000;
const PREFIX='abovebound.engine-checkpoint.v1.';
const response=(value:unknown,status=200)=>new Response(JSON.stringify(value),{
 status,headers:{'content-type':'application/json','x-storage':'device-only'},
});
export function engineCheckpoint(
 url:URL,init:RequestInit,workspaceId:string,
):Response|null{
 const match=/^\/api\/sim-state\/([a-z0-9_-]{1,24})$/i.exec(url.pathname);
 if(!match)return null;
 const key=PREFIX+workspaceId+':'+match[1];
 const method=(init.method||'GET').toUpperCase();
 try{
  if(method==='GET'){
   const json=localStorage.getItem(key);
   return response(json===null?null:JSON.parse(json));
  }
  if(method!=='POST')return response({error:'Unsupported method'},405);
  if(typeof init.body!=='string'||init.body.length>MAX_CHARS+100)
   return response({error:'Engine checkpoint too large'},413);
  const parsed=JSON.parse(init.body) as {state?:unknown};
  if(!parsed||parsed.state==null)return response({error:'State missing'},400);
  const encoded=JSON.stringify(parsed.state);
  if(encoded.length>MAX_CHARS)return response({error:'Engine checkpoint exceeds local memory limit'},413);
  localStorage.setItem(key,encoded);
  return response({status:'saved',version:match[1],mode:'browser_local'});
 }catch(error){
  return response({error:error instanceof Error?error.message:'Device storage unavailable'},507);
 }
}
