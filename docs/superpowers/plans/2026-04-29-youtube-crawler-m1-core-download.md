# YouTube Crawler — M1 Core Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first runnable version of the YouTube Crawler desktop app — paste a URL, see metadata, pick format/quality, and download a single video to disk with live progress.

**Architecture:** Electron app with a Node.js main process that spawns `yt-dlp` (and later `ffmpeg`) as child processes, and a React renderer that talks to it through a typed `contextBridge` IPC layer. State for the download queue lives in a Zustand store in the renderer.

**Tech Stack:** Electron 32+, electron-vite, React 18, TypeScript, TailwindCSS, Zustand, react-router-dom. Backend depends on `yt-dlp` and `ffmpeg` installed via Homebrew on the host.

**Out of scope for M1 (deferred to M2/M3):** audio-only conversion, subtitle download, playlist support, configurable settings page, library view. M1 hardcodes output to `~/Downloads/youtube-crawler/` and supports single videos only.

**Testing approach:** The spec explicitly excludes a test framework for MVP. Pure logic (e.g., progress regex parser) gets a small inline self-check during development. UI/IPC/integration is verified manually by running `npm run dev` and downloading a real video at the end.

---

## File Structure

Files created during M1, with their responsibility:

| File | Responsibility |
|---|---|
| `package.json` | Dependencies, scripts |
| `electron.vite.config.ts` | Build config for main / preload / renderer |
| `tsconfig.json`, `tsconfig.node.json` | TypeScript config |
| `tailwind.config.js`, `postcss.config.js` | Tailwind setup |
| `index.html` | Renderer entry HTML |
| `.gitignore` | Standard Node + Electron ignores |
| `src/shared/types.ts` | Types shared by main and renderer (IPC payloads, queue items) |
| `src/main/index.ts` | App lifecycle, BrowserWindow creation |
| `src/main/system-check.ts` | Detect `yt-dlp` and `ffmpeg` binaries |
| `src/main/ytdlp.ts` | Spawn yt-dlp, parse progress, manage child processes |
| `src/main/ipc.ts` | Register IPC handlers; bridge between renderer requests and main logic |
| `src/preload/index.ts` | `contextBridge` — expose typed `window.api` to renderer |
| `src/renderer/main.tsx` | React entry, mount App, import Tailwind CSS |
| `src/renderer/index.css` | Tailwind directives + base styles |
| `src/renderer/App.tsx` | Top-level shell — sidebar nav + content router |
| `src/renderer/lib/ipc.ts` | Typed wrapper around `window.api` for renderer code |
| `src/renderer/store/queue.ts` | Zustand store for the download queue |
| `src/renderer/components/Sidebar.tsx` | Left nav (Queue / Library / Settings — only Queue active in M1) |
| `src/renderer/components/UrlInput.tsx` | Top bar URL input + Add button |
| `src/renderer/components/SystemCheckModal.tsx` | Modal shown when binaries missing |
| `src/renderer/components/DownloadDialog.tsx` | Format/quality picker shown after metadata fetch |
| `src/renderer/components/QueueItem.tsx` | One row in the queue with progress bar |
| `src/renderer/pages/QueuePage.tsx` | Active + completed downloads list |

Files for M2/M3 (Settings, Library, audio, subs, playlist) are intentionally **not** created in this plan.

---

## Task 1: Initialize package and base config

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.nvmrc`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "youtube-crawler",
  "version": "0.1.0",
  "description": "Personal-use YouTube downloader (Electron + React)",
  "main": "out/main/index.js",
  "type": "module",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "typecheck": "tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.node.json"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.2",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.7.4",
    "@types/react": "^18.3.11",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.2",
    "autoprefixer": "^10.4.20",
    "electron": "^32.1.2",
    "electron-vite": "^2.3.0",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.13",
    "typescript": "^5.6.2",
    "vite": "^5.4.8"
  }
}
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
out/
dist/
.DS_Store
*.log
.env*
!.env.example
```

- [ ] **Step 3: Create `.nvmrc`**

```
20
```

- [ ] **Step 4: Install dependencies**

Run: `npm install`
Expected: completes without errors. May take 30-60s. Warnings about peer deps are OK.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .gitignore .nvmrc
git commit -m "chore: initialize package.json with electron + react deps"
```

---

## Task 2: TypeScript and Vite config

**Files:**
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `electron.vite.config.ts`

- [ ] **Step 1: Create `tsconfig.json` (renderer)**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "allowImportingTsExtensions": false,
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["src/shared/*"],
      "@renderer/*": ["src/renderer/*"]
    }
  },
  "include": ["src/renderer/**/*", "src/shared/**/*", "src/preload/**/*"]
}
```

- [ ] **Step 2: Create `tsconfig.node.json` (main process)**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["src/shared/*"]
    }
  },
  "include": ["src/main/**/*", "src/shared/**/*", "electron.vite.config.ts"]
}
```

- [ ] **Step 3: Create `electron.vite.config.ts`**

```typescript
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { outDir: 'out/main' },
    resolve: {
      alias: { '@shared': resolve(__dirname, 'src/shared') },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { outDir: 'out/preload' },
    resolve: {
      alias: { '@shared': resolve(__dirname, 'src/shared') },
    },
  },
  renderer: {
    plugins: [react()],
    build: { outDir: 'out/renderer' },
    root: '.',
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer'),
        '@shared': resolve(__dirname, 'src/shared'),
      },
    },
  },
});
```

- [ ] **Step 4: Verify typecheck still passes (no source files yet, should be no-op)**

Run: `npm run typecheck`
Expected: completes without error.

- [ ] **Step 5: Commit**

```bash
git add tsconfig.json tsconfig.node.json electron.vite.config.ts
git commit -m "chore: add typescript and electron-vite config"
```

---

## Task 3: Tailwind setup

**Files:**
- Create: `tailwind.config.js`
- Create: `postcss.config.js`
- Create: `src/renderer/index.css`
- Create: `index.html`

- [ ] **Step 1: Create `tailwind.config.js`**

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

- [ ] **Step 2: Create `postcss.config.js`**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 3: Create `src/renderer/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html,
body,
#root {
  height: 100%;
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue',
    sans-serif;
}
```

- [ ] **Step 4: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>YouTube Crawler</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/renderer/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Commit**

```bash
git add tailwind.config.js postcss.config.js src/renderer/index.css index.html
git commit -m "chore: add tailwind and renderer html entry"
```

---

## Task 4: Shared types

**Files:**
- Create: `src/shared/types.ts`

- [ ] **Step 1: Create `src/shared/types.ts`**

```typescript
export type DownloadStage =
  | 'pending'
  | 'fetching_metadata'
  | 'ready'
  | 'downloading'
  | 'done'
  | 'error'
  | 'cancelled';

export interface VideoFormat {
  formatId: string;
  ext: string;
  resolution: string | null;
  fps: number | null;
  vcodec: string | null;
  acodec: string | null;
  filesize: number | null;
  note: string | null;
}

export interface VideoMetadata {
  id: string;
  title: string;
  duration: number | null;
  thumbnail: string | null;
  uploader: string | null;
  formats: VideoFormat[];
  isPlaylist: boolean;
}

export type DownloadFormatChoice =
  | { kind: 'video'; quality: '1080' | '720' | '480' | 'best' }
  | { kind: 'audio'; quality: 'best' };

export interface DownloadRequest {
  id: string;
  url: string;
  format: DownloadFormatChoice;
  outputDir: string;
}

export interface DownloadProgress {
  id: string;
  percent: number;
  speed: string | null;
  eta: string | null;
  stage: DownloadStage;
}

export interface DownloadResult {
  id: string;
  filePath: string;
  metadata: VideoMetadata;
}

export interface DownloadError {
  id: string;
  message: string;
  stderr?: string;
}

export interface SystemCheckResult {
  ytdlp: { installed: boolean; version: string | null };
  ffmpeg: { installed: boolean; version: string | null };
}

export interface RendererApi {
  systemCheck(): Promise<SystemCheckResult>;
  fetchMetadata(url: string): Promise<VideoMetadata>;
  startDownload(req: DownloadRequest): Promise<void>;
  cancelDownload(id: string): Promise<void>;
  onProgress(handler: (p: DownloadProgress) => void): () => void;
  onDone(handler: (r: DownloadResult) => void): () => void;
  onError(handler: (e: DownloadError) => void): () => void;
}

declare global {
  interface Window {
    api: RendererApi;
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: define shared IPC types"
```

---

## Task 5: System check (main process)

**Files:**
- Create: `src/main/system-check.ts`

- [ ] **Step 1: Create `src/main/system-check.ts`**

```typescript
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
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/main/system-check.ts
git commit -m "feat(main): system check for yt-dlp and ffmpeg"
```

---

## Task 6: yt-dlp wrapper — metadata fetch

**Files:**
- Create: `src/main/ytdlp.ts`

- [ ] **Step 1: Create `src/main/ytdlp.ts` with metadata fetch only (download added in Task 7)**

```typescript
import { spawn } from 'node:child_process';
import type { VideoMetadata, VideoFormat } from '@shared/types';

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
        // For playlists yt-dlp emits one JSON object per line; M1 takes the first.
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
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/main/ytdlp.ts
git commit -m "feat(main): yt-dlp metadata fetch"
```

---

## Task 7: yt-dlp wrapper — download with progress parsing

**Files:**
- Modify: `src/main/ytdlp.ts`

- [ ] **Step 1: Append progress parser and download function to `src/main/ytdlp.ts`**

Add the following imports at the top of the file (replace the existing import line):

```typescript
import { spawn, ChildProcess } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import type {
  VideoMetadata,
  VideoFormat,
  DownloadRequest,
  DownloadProgress,
} from '@shared/types';
```

Append at the bottom of the file:

```typescript
// Match lines like: "[download]  45.2% of 50.00MiB at  2.10MiB/s ETA 00:12"
// or "[download]  45.2% of ~50.00MiB at  2.10MiB/s ETA 00:12"
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
  // M1 supports video only. Audio support arrives in M2.
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
    '--no-warnings',
    '--print',
    'after_move:filepath:%(filepath)s',
    req.url,
  ];

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
    if (signal === 'SIGTERM') return; // cancelled, handler not called
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
```

- [ ] **Step 2: Self-check the regex parser inline**

Create a temporary file `/tmp/check-progress.mjs`:

```javascript
import { parseProgressLine } from './out/main/ytdlp.js';
// quick smoke
const samples = [
  '[download]  45.2% of 50.00MiB at  2.10MiB/s ETA 00:12',
  '[download]   0.0% of ~12.34MiB at Unknown B/s ETA Unknown',
  'random other line',
];
for (const s of samples) console.log(JSON.stringify(parseProgressLine(s)));
```

(This file is not committed. It's a one-time sanity check; skip if obvious from reading.)

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/main/ytdlp.ts
git commit -m "feat(main): yt-dlp download with progress parsing and cancel"
```

---

## Task 8: IPC handler registration

**Files:**
- Create: `src/main/ipc.ts`

- [ ] **Step 1: Create `src/main/ipc.ts`**

```typescript
import { ipcMain, BrowserWindow } from 'electron';
import { systemCheck } from './system-check.js';
import { fetchMetadata, startDownload, cancelDownload } from './ytdlp.js';
import type { DownloadRequest } from '@shared/types';

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('system:check', () => systemCheck());

  ipcMain.handle('metadata:fetch', (_e, url: string) => fetchMetadata(url));

  ipcMain.handle('download:start', async (_e, req: DownloadRequest) => {
    await startDownload(
      req,
      (progress) => getWindow()?.webContents.send('download:progress', progress),
      (filePath) =>
        getWindow()?.webContents.send('download:done', {
          id: req.id,
          filePath,
          metadata: null,
        }),
      (err, stderr) =>
        getWindow()?.webContents.send('download:error', {
          id: req.id,
          message: err.message,
          stderr,
        }),
    );
  });

  ipcMain.handle('download:cancel', (_e, id: string) => cancelDownload(id));
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc.ts
git commit -m "feat(main): register IPC handlers"
```

---

## Task 9: Electron main entry

**Files:**
- Create: `src/main/index.ts`

- [ ] **Step 1: Create `src/main/index.ts`**

```typescript
import { app, BrowserWindow, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { registerIpc } from './ipc.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  registerIpc(() => mainWindow);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/main/index.ts
git commit -m "feat(main): electron app entry point"
```

---

## Task 10: Preload bridge

**Files:**
- Create: `src/preload/index.ts`

- [ ] **Step 1: Create `src/preload/index.ts`**

```typescript
import { contextBridge, ipcRenderer } from 'electron';
import type {
  RendererApi,
  DownloadProgress,
  DownloadResult,
  DownloadError,
} from '@shared/types';

const api: RendererApi = {
  systemCheck: () => ipcRenderer.invoke('system:check'),
  fetchMetadata: (url) => ipcRenderer.invoke('metadata:fetch', url),
  startDownload: (req) => ipcRenderer.invoke('download:start', req),
  cancelDownload: (id) => ipcRenderer.invoke('download:cancel', id),
  onProgress: (handler) => {
    const listener = (_e: unknown, p: DownloadProgress) => handler(p);
    ipcRenderer.on('download:progress', listener);
    return () => ipcRenderer.off('download:progress', listener);
  },
  onDone: (handler) => {
    const listener = (_e: unknown, r: DownloadResult) => handler(r);
    ipcRenderer.on('download:done', listener);
    return () => ipcRenderer.off('download:done', listener);
  },
  onError: (handler) => {
    const listener = (_e: unknown, err: DownloadError) => handler(err);
    ipcRenderer.on('download:error', listener);
    return () => ipcRenderer.off('download:error', listener);
  },
};

contextBridge.exposeInMainWorld('api', api);
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/preload/index.ts
git commit -m "feat(preload): contextBridge api"
```

---

## Task 11: Renderer entry and Tailwind smoke test

**Files:**
- Create: `src/renderer/main.tsx`
- Create: `src/renderer/App.tsx`

- [ ] **Step 1: Create `src/renderer/main.tsx`**

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 2: Create minimal `src/renderer/App.tsx` (placeholder; expanded in later tasks)**

```typescript
export function App(): JSX.Element {
  return (
    <div className="h-full flex items-center justify-center bg-gray-50 text-gray-800">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">YouTube Crawler</h1>
        <p className="text-sm text-gray-500 mt-2">Renderer is alive.</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Smoke test the dev server**

Run: `npm run dev`

Expected: Electron window opens showing "YouTube Crawler / Renderer is alive." with Tailwind styles applied. DevTools open in detached window. Quit with Cmd+Q.

If the window is blank: check the DevTools console for errors. Common cause: a typo in the preload path (`out/preload/index.js`) — confirm `electron-vite dev` printed both `main` and `preload` builds.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/main.tsx src/renderer/App.tsx
git commit -m "feat(renderer): minimal app shell"
```

---

## Task 12: Renderer IPC wrapper

**Files:**
- Create: `src/renderer/lib/ipc.ts`

- [ ] **Step 1: Create `src/renderer/lib/ipc.ts`**

```typescript
import type { RendererApi } from '@shared/types';

export const api: RendererApi = window.api;
```

This indirection lets us mock `api` in tests later if we add them, and keeps `window.api` access in one place.

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/lib/ipc.ts
git commit -m "feat(renderer): typed ipc wrapper"
```

---

## Task 13: Queue store (Zustand)

**Files:**
- Create: `src/renderer/store/queue.ts`

- [ ] **Step 1: Create `src/renderer/store/queue.ts`**

```typescript
import { create } from 'zustand';
import type {
  DownloadStage,
  VideoMetadata,
  DownloadFormatChoice,
} from '@shared/types';

export interface QueueItem {
  id: string;
  url: string;
  metadata: VideoMetadata | null;
  format: DownloadFormatChoice | null;
  stage: DownloadStage;
  percent: number;
  speed: string | null;
  eta: string | null;
  filePath: string | null;
  errorMessage: string | null;
}

interface QueueState {
  items: QueueItem[];
  add(partial: Pick<QueueItem, 'id' | 'url'>): void;
  patch(id: string, patch: Partial<QueueItem>): void;
  remove(id: string): void;
}

export const useQueue = create<QueueState>((set) => ({
  items: [],
  add: (partial) =>
    set((s) => ({
      items: [
        ...s.items,
        {
          metadata: null,
          format: null,
          stage: 'pending',
          percent: 0,
          speed: null,
          eta: null,
          filePath: null,
          errorMessage: null,
          ...partial,
        },
      ],
    })),
  patch: (id, patch) =>
    set((s) => ({
      items: s.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    })),
  remove: (id) =>
    set((s) => ({ items: s.items.filter((it) => it.id !== id) })),
}));
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/store/queue.ts
git commit -m "feat(renderer): zustand queue store"
```

---

## Task 14: System check modal

**Files:**
- Create: `src/renderer/components/SystemCheckModal.tsx`

- [ ] **Step 1: Create `src/renderer/components/SystemCheckModal.tsx`**

```typescript
import type { SystemCheckResult } from '@shared/types';

interface Props {
  result: SystemCheckResult;
  onRetry(): void;
}

export function SystemCheckModal({ result, onRetry }: Props): JSX.Element {
  const missing: string[] = [];
  if (!result.ytdlp.installed) missing.push('yt-dlp');
  if (!result.ffmpeg.installed) missing.push('ffmpeg');

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <h2 className="text-lg font-semibold text-gray-900">Missing dependencies</h2>
        <p className="text-sm text-gray-600 mt-2">
          The following tools are required but not found on your system:{' '}
          <span className="font-mono text-red-600">{missing.join(', ')}</span>.
        </p>
        <p className="text-sm text-gray-700 mt-4">Install with Homebrew:</p>
        <pre className="mt-2 bg-gray-900 text-gray-100 rounded p-3 text-xs">
          brew install {missing.join(' ')}
        </pre>
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 w-full bg-gray-900 text-white rounded py-2 text-sm hover:bg-gray-800"
        >
          I&apos;ve installed them — re-check
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/SystemCheckModal.tsx
git commit -m "feat(renderer): system check modal"
```

---

## Task 15: Sidebar component

**Files:**
- Create: `src/renderer/components/Sidebar.tsx`

- [ ] **Step 1: Create `src/renderer/components/Sidebar.tsx`**

```typescript
interface Props {
  active: 'queue';
}

export function Sidebar({ active }: Props): JSX.Element {
  const items: { key: 'queue'; label: string; icon: string; enabled: boolean }[] = [
    { key: 'queue', label: 'Queue', icon: '📥', enabled: true },
  ];
  // Library and Settings are intentionally not rendered in M1.

  return (
    <aside className="w-44 shrink-0 border-r border-gray-200 bg-gray-50 pt-12">
      <nav className="px-2 space-y-1">
        {items.map((item) => (
          <div
            key={item.key}
            className={`flex items-center gap-2 px-3 py-2 rounded text-sm ${
              active === item.key
                ? 'bg-gray-200 text-gray-900'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </div>
        ))}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/Sidebar.tsx
git commit -m "feat(renderer): sidebar component"
```

---

## Task 16: URL input + DownloadDialog

**Files:**
- Create: `src/renderer/components/UrlInput.tsx`
- Create: `src/renderer/components/DownloadDialog.tsx`

- [ ] **Step 1: Create `src/renderer/components/DownloadDialog.tsx`**

```typescript
import { useState } from 'react';
import type { VideoMetadata, DownloadFormatChoice } from '@shared/types';

interface Props {
  metadata: VideoMetadata;
  onConfirm(format: DownloadFormatChoice): void;
  onCancel(): void;
}

const QUALITIES: Array<DownloadFormatChoice & { kind: 'video' }> = [
  { kind: 'video', quality: 'best' },
  { kind: 'video', quality: '1080' },
  { kind: 'video', quality: '720' },
  { kind: 'video', quality: '480' },
];

function formatDuration(seconds: number | null): string {
  if (seconds == null) return 'Unknown';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function DownloadDialog({ metadata, onConfirm, onCancel }: Props): JSX.Element {
  const [quality, setQuality] = useState<'best' | '1080' | '720' | '480'>('1080');

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
        <div className="flex gap-4">
          {metadata.thumbnail && (
            <img
              src={metadata.thumbnail}
              alt=""
              className="w-32 h-20 object-cover rounded bg-gray-100"
            />
          )}
          <div className="flex-1 min-w-0">
            <h2
              className="text-base font-semibold text-gray-900 truncate"
              title={metadata.title}
            >
              {metadata.title}
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              {metadata.uploader ?? 'Unknown uploader'} ·{' '}
              {formatDuration(metadata.duration)}
            </p>
          </div>
        </div>

        <div className="mt-5">
          <label className="block text-xs font-medium text-gray-700 mb-2">
            Quality
          </label>
          <div className="flex gap-2">
            {QUALITIES.map((opt) => (
              <button
                key={opt.quality}
                type="button"
                onClick={() => setQuality(opt.quality)}
                className={`px-3 py-1.5 rounded text-sm border ${
                  quality === opt.quality
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {opt.quality === 'best' ? 'Best' : `${opt.quality}p`}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-1.5 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm({ kind: 'video', quality })}
            className="px-4 py-1.5 text-sm rounded bg-gray-900 text-white hover:bg-gray-800"
          >
            Download
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/renderer/components/UrlInput.tsx`**

```typescript
import { useState } from 'react';

interface Props {
  onSubmit(url: string): void;
  busy: boolean;
}

export function UrlInput({ onSubmit, busy }: Props): JSX.Element {
  const [value, setValue] = useState('');

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue('');
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex gap-2 px-4 py-3 border-b border-gray-200 bg-white pt-12"
    >
      <input
        type="url"
        placeholder="Paste a YouTube URL..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={busy}
        className="flex-1 border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
      />
      <button
        type="submit"
        disabled={busy || !value.trim()}
        className="px-4 py-1.5 text-sm rounded bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {busy ? 'Loading...' : '+ Add'}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/UrlInput.tsx src/renderer/components/DownloadDialog.tsx
git commit -m "feat(renderer): url input and download dialog"
```

---

## Task 17: Queue item + Queue page

**Files:**
- Create: `src/renderer/components/QueueItem.tsx`
- Create: `src/renderer/pages/QueuePage.tsx`

- [ ] **Step 1: Create `src/renderer/components/QueueItem.tsx`**

```typescript
import type { QueueItem as Item } from '@renderer/store/queue';

interface Props {
  item: Item;
  onCancel(id: string): void;
  onRemove(id: string): void;
}

function stageLabel(stage: Item['stage']): string {
  switch (stage) {
    case 'pending':
      return 'Pending';
    case 'fetching_metadata':
      return 'Fetching metadata...';
    case 'ready':
      return 'Ready';
    case 'downloading':
      return 'Downloading';
    case 'done':
      return 'Done';
    case 'cancelled':
      return 'Cancelled';
    case 'error':
      return 'Error';
  }
}

export function QueueItem({ item, onCancel, onRemove }: Props): JSX.Element {
  const isActive = item.stage === 'downloading' || item.stage === 'fetching_metadata';
  const isFinal =
    item.stage === 'done' || item.stage === 'cancelled' || item.stage === 'error';
  return (
    <div className="border-b border-gray-200 px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div
            className="text-sm font-medium text-gray-900 truncate"
            title={item.metadata?.title ?? item.url}
          >
            {item.metadata?.title ?? item.url}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {stageLabel(item.stage)}
            {item.stage === 'downloading' && (
              <>
                {' · '}
                {item.percent.toFixed(1)}%
                {item.speed && ` · ${item.speed}`}
                {item.eta && ` · ETA ${item.eta}`}
              </>
            )}
          </div>
          {item.errorMessage && (
            <div className="text-xs text-red-600 mt-1">{item.errorMessage}</div>
          )}
          {(isActive || item.stage === 'done') && (
            <div className="mt-2 h-1 bg-gray-200 rounded overflow-hidden">
              <div
                className={`h-full ${
                  item.stage === 'done' ? 'bg-green-500' : 'bg-gray-900'
                }`}
                style={{ width: `${item.percent}%` }}
              />
            </div>
          )}
          {item.filePath && (
            <div
              className="text-xs text-gray-500 mt-1 truncate font-mono"
              title={item.filePath}
            >
              {item.filePath}
            </div>
          )}
        </div>
        <div className="shrink-0">
          {isActive ? (
            <button
              type="button"
              onClick={() => onCancel(item.id)}
              className="text-xs text-gray-500 hover:text-red-600"
            >
              Cancel
            </button>
          ) : isFinal ? (
            <button
              type="button"
              onClick={() => onRemove(item.id)}
              className="text-xs text-gray-500 hover:text-gray-900"
            >
              Remove
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/renderer/pages/QueuePage.tsx`**

```typescript
import { useQueue } from '@renderer/store/queue';
import { api } from '@renderer/lib/ipc';
import { QueueItem } from '@renderer/components/QueueItem';

export function QueuePage(): JSX.Element {
  const items = useQueue((s) => s.items);
  const remove = useQueue((s) => s.remove);

  if (items.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
        Paste a YouTube URL above to get started.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {items.map((item) => (
        <QueueItem
          key={item.id}
          item={item}
          onCancel={(id) => api.cancelDownload(id)}
          onRemove={remove}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/QueueItem.tsx src/renderer/pages/QueuePage.tsx
git commit -m "feat(renderer): queue item and page"
```

---

## Task 18: Wire up App with full flow

**Files:**
- Modify: `src/renderer/App.tsx` (full rewrite)

- [ ] **Step 1: Replace `src/renderer/App.tsx` with the full app shell**

The renderer cannot read `$HOME` directly, so we go through `window.api.homeDir()` (added to the preload in Task 19; this commit will fail typecheck until then — that's intentional and the next task fixes it).

```typescript
import { useEffect, useRef, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { UrlInput } from './components/UrlInput';
import { DownloadDialog } from './components/DownloadDialog';
import { SystemCheckModal } from './components/SystemCheckModal';
import { QueuePage } from './pages/QueuePage';
import { useQueue } from './store/queue';
import { api } from './lib/ipc';
import type {
  SystemCheckResult,
  VideoMetadata,
  DownloadFormatChoice,
} from '@shared/types';

// M1 hardcodes the output folder via a tilde path. The main process (ytdlp.startDownload)
// expands it via `mkdir -p` after we resolve `~` here. We rely on the preload to expose
// $HOME — see Task 19 for the preload addition.
function expandHome(p: string): string {
  if (!p.startsWith('~')) return p;
  const home = window.api.homeDir();
  return home + p.slice(1);
}

const DEFAULT_OUTPUT_DIR = '~/Downloads/youtube-crawler';

export function App(): JSX.Element {
  const [systemReady, setSystemReady] = useState<SystemCheckResult | null>(null);
  const [pendingMeta, setPendingMeta] = useState<VideoMetadata | null>(null);
  const [busy, setBusy] = useState(false);
  const pendingId = useRef<string | null>(null);

  const add = useQueue((s) => s.add);
  const patch = useQueue((s) => s.patch);

  useEffect(() => {
    api.systemCheck().then(setSystemReady);
  }, []);

  useEffect(() => {
    const offProgress = api.onProgress((p) => patch(p.id, p));
    const offDone = api.onDone((r) =>
      patch(r.id, { stage: 'done', percent: 100, filePath: r.filePath }),
    );
    const offError = api.onError((e) =>
      patch(e.id, { stage: 'error', errorMessage: e.message }),
    );
    return () => {
      offProgress();
      offDone();
      offError();
    };
  }, [patch]);

  async function handleAddUrl(url: string): Promise<void> {
    setBusy(true);
    const id = crypto.randomUUID();
    add({ id, url });
    patch(id, { stage: 'fetching_metadata' });
    pendingId.current = id;
    try {
      const meta = await api.fetchMetadata(url);
      patch(id, { metadata: meta, stage: 'ready' });
      setPendingMeta(meta);
    } catch (err) {
      patch(id, {
        stage: 'error',
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      pendingId.current = null;
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm(format: DownloadFormatChoice): Promise<void> {
    const id = pendingId.current;
    const meta = pendingMeta;
    pendingId.current = null;
    setPendingMeta(null);
    if (!id || !meta) return;
    patch(id, { format, stage: 'downloading', percent: 0 });
    try {
      await api.startDownload({
        id,
        url: meta.id ? `https://www.youtube.com/watch?v=${meta.id}` : '',
        format,
        outputDir: expandHome(DEFAULT_OUTPUT_DIR),
      });
    } catch (err) {
      patch(id, {
        stage: 'error',
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function handleCancelDialog(): void {
    const id = pendingId.current;
    pendingId.current = null;
    setPendingMeta(null);
    if (id) patch(id, { stage: 'cancelled' });
  }

  const needsSetup =
    systemReady && (!systemReady.ytdlp.installed || !systemReady.ffmpeg.installed);

  return (
    <div className="h-full flex bg-white">
      <Sidebar active="queue" />
      <div className="flex-1 flex flex-col">
        <UrlInput onSubmit={handleAddUrl} busy={busy} />
        <QueuePage />
      </div>
      {needsSetup && (
        <SystemCheckModal
          result={systemReady!}
          onRetry={() => api.systemCheck().then(setSystemReady)}
        />
      )}
      {pendingMeta && (
        <DownloadDialog
          metadata={pendingMeta}
          onConfirm={handleConfirm}
          onCancel={handleCancelDialog}
        />
      )}
    </div>
  );
}
```

Note the `window.api.homeDir()` call. Task 19 adds it to the preload and main process.

- [ ] **Step 2: Commit (will fail typecheck until Task 19 — that is intentional)**

```bash
git add src/renderer/App.tsx
git commit -m "feat(renderer): wire up full download flow"
```

---

## Task 19: Add `homeDir` to preload + IPC

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add `homeDir` to `RendererApi` in `src/shared/types.ts`**

Find the `RendererApi` interface and add a new method. Replace the interface with:

```typescript
export interface RendererApi {
  systemCheck(): Promise<SystemCheckResult>;
  fetchMetadata(url: string): Promise<VideoMetadata>;
  startDownload(req: DownloadRequest): Promise<void>;
  cancelDownload(id: string): Promise<void>;
  homeDir(): string;
  onProgress(handler: (p: DownloadProgress) => void): () => void;
  onDone(handler: (r: DownloadResult) => void): () => void;
  onError(handler: (e: DownloadError) => void): () => void;
}
```

- [ ] **Step 2: Update `src/preload/index.ts` to expose `homeDir`**

Replace the `api` object's first property block. Add the import and the method:

```typescript
import { contextBridge, ipcRenderer } from 'electron';
import { homedir } from 'node:os';
import type {
  RendererApi,
  DownloadProgress,
  DownloadResult,
  DownloadError,
} from '@shared/types';

const api: RendererApi = {
  systemCheck: () => ipcRenderer.invoke('system:check'),
  fetchMetadata: (url) => ipcRenderer.invoke('metadata:fetch', url),
  startDownload: (req) => ipcRenderer.invoke('download:start', req),
  cancelDownload: (id) => ipcRenderer.invoke('download:cancel', id),
  homeDir: () => homedir(),
  onProgress: (handler) => {
    const listener = (_e: unknown, p: DownloadProgress) => handler(p);
    ipcRenderer.on('download:progress', listener);
    return () => ipcRenderer.off('download:progress', listener);
  },
  onDone: (handler) => {
    const listener = (_e: unknown, r: DownloadResult) => handler(r);
    ipcRenderer.on('download:done', listener);
    return () => ipcRenderer.off('download:done', listener);
  },
  onError: (handler) => {
    const listener = (_e: unknown, err: DownloadError) => handler(err);
    ipcRenderer.on('download:error', listener);
    return () => ipcRenderer.off('download:error', listener);
  },
};

contextBridge.exposeInMainWorld('api', api);
```

Note: `node:os` is available in the preload because we set `sandbox: false` in `BrowserWindow` config.

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/shared/types.ts src/preload/index.ts
git commit -m "feat: expose homeDir from preload"
```

---

## Task 20: End-to-end smoke test

This is the validation step — actually run the app and download a video.

**Pre-req:** Make sure `yt-dlp` and `ffmpeg` are installed.

```bash
which yt-dlp && which ffmpeg
```

If either is missing:

```bash
brew install yt-dlp ffmpeg
```

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: Electron window opens. No SystemCheckModal (because both binaries exist).

- [ ] **Step 2: Paste a short test URL**

Use a short, public, non-restricted video like a Creative Commons test clip. For example, search YouTube for a clip under 1 minute and copy its URL.

Paste into the input → click Add.

Expected:
- The queue shows a row with "Fetching metadata..."
- Within ~3-5 seconds, the DownloadDialog appears with thumbnail, title, uploader.

- [ ] **Step 3: Confirm download**

Pick `720p` (or `Best`) → click Download.

Expected:
- DownloadDialog closes.
- Queue row shows live progress: percent + speed + ETA, progress bar growing.
- When complete, the bar turns green, stage shows "Done", and a file path appears.

- [ ] **Step 4: Verify the file on disk**

Run: `ls -la ~/Downloads/youtube-crawler/`
Expected: An `.mp4` file with the video's title, sized roughly as expected for the chosen quality.

Open the file with QuickLook or VLC to confirm it plays.

- [ ] **Step 5: Test error path**

Paste an obviously invalid URL: `https://www.youtube.com/watch?v=INVALID_VIDEO_ID_XYZ`.

Expected: After metadata fetch fails, the row stage flips to "Error" with a red error message (something like "Video unavailable").

- [ ] **Step 6: Test cancel**

Start downloading a longer video → click Cancel mid-download.

Expected: The yt-dlp process is killed, stage flips to "Cancelled", no further progress is emitted.

- [ ] **Step 7: Update README with quickstart**

Create `README.md` at the project root:

```markdown
# YouTube Crawler

Personal-use macOS desktop app for downloading YouTube videos.

## Requirements

- Node.js 20+
- `yt-dlp` and `ffmpeg` installed via Homebrew:

  ```bash
  brew install yt-dlp ffmpeg
  ```

## Development

```bash
npm install
npm run dev
```

## Status

M1 (core download) — complete. Single video downloads to `~/Downloads/youtube-crawler/`.

Roadmap: M2 (audio, subtitles, playlists, settings), M3 (library view).

See `docs/superpowers/specs/2026-04-29-youtube-crawler-design.md` for the full design.
```

- [ ] **Step 8: Final commit**

```bash
git add README.md
git commit -m "docs: add quickstart README"
```

---

## Definition of Done for M1

- [ ] App launches via `npm run dev` with no errors in main or renderer console.
- [ ] System check modal appears when `yt-dlp` or `ffmpeg` is uninstalled, disappears when both present.
- [ ] Pasting a single-video URL fetches metadata and shows the download dialog.
- [ ] Selecting a quality and clicking Download produces a valid `.mp4` in `~/Downloads/youtube-crawler/`.
- [ ] Live progress (percent, speed, ETA) updates during download.
- [ ] Cancel button kills the yt-dlp process and updates the row.
- [ ] An invalid URL surfaces a readable error in the queue row.
- [ ] All 19 commits are present in git history.

---

## Self-Review (performed during plan authoring)

**Spec coverage:**
- Architecture (Electron main + React renderer + yt-dlp child process) → Tasks 1-2, 5-10
- IPC contract (system:check, metadata:fetch, download:start/cancel/progress/done/error) → Tasks 4, 8, 10
- Pre-flight system check + install modal → Tasks 5, 14
- URL input + metadata + download dialog → Tasks 16, 18
- Queue page with live progress → Tasks 13, 17, 18
- Default output `~/Downloads/youtube-crawler/` → Task 18 + 19
- Error categories (setup, network, video, disk) → Task 18 (error display) + Task 7 (parse + propagate)
- File system layout — only `~/Downloads/youtube-crawler/` is created in M1; library.json and settings.json are M2/M3 — consistent with the deferred scope above.
- Project structure → matches Task table at top
- M1 milestone scope (single video, no audio, no subs, no playlist, hardcoded output) → respected throughout

**Placeholder scan:** Each step contains the actual code or command. No "TBD" / "fill in later" patterns.

**Type consistency:** Verified that `RendererApi`, `QueueItem`, `DownloadFormatChoice`, and IPC channel names are used consistently across all tasks. `homeDir()` was missing from the initial `RendererApi` definition in Task 4 and is added in Task 19 — this ordering is intentional (the renderer code in Task 18 forces the addition).

**Audio note:** `formatArgsFor` in Task 7 throws for `kind === 'audio'` to make M2 scope explicit and prevent silent breakage if someone wires it up early.
