#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { getStreamUrl } from './youtube/streamExtractor.js';
import { StreamProcessor } from './video/streamProcessor.js';
import { FaceDetector } from './detection/detector.js';

const program = new Command();

program
  .name('vj-detect')
  .description('Real-time face detection on livestreams or video files using Viola-Jones algorithm')
  .version('1.0.0')
  .argument('<input>', 'YouTube URL, direct video URL (mp4/m3u8), or local file path')
  .option('-t, --threshold <number>', 'Detection threshold (default: 150)', '150')
  .option('--no-display', 'Disable MPV display')
  .option('--fps <number>', 'Processing FPS (default: 10)', '10')
  .option('-v, --verbose', 'Verbose logging')
  .action(async (input: string, options) => {
    try {
      console.log(chalk.cyan.bold('\n🎥 Viola-Jones Face Detector\n'));

      // Step 1: Resolve input URL or file
      const spinner = ora('Resolving input...').start();
      const streamUrl = await resolveStreamInput(input);
      spinner.succeed(chalk.green(`Input resolved: ${previewInput(streamUrl)}`));

      // Step 2: Initialize face detector
      spinner.start('Initializing Viola-Jones face detector...');
      const detector = new FaceDetector({
        threshold: parseInt(options.threshold),
        verbose: options.verbose,
      });
      await detector.initialize();
      spinner.succeed(chalk.green('Face detector initialized (6000 stumps loaded)'));

      // Step 3: Start stream processing
      spinner.start('Starting stream processor...');
      const processor = new StreamProcessor({
        streamUrl,
        detector,
        displayEnabled: options.display,
        fps: parseInt(options.fps),
        verbose: options.verbose,
      });

      spinner.succeed(chalk.green('Stream processor ready'));
      console.log(chalk.yellow('\n▶️  Starting face detection...\n'));

      // Step 4: Process stream
      await processor.start();

    } catch (error) {
      console.error(chalk.red('\n❌ Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function isYouTubeUrl(value: string): boolean {
  return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(value);
}

function isDirectVideoUrl(value: string): boolean {
  if (!isHttpUrl(value)) {
    return false;
  }

  try {
    const url = new URL(value);
    const path = url.pathname.toLowerCase();
    return path.endsWith('.mp4') || path.endsWith('.m3u8');
  } catch {
    return false;
  }
}

function normalizeFileInput(value: string): string {
  const pathValue = value.startsWith('file://') ? fileURLToPath(value) : value;
  return path.resolve(pathValue);
}

function fileExists(value: string): boolean {
  const pathValue = normalizeFileInput(value);
  return fs.existsSync(pathValue) && fs.statSync(pathValue).isFile();
}

async function resolveStreamInput(input: string): Promise<string> {
  if (isYouTubeUrl(input)) {
    return getStreamUrl(input);
  }

  if (isDirectVideoUrl(input)) {
    return input;
  }

  if (fileExists(input)) {
    return normalizeFileInput(input);
  }

  throw new Error('Input must be a YouTube URL, direct .mp4/.m3u8 URL, or local file path');
}

function previewInput(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 60) {
    return trimmed;
  }
  return `${trimmed.slice(0, 57)}...`;
}

program.parse();
