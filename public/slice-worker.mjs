import {createSliceEngine,advanceSlices,snapshot} from './slice-engine.mjs';
let engine=createSliceEngine(),running=false,timer=null,seed=0,blocked=false;
function tick(){if(!running||blocked)return;blocked=true;
  try{advanceSlices(engine,4);postMessage({type:'state',state:snapshot(engine)});}catch(e){running=false;clearInterval(timer);timer=null;postMessage({type:'error',message:String(e)})}finally{blocked=false}}
function loop(){if(timer!==null)clearInterval(timer);timer=setInterval(tick,110)}
onmessage=e=>{
 const command=e.data?.type;
 if(command==='start'){if(!running){running=true;loop();tick()}}
 else if(command==='pause'){running=false;if(timer!==null){clearInterval(timer);timer=null}}
 else if(command==='reset'){seed=(seed+1)%3;engine=createSliceEngine({hotspot:seed});postMessage({type:'state',state:snapshot(engine)})}
 else if(command==='snapshot'){postMessage({type:'state',state:snapshot(engine)})}
};
postMessage({type:'ready',model:'Experimental 3D MAC fluid velocity with pressure projection and out-of-plane flow'});
