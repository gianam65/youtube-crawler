import { useMemo, useState } from 'react';
import type { PlaylistInfo, PlaylistEntry } from '@shared/types';

interface Props {
  playlist: PlaylistInfo;
  onConfirm(selected: PlaylistEntry[]): void;
  onCancel(): void;
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function PlaylistPicker({ playlist, onConfirm, onCancel }: Props): JSX.Element {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(playlist.entries.map((e) => e.id)),
  );

  const allSelected = selected.size === playlist.entries.length;
  const noneSelected = selected.size === 0;

  function toggle(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(): void {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(playlist.entries.map((e) => e.id)));
  }

  const ordered = useMemo(
    () => playlist.entries.filter((e) => selected.has(e.id)),
    [playlist.entries, selected],
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40">
      <div className="bg-white rounded-lg shadow-xl w-[640px] max-h-[80vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2
            className="text-base font-semibold text-gray-900 truncate"
            title={playlist.title}
          >
            {playlist.title}
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            {playlist.uploader ?? 'Unknown'} · {playlist.entries.length} videos
          </p>
        </div>

        <div className="px-5 py-2 border-b border-gray-200 flex items-center justify-between">
          <button
            type="button"
            onClick={toggleAll}
            className="text-xs text-gray-700 hover:text-gray-900"
          >
            {allSelected ? 'Deselect all' : 'Select all'}
          </button>
          <span className="text-xs text-gray-500">{selected.size} selected</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {playlist.entries.map((entry) => {
            const checked = selected.has(entry.id);
            return (
              <label
                key={entry.id}
                className="flex items-center gap-3 px-5 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(entry.id)}
                  className="shrink-0"
                />
                {entry.thumbnail && (
                  <img
                    src={entry.thumbnail}
                    alt=""
                    className="w-20 h-12 object-cover rounded bg-gray-100 shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-900 truncate" title={entry.title}>
                    {entry.title}
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatDuration(entry.duration)}
                  </div>
                </div>
              </label>
            );
          })}
        </div>

        <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-1.5 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(ordered)}
            disabled={noneSelected}
            className="px-4 py-1.5 text-sm rounded bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50"
          >
            Download {selected.size}
          </button>
        </div>
      </div>
    </div>
  );
}
