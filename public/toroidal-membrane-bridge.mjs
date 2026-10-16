/**
 * SAME-ORIGIN V10 MEMBRANE TO TOROIDAL-IRIS GEOMETRY HANDOFF.
 *
 * V10's exact recorded solid mask is the upstream SOURCE OF TRUTH. It is a
 * porous *static* insert/membrane topology, not a proven elastic pumping wall.
 * The derived ratio Q_open/Q_V10 at the SAME grid/pressure is used as an
 * explicitly limited resistance proxy. The iris actuator still supplies the
 * moving envelope separately. No new geometry is invented from a guessed
 * porosity or independently chosen torus surface.
 *
 * If the original V10 has not saved a selection, compute an honest automatic
 * V10 mask and identify it as a fallback, never as the user's selected mesh.
 */
import {readSelectedV10PressureGeometry} from './v10-pressure-handoff.mjs';
import {buildV10Mask} from './v10-membrane-masks.mjs';
import {solvePoreNetwork,HYDRAULICS} from './v10-pressure-network.mjs';

const sourceName='V10 membrane / pressure-flow simulator';
const AUTO={n:13,layers:9,tpms:'schwarz_p',frequency:.8,threshold:.35,roughness:0,bounds:2};
function selectionToGeometry(selection){
 if(selection){
  return {mask:selection.mask,n:selection.n,layers:selection.layers,
   config:selection.receipt.config,checksum:selection.receipt.checksum,
   source:'ORIGINAL V10 SELECTED SOLID MASK',timestamp:selection.receipt.timestamp,
   nativeSelection:true};
 }
 const result=buildV10Mask(AUTO);
 return {mask:result.mask,n:result.n,layers:result.layers,config:result.config,
   checksum:null,source:'AUTO V10 MASK · UNSAVED FALLBACK',timestamp:null,
   nativeSelection:false};
}
export function resolveMembraneSource(store,now=Date.now()){
 return selectionToGeometry(readSelectedV10PressureGeometry(store,now));
}
export function evaluateMembraneGeometry(source){
 if(!source?.mask||!Number.isInteger(source.n)||!Number.isInteger(source.layers)||
   source.mask.length!==source.n**2*source.layers)throw Error('Invalid actual V10 membrane mask');
 // Never substitute selected geometry with a TPMS reconstruction.
 const open=solvePoreNetwork(new Uint8Array(source.mask.length),source.n,source.layers);
 const flow=solvePoreNetwork(source.mask,source.n,source.layers);
 if(!open.converged||!(open.flowM3S>0))throw Error('V10 reference failed matched-grid pressure solve');
 const ratio=flow.converged?flow.flowM3S/open.flowM3S:0;
 const connected=flow.converged&&flow.throughCells>0&&ratio>0&&
  flow.imbalanceM3S<=Math.max(1e-14,flow.flowM3S*.001);
 const resistanceRatio=connected?1/ratio:null;
 // No silent simulation with solid walls or unconverged masks.
 const supported=connected&&Number.isFinite(resistanceRatio)&&resistanceRatio<=30;
 return {
  source:source.source,sourceName,config:source.config,checksum:source.checksum,
  timestamp:source.timestamp,nativeSelection:source.nativeSelection,
  n:source.n,layers:source.layers,
  mask:source.mask,solidFraction:flow.solidFraction,
  connectedVoidCells:flow.throughCells,
  openReferenceFlowM3S:open.flowM3S,selectedFlowM3S:flow.flowM3S,
  relativeFlow:ratio,resistanceRatio,
  supported,converged:flow.converged,
  // Clamp only usable models, otherwise disable results and display rejection.
  resistanceMultiplier:supported?resistanceRatio:null,
  reason:!flow.converged?'V10 pore-network solver did not converge':
   !connected?'No conserved traversing void path in source membrane':
   !supported?'Hydraulic resistance outside limited 30x screening regime':
   'V10 static pore topology imported; applied to equivalent torus hydraulic loss',
  model:'Same-grid V10 Poiseuille network; applying conductance ratio to curved actuator duct is an unvalidated transfer hypothesis',
  pitchM:HYDRAULICS.pitchM,radiusM:HYDRAULICS.radiusM,
 };
}
/** Slice solid mask in the solver's z-major storage, exact, no interpolation. */
export function maskCrossSection(evidence,z){
 const {n,layers,mask}=evidence;
 const k=Math.min(layers-1,Math.max(0,z|0));
 return {n,layer:k,solid:mask.slice(k*n*n,(k+1)*n*n)};
}
