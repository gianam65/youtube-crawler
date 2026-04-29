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
