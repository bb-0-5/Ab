/**
 * AboveBound's renderer-neutral, bounded visual handoff contract.
 * Original V5/V9/V10/V13 engines remain the source of numeric truth.
 * Canvas style is an interpretation, not a replacement solver.
 */
import type {V5Engine} from '../simulations/v5';
import type {V9LatticeEngine} from '../simulations/v9_lattice';
import type {V10MeshEngine} from '../simulations/v10_mesh';
import type {V13MaterialEngine} from '../simulations/v13_material';

export type StageGuide={name:string;input:string;action:string;output:string;watch:string};
export const STAGE_GUIDES:Record<string,StageGuide>={
 v0:{name:'Harmonic field',input:'Prime and odd-number frequencies',action:'Oscillate a 400-node field',output:'Measured intensity distribution',watch:'The changing height and colour of the field'},
 v1:{name:'Material explorers',input:'Current V9/V10 material fitness',action:'Move particles through candidate positions',output:'Settled or high-fitness sites',watch:'Which dots slow down and cluster'},
 v2:{name:'Cross-plane explorers',input:'V1 discoveries and shared material',action:'Search an orthogonal plane',output:'Second set of candidate sites',watch:'Where both searches agree or diverge'},
 v3:{name:'Route skeleton',input:'V1 points and V11 constraints',action:'Connect sites by a minimal route tree',output:'Chosen low-length network',watch:'Bright chosen links rather than faint alternatives'},
 v4:{name:'Orthogonal routes',input:'V2 points and V11 constraints',action:'Build a second route tree',output:'Cross-plane network',watch:'Where the two route networks intersect'},
 v5:{name:'Membrane boundaries',input:'V3/V4 route loops',action:'Extract physical boundary planes',output:'Walls, partitions and membrane surfaces',watch:'The coloured planes are the actual model objects'},
 v6:{name:'Flow experiment',input:'V5 boundaries and route network',action:'Calculate transport and resistance',output:'Measured model flow or blockage',watch:'Zero paths is a failed experiment, not success'},
 v7:{name:'Optimizer / critic',input:'V6 results',action:'Retest changes to upstream parameters',output:'Accepted or rejected revisions',watch:'Accepted versus rejected experiments'},
 v8:{name:'Mathematical probe',input:'Prime spectrum and zeta model',action:'Analyse the mathematical patterns',output:'Spectrum / candidate geometry seed',watch:'This is mathematical evidence, not material chemistry'},
 v9:{name:'Material lattice',input:'V13 hypothesis and V8 seed',action:'Arrange known-reference elemental sites',output:'Occupied lattice and material field',watch:'Polyhedra depict sampled actual occupied sites'},
 v10:{name:'Porous membrane',input:'V9 material field',action:'Carve TPMS geometry and test connected pores',output:'Solid/void mask and proven channel',watch:'Gold path = physically adjacent void voxels'},
 v11:{name:'Hardware packaging',input:'Designed membrane and interfaces',action:'Define shell, ports and constraints',output:'Hardware boundary geometry',watch:'Ports and shell limits, not fabricated components'},
 v12:{name:'Use-case environment',input:'Building and climate model',action:'Calculate thermal requirements',output:'HVAC load and material work order',watch:'Room temperature versus target'},
 v13:{name:'Composition experiment',input:'V12/V6 material requirement',action:'Screen elemental mixture model',output:'Candidate composition and estimated properties',watch:'A chemical hypothesis, not a validated compound'},
 elements:{name:'Composition experiment',input:'V12/V6 requirements',action:'Screen elemental candidates',output:'Estimated properties',watch:'Estimates are not lab measurements'},
};
export type Vec3={x:number;y:number;z:number};
export type RenderArtifact=
 |{kind:'membrane';id:string;stage:'v5';modelOnly:true;sourceCount:number;
   planes:{id:number;role:string;center:Vec3;normal:Vec3;width:number;height:number;state:string}[]}
 |{kind:'lattice';id:string;stage:'v9';modelOnly:true;sourceCount:number;structure:string;
   materialA:string;materialB:string;sites:{position:Vec3;element:string}[]}
 |{kind:'porous';id:string;stage:'v10';modelOnly:true;res:number;
   tpms:string;porosity:number;solidPercent:number;connected:boolean;
   cutaway:number[];path:{y:number;z:number}[];pathCount:number}
 |{kind:'chemistry';id:string;stage:'v13';modelOnly:true;
   composition:{symbol:string;fraction:number}[];
   meltingPointK:number;thermalConductivityWmK:number;
   screening:string};

const vec=(p:Vec3):Vec3=>({x:p.x,y:p.y,z:p.z});
const safe=(n:number)=>Number.isFinite(n)?n:0;
export function captureRenderArtifact(
 stage:string,refs:{
  v5?:V5Engine|null;v9?:V9LatticeEngine|null;
  v10?:V10MeshEngine|null;v13?:V13MaterialEngine|null;
 },id?:string,
):RenderArtifact|null{
 const artifactId=id||stage+'-live';
 if(stage==='v5'){
  const planes=refs.v5?.getBoundaryPlanes()||[];
  if(!planes.length)return null;
  return {kind:'membrane',id:artifactId,stage:'v5',modelOnly:true,
   sourceCount:planes.length,
   planes:planes.slice(0,28).map(p=>({
    id:p.id,role:p.role,center:vec(p.center),normal:vec(p.normal),
    width:safe(p.width),height:safe(p.height),state:p.state,
   }))};
 }
 if(stage==='v9'){
  const e=refs.v9;
  if(!e||!e.cells.length)return null;
  const occupied=e.cells.filter(c=>c.occupied);
  const stride=Math.max(1,Math.ceil(occupied.length/100));
  return {kind:'lattice',id:artifactId,stage:'v9',modelOnly:true,
   sourceCount:occupied.length,structure:e.structure,
   materialA:e.primaryElement,materialB:e.secondaryElement,
   sites:occupied.filter((_,i)=>i%stride===0).slice(0,100).map(c=>({
    position:vec(c.position),element:c.element.symbol,
   }))};
 }
 if(stage==='v10'){
  const e=refs.v10,mask=e?.getSolidMask(),c=e?.getConnectivity();
  if(!e||!mask||!c)return null;
  const res=e.getResolution();
  if(mask.length!==res*res*res)return null;
  const middle=Math.floor(res/2),cutaway:number[]=[];
  // A real x-middle section through the y-z voxel grid; not invented TPMS.
  for(let y=0;y<res;y++)for(let z=0;z<res;z++)
   cutaway.push(mask[middle*res*res+y*res+z]>.5?1:0);
  const path=e.throughPath.slice(0,250).map(idx=>({
   y:Math.floor(idx%(res*res)/res),z:idx%res,
  }));
  const n=c.solidCount+c.voidCount;
  return {kind:'porous',id:artifactId,stage:'v10',modelOnly:true,
   res,tpms:e.config.tpms,porosity:safe(e.getMetrics().porosity),
   solidPercent:n?c.solidCount/n*100:0,
   connected:Boolean(c.spanning.y),cutaway,path,pathCount:e.throughPath.length};
 }
 if(stage==='v13'||stage==='elements'){
  const e=refs.v13,c=e?.getLatestComposite();
  if(!e||!c)return null;
  const screens=e.getRequirementScreenings();
  return {kind:'chemistry',id:artifactId,stage:'v13',modelOnly:true,
   composition:c.elements.slice(0,8).map(row=>({
    symbol:row.element.sym,fraction:safe(row.fraction),
   })),
   meltingPointK:safe(c.properties.meltingPoint),
   thermalConductivityWmK:safe(c.properties.thermalConductivity),
   screening:screens[0]?.status||'no active requirement'};
 }
 return null;
}
