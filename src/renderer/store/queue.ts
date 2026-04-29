import { create } from 'zustand';
import type {
  DownloadStage,
  VideoMetadata,
  DownloadFormatChoice,
} from '@shared/types';

export interface QueueItem {
  id: string;
  url: string;
  metadata: VideoMetadata | null;
  format: DownloadFormatChoice | null;
  stage: DownloadStage;
  percent: number;
  speed: string | null;
  eta: string | null;
  filePath: string | null;
  errorMessage: string | null;
}

interface QueueState {
  items: QueueItem[];
  add(partial: Pick<QueueItem, 'id' | 'url'>): void;
  patch(id: string, patch: Partial<QueueItem>): void;
  remove(id: string): void;
}

export const useQueue = create<QueueState>((set) => ({
  items: [],
  add: (partial) =>
    set((s) => ({
      items: [
        ...s.items,
        {
          metadata: null,
          format: null,
          stage: 'pending',
          percent: 0,
          speed: null,
          eta: null,
          filePath: null,
          errorMessage: null,
          ...partial,
        },
      ],
    })),
  patch: (id, patch) =>
    set((s) => ({
      items: s.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    })),
  remove: (id) =>
    set((s) => ({ items: s.items.filter((it) => it.id !== id) })),
}));
