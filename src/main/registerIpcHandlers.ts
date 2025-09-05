import { app, BrowserWindow, clipboard, ipcMain } from 'electron';
import log from 'electron-log';
import screenshot from 'screenshot-desktop';
import { autoUpdater } from 'electron-updater';
import { startAudioTapMac, AudioTapResult } from './audioTapMac';
import { Status } from '@/renderer/lib/sessionTranscript/useAudioTapMac';
import { setNextAuthCookie } from './setNextAuthCookie';
import { isWindows } from './main';

type GetStoreFn = () => {
  get: (key: string, defaultValue?: any) => any;
  set: (key: string, value: any) => void;
} | null;

export default function registerIpcHandlers(params: {
  getMainWindow: () => BrowserWindow | null;
  getStore: GetStoreFn;
}) {
  const { getMainWindow, getStore } = params;

  // Store reference to audio tap instance
  let audioTapInstance: AudioTapResult | null = null;

  // One-way command handlers
  ipcMain.on('ipc-toggle-ignore-mouse-events', async (_, arg) => {
    getMainWindow()?.setIgnoreMouseEvents(arg, { forward: true });
  });

  ipcMain.on('ipc-quit-app', () => {
    app.quit();
  });

  // Request-response handlers
  ipcMain.handle(
    'ipc-start-audio-tap-mac',
    async (_event, speechmaticsApiKey, language, dictionaryEntries) => {
      // Always cleanup any existing instance first to prevent conflicts
      if (audioTapInstance) {
        log.info(
          'Cleaning up existing audio tap instance before starting new one',
        );
        try {
          await audioTapInstance.cleanup();
          log.info('Existing audio tap cleanup completed');
        } catch (error) {
          log.error('Error during audio tap cleanup:', error);
        }
        audioTapInstance = null;
      }

      try {
        const audioTapConfig = {
          speechmaticsApiKey,
          language,
          dictionaryEntries,
          onPartial: (partial: string) => {
            getMainWindow()?.webContents.send(
              'ipc-audio-tap-partial-transcript',
              partial,
            );
          },
          onFinal: (finalText: string) => {
            getMainWindow()?.webContents.send(
              'ipc-audio-tap-final-transcript',
              finalText,
            );
          },
          onError: (error: Error) => {
            getMainWindow()?.webContents.send(
              'ipc-audio-tap-status',
              'error',
              error.message,
            );
          },
        };

        audioTapInstance = await startAudioTapMac(audioTapConfig);
        return Status.RECORDING;
      } catch (error) {
        log.error('Error starting audio tap', error);
        throw error;
      }
    },
  );

  ipcMain.handle('ipc-stop-audio-tap', async () => {
    if (audioTapInstance) {
      try {
        log.info('Stopping audio tap...');
        await audioTapInstance.cleanup();
        log.info('Audio tap stopped successfully');
      } catch (error) {
        log.error('Error stopping audio tap:', error);
      }
      audioTapInstance = null;
    }

    return Status.IDLE;
  });

  ipcMain.handle('ipc-capture-screenshot', async () => {
    try {
      const imageBuffer = await screenshot({ format: 'png' });
      const base64String = imageBuffer.toString('base64');
      const dataUrl = `data:image/png;base64,${base64String}`;
      return dataUrl;
    } catch (error) {
      log.error('Error listening screenshot:', error);
      throw error;
    }
  });

  ipcMain.on('ipc-toggle-privacy', (_, isPrivate: boolean) => {
    const win = getMainWindow();
    if (win) {
      win.setContentProtection(isPrivate);
    }
  });

  ipcMain.on('ipc-zoom-in', () => {
    const win = getMainWindow();
    if (win) {
      const currentZoom = win.webContents.getZoomLevel();
      const newZoom = Math.min(currentZoom + 0.5, 3);
      win.webContents.setZoomLevel(newZoom);
      const store = getStore();
      if (store) {
        store.set('zoomLevel', newZoom);
      }
      console.log(`Zoom level set to: ${newZoom}`);
    }
  });

  ipcMain.on('ipc-zoom-out', () => {
    const win = getMainWindow();
    if (win) {
      const currentZoom = win.webContents.getZoomLevel();
      const newZoom = Math.max(currentZoom - 0.5, -3);
      win.webContents.setZoomLevel(newZoom);
      const store = getStore();
      if (store) {
        store.set('zoomLevel', newZoom);
      }
      console.log(`Zoom level set to: ${newZoom}`);
    }
  });

  ipcMain.on('ipc-zoom-reset', () => {
    const win = getMainWindow();
    if (win) {
      win.webContents.setZoomLevel(0);
      const store = getStore();
      if (store) {
        store.set('zoomLevel', 0);
      }
      console.log('Zoom level reset to: 0');
    }
  });

  ipcMain.handle('ipc-write-clipboard', async (_event, text: string) => {
    try {
      clipboard.writeText(text);
      log.info('Text written to clipboard successfully');
    } catch (error) {
      log.error('Error writing to clipboard:', error);
      throw error;
    }
  });

  ipcMain.handle('ipc-store-auth-token', async (_event, authToken: string) => {
    try {
      const mainWindow = getMainWindow();
      if (!mainWindow) {
        log.error('Cannot set auth cookie – mainWindow not ready yet');
        return false;
      }
      await setNextAuthCookie(mainWindow, authToken);
      return true;
    } catch (error) {
      log.error('Error setting auth token:', error);
      throw error;
    }
  });

  ipcMain.handle('ipc-install-update', async () => {
    try {
      // TODO: Remove this once we have a signed build for Windows
      if (isWindows) {
        log.info('Auto-updates are disabled on Windows (unsigned builds).');
        return;
      }
      autoUpdater.quitAndInstall();
    } catch (error) {
      log.error('Error installing update:', error);
      throw error;
    }
  });

  ipcMain.handle('get-app-version', () => {
    return process.env.NODE_ENV === 'production'
      ? app.getVersion()
      : 'development';
  });
}
