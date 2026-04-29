# YouTube Crawler

Personal-use macOS desktop app for downloading YouTube videos.

## Features

- Paste a YouTube URL and download — no quality picker, auto-selects best quality
- Single videos and playlists (playlist picker + sequential download queue)
- H.264 + AAC output so files play in QuickTime out of the box
- Downloads thumbnail (`.jpg`) and English/Vietnamese subtitles (`.srt`) alongside the video
- Subtitle fetch is non-fatal: a YouTube 429 on subs won't abort the video download
- Falls back to a single-video download when a playlist URL is private or inaccessible
- Startup system check verifies `yt-dlp` and `ffmpeg` are installed
- Saves everything to `~/Downloads/youtube-crawler/`

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

**M1 (core download)** — complete. Single videos + playlists, thumbnails, en/vi subtitles, saved to `~/Downloads/youtube-crawler/`.

**Roadmap:**
- M2 — audio-only (mp3), multi-language subtitles, configurable settings
- M3 — library view with thumbnails and search

See `docs/superpowers/specs/2026-04-29-youtube-crawler-design.md` for the full design.
