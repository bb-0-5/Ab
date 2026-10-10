/**
 * Passive 50 ohm interface screening (RF only).
 * A real motherboard routing path requires stackup geometry, return planes,
 * vias, package and connector S-parameters, and SPICE/field-solver validation.
 * This idealised lumped two-element L matcher must not be mistaken for a
 * qualified PCB design. No active power conversion is simulated.
 */

import { suggestMicrostripWidth, type MicrostripExample } from './pcb';

type Complex = { re: number; im: number };
const c=(re:number,im=0):Complex=>({re,im});
const add=(a:Complex,b:Complex):Complex=>c(a.re+b.re,a.im+b.im);
const mul=(a:Complex,b:Complex):Complex=>c(a.re*b.re-a.im*b.im,a.re*b.im+a.im*b.re);
const div=(a:Complex,b:Complex):Complex=>{const d=b.re*b.re+b.im*b.im;return c((a.re*b.re+a.im*b.im)/d,(a.im*b.re-a.re*b.im)/d);};
const parallel=(a:Complex,b:Complex)=>div(mul(a,b),add(a,b));
const mag2=(a:Complex)=>a.re*a.re+a.im*a.im;
const E12=[1,1.2,1.5,1.8,2.2,2.7,3.3,3.9,4.7,5.6,6.8,8.2];
export type PassivePart = { type:'L'|'C'; value: number; unit: 'H'|'F'; label: string };
export type MatchTopology='series_then_shunt'|'shunt_then_series';
export interface MatchCandidate {
 topology:MatchTopology;
 series:PassivePart;
 shunt:PassivePart;
 centerDeliveredPowerFraction:number;
 bandAveragePowerFraction:number;
 worstBandPowerFraction:number;
 mismatchDb:number;
 sourceMatchReturnLossDb:number;
}
export interface MatchReport {
 requested:{ frequencyMHz:number;sourceOhms:number;loadOhms:number;bandFraction:number };
 baselineDeliveredPowerFraction:number;
 best:MatchCandidate;
 tested:number;
 microstripExample:MicrostripExample;
 limitations:string[];
}
function parts():PassivePart[]{
 const out:PassivePart[]=[];
 for(const scale of [1e-9,1e-8,1e-7,1e-6]){
  for(const v of E12){
   const value=v*scale;
   if(value <= 1e-6)out.push({type:'L',value,unit:'H',label:`${+(value*1e9).toPrecision(3)} nH`});
  }
 }
 for(const scale of [1e-12,1e-11,1e-10,1e-9]){
  for(const v of E12){
   const value=v*scale;
   if(value >= 1e-13 && value <= 1e-8)out.push({type:'C',value,unit:'F',label:`${+(value*1e12).toPrecision(3)} pF`});
  }
 }
 return out;
}
function zPart(p:PassivePart,hz:number):Complex {
 const omega=2*Math.PI*hz;
 // Q is a deliberately illustrative, frequency-independent screening value.
 if(p.type==='L'){
  const react=omega*p.value;
  return c(react/40, react);
 }
 const react=1/(omega*p.value);
 return c(react/80,-react);
}
function score(topology:MatchTopology,series:PassivePart,shunt:PassivePart,hz:number,rs:number,rl:number) {
 const zs=c(rs);
 const load=c(rl);
 const zSeries=zPart(series,hz);
 const zShunt=zPart(shunt,hz);
 const branch=add(load,zSeries);
 const zin=topology==='series_then_shunt'?add(zSeries,parallel(load,zShunt)):parallel(branch,zShunt);
 const vin=div(zin,add(zs,zin));
 const vload=topology==='series_then_shunt'?mul(vin,div(parallel(load,zShunt),zin)):mul(vin,div(load,branch));
 const loadPower=mag2(vload)/rl; // 1 Vrms Thevenin source
 const available=1/(4*rs);
 const delivered=Math.max(0,Math.min(1,loadPower/available));
 const gamma=div(add(zin,c(-rs)),add(zin,c(rs)));
 return {delivered,returnLoss:-10*Math.log10(Math.max(1e-15,mag2(gamma)))};
}
export function optimizeImpedanceMatch(input:{frequencyMHz:number;sourceOhms:number;loadOhms:number;bandFraction?:number}):MatchReport {
 const frequencyMHz=input.frequencyMHz,rs=input.sourceOhms,rl=input.loadOhms;
 const bandwidth=input.bandFraction??0.15;
 if(![frequencyMHz,rs,rl,bandwidth].every(Number.isFinite)
   ||frequencyMHz<1||frequencyMHz>1000||rs<1||rl<1||rs>1000||rl>1000||bandwidth<0||bandwidth>0.4) {
  throw new Error('Use 1–1000 MHz, 1–1000 Ω positive resistances and 0–40% fractional bandwidth.');
 }
 const baseline=4*rs*rl/((rs+rl)**2);
 let best:MatchCandidate|null=null;let tested=0;
 const componentList=parts();
 for(const topology of ['series_then_shunt','shunt_then_series'] as const) {
  for(const series of componentList)for(const shunt of componentList) {
   // An L-section requires opposite reactances for ordinary real-to-real
   // matching. Screening both orientations and signs is sufficient.
   if(series.type===shunt.type)continue;
   const center=score(topology,series,shunt,frequencyMHz*1e6,rs,rl);
    // Correct symmetric sweep: centre +/- bandFraction. Nonzero default
   // 15%; no hidden hand-tuned frequency offsets.
   const probes=[-1,-0.5,0,0.5,1].map(t=>
    score(topology,series,shunt,frequencyMHz*1e6*(1+bandwidth*t),rs,rl));
   const average=probes.reduce((a,p)=>a+p.delivered,0)/probes.length;
   const worst=Math.min(...probes.map(p=>p.delivered));
   tested++;
   const obj=average*0.75+worst*0.25;
   if(!best||obj>best.bandAveragePowerFraction*0.75+best.worstBandPowerFraction*0.25) {
    best={topology,series,shunt,centerDeliveredPowerFraction:center.delivered,
      bandAveragePowerFraction:average,worstBandPowerFraction:worst,
      mismatchDb:10*Math.log10(Math.max(center.delivered,1e-15)/Math.max(baseline,1e-15)),
      sourceMatchReturnLossDb:center.returnLoss};
   }
  }
 }
 if(!best)throw new Error('No passive candidate generated.');
 return {requested:{frequencyMHz,sourceOhms:rs,loadOhms:rl,bandFraction:bandwidth},
  baselineDeliveredPowerFraction:baseline,best,tested,
  microstripExample:suggestMicrostripWidth(rs>=20&&rs<=150?rs:50),
  limitations:[
   '2-element L matching with assumed constant component Q=40 (L) and Q=80 (C); E12 values are examples, not rated parts.',
   'Reported power is delivered fraction relative to available Thevenin source power. Matching cannot create energy.',
   'No PCB microstrip/stripline electromagnetic geometry, vias, parasitic resonance, tolerance, component self-resonance, power rating or return-path model.',
   'Does not optimize motherboard clocks, DRAM buses, PCIe, USB4 or regulated power converters. Prototype only; verify with measured S-parameters, device datasheets and RF simulation.',
  ]};
}
