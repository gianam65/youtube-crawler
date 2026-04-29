import { useEffect, useState } from 'react';
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
    try {
      const meta = await api.fetchMetadata(url);
      patch(id, { metadata: meta, format: DEFAULT_FORMAT, stage: 'downloading', percent: 0 });
      api
        .startDownload({
          id,
          url,
          format: DEFAULT_FORMAT,
          outputDir: expandHome(DEFAULT_OUTPUT_DIR),
        })
        .catch((err) => {
          patch(id, {
            stage: 'error',
            errorMessage: err instanceof Error ? err.message : String(err),
          });
        });
    } catch (err) {
      patch(id, {
        stage: 'error',
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
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
