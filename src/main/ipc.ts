import { ipcMain, BrowserWindow } from 'electron';
import { systemCheck } from './system-check.js';
import { fetchMetadata, startDownload, cancelDownload } from './ytdlp.js';
import type { DownloadRequest } from '@shared/types';

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('system:check', () => systemCheck());

  ipcMain.handle('metadata:fetch', (_e, url: string) => fetchMetadata(url));

  ipcMain.handle('download:start', async (_e, req: DownloadRequest) => {
    const result = await startDownload(req, (progress) =>
      getWindow()?.webContents.send('download:progress', progress),
    );
    return result.filePath;
  });

  ipcMain.handle('download:cancel', (_e, id: string) => cancelDownload(id));
}
