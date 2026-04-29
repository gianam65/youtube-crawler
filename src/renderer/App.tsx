import { useEffect, useRef, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { UrlInput } from './components/UrlInput';
import { SystemCheckModal } from './components/SystemCheckModal';
import { QueuePage } from './pages/QueuePage';
import { useQueue } from './store/queue';
import { api } from './lib/ipc';
import type { SystemCheckResult, DownloadFormatChoice } from '@shared/types';

function expandHome(p: string): string {
  if (!p.startsWith('~')) return p;
  return api.homeDir() + p.slice(1);
}

const DEFAULT_OUTPUT_DIR = '~/Downloads/youtube-crawler';
const DEFAULT_FORMAT: DownloadFormatChoice = { kind: 'video', quality: 'best' };

export function App(): JSX.Element {
  const [systemReady, setSystemReady] = useState<SystemCheckResult | null>(null);
  const [busy, setBusy] = useState(false);
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

  // Sequential runner: one fetch+download in flight at a time.
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
        stage: message.includes('cancelled') ? 'cancelled' : 'error',
        errorMessage: message.includes('cancelled') ? null : message,
      });
    }
  }

  function handleAddUrl(url: string): void {
    setBusy(true);
    add({ id: crypto.randomUUID(), url });
    setBusy(false);
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
    </div>
  );
}
