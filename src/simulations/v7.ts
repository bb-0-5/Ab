import * as THREE from 'three';
import type { FlowMetrics, FlowPath } from './v6';
import type { DetectedLoop } from './v5';

/**
 * V7 — Meta-Optimizer
 *
 * Observes V6 flow metrics and tunes UPSTREAM parameters to maximize flow quality.
 * This is the "brain" that closes the feedback loop:
 *
 *   V1/V2 params → V3/V4 graph → V5 membranes → V6 flow → V7 evaluates → tunes V1-V5
 *
 * Tunable parameters:
 *   - V1/V2 stabilityThreshold, requiredStableFrames, maxNodes
 *   - V3/V4 neighborK (how many neighbors per node)
 *   - V5 cross-edge threshold, membrane type assignments
 *   - V6 desired direction, flow sensitivity
 *
 * V7 renders a dashboard overlay showing optimization state and parameter history.
 */

export interface TuningParam {
  name: string;
  target: string;           // Which engine: 'v1' | 'v2' | 'v3' | 'v4' | 'v5' | 'v6'
  key: string;              // Property name on the engine
  value: number;
  min: number;
  max: number;
  step: number;
  lastDelta: number;        // Which direction we last moved
  lastMetricDelta: number;  // Did the metric improve or worsen?
}

export interface OptimizationSnapshot {
  frame: number;
  metrics: FlowMetrics;
  params: { name: string; value: number }[];
  score: number;            // Composite optimization score
}

export interface TuningRecommendation {
  target: string;
  key: string;
  newValue: number;
  reason: string;
}

export interface FlowParticle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  energy: number;
}

export class V7Engine {
  scene: THREE.Scene;

  // Visual: parameter trend lines + score indicator
  trendLines: THREE.LineSegments;
  scoreIndicator: THREE.Points;
  connectionLines: THREE.LineSegments;  // Shows V7→upstream connections

  // ── LBM FLOW PARTICLES (restored from old V7) ──
  flowParticles: THREE.Points;
  particles: FlowParticle[] = [];
  private _particleCount: number = 500;

  // Tunable parameters
  params: TuningParam[] = [];

  // History
  snapshots: OptimizationSnapshot[] = [];
  maxSnapshots: number = 100;

  // Current state
  currentScore: number = 0;
  bestScore: number = 0;
  bestParams: { name: string; value: number }[] = [];
  recommendations: TuningRecommendation[] = [];

  // Flow data from V6
  private _latestMetrics: FlowMetrics | null = null;
  private _latestPaths: FlowPath[] = [];
  private _loops: DetectedLoop[] = [];

  // Thermal data from V6
  private _thermalField: Float32Array | null = null;
  private _gridSize: number = 10;

  private _captured: boolean = false;
  private _framesSinceCapture: number = 0;
  private _optimizeInterval: number = 30;
  private _framesSinceOptimize: number = 0;
  // A proposed change is evaluated only after V1–V6 have recomputed.
  // At most ONE upstream parameter may be under test at a time.
  private _pendingTrial: {
    index: number; before: number; proposed: number; baselineScore: number;
  } | null = null;
  private _nextParamIndex = 0;
  private _revision = 0;
  private _appliedRevision = 0;
  acceptedTrials = 0;
  rejectedTrials = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Trend visualization
    const trendGeo = new THREE.BufferGeometry();
    const trendMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
    });
    this.trendLines = new THREE.LineSegments(trendGeo, trendMat);
    this.scene.add(this.trendLines);

    // Score indicator (single bright point that moves based on score)
    const scoreGeo = new THREE.BufferGeometry();
    const scoreMat = new THREE.PointsMaterial({
      size: 0.2,
      color: 0x00ff88,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
    });
    this.scoreIndicator = new THREE.Points(scoreGeo, scoreMat);
    this.scene.add(this.scoreIndicator);

    // Connection lines showing V7 influence on upstream
    const connGeo = new THREE.BufferGeometry();
    const connMat = new THREE.LineBasicMaterial({
      color: 0x44ff44,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
    });
    this.connectionLines = new THREE.LineSegments(connGeo, connMat);
    this.scene.add(this.connectionLines);

    // LBM Flow particles
    const flowGeo = new THREE.BufferGeometry();
    const flowMat = new THREE.PointsMaterial({
      size: 0.04,
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
    });
    this.flowParticles = new THREE.Points(flowGeo, flowMat);
    this.scene.add(this.flowParticles);
    this._initFlowParticles();

    this._initParams();
  }

  private _initParams() {
    this.params = [
      {
        name: 'V3 Neighbor K',
        target: 'v3', key: 'neighborK',
        value: 6, min: 3, max: 12, step: 1,
        lastDelta: 0, lastMetricDelta: 0,
      },
      {
        name: 'V4 Neighbor K',
        target: 'v4', key: 'neighborK',
        value: 6, min: 3, max: 12, step: 1,
        lastDelta: 0, lastMetricDelta: 0,
      },
      {
        name: 'V1 Stability Threshold',
        target: 'v1', key: '_stabilityThreshold',
        value: 0.001, min: 0.0001, max: 0.01, step: 0.0005,
        lastDelta: 0, lastMetricDelta: 0,
      },
      {
        name: 'V1 Required Stable Frames',
        target: 'v1', key: '_requiredStableFrames',
        value: 30, min: 10, max: 60, step: 5,
        lastDelta: 0, lastMetricDelta: 0,
      },
      {
        name: 'V2 Stability Threshold',
        target: 'v2', key: '_stabilityThreshold',
        value: 0.001, min: 0.0001, max: 0.01, step: 0.0005,
        lastDelta: 0, lastMetricDelta: 0,
      },
    ];
  }

  /**
   * Capture flow state from V6 and membrane state from V5.
   */
  captureFromV6(
    metrics: FlowMetrics,
    flowPaths: FlowPath[],
    loops: DetectedLoop[],
    thermalField?: Float32Array,
    gridSize?: number
  ) {
    const firstCapture = !this._captured;
    this._latestMetrics = { ...metrics };
    this._latestPaths = flowPaths;
    this._loops = loops;
    if (thermalField) this._thermalField = thermalField;
    if (gridSize) this._gridSize = gridSize;
    this._captured = true;
    if (firstCapture) this._framesSinceCapture = 0;
  }

  /**
   * Compute a composite optimization score from flow metrics.
   * Higher is better.
   */
  private _computeScore(metrics: FlowMetrics): number {
    // Weighted sum:
    // - High total flow = good
    // - Low avg resistance = good
    // - Few bottlenecks = good
    // - High efficiency = good
    // - Many paths = good (more coverage)
    return (
      metrics.totalFlow * 2.0 +
      (1.0 / (metrics.avgResistance + 0.1)) * 1.5 +
      (1.0 - metrics.bottleneckCount / Math.max(1, this._loops.length)) * 3.0 +
      metrics.efficiency * 5.0 +
      metrics.pathCount * 0.5
    );
  }

  /**
   * Sequential, bounded coordinate search. Unlike a visual-only hill-climber,
   * this evaluates the SAME proposed parameter after the upstream chain
   * recomputes its flow metrics. A degraded score rolls back to the previous
   * parameter value before probing a different dimension.
   *
   * V6 is a dynamic model, not a controlled physical experiment. These deltas
   * are screening feedback, not evidence of measured causal improvement.
   */
  private _optimizeStep() {
    if (!this._latestMetrics) return;
    const score = this._computeScore(this._latestMetrics);
    if (!Number.isFinite(score)) {
      this.recommendations = [];
      this._revision++;
      return;
    }
    this.currentScore = score;
    this.snapshots.push({
      frame: this._framesSinceCapture,
      metrics: { ...this._latestMetrics },
      params: this.params.map(p => ({ name:p.name,value:p.value })),
      score,
    });
    if (this.snapshots.length > this.maxSnapshots) this.snapshots.shift();
    if (this.snapshots.length === 1 || score > this.bestScore) {
      this.bestScore = score;
      this.bestParams = this.params.map(p => ({ name:p.name,value:p.value }));
    }
    this.recommendations = [];
    if (this._pendingTrial) {
      const trial = this._pendingTrial;
      const param = this.params[trial.index];
      const difference = score - trial.baselineScore;
      param.lastMetricDelta = difference;
      // Require a small relative benefit to avoid accepting numerical noise.
      const threshold = 1e-5 * Math.max(1,Math.abs(trial.baselineScore));
      const accepted = difference > threshold;
      this._pendingTrial = null;
      this._nextParamIndex = (trial.index + 1) % this.params.length;
      if (!accepted) {
        this.rejectedTrials++;
        param.value = trial.before;
        param.lastDelta = -param.lastDelta || -param.step;
        this.recommendations.push({
          target:param.target,key:param.key,newValue:trial.before,
          reason:`Rollback ${param.name}: modeled score Δ${difference.toFixed(4)} (not an improvement)`,
        });
        this._revision++;
        // Allow a full recomputation interval at the restored baseline.
        return;
      }
      this.acceptedTrials++;
    }
    // One independent candidate per observation interval. No second hidden
    // bottleneck mutation contaminates attribution to the first parameter.
    for (let n=0;n<this.params.length;n++) {
      const index=(this._nextParamIndex+n)%this.params.length;
      const param=this.params[index];
      const direction=param.lastDelta===0?param.step:param.lastDelta;
      let proposed=Math.max(param.min,Math.min(param.max,param.value+direction));
      if (proposed===param.value) {
        proposed=Math.max(param.min,Math.min(param.max,param.value-direction));
        if (proposed===param.value) continue;
      }
      const before=param.value;
      this._pendingTrial={index,before,proposed,baselineScore:score};
      param.value=proposed;
      param.lastDelta=proposed-before;
      this.recommendations.push({
        target:param.target,key:param.key,newValue:proposed,
        reason:`Test ${param.name} ${before} → ${proposed}; compare next V6 observation`,
      });
      this._revision++;
      return;
    }
    this._revision++;
  }

  /**
   * Apply each new recommendation once to actual upstream simulation engines.
   * The animation loop calls this every frame, but repeating the same change
   * must never double-apply it. Rollbacks are transmitted the same way.
   */
  applyRecommendations(engines: Record<string, any>) {
    if (this._appliedRevision === this._revision) return;
    for (const rec of this.recommendations) {
      const engine = engines[rec.target];
      if (engine && rec.key in engine && Number.isFinite(rec.newValue)) {
        engine[rec.key] = rec.newValue;
      }
    }
    this._appliedRevision = this._revision;
  }

  isStable() {
    return this._captured && this._framesSinceCapture > 15;
  }

  update(compressionLevel: number = 1) {
    if (!this._captured) return;
    this._framesSinceCapture++;
    this._framesSinceOptimize++;

    // Run optimization at intervals
    if (this._framesSinceOptimize >= this._optimizeInterval) {
      this._optimizeStep();
      this._framesSinceOptimize = 0;
    }

    // LBM flow particles (real fluid dynamics following membrane topology + thermal buoyancy)
    this._updateFlowParticles(compressionLevel);

    this._buildVisuals();
  }

  private _buildVisuals() {
    // Trend lines: show score history as a line graph in 3D space
    const trendPositions: number[] = [];
    const trendColors: number[] = [];
    const historyLen = this.snapshots.length;

    if (historyLen >= 2) {
      const xSpan = 3.0; // 3 units wide
      const yScale = 0.5;
      const zOffset = -2.0; // Behind the main sim

      for (let i = 0; i < historyLen - 1; i++) {
        const x1 = (i / historyLen) * xSpan - xSpan / 2;
        const x2 = ((i + 1) / historyLen) * xSpan - xSpan / 2;
        const y1 = (this.snapshots[i].score / Math.max(1, this.bestScore)) * yScale;
        const y2 = (this.snapshots[i + 1].score / Math.max(1, this.bestScore)) * yScale;

        trendPositions.push(x1, y1 + 1.5, zOffset, x2, y2 + 1.5, zOffset);

        // Color: green if improving, red if worsening
        const improving = this.snapshots[i + 1].score >= this.snapshots[i].score;
        const c = improving ? [0.2, 1.0, 0.4] : [1.0, 0.3, 0.2];
        trendColors.push(...c, ...c);
      }
    }

    this.trendLines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(trendPositions, 3));
    this.trendLines.geometry.setAttribute('color', new THREE.Float32BufferAttribute(trendColors, 3));
    this.trendLines.geometry.attributes.position.needsUpdate = true;
    if (this.trendLines.geometry.attributes.color) {
      this.trendLines.geometry.attributes.color.needsUpdate = true;
    }

    // Score indicator: bright point at current score
    const scoreNorm = this.bestScore > 0 ? this.currentScore / this.bestScore : 0;
    const scorePos = [0, 1.5 + scoreNorm * 0.5, -2.0];
    this.scoreIndicator.geometry.setAttribute(
      'position', new THREE.Float32BufferAttribute(scorePos, 3)
    );
    this.scoreIndicator.geometry.attributes.position.needsUpdate = true;

    // Connection lines: draw from score indicator to membrane centers that V7 is tuning
    const connPositions: number[] = [];
    for (const rec of this.recommendations) {
      // Draw a line from score indicator to a representative point
      const targetY = rec.target === 'v1' || rec.target === 'v2' ? -1.5 : 0;
      const targetX = rec.target === 'v3' || rec.target === 'v4' ? -1.0 : 1.0;
      connPositions.push(0, 1.5, -2.0, targetX, targetY, -1.5);
    }
    this.connectionLines.geometry.setAttribute(
      'position', new THREE.Float32BufferAttribute(connPositions, 3)
    );
    this.connectionLines.geometry.attributes.position.needsUpdate = true;
  }

  // ── LBM FLOW PARTICLES ──

  private _initFlowParticles() {
    this.particles = [];
    for (let i = 0; i < this._particleCount; i++) {
      this.particles.push({
        position: new THREE.Vector3(
          (Math.random() - 0.5) * 3.5,
          (Math.random() - 0.5) * 3.5,
          (Math.random() - 0.5) * 3.5,
        ),
        velocity: new THREE.Vector3(),
        energy: Math.random(),
      });
    }
  }

  private _updateFlowParticles(compressionLevel: number) {
    const BND = 2.0;
    const size = this._gridSize;
    const step = (BND * 2) / (size - 1);
    const positions: number[] = [];
    const colors: number[] = [];

    for (const p of this.particles) {
      // Sample thermal field for buoyancy
      if (this._thermalField) {
        const gx = Math.floor((p.position.x + BND) / step);
        const gy = Math.floor((p.position.y + BND) / step);
        const gz = Math.floor((p.position.z + BND) / step);
        if (gx >= 0 && gx < size && gy >= 0 && gy < size && gz >= 0 && gz < size) {
          const idx = gx * size * size + gy * size + gz;
          const T = this._thermalField[idx] || 298;
          // Buoyancy: hot air rises
          p.velocity.y += (T - 298) * 0.0001 * compressionLevel;
        }
      }

      // Flow along membrane paths (if near a loop center, follow path direction)
      for (const path of this._latestPaths) {
        for (const loopIdx of path.loopIndices) {
          if (loopIdx < this._loops.length) {
            const loop = this._loops[loopIdx];
            const dist = p.position.distanceTo(loop.center);
            if (dist < 0.5) {
              p.velocity.add(path.direction.clone().multiplyScalar(0.003 * compressionLevel / (dist + 0.1)));
              break;
            }
          }
        }
      }

      // Turbulence
      p.velocity.x += (Math.random() - 0.5) * 0.002 * compressionLevel;
      p.velocity.z += (Math.random() - 0.5) * 0.002 * compressionLevel;

      // Damping
      p.velocity.multiplyScalar(0.97);

      // Move
      p.position.add(p.velocity.clone().multiplyScalar(compressionLevel));

      // Wrap boundaries
      if (Math.abs(p.position.x) > BND) p.position.x *= -0.9;
      if (Math.abs(p.position.y) > BND) p.position.y *= -0.9;
      if (Math.abs(p.position.z) > BND) p.position.z *= -0.9;

      positions.push(p.position.x, p.position.y, p.position.z);

      // Color by velocity magnitude
      const speed = p.velocity.length();
      const t = Math.min(1, speed * 50);
      const c = new THREE.Color();
      if (t < 0.5) c.setRGB(0, 1 - t, 1);
      else c.setRGB(t, 1 - t * 0.5, 0.3);
      colors.push(c.r, c.g, c.b);
    }

    this.flowParticles.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.flowParticles.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.flowParticles.geometry.attributes.position.needsUpdate = true;
    if (this.flowParticles.geometry.attributes.color) {
      this.flowParticles.geometry.attributes.color.needsUpdate = true;
    }
  }

  getScore(): number { return this.currentScore; }
  getBestScore(): number { return this.bestScore; }
  getRecommendations(): TuningRecommendation[] { return this.recommendations; }
  getSnapshots(): OptimizationSnapshot[] { return this.snapshots; }
  getParams(): TuningParam[] { return this.params; }

  saveState() {
    return {
      score: this.currentScore,
      bestScore: this.bestScore,
      params: this.params.map(p => ({ name: p.name, value: p.value })),
      snapshotCount: this.snapshots.length,
      acceptedTrials: this.acceptedTrials,
      rejectedTrials: this.rejectedTrials,
    };
  }

  loadState(state: any) {
    if (!state) return;
    if (Number.isFinite(state.score)) this.currentScore = state.score;
    if (Number.isFinite(state.bestScore)) this.bestScore = state.bestScore;
    if (Array.isArray(state.params)) {
      for (const saved of state.params) {
        const param = this.params.find(p => p.name === saved?.name);
        if (param && Number.isFinite(saved?.value))
          param.value = Math.max(param.min,Math.min(param.max,saved.value));
      }
    }
    if (Number.isSafeInteger(state.acceptedTrials) && state.acceptedTrials >= 0)
      this.acceptedTrials = state.acceptedTrials;
    if (Number.isSafeInteger(state.rejectedTrials) && state.rejectedTrials >= 0)
      this.rejectedTrials = state.rejectedTrials;
    this._pendingTrial = null;
    this.recommendations = [];
    this._revision++;
    this._appliedRevision = this._revision;
  }

  dispose() {
    this.scene.remove(this.trendLines);
    this.scene.remove(this.scoreIndicator);
    this.scene.remove(this.connectionLines);
    this.scene.remove(this.flowParticles);
    this.trendLines.geometry.dispose();
    (this.trendLines.material as THREE.Material).dispose();
    this.scoreIndicator.geometry.dispose();
    (this.scoreIndicator.material as THREE.Material).dispose();
    this.connectionLines.geometry.dispose();
    (this.connectionLines.material as THREE.Material).dispose();
    this.flowParticles.geometry.dispose();
    (this.flowParticles.material as THREE.Material).dispose();
  }
}
