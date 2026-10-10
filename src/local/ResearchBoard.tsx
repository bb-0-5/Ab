import type {MemoryEntry} from './memory';
import type {Discovery} from './cross_domain';
import type {VisualGoal} from './UnifiedOverlay';

const steps:{mode:VisualGoal;title:string;task:string;next:string}[]=[
 {mode:'building',title:'Buildings',task:'Reduce lifecycle energy with feasible geometry and ventilation.',
  next:'Explore more reproducible layouts; supply a nearby weather file for a stronger climate input.'},
 {mode:'circuits',title:'Electronics',task:'Conserve power while matching a passive RF interface.',
  next:'Test a realistic source/load pair, then validate with component and VNA data.'},
 {mode:'chemistry',title:'Chemistry',task:'Reduce byproducts without confusing selectivity and feed yield.',
  next:'Import measured target AND side-product yields before trusting a kinetic fit.'},
 {mode:'membrane',title:'Membranes',task:'Match a material to heat, pressure and fluid constraints.',
  next:'Screen the next membrane environment; missing properties remain unsupported.'},
 {mode:'suit',title:'Fabrication',task:'Produce a printable cosmetic panel within bed and budget.',
  next:'Test fit, slice the STL and check actual material/fabrication costs.'},
];

export default function ResearchBoard({history,findings,working,active,onRun}:{
 history:MemoryEntry[];findings:Discovery[];working:boolean;active:VisualGoal;
 onRun:(mode:VisualGoal)=>void;
}){
 const latest=new Map<VisualGoal,MemoryEntry>();
 for(const item of history)if(!latest.has(item.mode))latest.set(item.mode,item);
 const checks=history.reduce((sum,item)=>{
  const r=item.result as {crossDomain?:unknown};
  return sum+(Array.isArray(r?.crossDomain)?r.crossDomain.length:0);
 },0);
 const observed=findings.filter(item=>item.evidence==='measured_user_data').length;
 return <section aria-label="Shared research progress" className="rounded-3xl border border-white/10 bg-[#0c1d27] p-5 md:p-7">
  <div className="flex flex-wrap items-start justify-between gap-4">
   <div><p className="text-[11px] font-black uppercase tracking-[.2em] text-cyan-300">Shared research log</p>
    <h3 className="mt-1 text-2xl font-black text-white">One discovery can challenge another.</h3>
    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">The engines reuse saved findings as typed hypotheses and test them under each domain's constraints. An unsupported result stays unsupported; no simulated discovery is quietly promoted to a measured fact.</p>
   </div>
   <div className="rounded-xl border border-cyan-600/40 bg-cyan-900/10 p-3 text-xs text-slate-200">
    {history.length} saved runs · {checks} recorded cross-checks · {observed} user-data-backed findings
   </div>
  </div>
  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
   {steps.map(item=>{
    const last=latest.get(item.mode);const isCurrent=active===item.mode;
    const result=last?.result as {crossDomain?:unknown;discoveries?:unknown}|undefined;
    const tested=Array.isArray(result?.crossDomain)?result.crossDomain.length:0;
    return <article key={item.mode} className={`flex flex-col rounded-xl border p-4 ${isCurrent?'border-cyan-400/50 bg-[#163040]':'border-white/10 bg-[#0b1822]'}`}>
     <div className="flex items-center justify-between gap-2"><h4 className="text-sm font-bold text-white">{item.title}</h4>
      <span className={`rounded-full px-2 py-1 text-[10px] ${last?'bg-teal-700/30 text-teal-200':'bg-slate-800 text-slate-400'}`}>{last?'Screened':'Unexplored'}</span></div>
     <p className="mt-3 text-xs leading-5 text-slate-200">{item.task}</p>
     <p className="mt-2 text-[11px] leading-5 text-slate-400">{last
       ?`Last run ${new Date(last.savedAt).toLocaleDateString('en-AU')} · ${tested} stored domain checks.`
       :'No result yet on this device.'}</p>
     <div className="mt-auto pt-4">
      <p className="mb-3 text-[11px] leading-5 text-slate-400"><strong className="text-slate-200">Next evidence:</strong> {item.next}</p>
      <button type="button" onClick={()=>onRun(item.mode)} disabled={working}
       className="w-full rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-2.5 text-xs font-bold text-cyan-100 hover:bg-cyan-400/20 disabled:opacity-40">
       {working?'Calculating…':isCurrent?'Run next test':'Switch & run'}
      </button>
     </div>
    </article>;
   })}
  </div>
  <p className="mt-3 text-[11px] text-slate-400">Counts describe computations, not experimental validation. History is device-local unless you independently configure private cloud backup. Research does not run after you close the page.</p>
 </section>;
}
