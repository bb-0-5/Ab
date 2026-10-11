import type {BuildingCampaign,BuildingRun} from './building_campaign';

const n=(value:number,digits=0)=>Number.isFinite(value)?value.toLocaleString('en-AU',{maximumFractionDigits:digits}):'—';
type Props={campaign:BuildingCampaign;running:boolean;batch:{total:number;completed:number};
 current:BuildingRun|null;onContinue:(count:number)=>void;onStop:()=>void};

function Massing({best}:{best:NonNullable<BuildingRun['best']>}){
 const polys=best.geometry.filter(p=>p.length>=3&&p.every(q=>Number.isFinite(q.x)&&Number.isFinite(q.y)));
 if(!polys.length)return <p className="text-sm text-slate-400">No usable footprint geometry was returned.</p>;
 const scale=15,h=3;
 const p=(x:number,y:number,z=0):[number,number]=>[(x-y)*scale,(x+y)*scale*.48-z*scale*.8];
 const ps=polys.flatMap(poly=>poly.flatMap(v=>[p(v.x,v.y,0),p(v.x,v.y,h)]));
 const xx=ps.map(q=>q[0]), yy=ps.map(q=>q[1]);
 const x0=Math.min(...xx)-30,y0=Math.min(...yy)-30;
 const w=Math.max(170,Math.max(...xx)-Math.min(...xx)+60);
 const height=Math.max(130,Math.max(...yy)-Math.min(...yy)+60);
 const points=(arr:[number,number][])=>arr.map(([x,y])=>`${x},${y}`).join(' ');
 return <figure className="rounded-2xl border border-slate-600/50 bg-[#0b1c28] p-3">
   <div className="flex items-center justify-between gap-3 text-xs text-cyan-100">
    <strong>Best candidate · footprint massing</strong><span className="text-slate-400">illustrative 3 m extrusion</span>
   </div>
   <svg className="mt-2 aspect-[16/10] w-full" viewBox={`${x0} ${y0} ${w} ${height}`} role="img"
    aria-label="Isometric representation derived from the optimised candidate footprint polygons">
    <defs><pattern id="massingGrid" width="24" height="24" patternUnits="userSpaceOnUse">
     <path d="M24 0 H0 V24" stroke="#1e3e4c" strokeWidth=".7" fill="none"/></pattern></defs>
    <rect x={x0} y={y0} width={w} height={height} fill="url(#massingGrid)"/>
    {polys.map((poly,i)=><g key={i}>
      {poly.map((point,j)=>{
       const next=poly[(j+1)%poly.length];
       return <polygon key={j} points={points([p(point.x,point.y,0),p(next.x,next.y,0),
        p(next.x,next.y,h),p(point.x,point.y,h)])}
        fill={j%2?'#165061':'#1c6a76'} stroke="#6da5b0" strokeWidth=".8" />;
      })}
      <polygon points={points(poly.map(q=>p(q.x,q.y,h)))} fill="#1d9097" stroke="#b0f2ed" strokeWidth="1.3"/>
    </g>)}
   </svg>
   <figcaption className="mt-1 text-xs leading-5 text-slate-300">
    {n(best.floorAreaM2,1)} m² · {best.form.replaceAll('_',' ')} · orientation {n(best.orientationDeg)}°
    <span className="mt-1 block text-slate-500">This uses the actual generated footprint, but arbitrary wall height. No windows, rooms, structural members, solar shadows or safety approval are represented.</span>
   </figcaption>
 </figure>;
}
function Trend({campaign}:{campaign:BuildingCampaign}){
 const samples=campaign.samples.filter(s=>s.eligible&&s.lifecycleKWh!==null).slice(-14);
 if(samples.length<2)return <div className="rounded-xl border border-white/10 p-4 text-sm text-slate-400">
  Run more comparable designs to chart whether the incumbent is improving.
 </div>;
 const nums=samples.map(s=>s.lifecycleKWh!);
 const lo=Math.min(...nums),hi=Math.max(...nums);
 const bottom=Math.max(0,lo-(hi-lo||lo*.02)*.35);
 const top=hi+(hi-lo||hi*.02)*.35;
 const sx=(i:number)=>52+i/Math.max(1,samples.length-1)*540;
 const sy=(v:number)=>132-(v-bottom)/(top-bottom||1)*92;
 const path=nums.map((v,i)=>`${i===0?'M':'L'}${sx(i).toFixed(2)} ${sy(v).toFixed(2)}`).join(' ');
 return <div className="rounded-2xl border border-white/10 bg-[#0a1b26] p-3">
  <div className="mb-2 flex flex-wrap justify-between gap-2 text-xs">
   <strong className="text-cyan-100">30-year modeled energy by trial</strong>
   <span className="text-slate-400">Lower is better · feasible trials only</span>
  </div>
  <svg viewBox="0 0 620 166" className="w-full" role="img" aria-label="Line plot of the modeled lifecycle energy for each passing building run; vertical axis is zoomed">
   {[top,(top+bottom)/2,bottom].map((v,i)=><g key={i}>
    <line x1="52" x2="592" y1={sy(v)} y2={sy(v)} stroke="#2f4f5b" strokeDasharray="5 5"/>
    <text x="46" y={sy(v)+4} textAnchor="end" fontSize="10" fill="#cbd5e1">{n(v/1000,1)}k</text>
   </g>)}
   <path d={path} fill="none" stroke="#67e8f9" strokeWidth="2.5"/>
   {samples.map((s,i)=><g key={s.seed}>
    <circle cx={sx(i)} cy={sy(s.lifecycleKWh!)} r="4" fill="#5eead4"/>
    <title>Seed {s.seed}: {n(s.lifecycleKWh!)} kWh; {s.improvement?'beats run reference':'no supported reference saving'}</title>
   </g>)}
   <text x="322" y="160" textAnchor="middle" fill="#94a3b8" fontSize="11">Most recent {samples.length} passing trials →</text>
  </svg>
  <p className="text-[11px] text-slate-400">Axis is zoomed to show differences (not zero-based). These are simulated comparisons under the same selected inputs, not measurements or a physical convergence proof.</p>
 </div>;
}
export default function BuildingProgress({campaign,running,batch,current,onContinue,onStop}:Props){
 const best=campaign.best?.best;
 const latest=current?.best;
 const improvement=Boolean(best&&campaign.best?.comparisonSupported&&campaign.best?.qualifiesAsImprovement
   &&Number.isFinite(campaign.best?.baselineLifecycleKWh));
 const savings=improvement?Math.max(0,campaign.best!.baselineLifecycleKWh!-best!.lifecycleKWh):null;
 return <section aria-label="Building optimisation progress" className="rounded-3xl border border-cyan-500/30 bg-gradient-to-b from-[#122a35] to-[#091722] p-5 md:p-7">
  <div className="flex flex-wrap items-start justify-between gap-4">
   <div><p className="text-[11px] font-bold uppercase tracking-[.18em] text-cyan-300">Live optimisation record</p>
    <h3 className="mt-1 text-2xl font-black">Keep the best. Test more.</h3>
    <p className="mt-2 max-w-2xl text-sm text-slate-300">Each run samples new geometry and ventilation options, and re-evaluates the full winning design from the previous comparable run as a starting point. Infeasible or higher-energy candidates cannot replace the incumbent.</p>
   </div>
   <span className="rounded-full border border-slate-500/50 px-3 py-1.5 text-xs text-slate-200">{running?'● Computing locally':'Ready for next batch'}</span>
  </div>
  <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
   {([
    ['Best passing candidate',best?`${n(best.lifecycleKWh)} kWh`:'Not found'],
    ['Distinct seeds tested',n(campaign.attempts)],
    ['Footprints sampled',n(campaign.footprints)],
    ['Ventilation cases checked',n(campaign.mechanical)],
   ] as const).map(([label,value])=><div key={label} className="rounded-xl border border-white/10 bg-black/20 p-3">
    <p className="text-xs text-slate-400">{label}</p><strong className="mt-1 block text-lg text-white">{value}</strong>
   </div>)}
  </div>
  <div className="mt-4 rounded-xl border border-slate-500/20 bg-black/20 p-3">
   <p className="text-sm text-slate-200">{campaign.viableRuns} of {campaign.attempts} runs found a passing design.
    {savings!==null?` Best run saves an estimated ${n(savings)} kWh against that run's reference over 30 years.`:
     ' There is no defensible savings claim against the reference yet.'}</p>
   <p className="mt-1 text-xs text-slate-400">Campaigns are split by location, area, temperature and weather-file contents; results with different assumptions cannot compete. Longer searches consume this device’s CPU while the page is open, pause between trials when the tab is hidden, and can be stopped at any time.</p>
   {current&&<p className="mt-2 text-xs text-cyan-200">
    Search inheritance: {current.learnedDesignsUsed||0} validated saved full-design candidate(s) included alongside fresh exploration.
   </p>}
   {batch.total>0&&<div className="mt-3">
    <div className="mb-1 flex justify-between text-xs text-cyan-200"><span>Batch progress</span><span>{batch.completed} / {batch.total} completed</span></div>
    <progress className="h-2 w-full accent-cyan-400" value={batch.completed} max={batch.total}/>
   </div>}
   <div className="mt-3 flex flex-wrap gap-3">
    <button type="button" onClick={()=>onContinue(5)} disabled={running}
     className="rounded-xl bg-cyan-400 px-5 py-3 text-sm font-black text-slate-950 hover:bg-cyan-300 disabled:opacity-40">Explore 5 new designs</button>
    <button type="button" onClick={()=>onContinue(25)} disabled={running}
     className="rounded-xl border border-cyan-400/60 px-5 py-3 text-sm font-semibold text-cyan-100 disabled:opacity-40">Run 25 trials</button>
    {running&&<button type="button" onClick={onStop}
     className="rounded-xl border border-rose-300/40 px-5 py-3 text-sm font-bold text-rose-100">Stop search</button>}
   </div>
  </div>
  {campaign.best?.scenarios?.length? <details className="mt-4 rounded-xl border border-slate-600/50 bg-black/20 p-3" open>
   <summary className="cursor-pointer text-sm font-bold text-cyan-100">Compare actual finalists screened in the best run</summary>
   <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[520px] text-left text-xs">
    <thead className="border-b border-white/20 text-slate-300"><tr><th className="py-2">Footprint form</th><th>Annual electricity</th><th>30-year lifecycle</th><th>Ventilation</th><th>Constraint gate</th></tr></thead>
    <tbody>{campaign.best.scenarios.map((row,i)=><tr key={i} className="border-b border-white/10 text-slate-200">
     <td className="py-2">{row.form.replaceAll('_',' ')} · {n(row.areaM2,1)} m²</td>
     <td>{n(row.annualElectricalKWh)} kWh</td><td>{n(row.totalLifecycleKWh)} kWh</td>
     <td>{row.airflowControl.replaceAll('_',' ')}</td>
     <td className={row.eligible?'text-emerald-300':'text-amber-300'}>{row.eligible?'Eligible':'Rejected'}</td>
    </tr>)}</tbody></table></div>
   <p className="mt-2 text-xs text-slate-400">These finalists share the best run's assumptions. Ineligible cases are shown for inspection but cannot win.</p>
  </details>:null}
  <div className="mt-4 grid gap-4 lg:grid-cols-2">
   {best?<Massing best={best}/>:<div className="rounded-xl border border-amber-500/20 bg-amber-950/10 p-4 text-sm text-amber-200">No design has passed all selected constraints yet. Try another batch or revise the inputs.</div>}
   <div className="space-y-4">
    <Trend campaign={campaign}/>
    <div className="rounded-xl border border-slate-700 bg-black/20 p-3 text-sm text-slate-300">
     <strong className="text-white">Next useful validation</strong>
     <p className="mt-1">Provide a nearby EPW file, actual parcel dimensions and shading, real materials and HVAC performance before using these results for construction. Preset climate and room layouts are approximations.</p>
     {latest&&best&&<p className="mt-2 text-xs">Most recent eligible run: {n(latest.lifecycleKWh)} kWh. Best retained: {n(best.lifecycleKWh)} kWh.</p>}
    </div>
   </div>
  </div>
 </section>;
}
