import { contextBridge, ipcRenderer } from 'electron';
import { homedir } from 'node:os';
import type {
  RendererApi,
  DownloadProgress,
  DownloadResult,
  DownloadError,
} from '@shared/types';

const api: RendererApi = {
  systemCheck: () => ipcRenderer.invoke('system:check'),
  fetchMetadata: (url) => ipcRenderer.invoke('metadata:fetch', url),
  startDownload: (req) => ipcRenderer.invoke('download:start', req),
  cancelDownload: (id) => ipcRenderer.invoke('download:cancel', id),
  homeDir: () => homedir(),
  onProgress: (handler) => {
    const listener = (_e: unknown, p: DownloadProgress) => handler(p);
    ipcRenderer.on('download:progress', listener);
    return () => ipcRenderer.off('download:progress', listener);
  },
  onDone: (handler) => {
    const listener = (_e: unknown, r: DownloadResult) => handler(r);
    ipcRenderer.on('download:done', listener);
    return () => ipcRenderer.off('download:done', listener);
  },
  onError: (handler) => {
    const listener = (_e: unknown, err: DownloadError) => handler(err);
    ipcRenderer.on('download:error', listener);
    return () => ipcRenderer.off('download:error', listener);
  },
};

contextBridge.exposeInMainWorld('api', api);
