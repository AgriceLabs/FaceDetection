# Viola-Jones Livestream Face Detection CLI

Real-time face detection on YouTube livestreams using the Viola-Jones algorithm.

## Features

- **Viola-Jones Algorithm**: Classic cascade classifier with 6000 trained stumps
- **YouTube Livestream Support**: Automatically extracts m3u8 URLs from YouTube live videos
- **Real-time Detection**: Process livestreams with configurable FPS
- **MPV Integration**: View detected faces in real-time
- **TypeScript**: Fully typed codebase
- **CLI Interface**: Easy-to-use command-line tool

## Architecture

**Real-time face detection with live box overlay (just like webcam mode!)**

```
YouTube Live → yt-dlp → Stream URL
    ↓
FFmpeg extracts RGBA frames @ 10 FPS
    ↓
Viola-Jones Detection (6000 stumps)
    ↓
Draw green boxes directly on pixels (fast!)
    ↓
FFmpeg encodes (ultrafast preset)
    ↓
MPV displays with boxes
```

## Prerequisites

- **Node.js 18+** or **Bun** runtime
- **FFmpeg** installed and available in PATH
- **MPV** player (for display)
- **yt-dlp** (for YouTube URL extraction)

### Install Dependencies

```bash
# Fedora/RHEL
sudo dnf install ffmpeg mpv yt-dlp

# Ubuntu/Debian
sudo apt install ffmpeg mpv yt-dlp

# macOS
brew install ffmpeg mpv yt-dlp
```

## Installation

```bash
# Install dependencies
bun install

# Build the project
bun run build
```

## Usage

### Basic Usage

```bash
# Run with Bun
bun run dev "https://www.youtube.com/watch?v=VIDEO_ID"

# Or use tsx directly
tsx src/index.ts "https://www.youtube.com/watch?v=VIDEO_ID"
```

### Options

```
Usage: vj-detect [options] <youtube-url>

Real-time face detection on YouTube livestreams using Viola-Jones algorithm

Arguments:
  youtube-url              YouTube livestream URL

Options:
  -o, --output <path>      Output stream to file (optional)
  -s, --scale <number>     Detection scale (default: 1.0)
  -t, --threshold <number> Detection threshold (default: 300)
  --no-display             Disable MPV display
  --fps <number>           Processing FPS (default: 10)
  -v, --verbose            Verbose logging
  -h, --help               Display help for command
```

### Examples

```bash
# Basic detection with MPV display
bun run dev "https://www.youtube.com/watch?v=cH7VBI4QQzA"

# Save to file without display
bun run dev "https://www.youtube.com/watch?v=cH7VBI4QQzA" -o output.ts --no-display

# Verbose mode with custom threshold
bun run dev "https://www.youtube.com/watch?v=cH7VBI4QQzA" -v -t 500

# Higher FPS for more detections
bun run dev "https://www.youtube.com/watch?v=cH7VBI4QQzA" --fps 15
```

## Project Structure

```
src/
├── lib/                  # Core Viola-Jones implementation (preserved)
│   ├── types.ts         # Type definitions
│   ├── haarFeature.ts   # Haar feature extraction
│   ├── imageProcessing.ts # Integral image conversion
│   ├── faceDetection.ts # Detection algorithm
│   └── stumpsData.ts    # Trained cascade (6000 stumps, 999KB)
├── youtube/
│   └── streamExtractor.ts # YouTube m3u8 URL extraction
├── video/
│   └── streamProcessor.ts # FFmpeg pipeline & frame processing
├── detection/
│   └── detector.ts       # Face detector wrapper
└── index.ts             # CLI entry point
```

## How It Works

1. **Stream Extraction**: Uses `youtubei.js` to get HLS manifest (m3u8) URL from YouTube
2. **Frame Extraction**: FFmpeg extracts frames from livestream at specified FPS
3. **Face Detection**: Each frame is processed using Viola-Jones algorithm
   - Converts to integral image for fast computation
   - Multi-scale sliding window detection
   - 6000 weak classifiers organized in 7 stages
   - Non-maximum suppression to filter overlapping detections
4. **Box Overlay**: Detection boxes drawn using Sharp + SVG overlay
5. **Output**: Re-encoded stream piped to MPV or saved to file

## Performance Tips

- Lower `--fps` (5-10) for real-time performance
- Increase `--threshold` to reduce false positives
- Use `--no-display` when saving to file for better performance
- Adjust resolution by modifying `width` and `height` in StreamProcessorConfig

## Troubleshooting

### "MPV not found"
Install MPV or use `--no-display` flag

### "FFmpeg not found"
Install FFmpeg and ensure it's in your PATH

### "Failed to get stream URL"
- Check if the video is actually a live stream
- Try the video URL directly in a browser
- Some streams may have geo-restrictions

### Low FPS / Performance Issues
- Reduce processing FPS: `--fps 5`
- Lower detection threshold: `-t 200`
- Check CPU usage - Viola-Jones is CPU-intensive

## Credits

Original Viola-Jones web implementation by Barudak Penguin

## Donation

### BTC, USDT, DOGE (BEP20)
0x673d80b53ddda715274688ecf9ab210dc5bf2fba
