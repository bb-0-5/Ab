/** A visual EMBEDDING of the periodic T² chart into a familiar donut shape.
 * The EXACT Taylor-Green field is solved in FLAT periodic coordinates.
 * Moving its values onto a curved torus is a visualization of topology,
 * not an isometric embedding and not a Navier-Stokes solution on a curved pipe.
 */
import { taylorGreen, periodic } from './fluid-physics.mjs';

const TAU = 2*Math.PI;
const R = 1.28, r = 0.48;
const SEG_MAJOR = 48, SEG_MINOR = 26;
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const lerp = (a,b,t) => a+(b-a)*t;
const palette = [[10,45,94],[20,91,159],[33,145,170],[99,207,182],[238,215,134],[245,126,88]];
function spectral(t){
  const q=clamp(t,0,1)*(palette.length-1),i=Math.min(palette.length-2,Math.floor(q));
  return palette[i].map((v,k)=>lerp(v,palette[i+1][k],q-i));
}
export function torusPoint(theta,phi){
  const x=R+r*Math.cos(phi);
  return [x*Math.cos(theta),x*Math.sin(theta),r*Math.sin(phi)];
}
export function torusNormal(theta,phi){
  return [Math.cos(phi)*Math.cos(theta),Math.cos(phi)*Math.sin(theta),Math.sin(phi)];
}
export function torusChartVelocity(theta,phi,t,nu){
  // Flat chart velocity is (dθ/dt,dφ/dt). It is not 3D pipe velocity.
  const {u,v}=taylorGreen(periodic(theta,TAU),periodic(phi,TAU),t,nu);
  const a=R+r*Math.cos(phi);
  return [
    -a*Math.sin(theta)*u-r*Math.sin(phi)*Math.cos(theta)*v,
     a*Math.cos(theta)*u-r*Math.sin(phi)*Math.sin(theta)*v,
     r*Math.cos(phi)*v,
  ];
}
function rotate(p,a){
  const [x,y,z]=p;
  const sz=Math.sin(a.z),cz=Math.cos(a.z),sx=Math.sin(a.x),cx=Math.cos(a.x),sy=Math.sin(a.y),cy=Math.cos(a.y);
  const x1=x*cz-y*sz,y1=x*sz+y*cz;
  const y2=y1*cx-z*sx,z2=y1*sx+z*cx;
  return [x1*cy+z2*sy,y2,-x1*sy+z2*cy];
}
function project(v,w,h,a){
  const [x,y,z]=rotate(v,a);
  const scale=Math.min(w*.255,h*.290)*5.4/(5.4-z);
  return {x:w*.50+x*scale,y:h*.51-y*scale,z,scale};
}
function drawParticle(ctx,segments){
  const head=segments[segments.length-1];
  if(!head)return;
  if(segments.length>1){
    ctx.strokeStyle='rgba(239,255,249,.44)';ctx.lineWidth=1.35;ctx.beginPath();
    ctx.moveTo(segments[0].x,segments[0].y);
    for(let i=1;i<segments.length;i++)ctx.lineTo(segments[i].x,segments[i].y);
    ctx.stroke();
  }
  ctx.fillStyle='#effff5';ctx.shadowBlur=9;ctx.shadowColor='#a8ffdf';ctx.beginPath();ctx.arc(head.x,head.y,2.15,0,TAU);ctx.fill();ctx.shadowBlur=0;
}
/** Render an orbital view with painter-sorted actual torus surface geometry.
 * The donut is a mathematical TOPOLOGY illustration, not physical pipe walls.
 */
export function renderPeriodicTorus(ctx,options){
  const {width:w,height:h,time,nu,display='heat',particles=[],angles={x:.85,y:0,z:0}}=options;
  if(!ctx||!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0)return;
  const halo=ctx.createRadialGradient(w*.5,h*.5,20,w*.5,h*.5,Math.max(w,h)*.51);
  halo.addColorStop(0,'#163941');halo.addColorStop(.58,'#091e28');halo.addColorStop(1,'#07151e');ctx.fillStyle=halo;ctx.fillRect(0,0,w,h);
  const cells=[];
  for(let i=0;i<SEG_MAJOR;i++)for(let j=0;j<SEG_MINOR;j++){
    const theta=(i+.5)*TAU/SEG_MAJOR,phi=(j+.5)*TAU/SEG_MINOR;
    const corners=[[i,j],[i+1,j],[i+1,j+1],[i,j+1]].map(([a,b])=>project(torusPoint(a*TAU/SEG_MAJOR,b*TAU/SEG_MINOR),w,h,angles));
    const normal=rotate(torusNormal(theta,phi),angles);
    const f=taylorGreen(theta,phi,time,nu);
    const normalized=display==='speed'?Math.pow(clamp(Math.hypot(f.u,f.v),0,1),.6):clamp(.5+f.vorticity/4,0,1);
    const rgb=spectral(normalized);
    const light=clamp(.50+.36*Math.max(0,normal[0]*-.35+normal[1]*.6+normal[2]*.73)+.16*Math.max(0,normal[2]),.24,1.12);
    const color=`rgb(${rgb.map(c=>clamp(Math.round(c*light),0,255)).join(',')})`;
    const z=corners.reduce((sum,p)=>sum+p.z,0)/4;
    cells.push({kind:'cell',corners,color,z,wire:i%6===0||j%5===0});
  }
  // Tangential arrow glyphs follow the same flat-chart Taylor–Green field.
  // The 3D vectors are the PUSH-FORWARD of that chart velocity, not pipe CFD.
  for(let i=0;i<14;i++)for(let j=0;j<7;j++){
    const theta=(i+.37)*TAU/14,phi=(j+.33)*TAU/7;
    const {u,v}=taylorGreen(theta,phi,time,nu);
    if(Math.hypot(u,v)<.095)continue;
    const p=project(torusPoint(theta,phi),w,h,angles);
    const tip=project(torusPoint(theta+.20*u,phi+.20*v),w,h,angles);
    if(Math.hypot(tip.x-p.x,tip.y-p.y)<4)continue;
    cells.push({kind:'arrow',from:p,to:tip,z:(p.z+tip.z)/2});
  }
  const trailLimit=9;
  for(const particle of particles){
    const trail=(particle.trail||[]).slice(-trailLimit);
    trail.push([particle.x,particle.y]);
    if(trail.length<2)continue;
    let run=[],prev=null;
    for(const [u,v] of trail){
      if(prev&&(Math.abs(u-prev[0])>.24||Math.abs(v-prev[1])>.24)){
        if(run.length>1)cells.push({kind:'particle',segments:run,z:run.reduce((s,p)=>s+p.z,0)/run.length});
        run=[];
      }
      run.push(project(torusPoint(periodic(u,1)*TAU,periodic(v,1)*TAU),w,h,angles));
      prev=[u,v];
    }
    if(run.length>1)cells.push({kind:'particle',segments:run,z:run.reduce((s,p)=>s+p.z,0)/run.length});
  }
  cells.sort((a,b)=>a.z-b.z);
  for(const item of cells){
    if(item.kind==='particle'){drawParticle(ctx,item.segments);continue;}
    if(item.kind==='arrow'){
      const {from:a,to:b}=item,dx=b.x-a.x,dy=b.y-a.y,angle=Math.atan2(dy,dx);
      ctx.strokeStyle='rgba(239,255,249,.82)';ctx.fillStyle='rgba(239,255,249,.82)';ctx.lineWidth=1.5;
      ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
      ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(b.x-4*Math.cos(angle-.55),b.y-4*Math.sin(angle-.55));
      ctx.lineTo(b.x-4*Math.cos(angle+.55),b.y-4*Math.sin(angle+.55));ctx.closePath();ctx.fill();continue;
    }
    const q=item.corners;
    ctx.beginPath();ctx.moveTo(q[0].x,q[0].y);
    for(let k=1;k<4;k++)ctx.lineTo(q[k].x,q[k].y);
    ctx.closePath();ctx.fillStyle=item.color;ctx.fill();
    // Thin same-colour stroke suppresses hairline cracks on canvas rasterizers.
    ctx.strokeStyle=item.color;ctx.lineWidth=1.15;ctx.stroke();
    if(item.wire){ctx.strokeStyle='rgba(209,255,236,.18)';ctx.lineWidth=.7;ctx.stroke();}
  }

}
export const TORUS_VISUAL_META=Object.freeze({surface:'T²',majorSegments:SEG_MAJOR,minorSegments:SEG_MINOR,
  field:'exact Taylor-Green solution on flat 2D periodic coordinates',
  representation:'curved 3D visual embedding only'});
