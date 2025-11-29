import { initializeStumps, findFaces } from '../lib/faceDetection.js';
import { processImageData } from '../lib/imageProcessing.js';
import { stumpsJSON } from '../lib/stumpsData.js';
import type { Detection } from '../lib/types.js';

export interface DetectorConfig {
  threshold?: number;
  scale?: number;
  stepSize?: number;
  maxScale?: number;
  scaleStep?: number;
  verbose?: boolean;
}

export interface DetectionResult {
  faces: Detection[];
  processTime: number;
  frameWidth: number;
  frameHeight: number;
}

/**
 * Face detector using Viola-Jones algorithm
 */
export class FaceDetector {
  private config: Required<DetectorConfig>;
  private initialized = false;

  constructor(config: DetectorConfig = {}) {
    this.config = {
      threshold: config.threshold ?? 300,
      scale: config.scale ?? 1.0,
      stepSize: config.stepSize ?? 4,
      maxScale: config.maxScale ?? 2,
      scaleStep: config.scaleStep ?? 1.5,
      verbose: config.verbose ?? false,
    };
  }

  /**
   * Initialize the detector (load stumps)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Load the trained cascade classifier (6000 stumps)
    initializeStumps(stumpsJSON);
    this.initialized = true;

    if (this.config.verbose) {
      console.log('[Detector] Initialized with config:', this.config);
    }
  }

  /**
   * Detect faces in RGBA pixel data
   * @param pixels RGBA pixel data (Uint8ClampedArray)
   * @param width Image width
   * @param height Image height
   */
  detect(pixels: Uint8ClampedArray, width: number, height: number): DetectionResult {
    if (!this.initialized) {
      throw new Error('Detector not initialized. Call initialize() first.');
    }

    const startTime = performance.now();

    // Convert to integral image
    const { integralMatrix, squaredIntegralMatrix } = processImageData(pixels, width, height);

    // Run multi-scale sliding window detection (includes internal filtering)
    const detections = findFaces(
      integralMatrix,
      squaredIntegralMatrix,
      width,
      height,
      this.config.stepSize,
      this.config.maxScale,
      this.config.scaleStep
    );

    // Filter by threshold
    const filteredFaces = detections.filter(d => d.confidency >= this.config.threshold);

    const processTime = performance.now() - startTime;

    if (this.config.verbose) {
      console.log(
        `[Detector] Found ${filteredFaces.length} faces (${detections.length} raw) in ${processTime.toFixed(2)}ms`
      );
    }

    return {
      faces: filteredFaces,
      processTime,
      frameWidth: width,
      frameHeight: height,
    };
  }

  /**
   * Update detector configuration
   */
  updateConfig(config: Partial<DetectorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<DetectorConfig> {
    return { ...this.config };
  }
}
