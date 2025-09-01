import { globalShortcut } from 'electron';
import { BrowserWindow } from 'electron';
import { isWindows } from './main';

// Register all global shortcuts for both macOS and Windows
export default function registerGlobalShortcuts(params: {
  getMainWindow: () => BrowserWindow | null;
}) {
  const { getMainWindow } = params;

  if (process.platform === 'darwin') {
    // macOS shortcuts with Command key
    globalShortcut.register('Command+E', () => {
      const mainWindow = getMainWindow();
      if (mainWindow) {
        mainWindow.webContents.send('ipc-toggle-hide');
      }
    });

    globalShortcut.register('Command+H', () => {
      const mainWindow = getMainWindow();
      if (mainWindow) {
        mainWindow.webContents.send('ipc-answer-question');
      }
    });

    globalShortcut.register('Command+G', () => {
      const mainWindow = getMainWindow();
      if (mainWindow) {
        mainWindow.webContents.send('ipc-what-to-ask');
      }
    });

    globalShortcut.register('Command+Backspace', () => {
      const mainWindow = getMainWindow();
      if (mainWindow) {
        mainWindow.webContents.send('ipc-clear-messages');
      }
    });

    globalShortcut.register('Command+Left', () => {
      const mainWindow = getMainWindow();
      if (mainWindow) {
        mainWindow.webContents.send('ipc-move-window-left');
      }
    });

    globalShortcut.register('Command+Right', () => {
      const mainWindow = getMainWindow();
      if (mainWindow) {
        mainWindow.webContents.send('ipc-move-window-right');
      }
    });
  } else if (isWindows) {
    // Windows shortcuts with Ctrl key
    globalShortcut.register('Ctrl+E', () => {
      const mainWindow = getMainWindow();
      if (mainWindow) {
        mainWindow.webContents.send('ipc-toggle-hide');
      }
    });

    globalShortcut.register('Ctrl+H', () => {
      const mainWindow = getMainWindow();
      if (mainWindow) {
        mainWindow.webContents.send('ipc-answer-question');
      }
    });

    globalShortcut.register('Ctrl+G', () => {
      const mainWindow = getMainWindow();
      if (mainWindow) {
        mainWindow.webContents.send('ipc-what-to-ask');
      }
    });

    globalShortcut.register('Ctrl+Backspace', () => {
      const mainWindow = getMainWindow();
      if (mainWindow) {
        mainWindow.webContents.send('ipc-clear-messages');
      }
    });

    globalShortcut.register('Ctrl+Left', () => {
      const mainWindow = getMainWindow();
      if (mainWindow) {
        mainWindow.webContents.send('ipc-move-window-left');
      }
    });

    globalShortcut.register('Ctrl+Right', () => {
      const mainWindow = getMainWindow();
      if (mainWindow) {
        mainWindow.webContents.send('ipc-move-window-right');
      }
    });
  }
}
