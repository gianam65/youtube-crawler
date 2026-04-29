import { useState } from 'react';
import type { VideoMetadata, DownloadFormatChoice } from '@shared/types';

interface Props {
  metadata: VideoMetadata;
  onConfirm(format: DownloadFormatChoice): void;
  onCancel(): void;
}

const QUALITIES: Array<DownloadFormatChoice & { kind: 'video' }> = [
  { kind: 'video', quality: 'best' },
  { kind: 'video', quality: '1080' },
  { kind: 'video', quality: '720' },
  { kind: 'video', quality: '480' },
];

function formatDuration(seconds: number | null): string {
  if (seconds == null) return 'Unknown';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function DownloadDialog({ metadata, onConfirm, onCancel }: Props): JSX.Element {
  const [quality, setQuality] = useState<'best' | '1080' | '720' | '480'>('1080');

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
        <div className="flex gap-4">
          {metadata.thumbnail && (
            <img
              src={metadata.thumbnail}
              alt=""
              className="w-32 h-20 object-cover rounded bg-gray-100"
            />
          )}
          <div className="flex-1 min-w-0">
            <h2
              className="text-base font-semibold text-gray-900 truncate"
              title={metadata.title}
            >
              {metadata.title}
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              {metadata.uploader ?? 'Unknown uploader'} ·{' '}
              {formatDuration(metadata.duration)}
            </p>
          </div>
        </div>

        <div className="mt-5">
          <label className="block text-xs font-medium text-gray-700 mb-2">
            Quality
          </label>
          <div className="flex gap-2">
            {QUALITIES.map((opt) => (
              <button
                key={opt.quality}
                type="button"
                onClick={() => setQuality(opt.quality)}
                className={`px-3 py-1.5 rounded text-sm border ${
                  quality === opt.quality
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {opt.quality === 'best' ? 'Best' : `${opt.quality}p`}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-1.5 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm({ kind: 'video', quality })}
            className="px-4 py-1.5 text-sm rounded bg-gray-900 text-white hover:bg-gray-800"
          >
            Download
          </button>
        </div>
      </div>
    </div>
  );
}
