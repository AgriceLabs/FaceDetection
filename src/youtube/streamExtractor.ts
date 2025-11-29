import { execSync } from 'child_process';

/**
 * Extract video ID from YouTube URL
 */
function extractVideoId(url: string): string {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/live\/)([^&\s]+)/,
    /^([a-zA-Z0-9_-]{11})$/, // Direct video ID
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  throw new Error('Invalid YouTube URL or video ID');
}

/**
 * Get m3u8 livestream URL from YouTube video using yt-dlp
 */
export async function getStreamUrl(youtubeUrl: string): Promise<string> {
  try {
    // Use yt-dlp to get the best video stream URL
    // -f best: get best quality
    // -g: print URL only
    // --no-warnings: suppress warnings
    const command = `yt-dlp -f best -g --no-warnings "${youtubeUrl}"`;

    const streamUrl = execSync(command, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      timeout: 30000, // 30 second timeout
    }).trim();

    if (!streamUrl || !streamUrl.startsWith('http')) {
      throw new Error('Failed to extract stream URL');
    }

    return streamUrl;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to get stream URL: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Get stream metadata using yt-dlp
 */
export async function getStreamMetadata(youtubeUrl: string) {
  try {
    const command = `yt-dlp -j --no-warnings "${youtubeUrl}"`;

    const output = execSync(command, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30000,
    }).trim();

    const metadata = JSON.parse(output);

    return {
      title: metadata.title || 'Unknown',
      author: metadata.uploader || metadata.channel || 'Unknown',
      isLive: metadata.is_live || false,
      viewCount: metadata.view_count || 0,
      duration: metadata.duration || 0,
    };
  } catch (error) {
    // Return defaults if metadata fetch fails
    return {
      title: 'Unknown',
      author: 'Unknown',
      isLive: false,
      viewCount: 0,
      duration: 0,
    };
  }
}
