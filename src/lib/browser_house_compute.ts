/**
 * Small transport shim for the original V12 tools. Their React UI and
 * /api/house request contract stay unchanged; computations run in a lazily
 * created browser worker, not on the render thread or a remote server.
 */
import type {HouseEndpoint} from './house_compute';

const BROWSER_HOUSE_ENDPOINTS:readonly HouseEndpoint[]=[
 '/api/house/optimize-site','/api/house/optimize-site-airflow',
 '/api/house/optimize-whole-system','/api/house/optimize-room',
 '/api/house/optimize-hvac-cycle','/api/house/optimize-adaptive-wall',
 '/api/house/existing-home-autopilot','/api/house/validation-report',
];

type Pending={resolve:(v:Response)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>};
type Message={id:number;ok:boolean;result?:unknown;error?:string};
let worker:Worker|null=null;
let serial=0;
const pending=new Map<number,Pending>();
const MAX_PENDING=8;
const WORKER_TIMEOUT_MS=90_000;
const httpJson=(body:unknown,status:number)=>new Response(JSON.stringify(body),{
 status,headers:{'Content-Type':'application/json','X-AboveBound-Compute':'browser-worker'},
});
const abortAll=(reason:string)=>{
 const all=[...pending.values()];
 pending.clear();
 worker?.terminate();
 worker=null;
 for(const p of all){clearTimeout(p.timer);p.reject(new Error(reason));}
};
const makeWorker=()=>{
 if(worker)return worker;
 const w=new Worker(new URL('./house_compute.worker.ts',import.meta.url),{type:'module'});
 w.onmessage=(ev:MessageEvent<Message>)=>{
  const {id,ok,result,error}=ev.data;
  const p=pending.get(id);
  if(!p)return;
  clearTimeout(p.timer);
  pending.delete(id);
  p.resolve(httpJson(ok?result:{error:error||'Numerical solver failed.'},ok?200:400));
 };
 w.onerror=e=>{
  abortAll('Local engineering worker stopped: '+(e.message||'unknown error'));
 };
 worker=w;
 return w;
};
export function browserHouseRequest(url:URL,init:RequestInit={}):Promise<Response>|null{
 if(typeof window==='undefined'||url.origin!==window.location.origin)return null;
 if(!BROWSER_HOUSE_ENDPOINTS.includes(url.pathname as HouseEndpoint))return null;
 const method=(init.method||'GET').toUpperCase();
 const supported= url.pathname==='/api/house/validation-report'?method==='GET':method==='POST';
 if(!supported)return Promise.resolve(httpJson({error:'Unsupported engineering request method.'},405));
 if(pending.size>=MAX_PENDING)
  return Promise.resolve(httpJson({error:'Device is already solving too many jobs.'},429));
 let body:unknown={};
 if(method==='POST'){
  try{
   if(typeof init.body!=='string'||init.body.length>160_000)
    return Promise.resolve(httpJson({error:'Request exceeds the local compute input size limit.'},413));
   body=JSON.parse(init.body);
  }catch{
   return Promise.resolve(httpJson({error:'Expected valid JSON engine inputs.'},400));
  }
 }
 return new Promise<Response>((resolve,reject)=>{
  try{
   const id=++serial;
   const w=makeWorker();
   const timer=setTimeout(()=>abortAll('Timed out while computing physical model on this device.'),WORKER_TIMEOUT_MS);
   pending.set(id,{resolve,reject,timer});
   w.postMessage({id,path:url.pathname,body});
  }catch(e){
   reject(e instanceof Error?e:new Error('Failed to start local engineering worker.'));
  }
 }).catch(e=>httpJson({error:e instanceof Error?e.message:String(e)},503));
}
