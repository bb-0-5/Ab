import type { CSSProperties } from 'react';
import type { Discovery, OperatingCondition } from './cross_domain';

export type VisualGoal='building'|'circuits'|'chemistry'|'membrane'|'suit';
export interface VisualMetrics {
 headline:string;subtitle:string;
 feasibility:'screened'|'conditional'|'unsupported'|'no_result';
 tested:number;
 selected:string;
 materialCostAUD:number|null;
 remaining:string;
}
interface OverlayProps {
 goal:VisualGoal;
 condition:OperatingCondition;
 findings:Discovery[];
 metrics:VisualMetrics;
 /** Engineering trade-off plot: cheap material vs a labelled SECTION PROXY,
  * NOT certified physical stiffness. */
 frontier?:Array<{cost:number;section:number;acceptable:boolean;material:string}>;
 budgetAUD?:number;
 onSelectGoal:(next:VisualGoal)=>void;
}
/**
 * One composite, interactive viewport. It VISUALIZES shared constraints and
 * discovery handoff; not a CFD, FEA, quantum chemistry or flight solver.
 * Nodes correspond to currently implemented task-specific screens.
 */
const DOMAINS:{id:VisualGoal;name:string;pos:[number,number];color:string}[]=[
 {id:'building',name:'BUILDING',pos:[134,143],color:'#67e8f9'},
 {id:'chemistry',name:'CHEMISTRY',pos:[126,340],color:'#a5b4fc'},
 {id:'membrane',name:'MEMBRANE',pos:[335,480],color:'#5eead4'},
 {id:'circuits',name:'CIRCUITS',pos:[800,148],color:'#facc15'},
 {id:'suit',name:'SUIT / FDM',pos:[806,381],color:'#fda4af'},
];
const region=(goal:VisualGoal)=>{
 if(goal==='suit')return 'Suit concepts can produce printer-compatible cosplay components, not flight-ready hardware.';
 if(goal==='chemistry')return 'Statistical event pathways are model-dependent; a possibility is not a guaranteed yield.';
 if(goal==='membrane')return 'Physical medium controls heat transfer and candidate material survival.';
 if(goal==='circuits')return 'Electrical match depends on source and load; not a motherboard S-parameter model.';
 return 'Geometry, weather and airflow screen share climate but need physical validation.';
};
function SuitPlate(){
 // Layered full-body artistic silhouette; the model's ACTUAL CAD export is
 // only a small flat wearable/cosplay trim panel, not these visual suit parts.
 return <g transform="translate(505 257)" fill="#152a3e" stroke="#7dd3fc" strokeWidth="2.2">
   <path d="M-21,-137 L14,-137 L28,-119 L27,-90 L14,-74 L-19,-74 L-31,-96 L-30,-119Z"
    fill="#334155" stroke="#fda4af" strokeWidth="2.6"/>
   <path d="M-22,-119 L-8,-126 L17,-122 L20,-107 L8,-104 L-17,-105Z"
    fill="#fbbf24" stroke="#fde68a" strokeWidth="1"/>
   <path d="M-34,-73 L26,-73 L53,-48 L42,17 L26,37 L-31,37 L-46,15 L-54,-44Z" fill="#1e3a4c"/>
   <path d="M-17,-58 L11,-58 L32,-34 L15,-13 L-20,-13 L-36,-34Z" fill="#7f1d1d" stroke="#fb7185" strokeWidth="2"/>
   <circle cx="-2" cy="-32" r="16" stroke="#67e8f9" strokeWidth="3" fill="#0c4a6e"/>
   <circle cx="-2" cy="-32" r="8" stroke="#e0f2fe" strokeWidth="2" fill="#155e75"/>
   <path d="M-41,30 L38,30 L29,60 L-29,60Z" fill="#334155"/>
   <path d="M-53,-59 L-79,-45 L-91,0 L-74,10 L-57,-25 L-41,-34Z
     M52,-59 L77,-45 L91,0 L76,10 L57,-25 L42,-34Z" fill="#881337"/>
   <path d="M-90,2 L-99,65 L-80,74 L-71,21Z" fill="#164e63"/>
   <path d="M90,2 L99,65 L80,74 L71,21Z" fill="#164e63" stroke="#fda4af" strokeWidth="3.6"/>
   <path d="M-98,69 L-102,86 L-80,89 L-78,74 M99,69 L102,86 L80,89 L79,74" fill="#334155"/>
   <path d="M-26,60 L-38,103 L-31,148 L-10,148 L0,83 L9,148 L31,148 L37,105 L25,60Z" fill="#1e3a4c"/>
   <path d="M-31,133 L-38,155 L-9,155 L-9,145 M11,145 L10,155 L39,155 L31,133" fill="#881337"/>
   <path d="M-95,13 L-79,18 M76,18 L94,14 M-23,102 L-31,122 M22,102 L31,122"
    fill="none" stroke="#fda4af" strokeWidth="1.5"/>
   <text x="0" y="173" textAnchor="middle" fill="#fda4af" stroke="none" fontSize="11">SUIT LOOK · DECORATIVE ONLY</text>
 </g>;
}
function WaveRenderer({goal}:{goal:VisualGoal}){
 if(goal==='suit')return <SuitPlate/>;
 if(goal==='building')return <g transform="translate(510 286)">
   <path d="M-80,5 L0,-45 L84,0 L5,54Z" fill="#164e63" stroke="#67e8f9" strokeWidth="3"/>
   <path d="M0,-45 L0,-94 L84,-49 L84,0 M0,-94 L-80,-44 L-80,5"
    fill="#0c263b" stroke="#67e8f9" strokeWidth="2.2"/>
   <path d="M-57,-17 L-31,-32 L-4,-17 L-29,-2Z M10,-21 L42,-4 L42,18 L10,1Z"
    fill="#fde68a" opacity=".38"/>
   <path d="M-98,-75 C-30,-115 45,-110 99,-69" stroke="#facc15" strokeWidth="2" fill="none" strokeDasharray="6 6"/>
  </g>;
 if(goal==='chemistry')return <g transform="translate(500 280)">
   <circle cx="-72" cy="-24" r="24" fill="#312e81" stroke="#c7d2fe" strokeWidth="3"/>
   <circle cx="-45" cy="10" r="13" fill="#4338ca" stroke="#c7d2fe" strokeWidth="2"/>
   <circle cx="30" cy="-52" r="26" fill="#14532d" stroke="#86efac" strokeWidth="3"/>
   <circle cx="83" cy="38" r="21" fill="#7f1d1d" stroke="#fecaca" strokeWidth="2"/>
   <path d="M-58,-20 L8,-45 M-45,12 L70,30" stroke="#c4b5fd" strokeWidth="2" fill="none" strokeDasharray="5 8"/>
   <path d="M-9,-81 Q25,-100 65,-65" stroke="#a5b4fc" strokeWidth="2" fill="none"/>
   <text x="10" y="-120" textAnchor="middle" fontSize="12" fill="#c7d2fe">P(event by t) = 1 − e⁻ᵏᵗ</text>
  </g>;
 if(goal==='circuits')return <g transform="translate(510 287)">
   <path d="M-140,-15 H-95 Q-84,-15 -84,-28 Q-84,-41 -72,-41 Q-60,-41 -60,-28 Q-60,-15 -48,-15 H-20"
    stroke="#fde68a" strokeWidth="5" fill="none"/>
   <path d="M-20,-15 H42 M42,-15 H110 M42,-15 V11 M25,11 H59 M25,23 H59 M42,23 V62 M42,62 H-36 M-36,62 V-15"
    stroke="#67e8f9" strokeWidth="4" fill="none"/>
   <circle cx="110" cy="-15" r="8" fill="#f59e0b"/>
   <circle cx="-140" cy="-15" r="8" fill="#06b6d4"/>
   <text x="42" y="87" fill="#bae6fd" fontSize="11" textAnchor="middle">L / C · constrained matching</text>
  </g>;
 return <g transform="translate(500 285)">
   <path d="M-95,-55 Q-15,-93 95,-45 M-95,-15 Q0,-54 95,-4 M-95,25 Q10,-12 95,35 M-95,60 Q0,29 95,64"
    stroke="#5eead4" strokeWidth="4" opacity=".83" fill="none"/>
   <path d="M-85,-72 L-45,-31 L5,-55 L42,-6 L83,-35 M-77,74 L-29,25 L18,51 L68,8"
    stroke="#a7f3d0" strokeWidth="1.4" fill="none"/>
   {[-1,0,1].map(i=><circle key={i} cx={i*59} cy={-13+i*14} r="6" fill="#5eead4"/>)}
  </g>;
}
export default function UnifiedOverlay({
 goal,condition,findings,metrics,onSelectGoal,frontier=[],budgetAUD=0,
}:OverlayProps){
 const selected=DOMAINS.find(x=>x.id===goal);
 return <section aria-label="Unified optimization visualization" className="relative overflow-hidden rounded-3xl border border-cyan-500/25 bg-gradient-to-br from-[#071b27] via-[#081821] to-[#090f1a] p-4 md:p-6">
  <div className="relative z-20 flex flex-wrap items-start justify-between gap-4">
   <div>
    <div className="text-[10px] font-black uppercase tracking-[.21em] text-cyan-300">Shared discovery field · interactive one-screen view</div>
    <h3 className="mt-1 text-2xl font-black text-white">{metrics.headline}</h3>
    <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-300">{metrics.subtitle}</p>
   </div>
   <div className="flex flex-col items-end gap-1 text-[10px] font-mono text-slate-300">
    <span className="rounded-full border border-cyan-500/30 bg-black/40 px-3 py-1.5">{condition.medium} · {condition.temperatureK.toLocaleString('en-AU')} K</span>
    <span className="text-slate-400">{condition.pressurePa.toLocaleString('en-AU')} Pa · {condition.flowSpeedMs} m/s</span>
   </div>
  </div>
  <div className="relative mt-4 aspect-[1000/550] w-full min-h-[260px] overflow-hidden rounded-2xl border border-white/5 bg-[#04111c]">
   <svg viewBox="0 0 1000 550" role="img" aria-label="Shared discovery topology and current task schematic overlay" className="absolute inset-0 h-full w-full">
    <defs>
     <pattern id="sharedFieldGrid" width="34" height="34" patternUnits="userSpaceOnUse"><path d="M34 0 H0 V34" fill="none" stroke="#0e3341" strokeWidth=".8"/></pattern>
     <radialGradient id="fieldCore"><stop offset="0%" stopColor="#155e75" stopOpacity=".5"/><stop offset="100%" stopColor="#020a12" stopOpacity="0"/></radialGradient>
    </defs>
    <rect width="1000" height="550" fill="url(#sharedFieldGrid)"/>
    <circle cx="505" cy="268" r="248" fill="url(#fieldCore)"/>
    {DOMAINS.map(domain=><g key={domain.id}>
     <path d={`M ${domain.pos[0]} ${domain.pos[1]} Q 505 ${domain.pos[1]+(268-domain.pos[1])*.33} 505 268`}
      stroke={domain.color} strokeWidth={domain.id===goal?2.6:1.2} strokeDasharray={domain.id===goal?'0':'5 10'}
      fill="none" opacity={domain.id===goal?.9:.28}/>
     <circle cx={domain.pos[0]} cy={domain.pos[1]} r={domain.id===goal?25:17}
      fill="#082636" stroke={domain.color} strokeWidth={domain.id===goal?3:1.5}
      opacity={domain.id===goal?1:.8}/>
     <text x={domain.pos[0]} y={domain.pos[1]+35} fontSize="14" fontWeight="bold" fill={domain.color} textAnchor="middle">{domain.name}</text>
    </g>)}
    <circle cx="505" cy="268" r="140" stroke={selected?.color||'#67e8f9'} strokeWidth="1" fill="none" opacity=".65" strokeDasharray="5 6"/>
    <circle cx="505" cy="268" r="112" stroke="#176b7d" strokeWidth=".8" fill="none" opacity=".5"/>
    <WaveRenderer goal={goal}/>
    <text x="505" y="451" fontSize="13" fill="#d1fae5" textAnchor="middle">CONSTRAINT INTERSECTION</text>
    <text x="505" y="472" fontSize="11" fill="#94a3b8" textAnchor="middle">schematic overlay · not a physics field solver</text>
   </svg>
   <div className="absolute inset-0 z-10" aria-label="Select any simulation to see its constraints">
    {DOMAINS.map(domain=><button key={domain.id} type="button" onClick={()=>onSelectGoal(domain.id)}
      aria-label={`Explore ${domain.name} constraints`}
      className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full outline-none focus:ring-4 focus:ring-cyan-300/40"
      style={{left:`${domain.pos[0]/10}%`,top:`${domain.pos[1]/5.5}%`,
       width:52,height:52,backgroundColor:'transparent'} as CSSProperties}/>)}
   </div>
   <div className="pointer-events-none absolute bottom-3 right-3 z-20 rounded-md border border-white/10 bg-black/60 px-2 py-1 text-[9px] text-slate-300">
    Tap a domain node to switch simulations
   </div>
  </div>
  <div className="relative z-20 mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
   {[
    ['Selected configuration',metrics.selected],
    ['Constraints tested',String(metrics.tested)],
    ['Material/print estimate',metrics.materialCostAUD===null?'Not established':`$${metrics.materialCostAUD.toFixed(2)} AUD`],
    ['Physical evidence',metrics.feasibility.replaceAll('_',' ')],
   ].map(([label,value])=><div key={label} className="rounded-xl border border-white/10 bg-black/25 p-3">
    <p className="text-[10px] text-slate-400">{label}</p>
    <p className="mt-1 break-words text-sm font-bold text-white">{value}</p>
   </div>)}
  </div>
  {goal==='suit'&&frontier.length>0&&<div className="mt-3 rounded-2xl border border-cyan-400/15 bg-black/25 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
     <strong className="text-xs text-cyan-200">Material cost ↔ geometric section trade-off</strong>
     <span className="text-[10px] text-slate-400">Below budget and above minimum section = candidate, not strength certification</span>
    </div>
    {(()=>{
      const minCost=Math.min(...frontier.map(x=>x.cost),budgetAUD);
      const maxCost=Math.max(...frontier.map(x=>x.cost),budgetAUD,minCost+.01);
      const maxSection=Math.max(...frontier.map(x=>x.section),1);
      const projectX=(v:number)=>30+(v-minCost)/(maxCost-minCost)*540;
      const projectY=(v:number)=>128-Math.min(1,v/maxSection)*110;
      const x=projectX(budgetAUD);
      return <svg viewBox="0 0 620 170" aria-label="Schematic plot of printable material cost versus geometric section bound" role="img"
        className="mt-2 h-36 w-full">
       <path d="M30 10 V128 H590" fill="none" stroke="#64748b" strokeWidth="1.5"/>
       <line x1={x} x2={x} y1="12" y2="128" stroke="#fb7185" strokeDasharray="5 5"/>
       <text x={Math.min(535,x+5)} y="22" fontSize="11" fill="#fda4af">budget</text>
       {frontier.map((v,i)=><g key={i}>
        <circle cx={projectX(v.cost)} cy={projectY(v.section)} r={v.acceptable?7:4.2}
         fill={v.acceptable?'#5eead4':'#fb7185'} opacity={v.acceptable?1:.55}/>
        <title>{v.material}: ${v.cost.toFixed(2)} AUD / ${v.section.toFixed(1)} mm⁴ proxy / {v.acceptable?'screened':'fails some constraints'}</title>
       </g>)}
       <text x="30" y="156" fontSize="12" fill="#94a3b8">Cost increases →</text>
       <text x="320" y="156" fontSize="12" fill="#94a3b8">Higher geometric section ↑ (not verified strength)</text>
      </svg>;
    })()}
   </div>}
  <p className="mt-3 text-[11px] leading-5 text-amber-200">{region(goal)} {metrics.remaining}</p>
  <p className="mt-2 text-[11px] text-slate-400">{findings.length} previously recorded typed discoveries available for cross-domain screening. A schematic connection indicates a probe, not a validated physical effect.</p>
 </section>;
}
