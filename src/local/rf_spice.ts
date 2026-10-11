import type {MatchReport,PassivePart} from './impedance';

/**
 * Export an executable SPICE starting point for the actual selected lumped
 * network. The worker assumes constant Q at every evaluated frequency;
 * physical SPICE RLC elements instead use a constant ESR chosen at f0.
 * Their responses are therefore NOT identical away from the design centre.
 */
export function rfSpiceNetlist(report:MatchReport):string{
 const {best,requested}=report;
 const f0=requested.frequencyMHz*1e6;
 const omega=2*Math.PI*f0;
 const esr=(part:PassivePart)=>part.type==='L'
   ?omega*part.value/40:1/(omega*part.value*80);
 const number=(value:number)=>Number(value).toExponential(9);
 const branch=(part:PassivePart,a:string,b:string,tag:string)=>{
  const r=number(esr(part)),v=number(part.value);
  return [
   `R_${tag}_ESR ${a} ${tag.toLowerCase()}_mid ${r}`,
   `${part.type}_${tag} ${tag.toLowerCase()}_mid ${b} ${v}`
  ];
 };
 const inNode='rf_in',outNode='rf_out';
 const parts=best.topology==='series_then_shunt'
  ?[...branch(best.series,inNode,outNode,'SERIES'),
    ...branch(best.shunt,outNode,'0','SHUNT')]
  :[...branch(best.shunt,inNode,'0','SHUNT'),
    ...branch(best.series,inNode,outNode,'SERIES')];
 const low=f0*Math.max(0.01,1-requested.bandFraction);
 const high=f0*(1+requested.bandFraction);
 const sweepMax=high>low?high:low*1.02;
 return [
  '* AboveBound RF interface - nominal illustrative lumped circuit',
  '* Generated from the selected passive E12 candidate; not a routed PCB.',
  `* f0=${requested.frequencyMHz} MHz ; source=${requested.sourceOhms} ohm ; load=${requested.loadOhms} ohm`,
  `* Nominal series ${best.series.label}, shunt ${best.shunt.label}`,
  '* R losses model Q=40 inductors / Q=80 capacitors at f0 only.',
  '* App sweeps constant Q at every frequency: SPICE ESR is fixed at f0.',
  '* This netlist is a starting point, not measured S-parameters or manufacturing evidence.',
  'V_SOURCE source 0 AC 1',
  `R_SOURCE source ${inNode} ${number(requested.sourceOhms)}`,
  ...parts,
  `R_LOAD ${outNode} 0 ${number(requested.loadOhms)}`,
  `.ac dec 100 ${number(low)} ${number(sweepMax)}`,
  `.print ac vm(${outNode})`,
  '.end',''
 ].join('\n');
}
export function saveSpiceNetlist(report:MatchReport):void{
 const content=rfSpiceNetlist(report);
 const blob=new Blob([content],{type:'text/plain;charset=utf-8'});
 const url=URL.createObjectURL(blob);
 const anchor=document.createElement('a');
 anchor.href=url;anchor.download=`abovebound-${report.requested.frequencyMHz}MHz-rf-match.cir`;
 anchor.click();
 setTimeout(()=>URL.revokeObjectURL(url),5000);
}

/** A sourcing worksheet, deliberately without invented SKUs or package ratings. */
export function rfBomCsv(report:MatchReport):string{
 const rows=[
  ['Reference','Role','Component','Nominal value','Minimum -5%','Maximum +5%','Validation needed'],
  ['Z1','Series',report.best.series.type,report.best.series.label,
   (report.best.series.value*.95).toExponential(5),
   (report.best.series.value*1.05).toExponential(5),
   'Vendor datasheet: package ESR SRF current voltage and temperature'],
  ['Z2','Shunt',report.best.shunt.type,report.best.shunt.label,
   (report.best.shunt.value*.95).toExponential(5),
   (report.best.shunt.value*1.05).toExponential(5),
   'Vendor datasheet: package ESR SRF current voltage and temperature'],
  ['RS','Source termination','R',report.requested.sourceOhms+' ohm','','',
   'Check source impedance; resistor represents source model'],
  ['RL','Load termination','R',report.requested.loadOhms+' ohm','','',
   'Check real antenna/cable/termination impedance'],
 ];
 const quote=(x:string)=>'"'+x.replaceAll('"','""')+'"';
 return rows.map(r=>r.map(x=>quote(String(x))).join(',')).join('\r\n')+'\r\n';
}
export function saveRfBom(report:MatchReport):void{
 const blob=new Blob([rfBomCsv(report)],{type:'text/csv;charset=utf-8'});
 const url=URL.createObjectURL(blob);const a=document.createElement('a');
 a.href=url;a.download=`abovebound-${report.requested.frequencyMHz}MHz-bom.csv`;
 a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
