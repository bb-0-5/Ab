import type { MatchReport } from './impedance';
import type { RouteSelectivityResult } from './selectivity';

const fmt=(value:number,digits=1)=>value.toLocaleString('en-AU',{maximumFractionDigits:digits});
type Props={circuit?:MatchReport|null;chemistry?:RouteSelectivityResult|null};

/** Plots computed values, not a decorative graph or a physics field. */
export default function EvidenceVisualizer({circuit,chemistry}:Props){
 if(circuit){
  const samples=circuit.frequencyResponse||[];
  if(!samples.length)return null;
  const xs=samples.map(p=>p.frequencyMHz);
  const min=Math.min(...xs),max=Math.max(...xs);
  const x=(v:number)=>54+(max===min?0.5:(v-min)/(max-min))*534;
  const y=(v:number)=>148-Math.min(1,Math.max(0,v))*112;
  const d=samples.map((p,i)=>`${i===0?'M':'L'}${x(p.frequencyMHz).toFixed(2)},${y(p.deliveredPowerFraction).toFixed(2)}`).join(' ');
  const ref=y(circuit.baselineDeliveredPowerFraction);
  return <figure className="mt-4 rounded-2xl border border-cyan-500/20 bg-[#0a1d29] p-4">
   <div className="flex flex-wrap items-center justify-between gap-2">
    <figcaption className="font-bold text-cyan-100">Calculated RF power transfer across frequency</figcaption>
    <span className="text-xs text-slate-400">Same 1 V RMS Thevenin source · nominal parts</span>
   </div>
   <svg className="mt-3 w-full" viewBox="0 0 640 205" role="img" aria-label="Zero-based power fraction versus frequency for the chosen L-network compared with direct source-to-load connection">
    {[0,.25,.5,.75,1].map(v=><g key={v}>
     <line x1="54" x2="588" y1={y(v)} y2={y(v)} stroke="#244654" strokeDasharray="3 5"/>
     <text x="45" y={y(v)+4} fill="#cbd5e1" fontSize="11" textAnchor="end">{Math.round(v*100)}%</text>
    </g>)}
    <line x1="54" x2="588" y1={ref} y2={ref} stroke="#fbbf24" strokeWidth="2" strokeDasharray="7 5"/>
    <path d={d} fill="none" stroke="#67e8f9" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"/>
    {samples.filter((_,i)=>i%5===0).map((sample,i)=><circle key={i} cx={x(sample.frequencyMHz)} cy={y(sample.deliveredPowerFraction)} r="4" fill="#67e8f9"/>)}
    <text x="54" y="182" fill="#cbd5e1" fontSize="11" textAnchor="start">{fmt(min,2)} MHz</text>
    <text x="588" y="182" fill="#cbd5e1" fontSize="11" textAnchor="end">{fmt(max,2)} MHz</text>
    <text x="321" y="200" fill="#94a3b8" fontSize="11" textAnchor="middle">Frequency →</text>
   </svg>
   <p className="text-xs text-slate-200"><span className="text-cyan-300">━━</span> Nominal L-network &nbsp; <span className="text-amber-300">┄┄</span> Direct connection ({fmt(circuit.baselineDeliveredPowerFraction*100)}%).
    Part sensitivity separately checked at ±5% corners.</p>
   <p className="mt-2 text-[11px] text-slate-400">Zero-based vertical scale; these are calculated lumped-circuit fractions, not measured S-parameters. No real component parasitics or PCB layout are included.</p>
  </figure>;
 }
 if(chemistry){
  const before=chemistry.baseline,after=chemistry.gate;
  const bars=[
   {label:'Unfiltered feed',target:before.targetPerInput,side:before.sidePerInput,waste:before.wastePerInput,passed:1},
   {label:'After route gate',target:after.targetPerInput,side:after.sidePerInput,waste:after.wastePerInput,passed:after.acceptedFraction},
  ];
  return <figure className="mt-4 rounded-2xl border border-indigo-500/30 bg-[#14182d] p-4">
   <figcaption className="font-bold text-indigo-100">Where every 100 feed units go</figcaption>
   <p className="mt-1 text-xs text-slate-300">Absolute output per original feed, not just a selectivity percentage. Filtering cannot create additional molecules.</p>
   <div className="mt-4 space-y-4">
    {bars.map(row=><div key={row.label}>
     <div className="mb-1 flex flex-wrap justify-between gap-2 text-xs text-slate-200"><span>{row.label}</span>
      <span>{fmt(row.target*100)} target · {fmt(row.side*100)} side · {fmt((1-row.passed)*100)} rejected</span></div>
     <div className="flex h-6 overflow-hidden rounded-lg bg-slate-700" role="img"
       aria-label={`${row.label}: ${fmt(row.target*100)} percent target and ${fmt(row.side*100)} percent unwanted products, ${fmt((1-row.passed)*100)} percent feed rejected`}>
      <div style={{width:`${row.target*100}%`,backgroundColor:'#4ade80'}}/>
      <div style={{width:`${row.side*100}%`,backgroundColor:'#fda4af'}}/>
      <div style={{width:`${row.waste*100}%`,backgroundColor:'#94a3b8'}}/>
      <div style={{width:`${(1-row.passed)*100}%`,backgroundColor:'#334155'}}/>
     </div>
    </div>)}
   </div>
   <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-300">
    <span>🟩 Desired output</span><span>🟥 Side product</span>
    <span>Grey: processed feed without either product</span><span>Dark: rejected feed</span>
   </div>
   <p className="mt-2 text-[11px] text-slate-400">Categorical illustrative probabilities only. No measured chemistry, catalysts or molecular wavefunctions are implied by this graphic.</p>
  </figure>;
 }
 return null;
}
