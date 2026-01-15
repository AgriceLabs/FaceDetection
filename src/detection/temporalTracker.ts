import type { Detection } from '../lib/types.js';

export interface TemporalTrackerConfig {
  flowWindow?: number;
  flowSearchRadius?: number;
  likelihoodDecay?: number;
  likelihoodBoost?: number;
  historyMomentum?: number;
  missedDecay?: number;
  occlusionHold?: number;
  stabilityFloor?: number;
}

interface TrackState {
  id: number;
  detection: Detection;
  stableConfidence: number;
  velocity: { x: number; y: number };
  misses: number;
  hits: number;
}

/**
 * Lightweight temporal tracker that blends optical flow motion,
 * a decaying likelihood map, and cascade history smoothing.
 */
export class TemporalTracker {
  private config: Required<TemporalTrackerConfig>;
  private previousGray: Float32Array | null = null;
  private likelihoodMap: Float32Array | null = null;
  private tracks = new Map<number, TrackState>();
  private nextId = 1;
  private width = 0;
  private height = 0;

  constructor(config: TemporalTrackerConfig = {}) {
    this.config = {
      flowWindow: config.flowWindow ?? 10,
      flowSearchRadius: config.flowSearchRadius ?? 6,
      likelihoodDecay: config.likelihoodDecay ?? 0.9,
      likelihoodBoost: config.likelihoodBoost ?? 0.25,
      historyMomentum: config.historyMomentum ?? 0.35,
      missedDecay: config.missedDecay ?? 0.82,
      occlusionHold: config.occlusionHold ?? 4,
      stabilityFloor: config.stabilityFloor ?? 120,
    };
  }

  update(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    detections: Detection[]
  ): Detection[] {
    const gray = this.toGrayscale(pixels, width, height);
    this.ensureBuffers(width, height);
    this.decayLikelihood();

    const predicted = this.predictTracks(gray, width, height);
    const matchedIds = new Set<number>();
    const nextTracks = new Map<number, TrackState>();
    const stabilized: Detection[] = [];

    for (const detection of detections) {
      const match = this.findBestTrack(detection, predicted);
      const trackId = match?.id ?? this.nextId++;
      const historyBoost = match ? match.stableConfidence * this.config.historyMomentum : 0;
      const likelihoodBoost = this.sampleLikelihood(detection, width, height) * this.config.likelihoodBoost;
      const combinedConfidence = detection.confidency + historyBoost + likelihoodBoost;

      const stableConfidence = match
        ? this.mix(match.stableConfidence, combinedConfidence, 0.35)
        : combinedConfidence;

      const velocity = match
        ? {
            x: detection.x - match.detection.x,
            y: detection.y - match.detection.y,
          }
        : { x: 0, y: 0 };

      const stabilizedDetection: Detection = {
        ...detection,
        confidency: combinedConfidence,
        stableConfidence,
        id: trackId,
      };

      const hits = match ? match.hits + 1 : 1;
      stabilizedDetection.hits = hits;
      stabilizedDetection.misses = 0;
      stabilizedDetection.isPredicted = false;

      nextTracks.set(trackId, {
        id: trackId,
        detection: stabilizedDetection,
        stableConfidence,
        velocity,
        misses: 0,
        hits,
      });

      if (match) matchedIds.add(match.id);
      stabilized.push(stabilizedDetection);
      this.depositLikelihood(stabilizedDetection, width, height);
    }

    // Carry over confident tracks through brief occlusions
    for (const [id, track] of predicted) {
      if (matchedIds.has(id)) continue;

      const decayedConfidence = track.stableConfidence * this.config.missedDecay;
      if (track.misses + 1 <= this.config.occlusionHold && decayedConfidence >= this.config.stabilityFloor) {
        const carried: Detection = {
          ...track.detection,
          x: track.detection.x + track.velocity.x,
          y: track.detection.y + track.velocity.y,
          confidency: decayedConfidence,
          stableConfidence: decayedConfidence,
          id,
          hits: track.hits,
          misses: track.misses + 1,
          isPredicted: true,
        };

        nextTracks.set(id, {
          ...track,
          detection: carried,
          stableConfidence: decayedConfidence,
          misses: track.misses + 1,
          hits: track.hits,
        });

        stabilized.push(carried);
        this.depositLikelihood(carried, width, height);
      }
    }

    this.tracks = nextTracks;
    this.previousGray = gray;

    return stabilized;
  }

  private toGrayscale(pixels: Uint8ClampedArray, width: number, height: number): Float32Array {
    const gray = new Float32Array(width * height);
    for (let i = 0, g = 0; i < pixels.length; i += 4, g++) {
      gray[g] = (pixels[i]! + pixels[i + 1]! + pixels[i + 2]!) / (3 * 255);
    }
    return gray;
  }

  private ensureBuffers(width: number, height: number): void {
    if (!this.likelihoodMap || this.width !== width || this.height !== height) {
      this.width = width;
      this.height = height;
      this.likelihoodMap = new Float32Array(width * height);
    }
  }

  private decayLikelihood(): void {
    if (!this.likelihoodMap) return;
    const map = this.likelihoodMap!;
    for (let i = 0; i < map.length; i++) {
      map[i] = map[i]! * this.config.likelihoodDecay;
    }
  }

  private depositLikelihood(detection: Detection, width: number, height: number): void {
    if (!this.likelihoodMap) return;
    const map = this.likelihoodMap!;
    const radius = Math.max(6, Math.round(12 * detection.scaleFactor));
    const boost = Math.max(0.5, Math.min(3, detection.confidency / 400));

    const centerX = Math.round(detection.x + radius / 2);
    const centerY = Math.round(detection.y + radius / 2);

    for (let y = -radius; y <= radius; y += 2) {
      const py = centerY + y;
      if (py < 0 || py >= height) continue;
      for (let x = -radius; x <= radius; x += 2) {
        const px = centerX + x;
        if (px < 0 || px >= width) continue;
        const distSq = x * x + y * y;
        const falloff = Math.exp(-distSq / (radius * 4));
        const idx = py * width + px;
        map[idx] = Math.min(10, map[idx]! + boost * falloff);
      }
    }
  }

  private sampleLikelihood(detection: Detection, width: number, height: number): number {
    if (!this.likelihoodMap) return 0;
    const map = this.likelihoodMap!;
    const radius = Math.max(4, Math.round(8 * detection.scaleFactor));
    const centerX = Math.round(detection.x + radius / 2);
    const centerY = Math.round(detection.y + radius / 2);

    let sum = 0;
    let count = 0;
    for (let y = -radius; y <= radius; y += 2) {
      const py = centerY + y;
      if (py < 0 || py >= height) continue;
      for (let x = -radius; x <= radius; x += 2) {
        const px = centerX + x;
        if (px < 0 || px >= width) continue;
        sum += map[py * width + px]!;
        count++;
      }
    }
    return count > 0 ? sum / count : 0;
  }

  private predictTracks(gray: Float32Array, width: number, height: number): Map<number, TrackState> {
    const predicted = new Map<number, TrackState>();
    if (!this.previousGray) return predicted;

    for (const [id, track] of this.tracks) {
      const motion = this.estimateFlow(this.previousGray, gray, width, height, track.detection);
      const predictedDetection: Detection = {
        ...track.detection,
        x: track.detection.x + motion.x,
        y: track.detection.y + motion.y,
        id,
      };

      predicted.set(id, {
        ...track,
        detection: predictedDetection,
        velocity: motion,
      });
    }

    return predicted;
  }

  private estimateFlow(
    previous: Float32Array,
    current: Float32Array,
    width: number,
    height: number,
    detection: Detection
  ): { x: number; y: number } {
    const window = Math.max(6, Math.round(this.config.flowWindow * detection.scaleFactor));
    const search = this.config.flowSearchRadius;
    const cx = Math.round(detection.x + window / 2);
    const cy = Math.round(detection.y + window / 2);

    let bestScore = Number.POSITIVE_INFINITY;
    let bestDx = 0;
    let bestDy = 0;

    for (let dy = -search; dy <= search; dy++) {
      for (let dx = -search; dx <= search; dx++) {
        let score = 0;
        let samples = 0;
        for (let y = -window; y <= window; y += 2) {
          const py = cy + y;
          const qy = py + dy;
          if (py < 1 || py >= height - 1 || qy < 1 || qy >= height - 1) continue;

          for (let x = -window; x <= window; x += 2) {
            const px = cx + x;
            const qx = px + dx;
            if (px < 1 || px >= width - 1 || qx < 1 || qx >= width - 1) continue;

            const prevVal = previous[py * width + px]!;
            const curVal = current[qy * width + qx]!;
            const diff = prevVal - curVal;
            score += diff * diff;
            samples++;
          }
        }

        if (samples === 0) continue;
        const meanScore = score / samples;
        if (meanScore < bestScore) {
          bestScore = meanScore;
          bestDx = dx;
          bestDy = dy;
        }
      }
    }

    return { x: bestDx, y: bestDy };
  }

  private findBestTrack(detection: Detection, tracks: Map<number, TrackState>): TrackState | null {
    let best: TrackState | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const [, track] of tracks) {
      const dist = this.distance(detection, track.detection);
      if (dist < bestDistance) {
        best = track;
        bestDistance = dist;
      }
    }

    // Only accept if reasonably close to predicted position
    const maxDist = Math.max(16, 32 * detection.scaleFactor);
    return bestDistance <= maxDist ? best : null;
  }

  private distance(a: Detection, b: Detection): number {
    const ax = a.x + a.scaleFactor * 12;
    const ay = a.y + a.scaleFactor * 12;
    const bx = b.x + b.scaleFactor * 12;
    const by = b.y + b.scaleFactor * 12;
    return Math.hypot(ax - bx, ay - by);
  }

  private mix(prev: number, next: number, alpha: number): number {
    return prev * (1 - alpha) + next * alpha;
  }
}
