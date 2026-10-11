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
 const method=(init.method||'GET').toUpperCase();
 if(url.pathname==='/api/workspace'||url.pathname==='/api/workspace/events'){
  const key=PREFIX+workspaceId+':workspace';
  try{
   const raw=localStorage.getItem(key);
   const saved=raw?JSON.parse(raw):{createdAt:Date.now(),updatedAt:Date.now(),records:[]};
   const records:Array<{id:string;timestamp:number;type:string;category?:string;
    version?:string;summary?:string;stats?:unknown;state?:unknown}>=
    Array.isArray(saved.records)?saved.records:[];
   if(url.pathname==='/api/workspace'&&method==='GET')
    return response({mode:'anonymous_first_party',createdAt:saved.createdAt,
     updatedAt:saved.updatedAt,recordCount:records.length,
     records:[...records].reverse(),
     savedVersions:Array.isArray(saved.savedVersions)?saved.savedVersions:[],
     sharedLearningRecords:0});
   if(url.pathname==='/api/workspace/events'&&method==='POST'){
    if(typeof init.body!=='string'||init.body.length>30_000)
     return response({error:'Workspace event too large'},413);
    const event=JSON.parse(init.body);
    if(typeof event?.type!=='string'||event.type.length>60)
     return response({error:'Invalid workspace event'},400);
    const item={id:crypto.randomUUID(),timestamp:Date.now(),
     type:event.type,category:event.category,version:event.version,
     summary:event.summary,stats:event.stats,state:event.state};
    const next={createdAt:saved.createdAt,updatedAt:Date.now(),
     savedVersions:saved.savedVersions||[],
     records:[...records,item].slice(-50)};
    localStorage.setItem(key,JSON.stringify(next));
    return response({status:'saved_locally',recordCount:next.records.length});
   }
   return response({error:'Unsupported workspace request'},405);
  }catch(error){
   return response({error:error instanceof Error?error.message:'Storage unavailable'},507);
  }
 }
 const match=/^\/api\/sim-state\/([a-z0-9_-]{1,24})$/i.exec(url.pathname);
 if(!match)return null;
 const key=PREFIX+workspaceId+':'+match[1];
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
  // The original workspace view lists only engine versions really saved.
  const logKey=PREFIX+workspaceId+':workspace';
  const prior=localStorage.getItem(logKey);
  const workspace=prior?JSON.parse(prior):{
   createdAt:Date.now(),updatedAt:Date.now(),records:[],savedVersions:[],
  };
  const versions=new Set<string>(workspace.savedVersions||[]);
  versions.add(match[1]);
  workspace.savedVersions=[...versions].slice(-16);
  workspace.updatedAt=Date.now();
  const rows=Array.isArray(workspace.records)?workspace.records:[];
  workspace.records=[...rows,{id:crypto.randomUUID(),timestamp:Date.now(),
   type:'simulation_checkpoint',category:'simulation',version:match[1],
   summary:'Saved original engine state on this device'}].slice(-50);
  localStorage.setItem(logKey,JSON.stringify(workspace));
  return response({status:'saved',version:match[1],mode:'browser_local'});
 }catch(error){
  return response({error:error instanceof Error?error.message:'Device storage unavailable'},507);
 }
}
