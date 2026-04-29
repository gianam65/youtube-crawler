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

## Build

```bash
npm run build
```

## Status

**M1 (core download)** — complete. Single video downloads to `~/Downloads/youtube-crawler/`.

**Roadmap:**
- M2 — audio (mp3), subtitles (multi-lang), playlists, configurable settings
- M3 — library view with thumbnails and search

See `docs/superpowers/specs/2026-04-29-youtube-crawler-design.md` for the full design.
