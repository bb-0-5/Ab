import type {MatchReport,PassivePart} from './impedance';
import type {MaterialReport} from './cross_domain';
import type {RouteSelectivityResult} from './selectivity';
import type {FabResult} from './fabrication';

export type TechMode='circuits'|'building'|'chemistry'|'membrane'|'suit';
type BuildingView={best?:null|{
 geometry:Array<Array<{x:number;y:number}>>;form:string;floorAreaM2:number;
 orientationDeg:number;annualElectricityKWh:number;lifecycleKWh:number;
 };siteCandidates?:number;mechanicalCandidates?:number;weather?:{mode:string}};
type Props={mode:TechMode;rf?:MatchReport|null;building?:BuildingView|null;
 chemistry?:RouteSelectivityResult|null;membrane?:MaterialReport|null;suit?:FabResult|null;
 working:boolean};
const fmt=(v:number,digits=1)=>v.toLocaleString('en-AU',{maximumFractionDigits:digits});
function Ground({x,y}:{x:number;y:number}){return <g stroke="#89a6b6" strokeWidth="2" fill="none">
 <path d={`M${x} ${y-10} V${y} M${x-17} ${y} h34 M${x-12} ${y+7} h24 M${x-6} ${y+14} h12`}/></g>}
function PartSymbol({p,x,y,vertical=false}:{p:PassivePart;x:number;y:number;vertical?:boolean}){
 return <g transform={`translate(${x} ${y}) rotate(${vertical?90:0})`}>
  {p.type==='L'
   ?<path d="M-48 0 H-34 Q-32 -23 -20 0 Q-10 -23 0 0 Q10 -23 20 0 Q32 -23 34 0 H48"
     stroke="#7cefe3" strokeWidth="3.1" strokeLinecap="round" fill="none"/>
   :<g stroke="#7cefe3" strokeWidth="3.1"><path d="M-48 0 H-9 M9 0 H48 M-9 -22 V22 M9 -22 V22"/></g>}
  <rect x="-52" y="-28" width="104" height="56" rx="5" stroke="#54abae" strokeWidth=".7"
   strokeDasharray="4 6" fill="none" opacity=".4"/>
 </g>;
}
function CircuitSchematic({report}:{report:MatchReport|null|undefined}){
 const b=report?.best;
 const shuntAt=b?.topology==='shunt_then_series'?394:701;
 const supply=report?.requested.sourceOhms??50;
 const load=report?.requested.loadOhms??100;
 return <svg viewBox="0 0 960 430" className="tech-canvas-svg" role="img"
  aria-label="Actual selected passive series/shunt RF matching topology, including source resistance and termination">
  <defs>
   <pattern id="techDots" width="23" height="23" patternUnits="userSpaceOnUse">
    <circle cx="1" cy="1" r="1" fill="#49616c" opacity=".42"/></pattern>
   <linearGradient id="copperSignal" x1="0" x2="1">
    <stop stopColor="#347e94"/><stop offset=".52" stopColor="#6ce5d6"/><stop offset="1" stopColor="#5db1bd"/></linearGradient>
  </defs>
  <rect width="960" height="430" fill="#0b131b"/>
  <rect width="960" height="430" fill="url(#techDots)"/>
  <g fontSize="11" fill="#758995" fontFamily="monospace" letterSpacing="1">
   <text x="26" y="32">RF / MATCH NETWORK</text><text x="755" y="32">SCHEMATIC • NOT PCB</text>
   <text x="26" y="405">SOURCE  →  NETWORK  →  LOAD</text>
   <text x="776" y="405">MODEL / LUMPED</text>
  </g>
  {/* Component boundaries are electrical nodes; there is no implied board routing. */}
  <path d="M150 194 H222 M324 194 H520 M616 194 H816"
   stroke="url(#copperSignal)" strokeWidth="3.5" fill="none"/>
  <circle cx="106" cy="194" r="42" fill="#101e29" stroke="#5d93a4" strokeWidth="2"/>
  <path d="M106 152 V139 M106 236 V333" stroke="#5d93a4" strokeWidth="2.3"/>
  <path d="M99 178 h14 M106 171 v14 M99 211 h14" stroke="#d5e6e9" strokeWidth="1.8"/>
  <Ground x={106} y={337}/>
  <text x="106" y="130" fontSize="15" fill="#d6edf0" textAnchor="middle" fontWeight="600">AC 1 V</text>
  <text x="106" y="266" fontSize="11" fill="#91a9b4" textAnchor="middle">THEVENIN</text>
  {/* Source impedance drawn as an actual resistor symbol. */}
  <path d="M222 194 l10 -11 l12 22 l12 -22 l12 22 l12 -22 l12 22 l12 -11 H324"
   stroke="#a9c2d0" strokeWidth="2.7" fill="none"/>
  <text x="274" y="158" fontSize="15" fill="#f2f5f5" textAnchor="middle">Rₛ</text>
  <text x="274" y="235" fontSize="14" fill="#9fb4c0" textAnchor="middle">{fmt(supply,1)} Ω</text>
  {/* Series component at 568; source- vs load-side shunt changes topology. */}
  <PartSymbol p={b?.series??{type:'L',value:0,unit:'H',label:'pending'}} x={568} y={194}/>
  <text x="568" y="126" textAnchor="middle" fontSize="12" fill="#9cb3bc">SERIES / Z1</text>
  <text x="568" y="152" fontSize="16" fill="#a0fff0" textAnchor="middle" fontWeight="650">{b?.series.label??'calculating…'}</text>
  <circle cx={shuntAt} cy="194" r="5" fill="#91f0df"/>
  <path d={`M${shuntAt} 194 V262 M${shuntAt} 330 V344`}
    stroke="#4bbba9" strokeWidth="3.1"/>
  <PartSymbol p={b?.shunt??{type:'C',value:0,unit:'F',label:'pending'}} x={shuntAt} y={296} vertical/>
  <Ground x={shuntAt} y={348}/>
  <text x={shuntAt+(shuntAt<500?53:-57)} y="277" fontSize="12" fill="#9cb3bc"
   textAnchor={shuntAt<500?'start':'end'}>SHUNT / Z2</text>
  <text x={shuntAt+(shuntAt<500?53:-57)} y="299" fontSize="15" fill="#a0fff0"
   textAnchor={shuntAt<500?'start':'end'} fontWeight="650">{b?.shunt.label??'calculating…'}</text>
  {/* Load: a termination to ground, not a mystery antenna. */}
  <circle cx="820" cy="194" r="5" fill="#91f0df"/>
  <path d="M820 194 V250 l-12 11 l24 12 l-24 12 l24 12 l-12 11 V344" stroke="#d2dfe4"
   fill="none" strokeWidth="2.7"/>
  <Ground x={820} y={349}/>
  <text x="855" y="263" fontSize="14" fill="#f2f5f5">Rₗ</text>
  <text x="855" y="285" fontSize="15" fill="#9fb4c0">{fmt(load,1)} Ω</text>
  <path d="M29 75 H931 M29 374 H931" stroke="#324450" strokeWidth="1"/>
  <g fill="#e6faf7" fontFamily="monospace" fontSize="11">
   <rect x="28" y="57" width="9" height="8" rx="1" fill="#65d9c9"/>
   <text x="44" y="65" fill="#94c7c6">CONNECTED NODES</text>
   <text x="650" y="65" fill="#7794a3">{b?.topology==='shunt_then_series'?'PARALLEL → SERIES':'SERIES → PARALLEL'}</text>
  </g>
 </svg>;
}
function SiteStage({data}:{data:BuildingView|null|undefined}){
 const polys=data?.best?.geometry?.filter(p=>p.length>=3)||[];
 const xs=polys.flatMap(p=>p.map(v=>v.x)),ys=polys.flatMap(p=>p.map(v=>v.y));
 const extent=Math.max(1,(Math.max(...xs,0)-Math.min(...xs,0))+(Math.max(...ys,0)-Math.min(...ys,0)));
 const scale=Math.min(17,500/extent);
 const cx=(Math.max(...xs,0)+Math.min(...xs,0))/2;
 const cy=(Math.max(...ys,0)+Math.min(...ys,0))/2;
 const transform=(x:number,y:number,z=0):[number,number]=>[490+(x-cx-y+cy)*scale,248+(x-cx+y-cy)*scale*.42-z*scale*.85];
 const pts=(points:[number,number][])=>points.map(p=>p.join(',')).join(' ');
 return <svg viewBox="0 0 960 430" role="img" className="tech-canvas-svg"
  aria-label="Massing generated from calculated building footprints; height and materials are illustrative">
  <defs><pattern id="siteGrid" width="30" height="30" patternUnits="userSpaceOnUse">
   <path d="M30 0 H0 V30" stroke="#3a4a54" strokeWidth=".6" fill="none"/></pattern></defs>
  <rect width="960" height="430" fill="#101820"/><rect width="960" height="430" fill="url(#siteGrid)"/>
  <g fontSize="11" fontFamily="monospace" fill="#8ea7b3"><text x="26" y="30">SITE MASSING / CONSTRAINT SCREEN</text>
   <text x="681" y="30">GEOMETRY FROM SOLVER</text></g>
  <path d="M75 350 H885" stroke="#2b4e57" strokeDasharray="6 8"/>
  {polys.map((poly,i)=><g key={i}>
   {poly.map((a,j)=>{const b=poly[(j+1)%poly.length];return <polygon key={j}
    points={pts([transform(a.x,a.y),transform(b.x,b.y),transform(b.x,b.y,3),transform(a.x,a.y,3)])}
    fill={j%2?'#144d59':'#207285'} stroke="#5f9ba4" strokeWidth="1.4"/>})}
   <polygon points={pts(poly.map(p=>transform(p.x,p.y,3)))}
    fill="#1e9cab" stroke="#b0fff3" strokeWidth="1.5" fillOpacity=".83"/>
  </g>)}
  {!polys.length&&<g><rect x="320" y="125" width="330" height="182" stroke="#365968" strokeDasharray="8 8" fill="none"/>
    <text x="485" y="220" textAnchor="middle" fill="#8eacb9" fontFamily="monospace">AWAITING FEASIBLE GEOMETRY</text></g>}
  <text x="26" y="402" fill="#91a9b7" fontFamily="monospace" fontSize="11">EXTRUDED VIEW ONLY / NOT STRUCTURAL CAD</text>
  </svg>;
}
function ChemistryStage({data}:{data:RouteSelectivityResult|null|undefined}){
 const target=data?.gate.targetPerInput??0,side=data?.gate.sidePerInput??0;
 const rejected=data?1-data.gate.acceptedFraction:0;
 return <svg viewBox="0 0 960 430" className="tech-canvas-svg" role="img" aria-label="Material balance flows from one input to desired, side and rejected outputs">
  <rect width="960" height="430" fill="#101820"/>
  <g fill="#95aab8" fontSize="11" fontFamily="monospace"><text x="26" y="33">REACTOR / PATHWAY ACCOUNTING</text>
   <text x="746" y="33">HYPOTHETICAL MODEL</text></g>
  <rect x="85" y="147" width="150" height="120" rx="7" stroke="#6a9bab" fill="#162932" strokeWidth="2"/>
  <text x="160" y="196" textAnchor="middle" fill="#d6eff1" fontSize="18" fontWeight="700">FEED</text>
  <text x="160" y="221" textAnchor="middle" fill="#9db7bf" fontSize="15">100 units</text>
  <path d="M235 207 H405" stroke="#93bbc7" strokeWidth="9" fill="none"/>
  <path d="M405 207 L385 196 V218 Z" fill="#93bbc7"/>
  <rect x="419" y="132" width="157" height="150" rx="10" fill="#20313c" stroke="#8aaab6" strokeWidth="2"/>
  <path d="M435 153 H560 M435 175 H560 M435 198 H560 M435 220 H560 M435 242 H560" stroke="#386270" strokeWidth="2"/>
  <text x="498" y="113" textAnchor="middle" fill="#d5e4e9" fontSize="16" fontWeight="600">PATHWAY GATE</text>
  {[
   {v:target,label:'TARGET',colour:'#83e5ca',cy:102},
   {v:side,label:'SIDE',colour:'#f5b783',cy:213},
   {v:rejected,label:'REJECTED',colour:'#d99292',cy:322},
  ].map(row=><g key={row.label}>
   <path d={`M576 207 H635 V${row.cy} H745`} stroke={row.colour} strokeWidth={Math.max(2,row.v*21)} opacity=".75" fill="none"/>
   <rect x="745" y={row.cy-31} width="150" height="63" rx="5" fill="#142630" stroke={row.colour}/>
   <text x="757" y={row.cy-6} fill="#a4b9c3" fontSize="11" fontFamily="monospace">{row.label}</text>
   <text x="757" y={row.cy+18} fill={row.colour} fontSize="22" fontWeight="750">{data?(row.v*100).toFixed(1)+'%':'—'}</text>
  </g>)}
  <text x="35" y="398" fill="#94aab4" fontFamily="monospace" fontSize="11">WIDTH SCALED TO ORIGINAL FEED FRACTION • NOT MOLECULAR DYNAMICS</text>
 </svg>;
}
function MembraneStage({data}:{data:MaterialReport|null|undefined}){
 const k=data?.selected?.thermalConductivityWmK;
 const material=data?.selected?.label||'UNRESOLVED';
 return <svg viewBox="0 0 960 430" className="tech-canvas-svg" role="img" aria-label="Schematic of material cross section, labelled with reference thermal data where available">
  <defs><pattern id="matGrid" width="20" height="20" patternUnits="userSpaceOnUse">
   <path d="M20 0 H0 V20" stroke="#355465" strokeWidth="1" fill="none"/></pattern></defs>
  <rect width="960" height="430" fill="#0e1720"/>
  <g fontSize="11" fontFamily="monospace" fill="#a1bbc5"><text x="27" y="32">THERMAL INTERFACE / MATERIAL SCREEN</text>
   <text x="741" y="32">CROSS-SECTION</text></g>
  <rect x="85" y="108" width="218" height="214" rx="3" fill="#542b26" stroke="#eead76" strokeWidth="2"/>
  <rect x="303" y="108" width="354" height="214" rx="3" fill="url(#matGrid)" stroke="#74cfe1" strokeWidth="2"/>
  <rect x="657" y="108" width="218" height="214" rx="3" fill="#253b4f" stroke="#86bded" strokeWidth="2"/>
  {Array.from({length:5},(_,i)=><path key={i} d={`M${190+i*126} 213 h54 m-16 -11 16 11 -16 11`} fill="none" stroke={i<3?'#ffbd87':'#90d5e5'} strokeWidth="3"/>)}
  <g fontSize="13" fill="#f3e7d9" fontFamily="monospace"><text x="120" y="145">HOT SIDE</text><text x="703" y="145">COLD SIDE</text></g>
  <rect x="337" y="170" width="281" height="80" rx="4" fill="#0b1b25" stroke="#73bfcd"/>
  <text x="475" y="198" fontSize="13" textAnchor="middle" fill="#9abac8">SCREENED MATERIAL</text>
  <text x="475" y="225" fontSize="18" fontWeight="700" textAnchor="middle" fill="#defbf5">{material}</text>
  <text x="480" y="369" fontSize="15" fill="#a6c5d0" textAnchor="middle">{k!=null?`Reference conductivity: ${fmt(k)} W/(m·K)`:'No candidate passes the stated constraints'}</text>
  <text x="26" y="405" fontFamily="monospace" fontSize="11" fill="#91a6b3">SCHEMATIC HEAT PATH / NOT CFD OR MEASURED HEAT FLUX</text>
 </svg>;
}
function FabricationStage({data}:{data:FabResult|null|undefined}){
 const v=data?.selected;
 const w=v?.widthMm??80,l=v?.lengthMm??135;
 const outer=[[0,-1],[.75,-.8],[1,-.32],[.79,.64],[0,.99],[-.79,.64],[-1,-.32],[-.75,-.8]];
 const plot=(width:number,height:number)=>outer.map(([x,y])=>`${480+x*width/2},${215+y*height/2}`).join(' ');
 const span=270*Math.min(1,250/Math.max(w,l));
 const width=span*w/Math.max(w,l),height=span*l/Math.max(w,l);
 const rim=v?.rimWidthMm??10;
 return <svg viewBox="0 0 960 430" className="tech-canvas-svg" role="img" aria-label="Orthographic outline and actual nominal dimensions of a printable decorative panel">
  <defs><pattern id="fabGrid" width="20" height="20" patternUnits="userSpaceOnUse">
   <path d="M20 0 H0 V20" stroke="#253f50" strokeWidth=".8" fill="none"/></pattern></defs>
  <rect width="960" height="430" fill="#0d1821"/><rect width="960" height="430" fill="url(#fabGrid)"/>
  <g fontFamily="monospace" fontSize="11" fill="#9ab3bf"><text x="27" y="31">ADDITIVE MANUFACTURING / FRAME SECTION</text>
   <text x="780" y="31">ORTHOGRAPHIC</text></g>
  <polygon points={plot(width,height)} fill="#208594" stroke="#b3fbf0" strokeWidth="2"/>
  <polygon points={plot(width*Math.max(.1,1-2*rim/w),height*Math.max(.1,1-2*rim/l))}
   fill="#0d1821" stroke="#8fe8db" strokeWidth="1.5"/>
  <path d={`M${480-width/2-36} ${215-height/2} V${215+height/2} M${480-width/2-43} ${215-height/2} h15 M${480-width/2-43} ${215+height/2} h15`}
   stroke="#e5a775" fill="none" strokeWidth="1.4"/>
  <text x={480-width/2-50} y="215" transform={`rotate(-90 ${480-width/2-50} 215)`} fill="#eac19c" fontSize="13" textAnchor="middle">{l} mm</text>
  <path d={`M${480-width/2} ${215+height/2+32} H${480+width/2} M${480-width/2} ${215+height/2+23} v18 M${480+width/2} ${215+height/2+23} v18`}
   stroke="#e5a775" fill="none" strokeWidth="1.4"/>
  <text x="480" y={215+height/2+54} fill="#eac19c" fontSize="13" textAnchor="middle">{w} mm</text>
  <text x="25" y="401" fill="#9ab0bd" fontFamily="monospace" fontSize="11">PRINTABLE COSMETIC PANEL ONLY / NOT STRUCTURAL HARDWARE</text>
 </svg>;
}
export default function TechnologyCanvas(props:Props){
 return <div className="tech-viewport">
  <div className="tech-viewport-toolbar"><span><i className={`tech-status-dot ${props.working?'working':''}`}/>
   {props.working?'COMPUTING / DEVICE WORKER':'DESIGN VIEW / READY'}</span>
   <span>ORTHOGRAPHIC · GRID 23</span></div>
  {props.mode==='circuits'?<CircuitSchematic report={props.rf}/>
   :props.mode==='building'?<SiteStage data={props.building}/>
   :props.mode==='chemistry'?<ChemistryStage data={props.chemistry}/>
   :props.mode==='membrane'?<MembraneStage data={props.membrane}/>
   :<FabricationStage data={props.suit}/>}
  <div className="tech-viewport-footer"><span>AB / WORKSPACE 01</span><span>NOT A MANUFACTURING SIGN-OFF</span></div>
 </div>;
}
