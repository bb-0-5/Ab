/**
 * Wide-track microstrip width screen using quasi-static zero-thickness
 * closed-form approximations. Geometric example for a COMMON outer-layer
 * signal above continuous reference plane, not a real motherboard PCB
 * manufacturing stackup or differential pair solver.
 *
 * R. E. Collin / standard Hammerstad-style effective permittivity formulas.
 * Do not use for impedance signoff: copper thickness, solder mask, roughness,
 * dispersive FR-4, etch tolerances and via transitions are neglected.
 */
export interface MicrostripExample {
 dielectricConstant:number;
 substrateHeightMm:number;
 targetOhms:number;
 traceWidthMm:number;
 predictedImpedanceOhms:number;
 effectivePermittivity:number;
 propagationDelayPsPerMm:number;
 limitations:string[];
}
export function microstripImpedance(traceWidthMm:number,substrateHeightMm:number,relativePermittivity:number){
 const w=traceWidthMm,h=substrateHeightMm,er=relativePermittivity;
 if(![w,h,er].every(Number.isFinite)||w<=0||h<=0||er<1||er>20)
  throw Error('Microstrip requires positive finite width/height and relative permittivity from 1 to 20.');
 const ratio=w/h;
 const effectivePermittivity=(er+1)/2+(er-1)/2*(1/Math.sqrt(1+12/ratio))
   +(ratio<1?(er-1)/2*0.04*(1-ratio)**2:0);
 const impedance=ratio<=1
  ?60/Math.sqrt(effectivePermittivity)*Math.log(8/ratio+ratio/4)
  :120*Math.PI/(Math.sqrt(effectivePermittivity)*
   (ratio+1.393+0.667*Math.log(ratio+1.444)));
 return {impedance,effectivePermittivity,
   propagationDelayPsPerMm:3.33564*Math.sqrt(effectivePermittivity)};
}
export function suggestMicrostripWidth(
 targetOhms=50,
 substrateHeightMm=.18,
 dielectricConstant=4.2,
):MicrostripExample{
 if(!Number.isFinite(targetOhms)||targetOhms<20||targetOhms>150
   ||!Number.isFinite(substrateHeightMm)||substrateHeightMm<.05||substrateHeightMm>2
   ||!Number.isFinite(dielectricConstant)||dielectricConstant<2||dielectricConstant>12)
   throw Error('Target 20–150 Ω, substrate .05–2 mm and εr 2–12 required.');
 let left=substrateHeightMm*.01,right=substrateHeightMm*30;
 for(let i=0;i<80;i++){
  const mid=(left+right)/2;
  if(microstripImpedance(mid,substrateHeightMm,dielectricConstant).impedance>targetOhms)left=mid;
  else right=mid;
 }
 const traceWidthMm=(left+right)/2;
 const solved=microstripImpedance(traceWidthMm,substrateHeightMm,dielectricConstant);
 return {dielectricConstant,substrateHeightMm,targetOhms,traceWidthMm,
  predictedImpedanceOhms:solved.impedance,
  effectivePermittivity:solved.effectivePermittivity,
  propagationDelayPsPerMm:solved.propagationDelayPsPerMm,
  limitations:[
   'Generic example: εr 4.2, plane spacing 0.18 mm, zero copper thickness, no solder mask; NOT an actual motherboard stackup.',
   'Uses quasi-static microstrip closed-form formula, not a field solver or measured impedance coupon.',
   'DDR5/PCIe/Ethernet traces require different topologies, differential impedance, termination, coupled lines, vias and eye diagrams.',
   'Manufacturing etch, copper roughness, dispersive dielectric, temperature, return paths and component/package parasitics are not modeled.',
  ]};
}
