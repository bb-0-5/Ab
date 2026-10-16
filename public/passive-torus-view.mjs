import {buildPassiveRing,advancePassiveRing,passiveSnapshot} from './toroidal-passive-pressure.mjs?v=passive-pressure-r1';
import {resolveMembraneSource,evaluateMembraneGeometry,maskCrossSection} from './toroidal-membrane-bridge.mjs?v=v10-geometry-r3';
const $=id=>document.getElementById(id);
const torus=$('torus'),ringCtx=torus.getContext('2d'),chart=$('chart'),chartCtx=chart.getContext('2d');
const sourceCanvas=$('membrane'),sourceCtx=sourceCanvas.getContext('2d');
let evidence=null,geometry=null,sourceFailure='',mode='uniform',material='water20C',frames=[],at=0,playing=true,previous=0;
try{geometry=resolveMembraneSource();evidence=evaluateMembraneGeometry(geometry);}
catch(err){sourceFailure=String(err);}
const solid=geometry?.mask||null;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function scale(canvas,ctx){
 const r=canvas.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);
 const w=Math.round(r.width*d),h=Math.round(r.height*d);
 if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
 ctx.setTransform(d,0,0,d,0,0);return {w:r.width,h:r.height};
}
function val(x,d=2){return Number.isFinite(x)?x.toFixed(d):'—';}
function energy(x){
 if(x===0)return '0 J';if(!Number.isFinite(x))return '—';
 if(Math.abs(x)<1e-9)return val(x*1e12,3)+' pJ';
 if(Math.abs(x)<1e-6)return val(x*1e9,3)+' nJ';
 if(Math.abs(x)<1e-3)return val(x*1e6,3)+' µJ';
 return val(x,6)+' J';
}
function flow(x){return Math.abs(x)<1e-15?'0 nL/s':val(x*1e9,3)+' nL/s';}
function setup(){
 const ring=buildPassiveRing(evidence,{mode,material,segments:96,
  basePressurePa:1e7,initialPulsePa:800,fieldTesla:.45,loadFactor:.5});
 frames=[passiveSnapshot(ring)];
 for(let i=0;i<200;i++){advancePassiveRing(ring,7);frames.push(passiveSnapshot(ring));}
 at=0;playing=true;previous=0;$('motion').textContent='Ⅱ PAUSE';
 for(const b of document.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode===mode));
 $('material').textContent=material==='water20C'?'FLUID: WATER · SWITCH TO METAL':'FLUID: GALINSTAN · SWITCH TO WATER';
 $('source').textContent=evidence?.source||'OPEN CHANNEL REFERENCE: V10 SOURCE UNAVAILABLE';
 $('source').className=evidence?.nativeSelection?'small status':'small warn';
 const info=evidence?.supported?
 'SOLID '+val(evidence.solidFraction*100,1)+'% · THROUGH-PORE FLOW '+val(evidence.relativeFlow*100,1)+
 '% OF OPEN GRID · DRAG TRANSFER ×'+val(evidence.resistanceRatio,2) :
 'NO SUPPORTED V10 CONDUCTANCE. OPEN REFERENCE OR MASK OCCUPANCY ONLY.';
 $('maskStats').textContent=info+(sourceFailure?' · '+sourceFailure:'');
}
function drawMask(t){
 const {w,h}=scale(sourceCanvas,sourceCtx),ctx=sourceCtx;
 ctx.clearRect(0,0,w,h);ctx.fillStyle='#081722';ctx.fillRect(0,0,w,h);
 if(!geometry||!solid){ctx.fillStyle='#e0b07d';ctx.font='12px monospace';ctx.fillText('SOURCE UNAVAILABLE',14,23);return;}
 const z=Math.min(geometry.layers-1,Math.floor(t*1000/140)%geometry.layers);
 const slice=maskCrossSection(geometry,z),n=slice.n;
 const cell=Math.min((w-30)/n,(h-30)/n),x0=(w-cell*n)/2,y0=(h-cell*n)/2;
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const filled=slice.solid[y*n+x]!==0;
  ctx.fillStyle=filled?'#dba76e':'#1e6680';
  ctx.fillRect(x0+x*cell,y0+y*cell,Math.max(.5,cell-.4),Math.max(.5,cell-.4));
 }
 $('sliceLabel').textContent='V10 Z '+(z+1)+'/'+geometry.layers+' · '+n+'×'+n;
}
function drawTorus(state){
 const {w,h}=scale(torus,ringCtx),ctx=ringCtx;
 ctx.clearRect(0,0,w,h);
 const cx=w*.5,cy=h*.49,sx=Math.min(w*.39,h*.56),sy=sx*.55;
 const p=state.pressurePerturbationPa,phi=state.occupancy,n=p.length;
 ctx.save();ctx.translate(cx,cy);
 ctx.fillStyle='#06151c';ctx.beginPath();ctx.ellipse(0,0,sx*1.12,sy*1.16,0,0,Math.PI*2);ctx.fill();
 for(let i=0;i<n;i++){
  const a0=i/n*Math.PI*2-Math.PI/2,a1=(i+1)/n*Math.PI*2-Math.PI/2;
  const pressure=p[i]/800,local=phi[i],copperWidth=4+(1-local)*16;
  ctx.beginPath();ctx.ellipse(0,0,sx,sy,0,a0,a1+.004);
  ctx.lineWidth=Math.max(7,Math.min(26,12+copperWidth));ctx.strokeStyle='#a47550';ctx.stroke();
  ctx.beginPath();ctx.ellipse(0,0,sx,sy,0,a0,a1+.004);
  ctx.lineWidth=Math.max(3,Math.min(16,12*local));
  ctx.strokeStyle=pressure>.04?'rgba(120,246,222,'+clamp(.28+Math.abs(pressure)*.72,.28,1)+')':
   pressure<-.04?'rgba(139,94,204,'+clamp(.34+Math.abs(pressure),.34,1)+')':'#245a6f';
  ctx.stroke();
  if(local<.98&&i%3===0){
   const ang=(a0+a1)/2,x=sx*Math.cos(ang),y=sy*Math.sin(ang);
   ctx.fillStyle='#f2c08b';ctx.beginPath();ctx.arc(x,y,1+(1-local)*3,0,Math.PI*2);ctx.fill();
  }
 }
 ctx.font='800 '+Math.max(13,Math.min(24,w*.028))+'px system-ui';
 ctx.textAlign='center';ctx.fillStyle='#e9f6f2';
 ctx.fillText(state.mode==='uniform'?'STATIC · NO FLOW':'PASSIVE PRESSURE WAVE',0,-13);
 ctx.fillStyle='#a9c8c8';ctx.font='11px ui-monospace,monospace';
 ctx.fillText(state.mode==='uniform'?'NO MOTORS · NO SOURCE':'ONE PULSE · NO FURTHER WORK',0,10);
 ctx.fillText('10 MPa BACKGROUND',0,31);ctx.restore();
}
function drawChart(state){
 const {w,h}=scale(chart,chartCtx),ctx=chartCtx;
 ctx.clearRect(0,0,w,h);const x0=55,x1=w-14,y0=18,y1=h-32,mid=(y0+y1)/2;
 ctx.strokeStyle='#244653';ctx.lineWidth=1;
 for(let k=0;k<5;k++){const y=y0+(y1-y0)*k/4;ctx.beginPath();ctx.moveTo(x0,y);ctx.lineTo(x1,y);ctx.stroke();}
 ctx.strokeStyle='#57838a';ctx.beginPath();ctx.moveTo(x0,mid);ctx.lineTo(x1,mid);ctx.stroke();
 ctx.beginPath();ctx.strokeStyle='#84eccc';ctx.lineWidth=2.3;
 const d=state.pressurePerturbationPa;
 for(let i=0;i<d.length;i++){
  const x=x0+i/(d.length-1)*(x1-x0),y=mid-d[i]/800*(y1-y0)*.46;
  if(!i)ctx.moveTo(x,y);else ctx.lineTo(x,y);
 }ctx.stroke();
 ctx.font='10px ui-monospace,monospace';ctx.textAlign='right';ctx.fillStyle='#bcd2d2';
 ctx.fillText('+800 Pa',x0-5,y0+7);ctx.fillText('0',x0-5,mid+3);ctx.fillText('−800 Pa',x0-5,y1);
 ctx.textAlign='left';ctx.fillText('TOROID 0 m',x0,y1+18);
 ctx.textAlign='right';ctx.fillText(val(state.lengthM,2)+' m',x1,y1+18);
}
function show(state){
 $('clock').textContent=val(state.timeS*1000,3)+' ms · '+(state.mode==='uniform'?'EQUILIBRIUM':'DECAYING PERTURBATION');
 $('pressure').textContent=val(state.basePressurePa/1e6,1)+' MPa';
 $('flow').textContent=flow(state.maxFlowM3S);
 $('circulation').textContent=flow(state.meanCirculationM3S);
 $('speed').textContent=val(state.waveSpeedMPerS,0)+' m/s';
 $('initial').textContent=energy(state.initialStoredJ);
 $('remaining').textContent=energy(state.remainingStoredJ);
 $('electric').textContent=energy(state.electricalJ);
 $('residual').textContent=state.initialStoredJ?val(state.closureRelative*100,7)+'%':'0%';
 $('verdict').textContent=state.mode==='uniform'?
  'RESULT: UNIFORM 10 MPa WITH CLOSED WALLS → EXACTLY ZERO FLOW. No magnetic electricity, no free propulsion.':
  'RESULT: ONE EXTERNALLY PROVIDED INITIAL DISTURBANCE → PROPAGATING, ATTENUATING PRESSURE WAVE. Any magnetic output comes from the finite initial wave energy; no steady generator.';
 drawTorus(state);drawChart(state);drawMask(state.timeS);
}
function animate(now){
 if(playing&&frames.length&&(!previous||now-previous>=42)){
  at=Math.min(frames.length-1,at+1);previous=now;
 }
 if(frames.length)show(frames[at]);
 requestAnimationFrame(animate);
}
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;setup();});
$('material').onclick=()=>{material=material==='water20C'?'galinstan':'water20C';setup();};
$('motion').onclick=()=>{playing=!playing;previous=0;$('motion').textContent=playing?'Ⅱ PAUSE':'▶ RESUME';};
$('reload').onclick=()=>location.reload();
setup();requestAnimationFrame(animate);
