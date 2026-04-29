import { spawn, ChildProcess } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import type {
  VideoMetadata,
  VideoFormat,
  DownloadRequest,
  DownloadProgress,
  PlaylistInfo,
  PlaylistEntry,
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
    const args = ['--dump-json', '--no-warnings', '--no-playlist', url];
    console.log('[ytdlp] metadata fetch: yt-dlp', args.join(' '));
    const proc = spawn('yt-dlp', args, {
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
    proc.on('error', (err) => {
      console.error('[ytdlp] metadata spawn error:', err.message);
      reject(err);
    });
    proc.on('close', (code) => {
      console.log(`[ytdlp] metadata exit code=${code}, stdout=${stdout.length}b, stderr=${stderr.length}b`);
      if (stderr.trim()) console.log('[ytdlp] metadata stderr:\n' + stderr.trim());
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

interface RawPlaylistEntry {
  id?: string;
  title?: string;
  url?: string;
  duration?: number | null;
  thumbnails?: Array<{ url: string }>;
}

interface RawPlaylistInfo {
  id?: string;
  title?: string;
  uploader?: string;
  entries?: RawPlaylistEntry[];
  _type?: string;
}

function entryUrl(e: RawPlaylistEntry): string {
  if (e.url && /^https?:\/\//.test(e.url)) return e.url;
  if (e.id) return `https://www.youtube.com/watch?v=${e.id}`;
  return e.url ?? '';
}

export function fetchPlaylistEntries(url: string): Promise<PlaylistInfo> {
  return new Promise((resolve, reject) => {
    const args = [
      '--flat-playlist',
      '--dump-single-json',
      '--no-warnings',
      '--yes-playlist',
      url,
    ];
    console.log('[ytdlp] playlist fetch: yt-dlp', args.join(' '));
    const proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });
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
      console.log(
        `[ytdlp] playlist exit code=${code}, stdout=${stdout.length}b, stderr=${stderr.length}b`,
      );
      if (stderr.trim()) console.log('[ytdlp] playlist stderr:\n' + stderr.trim());
      if (code !== 0) {
        reject(new Error(stderr.trim() || `yt-dlp exited ${code}`));
        return;
      }
      try {
        const raw = JSON.parse(stdout) as RawPlaylistInfo;
        if (raw._type !== 'playlist' || !raw.entries || raw.entries.length === 0) {
          reject(
            new Error(
              'NOT_A_PLAYLIST: yt-dlp returned a single video (playlist may be private/unlisted)',
            ),
          );
          return;
        }
        const entries: PlaylistEntry[] = raw.entries.map((e) => ({
          id: e.id ?? '',
          title: e.title ?? '(untitled)',
          url: entryUrl(e),
          duration: e.duration ?? null,
          thumbnail: e.thumbnails?.[0]?.url ?? null,
        }));
        resolve({
          id: raw.id ?? '',
          title: raw.title ?? '(playlist)',
          uploader: raw.uploader ?? null,
          entries,
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
  // Prefer H.264 video + AAC audio for max compatibility with QuickTime/Preview.
  // Without this, yt-dlp may pick AV1/VP9 + Opus which most macOS players can't render.
  const sortPref = ['-S', 'vcodec:h264,acodec:m4a'];
  if (q === 'best') {
    return ['-f', 'bv*+ba/b', '--merge-output-format', 'mp4', ...sortPref];
  }
  return [
    '-f',
    `bv*[height<=${q}]+ba/b[height<=${q}]`,
    '--merge-output-format',
    'mp4',
    ...sortPref,
  ];
}

const activeProcs = new Map<string, ChildProcess>();

export async function startDownload(
  req: DownloadRequest,
  onProgress: (p: DownloadProgress) => void,
): Promise<{ filePath: string }> {
  await mkdir(req.outputDir, { recursive: true });

  const args = [
    ...formatArgsFor(req),
    '-o',
    '%(title)s.%(ext)s',
    '--newline',
    '--no-playlist',
    '--print',
    'after_move:filepath:%(filepath)s',
    req.url,
  ];

  console.log('[ytdlp] cwd:', req.outputDir);
  console.log('[ytdlp] yt-dlp', args.join(' '));

  return new Promise((resolve, reject) => {
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
      reject(err);
    });

    proc.on('close', (code, signal) => {
      activeProcs.delete(req.id);
      console.log(
        `[ytdlp] close code=${code} signal=${signal} finalPath=${finalPath}`,
      );
      if (stderr.trim()) console.log('[ytdlp] stderr:\n' + stderr.trim());
      if (signal === 'SIGTERM') {
        reject(new Error('cancelled'));
        return;
      }
      if (code !== 0) {
        reject(
          new Error(
            stderr.trim().split('\n').slice(-1)[0] ?? `yt-dlp exited ${code}`,
          ),
        );
        return;
      }
      onProgress({ id: req.id, percent: 100, speed: null, eta: null, stage: 'done' });
      resolve({ filePath: finalPath ?? req.outputDir });
    });
  });
}

export function cancelDownload(id: string): boolean {
  const proc = activeProcs.get(id);
  if (!proc) return false;
  proc.kill('SIGTERM');
  activeProcs.delete(id);
  return true;
}
