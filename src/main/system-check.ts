import { spawn } from 'node:child_process';
import type { SystemCheckResult } from '@shared/types';

function runVersion(binary: string): Promise<string | null> {
  return new Promise((resolve) => {
    const proc = spawn(binary, ['--version'], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    proc.stdout.on('data', (chunk) => {
      out += chunk.toString();
    });
    proc.on('error', () => resolve(null));
    proc.on('close', (code) => {
      if (code !== 0) {
        resolve(null);
        return;
      }
      resolve(out.trim().split('\n')[0] ?? null);
    });
  });
}

export async function systemCheck(): Promise<SystemCheckResult> {
  const [ytdlpVersion, ffmpegVersion] = await Promise.all([
    runVersion('yt-dlp'),
    runVersion('ffmpeg'),
  ]);
  return {
    ytdlp: { installed: ytdlpVersion !== null, version: ytdlpVersion },
    ffmpeg: { installed: ffmpegVersion !== null, version: ffmpegVersion },
  };
}
