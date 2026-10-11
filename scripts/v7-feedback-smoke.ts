import assert from 'node:assert/strict';
import * as THREE from 'three';
import {V7Engine} from '../src/simulations/v7';
import type {FlowMetrics} from '../src/simulations/v6';

const scene=new THREE.Scene();
const v7=new V7Engine(scene);
const upstream={
 v3:{neighborK:6},v4:{neighborK:6},
 v1:{_stabilityThreshold:.001,_requiredStableFrames:30},
 v2:{_stabilityThreshold:.001},
};
const base:FlowMetrics={
 totalFlow:5,avgResistance:2,bottleneckCount:0,efficiency:.5,
 pathCount:5,membranesModified:0,
};
const evaluate=(metrics:FlowMetrics)=>{
 v7.captureFromV6(metrics,[],[]);
 for(let i=0;i<30;i++)v7.update(1);
};
try{
 evaluate(base);
 assert.equal(v7.getRecommendations().length,1);
 assert.equal(v7.getRecommendations()[0].target,'v3');
 assert.equal(upstream.v3.neighborK,6);
 v7.applyRecommendations(upstream);
 assert.equal(upstream.v3.neighborK,7,'actual V3 property mutated only after command');
 v7.applyRecommendations(upstream);
 assert.equal(upstream.v3.neighborK,7,'commands apply at most once per trial');

 evaluate({...base,totalFlow:.5,efficiency:.1});
 assert.equal(v7.rejectedTrials,1);
 assert.equal(v7.acceptedTrials,0);
 assert.match(v7.getRecommendations()[0].reason,/Rollback/);
 v7.applyRecommendations(upstream);
 assert.equal(upstream.v3.neighborK,6,'degraded V3 configuration must roll back');

 evaluate(base);
 assert.equal(v7.getRecommendations()[0].target,'v4','after rollback try another independent coordinate');
 v7.applyRecommendations(upstream);
 assert.equal(upstream.v4.neighborK,7);
 evaluate({...base,totalFlow:5.5,efficiency:.55});
 assert.equal(v7.acceptedTrials,1,'better modeled response should retain V4 configuration');
 assert.equal(v7.rejectedTrials,1);
 assert.equal(upstream.v4.neighborK,7);
 assert.equal(v7.getRecommendations().length,1);
 assert.equal(v7.getRecommendations()[0].target,'v1','advance to a third coordinate without human tuning');
 assert.ok(v7.getBestScore()>0);
 const snapshot=v7.saveState();
 assert.equal(snapshot.acceptedTrials,1);
 assert.equal(snapshot.rejectedTrials,1);
 const restored=new V7Engine(new THREE.Scene());
 try{
  restored.loadState({...snapshot,params:[{name:'V3 Neighbor K',value:5000}]});
  assert.equal(restored.getParams().find(p=>p.name==='V3 Neighbor K')!.value,12,
   'persisted tuning values remain inside physical bounds');
  assert.equal(restored.saveState().acceptedTrials,1);
 }finally{restored.dispose();}
 console.log('V7 sequential feedback: applied once, degraded flow rolled back, better flow retained, bounded persistence passed.');
}finally{v7.dispose();}
