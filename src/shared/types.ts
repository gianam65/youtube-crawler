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
  metadata: VideoMetadata | null;
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

export interface PlaylistEntry {
  id: string;
  title: string;
  url: string;
  duration: number | null;
  thumbnail: string | null;
}

export interface PlaylistInfo {
  id: string;
  title: string;
  uploader: string | null;
  entries: PlaylistEntry[];
}

export interface RendererApi {
  systemCheck(): Promise<SystemCheckResult>;
  fetchMetadata(url: string): Promise<VideoMetadata>;
  fetchPlaylist(url: string): Promise<PlaylistInfo>;
  startDownload(req: DownloadRequest): Promise<string>;
  cancelDownload(id: string): Promise<boolean>;
  homeDir(): string;
  onProgress(handler: (p: DownloadProgress) => void): () => void;
}

declare global {
  interface Window {
    api: RendererApi;
  }
}
