import {createSliceEngine,advanceSlices,snapshot} from './slice-engine.mjs?build=gears20261014b';
let engine=createSliceEngine(),running=false,timer=null,seed=0;
function tick(){if(!running)return;try{advanceSlices(engine,6);postMessage({type:'state',state:snapshot(engine)});}catch(e){running=false;postMessage({type:'error',message:String(e)})}}
function loop(){if(timer!==null)clearInterval(timer);timer=setInterval(tick,95)}
onmessage=e=>{
 const c=e.data?.type;
 if(c==='start'){if(!running){running=true;loop();tick();}}
 else if(c==='pause'){running=false;if(timer!==null){clearInterval(timer);timer=null}}
 else if(c==='reset'){seed=(seed+1)%3;engine=createSliceEngine({hotspot:seed});tick();}
 else if(c==='snapshot'){postMessage({type:'state',state:snapshot(engine)})}
};
postMessage({type:'ready',model:'2.5D Boussinesq numerical slices'});
