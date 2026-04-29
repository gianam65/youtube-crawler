import { spawn } from 'node:child_process';
import type { SystemCheckResult } from '@shared/types';

function runVersion(binary: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    const proc = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    proc.stdout.on('data', (chunk) => {
      out += chunk.toString();
    });
    proc.stderr.on('data', (chunk) => {
      err += chunk.toString();
    });
    proc.on('error', (e) => {
      console.error(`[system-check] spawn error for ${binary}:`, e.message);
      resolve(null);
    });
    proc.on('close', (code) => {
      if (code !== 0) {
        console.error(`[system-check] ${binary} --version exited ${code}:`, err.trim());
        resolve(null);
        return;
      }
      resolve(out.trim().split('\n')[0] ?? null);
    });
  });
}

export async function systemCheck(): Promise<SystemCheckResult> {
  const [ytdlpVersion, ffmpegVersion] = await Promise.all([
    runVersion('yt-dlp', ['--version']),
    runVersion('ffmpeg', ['-version']),
  ]);
  return {
    ytdlp: { installed: ytdlpVersion !== null, version: ytdlpVersion },
    ffmpeg: { installed: ffmpegVersion !== null, version: ffmpegVersion },
  };
}
