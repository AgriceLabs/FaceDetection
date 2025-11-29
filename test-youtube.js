import { Innertube } from 'youtubei.js';

async function test() {
  console.log('Creating Innertube client...');
  const youtube = await Innertube.create();

  console.log('Getting video info...');
  const info = await youtube.getInfo('cH7VBI4QQzA');

  console.log('\nVideo info:');
  console.log('Title:', info.basic_info.title);
  console.log('Is Live:', info.basic_info.is_live);

  if (info.streaming_data) {
    console.log('\nStreaming data available:', !!info.streaming_data);
    console.log('HLS Manifest URL:', info.streaming_data.hls_manifest_url || 'NOT AVAILABLE');

    if (info.streaming_data.formats) {
      console.log('\nFormats available:', info.streaming_data.formats.length);
    }

    if (info.streaming_data.adaptive_formats) {
      console.log('Adaptive formats available:', info.streaming_data.adaptive_formats.length);
    }
  } else {
    console.log('\nNO STREAMING DATA AVAILABLE');
  }
}

test().catch(console.error);
