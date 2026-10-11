import {runHouseComputation,type HouseEndpoint} from './house_compute';

type Request={id:number;path:HouseEndpoint;body:unknown};
type Reply={id:number;ok:boolean;result?:unknown;error?:string};
self.onmessage=(event:MessageEvent<Request>)=>{
 const {id,path,body}=event.data;
 let reply:Reply;
 try{
  reply={id,ok:true,result:runHouseComputation(path,body)};
 }catch(e){
  reply={id,ok:false,error:e instanceof Error?e.message:'Engineering calculation failed'};
 }
 self.postMessage(reply);
};
