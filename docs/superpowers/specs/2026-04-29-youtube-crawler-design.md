# YouTube Crawler — Design Spec

**Date:** 2026-04-29
**Status:** Approved (ready for implementation plan)

## Purpose

A personal-use macOS desktop app for downloading YouTube videos, audio, subtitles, and playlists. Single-user, single-machine, no auth, no cloud sync. Built to support a mix of use cases: language learning, archival, research/transcript extraction, and offline listening.

## Goals & Non-Goals

**Goals:**
- Reliable downloads of video, audio, subtitles, and playlists from YouTube.
- Simple desktop UI runnable as a `.app` on macOS.
- Personal library of downloaded content with metadata and search.

**Non-Goals (YAGNI):**
- Multi-user, accounts, or cloud sync.
- Cross-platform support (Windows/Linux not in scope; Electron leaves the door open if needed later).
- Auto-update, code signing, notarization.
- Translation of subtitles in MVP (deferred — may add DeepL/OpenAI integration later).
- Self-contained binary distribution. App depends on `yt-dlp` and `ffmpeg` installed on the host (via Homebrew).

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Electron App                                    │
│                                                  │
│  ┌──────────────────┐   IPC   ┌──────────────┐  │
│  │  Renderer (UI)   │ ◄─────► │ Main Process │  │
│  │  React + Vite    │         │  Node.js     │  │
│  └──────────────────┘         └──────┬───────┘  │
│                                      │           │
│                                      │ spawn     │
│                                      ▼           │
│                            ┌─────────────────┐  │
│                            │ yt-dlp + ffmpeg │  │
│                            │ (host binaries) │  │
│                            └─────────────────┘  │
└─────────────────────────────────────────────────┘
```

- **Main process (Node.js):** spawns `yt-dlp`/`ffmpeg` via `child_process`, parses stdout for progress, manages file system, persists library/settings.
- **Renderer (React):** UI, download queue state, calls main via typed IPC bridge.
- **Pre-flight check:** on launch, run `which yt-dlp` and `which ffmpeg`. If either is missing, show a modal with `brew install yt-dlp ffmpeg` instructions and disable downloads until resolved.

## Tech Stack

- Electron + electron-vite (modern template, fast HMR)
- React + TypeScript
- TailwindCSS (utility-first, fast iteration)
- Zustand (lightweight state for the download queue)
- React Router (3 main pages: Queue, Library, Settings)
- electron-builder (packaging into `.app`)

**Excluded for MVP:** test framework, i18n, auto-update, database. JSON files on disk are sufficient persistence.

## UI & Features

**Layout:** single window, sidebar nav (left) + content area (right).

```
┌──────────────────────────────────────────────────┐
│ [URL Input.....................] [+ Add to queue]│
├──────────┬───────────────────────────────────────┤
│ 📥 Queue │  Active downloads with progress bars  │
│ 📚 Library│                                       │
│ ⚙️  Settings│  Completed list                     │
└──────────┴───────────────────────────────────────┘
```

**Standard flow:**
1. User pastes URL (single video or playlist) → clicks Add.
2. App fetches metadata via `yt-dlp --dump-json` → opens a download dialog showing:
   - Title, thumbnail, duration.
   - Format choice: `Video (mp4)` / `Audio only (mp3)` / `Video + sub` / `Sub only`.
   - Quality: 1080p / 720p / 480p / best.
   - Subtitle languages (multi-select, populated from yt-dlp's subtitle list).
   - Playlist: option `Download all` / `Select videos`.
3. User confirms → item added to queue.
4. Queue processes serially (1 download at a time by default to avoid YouTube rate-limiting; concurrency configurable in Settings).

### Pages

**📥 Queue** — active and pending downloads
- Progress bar parsed from yt-dlp stdout (e.g., `[download] 45.2% of 50MB at 2MiB/s`).
- Shows speed, ETA, cancel button.
- On failure: error message + retry button.

**📚 Library** — completed downloads
- Grid view with thumbnails.
- Click an item → reveal in Finder, or preview subtitle in app.
- Search/filter by title.
- Metadata persisted in `library.json`.

**⚙️ Settings**
- Output folder (default `~/Downloads/youtube-crawler/`, configurable).
- Default video quality.
- Default subtitle languages.
- Filename template (default `%(title)s.%(ext)s`, yt-dlp template syntax).
- Concurrent downloads limit (default 1).

## IPC Contract

| Channel | Direction | Payload |
|---|---|---|
| `metadata:fetch` | R → M | `{ url }` → `{ title, duration, thumbnail, formats[], subtitles[], isPlaylist, entries[] }` |
| `download:start` | R → M | `{ id, url, format, quality, subLangs[], outputDir }` |
| `download:cancel` | R → M | `{ id }` |
| `download:progress` | M → R | `{ id, percent, speed, eta, stage }` (streamed) |
| `download:done` | M → R | `{ id, filePath, metadata }` |
| `download:error` | M → R | `{ id, message, stderr }` |
| `system:check` | R → M | `{}` → `{ ytdlp: bool, ffmpeg: bool, versions }` |

Renderer accesses these only through a `contextBridge`-exposed typed wrapper (`window.api`); no `nodeIntegration` in the renderer.

## Queue State Machine (per item)

```
pending → fetching_metadata → ready → downloading → done
                                  ↓        ↓
                                error    cancelled
                                  ↓
                                retry → ready
```

**Progress parsing:** main process parses yt-dlp stdout line-by-line with a regex, throttles IPC progress emits to ~5/sec to avoid spamming the renderer.

## Error Handling

| Category | Handling |
|---|---|
| Setup error (yt-dlp/ffmpeg missing) | Modal with brew install instructions, disable downloads |
| Network error (timeout, DNS) | Auto-retry 3× with exponential backoff |
| Video error (private, deleted, age-restricted) | Show error message, no retry |
| Disk error (no space, no write permission) | Show error + suggest changing output folder |

## File System Layout

```
~/Library/Application Support/youtube-crawler/
├── library.json          ← metadata of all downloaded files
├── settings.json         ← user settings
└── logs/
    └── yt-dlp-<date>.log

~/Downloads/youtube-crawler/   ← default output folder, configurable
├── <video-title>.mp4
├── <video-title>.en.srt
└── <video-title>.vi.srt
```

## Project Structure

```
youtube-crawler/
├── package.json
├── electron.vite.config.ts
├── electron-builder.yml
├── src/
│   ├── main/                     ← Electron main process
│   │   ├── index.ts              ← app lifecycle, window creation
│   │   ├── ipc.ts                ← register IPC handlers
│   │   ├── ytdlp.ts              ← spawn yt-dlp, parse progress
│   │   ├── system-check.ts       ← detect binaries
│   │   ├── library.ts            ← read/write library.json
│   │   └── settings.ts           ← read/write settings.json
│   ├── preload/
│   │   └── index.ts              ← contextBridge expose IPC API
│   ├── renderer/                 ← React app
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── store/
│   │   │   ├── queue.ts          ← Zustand: download queue state
│   │   │   └── settings.ts
│   │   ├── components/
│   │   │   ├── UrlInput.tsx
│   │   │   ├── DownloadDialog.tsx
│   │   │   ├── QueueItem.tsx
│   │   │   ├── LibraryGrid.tsx
│   │   │   └── SettingsPanel.tsx
│   │   ├── pages/
│   │   │   ├── QueuePage.tsx
│   │   │   ├── LibraryPage.tsx
│   │   │   └── SettingsPage.tsx
│   │   └── lib/
│   │       └── ipc.ts            ← typed wrapper around window.api
│   └── shared/
│       └── types.ts              ← types shared main ↔ renderer
└── docs/
    └── superpowers/specs/
        └── 2026-04-29-youtube-crawler-design.md
```

## Milestones

**M1 — Core download (start here):**
- Scaffold Electron + React + Tailwind project.
- System check for yt-dlp/ffmpeg with install modal.
- URL input → metadata fetch → download dialog.
- Queue page with live progress.
- Single video download (no playlist yet).
- Hardcoded output to `~/Downloads/youtube-crawler/`.

**M2 — Full features:**
- Audio-only (mp3 via ffmpeg).
- Subtitle download (multi-language).
- Playlist support (select all / select subset).
- Settings page (output folder, defaults, concurrency).

**M3 — Library:**
- Library page with thumbnail grid.
- Subtitle preview viewer.
- Search/filter by title.

## Open Decisions Deferred to Implementation

- Exact yt-dlp invocation flags per format (best resolved while building M1).
- Thumbnail caching strategy for the Library page (in-place file vs separate cache directory).
- Whether to ship a built `.app` via electron-builder or just run `npm run dev` for personal use (defer until M1 works).
