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
