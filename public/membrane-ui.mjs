const $=s=>document.getElementById(s);
const main=$('mainCanvas'),stack=$('stackCanvas'),a=main.getContext('2d',{alpha:false}),b=stack.getContext('2d',{alpha:false});
const worker=new Worker('/membrane-worker.mjs?v=visible-20261015-r3',{type:'module'});
let latest=null,paused=false,manualFocus=null,boxes=[],lastRender=0,fieldMode='cross',selected=null,ranking=[],displayPhase='STARTING';
const frontProgress=$('frontProgress');
new MutationObserver(()=>{frontProgress.textContent=$('progress').textContent;}).observe($('progress'),{childList:true,subtree:true,characterData:true});
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const lerp=(a,b,t)=>a+(b-a)*t;
const colors=[[10,48,85],[18,91,152],[29,160,174],[90,212,159],[248,206,108],[251,101,64]];
function rgb(v){const x=clamp(v,0,1)*5,j=Math.min(4,Math.floor(x)),r=x-j;return `rgb(${colors[j].map((q,i)=>Math.round(lerp(q,colors[j+1][i],r))).join(',')})`}
function crossColor(w,max){const t=clamp(w/Math.max(max,.0001),-1,1);return t>=0?`rgb(${Math.round(27+218*t)},${Math.round(39+111*t)},${Math.round(46+27*t)})`:`rgb(${Math.round(27+18*(-t))},${Math.round(39+138*(-t))},${Math.round(46+195*(-t))})`}
function fit(c){const d=Math.min(2,window.devicePixelRatio||1),r=c.getBoundingClientRect(),w=Math.max(10,Math.round(r.width*d)),h=Math.max(10,Math.round(r.height*d));if(c.width!==w||c.height!==h){c.width=w;c.height=h}return {w,h}}
function drawSlice(ctx,data,n,x,y,s,arrows=false,perpendicular=false,peakW=0){
 const cell=s/n;for(let iy=0;iy<n;iy++)for(let ix=0;ix<n;ix++){
   const q=iy*n+ix,t=data.temperature[q],solid=data.solid?.[q];ctx.fillStyle=solid?'#071015':perpendicular?crossColor(data.w?.[q]||0,peakW):rgb(t);ctx.fillRect(x+ix*cell,y+(n-iy-1)*cell,cell+.5,cell+.5);if(solid){ctx.strokeStyle='rgba(107,204,179,.25)';ctx.strokeRect(x+ix*cell+.5,y+(n-iy-1)*cell+.5,cell,cell);}
 }
 ctx.strokeStyle='#dbf3e94d';ctx.lineWidth=1;ctx.strokeRect(x+.5,y+.5,s-1,s-1);
 if(!arrows)return;
 const count=10;for(let gy=1;gy<count;gy++)for(let gx=1;gx<count;gx++){
  const ix=Math.min(n-1,Math.floor(gx*n/count)),iy=Math.min(n-1,Math.floor(gy*n/count));const q=iy*n+ix;
  if(data.solid?.[q])continue;const u=data.u[q],v=data.v[q],speed=Math.hypot(u,v);if(speed<.001)continue;
  const px=x+gx*s/count,py=y+(1-gy/count)*s,angle=Math.atan2(-v,u);
  const len=clamp(speed*62,6,16)*s/385,tx=px+Math.cos(angle)*len,ty=py+Math.sin(angle)*len;
  ctx.strokeStyle='rgba(244,255,247,.85)';ctx.fillStyle='rgba(244,255,247,.85)';ctx.lineWidth=Math.max(1,s/420);
  ctx.beginPath();ctx.moveTo(px-Math.cos(angle)*len*.38,py-Math.sin(angle)*len*.38);ctx.lineTo(tx,ty);ctx.stroke();
  ctx.beginPath();ctx.moveTo(tx,ty);ctx.lineTo(tx-Math.cos(angle-.53)*len*.38,ty-Math.sin(angle-.53)*len*.38);ctx.lineTo(tx-Math.cos(angle+.53)*len*.38,ty-Math.sin(angle+.53)*len*.38);ctx.fill();
 }
 // Actual pressure-projected face-normal Z velocities, shown in the plane.
 // Solid small dot: towards +Z. Hollow ring: towards -Z. No glyph for no flow.
 for(let gy=1;gy<count;gy++)for(let gx=1;gx<count;gx++){
   const ix=Math.min(n-1,Math.floor(gx*n/count)),iy=Math.min(n-1,Math.floor(gy*n/count));
   const q=iy*n+ix;if(data.solid?.[q])continue;const w=data.w?.[q]||0;
   if(Math.abs(w)<Math.max(.0005,peakW*.055))continue;
   const r=clamp(2+4*Math.abs(w)/Math.max(peakW,.001),2,6)*s/380;
   const px=x+gx*s/count,py=y+(1-gy/count)*s;
   ctx.beginPath();ctx.arc(px,py,r,0,Math.PI*2);
   ctx.strokeStyle=w>0?'#ffe2c0':'#91f7fc';ctx.fillStyle=w>0?'#ffe2c0':'#91f7fc';ctx.lineWidth=Math.max(1,s/400);
   if(w>0)ctx.fill();else ctx.stroke();
 }
}
function mainCanvas(){const {w,h}=fit(main),ctx=a;ctx.fillStyle='#08171e';ctx.fillRect(0,0,w,h);
 if(!latest)return;const n=latest.n,actual=manualFocus??latest.evidence.focus;
 const slice=latest.slices[actual];const s=Math.min(w*.78,h*.86);const x=(w-s)/2,y=(h-s)/2;
 drawSlice(ctx,slice,n,x,y,s,true,fieldMode==='cross',latest.evidence.peakW);
 const delta=(actual-latest.evidence.focus)/latest.layers;
 ctx.fillStyle='#a3d5ca';ctx.font=`${Math.max(11,Math.round(w/52))}px ui-monospace,monospace`;
 ctx.fillText(`z=${((actual+.5)/latest.layers).toFixed(2)} · ${displayPhase} · step ${latest.step}`,Math.max(10,x),Math.min(h-12,y+s+24));
 $('focusLabel').textContent=`${displayPhase} · SLICE ${actual+1}/${latest.layers} ${manualFocus===null?'· AUTO':'· INSPECT'}`;
 $('sliceMeta').textContent=`Z = ${((actual+.5)/latest.layers).toFixed(2)} · |W| ${latest.evidence.peakW.toFixed(3)} · VOID ${(100*latest.evidence.voidFraction).toFixed(0)}%`; 
}
function miniTile(ctx,slice,n,x,y,s){const cell=s/n;for(let iy=0;iy<n;iy++)for(let ix=0;ix<n;ix++){
 ctx.fillStyle=slice.solid?.[iy*n+ix]?'#071015':crossColor(slice.w?.[iy*n+ix]||0,latest.evidence.peakW);ctx.fillRect(x+ix*cell,y+(n-iy-1)*cell,cell+.8,cell+.8);
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
 $('stackMeta').textContent=`${layers} COUPLED PLANES · ΔZ ${(1/layers).toFixed(3)} · COLOURS = W`; 
}
function updateNotes(){if(!latest)return;const e=latest.evidence;
 $('time').textContent=`STEP ${latest.step} · MODEL t=${latest.time.toFixed(3)}`;
 $('speed').textContent=`PEAK PERPENDICULAR |W| ${e.peakW.toFixed(3)} · HEAT FLUX ${e.plateHeatFlux.toFixed(5)}`;
 $('divergence').textContent=`3D ∇·u ${e.divergenceMax.toExponential(1)} · ${e.pressureSweeps} PRESSURE SWEEPS`;
 $('fieldLegend').textContent=fieldMode==='cross'?`STEP ${latest.step} · +Z AMBER • · −Z CYAN ○`:`STEP ${latest.step} · HEAT: BLUE → ORANGE`;
 const html=$('gears');html.replaceChildren();
 const status=[{type:'observed',text:'V10 SOLID/VOID → six-neighbour connected-path check → fluid-only momentum and pressure correction.'},
 {type:'observed',text:`SOLID BOUNDARIES: ${(100*(1-e.voidFraction)).toFixed(1)}% solid. Zero normal fluid flow across voxel interfaces; adiabatic heat walls.`},
 ...e.signals].slice(0,7);
 for(const item of status){const node=document.createElement('div');node.className='gear'+(item.type==='limit'?' limit':'')+(item.type==='warning'?' warn':'');node.textContent=item.text;html.append(node);}
 $('status').textContent=paused?'PAUSED · WORKER IDLE':displayPhase==='SCREENING'?'SCREENING · COMPUTED FIELD':e.projectionConverged?'LIVE · REAL PHYSICS STEPS':'WARNING · PRESSURE UNCONVERGED';
}
function paint(time){if(time-lastRender>44){mainCanvas();stackCanvas();lastRender=time}requestAnimationFrame(paint)}
function paintRanking(){
 const root=$('ranking');root.replaceChildren();
 const header=document.createElement('div');header.className='head';for(const t of ['GEOMETRY','COLD PLATE FLUX','VOID %']){const el=document.createElement('span');el.textContent=t;header.append(el);}root.append(header);
 for(const r of ranking){const row=document.createElement('div');row.className=r.id===selected?.id?'winner':'';
  for(const value of [r.label,r.accepted?r.plateHeatFlux.toFixed(5):'REJECTED',`${(r.connectivity.voidFraction*100).toFixed(1)}%`]){
   const t=document.createElement('span');t.textContent=value;row.append(t);
  }root.append(row);
 }
}
worker.onmessage=ev=>{
 const {type,state,message,ranking:rows,winner,progress,total,activeLabel,step,steps,remaining,previous}=ev.data||{};
 if(type==='ready'){
  worker.postMessage({type:'start'});
  $('status').textContent='PHYSICS WORKER STARTED';
 }else if(type==='screening'){
  displayPhase='SCREENING';ranking=rows||ranking;paintRanking();
  $('progress').textContent=`CALCULATING ${Math.min((progress||0)+1,total||7)}/${total||7}: ${activeLabel||'Loading'} · ${step||0}/${steps||65} ACTUAL NUMERICAL STEPS. The changing canvases are computed trial fields, not random animation.`;
  $('chosen').textContent='SCREENING · NO WINNER YET';
  $('status').textContent='SCREENING · LIVE RESULTS';
 }else if(type==='preview'){
  displayPhase='SCREENING';latest=state;manualFocus=null;
  $('progress').textContent=`CALCULATING ${Math.min((progress||0)+1,total||7)}/${total||7}: ${activeLabel} · ${step}/${steps} NUMERICAL STEPS. Preview only; not a selected design.`;
  updateNotes();
 }else if(type==='state'){
  displayPhase='RUNNING';latest=state;ranking=rows||ranking;selected=winner||selected;
  paintRanking();$('chosen').textContent=selected?selected.label.toUpperCase():'GEOMETRY PENDING';
  if(selected){
    $('progress').textContent=`CURRENT MODEL: ${selected.label}. Relative to empty reference: ${selected.vsEmptyPercent==null?'unavailable':(selected.vsEmptyPercent>0?'+':'')+selected.vsEmptyPercent.toFixed(1)+'%'} transient heat flux. STEP ${state.step} evolving · automatic nearby geometry trials run in the same Web Worker. Not a validated invention.`;
  }
  updateNotes();
 }else if(type==='exploring'){
  if(rows){ranking=rows;paintRanking()};
  if(winner){selected=winner;$('chosen').textContent=winner.label.toUpperCase();}
  $('progress').textContent=`AUTO GEOMETRY DISCOVERY: ${activeLabel} · ${step||0}/${steps||65} numerical steps · ${remaining||0} further neighbours queued. Incumbent stays selected unless an admissible same-horizon result improves the score.`;
 }else if(type==='discovery'){
  selected=winner;ranking=rows||ranking;paintRanking();
  $('chosen').textContent=winner.label.toUpperCase();
  $('progress').textContent=`NEW COARSE-GRID CANDIDATE: ${winner.label} replaces ${previous}. Physics field restarted for this different geometry; validation is still required.`;
 }else if(type==='paused-screening'){
  paused=true;$('status').textContent=message||'SCREENING PAUSED';
 }else if(type==='error'){
  $('status').textContent='NUMERICAL ERROR · '+message;
  $('progress').textContent='Calculation stopped: '+message+' · The model has not produced a defensible new result.';
  paused=true;
 }
};
worker.onerror=err=>{$('status').textContent=`WORKER ERROR: ${err.message}`;$('progress').textContent='Worker failed: '+err.message+' · Unable to run numerical physics on this device.';paused=true};
$('run').onclick=()=>{paused=!paused;worker.postMessage({type:paused?'pause':'start'});$('run').textContent=paused?'▶ RESUME':'Ⅱ PAUSE';updateNotes()};
$('seed').onclick=()=>{manualFocus=null;selected=null;latest=null;ranking=[];paused=false;worker.postMessage({type:'reset'});$('auto').textContent='◎ AUTO FOCUS';$('run').textContent='Ⅱ PAUSE'};
$('auto').onclick=()=>{manualFocus=null;$('auto').textContent='◎ AUTO FOCUS';mainCanvas()};
$('view').onclick=()=>{fieldMode=fieldMode==='cross'?'heat':'cross';$('view').textContent=fieldMode==='cross'?'◉ VIEW TEMPERATURE':'◉ VIEW CROSS-FLOW';$('fieldLegend').textContent=fieldMode==='cross'?'W > 0: AMBER • · W < 0: CYAN ○':'TEMPERATURE: COOL → HOT';};
stack.addEventListener('pointerdown',event=>{const r=stack.getBoundingClientRect(),sx=stack.width/r.width,sy=stack.height/r.height,x=(event.clientX-r.left)*sx,y=(event.clientY-r.top)*sy;for(const b of boxes)if(x>=b.x&&x<b.x+b.s&&y>=b.y&&y<b.y+b.s){manualFocus=b.k;$('auto').textContent='↻ RESTORE AUTO FOCUS';break}});
requestAnimationFrame(paint);