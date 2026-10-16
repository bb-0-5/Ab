import {CONFIGURATIONS,compareIrisStacks,chamberOutputAt,irisLinkage} from './toroidal-iris-stack.mjs?v=iris-stack-r1';
import {SERIAL_ARRANGEMENTS,simulateSerialIris} from './toroidal-series-loop.mjs?v=series-r2';
const $=id=>document.getElementById(id);
const geometry=$('geometry'),chart=$('flowchart'),geom=geometry.getContext('2d'),plot=chart.getContext('2d');
const ALL_CONFIGS=[...CONFIGURATIONS,...SERIAL_ARRANGEMENTS];
const data=[...compareIrisStacks(),...SERIAL_ARRANGEMENTS.map(x=>simulateSerialIris(x))];
const byId=new Map(data.map(x=>[x.configuration.id,x]));
let selected=SERIAL_ARRANGEMENTS[0].id,playing=true,startTime=performance.now(),pausedAt=0;
function current(){return byId.get(selected)}
function number(x,d=2){return Number.isFinite(x)?x.toFixed(d):'—'}
function milliW(x){return number(x*1e3,3)+' mW'}
function microW(x){return number(x*1e6,2)+' µW'}
function scale(canvas,ctx){const rect=canvas.getBoundingClientRect(),d=Math.min(2,window.devicePixelRatio||1),w=Math.round(rect.width*d),h=Math.round(rect.height*d);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}ctx.setTransform(d,0,0,d,0,0);return {w:rect.width,h:rect.height}}
const buttonGroup=$('configButtons');
for(const c of ALL_CONFIGS){
 const b=document.createElement('button');
 b.textContent=c.label;b.type='button';b.dataset.mode=c.id;
 b.onclick=()=>{selected=c.id;startTime=performance.now();pausedAt=0;playing=true;$('motion').textContent='Ⅱ PAUSE';updateUI()};
 buttonGroup.append(b);
}
function powerStats(r){
 $('electrical').textContent=microW(r.grossElectricalW);
 $('motor').textContent=milliW(r.motorElectricalW);
 $('net').textContent=milliW(r.netElectricalW);
 $('net').className=r.netElectricalW>0?'good':'negative';
 $('flow').textContent=number(r.meanTotalFlowM3S*1e9,1)+' µL/s';
 $('coupling').textContent=number(r.couplingCoefficient,3);
 $('error').textContent=number(r.maxRelativeEnergyError*100,4)+'%';
 $('geometryLabel').textContent=r.configuration.label;
 const cap=r.negativePressureSteps?'Model entered negative pressure (invalid cavitation regime).':
   'Energy accounted · numerically tested, not experimentally validated';
 $('assessment').textContent=(r.configuration.hydraulic==='series'?'SAME CLOSED FLUID CIRCUIT · ':'INDEPENDENT FLUID LOOPS · ')+cap+' · mechanism closure '+number(r.linkageClosureErrorM*1e9,5)+' nm';
 for(const b of buttonGroup.children)b.setAttribute('aria-pressed',String(b.dataset.mode===selected));
 const tbody=$('comparison');tbody.replaceChildren();
 const rank=[...data].sort((a,b)=>b.netElectricalW-a.netElectricalW);
 for(const entry of rank){
  const tr=document.createElement('tr');tr.setAttribute('aria-current',String(entry.configuration.id===selected));
  const vals=[entry.configuration.label,number(entry.grossElectricalW*1e6,2),number(entry.motorElectricalW*1e3,3),
    number(entry.netElectricalW*1e3,3),number(entry.meanTotalFlowM3S*1e9,2),number(entry.couplingCoefficient,2)];
  vals.forEach((v,i)=>{const td=document.createElement('td');td.textContent=v;if(i===3)td.className='negative';tr.append(td)});
  tr.style.cursor='pointer';tr.title='Inspect this configuration';tr.onclick=()=>{selected=entry.configuration.id;startTime=performance.now();pausedAt=0;playing=true;$('motion').textContent='Ⅱ PAUSE';updateUI()};
  tbody.append(tr);
 }
}
function roundedRect(ctx,x,y,w,h,r){const rr=Math.min(r,w/2,h/2);ctx.beginPath();ctx.roundRect(x,y,w,h,rr)}
function strokeEllipse(ctx,x,y,rx,ry,color,width=1,dash=[]){
 ctx.save();ctx.setLineDash(dash);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.ellipse(x,y,Math.max(1,rx),Math.max(1,ry),0,0,Math.PI*2);ctx.stroke();ctx.restore();
}
function drawModule(ctx,cx,cy,scale,r,moduleId,t,width){
 const c=r.configuration,j=moduleId;
 const angle=j===1?c.angleDeg:0;
 const rotation=(angle*Math.PI/180),foreshorten=.87*Math.max(.16,Math.abs(Math.cos(rotation)));
 const outer=scale*.99,mid=scale*.76;
 ctx.save();ctx.translate(cx,cy);
 // Real torus path centerline plotted in its toroidal/poloidal parameters.
 strokeEllipse(ctx,0,0,outer,outer*foreshorten,'#4a7281',11);
 strokeEllipse(ctx,0,0,outer,outer*foreshorten,'#c59665',3);
 strokeEllipse(ctx,0,0,mid*.70,mid*.70*foreshorten,'#385461',1);
 ctx.save();ctx.beginPath();
 for(let h=0;h<=280;h++){
  const th=h/280*Math.PI*2;const R=.18,m=.045;
  const x=(R+m*Math.cos(th))*Math.cos(th);
  const y=(R+m*Math.cos(th))*Math.sin(th);
  const z=m*Math.sin(th);
  const px=x/.225*outer;
  const py=(y*Math.cos(rotation)+z*Math.sin(rotation))/.225*outer*.87;
  if(!h)ctx.moveTo(px,py);else ctx.lineTo(px,py);
 }
 ctx.strokeStyle='#67dac9';ctx.lineWidth=2.4;ctx.stroke();ctx.restore();
 const stroke=chamberOutputAt(t,{heads:c.hydraulic==='series'?1:4,frequencyHz:3,spin:j===1?c.spin:1,phaseRad:j===1?c.phaseRad:0});
 for(let h=0;h<stroke.chambers.length;h++){
  const th=2*Math.PI*h/stroke.chambers.length;
  const x=Math.cos(th)*mid,y=Math.sin(th)*mid*foreshorten;
  const k=stroke.chambers[h];
  const isPush=k.outflowM3S>0;
  const rad=7+(k.radiusM/.002-1)*22; // exaggerated only for visibility
  ctx.fillStyle=isPush?'#3e544e':'#102d39';
  ctx.strokeStyle=isPush?'#ffb774':'#7ce5cf';
  ctx.lineWidth=2.2;ctx.beginPath();ctx.arc(x,y,Math.max(3,rad),0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.fillStyle=isPush?'#ffd0a4':'#b1ebe0';ctx.font='bold 9px ui-monospace,monospace';
  ctx.textAlign='center';ctx.fillText(String(h+1),x,y+3);
 }
 // Poles are orientation markers; do not imply simulated magnet field strength.
 ctx.font='bold 11px ui-monospace,monospace';ctx.textAlign='center';
 ctx.fillStyle='#f2ab75';ctx.fillText(j===1&&c.polarity<0?'S':'N',outer*.56,-outer*.38);
 ctx.fillStyle='#a7bdfc';ctx.fillText(j===1&&c.polarity<0?'N':'S',-outer*.56,outer*.42);
 // Direction of mechanical crank rotation; not the direction of electric current.
 ctx.fillStyle='#d6f5f0';ctx.font='bold 12px system-ui';ctx.fillText('IRIS '+(j+1)+' · '+(j===1&&c.spin<0?'↺':'↻'),0,0);
 ctx.font='10px ui-monospace,monospace';ctx.fillStyle='#9ac5c9';ctx.fillText('q '+number(stroke.outputM3S*1e9,1)+' µL/s',0,16);
 ctx.restore();
 ctx.font='bold 11px ui-monospace,monospace';ctx.textAlign='center';ctx.fillStyle='#bde7e1';
 ctx.fillText(j===1?'MODULE B':'MODULE A',cx,cy+scale*1.22);
}
function drawMechanism(ctx,cx,cy,size,t){
 const k=irisLinkage(t*2*Math.PI*3);
 const factor=size/.035,x0=cx-size/2,y0=cy;
 const coords=v=>[x0+v[0]*factor,y0-v[1]*factor];
 const parts=[['A','B','#e3a469'],['B','C','#e3a469'],['C','D','#a2eee4']];
 for(const [a,b,col] of parts){
  const p=coords(k[a]),q=coords(k[b]);ctx.strokeStyle=col;ctx.lineWidth=3;ctx.beginPath();
  ctx.moveTo(...p);ctx.lineTo(...q);ctx.stroke();
 }
 ctx.fillStyle='#fff';ctx.font='10px ui-monospace,monospace';
 for(const v of ['A','B','C','D']){const p=coords(k[v]);ctx.beginPath();ctx.arc(p[0],p[1],3.5,0,Math.PI*2);ctx.fill();ctx.fillText(v,p[0]+7,p[1]-7)}
 ctx.textAlign='center';ctx.fillStyle='#c7e2dc';
 ctx.fillText('PLANAR FOUR-BAR · LENGTHS SOLVED',cx,cy+29);
}
function paintGeometry(t){
 const {w,h}=scale(geometry,geom);geom.clearRect(0,0,w,h);
 const r=current(),two=r.configuration.modules===2,small=w<580;
 if(two){
  if(small){
   const size=Math.min(w*.24,79);drawModule(geom,w*.27,h*.34,size,r,0,t,w);
   drawModule(geom,w*.73,h*.34,size,r,1,t,w);
  }else{
   const size=Math.min(h*.33,w*.18,123);drawModule(geom,w*.25,h*.48,size,r,0,t,w);
   drawModule(geom,w*.75,h*.48,size,r,1,t,w);
  }
  geom.fillStyle='#9dd3da';geom.textAlign='center';geom.font='11px ui-monospace,monospace';
  geom.fillText('MAGNETIC MUTUAL COUPLING  k = '+number(r.couplingCoefficient,2),
   w/2,small?h*.72:h*.88);
 }else{
  const size=Math.min(h*.34,w*.28,126);drawModule(geom,w*.5,h*.47,size,r,0,t,w);
 }
 const location=small?h*.85:h*.90;
 if(small&&two){
  drawMechanism(geom,w*.52,h*.91,100,t);
 }else{
  geom.font='10px ui-monospace,monospace';geom.fillStyle='#7ea7b1';geom.textAlign='center';
  geom.fillText('A→B CRANK · B→C COUPLER · C→D FOLLOWER · VOLUME-DRIVEN FLOW',w/2,h-8);
 }
 const sample=frameAt(r,t);
 $('timeReadout').textContent='t = '+number(t,2)+' s · '+(playing?'RUNNING':'PAUSED');
 $('positionReadout').textContent='APERTURE  '+number(sample.modules[0].membraneRadiiM[0]*1e3,3)+' mm';
 $('phaseReadout').textContent='PRESSURE '+number(sample.modules[0].pressurePa,0)+' Pa';
}
function frameAt(r,t){
 const items=r.samples;const guess=Math.min(items.length-1,Math.floor(t/r.simulationSeconds*(items.length-1)));
 return items[Math.max(0,guess)];
}
function paintFlow(t){
 const {w,h}=scale(chart,plot);plot.clearRect(0,0,w,h);
 const r=current(),left=54,right=w-15,top=15,bottom=h-33;
 plot.strokeStyle='#274350';plot.lineWidth=1;
 for(let k=0;k<=4;k++){const y=top+(bottom-top)*k/4;plot.beginPath();plot.moveTo(left,y);plot.lineTo(right,y);plot.stroke();}
 const maxQ=Math.max(1e-12,...r.samples.flatMap(s=>s.modules.map(x=>x.Qm3S)));
 plot.font='10px ui-monospace,monospace';plot.textAlign='right';plot.fillStyle='#a6c2c9';
 plot.fillText(number(maxQ*1e9,0)+' µL/s',left-5,top+5);plot.fillText('0',left-5,bottom+2);
 plot.textAlign='left';plot.fillText('STARTUP · 0 s',left,bottom+18);
 plot.textAlign='right';plot.fillText(number(r.simulationSeconds,1)+' s',right,bottom+18);
 for(let m=0;m<r.configuration.modules;m++){
  plot.beginPath();plot.setLineDash(m?[5,4]:[]);plot.strokeStyle=m?'#e3b17d':'#74ebd1';plot.lineWidth=2;
  for(let i=0;i<r.samples.length;i++){
   const s=r.samples[i],x=left+s.tS/r.simulationSeconds*(right-left),y=bottom-s.modules[m].Qm3S/maxQ*(bottom-top);
   if(i===0)plot.moveTo(x,y);else plot.lineTo(x,y);
  }plot.stroke();plot.setLineDash([]);
 }
 const lineX=left+t/r.simulationSeconds*(right-left);plot.strokeStyle='#e6f6de80';plot.lineWidth=1;
 plot.beginPath();plot.moveTo(lineX,top);plot.lineTo(lineX,bottom);plot.stroke();
 const cur=frameAt(r,t);plot.fillStyle='#d1f1e9';plot.textAlign='center';
 plot.fillText(number(cur.modules[0].Qm3S*1e9,2)+' µL/s',Math.max(left+40,Math.min(right-40,lineX)),Math.max(top+14,bottom-cur.modules[0].Qm3S/maxQ*(bottom-top)-11));
}
function positionSec(){
 if(!playing)return pausedAt;
 const elapsed=(performance.now()-startTime)/1000;
 return elapsed*.26%current().simulationSeconds;
}
function animate(){const t=positionSec();paintGeometry(t);paintFlow(t);requestAnimationFrame(animate);}
function updateUI(){powerStats(current());}
$('motion').addEventListener('click',()=>{
 if(playing){pausedAt=positionSec();playing=false;$('motion').textContent='▶ RESUME';$('motion').setAttribute('aria-pressed','false')}
 else{startTime=performance.now()-pausedAt/.26*1000;playing=true;$('motion').textContent='Ⅱ PAUSE';$('motion').setAttribute('aria-pressed','true')}
});
updateUI();requestAnimationFrame(animate);
