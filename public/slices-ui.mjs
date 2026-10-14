const $=s=>document.getElementById(s);
const main=$('mainCanvas'),stack=$('stackCanvas'),a=main.getContext('2d',{alpha:false}),b=stack.getContext('2d',{alpha:false});
const worker=new Worker('/slice-worker.mjs?build=gears20261014b',{type:'module'});
let latest=null,paused=false,manualFocus=null,boxes=[],lastRender=0;
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const lerp=(a,b,t)=>a+(b-a)*t;
const colors=[[10,48,85],[18,91,152],[29,160,174],[90,212,159],[248,206,108],[251,101,64]];
function rgb(v){const x=clamp(v,0,1)*5,j=Math.min(4,Math.floor(x)),r=x-j;return `rgb(${colors[j].map((q,i)=>Math.round(lerp(q,colors[j+1][i],r))).join(',')})`}
function fit(c){const d=Math.min(2,window.devicePixelRatio||1),r=c.getBoundingClientRect(),w=Math.max(10,Math.round(r.width*d)),h=Math.max(10,Math.round(r.height*d));if(c.width!==w||c.height!==h){c.width=w;c.height=h}return {w,h}}
function drawSlice(ctx,data,n,x,y,s,arrows=false){
 const cell=s/n;for(let iy=0;iy<n;iy++)for(let ix=0;ix<n;ix++){
   const t=data.temperature[iy*n+ix];ctx.fillStyle=rgb(t);ctx.fillRect(x+ix*cell,y+(n-iy-1)*cell,cell+.5,cell+.5);
 }
 ctx.strokeStyle='#dbf3e94d';ctx.lineWidth=1;ctx.strokeRect(x+.5,y+.5,s-1,s-1);
 if(!arrows)return;
 const count=10;for(let gy=1;gy<count;gy++)for(let gx=1;gx<count;gx++){
  const ix=Math.min(n-1,Math.floor(gx*n/count)),iy=Math.min(n-1,Math.floor(gy*n/count));const q=iy*n+ix;
  const u=data.u[q],v=data.v[q],speed=Math.hypot(u,v);if(speed<.004)continue;
  const px=x+gx*s/count,py=y+(1-gy/count)*s,angle=Math.atan2(-v,u);
  const len=clamp(speed*33,3,13)*s/385,tx=px+Math.cos(angle)*len,ty=py+Math.sin(angle)*len;
  ctx.strokeStyle='rgba(244,255,247,.85)';ctx.fillStyle='rgba(244,255,247,.85)';ctx.lineWidth=Math.max(1,s/420);
  ctx.beginPath();ctx.moveTo(px-Math.cos(angle)*len*.38,py-Math.sin(angle)*len*.38);ctx.lineTo(tx,ty);ctx.stroke();
  ctx.beginPath();ctx.moveTo(tx,ty);ctx.lineTo(tx-Math.cos(angle-.53)*len*.38,ty-Math.sin(angle-.53)*len*.38);ctx.lineTo(tx-Math.cos(angle+.53)*len*.38,ty-Math.sin(angle+.53)*len*.38);ctx.fill();
 }
}
function mainCanvas(){const {w,h}=fit(main),ctx=a;ctx.fillStyle='#08171e';ctx.fillRect(0,0,w,h);
 if(!latest)return;const n=latest.n,actual=manualFocus??latest.evidence.focus;
 const slice=latest.slices[actual];const s=Math.min(w*.78,h*.86);const x=(w-s)/2,y=(h-s)/2;
 drawSlice(ctx,slice,n,x,y,s,true);
 const delta=(actual-latest.evidence.focus)/(latest.layers-1);
 ctx.fillStyle='#a3d5ca';ctx.font=`${Math.max(11,Math.round(w/52))}px ui-monospace,monospace`;
 ctx.fillText(`z = ${(actual/(latest.layers-1)).toFixed(2)}   Δfocus = ${delta.toFixed(2)}`,Math.max(10,x),Math.min(h-12,y+s+24));
 $('focusLabel').textContent=`SLICE ${actual+1}/${latest.layers} ${manualFocus===null?'· AUTO':'· INSPECT'}`;
 $('sliceMeta').textContent=`Z = ${(actual/(latest.layers-1)).toFixed(2)} · PHYSICAL GRID ${n}²`;
}
function miniTile(ctx,slice,n,x,y,s){const cell=s/n;for(let iy=0;iy<n;iy++)for(let ix=0;ix<n;ix++){
 ctx.fillStyle=rgb(slice.temperature[iy*n+ix]);ctx.fillRect(x+ix*cell,y+(n-iy-1)*cell,cell+.8,cell+.8);
}}
function stackCanvas(){const {w,h}=fit(stack),ctx=b;ctx.fillStyle='#08171e';ctx.fillRect(0,0,w,h);boxes=[];if(!latest)return;
 const {layers,n,evidence}=latest,focus=evidence.focus,inspected=manualFocus??focus;
 const inset=w*.06,left=inset,top=h*.18,gap=Math.min(15,w*.022),cols=layers>9?4:3,rows=Math.ceil(layers/cols);
 const tile=Math.min((w-2*left-gap*(cols-1))/cols,(h-top-h*.095-gap*(rows-1))/(rows));
 const rowTotal=tile*cols+gap*(cols-1),offset=(w-rowTotal)/2;
 const maxScore=Math.max(1e-12,...evidence.priority.map(q=>q.score));
 // An actual 3-D slab's adjacency topology shown as directed dependencies.
 for(let k=0;k<layers-1;k++){
   const col=k%cols,row=Math.floor(k/cols),nextCol=(k+1)%cols,nextRow=Math.floor((k+1)/cols);
   const x1=offset+col*(tile+gap)+tile/2,y1=top+row*(tile+gap)+tile/2;
   const x2=offset+nextCol*(tile+gap)+tile/2,y2=top+nextRow*(tile+gap)+tile/2;
   ctx.strokeStyle='rgba(122,240,198,.34)';ctx.lineWidth=Math.max(1,w/720);ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
 }
 for(let k=0;k<layers;k++){
  const col=k%cols,row=Math.floor(k/cols),x=offset+col*(tile+gap),y=top+row*(tile+gap),info=evidence.priority[k];
  miniTile(ctx,latest.slices[k],n,x,y,tile);
  const selected=k===inspected;ctx.strokeStyle=selected?'#f7f7d2':k===focus?'#60fac6':'#254851';ctx.lineWidth=selected?3:1;ctx.strokeRect(x-2,y-2,tile+4,tile+4);
  ctx.fillStyle='rgba(4,16,20,.87)';ctx.fillRect(x+2,y+2,Math.max(47,tile*.38),22);
  ctx.fillStyle=selected?'#fff3ad':'#d2ede9';ctx.font=`bold ${Math.max(10,Math.min(13,tile*.14))}px ui-monospace,monospace`;ctx.fillText(`z${String(k).padStart(2,'0')}`,x+6,y+17);
  ctx.fillStyle='#d6f5e9';ctx.font=`${Math.max(9,Math.min(12,tile*.115))}px ui-monospace,monospace`;ctx.fillText(`d ${info.distance} · ${Math.round(info.score/maxScore*100)}%`,x+3,y+tile-6);
  boxes.push({x,y,s:tile,k});
 }
 $('stackMeta').textContent=`${layers} COUPLED PLANES · ΔZ ${(1/(layers-1)).toFixed(2)}`;
}
function updateNotes(){if(!latest)return;const e=latest.evidence;
 $('time').textContent=`t = ${latest.time.toFixed(2)}`;
 $('speed').textContent=`RMS FLOW = ${e.kineticRms.toFixed(3)}`;
 $('divergence').textContent=`∇xy·u < ${e.divergenceMax.toExponential(1)}`;
 $('fieldLegend').textContent=`${latest.step} STEPS · ν ${latest.model.nu}`;
 const html=$('gears');html.replaceChildren();
 const status=[{type:'observed',text:'ALWAYS ENGAGED: Solve XY circulation ↔ project streamfunction ↔ update heat ↔ enforce walls.'},
 {type:'observed',text:'NEIGHBOUR EXCHANGE: Layer k receives heat and viscous shear from k−1 and k+1, weighted by physical Δz².'},
 ...e.signals].slice(0,7);
 for(const item of status){const node=document.createElement('div');node.className='gear'+(item.type==='limit'?' limit':'')+(item.type==='warning'?' warn':'');node.textContent=item.text;html.append(node);}
 $('status').textContent=paused?'PAUSED · WORKER IDLE':'LIVE · WEB WORKER';
}
function paint(time){if(time-lastRender>44){mainCanvas();stackCanvas();lastRender=time}requestAnimationFrame(paint)}
worker.onmessage=ev=>{
 const {type,state,message}=ev.data||{};
 if(type==='ready'){worker.postMessage({type:'start'});$('status').textContent='WORKER RUNNING';}
 else if(type==='state'){latest=state;updateNotes()}
 else if(type==='error'){$('status').textContent='NUMERICAL ERROR · '+message;paused=true}
};
worker.onerror=err=>{$('status').textContent=`WORKER ERROR: ${err.message}`;paused=true};
$('run').onclick=()=>{paused=!paused;worker.postMessage({type:paused?'pause':'start'});$('run').textContent=paused?'▶ RESUME':'Ⅱ PAUSE';updateNotes()};
$('seed').onclick=()=>{manualFocus=null;worker.postMessage({type:'reset'});$('auto').textContent='◎ AUTO FOCUS'};
$('auto').onclick=()=>{manualFocus=null;$('auto').textContent='◎ AUTO FOCUS';mainCanvas()};
stack.addEventListener('pointerdown',event=>{const r=stack.getBoundingClientRect(),sx=stack.width/r.width,sy=stack.height/r.height,x=(event.clientX-r.left)*sx,y=(event.clientY-r.top)*sy;for(const b of boxes)if(x>=b.x&&x<b.x+b.s&&y>=b.y&&y<b.y+b.s){manualFocus=b.k;$('auto').textContent='↻ RESTORE AUTO FOCUS';break}});
requestAnimationFrame(paint);
