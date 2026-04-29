import { useEffect, useRef, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { UrlInput } from './components/UrlInput';
import { SystemCheckModal } from './components/SystemCheckModal';
import { PlaylistPicker } from './components/PlaylistPicker';
import { QueuePage } from './pages/QueuePage';
import { useQueue } from './store/queue';
import { api } from './lib/ipc';
import { isUserPlaylist } from './lib/url';
import type {
  SystemCheckResult,
  DownloadFormatChoice,
  PlaylistInfo,
  PlaylistEntry,
} from '@shared/types';

function expandHome(p: string): string {
  if (!p.startsWith('~')) return p;
  return api.homeDir() + p.slice(1);
}

const DEFAULT_OUTPUT_DIR = '~/Downloads/youtube-crawler';
const DEFAULT_FORMAT: DownloadFormatChoice = { kind: 'video', quality: 'best' };

export function App(): JSX.Element {
  const [systemReady, setSystemReady] = useState<SystemCheckResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [playlist, setPlaylist] = useState<PlaylistInfo | null>(null);
  const runningRef = useRef(false);

  const add = useQueue((s) => s.add);
  const patch = useQueue((s) => s.patch);

  useEffect(() => {
    api.systemCheck().then(setSystemReady);
  }, []);

  useEffect(() => {
    const off = api.onProgress((p) => patch(p.id, p));
    return off;
  }, [patch]);

  // Sequential runner: at most one fetch+download in flight at a time.
  async function runNext(): Promise<void> {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      while (true) {
        const next = useQueue.getState().items.find((it) => it.stage === 'pending');
        if (!next) break;
        await processItem(next.id, next.url);
      }
    } finally {
      runningRef.current = false;
    }
  }

  async function processItem(id: string, url: string): Promise<void> {
    patch(id, { stage: 'fetching_metadata' });
    try {
      const meta = await api.fetchMetadata(url);
      patch(id, {
        metadata: meta,
        format: DEFAULT_FORMAT,
        stage: 'downloading',
        percent: 0,
      });
      const filePath = await api.startDownload({
        id,
        url,
        format: DEFAULT_FORMAT,
        outputDir: expandHome(DEFAULT_OUTPUT_DIR),
      });
      patch(id, { stage: 'done', percent: 100, filePath });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      patch(id, {
        stage: message === 'cancelled' ? 'cancelled' : 'error',
        errorMessage: message === 'cancelled' ? null : message,
      });
    }
  }

  async function handleAddUrl(url: string): Promise<void> {
    setBusy(true);
    try {
      if (isUserPlaylist(url)) {
        try {
          const info = await api.fetchPlaylist(url);
          setPlaylist(info);
          return;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (!message.includes('NOT_A_PLAYLIST')) throw err;
          // Fall through to single-video flow below
          console.log('Playlist inaccessible, falling back to single video:', message);
        }
      }
      add({ id: crypto.randomUUID(), url });
      runNext();
    } catch (err) {
      const id = crypto.randomUUID();
      add({ id, url });
      patch(id, {
        stage: 'error',
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  function handlePlaylistConfirm(selected: PlaylistEntry[]): void {
    setPlaylist(null);
    for (const entry of selected) {
      add({ id: crypto.randomUUID(), url: entry.url });
    }
    runNext();
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
      {playlist && (
        <PlaylistPicker
          playlist={playlist}
          onConfirm={handlePlaylistConfirm}
          onCancel={() => setPlaylist(null)}
        />
      )}
    </div>
  );
}
