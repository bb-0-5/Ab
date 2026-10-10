#!/usr/bin/env node
/**
 * Explicit device-owned, file-writing exploration (not a cloud agent).
 * No API clients, shell execution, arbitrary code modification or LLM keys.
 * Safe files created only in ./runs/, for independent inspection.
 *
 * npm run explore:local -- --goal building --preset melbourne --area 130 --count 4
 * npm run explore:local -- --goal circuits --frequency 100 --load 100
 * npm run explore:local -- --goal chemistry --min-accept 0.5
 */
import { mkdir,writeFile } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { optimizeSiteGeometry, SITE_LOCATION_PRESETS } from '../src/lib/site_geometry_optimizer';
import { searchCoupledSiteMechanicalPortfolio } from '../src/lib/site_whole_house_coupling';
import { optimizeImpedanceMatch } from '../src/local/impedance';
import { optimizeRouteSelectivity } from '../src/local/selectivity';
const argv=process.argv.slice(2);
function flag(name:string,fallback:string){
 const idx=argv.indexOf('--'+name);
 return idx>=0&&idx+1<argv.length?argv[idx+1]:fallback;
}
function numeric(name:string,value:string,low:number,high:number){
 const n=Number(value);
 if(!Number.isFinite(n)||n<low||n>high)throw Error(`--${name} must be between ${low} and ${high}.`);
 return n;
}
async function run(){
 const goal=flag('goal','building');
 const started=new Date().toISOString();
 let data:unknown,summary:string;
 if(goal==='building'){
  const preset=flag('preset','melbourne');
  if(!SITE_LOCATION_PRESETS[preset]||preset==='custom')throw Error('Use an available Australian climate preset.');
  const area=numeric('area',flag('area','130'),35,500);
  const count=numeric('count',flag('count','3'),1,8);
  if(!Number.isInteger(count))throw Error('Count must be a whole number.');
  const seed=numeric('seed',flag('seed','481516'),0,2147483647);
  const results=[];
  for(let i=0;i<count;i++){
   const currentSeed=Math.round((seed+i*7919)%2147483647);
   const site=optimizeSiteGeometry({
    location:SITE_LOCATION_PRESETS[preset],
    targetFloorAreaM2:area,minFloorAreaM2:area*.95,maxFloorAreaM2:area*1.05,
    targetIndoorTempC:22,iterations:420,lifecycleYears:30,seed:currentSeed,
   });
   const joint=searchCoupledSiteMechanicalPortfolio(site,site.feasibleShortlist,{
    lifecycleYears:30,targetTempC:22,maximumCandidates:48,
   });
   results.push({seed:currentSeed,
    siteCases:site.candidatesEvaluated,mechanicalCases:joint.mechanicalCandidatesEvaluated,
    winner:joint.selected?{
      geometry:joint.selected.site.design,
      mechanical:joint.selected.selectedAirflow,
      annualKWh:joint.selected.energy.annualCombinedElectricalKWh,
      lifetimeKWh:joint.selected.energy.totalLifecycleKWh,
      manufacturerKWh:joint.selected.energy.combinedManufacturingKWh,
    }:null,
    qualification:joint.qualifiesAsImprovement,limitations:joint.limitations});
   process.stdout.write(`Seed ${currentSeed}: ${joint.geometryCandidatesEvaluated} configurations; ${joint.selected?.energy.totalLifecycleKWh??'none'} modeled lifecycle kWh\n`);
  }
  const best=results.filter(r=>r.winner).sort((a,b)=>
    a.winner!.lifetimeKWh-b.winner!.lifetimeKWh)[0]||null;
  data={goal,preset,areaM2:area,seed,count,results,best,
   caveat:'Site/HVAC bounded preliminary screening, not a globally optimised or certified construction design.'};
  summary=best?`Best feasible tested lifecycle ${best.winner!.lifetimeKWh} kWh at seed ${best.seed}`:'No passing design.';
 } else if(goal==='circuits'){
  const frequency=numeric('frequency',flag('frequency','100'),1,1000);
  const load=numeric('load',flag('load','100'),1,1000);
  const source=numeric('source',flag('source','50'),1,1000);
  data=optimizeImpedanceMatch({frequencyMHz:frequency,sourceOhms:source,loadOhms:load});
  summary=(data as ReturnType<typeof optimizeImpedanceMatch>).recommendationReason;
 }else if(goal==='chemistry'){
  const min=numeric('min-accept',flag('min-accept','0.5'),.1,1);
  data=optimizeRouteSelectivity(undefined,min);
  summary=(data as ReturnType<typeof optimizeRouteSelectivity>).insight;
 }else throw Error('Goal must be building, circuits, or chemistry.');
 const folder=resolve(process.cwd(),'runs');
 await mkdir(folder,{recursive:true});
 const file=join(folder,`abovebound-${goal}-${Date.now()}.json`);
 await writeFile(file,JSON.stringify({generatedAt:started,source:'own_device',
   summary,result:data},null,2)+'\n',{flag:'wx'});
 process.stdout.write(summary+'\nSaved '+file+'\n');
}
run().catch(e=>{console.error(e instanceof Error?e.message:e);process.exitCode=1;});
