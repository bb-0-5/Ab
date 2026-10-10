/**
 * Typed shared-discovery bus. V0–V13 engines can REQUEST materials or report
 * hypotheses; independent domain probes decide what is actually supported.
 *
 * Never turn an unvalidated isotope/nuclear prediction into a fabricated
 * thermal conductivity, melting point, catalyst yield or PCB performance.
 * Temperature/medium must be explicit: 5000 K in vacuum is a different
 * physical regime from 300 K in water or moving air.
 */
export type Medium='vacuum'|'air'|'water';
export interface OperatingCondition {
 medium:Medium;temperatureK:number;pressurePa:number;
 flowSpeedMs:number;
}
export type Task='heat_spreader'|'thermal_barrier'|'flow_membrane';
export type DiscoveryKind='material_candidate'|'isotope_hypothesis'|'membrane_need'|'kinetic_fit'|'rf_interface';
export type Evidence='reference_temperature_only'|'measured_user_data'|'hypothesis';
export interface Discovery {
 id:string;kind:DiscoveryKind;producer:'chemistry'|'membrane'|'building'|'circuits';
 label:string;
 createdAt:string;
 evidence:Evidence;source:string;
 condition:OperatingCondition;
 property?:{
  id:string;thermalConductivityWmK:number|null;phaseLimitK:number|null;
  atomicNumber?:number;massNumber?:number;
 };
 task?:Task;
}
export interface Probe {
 discoveryId:string;domain:'chemistry'|'membrane'|'building'|'circuits';
 condition:OperatingCondition;status:'conditional'|'unsupported'|'rejected';
 message:string;
 score:number|null;
}
export interface MaterialReport {
 condition:OperatingCondition;task:Task;targetDescription:string;
 totalCandidates:number;passingCandidates:number;
 selected:MaterialOption|null;alternatives:MaterialOption[];
 unmetRequirements:string[];discoveries:Discovery[];crossDomain:Probe[];
 limitations:string[];
}
export interface MaterialOption {
 id:string;label:string;thermalConductivityWmK:number;
 meltingPointK:number;meltingPointSource:string;
 status:'conditional'|'rejected';
 reason:string;heatFluxWm2:number|null;
 thermalResistanceM2KW:number|null;
}
const NIST='https://www.nist.gov/system/files/documents/calibrations/mono126.pdf';
/**
 * Melting points: NIST Monograph 126 (platinum resistance thermometry,
 * metal fixed points). Room-temperature bulk thermal conductivities below
 * are rounded illustrative screening values, NOT certified vendor data.
 */
export const REFERENCE_MATERIALS=[
 {id:'copper',label:'Copper (bulk)',k:400,melting:1357.6,z:29,isotope:63},
 {id:'aluminium',label:'Aluminium (bulk)',k:235,melting:933.47,z:13,isotope:27},
 {id:'tungsten',label:'Tungsten (bulk)',k:170,melting:3695,z:74,isotope:184},
] as const;
export function checkCondition(c:OperatingCondition):string|null {
 if(!c||!['vacuum','air','water'].includes(c.medium)
  ||![c.temperatureK,c.pressurePa,c.flowSpeedMs].every(Number.isFinite)
  ||c.temperatureK<=0||c.temperatureK>10000||c.pressurePa<0||c.pressurePa>1e9
  ||c.flowSpeedMs<0||c.flowSpeedMs>500)return 'Invalid medium, temperature, pressure or flow.';
 if(c.medium==='vacuum'&&c.pressurePa>10)
  return 'Vacuum scenario requires pressure ≤10 Pa; do not invent air/water convection.';
 if(c.medium==='water'){
  if(c.pressurePa<1000)return 'Liquid-water medium is incompatible with this near-vacuum pressure.';
  // Water critical point ~647 K, ~22.064 MPa (NIST WebBook);
  // above it no distinct liquid phase, regardless of pressure.
  if(c.temperatureK>=647)return 'Water exceeds its ~647 K critical point; the liquid-water model is inapplicable.';
  if(c.temperatureK<273.15)return 'Water is below nominal freezing point; no brine/supercooling model.';
  // conservative simple envelope, not an exact boiling curve
  if(c.pressurePa<80000|| (c.temperatureK>373&&c.pressurePa<1e6))
   return 'Liquid water under these temperature/pressure conditions is unverified by a phase model.';
 }
 if(c.medium==='air'&&c.pressurePa<100)
  return 'No validated air-current model at this very low gas pressure.';
 return null;
}
export function defaultCondition(medium:Medium):OperatingCondition{
 return {medium,temperatureK:medium==='vacuum'?300:295,
  pressurePa:medium==='vacuum'?0.001:101325,
  flowSpeedMs:medium==='vacuum'?0:1};
}
const uuid=(label:string,c:OperatingCondition)=>`${label}|${c.medium}|${c.temperatureK}|${c.pressurePa}|${c.flowSpeedMs}`;
const iso=(label:string,c:OperatingCondition,producer:Discovery['producer'])=>({
 id:uuid(label,c),createdAt:'model_reference_v1',condition:c,producer,
});
export function materialCandidates(c:OperatingCondition,task:Task):MaterialOption[] {
 const envIssue=checkCondition(c);
 return REFERENCE_MATERIALS.map(m=>{
  const safeSolid= c.temperatureK<=m.melting*0.8;
  const unknownSurface=c.temperatureK>900;
  const reason=envIssue
   ?envIssue
   :!safeSolid?'Rejected: exceeds conservative 80%-of-melting-point thermal screen. Solid-phase survival not supported.'
   :unknownSurface?'Air oxidation, vacuum evaporation and water corrosion unvalidated above 900 K.'
   :c.medium==='water'?'Water corrosion/erosion and sealing not measured. Conditional thermal-only match.'
   :c.medium==='vacuum'?'No convective cooling in vacuum; heat transport is solid conduction and radiation only. Surface evaporation unmeasured.'
   :'Air oxidation and mechanical strength are unverified; thermal conduction screening only.';
  const thicknessM=.001;
  const targetDeltaK=15; // illustration, not environmental differential
  const resistance=thicknessM/m.k;
  const conduction=targetDeltaK/resistance;
  const accepted=!envIssue&&safeSolid&&!unknownSurface
    &&(task==='heat_spreader'?m.k>=150:task==='thermal_barrier'?m.k<5:m.k>=10);
  return {id:m.id,label:m.label,thermalConductivityWmK:m.k,
   meltingPointK:m.melting,meltingPointSource:NIST,
   status:accepted?'conditional' as const:'rejected' as const,
   reason:accepted?reason:(task==='thermal_barrier'&&m.k>=5
    ?'Bulk metal cannot serve as a low-conductivity thermal barrier in this simple metric.':reason),
   // This is Fourier conduction ONLY, not actual convective membrane design.
   heatFluxWm2:accepted?conduction:null,
   thermalResistanceM2KW:accepted?resistance:null};
 });
}
export function proposeMaterialDiscoveries(c:OperatingCondition):Discovery[]{
 return REFERENCE_MATERIALS.map(m=>({
  ...iso(`material:${m.id}`,c,'chemistry'),kind:'material_candidate',label:m.label,
  evidence:'reference_temperature_only',source:NIST,
  property:{id:m.id,thermalConductivityWmK:m.k,phaseLimitK:m.melting,
    atomicNumber:m.z,massNumber:m.isotope},
 }));
}
export function proposeIsotopeHypotheses(c:OperatingCondition):Discovery[] {
 return REFERENCE_MATERIALS.map(m=>({
  ...iso(`isotope:${m.id}-${m.isotope}`,c,'chemistry'),
  kind:'isotope_hypothesis' as const,label:`${m.label} isotope mass ${m.isotope}`,
  evidence:'hypothesis' as const,
  source:'Existing element/isotope reference; isotope-specific conductivity and phase changes NOT measured.',
  property:{id:m.id,atomicNumber:m.z,massNumber:m.isotope,
    phaseLimitK:null,thermalConductivityWmK:null},
 }));
}
export function membraneNeed(c:OperatingCondition,task:Task):Discovery{
 return {...iso(`membrane:${task}`,c,'membrane'),kind:'membrane_need',
  label:`Membrane request: ${task.replaceAll('_',' ')}`,
  evidence:'hypothesis',source:'User-design requirement; not a measured material property.',task};
}
export function probeDiscovery(d:Discovery,condition:OperatingCondition):Probe[] {
 const domains:Probe['domain'][]=['membrane','building','circuits','chemistry'];
 const issue=checkCondition(condition);
 return domains.map(domain=>{
  const reject=(message:string):Probe=>({discoveryId:d.id,domain,condition,status:'rejected',message,score:null});
  const unknown=(message:string):Probe=>({discoveryId:d.id,domain,condition,status:'unsupported',message,score:null});
  if(issue)return reject(issue);
  if(d.kind==='membrane_need')return unknown('Unfulfilled material-property request; chemistry or materials evidence must supply an independently tested candidate.');
  if(d.kind==='isotope_hypothesis')return unknown(
   'Atomic number/mass do not identify isotope-dependent melting, thermal conductivity, electronics or reaction yield. Cannot assign a physical advantage without measurements.');
  if(d.kind==='kinetic_fit')return domain==='chemistry'
    ?unknown('Condition-specific empirical fit may be reused only for its reaction/medium/temperature range; no isotope or material property inferred.')
    :unknown('A chemical yield fit is not a material, membrane, building or RF constitutive law.');
  if(d.kind==='rf_interface')return domain==='circuits'
    ?unknown('RF impedance estimate requires source/load, frequency and stackup at this operating condition.')
    :unknown('A passive electrical match cannot establish structural, membrane or chemical suitability.');
  const phase=d.property?.phaseLimitK,conductivity=d.property?.thermalConductivityWmK;
  if(phase===null||phase===undefined||conductivity===null||conductivity===undefined)
    return unknown('Missing measured/traceable thermal properties.');
  if(condition.temperatureK>phase*0.8)
    return reject('Conservative solid-state screen failed: temperature >80% of reference melt point.');
  if(condition.temperatureK>900)
    return unknown('High-temperature vaporisation/oxidation/radiation/creep not modelled; no qualified hardware use case.');
  if(domain==='chemistry')
    return unknown('Thermal material reference cannot infer catalytic pathways, reaction rates or isotope yield.');
  if(domain==='circuits')
    return unknown('Bulk thermal conductivity cannot determine frequency-dependent trace resistance, dielectric response or RF impedance.');
  if(domain==='building')
    return {discoveryId:d.id,domain,condition,status:'conditional',
      message:'Room-temperature bulk conduction may inform a heat-spreader sensitivity study; no complete wall assembly U-value or embodied energy.',
      score:conductivity};
  return {discoveryId:d.id,domain,condition,status:'conditional',
    message:'Fourier conduction thermal-only use; thickness, convection, radiation, erosion, creep and chemical compatibility require separate screening.',
    score:conductivity};
 });
}
export function screenMembrane(c:OperatingCondition,task:Task,prior:Discovery[]=[]):MaterialReport{
 if(!['heat_spreader','thermal_barrier','flow_membrane'].includes(task))throw Error('Unknown membrane task.');
 const conditionIssue=checkCondition(c);
 const options=materialCandidates(c,task);
 const passing=options.filter(x=>x.status==='conditional')
   .sort((a,b)=>task==='thermal_barrier'
    ?a.thermalConductivityWmK-b.thermalConductivityWmK
    :b.thermalConductivityWmK-a.thermalConductivityWmK);
 const fresh=[membraneNeed(c,task),...proposeMaterialDiscoveries(c)];
 const crossDomain=[...fresh,...prior.slice(0,12)].flatMap(d=>probeDiscovery(d,c));
 return {
  condition:c,task,
  targetDescription:task==='heat_spreader'?'Spread heat by solid conduction':
   task==='thermal_barrier'?'Minimise thermal conduction':
    'Allow channel flow without unacceptable losses',
  totalCandidates:options.length,passingCandidates:passing.length,
  selected:passing[0]||null,alternatives:options,
  unmetRequirements:conditionIssue?[conditionIssue]:
   passing.length?['Mechanical stress, assembly geometry, oxidation/corrosion and material certification not evaluated.']:
    ['No catalogue material passes the bounded physical-property screen. A new material needs independently measured phase limits and transport properties before selection.'],
  discoveries:fresh,crossDomain,
  limitations:[
   'Melting points are metal fixed-point reference values (NIST); thermal conductivities are rounded room-temperature illustrative values, not measured samples.',
   'An isotope specification does not imply improved material conductivity. Nuclear production, isotope enrichment and hazard assessments are entirely out of scope.',
   'Vacuum removes bulk fluid convection, but NOT solid conduction and thermal radiation. At 5000 K none of these catalogue solids passes the melt screen.',
   'Fluid pressure/phase, oxidation, sublimation, corrosion, mechanical stress, fluid channel turbulence and manufacturing cannot be inferred from the simple thermal screen.',
  ]};
}
export function extractDiscoveriesFromHistory(
 entries:readonly {result?:unknown}[],max=24,
):Discovery[]{
 const byId=new Map<string,Discovery>();
 for(const item of entries.slice(0,32)){
  const result=item.result as {discoveries?:unknown}|undefined;
  if(!Array.isArray(result?.discoveries))continue;
  for(const candidate of result.discoveries.slice(0,24)){
   if(!candidate||typeof candidate!=='object')continue;
   const d=candidate as Discovery;
   if(typeof d.id!=='string'||d.id.length>200||typeof d.label!=='string'||d.label.length>150
      ||!d.condition||checkCondition(d.condition))continue;
   if(!byId.has(d.id))byId.set(d.id,d);
   if(byId.size>=max)return [...byId.values()];
  }
 }
 return [...byId.values()];
}
