/**
 * Reproduces the V10 MeshEngine's TPMS implicit fields for locally computed
 * 3-D solid/void masks. IMPORTANT: V10's public solidMask is x*n*n+y*n+z;
 * the CFD engine uses (z*n+y)*n+x. toSliceMask handles this precisely.
 * Geometry is dimensionless: CFD material thermal conduction is not modeled.
 */
const TPMS=['gyroid','diamond','schwarz_p','lidinoid','neovius'];
const TAU=Math.PI;
export function tpmsValue(type,x,y,z,frequency){
 const f=frequency*TAU,X=x*f,Y=y*f,Z=z*f;
 const sx=Math.sin(X),sy=Math.sin(Y),sz=Math.sin(Z),cx=Math.cos(X),cy=Math.cos(Y),cz=Math.cos(Z);
 switch(type){
  case 'gyroid':return sx*cy+sy*cz+sz*cx;
  case 'diamond':return sx*sy*sz+sx*cy*cz+cx*sy*cz+cx*cy*sz;
  case 'schwarz_p':return cx+cy+cz;
  case 'lidinoid':return .5*(Math.sin(2*X)*cy*sz+Math.sin(2*Y)*cz*sx+Math.sin(2*Z)*cx*sy)-.5*(Math.cos(2*X)*Math.cos(2*Y)+Math.cos(2*Y)*Math.cos(2*Z)+Math.cos(2*Z)*Math.cos(2*X))+.15;
  case 'neovius':return 3*(cx+cy+cz)+4*cx*cy*cz;
  default:throw Error('Unsupported V10 TPMS type: '+type);
 }
}
/** Sample at V10's [-bounds,+bounds] lattice-node positions, with z indexed last.
 * Each rectangular CFD axis has its own cell count; isotropic coordinates
 * still span the same bounds. Output uses CFD z-major storage.
 */
export function buildV10Mask({n=19,layers=9,tpms='gyroid',frequency=1.1,threshold=0.2,roughness=0,bounds=2}={}){
 if(!TPMS.includes(tpms)||!Number.isInteger(n)||n<5||n>39||!Number.isInteger(layers)||layers<3||layers>39|| ![frequency,threshold,roughness,bounds].every(Number.isFinite)||frequency<=0||bounds<=0)throw Error('Invalid V10 geometry');
 const mask=new Uint8Array(n*n*layers);
 let solidCount=0;
 for(let k=0;k<layers;k++)for(let j=0;j<n;j++)for(let i=0;i<n;i++){
  const x=i*2*bounds/(n-1)-bounds,y=j*2*bounds/(n-1)-bounds,z=k*2*bounds/(layers-1)-bounds;
  const roughNoise=roughness*Math.sin(x*17.3)*Math.cos(y*13.7)*Math.sin(z*19.1);
  const solid=tpmsValue(tpms,x,y,z,frequency)+roughNoise>threshold?1:0;
  mask[(k*n+j)*n+i]=solid;solidCount+=solid;
 }
 return {mask,n,layers,config:{tpms,frequency,threshold,roughness,bounds},voidFraction:1-solidCount/mask.length};
}
/** Ingest an EXISTING V10MeshEngine.solidMask from a cubic mesh without
 * lossy interpolation. Its native storage order is (x*n+y)*n+z.
 */
export function fromV10SolidMask(v10Mask,n){
 if(!Number.isInteger(n)||n<5||!v10Mask||v10Mask.length!==n**3)throw Error('Expected complete cubic V10 solidMask');
 const out=new Uint8Array(n**3);
 for(let x=0;x<n;x++)for(let y=0;y<n;y++)for(let z=0;z<n;z++)out[(z*n+y)*n+x]=v10Mask[x*n*n+y*n+z]>0.5?1:0;
 return out;
}
/** Six-neighbour fluid connectivity from heated bottom y=0 to cold plate y=n-1.
 * No geometry is accepted on the basis of porosity alone.
 */
export function poreConnectivity(mask,n,layers){
 if(mask.length!==n*n*layers)throw Error('Invalid mask dimensions');
 const idx=(x,y,z)=>(z*n+y)*n+x;
 const seen=new Uint8Array(mask.length),queue=new Int32Array(mask.length);
 let head=0,tail=0,fluid=0;
 for(let i=0;i<mask.length;i++)fluid+=mask[i]===0?1:0;
 for(let z=0;z<layers;z++)for(let x=0;x<n;x++){
  const i=idx(x,0,z);if(!mask[i]&&!seen[i]){seen[i]=1;queue[tail++]=i;}
 }
 let reachesTop=false;
 while(head<tail){
  const q=queue[head++],x=q%n,y=Math.floor(q/n)%n,z=Math.floor(q/(n*n));
  if(y===n-1)reachesTop=true;
  for(const [xx,yy,zz] of [[x-1,y,z],[x+1,y,z],[x,y-1,z],[x,y+1,z],[x,y,z-1],[x,y,z+1]]){
   if(xx<0||xx>=n||yy<0||yy>=n||zz<0||zz>=layers)continue;
   const h=idx(xx,yy,zz);if(!mask[h]&&!seen[h]){seen[h]=1;queue[tail++]=h;}
  }
 }
 return {reachesTop,connectedFluidCells:tail,fluidCells:fluid,connectedVoidFraction:fluid?tail/fluid:0,voidFraction:fluid/mask.length};
}
export const V10_CANDIDATES=Object.freeze([
 {tpms:'gyroid',frequency:.8,threshold:.2,roughness:0},
 {tpms:'diamond',frequency:.8,threshold:.12,roughness:0},
 {tpms:'schwarz_p',frequency:.8,threshold:.35,roughness:0},
 {tpms:'gyroid',frequency:1.1,threshold:.30,roughness:0},
 {tpms:'lidinoid',frequency:.8,threshold:.25,roughness:0},
 {tpms:'neovius',frequency:.8,threshold:.55,roughness:0},
]);
