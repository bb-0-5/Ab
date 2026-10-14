import { taylorGreen, periodic, decodeCavity, cubeCell } from '/fluid-physics.mjs';
const $ = id => document.getElementById(id);
const canvas = $('field'), ctx = canvas.getContext('2d',{alpha:false});
const modes = {cube:'cube',torus:'torus'};
const state = {mode:modes.cube,field:null,playing:true,display:'heat',depth:.5,time:0,nu:.035,lastFrame:0,particles:[], width:1,height:1,offscreen:document.createElement('canvas')};
const setText = (id,text) => {$(id).textContent=text};
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const mix=(a,b,t)=>a+(b-a)*t;
function gradientColor(t){
  const stops=[[10,45,94],[20,91,159],[33,145,170],[99,207,182],[238,215,134],[245,126,88]];
  t=clamp(t,0,1)*(stops.length-1);
  const a=Math.min(stops.length-2,Math.floor(t)),f=t-a;
  return stops[a].map((v,i)=>Math.round(mix(v,stops[a+1][i],f)));
}
function paintRGB(values){return `rgb(${values.join(',')})`}
const seeded = i => {let x=(Math.imul(i+1,1664525)+1013904223)>>>0; x^=x>>>16; x=Math.imul(x,2246822519)>>>0; return (x>>>0)/4294967296;};
function initParticles(){state.particles=[];for(let i=0;i<110;i++){
 let x=.03+.94*seeded(i*7),y=.03+.94*seeded(i*11+1);
 if(state.mode==='cube' && state.field){
   let count=0;while(cubeField(x,y).solid && count<20){x=.03+.94*seeded(i*29+count*3);y=.03+.94*seeded(i*31+count*9);count++;}
 }
 state.particles.push({x,y,trail:[],life:Math.floor(60+seeded(i*41)*110)});
}}
function cubeField(x,y){
 const f=state.field;if(!f)return {temp:0,solid:false,vx:0,vy:0,vz:0};
 const z=Math.round(state.depth*(f.n-1));
 const ix=clamp(Math.floor(x*f.n),0,f.n-1), iy=clamp(Math.floor(y*f.n),0,f.n-1);
 return cubeCell(f,ix,iy,z);
}
function torusField(x,y){const v=taylorGreen(periodic(x)*Math.PI*2,periodic(y)*Math.PI*2,state.time,state.nu);return {temp:clamp(v.vorticity/4+.5,0,1),solid:false,vx:v.u,vy:v.v,speed:Math.hypot(v.u,v.v)};}
function vector(x,y){return state.mode==='cube'?cubeField(x,y):torusField(x,y)}
function showMode(mode){state.mode=mode;state.time=0;state.depth=.5;$('slice').value=50;
 $('modeCube').classList.toggle('active',mode==='cube');$('modeTorus').classList.toggle('active',mode==='torus');
 setText('panelTitle',mode==='cube'?'SEALED CAVITY · 3D FIELD SLICE':'PERIODIC TORUS · EXACT 2D FLOW');
 setText('solverLabel',mode==='cube'?'ARCHIVED NUMERICAL FIELD':'LIVE EXACT SOLUTION');
 setText('domainSubhead',mode==='cube'?'02 / FIELD SLICE':'02 / EVOLUTION');
 setText('sliderLabel',mode==='cube'?'DEPTH INSIDE CUBE':'TIME / DIMENSIONLESS');
 setText('axisLabel',mode==='cube'?'X–Y PLANE':'T² PERIODIC DOMAIN');
 setText('methodInfo',mode==='cube'?'3-D Boussinesq · Ra 20,000':'Taylor–Green vortex · T²');
 setText('geometryInfo',mode==='cube'?'Impermeable insulating baffle':'Edges wrap periodically');
 setText('flowNote',mode==='cube'?'ARROWS = WATER VELOCITY · DOTS = TRACERS':'ARROWS = VELOCITY · DOTS = TRACERS');
 setText('lowLegend',mode==='cube'?'COOL':'NEGATIVE VORTICITY');
 setText('highLegend',mode==='cube'?'HOT':'POSITIVE VORTICITY');
 setText('modeHelp',mode==='cube'
  ?'The cube is an archived 3-D Python calculation. Colours, arrows and moving tracers all derive from its computed fields; the animated tracers are visualised within the frozen velocity field.'
  :'A real exact solution of 2-D Navier–Stokes on a periodic torus is evaluated locally every animation frame. It is one smooth solution, not a proof for every 3-D flow.');
 setText('explainHeading',mode==='cube'?"Pressure alone doesn't create flow.":'A torus is in the actual prize question.');
 setText('explainText',mode==='cube'
  ?'Water fills an impermeable cubic cavity, heated below and cooled above. The 3-D Python solver calculated the motion driven by buoyancy. A dark baffle changes the flow topology; the grid is a slice from the recorded numerical field.'
  :'Opposite edges are mathematically identified, making a periodic space with no external boundary. This is the exact decaying Taylor–Green vortex on a two-dimensional torus (T²): it solves the unforced viscous Navier–Stokes equations for all time. The Millennium Prize concerns all sufficiently smooth data in three dimensions (T³ or R³), not this one 2-D example.');
 setText('caveatTitle',mode==='cube'?'RESEARCH LIMITATION':'MATHEMATICAL DISTINCTION');
 setText('caveatText',mode==='cube'
  ?'A 12³ grid showed +1.94% modeled heat extraction, and 16³ showed +4.84%. That resolution dependence means no mesh-independent engineering claim is justified. Our wall approximation and solver need external CFD benchmarks.'
  :'T² is not a doughnut-shaped pipe; it is a domain whose opposite edges identify. A physical pipe shaped like a doughnut has walls and different boundary conditions. This smooth T² solution does not establish global smoothness for arbitrary initial data on T³.');
 setText('statusInfo',mode==='cube'?'3D snapshot · unvalidated':'Exact 2D benchmark · analytic');
 setText('rankTitle',mode==='cube'?'Eight structures, one model.':'One explicit smooth solution.');
 $('rankingFooter').textContent=mode==='cube'?'Modeled heat extraction at fixed temperature difference. Not a physical performance guarantee.':'The exact velocity field shrinks exponentially while remaining smooth and divergence-free. Its kinetic energy decays as e⁻⁴νᵗ.';
 initParticles();renderRanking();updateStats();updateSlider();
}
function updateSlider(){if(state.mode==='cube')setText('sliceValue',Math.round(state.depth*100)+'%');else setText('sliceValue',state.time.toFixed(1));setText('sampleLabel',state.mode==='cube'?`Z = ${Math.round(state.depth*100)}%`:`t = ${state.time.toFixed(2)}`);}
function updateStats(){if(state.mode==='cube'){
  const meta=state.field?.metadata;setText('metricMain',meta?meta.nusselt.toFixed(3):'—');setText('metricDelta',meta?'+'+meta.relative_gain_percent.toFixed(2)+'%':'—');setText('metricCheck',meta?'+'+meta.refined_gain_percent.toFixed(2)+'%':'—');setText('metricStatus','PROVISIONAL');
  setText('metricMainLabel','NUSSELT / COLD PLATE');setText('metricDeltaLabel','COARSE 12³ EXPERIMENT');setText('metricCheckLabel','16³ REFINEMENT / UNCONVERGED');setText('metricStatusLabel','NO PHYSICAL VALIDATION');
}else{const fraction=Math.exp(-4*state.nu*state.time);setText('metricMain',(100*fraction).toFixed(1)+'%');setText('metricDelta','0 EXACT');setText('metricCheck','T²');setText('metricStatus','SMOOTH');
 setText('metricMainLabel','RELATIVE INITIAL KINETIC ENERGY');setText('metricDeltaLabel','CONTINUOUS DIVERGENCE');setText('metricCheckLabel','TWO PERIODIC DIMENSIONS');setText('metricStatusLabel','THIS SOLUTION · ALL TIME');}}
function renderRanking(){const el=$('ranking');el.replaceChildren();if(state.mode==='torus'){
  for(const [k,v] of [['Velocity','u = −cos(x) sin(y) e⁻²νᵗ'],['Perpendicular velocity','v = sin(x) cos(y) e⁻²νᵗ'],['Pressure','p = −¼(cos2x + cos2y)e⁻⁴νᵗ'],['Viscosity','ν = 0.035'],['Topology','T² = periodic square']]){
    const row=document.createElement('div');row.className='row';const label=document.createElement('span');label.className='row-name';label.textContent=k;const data=document.createElement('span');data.style.cssText='font-size:10px;color:#93bdb9;text-align:right';data.textContent=v;row.append(label,data);el.append(row);
  } return;
}
const rows=state.field?.rank||[];const max=Math.max(3.5,...rows.map(r=>r.nusselt));for (const r of rows) {
 const row=document.createElement('div');row.className='row';let name=r.candidate.replaceAll('_',' ');const label=document.createElement('span');label.className='row-name';label.textContent=name;
 const bar=document.createElement('div');bar.className='row-bar';const prog=document.createElement('div');prog.className='row-progress';prog.style.width=(r.nusselt/max*100).toFixed(1)+'%';bar.append(prog);
 const val=document.createElement('span');val.className='row-val';val.textContent=r.nusselt.toFixed(3);const gain=document.createElement('span');gain.className='row-gain'+(r.delta_vs_empty_percent<0?' negative':'');gain.textContent=(r.delta_vs_empty_percent>0?'+':'')+r.delta_vs_empty_percent.toFixed(1)+'%';row.append(label,bar,val,gain);el.append(row);
}}
function resize(){const r=canvas.getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1);const w=Math.max(1,Math.round(r.width*dpr)),h=Math.max(1,Math.round(r.height*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;state.width=w;state.height=h;}}
function drawGrid(view){const {x,y,size}=view;const n=state.mode==='cube'?state.field?.n||12:62;
 const buf=state.offscreen;buf.width=n;buf.height=n;
 const g=buf.getContext('2d');const image=g.createImageData(n,n);
 let maxSpeed=state.mode==='cube'?.16:1;
 for(let iy=0;iy<n;iy++)for(let ix=0;ix<n;ix++){
  const xp=(ix+.5)/n,yp=(n-iy-.5)/n;const q=vector(xp,yp);
  const t=state.display==='speed'?Math.pow(clamp(Math.hypot(q.vx,q.vy)/maxSpeed,0,1),.7):q.temp;
  const rgb=gradientColor(t);const pixel=(iy*n+ix)*4;image.data[pixel]=q.solid?6:rgb[0];image.data[pixel+1]=q.solid?21:rgb[1];image.data[pixel+2]=q.solid?29:rgb[2];image.data[pixel+3]=255;
 }
 g.putImageData(image,0,0);ctx.imageSmoothingEnabled=true;ctx.drawImage(buf,x,y,size,size);
 // Solid voxel geometry is drawn without interpolating across the interface.
 if(state.mode==='cube'&&state.field){const nn=state.field.n;ctx.fillStyle='#05141b';for(let yy=0;yy<nn;yy++)for(let xx=0;xx<nn;xx++)if(cubeField((xx+.5)/nn,(yy+.5)/nn).solid)ctx.fillRect(x+xx*size/nn,y+(nn-yy-1)*size/nn,size/nn+.1,size/nn+.1);}
 // Aligned grid: nodes and boundaries are spatial coordinates, not molecules.
 ctx.strokeStyle='rgba(190,237,230,.075)';ctx.lineWidth=Math.max(.5,canvas.width/1400);
 for(let i=0;i<=10;i++){const s=i*size/10;ctx.beginPath();ctx.moveTo(x+s,y);ctx.lineTo(x+s,y+size);ctx.moveTo(x,y+s);ctx.lineTo(x+size,y+s);ctx.stroke();}
 // Measured/calculated velocity vectors (not arbitrary animation).
 ctx.lineWidth=Math.max(1,canvas.width/720);const count=state.mode==='cube'?10:12;
 for(let gy=0;gy<count;gy++)for(let gx=0;gx<count;gx++){
  const px=(gx+.5)/count,py=(gy+.5)/count,q=vector(px,py);if(q.solid)continue;
  const speed=Math.hypot(q.vx,q.vy);if(speed<.006)continue;
  const relative=speed/(state.mode==='cube'?.14:.9);
  const len=clamp(relative*size/count*.62,size/count*.18,size/count*.72);
  const head=Math.max(3,Math.min(5,size/100));
  const a=Math.atan2(-q.vy,q.vx),sx=x+px*size,sy=y+(1-py)*size;
  const dx=Math.cos(a)*len,dy=Math.sin(a)*len;ctx.strokeStyle='rgba(240,255,251,.9)';ctx.fillStyle='rgba(240,255,251,.9)';ctx.beginPath();ctx.moveTo(sx-dx*.35,sy-dy*.35);ctx.lineTo(sx+dx*.65,sy+dy*.65);ctx.stroke();ctx.beginPath();ctx.moveTo(sx+dx*.65,sy+dy*.65);ctx.lineTo(sx+dx*.65-Math.cos(a-.65)*head,sy+dy*.65-Math.sin(a-.65)*head);ctx.lineTo(sx+dx*.65-Math.cos(a+.65)*head,sy+dy*.65-Math.sin(a+.65)*head);ctx.fill();
 }
 ctx.strokeStyle='rgba(195,239,230,.68)';ctx.lineWidth=Math.max(1,canvas.width/650);ctx.strokeRect(x+.5,y+.5,size-1,size-1);
}
function advanceParticles(dt){if(!state.playing)return;for(let i=0;i<state.particles.length;i++){
 const p=state.particles[i];const v=vector(p.x,p.y);const speed=state.mode==='cube'?0.45:0.020;
 let nx=p.x+v.vx*dt*speed,ny=p.y+v.vy*dt*speed;
 if(state.mode==='torus'){nx=periodic(nx,1);ny=periodic(ny,1);}else{
  if(nx<.015||ny<.015||nx>.985||ny>.985||cubeField(nx,ny).solid){p.life=0;}else{p.x=nx;p.y=ny;}
 }
 if(state.mode==='torus'){p.x=nx;p.y=ny;}
 p.life--;p.trail.push([p.x,p.y]);if(p.trail.length>12)p.trail.shift();if(p.life<=0){p.x=.025+.95*seeded(i*13+Math.round(state.time)*15);p.y=.025+.95*seeded(i*19+Math.round(state.time)*25);p.trail=[];p.life=75+Math.floor(seeded(i*23)*135);}
}}
function drawParticles(view){const {x,y,size}=view;for(const p of state.particles){if(state.mode==='cube'&&cubeField(p.x,p.y).solid)continue;
 ctx.beginPath();let first=true,prev;
 for(let j=0;j<p.trail.length;j++){const q=p.trail[j];if(prev&&Math.hypot(q[0]-prev[0],q[1]-prev[1])>.15){first=true;}const a=x+q[0]*size,b=y+(1-q[1])*size;if(first){ctx.moveTo(a,b);first=false}else ctx.lineTo(a,b);prev=q;}
 ctx.strokeStyle='rgba(235,255,247,.27)';ctx.lineWidth=Math.max(1,canvas.width/1200);ctx.stroke();
 ctx.beginPath();ctx.arc(x+p.x*size,y+(1-p.y)*size,Math.max(.8,canvas.width/1100),0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,.8)';ctx.fill();}}
function render(time){resize();const w=state.width,h=state.height;ctx.fillStyle='#08151d';ctx.fillRect(0,0,w,h);
 const size=Math.min(w*.72,h*.88),view={x:(w-size)*.5,y:(h-size)*.5,size};
 if(state.field||state.mode==='torus'){drawGrid(view);drawParticles(view);}else{ctx.fillStyle='#a7c3c8';ctx.font=`${Math.max(12,w/60)}px system-ui`;ctx.textAlign='center';ctx.fillText('Loading archived numerical field…',w/2,h/2);}
 const dt=clamp((time-(state.lastFrame||time))/1000,0,.04);state.lastFrame=time;
 if(state.playing){if(state.mode==='torus'){state.time+=dt*.7;if(state.time>18){state.time=0;initParticles();}const slider=Math.round(state.time/18*100);$('slice').value=slider;updateSlider();if(Math.floor(time/200)!==Math.floor((time-dt*1000)/200))updateStats();}advanceParticles(dt);}
 requestAnimationFrame(render);
}
$('modeCube').addEventListener('click',()=>showMode('cube'));
$('modeTorus').addEventListener('click',()=>showMode('torus'));
$('slice').addEventListener('input',e=>{const k=Number(e.target.value)/100;if(state.mode==='cube'){state.depth=k;initParticles();}else{state.time=k*18;updateStats();}updateSlider()});
$('displayHeat').addEventListener('click',()=>{state.display='heat';$('displayHeat').classList.add('active');$('displaySpeed').classList.remove('active')});
$('displaySpeed').addEventListener('click',()=>{state.display='speed';$('displayHeat').classList.remove('active');$('displaySpeed').classList.add('active')});
$('play').addEventListener('click',()=>{state.playing=!state.playing;setText('playText',state.playing?'PAUSE FLOW TRACERS':'RESUME FLOW TRACERS');setText('playIcon',state.playing?'Ⅱ':'▷')});
$('reset').addEventListener('click',()=>{state.time=0;initParticles();if(state.mode==='torus')$('slice').value=0;updateSlider();updateStats()});
showMode('cube');requestAnimationFrame(render);
fetch('/fluid-fields.json',{cache:'no-store'}).then(response=>{if(!response.ok)throw Error('HTTP '+response.status);return response.json()}).then(raw=>{state.field=decodeCavity(raw);initParticles();updateStats();renderRanking();}).catch(error=>{setText('statusInfo','Field unavailable');setText('modeHelp','The 3D field could not be loaded ('+error.message+'). The exact periodic benchmark remains available.');setText('solverLabel','ARCHIVED FIELD UNAVAILABLE');});