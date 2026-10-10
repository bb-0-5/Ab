/**
 * Device-first result history + OPTIONAL Supabase backup. No anonymous
 * client-chosen workspace token is ever used as a database identity.
 *
 * Auth uses Supabase GoTrue's documented HTTPS endpoints (no privileged key,
 * backend or third-party SDK dependency). Only a Supabase PUBLISHABLE key
 * may appear in the web app; RLS must still be installed on the chosen
 * project's public.ab_computation_memory table before Cloud Sync is used.
 */
export interface MemoryEntry{
 id:string;
 savedAt:string;
 mode:'building'|'circuits'|'chemistry';
 label:string;
 input:Record<string,number|string>;
 result:unknown;
}
const LOCAL_KEY='abovebound.local-results.v1';
const CONFIG_KEY='abovebound.cloud-config.v1';
const SESSION_KEY='abovebound.supabase-session.v1';
const MAX_LOCAL=32;
export function loadDeviceResults():MemoryEntry[]{
 try{
  const raw=JSON.parse(localStorage.getItem(LOCAL_KEY)||'[]');
  return Array.isArray(raw)?raw.filter((r:MemoryEntry)=>r&&typeof r.id==='string').slice(0,MAX_LOCAL):[];
 }catch{return[];}
}
export function saveDeviceResult(item:MemoryEntry):MemoryEntry[]{
 const items=[item,...loadDeviceResults().filter(i=>i.id!==item.id)].slice(0,MAX_LOCAL);
 try{localStorage.setItem(LOCAL_KEY,JSON.stringify(items));}
 catch{
  try{localStorage.setItem(LOCAL_KEY,JSON.stringify(items.slice(0,8)));}catch{ /* browser may disable storage */ }
 }
 return items;
}
export type CloudConfig={url:string;publishableKey:string};
export function cloudConfig():CloudConfig|null{
 try{const x=JSON.parse(localStorage.getItem(CONFIG_KEY)||'null');
  if(typeof x?.url==='string' && typeof x?.publishableKey==='string')return x;
 }catch{/* no configuration */}return null;
}
export function configureCloud(url:string,publishableKey:string){
 const clean=url.trim().replace(/\/+$/,'');
 const hostname=new URL(clean).hostname;
 if(new URL(clean).protocol!=='https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(hostname))
  throw Error('Use an HTTPS Supabase project URL such as https://project-ref.supabase.co.');
 if(!/^sb_publishable_[A-Za-z0-9_-]{8,}$/.test(publishableKey.trim()))
  throw Error('Use a Supabase PUBLISHABLE key only, never a service_role or secret key.');
 const cfg={url:clean,publishableKey:publishableKey.trim()};
 const previous=cloudConfig();
 localStorage.setItem(CONFIG_KEY,JSON.stringify(cfg));
 // Only changing projects/keys invalidates identity. Clicking Connect again
 // with an unchanged project MUST NOT create a fresh, unrecoverable anonymous
 // account and orphan its previously saved reports.
 if(previous?.url!==cfg.url||previous?.publishableKey!==cfg.publishableKey)
  localStorage.removeItem(SESSION_KEY);
 return cfg;
}
type Session={access_token:string;refresh_token:string;expires_at:number;user:{id:string}};
function readSession():Session|null{
 try{const s=JSON.parse(localStorage.getItem(SESSION_KEY)||'null');
  return s&&typeof s.access_token==='string'&&typeof s.refresh_token==='string'
    &&typeof s.user?.id==='string'&&Number.isFinite(s.expires_at)?s:null;
 }catch{return null;}
}
function saveSession(payload:any):Session{
 if(typeof payload?.access_token!=='string'||typeof payload?.refresh_token!=='string'
   ||typeof payload?.user?.id!=='string')throw Error('Supabase did not return a usable session.');
 const s:Session={access_token:payload.access_token,refresh_token:payload.refresh_token,
  expires_at:Math.floor(Date.now()/1000)+Number(payload.expires_in||3600),user:{id:payload.user.id}};
 localStorage.setItem(SESSION_KEY,JSON.stringify(s));return s;
}
async function authRequest(cfg:CloudConfig,path:string,body:unknown){
 const response=await fetch(cfg.url+'/auth/v1/'+path,{
  method:'POST',headers:{'Content-Type':'application/json',apikey:cfg.publishableKey},
  body:JSON.stringify(body)});
 const payload=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(payload.msg||payload.error_description||payload.message||
  `Supabase authentication failed (${response.status}).`);
 return payload;
}
async function sessionForRequest(cfg:CloudConfig,create=false):Promise<Session|null>{
 const previous=readSession();
 if(previous && previous.expires_at>Date.now()/1000+60)return previous;
 if(previous){
  try{return saveSession(await authRequest(cfg,'token?grant_type=refresh_token',{refresh_token:previous.refresh_token}));}
  catch{localStorage.removeItem(SESSION_KEY);if(!create)return null;}
 }
 if(!create)return null;
 // GoTrue anonymous sign-up: empty body when project has anonymous logins enabled.
 return saveSession(await authRequest(cfg,'signup',{}));
}
export async function connectCloud():Promise<string>{
 const cfg=cloudConfig();if(!cfg)throw Error('Set the Supabase project URL and publishable key first.');
 const session=await sessionForRequest(cfg,true);
 if(!session)throw Error('No cloud session.');
 return session.user.id;
}
async function rest(path:string,init:RequestInit,create=false){
 const cfg=cloudConfig();if(!cfg)throw Error('Cloud sync is not configured.');
 const session=await sessionForRequest(cfg,create);
 if(!session)throw Error('Cloud sync is not signed in on this device.');
 const response=await fetch(cfg.url+'/rest/v1/'+path,{
  ...init,
  headers:{apikey:cfg.publishableKey,Authorization:`Bearer ${session.access_token}`,
   'Content-Type':'application/json',...init.headers},
 });
 if(!response.ok)throw Error(`Cloud sync failed (${response.status}): ${(await response.text()).slice(0,250)}`);
 return response;
}
function compact(entry:MemoryEntry){
 // Keep summary only in Supabase, never upload complete simulation arrays,
 // site maps or hourly weather data.
 const result=entry.result as any;
 const scalarResult=entry.mode==='building'?{
  best:result.best,
  location:result.location,weather:result.weather,
  siteCandidates:result.siteCandidates,mechanicalCandidates:result.mechanicalCandidates,
  comparisonSupported:result.comparisonSupported,qualifiesAsImprovement:result.qualifiesAsImprovement,
  savingsVsBaselineKWh:result.savingsVsBaselineKWh,
 }:entry.mode==='circuits'?{best:result.best,requested:result.requested,
  baselineDeliveredPowerFraction:result.baselineDeliveredPowerFraction,tested:result.tested}
 :{baseline:result.baseline,gate:result.gate,candidatesTested:result.candidatesTested};
 if(entry.mode==='building'&&scalarResult.best)scalarResult.best={...scalarResult.best,geometry:undefined};
 return {...entry,result:scalarResult};
}
export async function uploadCloud(entry:MemoryEntry):Promise<void>{
 const compacted=compact(entry);
 if(JSON.stringify(compacted).length>12000)throw Error('Result is too large for cloud summary.');
 const cfg=cloudConfig();if(!cfg)throw Error('No Supabase project selected.');
 const session=await sessionForRequest(cfg);if(!session)throw Error('Connect Cloud Sync before uploading.');
 await rest('ab_computation_memory?on_conflict=id',{
  method:'POST',headers:{Prefer:'resolution=merge-duplicates'},
  body:JSON.stringify([{id:entry.id,user_id:session.user.id,kind:entry.mode,
   title:entry.label,payload:compacted,saved_at:entry.savedAt}])
 });
}
export async function readCloud():Promise<MemoryEntry[]>{
 const response=await rest('ab_computation_memory?select=payload&order=saved_at.desc&limit=32',{method:'GET'});
 const rows=await response.json();
 return (rows as {payload:MemoryEntry}[]).map(row=>row.payload);
}
export function isCloudConnected():boolean{return !!(cloudConfig()&&readSession());}
