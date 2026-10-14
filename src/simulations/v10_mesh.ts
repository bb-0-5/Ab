import * as THREE from 'three';
import type { CompositeField } from './v9_lattice';
import {screenVoxelChannels,traceVoxelThroughPath,type VoxelChannelEvidence} from '../lib/voxel_connectivity';
import {screenVoxelHeatConduction,type VoxelConductionScreen} from '../lib/voxel_heat_conduction';

/**
 * V10 — Mesh / Surface Texture Optimizer
 *
 * Takes the lattice's composite material field (from V9) and carves
 * internal geometry through it using TPMS (Triply Periodic Minimal
 * Surfaces). This defines WHERE material exists vs. where channels
 * and voids are.
 *
 * The TPMS iso-surface creates the mesh topology:
 *   - Above threshold = solid material (lattice properties apply)
 *   - Below threshold = void/channel (flow path)
 *
 * Optimizes: surface area, porosity, channel connectivity, tortuosity
 * Outputs: a surface mesh + a carved material field for V1/V2 to explore
 */

export type TPMSType = 'gyroid' | 'diamond' | 'schwarz_p' | 'lidinoid' | 'neovius';

export interface MeshConfig {
  tpms: TPMSType;
  frequency: number;       // How many periods fit in the bounds (higher = finer channels)
  threshold: number;        // Iso-surface level: 0 = at surface, >0 = thicker walls
  porosity: number;         // Target porosity 0-1 (overrides threshold if set)
  roughness: number;        // Surface roughness modulation amplitude
}

export interface MeshMetrics {
  surfaceArea: number;      // Estimated surface area of the mesh
  porosity: number;         // Actual void fraction
  tortuosity: number;       // Path length / straight-line distance for flow
  channelCount: number;     // Number of distinct void regions detected
  avgChannelWidth: number;  // Average void channel width
}

// ── TPMS FUNCTIONS ──
// Each returns a scalar value; the iso-surface at value=threshold defines the mesh

function gyroid(x: number, y: number, z: number, freq: number): number {
  const f = freq * Math.PI;
  return Math.sin(x * f) * Math.cos(y * f) +
         Math.sin(y * f) * Math.cos(z * f) +
         Math.sin(z * f) * Math.cos(x * f);
}

function diamond(x: number, y: number, z: number, freq: number): number {
  const f = freq * Math.PI;
  return Math.sin(x * f) * Math.sin(y * f) * Math.sin(z * f) +
         Math.sin(x * f) * Math.cos(y * f) * Math.cos(z * f) +
         Math.cos(x * f) * Math.sin(y * f) * Math.cos(z * f) +
         Math.cos(x * f) * Math.cos(y * f) * Math.sin(z * f);
}

function schwarzP(x: number, y: number, z: number, freq: number): number {
  const f = freq * Math.PI;
  return Math.cos(x * f) + Math.cos(y * f) + Math.cos(z * f);
}

function lidinoid(x: number, y: number, z: number, freq: number): number {
  const f = freq * Math.PI;
  return 0.5 * (
    Math.sin(2 * x * f) * Math.cos(y * f) * Math.sin(z * f) +
    Math.sin(2 * y * f) * Math.cos(z * f) * Math.sin(x * f) +
    Math.sin(2 * z * f) * Math.cos(x * f) * Math.sin(y * f)
  ) - 0.5 * (
    Math.cos(2 * x * f) * Math.cos(2 * y * f) +
    Math.cos(2 * y * f) * Math.cos(2 * z * f) +
    Math.cos(2 * z * f) * Math.cos(2 * x * f)
  ) + 0.15;
}

function neovius(x: number, y: number, z: number, freq: number): number {
  const f = freq * Math.PI;
  return 3 * (Math.cos(x * f) + Math.cos(y * f) + Math.cos(z * f)) +
         4 * Math.cos(x * f) * Math.cos(y * f) * Math.cos(z * f);
}

function evaluateTPMS(type: TPMSType, x: number, y: number, z: number, freq: number): number {
  switch (type) {
    case 'gyroid': return gyroid(x, y, z, freq);
    case 'diamond': return diamond(x, y, z, freq);
    case 'schwarz_p': return schwarzP(x, y, z, freq);
    case 'lidinoid': return lidinoid(x, y, z, freq);
    case 'neovius': return neovius(x, y, z, freq);
  }
}

// ── V10 ENGINE ──

export class V10MeshEngine {
  scene: THREE.Scene;
  surfacePoints: THREE.Points;     // Visualize the iso-surface
  channelLines: THREE.LineSegments; // Visualize candidate channel edges
  /** A proved six-connected y-through route, highlighted separately. */
  throughPath:number[]=[];
  private showThroughPath=false;
  throughPathLine:THREE.Line;
  travelingMarker:THREE.Points;
  setShowThroughPath(visible:boolean):void{
    this.showThroughPath=visible;
    const ready=visible&&this.throughPath.length>1;
    this.throughPathLine.visible=ready;
    this.travelingMarker.visible=ready;
  }

  config: MeshConfig = {
    tpms: 'gyroid',
    frequency: 2.0,
    threshold: 0.0,
    porosity: 0.5,
    roughness: 0.05,
  };

  connectivity:VoxelChannelEvidence|null=null;
  /** A bounded, evidence-backed attempt to recover a blocked mesh. */
  recoveryHistory:Array<{
    round:number;tested:number;connected:number;
    reason:string;bestConfig:MeshConfig|null;
    bestTortuosity:number|null;modelOnly:true;
  }>=[];
  lastRecoveryContext:string|null=null;
  lastCoupledThermalSearch:{
    evaluated:number;
    objective:'minimize_modeled_y_heat_conduction';
    targetConductivityWmK:number;
    winner:MeshConfig|null;
    selected:VoxelConductionScreen|null;
    baseline:VoxelConductionScreen|null;
    improvements:number;
    modelOnly:true;
  }|null=null;
  lastSearch:{evaluated:number;axis:'x'|'y'|'z';baselineScore:number;bestScore:number;selected:MeshConfig;modeledOnly:true}|null=null;

  metrics: MeshMetrics = {
    surfaceArea: 0, porosity: 0, tortuosity: 1.0,
    channelCount: 0, avgChannelWidth: 0,
  };

  // The carved field: stores whether each voxel is solid (1) or void (0)
  solidMask: Float32Array | null = null;
  // The fitness field modulated by surface proximity
  meshFitnessField: Float32Array | null = null;

  private _resolution: number = 16;
  private _bounds: number = 2.0;
  private _built: boolean = false;
  private _frameCount: number = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    const ptGeo = new THREE.BufferGeometry();
    const ptMat = new THREE.PointsMaterial({
      size: 0.075, vertexColors: true, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending
    });
    this.surfacePoints = new THREE.Points(ptGeo, ptMat);
    this.scene.add(this.surfacePoints);

    const lineGeo = new THREE.BufferGeometry();
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x00b9c9, transparent: true, opacity: 0.36,
      blending: THREE.AdditiveBlending
    });
    this.channelLines = new THREE.LineSegments(lineGeo, lineMat);
    this.scene.add(this.channelLines);
    this.throughPathLine=new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({color:0xffd166,transparent:true,opacity:.98}),
    );
    this.throughPathLine.frustumCulled=false;
    this.scene.add(this.throughPathLine);
    this.travelingMarker=new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({
        color:0xfff3ad,size:.2,sizeAttenuation:true,
        transparent:true,opacity:1,
      }),
    );
    this.travelingMarker.frustumCulled=false;
    this.scene.add(this.travelingMarker);
    this.setShowThroughPath(false);
  }

  /** Configure for an optimizer type */
  configure(optimizer: string) {
    switch (optimizer) {
      case 'thermal':
        this.config = { tpms: 'gyroid', frequency: 2.0, threshold: 0.0, porosity: 0.5, roughness: 0.03 };
        break;
      case 'electrical':
        this.config = { tpms: 'diamond', frequency: 2.5, threshold: 0.1, porosity: 0.4, roughness: 0.01 };
        break;
      case 'blockchain':
        this.config = { tpms: 'schwarz_p', frequency: 1.5, threshold: -0.2, porosity: 0.6, roughness: 0.08 };
        break;
      case 'math':
        this.config = { tpms: 'lidinoid', frequency: 2.0, threshold: 0.0, porosity: 0.5, roughness: 0.1 };
        break;
    }
    this._built = false;
    this.recoveryHistory=[];
    this.lastRecoveryContext=null;
    this.lastCoupledThermalSearch=null;
  }

  /** Build the mesh by evaluating the TPMS over the 3D grid */
  buildMesh(compositeField?: CompositeField) {
    const res = compositeField?.resolution || this._resolution;
    const bounds = compositeField?.bounds || this._bounds;
    this._resolution = res;
    this._bounds = bounds;
    const step = (bounds * 2) / (res - 1);
    const n = res * res * res;

    this.solidMask = new Float32Array(n);
    this.meshFitnessField = new Float32Array(n);

    let solidCount = 0;
    let surfaceArea = 0;

    for (let xi = 0; xi < res; xi++) {
      for (let yi = 0; yi < res; yi++) {
        for (let zi = 0; zi < res; zi++) {
          const px = xi * step - bounds;
          const py = yi * step - bounds;
          const pz = zi * step - bounds;
          const idx = xi * res * res + yi * res + zi;

          // Evaluate TPMS + roughness modulation
          const roughNoise = this.config.roughness * (Math.sin(px * 17.3) * Math.cos(py * 13.7) * Math.sin(pz * 19.1));
          const tpmsVal = evaluateTPMS(this.config.tpms, px, py, pz, this.config.frequency) + roughNoise;

          // Solid where TPMS > threshold
          const isSolid = tpmsVal > this.config.threshold;
          this.solidMask[idx] = isSolid ? 1.0 : 0.0;
          if (isSolid) solidCount++;

          // Surface proximity = fitness (interesting for PSO)
          // High fitness near the zero-crossing of the TPMS (the surface itself)
          const surfaceProximity = 1.0 / (Math.abs(tpmsVal - this.config.threshold) + 0.05);

          // If composite field is provided, multiply by its properties
          let baseFitness = surfaceProximity;
          if (compositeField) {
            baseFitness *= (1.0 + compositeField.fitnessField[idx] * 0.5);
          }

          this.meshFitnessField[idx] = baseFitness;

          // Surface area is computed after the entire mask is written.
          // Previously the mask was inspected mid-build, treating cells
          // not yet evaluated as void and fabricating spurious interfaces.
        }
      }
    }

    // Count all solid/void interfaces on the FULLY BUILT voxel volume,
    // once per shared face, on the X, Y and Z axes (scene-units²).
    for(let x=0;x<res;x++)for(let y=0;y<res;y++)for(let z=0;z<res;z++){
      const i=x*res*res+y*res+z;
      if(x+1<res&&this.solidMask[i]!==this.solidMask[i+res*res])surfaceArea+=step*step;
      if(y+1<res&&this.solidMask[i]!==this.solidMask[i+res])surfaceArea+=step*step;
      if(z+1<res&&this.solidMask[i]!==this.solidMask[i+1])surfaceArea+=step*step;
    }
    const connection=screenVoxelChannels(this.solidMask,res);
    this.connectivity=connection;
    this.throughPath=traceVoxelThroughPath(this.solidMask,res,'y');
    const route=new Float32Array(this.throughPath.length*3);
    for(let p=0;p<this.throughPath.length;p++){
      const idx=this.throughPath[p];
      const x=Math.floor(idx/(res*res));
      const y=Math.floor((idx%(res*res))/res),z=idx%res;
      route[p*3]=x*step-bounds;
      route[p*3+1]=y*step-bounds;
      route[p*3+2]=z*step-bounds;
    }
    this.throughPathLine.geometry.setAttribute(
      'position',new THREE.BufferAttribute(route,3),
    );
    this.throughPathLine.geometry.computeBoundingSphere();
    this.setShowThroughPath(this.showThroughPath);
    // Exact geometric connectivity replaces the former unrelated
    // freq²×porosity "channel count" and assumed tortuosity.
    const shortest=Object.values(connection.shortestPathTortuosity)
      .filter((x):x is number=>x!==null);
    this.metrics.porosity = 1.0 - (solidCount / n);
    this.metrics.surfaceArea = surfaceArea;
    this.metrics.tortuosity = shortest.length?Math.min(...shortest):0; // 0 means NO through-channel
    // Width still a porosity-based heuristic; geometry is not CFD.
    this.metrics.avgChannelWidth = this.metrics.porosity > 0 ? (bounds * 2 * this.metrics.porosity / this.config.frequency) : 0;
    this.metrics.channelCount = connection.componentCount;

    this._built = true;
  }

  /**
   * Autonomously sweep nine real TPMS configurations using actual
   * 6-connected voxel paths, not guessed channel counts or pressure drop.
   * Only accepted geometric topology is built; physical permeability remains
   * unmeasured. The previous same-comfort baseline competes as a candidate.
   */
  optimizeConnectedChannels(
    composite:CompositeField|undefined,axis:'x'|'y'|'z'='y',
  ) {
    const baseline={...this.config};
    const candidates:MeshConfig[]=[
      baseline,
      {...baseline,threshold:baseline.threshold-.18},
      {...baseline,threshold:baseline.threshold+.18},
      {...baseline,frequency:Math.max(.5,baseline.frequency-.5)},
      {...baseline,frequency:Math.min(5,baseline.frequency+.5)},
      ...(['gyroid','diamond','schwarz_p','lidinoid'] as const)
        .filter(tpms=>tpms!==baseline.tpms)
        .map(tpms=>({...baseline,tpms})),
    ];
    const score=()=>{
      const info=this.connectivity;
      if(!info)return -Infinity;
      const span=info.spanning[axis];
      const path=info.shortestPathTortuosity[axis];
      // Expresses a declared *geometry* objective only: traversability,
      // accessible pore fraction and requested target void fraction.
      return (span?3:0)+info.spanningVoidFraction
        -2*Math.abs(this.metrics.porosity-baseline.porosity)
        -(path===null?1:Math.max(0,path-1)*.2);
    };
    let winner=baseline,best=-Infinity,baselineScore=-Infinity;
    for(let i=0;i<candidates.length;i++){
      this.config=candidates[i];
      this.buildMesh(composite);
      const current=score();
      if(i===0)baselineScore=current;
      if(current>best+1e-9){best=current;winner={...this.config};}
    }
    this.config=winner;
    this.buildMesh(composite);
    this.lastSearch={
      evaluated:candidates.length,axis,baselineScore,bestScore:best,
      selected:{...winner},modeledOnly:true,
    };
    return this.lastSearch;
  }

  /**
   * V10 RECOVERY: the original eight-way sweep may select disconnected
   * geometry. Search actual alternative TPMS masks rather than waiting for
   * animation time or declaring a nonexistent flow path.
   *
   * Each call makes at most 16 new numerical voxel realizations. At most
   * three calls are permitted per material+environment context; no loop is
   * allowed to exhaust a phone. All failures remain visible in the ledger.
   * This is a geometry screen only: not permeability, flow rate or a yield.
   */
  recoverBlockedChannels(
    composite:CompositeField|undefined,
    axis:'x'|'y'|'z',context:string,
  ):{
    recovered:boolean;exhausted:boolean;round:number;
    evaluated:number;connected:number;reason:string;
  }{
    if(!['x','y','z'].includes(axis)||!context||context.length>240)
      throw Error('Invalid V10 recovery context');
    if(this.lastRecoveryContext!==context){
      this.lastRecoveryContext=context;
      this.recoveryHistory=[];
    }
    const info=this.connectivity;
    const total=info?info.solidCount+info.voidCount:0;
    const currentValid=Boolean(info?.spanning[axis]
      &&total>0&&info!.solidCount/total>=.05
      &&info!.voidCount/total>=.05);
    if(currentValid)return {
      recovered:true,exhausted:false,round:this.recoveryHistory.length,
      evaluated:0,connected:1,reason:'Existing V10 through-channel is connected',
    };
    const round=this.recoveryHistory.length;
    if(round>=3)return {
      recovered:false,exhausted:true,round,evaluated:0,connected:0,
      reason:'V10 has exhausted bounded mesh revisions; upstream geometry/material revision required',
    };
    const original={...this.config};
    // Absolute thresholds can recover an entirely solid/void starting mask.
    // Round-specific frequency/shape combinations cannot repeat the same
    // failed condition indefinitely. Every proposed mask is evaluated.
    const shapes:TPMSType[]=['gyroid','diamond','schwarz_p','lidinoid','neovius'];
    const thresholds=[-.7,-.35,0,.35,.7];
    const candidates:MeshConfig[]=[];
    for(let i=0;i<16;i++){
      const tpms=shapes[(i+round*3)%shapes.length];
      const frequency=[.8,1.2,1.7,2.25,2.8,3.35][(i+round*2)%6];
      const threshold=thresholds[(i*2+round)%thresholds.length];
      const candidate={...original,tpms,frequency,threshold,roughness:0};
      candidates.push(candidate);
    }
    let bestConfig:MeshConfig|null=null;
    let bestScore=-Infinity,bestTortuosity:number|null=null;
    let connected=0;
    for(const candidate of candidates){
      this.config=candidate;
      this.buildMesh(composite);
      const evidence=this.connectivity!;
      const n=evidence.solidCount+evidence.voidCount;
      const solidFraction=evidence.solidCount/n;
      const voidFraction=evidence.voidCount/n;
      const through=evidence.spanning[axis];
      if(through)connected++;
      // Both material AND void must exist. An all-void cube is not a membrane.
      if(!through||solidFraction<.05||voidFraction<.05)continue;
      const tortuosity=evidence.shortestPathTortuosity[axis];
      if(tortuosity===null)continue;
      // Favor connected transport and usable wall fraction; the rest remains
      // a context-specific geometry comparison, not physical conductivity.
      const score=evidence.spanningVoidFraction
        -(Math.max(0,tortuosity-1)*.2)
        -Math.abs(voidFraction-.5)*.3;
      if(score>bestScore){
        bestScore=score;bestConfig={...candidate};
        bestTortuosity=tortuosity;
      }
    }
    if(bestConfig){
      this.config=bestConfig;
      this.buildMesh(composite);
      this.lastSearch={
        evaluated:(this.lastSearch?.evaluated||0)+candidates.length,
        axis,baselineScore:this.lastSearch?.baselineScore??-Infinity,
        bestScore,selected:{...bestConfig},modeledOnly:true,
      };
    }else{
      // Preserve the last known candidate instead of promoting a random
      // disconnected trial. A failure is a finding, not a construction.
      this.config=original;
      this.buildMesh(composite);
    }
    const reason=bestConfig
      ?'Recovered a six-connected channel with nonzero solid material'
      :'No viable through-channel: retaining previous design and its failure';
    this.recoveryHistory.push({
      round:round+1,tested:candidates.length,connected,reason,
      bestConfig,bestTortuosity,modelOnly:true,
    });
    return {
      recovered:Boolean(bestConfig),exhausted:!bestConfig&&round>=2,
      round:round+1,evaluated:candidates.length,connected,reason,
    };
  }

  /**
   * Joint material / topology trial: for the actual V9 voxelwise thermal k,
   * optimize a TPMS mask and estimate its effective axial steady conduction.
   * The same geometry can rank differently for different material mixtures.
   *
   * Enforces a nontrivial solid fraction and open through-void path, matching
   * the original V10 construction gate. A fluid-open pore is NOT proven safe
   * insulation: the solver omits convection, moisture and radiation.
   * 8 configurations × <=120 bounded relaxation passes; browser-local only.
   */
  optimizeCoupledThermalGeometry(
    composite:CompositeField,
    targetConductivityWmK:number,
  ){
    if(!composite||!Number.isFinite(targetConductivityWmK)
      ||targetConductivityWmK<=0||targetConductivityWmK>1e6)
      throw Error('V10 requires a valid V9 material and thermal target');
    const start={...this.config};
    const candidates:MeshConfig[]=[
      start,
      {...start,tpms:'gyroid',frequency:1.3,threshold:-.4,roughness:0},
      {...start,tpms:'gyroid',frequency:2.2,threshold:.25,roughness:0},
      {...start,tpms:'diamond',frequency:1.3,threshold:-.35,roughness:0},
      {...start,tpms:'diamond',frequency:2.4,threshold:.2,roughness:0},
      {...start,tpms:'schwarz_p',frequency:1.5,threshold:-.3,roughness:0},
      {...start,tpms:'lidinoid',frequency:1.7,threshold:.2,roughness:0},
      {...start,tpms:'neovius',frequency:1.3,threshold:.35,roughness:0},
    ];
    let winner:MeshConfig|null=null;
    let best:VoxelConductionScreen|null=null;
    let baseline:VoxelConductionScreen|null=null;
    let bestCost=Infinity,improvements=0;
    for(let i=0;i<candidates.length;i++){
      this.config={...candidates[i]};
      this.buildMesh(composite);
      const conn=this.connectivity;
      if(!conn||!this.solidMask||!conn.spanning.y)continue;
      const n=conn.solidCount+conn.voidCount;
      const solidFraction=conn.solidCount/n;
      // No bogus "membrane" that is almost entirely gas or solid.
      if(solidFraction<.18||solidFraction>.82)continue;
      const result=screenVoxelHeatConduction(
        this.solidMask,composite.conductivityField,
        composite.resolution,'y',120,
      );
      if(i===0)baseline=result;
      // Model reduction compared with the target, plus a fixed structural
      // constraint. No V13 bulk k is substituted for V9 local reference k.
      const cost=Math.log1p(result.effectiveConductivityWmK/
        targetConductivityWmK)
        +.15*Math.abs(result.solidFraction-.5);
      if(cost<bestCost-1e-9){
        if(best!==null)improvements++;
        bestCost=cost;best=result;winner={...this.config};
      }
    }
    this.config=winner||start;
    this.buildMesh(composite);
    this.lastCoupledThermalSearch={
      evaluated:candidates.length,
      objective:'minimize_modeled_y_heat_conduction',
      targetConductivityWmK,winner,
      selected:best,baseline,improvements,
      modelOnly:true,
    };
    if(winner){
      this.lastSearch={
        evaluated:candidates.length,axis:'y',
        baselineScore:baseline?-baseline.effectiveConductivityWmK:-Infinity,
        bestScore:-best!.effectiveConductivityWmK,
        selected:{...winner},modeledOnly:true,
      };
    }else{
      // Preserve a clear failure for the existing V10 recovery machinery.
      this.lastSearch={
        evaluated:candidates.length,axis:'y',
        baselineScore:-Infinity,bestScore:-Infinity,
        selected:{...start},modeledOnly:true,
      };
    }
    return this.lastCoupledThermalSearch;
  }

  getConnectivity():VoxelChannelEvidence|null{return this.connectivity;}

  /** Get mesh fitness field for V1.setMaterial() customField injection */
  getFitnessField(): Float32Array | null {
    return this.meshFitnessField;
  }

  /** Get solid mask for V6 thermal diffusion (solid blocks flow) */
  getSolidMask(): Float32Array | null {
    return this.solidMask;
  }

  getResolution(): number { return this._resolution; }
  getBounds(): number { return this._bounds; }
  getMetrics(): MeshMetrics { return this.metrics; }

  update() {
    this._frameCount++;

    if (!this._built) this.buildMesh();
    if(this.throughPath.length>0){
      const path=this.throughPathLine.geometry.getAttribute('position');
      const i=Math.floor(this._frameCount/4)%this.throughPath.length;
      const xyz=new Float32Array([
        path.getX(i),path.getY(i),path.getZ(i),
      ]);
      this.travelingMarker.geometry.setAttribute(
        'position',new THREE.BufferAttribute(xyz,3),
      );
    }

    // Visualize the iso-surface points and void channel lines
    if (this.solidMask) {
      const res = this._resolution;
      const bounds = this._bounds;
      const step = (bounds * 2) / (res - 1);
      const surfPos: number[] = [];
      const surfCol: number[] = [];
      const chanPos: number[] = [];

      for (let xi = 1; xi < res - 1; xi++) {
        for (let yi = 1; yi < res - 1; yi++) {
          for (let zi = 1; zi < res - 1; zi++) {
            const idx = xi * res * res + yi * res + zi;
            const px = xi * step - bounds;
            const py = yi * step - bounds;
            const pz = zi * step - bounds;

            const solid = this.solidMask[idx] > 0.5;
            const neighbors = [
              this.solidMask[(xi + 1) * res * res + yi * res + zi],
              this.solidMask[(xi - 1) * res * res + yi * res + zi],
              this.solidMask[xi * res * res + (yi + 1) * res + zi],
              this.solidMask[xi * res * res + (yi - 1) * res + zi],
              this.solidMask[xi * res * res + yi * res + (zi + 1)],
              this.solidMask[xi * res * res + yi * res + (zi - 1)],
            ];

            // Surface point: solid with at least one void neighbor
            if (solid && neighbors.some(n => n < 0.5)) {
              surfPos.push(px, py, pz);
              // Color by TPMS type
              const tpmsVal = evaluateTPMS(this.config.tpms, px, py, pz, this.config.frequency);
              const t = Math.abs(tpmsVal) * 0.5;
              surfCol.push(0.0, 0.8 + t * 0.2, 0.5 + t * 0.5);
            }

            // Channel lines: void with void neighbor → shows flow path connectivity
            if (!solid) {
              if (xi < res - 2 && this.solidMask[(xi + 1) * res * res + yi * res + zi] < 0.5) {
                chanPos.push(px, py, pz, px + step, py, pz);
              }
              if (yi < res - 2 && this.solidMask[xi * res * res + (yi + 1) * res + zi] < 0.5) {
                chanPos.push(px, py, pz, px, py + step, pz);
              }
            }
          }
        }
      }

      this.surfacePoints.geometry.setAttribute('position', new THREE.Float32BufferAttribute(surfPos, 3));
      this.surfacePoints.geometry.setAttribute('color', new THREE.Float32BufferAttribute(surfCol, 3));
      this.surfacePoints.geometry.attributes.position.needsUpdate = true;
      this.surfacePoints.geometry.attributes.color.needsUpdate = true;

      if (chanPos.length > 0) {
        this.channelLines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(chanPos, 3));
        this.channelLines.geometry.attributes.position.needsUpdate = true;
      }
    }
  }

  isStable(): boolean { return this._built; }

  dispose() {
    this.scene.remove(this.surfacePoints);
    this.scene.remove(this.channelLines);
    this.scene.remove(this.throughPathLine);
    this.scene.remove(this.travelingMarker);
    this.throughPathLine.geometry.dispose();
    (this.throughPathLine.material as THREE.Material).dispose();
    this.travelingMarker.geometry.dispose();
    (this.travelingMarker.material as THREE.Material).dispose();
    this.surfacePoints.geometry.dispose();
    (this.surfacePoints.material as THREE.Material).dispose();
    this.channelLines.geometry.dispose();
    (this.channelLines.material as THREE.Material).dispose();
  }
}
