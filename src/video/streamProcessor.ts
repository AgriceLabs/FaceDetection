import { spawn, ChildProcess } from 'child_process';
import { FaceDetector } from '../detection/detector.js';
import { TemporalTracker, type TemporalTrackerConfig } from '../detection/temporalTracker.js';
import type { Detection } from '../lib/types.js';

export interface StreamProcessorConfig {
  streamUrl: string;
  detector: FaceDetector;
  outputPath?: string;
  displayEnabled?: boolean;
  fps?: number;
  verbose?: boolean;
  width?: number;
  height?: number;
  trackingConfig?: TemporalTrackerConfig;
}

/**
 * Stream processor with real-time face detection and box overlay
 * Similar to webcam approach but optimized for livestreams
 */
export class StreamProcessor {
  private config: Required<StreamProcessorConfig>;
  private frameCount = 0;
  private faceCount = 0;
  private running = false;
  private tracker: TemporalTracker;
  private ffmpegInput: ChildProcess | null = null;
  private ffmpegOutput: ChildProcess | null = null;
  private mpvProcess: ChildProcess | null = null;

  constructor(config: StreamProcessorConfig) {
    this.config = {
      streamUrl: config.streamUrl,
      detector: config.detector,
      outputPath: config.outputPath ?? '',
      displayEnabled: config.displayEnabled ?? true,
      fps: config.fps ?? 30,
      verbose: config.verbose ?? false,
      width: config.width ?? 1280,
      height: config.height ?? 720,
      trackingConfig: config.trackingConfig ?? {},
    };

    this.tracker = new TemporalTracker(this.config.trackingConfig);
  }

  /**
   * Start processing
   */
  async start(): Promise<void> {
    this.running = true;
    console.log('[Processor] Starting real-time face detection...\n');

    process.on('SIGINT', () => {
      console.log('\n[Processor] Stopping...');
      this.stop();
      process.exit(0);
    });

    await this.startPipeline();
  }

  /**
   * Start optimized pipeline
   */
  private async startPipeline(): Promise<void> {
    const frameSize = this.config.width * this.config.height * 4; // RGBA
    let frameBuffer = Buffer.alloc(0);

    console.log(`[Pipeline] ${this.config.width}x${this.config.height} @ ${this.config.fps} FPS`);
    console.log('[Detection] Viola-Jones active\n');

    // Input: Extract RGBA frames
    this.ffmpegInput = spawn('ffmpeg', [
      '-i', this.config.streamUrl,
      '-vf', 'scale=-2:720:flags=lanczos',
      '-f', 'rawvideo',
      '-pix_fmt', 'rgba',
      '-s', `${this.config.width}x${this.config.height}`,
      '-r', this.config.fps.toString(),
      'pipe:1',
    ], {
      stdio: ['ignore', 'pipe', this.config.verbose ? 'inherit' : 'ignore'],
    });

    // Output: Encode with boxes
    this.ffmpegOutput = spawn('ffmpeg', [
      '-f', 'rawvideo',
      '-pix_fmt', 'rgba',
      '-s', `${this.config.width}x${this.config.height}`,
      '-r', this.config.fps.toString(),
      '-i', 'pipe:0',
      '-c:v', 'libx264',
      '-b:v', '4000k',
      '-maxrate', '5000k',
      '-bufsize', '8000k',
      '-crf', '23',
      '-preset', 'veryfast',
      '-tune', 'film',
      '-profile:v', 'high',
      '-level', '4.2',
      '-pix_fmt', 'yuv420p',
      '-f', 'mpegts',
      'pipe:1',
    ], {
      stdio: ['pipe', 'pipe', this.config.verbose ? 'inherit' : 'ignore'],
    });

    // MPV for display
    if (this.config.displayEnabled) {
      this.mpvProcess = spawn('mpv', [
        '--no-cache',
        '--untimed',
        '--profile=low-latency',
        '--title=Viola-Jones Face Detection',
        '-',
      ], {
        stdio: ['pipe', 'inherit', this.config.verbose ? 'inherit' : 'ignore'],
      });

      this.ffmpegOutput.stdout?.pipe(this.mpvProcess.stdin!);

      this.mpvProcess.on('exit', () => {
        this.stop();
      });
    }

    // Process frames
    this.ffmpegInput.stdout?.on('data', (chunk: Buffer) => {
      frameBuffer = Buffer.concat([frameBuffer, chunk]);

      while (frameBuffer.length >= frameSize) {
        const frameData = frameBuffer.subarray(0, frameSize);
        frameBuffer = frameBuffer.subarray(frameSize);

        // Process frame and send to output
        const processed = this.processFrame(frameData);
        if (this.ffmpegOutput?.stdin?.writable) {
          this.ffmpegOutput.stdin.write(processed);
        }
      }
    });

    this.ffmpegInput.on('error', (err) => {
      console.error('[Input] Error:', err.message);
      this.stop();
    });

    this.ffmpegOutput.on('error', (err) => {
      console.error('[Output] Error:', err.message);
      this.stop();
    });
  }

  /**
   * Process single frame: detect + draw boxes
   */
  private processFrame(frameData: Buffer): Buffer {
    this.frameCount++;

    // Create Uint8ClampedArray view (no copy needed!)
    const rgbaData = new Uint8ClampedArray(frameData.buffer, frameData.byteOffset, frameData.length);

    // Detect faces
    const result = this.config.detector.detect(
      rgbaData,
      this.config.width,
      this.config.height
    );

    const stabilizedFaces = this.tracker.update(
      rgbaData,
      this.config.width,
      this.config.height,
      result.faces
    );

    this.faceCount += stabilizedFaces.length;

    // Draw boxes directly on frame data
    if (stabilizedFaces.length > 0) {
      this.drawBoxes(rgbaData, stabilizedFaces);

      if (this.frameCount % 30 === 0) {
        console.log(`[Frame ${this.frameCount}] ${stabilizedFaces.length} face(s) | Total: ${this.faceCount}`);
      }
    }

    return frameData;
  }

  /**
   * Draw detection boxes directly on RGBA data (like canvas!)
   */
  private drawBoxes(data: Uint8ClampedArray, faces: Detection[]): void {
    const width = this.config.width;
    const height = this.config.height;

    for (const face of faces) {
      const x = Math.round(face.x);
      const y = Math.round(face.y);
      const size = Math.round(24 * face.scaleFactor);
      const lineWidth = 2;

      // Draw green rectangle (RGBA: 0, 255, 0, 255)
      // Top line
      for (let i = 0; i < size; i++) {
        for (let w = 0; w < lineWidth; w++) {
          const px = x + i;
          const py = y + w;
          if (px >= 0 && px < width && py >= 0 && py < height) {
            const idx = (py * width + px) * 4;
            data[idx] = 0;       // R
            data[idx + 1] = 255; // G
            data[idx + 2] = 0;   // B
            data[idx + 3] = 255; // A
          }
        }
      }

      // Bottom line
      for (let i = 0; i < size; i++) {
        for (let w = 0; w < lineWidth; w++) {
          const px = x + i;
          const py = y + size - w;
          if (px >= 0 && px < width && py >= 0 && py < height) {
            const idx = (py * width + px) * 4;
            data[idx] = 0;
            data[idx + 1] = 255;
            data[idx + 2] = 0;
            data[idx + 3] = 255;
          }
        }
      }

      // Left line
      for (let i = 0; i < size; i++) {
        for (let w = 0; w < lineWidth; w++) {
          const px = x + w;
          const py = y + i;
          if (px >= 0 && px < width && py >= 0 && py < height) {
            const idx = (py * width + px) * 4;
            data[idx] = 0;
            data[idx + 1] = 255;
            data[idx + 2] = 0;
            data[idx + 3] = 255;
          }
        }
      }

      // Right line
      for (let i = 0; i < size; i++) {
        for (let w = 0; w < lineWidth; w++) {
          const px = x + size - w;
          const py = y + i;
          if (px >= 0 && px < width && py >= 0 && py < height) {
            const idx = (py * width + px) * 4;
            data[idx] = 0;
            data[idx + 1] = 255;
            data[idx + 2] = 0;
            data[idx + 3] = 255;
          }
        }
      }
    }
  }

  /**
   * Stop processing
   */
  stop(): void {
    if (!this.running) return;
    this.running = false;

    if (this.ffmpegInput) {
      this.ffmpegInput.kill('SIGTERM');
      this.ffmpegInput = null;
    }

    if (this.ffmpegOutput) {
      this.ffmpegOutput.kill('SIGTERM');
      this.ffmpegOutput = null;
    }

    if (this.mpvProcess) {
      this.mpvProcess.kill('SIGTERM');
      this.mpvProcess = null;
    }

    console.log('\n══════════════════════════════════════');
    console.log('✅ Processing stopped');
    console.log(`📊 Frames: ${this.frameCount}`);
    console.log(`👤 Faces: ${this.faceCount}`);
    if (this.frameCount > 0) {
      console.log(`📈 Avg: ${(this.faceCount / this.frameCount).toFixed(2)}/frame`);
    }
    console.log('══════════════════════════════════════');
  }
}
