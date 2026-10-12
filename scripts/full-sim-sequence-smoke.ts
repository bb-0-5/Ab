import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {
 SIMULATION_STAGES,indexOfStage,nextStageVersion,mayAdvanceStage,
} from '../src/lib/sim_sequence';
import {
 feedbackScenarioKey,rememberFeedback,getFeedbackArchive,
 findCompatibleFeedback,validTuningHints,
 type FeedbackScenario,
} from '../src/lib/sim_feedback_archive';
import {V7Engine} from '../src/simulations/v7';
import type {FlowMetrics} from '../src/simulations/v6';

assert.deepEqual(SIMULATION_STAGES,[
 'v0','v1','v2','v3','v4','v5','v6','v7',
 'v8','v9','v10','v11','v12','v13',
],'All fourteen original numeric engines must appear in physical order');
for(let i=0;i<SIMULATION_STAGES.length;i++){
 const version=SIMULATION_STAGES[i];
 assert.equal(indexOfStage(version),i);
 assert.equal(nextStageVersion(version),SIMULATION_STAGES[(i+1)%14]);
 assert.equal(mayAdvanceStage(version,149,true,150),false,
  'A built/instant-stable stage must still be visible for at least 5 seconds');
 assert.equal(mayAdvanceStage(version,150,false,150),false,
  'Must not advance an unstable engine, even after the dwell window');
 assert.equal(mayAdvanceStage(version,150,true,150),true);
}
assert.equal(indexOfStage('elements'),13,'Legacy material alias points to V13');
assert.equal(nextStageVersion('v7'),'v8','No jumping from V7 to materials');
assert.equal(nextStageVersion('v8'),'v9');
assert.equal(nextStageVersion('v12'),'v13');
assert.equal(nextStageVersion('v13'),'v0');

const app=readFileSync('src/App.tsx','utf8');
assert.match(app,/SIMULATION_STAGES\.map\(\(v\)/);
assert.match(app,/\.\.\.POST_V7_TASKS/);
assert.match(app,/currentVersion === 'v9' \? v9Ref\.current/);
assert.match(app,/currentVersion === 'v10' \? v10Ref\.current/);
assert.match(app,/currentVersion === 'v11' \? v11Ref\.current/);
assert.match(app,/currentVersion === 'v12' \? v12Ref\.current/);
assert.match(app,/v12Ref\.current\.thermalHeatmap\.visible\s*=\s*activeVersion\s*===\s*'v12'/);
assert.match(app,/v13StageGroupRef\.current\.visible=activeVersion==='v13'/);
assert.match(app,/probeRememberedTuning/);
assert.match(app,/rememberFeedback/);
assert.match(app,/setActiveVersion\('v13'\);\s*setActiveTab\('elements'\)/,
 'The original Elements button must open the real V13 Codex, not a generic glossary');

const cache=new Map<string,string>();
Object.assign(globalThis,{localStorage:{
 getItem:(key:string)=>cache.get(key)||null,
 setItem:(key:string,val:string)=>{cache.set(key,val);},
}});
const scenario:FeedbackScenario={
 optimizer:'thermal',thermalMode:'cooling',compressionLevel:1,
 materialSignature:'{"density":2.1,"conductivity":50}',loopCount:2,
};
const old:FlowMetrics={
 totalFlow:5,avgResistance:2,bottleneckCount:0,efficiency:.5,
 pathCount:5,membranesModified:0,
};
const scene=new THREE.Scene();
const v7=new V7Engine(scene);
try{
 assert.equal(findCompatibleFeedback(scenario,old),null);
 // First: learn a real modeled improvement in the normal V7 closed loop.
 const evaluate=(metrics:FlowMetrics)=>{
  v7.captureFromV6(metrics,[],[]);
  for(let i=0;i<30;i++)v7.update(1);
 };
 evaluate(old);
 v7.applyRecommendations({v3:{neighborK:6}});
 evaluate({...old,totalFlow:5.5,efficiency:.58});
 assert.ok(v7.acceptedTrials>0,'Accepted means actually compared V6 feedback');
 const remembered=rememberFeedback({
  scenario,timestamp:Date.now(),solverVersion:'v6-v7-model-1',
  flow:{totalFlow:old.totalFlow,avgResistance:old.avgResistance,
   efficiency:old.efficiency,pathCount:old.pathCount,bottleneckCount:old.bottleneckCount},
  v7:{bestScore:v7.getBestScore(),acceptedTrials:v7.acceptedTrials,
   rejectedTrials:v7.rejectedTrials,bestParams:v7.bestParams.map(x=>({...x}))},
  requirement:{
   id:'v6:thermal-field',source:'v6',medium:'air',
   minTemperatureK:270,maxTemperatureK:600,
   purpose:'thermal_survival',basis:'Real numeric V6 envelope; model only',
  },
  materialScreens:[{id:'v6:thermal-field',
   status:'awaiting_composite',maxTemperatureK:600,estimatedMeltingPointK:null}],
  evidence:'model_only_not_measured',
 });
 assert.equal(remembered,1);
 assert.equal(getFeedbackArchive()[0].materialScreens[0].estimatedMeltingPointK,null,
  'Never fabricate a material pass without composite data');
 assert.equal(findCompatibleFeedback(scenario,old)?.scenario.thermalMode,'cooling');
 assert.equal(findCompatibleFeedback({...scenario,thermalMode:'heating'},old),null,
  'An opposing thermal environment must not reuse the same flow genome');
 assert.equal(findCompatibleFeedback({...scenario,materialSignature:'different-material'},old),null);
 assert.equal(findCompatibleFeedback({...scenario,loopCount:3},old),null);
 assert.equal(findCompatibleFeedback(scenario,{...old,totalFlow:100}),null,
  'Strongly different actual V6 flow must reject archived score comparisons');

 // Second: import ONLY the hinted setting and confirm or undo using CURRENT
 // V6 observations, not historical score labels.
 const fresh=new V7Engine(new THREE.Scene());
 try{
  fresh.captureFromV6(old,[],[]);
  const hints=validTuningHints(getFeedbackArchive()[0].v7.bestParams,fresh.getParams());
  assert.ok(hints.length>0);
  const original=fresh.getParams().find(x=>x.name===hints[0].name)!.value;
  assert.ok(fresh.probeRememberedTuning(hints));
  assert.equal(fresh.probeRememberedTuning(hints),false,
   'Only one prior experimental coordinate may be re-tested at once');
  fresh.applyRecommendations({v3:{neighborK:original},v4:{neighborK:6},
   v1:{_stabilityThreshold:.001,_requiredStableFrames:30},
   v2:{_stabilityThreshold:.001}});
  fresh.captureFromV6({...old,totalFlow:.1,efficiency:.1},[],[]);
  for(let i=0;i<30;i++)fresh.update(1);
  assert.equal(fresh.rejectedTrials,1,
   'Archived winner must roll back after a poor new modeled observation');
  assert.equal(fresh.getParams().find(x=>x.name===hints[0].name)!.value,original);
 }finally{fresh.dispose();}
}finally{v7.dispose();}
console.log('Original V0–V13 continuity, distinct stages, constrained local V6/V7/V13 evidence and fresh V7 rollback verified.');
