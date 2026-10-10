/**
 * Two competing first-order channels: R -> desired and R -> side.
 *
 * k_i(T) = A_i exp(-Ea_i/(R*T)), yield_i(t) =
 * k_i/(k_des+k_side) * (1-exp(-(k_des+k_side)*t)).
 *
 * Effective Arrhenius fits are inferred from OBSERVED desired+side yields
 * at measured T/time. Neither ΔG‡ nor entropy is identifiable separately
 * from such observations; DO NOT label fitted barriers molecular truth.
 * Only same reaction+environment records can be pooled.
 *
 * Until real observations are imported, no empirical yield predictions are
 * allowed. This module does not create or claim synthetic lab observations.
 */
export const GAS_R=8.314462618; // J mol-1 K-1
const BOLTZMANN=1.380649e-23; // J K-1
const PLANCK=6.62607015e-34; // J s
/**
 * Eyring transition-state THEORY for an assumed unimolecular channel.
 * ΔG‡(T) = ΔH‡ - TΔS‡ and
 * k = (k_B T/h) exp(-ΔG‡/RT).
 * ΔH‡ and ΔS‡ must come from independent experimental evidence; no yield
 * data alone identifies them uniquely without additional assumptions.
 * 0 < k < infinity does NOT imply an event within any finite observation.
 */
export function transitionStateEventProbability(input:{
 temperatureK:number;activationEnthalpyJMol:number;
 activationEntropyJMolK:number;durationS:number;
}){
 const {temperatureK:T,activationEnthalpyJMol:H,activationEntropyJMolK:S,durationS:t}=input;
 if(![T,H,S,t].every(Number.isFinite)||T<170||T>5000||H<0||H>1e7
   ||Math.abs(S)>1000||t<0||t>1e9)
  throw Error('Finite and bounded Eyring temperature, activation enthalpy/entropy and horizon required.');
 const deltaG=H-T*S;
 const logRate=Math.log(BOLTZMANN*T/PLANCK)-deltaG/(GAS_R*T);
 const rate=Math.exp(Math.max(-700,Math.min(700,logRate)));
 return {activationFreeEnergyJMol:deltaG,ratePerS:rate,
  probabilityWithinHorizon:-Math.expm1(-Math.min(700,rate*t)),
  limitation:'Transition-state-theory scenario, NOT a reaction prediction without measured activation enthalpy and entropy. A finite rate does not guarantee observation during finite time.'};
}


export interface YieldObservation {
  id:string;
  reactionId:string;
  environment:'air'|'water'|'vacuum';
  temperatureK:number;
  durationS:number;
  targetFraction:number;
  sideFraction:number;
  source:string; // DOI/URL or auditable lab record ID
  /** Optional: laboratory run/batch identity for independence-heldout testing. */
  batchId?:string;
  /** Optional: fixed chemistry recipe/specification identity, not just product name. */
  protocolId?:string;
}
export interface ReactionPrediction {
  targetFraction:number;sideFraction:number;unreactedFraction:number;
  eventProbability:number;rateTargetPerS:number;rateSidePerS:number;
}
export interface ArrheniusFit { lnA:number; activationEnergyJMol:number; rSquaredLogRate:number }
export interface YieldCalibration {
  status:'held_out_tested'|'not_calibrated';
  reactionId:string;environment:YieldObservation['environment'];
  trainCount:number;holdoutCount:number;temperatureRangeK:[number,number];
  durationRangeS:[number,number];
  protocolId:string|null;
  /** Batch-disjoint holdout is stronger than splitting conditions from the
   * same experiment; neither alone establishes independent external validity. */
  validationSplit:'batch_holdout'|'condition_holdout';
  trainingBatchCount:number;holdoutBatchCount:number;
  /** Only a measured-and-screened model is eligible for provisional reuse.
   * Even then it is NOT experimentally validated for new chemistry changes. */
  reusableAcrossRuns:boolean;
  targetFit:ArrheniusFit;sideFit:ArrheniusFit;
  holdoutMAE:number;holdoutRMSE:number;holdoutBaselineMAE:number;
  holdoutSideMAE:number;holdoutMaxAbsoluteError:number;
  holdoutBias:number;errorMetric:'absolute_yield_fraction';
  gate:'passes_baseline'|'worse_than_baseline';
  sourceRecords:string[];
  warning:string;
}
export function checkObservation(r:YieldObservation):void{
  if(!r||typeof r.id!=='string'||!r.id.trim()||typeof r.reactionId!=='string'||!r.reactionId.trim()
    ||!['air','water','vacuum'].includes(r.environment)
    ||typeof r.source!=='string'||r.source.trim().length<8
    ||![r.temperatureK,r.durationS,r.targetFraction,r.sideFraction].every(Number.isFinite)
    ||r.temperatureK<170||r.temperatureK>5000||r.durationS<=0||r.durationS>1e9
    ||r.targetFraction<0||r.sideFraction<0
    ||r.targetFraction+r.sideFraction>=1-1e-9
    ||(r.protocolId!==undefined&&(typeof r.protocolId!=='string'||!r.protocolId.trim()||r.protocolId.length>180))
    ||(r.batchId!==undefined&&(typeof r.batchId!=='string'||!r.batchId.trim()||r.batchId.length>180))) {
      throw Error('Measured yield records need IDs, source, compatible environment, finite T/time, and target+side fractions below 1.');
    }
}
function rates(r:YieldObservation):[number,number] {
  const conversion=r.targetFraction+r.sideFraction;
  // Zero channels can be below an experimental detection limit; log fit
  // handles censored zero data only through an explicit floor with warning.
  const sum=-Math.log1p(-conversion)/r.durationS;
  return [sum*(conversion? r.targetFraction/conversion:0),
    sum*(conversion? r.sideFraction/conversion:0)];
}
function regression(points:Array<{x:number;y:number}>):{a:number;b:number;r2:number}{
  const n=points.length;
  const xm=points.reduce((v,p)=>v+p.x,0)/n;
  const ym=points.reduce((v,p)=>v+p.y,0)/n;
  const xx=points.reduce((v,p)=>v+(p.x-xm)**2,0);
  if(xx<1e-14) throw Error('Calibration needs distinct temperatures with adequate spread.');
  const b=points.reduce((v,p)=>v+(p.x-xm)*(p.y-ym),0)/xx;
  const a=ym-b*xm;
  const yvar=points.reduce((v,p)=>v+(p.y-ym)**2,0);
  const residual=points.reduce((v,p)=>v+(p.y-a-b*p.x)**2,0);
  return {a,b,r2:yvar<1e-15?1:1-residual/yvar};
}
function fit(rows:YieldObservation[],index:0|1):ArrheniusFit{
  const data=rows.map(r=>({x:1/r.temperatureK,
    // Sensitivity floor for zero/detection-censored rates, NOT measured rates.
    y:Math.log(Math.max(1e-15,rates(r)[index]))}));
  const f=regression(data);
  return {lnA:f.a,activationEnergyJMol:-f.b*GAS_R,rSquaredLogRate:f.r2};
}
function prediction(kTarget:number,kSide:number,durationS:number):ReactionPrediction{
  const total=kTarget+kSide;
  const p=total>0?-Math.expm1(-total*durationS):0;
  const desired=total>0?p*kTarget/total:0;
  const side=total>0?p*kSide/total:0;
  return {targetFraction:desired,sideFraction:side,
    unreactedFraction:Math.max(0,1-desired-side),eventProbability:p,
    rateTargetPerS:kTarget,rateSidePerS:kSide};
}
export function predictFromCalibration(model:YieldCalibration,temperatureK:number,durationS:number,
  deltaTargetBarrierJMol=0,deltaSideBarrierJMol=0):ReactionPrediction{
  if(!Number.isFinite(temperatureK)||!Number.isFinite(durationS)
    ||temperatureK<170||temperatureK>5000||durationS<0||durationS>1e9
    ||![deltaTargetBarrierJMol,deltaSideBarrierJMol].every(Number.isFinite)
    ||Math.abs(deltaTargetBarrierJMol)>50000||Math.abs(deltaSideBarrierJMol)>50000)
    throw Error('Finite temperature, time and plausible hypothetical barrier perturbations required.');
  const mk=(fit:ArrheniusFit,delta:number)=>Math.exp(Math.max(-700,Math.min(700,
    fit.lnA-(fit.activationEnergyJMol+delta)/(GAS_R*temperatureK))));
  return prediction(mk(model.targetFit,deltaTargetBarrierJMol),
    mk(model.sideFit,deltaSideBarrierJMol),durationS);
}
export function calibrateKnownYields(
  observations:YieldObservation[],reactionId:string,environment:YieldObservation['environment'],
):YieldCalibration{
  const rows=observations.filter(x=>x.reactionId===reactionId&&x.environment===environment);
  if(rows.length<8)throw Error('Calibration requires at least eight observed yields for the SAME reaction and medium.');
  if(rows.length>10000)throw Error('At most 10,000 measured records per fit.');
  rows.forEach(checkObservation);
  const ids=new Set(rows.map(x=>x.id));
  if(ids.size!==rows.length)throw Error('Duplicate experimental IDs would cause train/holdout leakage.');
  // Both measured product channels MUST be observable. The previous
  // log(1e-15) floor fitted imaginary positive rates to *unobserved* channels.
  // Censored zero yields need a separate detection-limit likelihood model.
  if(rows.some(row=>rates(row).some(rate=>rate<=0)))
    throw Error('Cannot calibrate a channel with zero detected yield: supply a measurement detection limit and a censored-likelihood model first.');
  const protocols=[...new Set(rows.map(r=>r.protocolId??''))];
  if(protocols.length>1)
    throw Error('Do not combine different reaction protocols, catalysts or recipes under one reaction ID.');
  const protocolId=protocols[0]||null;
  const batchTagged=rows.every(r=>!!r.batchId);
  const distinctBatches=[...new Set(rows.map(r=>r.batchId).filter(Boolean))];
  const useBatchHoldout=batchTagged&&distinctBatches.length>=4;
  // Independent batch groups are preferred. Without them, fallback to
  // a deterministic split by T/time condition only: clearly weaker evidence.
  const groups=new Map<string,YieldObservation[]>();
  for(const row of rows) {
    const key=useBatchHoldout ? row.batchId! : `${row.temperatureK}|${row.durationS}`;
    const g=groups.get(key)||[];g.push(row);groups.set(key,g);
  }
  if(new Set(rows.map(r=>`${r.temperatureK}|${r.durationS}`)).size<6)
    throw Error('Calibration requires six or more distinct temperature/time conditions.');
  const unique=[...groups.entries()].sort(([a],[b])=>a.localeCompare(b));
  const train:YieldObservation[]=[],test:YieldObservation[]=[];
  unique.forEach(([_,records],i)=> (i%4===0?test:train).push(...records));
  if(train.length<4||test.length<2||new Set(train.map(x=>x.temperatureK)).size<3)
    throw Error('Calibration needs at least three distinct train temperatures and two held-out observations.');
  const targetFit=fit(train,0),sideFit=fit(train,1);
  const range:[number,number]=[Math.min(...train.map(x=>x.temperatureK)),
    Math.max(...train.map(x=>x.temperatureK))];
  const durationRangeS:[number,number]=[Math.min(...train.map(x=>x.durationS)),
    Math.max(...train.map(x=>x.durationS))];
  const prototype:YieldCalibration={
    status:'held_out_tested',reactionId,environment,trainCount:train.length,
    holdoutCount:test.length,temperatureRangeK:range,durationRangeS,
    protocolId,validationSplit:useBatchHoldout?'batch_holdout':'condition_holdout',
    trainingBatchCount:new Set(train.map(x=>x.batchId).filter(Boolean)).size,
    holdoutBatchCount:new Set(test.map(x=>x.batchId).filter(Boolean)).size,
    reusableAcrossRuns:false,targetFit,sideFit,
    holdoutMAE:0,holdoutRMSE:0,holdoutBaselineMAE:0,holdoutSideMAE:0,
    holdoutMaxAbsoluteError:0,holdoutBias:0,
    errorMetric:'absolute_yield_fraction',gate:'worse_than_baseline',
    sourceRecords:[...new Set(rows.map(x=>x.source))],
    warning:'Effective first-order fit, NOT quantum chemistry or a verified reaction mechanism. Source labels are user-provided and are NOT automatically authenticated. Only independent laboratory measurements with a verified common protocol support meaningful error estimates; no hypothetical barrier intervention has been validated.'
  };
  const typical=train.reduce((v,r)=>v+r.targetFraction,0)/train.length;
  const residuals=test.map(r=>{
    const p=predictFromCalibration(prototype,r.temperatureK,r.durationS);
    return {target:p.targetFraction-r.targetFraction,side:p.sideFraction-r.sideFraction};
  });
  const errors=residuals.map(x=>x.target);
  prototype.holdoutMAE=errors.reduce((sum,e)=>sum+Math.abs(e),0)/errors.length;
  prototype.holdoutRMSE=Math.sqrt(errors.reduce((sum,e)=>sum+e**2,0)/errors.length);
  prototype.holdoutBias=errors.reduce((sum,e)=>sum+e,0)/errors.length;
  prototype.holdoutSideMAE=residuals.reduce((sum,r)=>sum+Math.abs(r.side),0)/residuals.length;
  prototype.holdoutMaxAbsoluteError=Math.max(...errors.map(Math.abs));
  prototype.holdoutBaselineMAE=test.reduce((sum,r)=>sum+Math.abs(typical-r.targetFraction),0)/test.length;
  prototype.gate=prototype.holdoutMAE<=prototype.holdoutBaselineMAE?'passes_baseline':'worse_than_baseline';
  // This is only permission to replay the FIT, not validation of new
  // material design, catalysts, reaction barriers, or molecular isotopes.
  prototype.reusableAcrossRuns=prototype.gate==='passes_baseline'&&!!protocolId
    &&useBatchHoldout&&prototype.holdoutMAE<=0.1;
  if(!useBatchHoldout)
    prototype.warning+=' Holdout is by condition within one dataset, NOT an independent experimental batch.';
  if(!protocolId)
    prototype.warning+=' Protocol identity not recorded; a reused kinetic fit could mix catalysts/reagents and is prohibited.';
  if(targetFit.activationEnergyJMol<0||sideFit.activationEnergyJMol<0)
    prototype.warning+=' Negative effective activation energy was inferred; do not extrapolate.';
  return prototype;
}
export interface BarrierScenario {
  deltaTargetBarrierJMol:number;deltaSideBarrierJMol:number;
  prediction:ReactionPrediction;validatedImprovement:boolean;
}
export function screenHypotheticalBarriers(model:YieldCalibration,temperatureK:number,durationS:number){
  const baseline=predictFromCalibration(model,temperatureK,durationS);
  const candidates:BarrierScenario[]=[];
  for(const a of [0,-1000,-2500,-5000])for(const b of [0,1000,2500,5000]){
    const result=predictFromCalibration(model,temperatureK,durationS,a,b);
    candidates.push({deltaTargetBarrierJMol:a,deltaSideBarrierJMol:b,prediction:result,
      validatedImprovement:false});
  }
  candidates.sort((x,y)=>y.prediction.targetFraction-x.prediction.targetFraction);
  return {baseline,scenarios:candidates,bestHypothetical:candidates[0],
    contextValidated:temperatureK>=model.temperatureRangeK[0]&&temperatureK<=model.temperatureRangeK[1]
      &&durationS>=model.durationRangeS[0]&&durationS<=model.durationRangeS[1],
    limitation:'Barrier changes are imaginary scenario parameters, NOT verified catalysts, membranes, fields, or feasible mechanisms. Even held-out calibration does not validate these counterfactual interventions.'};
}
export function parseKnownYieldsCSV(csv:string):YieldObservation[]{
 if(csv.length>2_000_000)throw Error('CSV must be under 2 MB.');
 const lines=csv.replace(/\r/g,'').trim().split('\n');
 if(lines.length<2)throw Error('Expected CSV header and measured records.');
 const headings=['id','reaction_id','environment','temperature_k','duration_s','target_fraction','side_fraction','source'];
 const header=lines.shift()!.split(',').map(x=>x.trim().toLowerCase());
 if(headings.some(x=>!header.includes(x)))throw Error('CSV requires '+headings.join(', '));
 if(lines.length>10000)throw Error('Too many measurements.');
 // Intentionally strict simple CSV; no quoted commas/columns. Source DOI/URL
 // with comma must be encoded/normalized before importing.
 return lines.filter(x=>x.trim()).map((line,i)=>{
  const cells=line.split(',');
  if(cells.length!==header.length)throw Error(`CSV line ${i+2}: wrong column count; quoted fields are not supported.`);
  const get=(key:string)=>cells[header.indexOf(key)].trim();
  for(const key of ['temperature_k','duration_s','target_fraction','side_fraction'])
    if(!get(key))throw Error(`CSV line ${i+2}: missing ${key}; a missing yield must NOT become zero.`);
  const record:YieldObservation={id:get('id'),reactionId:get('reaction_id'),
   environment:get('environment') as YieldObservation['environment'],
   temperatureK:Number(get('temperature_k')),durationS:Number(get('duration_s')),
   targetFraction:Number(get('target_fraction')),sideFraction:Number(get('side_fraction')),
   source:get('source'),
   ...(header.includes('batch_id')?{batchId:get('batch_id')}:{}),
   ...(header.includes('protocol_id')?{protocolId:get('protocol_id')}:{}),
  };
  checkObservation(record);return record;
 });
}
