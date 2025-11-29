#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getStreamUrl } from './youtube/streamExtractor.js';
import { StreamProcessor } from './video/streamProcessor.js';
import { FaceDetector } from './detection/detector.js';

const program = new Command();

program
  .name('vj-detect')
  .description('Real-time face detection on YouTube livestreams using Viola-Jones algorithm')
  .version('1.0.0')
  .argument('<youtube-url>', 'YouTube livestream URL')
  .option('-t, --threshold <number>', 'Detection threshold (default: 150)', '150')
  .option('--no-display', 'Disable MPV display')
  .option('--fps <number>', 'Processing FPS (default: 10)', '10')
  .option('-v, --verbose', 'Verbose logging')
  .action(async (youtubeUrl: string, options) => {
    try {
      console.log(chalk.cyan.bold('\n🎥 Viola-Jones Livestream Face Detector\n'));

      // Step 1: Extract m3u8 URL
      const spinner = ora('Extracting livestream URL...').start();
      const streamUrl = await getStreamUrl(youtubeUrl);
      spinner.succeed(chalk.green(`Stream URL obtained: ${streamUrl.substring(0, 50)}...`));

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
      console.log(chalk.yellow('\n▶️  Starting face detection on livestream...\n'));

      // Step 4: Process stream
      await processor.start();

    } catch (error) {
      console.error(chalk.red('\n❌ Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();
