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

function expandHome(p: string): string {
  if (!p.startsWith('~')) return p;
  return api.homeDir() + p.slice(1);
}

const DEFAULT_OUTPUT_DIR = '~/Downloads/youtube-crawler';

interface PendingDownload {
  id: string;
  url: string;
  metadata: VideoMetadata;
}

export function App(): JSX.Element {
  const [systemReady, setSystemReady] = useState<SystemCheckResult | null>(null);
  const [pending, setPending] = useState<PendingDownload | null>(null);
  const [busy, setBusy] = useState(false);
  const pendingIdRef = useRef<string | null>(null);

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
    pendingIdRef.current = id;
    try {
      const meta = await api.fetchMetadata(url);
      patch(id, { metadata: meta, stage: 'ready' });
      setPending({ id, url, metadata: meta });
    } catch (err) {
      patch(id, {
        stage: 'error',
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      pendingIdRef.current = null;
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm(format: DownloadFormatChoice): Promise<void> {
    const current = pending;
    pendingIdRef.current = null;
    setPending(null);
    if (!current) return;
    patch(current.id, { format, stage: 'downloading', percent: 0 });
    try {
      await api.startDownload({
        id: current.id,
        url: current.url,
        format,
        outputDir: expandHome(DEFAULT_OUTPUT_DIR),
      });
    } catch (err) {
      patch(current.id, {
        stage: 'error',
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function handleCancelDialog(): void {
    const id = pendingIdRef.current;
    pendingIdRef.current = null;
    setPending(null);
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
      {pending && (
        <DownloadDialog
          metadata={pending.metadata}
          onConfirm={handleConfirm}
          onCancel={handleCancelDialog}
        />
      )}
    </div>
  );
}
