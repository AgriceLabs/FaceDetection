# Viola-Jones Livestream Face Detection CLI

Real-time Viola-Jones face detection on YouTube livestreams with a minimal FFmpeg + MPV pipeline and temporal stabilization.

## Features
- 6000-stump Viola-Jones cascade written in TypeScript
- `yt-dlp` + FFmpeg ingest to raw RGBA frames (720p by default)
- Temporal tracker that stabilizes detections frame-to-frame
- Direct pixel overlays (no canvas/sharp) for low overhead
- MPV preview with headless `--no-display` option
- Works with Node.js or Bun

## Requirements
- Node.js 18+ or Bun
- `ffmpeg` available on PATH
- `mpv` (unless you use `--no-display`)
- `yt-dlp` for resolving livestream URLs

Install the native tools:
```bash
# Fedora/RHEL
sudo dnf install ffmpeg mpv yt-dlp

# Ubuntu/Debian
sudo apt install ffmpeg mpv yt-dlp

# macOS
brew install ffmpeg mpv yt-dlp
```

## Setup
```bash
# Install JS deps
bun install

# Optional: build to dist/ for the CLI bin target
bun run build
```

## Usage
```bash
# Dev / watch mode
bun run dev "https://www.youtube.com/watch?v=VIDEO_ID"

# After building
node dist/index.js "https://www.youtube.com/watch?v=VIDEO_ID"
```

Options:
```
Usage: vj-detect [options] <youtube-url>

Options:
  -t, --threshold <number>  Detection threshold (default: 150)
  --fps <number>            Processing FPS (default: 10)
  --no-display              Disable MPV display
  -v, --verbose             Verbose logging
  -h, --help                Display help for command
```

Examples:
```bash
# Default settings with display
bun run dev "https://www.youtube.com/watch?v=cH7VBI4QQzA"

# Headless run, verbose logs, slightly higher FPS
bun run dev "https://www.youtube.com/watch?v=cH7VBI4QQzA" --no-display --fps 12 -v

# Stricter detections
bun run dev "https://www.youtube.com/watch?v=cH7VBI4QQzA" -t 400
```

## Pipeline
```
YouTube Live URL
  ↓ yt-dlp resolves HLS URL
FFmpeg → raw RGBA frames (1280x720 @ FPS)
  ↓
Viola-Jones detector (6000 stumps)
  ↓
Temporal tracker (optical-flow aided smoothing)
  ↓
Green boxes drawn directly into RGBA buffer
  ↓
FFmpeg re-encodes → MPV (or stdout when headless)
```

## Project Structure
```
src/
├── detection/
│   ├── detector.ts         # Viola-Jones wrapper
│   └── temporalTracker.ts  # Frame-to-frame stabilizer
├── lib/                    # Core cascade implementation
│   ├── faceDetection.ts
│   ├── haarFeature.ts
│   ├── imageProcessing.ts
│   ├── stumpsData.ts
│   └── types.ts
├── video/streamProcessor.ts # FFmpeg ingest/egress + overlays
├── youtube/streamExtractor.ts # Stream URL via yt-dlp
└── index.ts                # CLI entry point
```

## Tips & Notes
- 8–12 FPS keeps CPU reasonable; bump if your machine can handle it.
- Raise `--threshold` to cut false positives; lower it to catch more faces.
- Default resolution is 1280x720. Drop it in `StreamProcessor` if you need less load.
- `--no-display` still runs the pipeline without piping to MPV.

## Troubleshooting
- **MPV not found**: Install MPV or run with `--no-display`.
- **FFmpeg not found**: Ensure `ffmpeg` is installed and on PATH.
- **Failed to get stream URL**: Confirm the video is live and accessible in your region; verify `yt-dlp` works on the URL.
