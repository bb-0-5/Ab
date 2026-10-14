/** Numerical evidence gate: do not claim improvement if the empty cavity wins.
 * Both designs must share the identical setup and scoring horizon. Preliminary
 * CFD screening is never experimental validation or a proven engineering gain.
 */
export const MIN_COARSE_GAIN=0.01;
const eligible=x=>!!x&&x.accepted===true&&Number.isFinite(x.score)&&x.score>0;
export function compareToReference(reference,candidate,minGain=MIN_COARSE_GAIN){
 if(!eligible(reference)||reference.config!=null)return {ok:false,reason:'missing valid open-cavity reference',gainPercent:null};
 if(!eligible(candidate)||candidate.config==null)return {ok:false,reason:'invalid or non-membrane trial',gainPercent:null};
 if(!Number.isFinite(minGain)||minGain<0)throw Error('invalid gain threshold');
 const gain=candidate.score/reference.score-1,ok=gain>minGain;
 return {ok,reason:ok?'provisional modeled gain':'not better than open cavity by screening threshold',gainPercent:100*gain};
}
export function selectScreeningResult(ranking){
 if(!Array.isArray(ranking)||!ranking.length)throw Error('empty campaign');
 const reference=ranking[0];
 if(!eligible(reference)||reference.config!=null)return {status:'invalid-reference',reference,incumbent:null,seed:null,
  reason:'reference simulation failed: candidate gains cannot be calculated'};
 const candidates=ranking.filter(x=>x?.config!=null&&eligible(x)).sort((a,b)=>b.score-a.score);
 const seed=candidates[0]??null;
 const better=candidates.find(x=>compareToReference(reference,x).ok)??null;
 return {
  status:better?'candidate-provisional':'no-improvement',reference,
  incumbent:better??{...reference,id:-1,label:'Open cavity · no demonstrated membrane improvement',vsEmptyPercent:0},
  seed,reason:better?'One geometry beat the reference on the coarse numerical screen only':
   'No tested membrane beat the reference; open cavity remains the incumbent'
 };
}
export function shouldPromote(reference,incumbent,trial){
 const assessment=compareToReference(reference,trial);
 const ahead=eligible(incumbent)&&trial?.score>incumbent.score*(1+MIN_COARSE_GAIN);
 return {...assessment,ok:assessment.ok&&ahead,
  reason:assessment.ok&&!ahead?'not better than current incumbent':assessment.reason};
}
