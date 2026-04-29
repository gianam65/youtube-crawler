import { contextBridge, ipcRenderer } from 'electron';
import { homedir } from 'node:os';
import type { RendererApi, DownloadProgress } from '@shared/types';

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
};

contextBridge.exposeInMainWorld('api', api);
