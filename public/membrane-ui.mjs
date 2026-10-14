/** Render measured NODE pressures; show exact V10 source and same-grid numerical evidence. */
import {readSelectedV10PressureGeometry,storePressureFeedback} from './v10-pressure-handoff.mjs';
const $=id=>document.getElementById(id);
const main=$('mainCanvas'),stack=$('stackCanvas'),ctx=main.getContext('2d'),ctx2=stack.getContext('2d');
const worker=new Worker('/membrane-worker.mjs?v=constraint-steering-r7',{type:'module'});
const originalV10=readSelectedV10PressureGeometry();
let current=null,ranking=[],winner=null,last=null,inspected=null,paused=false,complete=false;
let display='pressure',frames=0,layout=[];
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const fmt=(x,digits=2)=>Number.isFinite(x)?x.toFixed(digits):'—';
function fit(canvas){const rect=canvas.getBoundingClientRect(),d=Math.min(2,window.devicePixelRatio||1);const w=Math.max(1,Math.round(rect.width*d)),h=Math.max(1,Math.round(rect.height*d));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}return{w,h};}
function palette(t){t=clamp(t,0,1);const stops=[[12,46,83],[24,109,155],[36,175,184],[145,222,184],[248,206,104],[252,114,61]];const a=Math.min(4,Math.floor(t*5)),f=t*5-a;const c=stops[a].map((q,i)=>Math.round(q*(1-f)+stops[a+1][i]*f));return `rgb(${c.join(',')})`;}
function cell(n,i,j,k){return (k*n+j)*n+i;}
function maxFlux(dat){let max=0;for(const a of [dat.fluxX,dat.fluxY,dat.fluxZ])for(const q of a)max=Math.max(max,Math.abs(q));return max;}
function renderPlane(c,dat,k,x,y,s,details=false){
 const n=dat.n,cellSize=s/n,fmax=maxFlux(dat);
 for(let j=0;j<n;j++)for(let i=0;i<n;i++){
  const q=cell(n,i,j,k),px=x+i*cellSize,py=y+(n-1-j)*cellSize;
  c.fillStyle=dat.solid[q]?'#061016':!dat.active[q]?'#29323c':display==='pressure'?palette(dat.pressure[q]):palette(Math.abs(dat.fluxY[q])/Math.max(fmax,1e-25));
  c.fillRect(px,py,cellSize+0.3,cellSize+0.3);
 }
 if(!details){c.strokeStyle='#a9eada77';c.lineWidth=1;c.strokeRect(x,y,s,s);return;}
 const step=Math.max(1,Math.ceil(n/11));
 for(let j=0;j<n;j+=step)for(let i=0;i<n;i+=step){
  const q=cell(n,i,j,k);if(!dat.active[q])continue;
  const vx=(dat.fluxX[q]||0),vy=(dat.fluxY[q]||0),v=Math.hypot(vx,vy);
  const cx=x+(i+.5)*cellSize,cy=y+(n-j-.5)*cellSize;
  if(v>fmax*.035){
   const len=cellSize*.47,dX=len*vx/v,dY=-len*vy/v;
   c.strokeStyle='#f1fff0df';c.fillStyle='#f1fff0df';c.lineWidth=Math.max(1,s/420);
   c.beginPath();c.moveTo(cx-dX*.45,cy-dY*.45);c.lineTo(cx+dX*.55,cy+dY*.55);c.stroke();
   const th=Math.atan2(dY,dX);c.beginPath();c.moveTo(cx+dX*.55,cy+dY*.55);
   c.lineTo(cx+dX*.55-4*Math.cos(th-.55),cy+dY*.55-4*Math.sin(th-.55));
   c.lineTo(cx+dX*.55-4*Math.cos(th+.55),cy+dY*.55-4*Math.sin(th+.55));c.fill();
  }
  const wz=dat.fluxZ[q]||0;
  if(Math.abs(wz)>fmax*.055){c.beginPath();c.arc(cx,cy,Math.max(1.7,s/150),0,Math.PI*2);
   c.strokeStyle=wz>0?'#ffdc98':'#9bf7ff';c.fillStyle=wz>0?'#ffdc98':'#9bf7ff';
   c.lineWidth=Math.max(1,s/460);if(wz>0)c.fill();else c.stroke();}
 }
 c.strokeStyle='#c3fae2aa';c.lineWidth=Math.max(1,s/400);c.strokeRect(x,y,s,s);
}
function paint(){
 const {w,h}=fit(main),{w:sw,h:sh}=fit(stack);
 ctx.fillStyle='#071822';ctx.fillRect(0,0,w,h);ctx2.fillStyle='#071822';ctx2.fillRect(0,0,sw,sh);
 if(!current){
  ctx.font=`${Math.max(12,w*.036)}px ui-monospace,monospace`;ctx.textAlign='center';ctx.fillStyle='#a5dbd0';ctx.fillText('SOLVING INITIAL REFERENCE FLOW',w/2,h/2);return;}
 const selected=inspected===null?Math.floor(current.layers/2):clamp(inspected,0,current.layers-1);
 const size=Math.min(w*.83,h*.83),x=(w-size)/2,y=(h-size)/2;
 renderPlane(ctx,current,selected,x,y,size,true);
 ctx.font=`${Math.max(12,Math.min(17,w*.027))}px ui-monospace,monospace`;
 ctx.fillStyle='#d3f5ea';ctx.textAlign='left';ctx.fillText(`z = ${selected+1}/${current.layers} · PRESSURE ${display==='pressure'?'FIELD':'FLOW'} `,Math.max(6,x),Math.min(h-8,y+size+25));
 const gap=Math.min(16,sw*.02),cols=3,rows=Math.ceil(current.layers/cols),tile=Math.min((sw-44-gap*2)/cols,(sh-60-gap*(rows-1))/rows);
 const left=(sw-cols*tile-2*gap)/2,top=(sh-rows*tile-gap*(rows-1))/2;
 layout=[];
 for(let k=0;k<current.layers;k++){
  const px=left+(k%cols)*(tile+gap),py=top+Math.floor(k/cols)*(tile+gap);
  renderPlane(ctx2,current,k,px,py,tile);
  ctx2.strokeStyle=k===selected?'#eaffbd':'#578f89';ctx2.lineWidth=k===selected?3:1.2;ctx2.strokeRect(px-2,py-2,tile+4,tile+4);
  ctx2.fillStyle='#fff';ctx2.font=`bold ${Math.max(10,Math.min(14,sw*.025))}px ui-monospace,monospace`;
  ctx2.fillText(`z${k+1}`,px+6,py+15);layout.push({x:px,y:py,s:tile,k});
 }
 $('focusLabel').textContent=`SLICE ${selected+1} / ${current.layers}`;
 $('stackMeta').textContent=`${current.layers} PRESSURE-COUPLED XY SHEETS`;
}
function table(){const root=$('ranking');root.replaceChildren();
 const head=document.createElement('div');head.className='head';
 for(const label of ['GEOMETRY','FLOW / OPEN','SOLID','REQUIRED ΔP']){const item=document.createElement('span');item.textContent=label;head.append(item)}root.append(head);
 for(const r of ranking){const row=document.createElement('div');row.className=r.config&&winner?.name===r.name?'winner':'';
 const texts=[r.name,r.converged?`${fmt((r.relativeOpen||0)*100,1)}%`:'SOLVER FAILED',`${fmt(r.solidFraction*100,0)}%`,r.pressureAtTargetPa===null?'BLOCKED':`${fmt(r.pressureAtTargetPa,3)} Pa`];
 for(const [i,t]of texts.entries()){const el=document.createElement('span');el.textContent=t;if(i===0)el.title=r.reason;row.append(el)}root.append(row);}
}
function showOriginal(status){
 const el=$('originalV10');if(el)el.textContent=status;
}
showOriginal(originalV10?
 'ORIGINAL V10 MASK LOADED · '+originalV10.n+'³ · '+originalV10.receipt.config.tpms+
 ' · CHECKSUM '+originalV10.receipt.checksum+' · VERIFYING MATCHED REFERENCE':
 'NO CURRENT ORIGINAL V10 MASK · screening generated configurations (run Original V0–V13 to export it)');
function show(status){$('status').textContent=status;}
function renderUpdate(msg){
 if(msg.current){current=msg.current;inspected=null;}
 if(msg.ranking){ranking=msg.ranking;table();}
 if('winner' in msg)winner=msg.winner;
 const r=msg.focus;
 if(r){$('chosen').textContent=r.name;
  $('speed').textContent=`Q ${r.flowM3S.toExponential(3)} m³/s · κ ${r.permeabilityM2.toExponential(2)} m²`;
  $('divergence').textContent=`MASS BALANCE ${r.flowM3S>0?fmt(r.imbalanceM3S/r.flowM3S*100,4)+'%':'NO THROUGH-FLOW'} · ${r.iterations} SOLVER SWEEPS`;
  $('time').textContent=`SOLID ${fmt(r.solidFraction*100,0)}% · ${r.assessment}`;
  $('flowEvidence').textContent=r.reason;
 }
 $('progress').textContent=msg.message||`${msg.stage||'SCREENING'} · ${msg.done||0}/${msg.total||'?'} tested · ${msg.reason||'Pressure solved, constraints checked'}.`;
 $('frontProgress').textContent=$('progress').textContent;
 const status=msg.type==='complete'?'SEARCH FINISHED':msg.type==='progress'?'SOLVING PHYSICAL CONSTRAINTS':'COMPUTING';
 show(status);
 paint();
}
worker.onmessage=e=>{
 const data=e.data||{};
 if(data.type==='ready'){
  // Transfer locally stored original V10 geometry before launching the solver.
  worker.postMessage({type:'source-v10',receipt:originalV10?.receipt||null});
  worker.postMessage({type:'start'});show('RUNNING · LOCAL PRESSURE SOLVER');
 }else if(data.type==='source-progress'){showOriginal(data.message);
 }else if(data.type==='source-evidence'){
  const x=data.source;
  showOriginal('ORIGINAL V10 '+x.resolution+'³ REAL VOXELS · '+x.config.tpms+
    ' · '+fmt(x.relativeOpen*100,2)+'% OF SAME-GRID OPEN FLOW · '+x.assessment+
    ' · '+x.verdict);
  if(originalV10&&originalV10.receipt.checksum===x.checksum)
    storePressureFeedback(originalV10.receipt,{flowM3S:x.flowM3S,relativeOpen:x.relativeOpen,
      valid:x.valid,meetsTarget:x.meetsTarget,reason:x.verdict,
      pressureAtTargetPa:x.pressureAtTargetPa});
  renderUpdate({type:'progress',current:data.current,
    stage:'ORIGINAL V10 VOXEL MASK EVALUATED',
    focus:{name:'ORIGINAL SELECTED V10 '+x.resolution+'³',flowM3S:x.flowM3S,
      permeabilityM2:data.current?.permeabilityM2||0,solidFraction:x.solidFraction,
      assessment:x.assessment,reason:x.verdict,imbalanceM3S:x.imbalanceM3S,
      iterations:data.current?.iterations||0}});
 }else if(data.type==='source-error'){
  showOriginal('ORIGINAL V10 HANDOFF INVALID · '+data.message+' · continuing generic sweep');
 }
 else if(data.type==='progress'||data.type==='complete'){renderUpdate(data);if(data.type==='complete'){complete=true;paused=false;$('run').textContent='↻ REPEAT SCREEN';}}
 else if(data.type==='decision'){$('frontProgress').textContent=data.message;}
 else if(data.type==='paused'){show('PAUSED · NO COMPUTATION');}
 else if(data.type==='resumed'){show('RESUMED · LOCAL PRESSURE SOLVER');}
 else if(data.type==='starting'){current=null;ranking=[];winner=null;inspected=null;complete=false;table();paint();show('STARTING BASELINE');}
 else if(data.type==='error'){show('MODEL ERROR');$('progress').textContent='NUMERICAL FAILURE: '+data.message;$('frontProgress').textContent=$('progress').textContent;}
};
worker.onerror=e=>{show('WORKER CRASH');$('progress').textContent=`Worker error: ${e.message}`;$('frontProgress').textContent=$('progress').textContent;};
$('run').onclick=()=>{if(complete){worker.postMessage({type:'reset'});complete=false;paused=false;$('run').textContent='Ⅱ PAUSE';return;}
 paused=!paused;worker.postMessage({type:paused?'pause':'resume'});$('run').textContent=paused?'▶ CONTINUE':'Ⅱ PAUSE';};
$('seed').onclick=()=>{worker.postMessage({type:'reset'});paused=false;complete=false;$('run').textContent='Ⅱ PAUSE';};
$('auto').onclick=()=>{inspected=null;paint();};
$('view').onclick=()=>{display=display==='pressure'?'flow':'pressure';$('view').textContent=display==='pressure'?'◉ SHOW SPEED':'◉ SHOW PRESSURE';paint();};
stack.addEventListener('pointerdown',e=>{const box=stack.getBoundingClientRect(),x=(e.clientX-box.left)*stack.width/box.width,y=(e.clientY-box.top)*stack.height/box.height;
 const hit=layout.find(r=>x>=r.x&&x<=r.x+r.s&&y>=r.y&&y<=r.y+r.s);if(hit){inspected=hit.k;paint();}});
new ResizeObserver(()=>paint()).observe(main);
new ResizeObserver(()=>paint()).observe(stack);
paint();
