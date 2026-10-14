import React,{useEffect,useRef} from 'react';
import type {SweepProgress} from '../lib/auto_transport_sweep';
import * as THREE from 'three';
import {
 STAGE_GUIDES,type RenderArtifact,
} from '../lib/render_artifact';

/**
 * Hexfield platonic solid vocabulary:
 *   bb-0-5/hexfield/public/words/hexfield-visual.js:3113 SOLIDS
 * Three lit faces:
 *   bb-0-5/hexfield/public/iso/hexfield-iso.js:115 FACE_BRIGHTNESS
 * Ported as a small independent Canvas2D adapter to avoid another WebGL
 * context and to keep the scientific artefact's physical measurements intact.
 * The Hexfield generative stroke engine is NOT claimed to be running here.
 */
export const HEXFIELD_SOLIDS={
 cube:{faces:6,sides:4,platonic:true},
 tetrahedron:{faces:4,sides:3,platonic:true},
 octahedron:{faces:8,sides:3,platonic:true},
 dodecahedron:{faces:12,sides:5,platonic:true},
 icosahedron:{faces:20,sides:3,platonic:true},
} as const;
const FACE_BRIGHTNESS={top:1.55,right:.88,left:.48} as const;
const palette:{[key:string]:[number,number,number]}={
 Cu:[234,153,81],Si:[143,185,245],C:[180,195,216],
 Al:[225,227,237],Ti:[156,180,208],Fe:[231,151,91],
 Gd:[102,222,194],O:[225,123,153],B:[239,198,87],
};
type P={x:number;y:number;z:number};
type S={x:number;y:number};
function project(p:P):S{
 return {x:(p.x-p.z)*.82,y:(p.x+p.z)*.31-p.y*.83};
}
function drawPolygon(
 ctx:CanvasRenderingContext2D,points:S[],fill:string,stroke:string,width=1,
){
 if(!points.length)return;
 ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);
 for(const p of points.slice(1))ctx.lineTo(p.x,p.y);
 ctx.closePath();
 ctx.fillStyle=fill;ctx.fill();
 ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();
}
function color(base:[number,number,number],brightness:number,opacity=1){
 const rgb=base.map(x=>Math.round(Math.min(255,x*brightness)));
 return 'rgba('+rgb.join(',')+','+opacity+')';
}
type Facet={points:S[];depth:number;brightness:number};
function solidFacets(kind:keyof typeof HEXFIELD_SOLIDS):Facet[]{
 let geo:THREE.BufferGeometry;
 switch(kind){
  case 'tetrahedron':geo=new THREE.TetrahedronGeometry(1);break;
  case 'octahedron':geo=new THREE.OctahedronGeometry(1);break;
  case 'dodecahedron':geo=new THREE.DodecahedronGeometry(1);break;
  case 'icosahedron':geo=new THREE.IcosahedronGeometry(1);break;
  default:geo=new THREE.BoxGeometry(1.5,1.5,1.5);
 }
 const pos=geo.getAttribute('position');
 const facets:Facet[]=[];
 for(let i=0;i+2<pos.count;i+=3){
  const tri=[i,i+1,i+2].map(j=>({
   x:pos.getX(j),y:pos.getY(j),z:pos.getZ(j),
  }));
  const center=tri.reduce((a,p)=>a+p.z+p.x*.3+p.y*.2,0)/3;
  const n=new THREE.Vector3();
  const a=new THREE.Vector3(tri[0].x,tri[0].y,tri[0].z);
  const b=new THREE.Vector3(tri[1].x,tri[1].y,tri[1].z);
  const c=new THREE.Vector3(tri[2].x,tri[2].y,tri[2].z);
  n.crossVectors(b.clone().sub(a),c.clone().sub(a)).normalize();
  const brightness=n.y>.36?FACE_BRIGHTNESS.top:
   n.x-n.z>.1?FACE_BRIGHTNESS.right:FACE_BRIGHTNESS.left;
  facets.push({points:tri.map(project),depth:center,brightness});
 }
 geo.dispose();
 return facets.sort((a,b)=>a.depth-b.depth);
}
const FACES={
 tetrahedron:solidFacets('tetrahedron'),cube:solidFacets('cube'),
 octahedron:solidFacets('octahedron'),dodecahedron:solidFacets('dodecahedron'),
 icosahedron:solidFacets('icosahedron'),
};
function polyhedron(
 ctx:CanvasRenderingContext2D,which:keyof typeof FACES,
 cx:number,cy:number,r:number,base:[number,number,number],
){
 const faces=FACES[which];
 for(const face of faces){
  const points=face.points.map(p=>({x:cx+p.x*r,y:cy+p.y*r}));
  drawPolygon(ctx,points,color(base,face.brightness,.9),
   color(base,.3,.72),.7);
 }
}
function drawArtifact(canvas:HTMLCanvasElement,artifact:RenderArtifact){
 const box=canvas.getBoundingClientRect();
 const width=Math.max(240,box.width||360),height=Math.max(180,box.height||245);
 const dpr=Math.min(window.devicePixelRatio||1,2);
 canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
 const ctx=canvas.getContext('2d');if(!ctx)return;
 ctx.scale(dpr,dpr);
 ctx.fillStyle='#0a1720';ctx.fillRect(0,0,width,height);
 ctx.strokeStyle='rgba(104,179,195,.12)';ctx.lineWidth=1;
 for(let x=14;x<width;x+=22){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,height);ctx.stroke();}
 for(let y=12;y<height;y+=22){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(width,y);ctx.stroke();}
 const margin=26;
 const label=(s:string,x:number,y:number,fill='#d9e7ee')=>{
  ctx.fillStyle=fill;ctx.font='11px ui-monospace, monospace';
  ctx.fillText(s,x,y);
 };
 if(artifact.kind==='porous'){
  const res=artifact.res;
  const cell=Math.min((width-margin*2)/res,(height-48)/res);
  const left=(width-res*cell)/2,top=(height-res*cell)/2+7;
  for(let y=0;y<res;y++)for(let z=0;z<res;z++){
   const solid=artifact.cutaway[y*res+z]>0;
   ctx.fillStyle=solid?'#83c9d9':'#182b38';
   ctx.fillRect(left+y*cell+.5,top+z*cell+.5,Math.max(.5,cell-1),Math.max(.5,cell-1));
  }
  // The shortest full-volume y-through path is projected onto the y/z
  // cutaway axes, NOT falsely asserted to reside in the x-middle slice.
  if(artifact.path.length>1){
   ctx.beginPath();
   artifact.path.forEach((p,i)=>{
    const x=left+(p.y+.5)*cell,yy=top+(p.z+.5)*cell;
    if(i===0)ctx.moveTo(x,yy);else ctx.lineTo(x,yy);
   });
   ctx.strokeStyle='#ffe08a';ctx.lineWidth=Math.max(2,cell*.25);ctx.stroke();
   const a=artifact.path[0],b=artifact.path[artifact.path.length-1];
   for(const p of [a,b]){
    ctx.beginPath();ctx.arc(left+(p.y+.5)*cell,top+(p.z+.5)*cell,4,0,Math.PI*2);
    ctx.fillStyle='#fff9cc';ctx.fill();
   }
  }
  label('Y → TRANSPORT',margin,16);
  label('MID-X SOLID / VOID SECTION',margin,height-10,'#9cbbcb');
 }else if(artifact.kind==='lattice'){
  const sites=artifact.sites.map(s=>({...s,iso:project(s.position)}));
  const xs=sites.map(s=>s.iso.x),ys=sites.map(s=>s.iso.y);
  const xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys);
  const scale=Math.min((width-70)/Math.max(1,xmax-xmin),(height-60)/Math.max(1,ymax-ymin));
  const arranged=sites.map(s=>({...s,
   sx:width/2+(s.iso.x-(xmin+xmax)/2)*scale,
   sy:height/2+(s.iso.y-(ymin+ymax)/2)*scale,
  })).sort((a,b)=>a.position.y-b.position.y);
  const size=Math.max(3,Math.min(7,scale*.12));
  arranged.forEach(s=>{
   const isSecondary=s.element===artifact.materialB;
   const kind=isSecondary?'octahedron':'tetrahedron';
   polyhedron(ctx,kind,s.sx,s.sy,size,
    palette[s.element]||(isSecondary?[251,190,120]:[133,199,238]));
  });
  label(artifact.materialA+' = TETRAHEDRON',12,16);
  label(artifact.materialB+' = OCTAHEDRON',12,height-11,'#e4d3b2');
 }else if(artifact.kind==='membrane'){
  const polygons=artifact.planes.map(p=>{
   const n=new THREE.Vector3(p.normal.x,p.normal.y,p.normal.z).normalize();
   const up=Math.abs(n.y)>.85?new THREE.Vector3(0,0,1):new THREE.Vector3(0,1,0);
   const right=new THREE.Vector3().crossVectors(up,n).normalize();
   const realUp=new THREE.Vector3().crossVectors(n,right).normalize();
   return {...p,quad:[[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v])=>{
    const v3=new THREE.Vector3(p.center.x,p.center.y,p.center.z)
     .addScaledVector(right,u*p.width/2)
     .addScaledVector(realUp,v*p.height/2);
    return project(v3);
   })};
  });
  const pts=polygons.flatMap(p=>p.quad);
  const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);
  const xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys);
  const scale=Math.min((width-55)/Math.max(.1,xmax-xmin),(height-55)/Math.max(.1,ymax-ymin));
  const pal:{[key:string]:[number,number,number]}={
   wall:[110,193,219],partition:[246,180,115],floor:[136,223,180],
   ceiling:[185,166,229],spiral:[244,169,204],layer:[207,199,127],
  };
  polygons.forEach(p=>{
   const pp=p.quad.map(q=>({
    x:width/2+(q.x-(xmin+xmax)/2)*scale,
    y:height/2+(q.y-(ymin+ymax)/2)*scale,
   }));
   const base=pal[p.role]||[168,199,214];
   drawPolygon(ctx,pp,color(base,.7,.48),color(base,1,.96),1.5);
  });
  label(artifact.sourceCount+' DETECTED PLANES',10,17);
  label('ACTUAL V5 BOUNDARIES',10,height-10,'#bdd5dc');
 }else if(artifact.kind==='chemistry'){
  const parts=artifact.composition;
  const total=parts.reduce((sum,p)=>sum+p.fraction,0)||1;
  const w=width/(parts.length+1);
  parts.forEach((p,i)=>{
   const fraction=p.fraction/total;
   const shape:(keyof typeof FACES)=
    (['tetrahedron','octahedron','icosahedron','dodecahedron','cube'] as const)[i%5];
   const size=Math.max(13,Math.min(55,fraction*70));
   const x=w*(i+1),y=height/2+5;
   polyhedron(ctx,shape,x,y,size,palette[p.symbol]||[155,212,225]);
   label(p.symbol,x-12,y+size+30);
   label((fraction*100).toFixed(1)+'%',x-15,y+size+44,'#b5d0df');
  });
  label('SYMBOLIC POLYHEDRA · MASS FRACTIONS',12,18);
  label('NOT A MOLECULAR STRUCTURE',12,height-10,'#e8ce99');
 }
}
export function HexfieldArtifactInspector({
 stage,metric,detail,handoff,completed,artifact,transport,
}:{
 stage:string;metric:string;detail:string;handoff:string;
 completed:string[];artifact:RenderArtifact|null;
 transport:SweepProgress|null;
}){
 const guide=STAGE_GUIDES[stage]||STAGE_GUIDES.v0;
 const canvasRef=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
  const canvas=canvasRef.current;if(!canvas||!artifact)return;
  drawArtifact(canvas,artifact);
  const ro=typeof ResizeObserver!=='undefined'?
   new ResizeObserver(()=>drawArtifact(canvas,artifact)):null;
  ro?.observe(canvas);
  return ()=>ro?.disconnect();
 },[artifact]);
 const done=completed.includes(stage);
 const negative=/BLOCKED|FAILED|zero flow|no transport|NO THROUGH/i
   .test(metric+' '+detail);
 return <section
   aria-label="What this simulation means"
   className="mt-3 border border-cyan-500/30 rounded-xl bg-[#07131d] p-3 sm:p-4"
 >
  <div className="flex flex-wrap items-center justify-between gap-2">
   <div className="min-w-0">
    <div className="uppercase tracking-[.13em] text-[10px] font-bold text-cyan-300">
     What is happening · {stage.toUpperCase()}
    </div>
    <h3 className="font-semibold text-lg leading-snug text-white">{guide.name}</h3>
   </div>
   <span className={'rounded px-2 py-1 font-mono text-[11px] font-bold '+
    (negative?'bg-rose-500/15 text-rose-200 border border-rose-500/50':
     done?'bg-emerald-500/15 text-emerald-200 border border-emerald-500/50':
     'bg-amber-500/15 text-amber-100 border border-amber-500/50')}>
    {negative?'BLOCKED / NEGATIVE RESULT':done?'ARTIFACT HANDED OFF':'LIVE EXPERIMENT'}
   </span>
  </div>
  <p className="mt-2 text-slate-200 text-[13px] leading-relaxed">
   <span className="text-sky-300 font-bold">IN </span>{guide.input}
   <span className="text-slate-500 mx-2">→</span>
   <span className="text-amber-200 font-bold">DO </span>{guide.action}
   <span className="text-slate-500 mx-2">→</span>
   <span className="text-emerald-300 font-bold">OUT </span>{guide.output}
  </p>
  <p className="mt-2 text-[13px] font-semibold text-white">
   Watch for: <span className="font-normal text-slate-200">{guide.watch}</span>
  </p>
  {(stage==='v1'||stage==='v2')&&(
   <div className="mt-3 rounded-lg border-2 border-amber-400/60 bg-amber-300/10 p-3">
    <p className="font-bold text-[14px] text-amber-100">
     THESE DOTS ARE NOT ELECTRONS, AIR OR WATER
    </p>
    <p className="mt-1 text-[13px] text-white/90 leading-relaxed">
     Each dot is a particle-swarm optimisation (PSO) search agent tracking
     a candidate location in a 3D geometry score field. Its acceleration
     comes from computer-search rules, not Newtonian or Lorentz forces.
     The two swarms start biased toward perpendicular planes, which explains
     the flat-looking sheet and the trajectories converging into clusters.
     Their score is dimensionless, not heat, charge, pressure or velocity.
    </p>
    <p className="mt-1 text-[12px] text-amber-100">
     Actual air/water properties and metal conductivity are tested separately
     on the V9 material voxels and V10 solid/void geometry.
    </p>
   </div>
  )}
  {transport&&(
   <div className="mt-3 rounded-lg border border-emerald-400/40 bg-emerald-400/5 p-3" aria-label="Automatic material and flow sweep">
    <div className="flex flex-wrap gap-2 items-baseline justify-between">
     <strong className="text-emerald-200 text-[13px]">
       AUTO-SWEEP · materials + pores + cooling fluids
     </strong>
     <span className="font-mono text-[12px] text-white">
       {transport.evaluated} of 40 modeled cases ·
       {transport.complete?' selected':' comparing'}
     </span>
    </div>
    <p className="text-[12px] text-white mt-1">
      {transport.best
        ?'Current air-cooled candidate: '+transport.best.candidateLabel+
          ' · '+transport.best.structure+' solid lattice · '+
          transport.best.tpms+' pores'
        :'Testing reference metals and lattice geometries; no selected design yet.'}
    </p>
    {transport.airBest&&
      <p className="mt-1 text-[12px] text-sky-200">
       AIR (20°C): modeled effective k ≈
       {' '+transport.airBest.modeledEffectiveThermalKWmK.toPrecision(3)}
       {' W/(m·K)'} · Y void route
       {transport.airBest.fluidSpansY?' OPEN':' BLOCKED'} ·
       {transport.airBest.candidate}
      </p>}
    {transport.waterBest&&
      <p className="mt-1 text-[12px] text-blue-200">
       WATER (20°C): modeled effective k ≈
       {' '+transport.waterBest.modeledEffectiveThermalKWmK.toPrecision(3)}
       {' W/(m·K)'} · Y void route
       {transport.waterBest.fluidSpansY?' OPEN':' BLOCKED'} ·
       {transport.waterBest.candidate}
      </p>}
    {transport.goal==='electrical'&&transport.best&&
      <p className="mt-1 text-[12px] text-yellow-100">
       Solid X conductor: approximate σ
       {' '+(transport.best.estimatedSolidPathSigmaSm||0).toExponential(2)}
       {' S/m'} · not AC impedance or electrons in motion
      </p>}
    <p className="mt-2 text-[11px] text-slate-300">
      Material properties are room-temperature references. Air/water heat
      results assume stationary fluid; void routing is six-connected geometry,
      not pressure drop, actual flow, convection, corrosion or manufacturing proof.
    </p>
   </div>
  )}
  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 items-start">
   <div className="rounded-md border border-white/10 bg-black/25 p-3 min-w-0">
    <div className="text-[10px] uppercase font-bold tracking-widest text-sky-300 mb-1">
     Live observation · original simulation
    </div>
    <div className="text-lg font-bold text-white break-words">{metric}</div>
    <div className="text-[12px] text-slate-300 mt-1 break-words">{detail}</div>
    <p className="text-[11px] font-mono text-amber-200 mt-3 break-words">{handoff}</p>
   </div>
   <div className="min-w-0">
    <div className="text-[10px] uppercase font-bold tracking-widest text-emerald-300 mb-1">
      Hexfield · Platonic artifact translation
    </div>
    {artifact?<>
      <canvas ref={canvasRef} width={420} height={245}
       className="w-full h-[245px] rounded border border-white/20 bg-[#0a1720]"
       role="img" aria-label={
        artifact.kind==='porous'?'Cutaway of actual membrane voxels and projected connected path':
        artifact.kind==='lattice'?'Platonic polyhedra marking sampled occupied lattice sites':
        artifact.kind==='membrane'?'Rendered boundaries derived from V5 measured planes':
        'Platonic polyhedra symbolizing V13 composition proportions'
       }/>
      <p className="mt-1 text-[11px] text-slate-300">
       {artifact.kind==='porous'
         ?'Blue = model solid · dark = void · gold = projected full-volume connected path.'
         :artifact.kind==='lattice'
           ?'One symbol per sampled occupied site. Shape distinguishes elements, not real atomic orbitals.'
           :artifact.kind==='membrane'
             ?'Semi-transparent faces correspond to detected V5 planes, shown without upstream clutter.'
             :'Polyhedra encode actual proposed elemental fractions, not bond geometry.'}
      </p>
      <p className="mt-1 text-[10px] text-amber-200 font-mono">
       {artifact.id} · MODEL ONLY · frozen drawing of a bounded source snapshot
      </p>
    </>:<div className="min-h-[135px] rounded border border-dashed border-white/20 flex flex-col items-center justify-center text-center p-4">
       <strong className="text-sm text-slate-100">
        {stage==='v1'||stage==='v2'
          ?'SEARCH ALGORITHM · no molecular object to render'
          :'No constructed solid in this stage'}
       </strong>
       <span className="text-[12px] text-slate-300 mt-1">
        {['v5','v9','v10','v13','elements'].includes(stage)
          ?'Waiting for real model geometry. No decorative object substituted.'
          :stage==='v1'||stage==='v2'
            ?'The raw canvas above shows optimisation probes. Materials and fluids are evaluated by a separate physical-property screen.'
            :'This stage calculates evidence. A Platonic object appears for V5, V9, V10 and V13.'}
       </span>
     </div>}
   </div>
  </div>
 </section>;
}
