/**
 * Persistent proposed chemistry RECIPE list, not a database of successful
 * syntheses, isotopes, measured yields or validated material properties.
 * V13 recomputes every heuristic composite whenever a recipe is restored.
 */
export type ProposedRecipe={
  parts:Array<{z:number;fraction:number}>;
  /** Structural identity independent of the user-provided fraction scale. */
  id:string;
  savedAt:number;
  evidence:'hypothesis_only_unmeasured';
};
const KEY='abovebound.v13.material-recipes.v1';
const CAP=12;
export function recipeIdentity(parts:ProposedRecipe['parts']):string{
 if(!Array.isArray(parts)||parts.length<1||parts.length>16)throw Error('Invalid candidate count');
 const seen=new Set<number>();
 let total=0;
 for(const part of parts){
  if(!part||!Number.isInteger(part.z)||part.z<1||part.z>118
    ||!Number.isFinite(part.fraction)||part.fraction<=0||seen.has(part.z))
    throw Error('Invalid recipe element or positive mixing ratio');
  seen.add(part.z);total+=part.fraction;
 }
 if(!Number.isFinite(total)||total<=0)throw Error('Invalid composition total');
 const normalized=parts.map(p=>({
  z:p.z,fraction:p.fraction/total,
 })).sort((a,b)=>a.z-b.z);
 return JSON.stringify(normalized.map(p=>[p.z,Math.round(p.fraction*1e8)]));
}
export function loadMaterialRecipes():ProposedRecipe[]{
 try{
  const rows=JSON.parse(localStorage.getItem(KEY)||'[]');
  if(!Array.isArray(rows))return [];
  const safe:ProposedRecipe[]=[];
  for(const row of rows.slice(0,CAP)){
   if(!row?.parts||row?.evidence!=='hypothesis_only_unmeasured')continue;
   try{
    const id=recipeIdentity(row.parts);
    if(id!==row.id||safe.some(other=>other.id===id))continue;
    safe.push({id,parts:row.parts.map((p:{z:number;fraction:number})=>({...p})),
      savedAt:Number.isFinite(row.savedAt)?row.savedAt:0,
      evidence:'hypothesis_only_unmeasured'});
   }catch{/* Ignore corrupt entries without stopping live experiments. */}
  }
  return safe;
 }catch{return [];}
}
export function rememberMaterialRecipe(parts:ProposedRecipe['parts']):number{
 try{
  const id=recipeIdentity(parts);
  const old=loadMaterialRecipes();
  const record:ProposedRecipe={parts:parts.map(x=>({...x})),id,
    savedAt:Date.now(),evidence:'hypothesis_only_unmeasured'};
  const recent=[record,...old.filter(x=>x.id!==id)].slice(0,CAP);
  localStorage.setItem(KEY,JSON.stringify(recent));
  return recent.length;
 }catch{return loadMaterialRecipes().length;}
}
