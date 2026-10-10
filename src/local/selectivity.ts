/**
 * Toy pathway-constraint probability model. Absolutely NOT molecular dynamics,
 * electronic wavefunctions, chemical kinetics, or an empirical reaction simulator.
 *
 * Excluding possible input classes can increase conditional selectivity,
 * while it NEVER increases the number of target molecules produced per unit
 * of ORIGINAL feed when branching probabilities remain fixed.
 *
 * This distinction is essential to avoid the false "probability pruning
 * automatically improves chemical yield" claim.
 */
export interface Route {
  label:string;
  prevalence:number;
  desiredProbability:number;
  unwantedProbability:number;
}
export interface RouteSelectivityResult {
  routes:Route[];
  baseline:{targetPerInput:number;sidePerInput:number;wastePerInput:number;selectivity:number};
  gate:{allowed:string[];acceptedFraction:number;targetPerInput:number;
    sidePerInput:number;wastePerInput:number;selectivity:number;
    targetPerAccepted:number};
  candidatesTested:number;
  insight:string;
  limitations:string[];
}
export const ILLUSTRATIVE_ROUTES:Route[]=[
 {label:'Path A · favoured',prevalence:0.2,desiredProbability:0.9,unwantedProbability:0.07},
 {label:'Path B · mixed',prevalence:0.3,desiredProbability:0.5,unwantedProbability:0.35},
 {label:'Path C · unproductive',prevalence:0.3,desiredProbability:0.12,unwantedProbability:0.7},
 {label:'Path D · secondary',prevalence:0.2,desiredProbability:0.6,unwantedProbability:0.2},
];
const round=(n:number)=>Math.round(n*10000)/10000;
export function optimizeRouteSelectivity(
  routes:Route[]=ILLUSTRATIVE_ROUTES,
  minimumAcceptedFraction=0.5,
):RouteSelectivityResult{
 if(routes.length<1||routes.length>16||!Number.isFinite(minimumAcceptedFraction)
   ||minimumAcceptedFraction<=0||minimumAcceptedFraction>1)throw Error('Invalid route count or minimum accepted fraction.');
 for(const r of routes)if(![r.prevalence,r.desiredProbability,r.unwantedProbability].every(Number.isFinite)
   ||r.prevalence<0||r.desiredProbability<0||r.unwantedProbability<0
   ||r.desiredProbability+r.unwantedProbability>1+1e-10)throw Error('All route probabilities must be bounded; outcomes sum to ≤1.');
 const sum=routes.reduce((n,r)=>n+r.prevalence,0);
 if(Math.abs(sum-1)>1e-8)throw Error('Input route prevalences must sum to 1.');
 const totals=(mask:number)=>{
  let target=0,side=0,waste=0,accepted=0;const allowed:string[]=[];
  for(let i=0;i<routes.length;i++){
   if(!(mask&(1<<i)))continue;
   const r=routes[i];allowed.push(r.label);accepted+=r.prevalence;
   target+=r.prevalence*r.desiredProbability;side+=r.prevalence*r.unwantedProbability;
   waste+=r.prevalence*(1-r.desiredProbability-r.unwantedProbability);
  }
  return {allowed,acceptedFraction:accepted,targetPerInput:target,sidePerInput:side,wastePerInput:waste,
   selectivity:target+side>0?target/(target+side):0,
   targetPerAccepted:accepted>0?target/accepted:0};
 };
 const baseline=totals((1<<routes.length)-1);
 let best=baseline,candidatesTested=0;
 for(let mask=1;mask<(1<<routes.length);mask++){
  const t=totals(mask);candidatesTested++;
  if(t.acceptedFraction+1e-10<minimumAcceptedFraction)continue;
  // Only target selectivity improves under the gate; show throughput loss.
  if(t.selectivity>best.selectivity+1e-10
     ||(Math.abs(t.selectivity-best.selectivity)<1e-10&&t.targetPerInput>best.targetPerInput))best=t;
 }
 if(best.targetPerInput>baseline.targetPerInput+1e-10)
  throw Error('Probability mass violation: gate alone cannot increase total target output.');
 return {routes,
  baseline:{targetPerInput:round(baseline.targetPerInput),sidePerInput:round(baseline.sidePerInput),
   wastePerInput:round(baseline.wastePerInput),selectivity:round(baseline.selectivity)},
  gate:{allowed:best.allowed,acceptedFraction:round(best.acceptedFraction),
   targetPerInput:round(best.targetPerInput),sidePerInput:round(best.sidePerInput),
   wastePerInput:round(best.wastePerInput),selectivity:round(best.selectivity),
   targetPerAccepted:round(best.targetPerAccepted)},
  candidatesTested,
  insight:best.targetPerInput < baseline.targetPerInput-1e-10
   ? 'Filtering raises desired-versus-side selectivity for processed feed, but reduces target output per original feed. A real yield increase needs verified changes to kinetics, selectivity, conversion or recovery, not just discarding states.'
   : 'Filtering cannot increase target output per original feed with unchanged pathway probabilities. No increased chemical yield is predicted.',
  limitations:[
   'These are hypothetical categorical probabilities, NOT quantum wavefunctions or a validated reaction network.',
   'Gating assumes advance knowledge of a route, a capability not established for real chemical systems.',
   'No mass-action kinetics, thermodynamics, activation energies, catalysts, solvents, spectroscopy, concentration or stoichiometry.',
   'A change in conditional selectivity is not an improvement in chemical yield per original feed; practical design requires experimental kinetic data.',
  ]};
}
