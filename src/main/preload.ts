import { Status } from '@/renderer/lib/useAudioTap';
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

export type Channels =
  | 'ipc-toggle-ignore-mouse-events'
  | 'ipc-start-audio-tap'
  | 'ipc-stop-audio-tap'
  | 'ipc-audio-tap-status'
  | 'ipc-audio-tap-partial-transcript'
  | 'ipc-audio-tap-final-transcript'
  | 'ipc-quit-app'
  | 'ipc-capture-screenshot'
  | 'ipc-set-window-width'
  | 'ipc-toggle-hide'
  | 'ipc-answer-question'
  | 'ipc-what-to-ask'
  | 'ipc-analyse-screen'
  | 'ipc-load-session'
  | 'ipc-move-window-left'
  | 'ipc-move-window-right'
  | 'ipc-widen-window'
  | 'ipc-narrow-window'
  | 'ipc-reset-window'
  | 'ipc-toggle-content-protection'
  | 'ipc-clear-messages'
  | 'ipc-write-clipboard';

const electronHandler = {
  ipcRenderer: {
    sendMessage(channel: Channels, ...args: unknown[]) {
      ipcRenderer.send(channel, ...args);
    },
    on(channel: Channels, func: (...args: unknown[]) => void) {
      const subscription = (_event: IpcRendererEvent, ...args: unknown[]) =>
        func(...args);
      ipcRenderer.on(channel, subscription);

      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    },
    once(channel: Channels, func: (...args: unknown[]) => void) {
      ipcRenderer.once(channel, (_event, ...args) => func(...args));
    },
    quitApp() {
      ipcRenderer.send('ipc-quit-app');
    },
    async captureScreenshot(): Promise<string> {
      return ipcRenderer.invoke('ipc-capture-screenshot');
    },
    async startAudioTap(
      speechmaticsApiKey: string,
      language: string,
    ): Promise<Status> {
      return ipcRenderer.invoke(
        'ipc-start-audio-tap',
        speechmaticsApiKey,
        language,
      );
    },
    async stopAudioTap(): Promise<Status> {
      return ipcRenderer.invoke('ipc-stop-audio-tap');
    },
    async writeClipboard(text: string): Promise<void> {
      return ipcRenderer.invoke('ipc-write-clipboard', text);
    },
  },
  platform: process.platform,
  osVersion: process.getSystemVersion(),
  getVersion: () => ipcRenderer.invoke('get-app-version') as Promise<string>,
};

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
