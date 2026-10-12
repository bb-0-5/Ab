/**
 * One authoritative ordered simulation tour. All these engines already exist
 * in src/simulations; this list only exposes their existing work in sequence.
 * The V13 "elements" string is a legacy routing alias, NOT an extra stage.
 */
export const SIMULATION_STAGES=[
 'v0','v1','v2','v3','v4','v5','v6','v7',
 'v8','v9','v10','v11','v12','v13',
] as const;
export type NumberedSimVersion=typeof SIMULATION_STAGES[number];
export const POST_V7_STAGES=SIMULATION_STAGES.slice(8);
export function indexOfStage(version:string):number{
 return SIMULATION_STAGES.indexOf((version==='elements'?'v13':version) as NumberedSimVersion);
}
export function nextStageVersion(version:string):NumberedSimVersion{
 const index=indexOfStage(version);
 return SIMULATION_STAGES[(index+1+SIMULATION_STAGES.length)%SIMULATION_STAGES.length];
}
export function numberedStage(version:string):NumberedSimVersion {
 return indexOfStage(version)>=0
  ?SIMULATION_STAGES[indexOfStage(version)]
  :'v0';
}
/**
 * Stop the UI racing through engines initialized in the same render frame.
 * Real numeric stability must be true AND a stage gets visible dwell time.
 */
export function mayAdvanceStage(
 currentVersion:string,visibleFrames:number,stable:boolean,
 minimumVisibleFrames=90,
):boolean{
 return indexOfStage(currentVersion)>=0
  &&stable&&visibleFrames>=minimumVisibleFrames;
}
