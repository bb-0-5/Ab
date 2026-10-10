/**
 * At-home FDM fabrication SCREEN for a decorative, flat sci-fi-style panel.
 * This designs a simple manifold, closed triangular-mesh STL with a through
 * centre cutout. It does NOT design protective armor, powered exoskeletons,
 * life-support, rocket propulsion or a flight-worthy suit.
 *
 * Minimized material is subject to chosen *geometric* frame-section proxy,
 * available print bed, temperature envelope and a dollar budget.
 * No unmeasured polymer strengths, thermal softening or fatigue properties
 * are silently promoted to certified mechanical performance.
 */
import type { OperatingCondition } from './cross_domain';

export type CostumeGoal='cosplay_forearm'|'decorative_panel'|'flight_suit_concept';
export type FilamentId='PLA'|'PETG'|'TPU';
export type V3=[number,number,number];
export interface FabInput {
 goal:CostumeGoal;
 widthMm:number;
 lengthMm:number;
 minimumRibWidthMm:number;
 minimumSectionIndexMm4:number;
 printerBedXmm:number;
 printerBedYmm:number;
 budgetAUD:number;
 ambientTemperatureK:number;
 filamentPriceAUDkg:number;
 filament:FilamentId;
}
export interface FabCandidate {
 widthMm:number;lengthMm:number;thicknessMm:number;rimWidthMm:number;
 sectionIndexMm4:number;solidMassG:number;massG:number;
 estimatedFilamentCostAUD:number;estimatedTotalCostAUD:number;
 projectedPrintHours:number;materialSavingPercent:number;
 densityGcm3:number;material:FilamentId;withinBudget:boolean;printable:boolean;
 inspectionWarnings:string[];
}
export interface FabResult{
 mode:'bounded_local_fdm_screen';
 goal:CostumeGoal;
 candidatesEvaluated:number;rejected:number;
 selected:FabCandidate|null;
 alternatives:FabCandidate[];
 bestCostUpperBoundAUD:number|null;
 missingConstraints:string[];
 feasibleForDecorativePrint:boolean;
 viableForHumanFlight:false;
 flightAssessment:string;
 condition:OperatingCondition;
 limitations:string[];
}
const FILAMENT:Record<FilamentId,{density:number;softeningK:number;notes:string}>={
 PLA:{density:1.24,softeningK:323.15,notes:'Illustrative PLA softening begins near 50°C; actual grade, annealing, stress and printer vary.'},
 PETG:{density:1.27,softeningK:343.15,notes:'Illustrative PETG thermal screening threshold ~70°C; not an independently rated component.'},
 TPU:{density:1.20,softeningK:323.15,notes:'Flexible TPU needs slicer calibration and often slower print settings; not protective safety equipment.'},
};
const round=(x:number,digits=2)=>Math.round(x*10**digits)/10**digits;
function polyArea(p:V3[]):number {
 let total=0;
 for(let i=0;i<p.length;i++){
  const a=p[i],b=p[(i+1)%p.length];total+=a[0]*b[1]-a[1]*b[0];
 }
 return Math.abs(total/2);
}
function outline(width:number,length:number,frame:number){
 const template:[number,number][]=[
  [0,-1],[.75,-.8],[1,-.32],[.79,.64],[0,.99],
  [-.79,.64],[-1,-.32],[-.75,-.8],
 ];
 const ox=width/2,oy=length/2;
 const ix=ox-frame,iy=oy-frame;
 return {outer:template.map(([x,y])=>[x*ox,y*oy,0] as V3),
  inner:template.map(([x,y])=>[x*ix,y*iy,0] as V3)};
}
function areaMm2(input:{widthMm:number;lengthMm:number;rimWidthMm:number}){
 const {outer,inner}=outline(input.widthMm,input.lengthMm,input.rimWidthMm);
 return {open:polyArea(outer)-polyArea(inner),solid:polyArea(outer)};
}
function ensureValidInput(i:FabInput){
 if(!i||!['cosplay_forearm','decorative_panel','flight_suit_concept'].includes(i.goal)
  ||!['PLA','PETG','TPU'].includes(i.filament)
  ||![i.widthMm,i.lengthMm,i.minimumRibWidthMm,i.minimumSectionIndexMm4,
   i.printerBedXmm,i.printerBedYmm,i.budgetAUD,i.ambientTemperatureK,
   i.filamentPriceAUDkg].every(Number.isFinite)
  ||i.widthMm<30||i.widthMm>400||i.lengthMm<40||i.lengthMm>400
  ||i.minimumRibWidthMm<5||i.minimumRibWidthMm>50
  ||i.minimumSectionIndexMm4<0||i.minimumSectionIndexMm4>20000
  ||i.printerBedXmm<60||i.printerBedXmm>1000||i.printerBedYmm<60||i.printerBedYmm>1000
  ||i.budgetAUD<0||i.budgetAUD>5000
  ||i.ambientTemperatureK<240||i.ambientTemperatureK>10000
  ||i.filamentPriceAUDkg<=0||i.filamentPriceAUDkg>1000)
    throw Error('Invalid printable geometry, cost, temperature or printer-bed constraints.');
}
export const DEFAULT_FAB_INPUT:FabInput={
 goal:'cosplay_forearm',widthMm:80,lengthMm:135,minimumRibWidthMm:8,
 minimumSectionIndexMm4:90,printerBedXmm:220,printerBedYmm:220,
 budgetAUD:12,ambientTemperatureK:295,filamentPriceAUDkg:30,
 filament:'PLA',
};
export function optimizePrintablePanel(input:FabInput):FabResult{
 ensureValidInput(input);
 const mat=FILAMENT[input.filament];
 const requirements=[
  'Designed for decorative cosplay or stationery only. Not a structural, impact-protective or flight-rated garment.',
  'Slicer must verify actual filament, nozzle, wall count, bed adhesion, tolerances and printer-specific support needs.',
 ];
 const thermalOK=input.ambientTemperatureK<mat.softeningK-5;
 if(!thermalOK)requirements.push('Ambient exceeds conservative filament temperature screen; printable polymer would need verified alternatives.');
 const bedOK=(input.widthMm<=input.printerBedXmm&&input.lengthMm<=input.printerBedYmm)
   ||(input.widthMm<=input.printerBedYmm&&input.lengthMm<=input.printerBedXmm);
 if(!bedOK)requirements.push('Panel exceeds print bed in both 0° and 90° flat orientations; segment or resize.');
 const feasible:FabCandidate[]=[];
 let tested=0;
 for(const thickness of [1.6,2,2.4,2.8,3.2,3.6,4]){
  for(const extra of [0,2,4,6,10,14]){
   tested++;
   const rim=input.minimumRibWidthMm+extra;
   if(rim>=input.widthMm*.38||rim>=input.lengthMm*.38)continue;
   const sec=rim*thickness**3; // geometric bending-stiffness proxy
   if(sec+1e-8<input.minimumSectionIndexMm4)continue;
   const area=areaMm2({...input,rimWidthMm:rim});
   const volumeMm3=area.open*thickness;
   const massG=volumeMm3/1000*mat.density;
   const solidMassG=area.solid*thickness/1000*mat.density;
   // Conservative solid printed ring, no sparse infill assumed; 8% waste.
   const filamentCost=massG/1000*input.filamentPriceAUDkg*1.08;
   const printingHours=massG/(input.filament==='TPU'?6:12)+.45;
   // Electricity and wear are indicative explicit assumptions, not quoting
   // market pricing or calculating a real printer's watt draw.
   const electricalCost=printingHours*.12*.32;
   const totalCost=filamentCost+electricalCost+.2;
   feasible.push({
    widthMm:input.widthMm,lengthMm:input.lengthMm,
    thicknessMm:thickness,rimWidthMm:rim,sectionIndexMm4:round(sec,2),
    solidMassG:round(solidMassG),massG:round(massG),
    estimatedFilamentCostAUD:round(filamentCost),
    estimatedTotalCostAUD:round(totalCost),
    projectedPrintHours:round(printingHours),
    materialSavingPercent:round(100*(1-massG/solidMassG)),
    densityGcm3:mat.density,material:input.filament,
    withinBudget:totalCost<=input.budgetAUD,
    printable:thermalOK&&bedOK&&totalCost<=input.budgetAUD,
    inspectionWarnings:[
      mat.notes,
      'Geometric frame-section proxy rim×thickness³ is not mechanical stiffness or a finite-element strength test.',
      'Flat 2.5D printable outline; support-free topology by construction, but actual slicing and overhang reliability unverified.',
      'No load-bearing, flight, impact, fire, toxicity or electrical performance qualification.',
    ],
   });
  }
 }
 const passing=feasible.filter(c=>c.printable)
   .sort((a,b)=>a.estimatedTotalCostAUD-b.estimatedTotalCostAUD
     ||a.massG-b.massG||a.sectionIndexMm4-b.sectionIndexMm4);
 const selected=passing[0]||null;
 const sorted=feasible.sort((a,b)=>a.estimatedTotalCostAUD-b.estimatedTotalCostAUD);
 if(!selected)requirements.push('No candidate satisfies BOTH minimum geometric section and available budget/bed/filament temperature.');
 return {mode:'bounded_local_fdm_screen',goal:input.goal,candidatesEvaluated:tested,
  rejected:tested-passing.length,selected,alternatives:sorted.slice(0,8),
  bestCostUpperBoundAUD:selected?selected.estimatedTotalCostAUD:null,
  missingConstraints:requirements,feasibleForDecorativePrint:!!selected,
  viableForHumanFlight:false,
  flightAssessment:input.goal==='flight_suit_concept'
    ?'Flight remains NOT FEASIBLE or certified: 3D-printed costume plates cannot supply controlled human-scale lift, independently verified power/thermal limits, structural redundancy, containment, and aviation qualification. No powered-flight construction instructions are generated.'
    :'No flight calculations or claims are made; this is a decorative, nonprotective part.',
  condition:{medium:'air',temperatureK:input.ambientTemperatureK,pressurePa:101325,flowSpeedMs:0},
  limitations:[
    'Manufacture estimate assumes fully solid exterior ribs and a central opening; does not claim printed polymer strength, heat tolerance or safety certification.',
    'Estimated Australian dollar cost assumes user-chosen filament price, 8% material waste, 0.12 kW for rough printing time and $0.32/kWh electricity plus $0.20; excludes machine amortization, labor, failed prints and postprocessing.',
    'A 1 mm³ = .001 cm³ volumetric conversion and illustrative filament density determine mass; CAD output is a closed manifold 2.5D part.',
    'All parts require preview in a trustworthy slicer, inspection of mesh and fit to the actual person/home/printer before printing.',
    'The geometry can resemble a sci-fi suit element; no flight-worthy propulsion, energy storage, safety controls or pressure protection is modelled.',
  ]};
}
type Triangle=[V3,V3,V3];
export function panelTriangles(candidate:FabCandidate):Triangle[]{
 const {outer,inner}=outline(candidate.widthMm,candidate.lengthMm,candidate.rimWidthMm);
 const at=(p:V3,z:number):V3=>[p[0],p[1],z];
 const tris:Triangle[]=[];
 const z=candidate.thicknessMm;
 for(let i=0;i<outer.length;i++){
  const j=(i+1)%outer.length;
  const o=outer[i],oj=outer[j],h=inner[i],hj=inner[j];
  const OT=at(o,z),OJT=at(oj,z),IT=at(h,z),IJT=at(hj,z);
  const OB=at(o,0),OJB=at(oj,0),IB=at(h,0),IJB=at(hj,0);
  tris.push([OT,OJT,IJT],[OT,IJT,IT]); // top of frame
  tris.push([OB,IJB,OJB],[OB,IB,IJB]); // bottom
  tris.push([OB,OJB,OJT],[OB,OJT,OT]); // outside rim
  tris.push([IT,IJT,IJB],[IT,IJB,IB]); // inside cutout
 }
 return tris;
}
function facetNormal([a,b,c]:Triangle):V3{
 const u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]];
 const v=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
 const cross:V3=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
 const length=Math.hypot(...cross);
 if(!Number.isFinite(length)||length<1e-8)throw Error('Degenerate mesh triangle.');
 return cross.map(n=>n/length) as V3;
}
export function panelSTL(candidate:FabCandidate):string{
 if(!candidate.printable)throw Error('Export rejected: candidate has not passed the bounded bed, heat and cost constraints.');
 const text=['solid abovebound_decorative_frame_mm'];
 for(const triangle of panelTriangles(candidate)){
  const n=facetNormal(triangle);
  text.push(` facet normal ${n.join(' ')}`,'  outer loop');
  for(const v of triangle)text.push(`   vertex ${v.join(' ')}`);
  text.push('  endloop',' endfacet');
 }
 text.push('endsolid abovebound_decorative_frame_mm');
 return text.join('\n')+'\n';
}
/** Check every undirected edge occurs exactly twice in a closed manifold STL
 * triangle soup. Mesh display and slicer validation are still required. */
export function checkPanelMesh(candidate:FabCandidate){
 const edges=new Map<string,number>();
 const k=(v:V3)=>v.map(n=>n.toFixed(7)).join(',');
 const tris=panelTriangles(candidate);
 for(const t of tris){
  facetNormal(t);
  for(let i=0;i<3;i++){
   const a=k(t[i]),b=k(t[(i+1)%3]);
   const edge=[a,b].sort().join('|');
   edges.set(edge,(edges.get(edge)||0)+1);
  }
 }
 const bad=[...edges.values()].filter(x=>x!==2).length;
 return {triangles:tris.length,uniqueEdges:edges.size,nonManifoldEdges:bad,
  watertight:bad===0};
}

/**
 * Automatic co-search across three generic printable polymers. This searches
 * the *lowest modeled material cost* that meets geometric and thermal filters.
 * It is NOT evidence of strength or mechanical performance.
 */
export function optimizeFabricationPortfolio(
 input:Omit<FabInput,'filament'>,
):FabResult{
 const scans=(['PLA','PETG','TPU'] as const).map(filament=>
   optimizePrintablePanel({...input,filament}));
 const good=scans.flatMap(x=>x.selected?[x.selected]:[]);
 good.sort((a,b)=>a.estimatedTotalCostAUD-b.estimatedTotalCostAUD||
   a.massG-b.massG);
 const chosen=good[0]||null;
 const parent=scans[0];
 return {
  ...parent,
  candidatesEvaluated:scans.reduce((sum,x)=>sum+x.candidatesEvaluated,0),
  rejected:scans.reduce((sum,x)=>sum+x.rejected,0),
  selected:chosen,
  alternatives:scans.flatMap(x=>x.alternatives).sort(
   (a,b)=>a.estimatedTotalCostAUD-b.estimatedTotalCostAUD).slice(0,12),
  bestCostUpperBoundAUD:chosen?.estimatedTotalCostAUD??null,
  feasibleForDecorativePrint:!!chosen,
  missingConstraints:chosen
   ?['Minimized modeled cost under hard budget, bed, phase proxy and geometric section constraints, NOT under a verified structural strength target.']
   :[...new Set(scans.flatMap(x=>x.missingConstraints))],
  limitations:[
   ...parent.limitations,
   'Three generic printer filament classes screened at an assumed local price per kg. This is not material-supplier market pricing and does not account for different filament feed systems.',
  ],
 };
}
