/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import path from 'path';
import {
  app,
  BrowserWindow,
  shell,
  ipcMain,
  screen,
  globalShortcut,
} from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import { resolveHtmlPath } from './util';
import getAssetPath from './getAssetPath';
import { startAudioTapMac } from './audioTap/audioTapMac';
import { startAudioTapWin } from './audioTap/audioTapWin';
import { Status } from '@/renderer/lib/useAudioTap';
import screenshot from 'screenshot-desktop';
import { AudioTapResult } from './audioTap/audioTapBase';

class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;

    // Configure the update server to point to the release repository
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'JureSotosek',
      repo: 'parakeetai-desktop-releases',
    });

    autoUpdater.checkForUpdatesAndNotify();
  }
}

// Set App User Model ID for Windows (must be before creating any windows)
if (process.platform === 'win32') {
  app.setAppUserModelId('org.parakeetai.ParakeetAI');
}

let mainWindow: BrowserWindow | null = null;
let audioTapInstance: AudioTapResult | null = null;

// Store the initial protocol URL if the app was launched with one
let initialProtocolUrl: string | null = null;

// Add variables to store window state before hiding
let windowStateBeforeHide: {
  x: number;
  y: number;
  width: number;
  height: number;
} | null = null;

// One-way command handlers (keep as .on)
ipcMain.on('ipc-toggle-ignore-mouse-events', async (_, arg) => {
  mainWindow?.setIgnoreMouseEvents(arg, { forward: true });
});

ipcMain.on('ipc-quit-app', () => {
  app.quit();
});

// Request-response handlers (convert to .handle)
ipcMain.handle(
  'ipc-start-audio-tap',
  async (_, speechmaticsApiKey, language) => {
    // Always cleanup any existing instance first to prevent conflicts
    if (audioTapInstance) {
      console.log(
        'Cleaning up existing audio tap instance before starting new one',
      );
      try {
        await audioTapInstance.cleanup();
        console.log('Existing audio tap cleanup completed');
      } catch (error) {
        console.error('Error during audio tap cleanup:', error);
      }
      audioTapInstance = null;
    }

    try {
      // Common configuration for both platforms
      const audioTapConfig = {
        speechmaticsApiKey,
        language,
        onPartial: (partial: string) => {
          mainWindow?.webContents.send(
            'ipc-audio-tap-partial-transcript',
            partial,
          );
        },
        onFinal: (finalText: string) => {
          mainWindow?.webContents.send(
            'ipc-audio-tap-final-transcript',
            finalText,
          );
        },
        onError: (error: Error) => {
          mainWindow?.webContents.send(
            'ipc-audio-tap-status',
            'error',
            error.message,
          );
        },
      };

      // Use the appropriate audio tap implementation based on platform
      if (process.platform === 'darwin') {
        audioTapInstance = await startAudioTapMac(audioTapConfig);
      } else if (process.platform === 'win32') {
        audioTapInstance = await startAudioTapWin(audioTapConfig);
      } else {
        throw new Error(
          `Unsupported platform: ${process.platform}. ParakeetAI Desktop only supports macOS and Windows.`,
        );
      }

      return Status.LISTENING;
    } catch (error) {
      console.log('Error starting audio tap', error);
      throw error;
    }
  },
);

ipcMain.handle('ipc-stop-audio-tap', async (_) => {
  if (audioTapInstance) {
    try {
      console.log('Stopping audio tap...');
      await audioTapInstance.cleanup();
      console.log('Audio tap stopped successfully');
    } catch (error) {
      console.error('Error stopping audio tap:', error);
    }
    audioTapInstance = null;
  }

  return Status.IDLE;
});

// Replace the screenshot IPC handler
ipcMain.handle('ipc-capture-screenshot', async () => {
  try {
    // Use screenshot-desktop to capture screenshot
    const imageBuffer = await screenshot({ format: 'png' });

    // Convert buffer to base64 data URL
    const base64String = imageBuffer.toString('base64');
    const dataUrl = `data:image/png;base64,${base64String}`;

    return dataUrl;
  } catch (error) {
    console.log('Error listening screenshot:', error);
    throw error;
  }
});

// Replace the existing ipc-set-window-width handler
ipcMain.on('ipc-set-window-width', (_, width) => {
  if (mainWindow) {
    const [currentX, currentY] = mainWindow.getPosition();
    const [currentWidth, currentHeight] = mainWindow.getSize();
    const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;

    if (width === 280) {
      // Hiding: store current state and center the hidden window
      windowStateBeforeHide = {
        x: currentX,
        y: currentY,
        width: currentWidth,
        height: currentHeight,
      };

      // Position the hidden window in the center of where the original window was
      const originalCenterX = currentX + currentWidth / 2;
      const newX = Math.round(originalCenterX - width / 2);

      // Ensure the hidden window doesn't go off screen
      const clampedX = Math.max(0, Math.min(screenWidth - width, newX));

      mainWindow.setBounds({
        x: clampedX,
        y: currentY,
        width,
        height: currentHeight,
      });
    } else {
      // Showing: restore original state if available, otherwise center
      if (windowStateBeforeHide) {
        mainWindow.setBounds(windowStateBeforeHide);
        windowStateBeforeHide = null;
      } else {
        // Fallback to centering if no stored state
        const x = Math.round((screenWidth - width) / 2);
        mainWindow.setBounds({ x, y: currentY, width, height: currentHeight });
      }
    }
  }
});

// Add new IPC handlers after the existing ones
ipcMain.on('ipc-move-window-left', () => {
  if (mainWindow) {
    const [x, y] = mainWindow.getPosition();
    const [width, height] = mainWindow.getSize();

    // Move 100px to the left, but don't go off screen
    const newX = Math.max(0, x - 100);
    mainWindow.setBounds({ x: newX, y, width, height });
  }
});

ipcMain.on('ipc-move-window-right', () => {
  if (mainWindow) {
    const [x, y] = mainWindow.getPosition();
    const [width, height] = mainWindow.getSize();
    const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;

    // Move 100px to the right, but don't go off screen
    const newX = Math.min(screenWidth - width, x + 100);
    mainWindow.setBounds({ x: newX, y, width, height });
  }
});

ipcMain.on('ipc-widen-window', () => {
  if (mainWindow) {
    const [x, y] = mainWindow.getPosition();
    const [width, height] = mainWindow.getSize();
    const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;

    // Calculate current center position
    const currentCenterX = x + width / 2;

    // Increase width by 100px, but don't exceed screen width
    const newWidth = Math.min(screenWidth, width + 100);

    // Calculate new x position to keep center in the same place
    const newX = Math.round(currentCenterX - newWidth / 2);

    // Ensure the window doesn't go off screen
    const clampedX = Math.max(0, Math.min(screenWidth - newWidth, newX));

    mainWindow.setBounds({ x: clampedX, y, width: newWidth, height });
  }
});

ipcMain.on('ipc-narrow-window', () => {
  if (mainWindow) {
    const [x, y] = mainWindow.getPosition();
    const [width, height] = mainWindow.getSize();
    const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;

    // Calculate current center position
    const currentCenterX = x + width / 2;

    // Decrease width by 100px, but don't go below 600px (minimum width)
    const newWidth = Math.max(600, width - 100);

    // Calculate new x position to keep center in the same place
    const newX = Math.round(currentCenterX - newWidth / 2);

    // Ensure the window doesn't go off screen
    const clampedX = Math.max(0, Math.min(screenWidth - newWidth, newX));

    mainWindow.setBounds({ x: clampedX, y, width: newWidth, height });
  }
});

// Add new reset window handler
ipcMain.on('ipc-reset-window', () => {
  if (mainWindow) {
    const { width: screenWidth, height: screenHeight } =
      screen.getPrimaryDisplay().workAreaSize;

    // Reset to default values (same as in createWindow)
    const windowWidth = 1000;
    const windowHeight = screenHeight;
    const x = Math.round((screenWidth - windowWidth) / 2);
    const y = 0;

    mainWindow.setBounds({ x, y, width: windowWidth, height: windowHeight });

    // Clear any stored window state
    windowStateBeforeHide = null;
  }
});

// Add new IPC handler for toggling content protection
ipcMain.on('ipc-toggle-content-protection', (_, disabled: boolean) => {
  if (mainWindow) {
    mainWindow.setContentProtection(!disabled);
    console.log(`Content protection ${disabled ? 'disabled' : 'enabled'}`);
  }
});

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  require('electron-debug').default({ showDevTools: false });
}

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      forceDownload,
    )
    .catch(console.log);
};

// Handle protocol URL (extract into a function for reuse)
function handleProtocolUrl(url: string) {
  console.log('Received protocol URL:', url);

  const prefix = 'parakeetai://';
  if (!url.startsWith(prefix)) {
    console.log('Invalid protocol');
    return;
  }

  const sessionId = url.replace(prefix, '').replace(/\/$/, '');
  console.log('Session ID:', sessionId);

  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
    mainWindow.webContents.send('ipc-load-session', sessionId);
  } else {
    // Store the URL to handle it once the main window is ready
    initialProtocolUrl = url;
  }
}

// Register the open-url event listener BEFORE app.whenReady()
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleProtocolUrl(url);
});

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv, _workingDirectory) => {
    // On Windows, protocol URLs are passed in argv
    if (process.platform === 'win32') {
      const protocolArg = argv.find((arg) => arg.startsWith('parakeetai://'));
      if (protocolArg) {
        handleProtocolUrl(protocolArg);
      }
    }
    // Someone tried to run a second instance, focus the main window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

if (process.platform === 'win32') {
  // process.argv[0] is the executable, process.argv[1] is the first argument
  const protocolArg = process.argv.find((arg) =>
    arg.startsWith('parakeetai://'),
  );
  if (protocolArg) {
    initialProtocolUrl = protocolArg;
  }
}

const createWindow = async () => {
  if (isDebug) {
    await installExtensions();
  }

  const { width: screenWidth, height: screenHeight } =
    screen.getPrimaryDisplay().workAreaSize;

  const windowWidth = 1000;
  const windowHeight = screenHeight;

  const x = Math.round((screenWidth - windowWidth) / 2);
  const y = 0;

  // Hide the dock icon on macOS
  if (process.platform === 'darwin') {
    app.dock?.hide();
  }

  mainWindow = new BrowserWindow({
    show: false,
    width: windowWidth,
    height: windowHeight,
    x,
    y,
    icon: getAssetPath('icons/512x512.png'),
    webPreferences: {
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
    },
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    hasShadow: false,
    transparent: true,
    // Hide the window from the taskbar on Windows, prevents global shortcuts from working
    skipTaskbar: true,
  });

  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  mainWindow.setContentProtection(true);

  mainWindow.loadURL(resolveHtmlPath('index.html'));

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
    }

    // Handle any stored protocol URL after the window is ready
    if (initialProtocolUrl) {
      handleProtocolUrl(initialProtocolUrl);
      initialProtocolUrl = null;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open urls in the user's browser
  mainWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
  });

  new AppUpdater();
};

app.whenReady().then(async () => {
  // Register the custom protocol
  app.setAsDefaultProtocolClient('parakeetai');

  createWindow();

  // Only register global shortcuts on macOS
  if (process.platform === 'darwin') {
    // Register global shortcut for Command+E
    globalShortcut.register('Command+E', () => {
      if (mainWindow) {
        mainWindow.webContents.send('ipc-toggle-hide');
      }
    });

    // Register global shortcut for Command+G (Answer Question)
    globalShortcut.register('Command+G', () => {
      if (mainWindow) {
        mainWindow.webContents.send('ipc-answer-question');
      }
    });

    // Register global shortcut for Command+K (Analyse Screen)
    globalShortcut.register('Command+K', () => {
      if (mainWindow) {
        mainWindow.webContents.send('ipc-analyse-screen');
      }
    });

    // Register global shortcut for Command+Backspace (Clear Messages)
    globalShortcut.register('Command+Backspace', () => {
      if (mainWindow) {
        mainWindow.webContents.send('ipc-clear-messages');
      }
    });
  }
});

// Unregister all shortcuts when the app quits
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

ipcMain.handle('get-app-version', () => {
  return process.env.NODE_ENV === 'production'
    ? app.getVersion()
    : 'development';
});
