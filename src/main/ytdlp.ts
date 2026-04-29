import { spawn, ChildProcess } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import type {
  VideoMetadata,
  VideoFormat,
  DownloadRequest,
  DownloadProgress,
} from '@shared/types';

interface RawFormat {
  format_id: string;
  ext: string;
  resolution?: string;
  fps?: number;
  vcodec?: string;
  acodec?: string;
  filesize?: number | null;
  filesize_approx?: number | null;
  format_note?: string;
}

interface RawMetadata {
  id: string;
  title: string;
  duration?: number;
  thumbnail?: string;
  uploader?: string;
  formats?: RawFormat[];
  _type?: string;
  entries?: unknown[];
}

function mapFormat(f: RawFormat): VideoFormat {
  return {
    formatId: f.format_id,
    ext: f.ext,
    resolution: f.resolution ?? null,
    fps: f.fps ?? null,
    vcodec: f.vcodec ?? null,
    acodec: f.acodec ?? null,
    filesize: f.filesize ?? f.filesize_approx ?? null,
    note: f.format_note ?? null,
  };
}

export function fetchMetadata(url: string): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', ['--dump-json', '--no-warnings', url], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (c) => {
      stdout += c.toString();
    });
    proc.stderr.on('data', (c) => {
      stderr += c.toString();
    });
    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
        return;
      }
      try {
        const firstLine = stdout.split('\n').find((line) => line.trim().length > 0);
        if (!firstLine) {
          reject(new Error('yt-dlp returned no metadata'));
          return;
        }
        const raw = JSON.parse(firstLine) as RawMetadata;
        resolve({
          id: raw.id,
          title: raw.title,
          duration: raw.duration ?? null,
          thumbnail: raw.thumbnail ?? null,
          uploader: raw.uploader ?? null,
          formats: (raw.formats ?? []).map(mapFormat),
          isPlaylist: raw._type === 'playlist',
        });
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  });
}

const PROGRESS_RE =
  /^\[download\]\s+(\d+(?:\.\d+)?)%\s+of\s+~?\S+\s+at\s+(\S+)\s+ETA\s+(\S+)/;

export function parseProgressLine(
  line: string,
): { percent: number; speed: string; eta: string } | null {
  const m = PROGRESS_RE.exec(line);
  if (!m) return null;
  return { percent: parseFloat(m[1]!), speed: m[2]!, eta: m[3]! };
}

function formatArgsFor(req: DownloadRequest): string[] {
  if (req.format.kind === 'audio') {
    throw new Error('Audio downloads are not yet implemented (M2)');
  }
  const q = req.format.quality;
  if (q === 'best') {
    return ['-f', 'bv*+ba/b', '--merge-output-format', 'mp4'];
  }
  return [
    '-f',
    `bv*[height<=${q}]+ba/b[height<=${q}]`,
    '--merge-output-format',
    'mp4',
  ];
}

const activeProcs = new Map<string, ChildProcess>();

export async function startDownload(
  req: DownloadRequest,
  onProgress: (p: DownloadProgress) => void,
  onDone: (filePath: string) => void,
  onError: (err: Error, stderr: string) => void,
): Promise<void> {
  await mkdir(req.outputDir, { recursive: true });

  const args = [
    ...formatArgsFor(req),
    '-o',
    '%(title)s.%(ext)s',
    '--newline',
    '--print',
    'after_move:filepath:%(filepath)s',
    req.url,
  ];

  console.log('[ytdlp] cwd:', req.outputDir);
  console.log('[ytdlp] yt-dlp', args.join(' '));

  const proc = spawn('yt-dlp', args, {
    cwd: req.outputDir,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  activeProcs.set(req.id, proc);

  let stderr = '';
  let lastEmit = 0;
  let finalPath: string | null = null;
  let stdoutBuf = '';

  proc.stdout.on('data', (chunk: Buffer) => {
    stdoutBuf += chunk.toString();
    let idx: number;
    while ((idx = stdoutBuf.indexOf('\n')) >= 0) {
      const line = stdoutBuf.slice(0, idx);
      stdoutBuf = stdoutBuf.slice(idx + 1);
      const filepathMarker = 'filepath:';
      if (line.startsWith(filepathMarker)) {
        finalPath = line.slice(filepathMarker.length).trim();
        continue;
      }
      const prog = parseProgressLine(line);
      if (prog) {
        const now = Date.now();
        if (now - lastEmit >= 200) {
          lastEmit = now;
          onProgress({
            id: req.id,
            percent: prog.percent,
            speed: prog.speed,
            eta: prog.eta,
            stage: 'downloading',
          });
        }
      }
    }
  });

  proc.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  proc.on('error', (err) => {
    activeProcs.delete(req.id);
    onError(err, stderr);
  });

  proc.on('close', (code, signal) => {
    activeProcs.delete(req.id);
    console.log(`[ytdlp] close code=${code} signal=${signal} finalPath=${finalPath}`);
    if (stderr.trim()) console.log('[ytdlp] stderr:\n' + stderr.trim());
    if (signal === 'SIGTERM') return;
    if (code !== 0) {
      onError(
        new Error(stderr.trim().split('\n').slice(-1)[0] ?? `yt-dlp exited ${code}`),
        stderr,
      );
      return;
    }
    onProgress({ id: req.id, percent: 100, speed: null, eta: null, stage: 'done' });
    onDone(finalPath ?? req.outputDir);
  });
}

export function cancelDownload(id: string): boolean {
  const proc = activeProcs.get(id);
  if (!proc) return false;
  proc.kill('SIGTERM');
  activeProcs.delete(id);
  return true;
}
