import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SIMULATION_STAGES} from '../src/lib/sim_sequence';
import {
 qualifyStage,stagePhase,seedFromDiscovery,rememberStageReceipt,getStageReceipts,
 type StageReceipt,
} from '../src/lib/sim_artifact_handoffs';

const cache=new Map<string,string>();
Object.assign(globalThis,{localStorage:{
 getItem:(key:string)=>cache.get(key)||null,
 setItem:(key:string,val:string)=>{cache.set(key,val);},
}});
const context='["thermal","cooling",3]';
let previous:StageReceipt|null=null;
for(const [index,stage] of SIMULATION_STAGES.entries()){
 const observation={quantity:20,signal:1,support:4,signature:'numeric-evidence-'+stage};
 if(index>0)assert.equal(qualifyStage(stage,observation,null,context).ok,false,
  'An upstream artifact is required before every non-root stage');
 const decision=qualifyStage(stage,observation,previous,context);
 assert.equal(decision.ok,true,stage+' must produce an artifact with valid provenance');
 assert.equal(decision.receipt?.predecessorId,previous?.id||null);
 assert.equal(decision.receipt?.phase,index<=8?'discovery':'construction');
 assert.equal(stagePhase(stage),index<=8?'discovery':'construction');
 previous=decision.receipt!;
 rememberStageReceipt(previous);
 if(stage==='v8'){
  const first=seedFromDiscovery(previous,20261012);
  assert.equal(first,seedFromDiscovery(previous,20261012));
  assert.notEqual(first,20261012);
 }
}
assert.equal(getStageReceipts().length,14,'All fourteen outputs must be retained');
assert.equal(qualifyStage('v7',{quantity:1,signal:12,support:0,signature:'score only'},
  getStageReceipts().find(r=>r.stage==='v6')||null,context).ok,false,
  'A V7 score without a tested variation is not a discovery');
assert.equal(qualifyStage('v10',{quantity:100,signal:0,support:8,signature:'disconnected'},
  getStageReceipts().find(r=>r.stage==='v9')||null,context).ok,false,
  'An unconnected channel cannot become a valid transport mesh');
assert.equal(qualifyStage('v13',{quantity:1,signal:2000,support:0,signature:'element picture'},
  getStageReceipts().find(r=>r.stage==='v12')||null,context).ok,false,
  'An atom shell picture is not a chemical composite candidate');
assert.equal(qualifyStage('v5',{quantity:1,signal:1,support:1,signature:'planes'},
  getStageReceipts().find(r=>r.stage==='v4')||null,'["electrical","cooling",3]').ok,false,
  'Different environments cannot inherit old artifacts');
assert.throws(()=>seedFromDiscovery(getStageReceipts()[0],1));
assert.equal(qualifyStage('v2',{quantity:20,signal:NaN,support:1,signature:'x'},
  getStageReceipts().find(r=>r.stage==='v1')||null,context).ok,false,
  'No non-finite output may pass');
const app=readFileSync('src/App.tsx','utf8');
assert.match(app,/qualifyStage\(/);
assert.match(app,/seedFromDiscovery\(/);
assert.match(app,/lastConstructionTrialRef\.current\?\.discovery/);
assert.match(app,/v13Ref\.current\.buildComposite\(bestRecipe\)/);
assert.match(app,/setHandoffStatus\(decision\.reason\)/);
assert.match(app,/stageReceiptsRef\.current\.set\(currentVersion,decision\.receipt\)/);
assert.match(app,/getLatestComposite\(\)/,
 'V13 should not advance for merely displaying an element');
console.log('All original Sims now have evidence-carrying stage handoffs; construction trials require discovery ancestry and no physical-property fabrication.');
