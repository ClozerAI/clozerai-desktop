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
  clipboard,
} from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import { resolveHtmlPath } from './util';
import getAssetPath from './getAssetPath';
import { startAudioTapMac } from './audioTap/audioTapMac';
import { startAudioTapWin } from './audioTap/audioTapWin';
import { Status } from '@/renderer/lib/sessionTranscript/useAudioTap';
import screenshot from 'screenshot-desktop';
import { AudioTapResult } from './audioTap/audioTapBase';
import { WebSocket } from 'ws';
import { NEXTJS_API_URL } from '@/renderer/lib/trpc/react';

// Make WebSocket available globally
(global as any).WebSocket = WebSocket;

class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;

    // Configure the update server to point to the release repository
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'JureSotosek',
      repo: 'clozerai-desktop-releases',
    });

    autoUpdater.checkForUpdatesAndNotify();
  }
}

const isWindows = process.platform === 'win32';

// Set App User Model ID for Windows (must be before creating any windows)
if (isWindows) {
  app.setAppUserModelId('org.clozerai.ClozerAI');
}

let mainWindow: BrowserWindow | null = null;
let audioTapInstance: AudioTapResult | null = null;

// Store the initial protocol URL if the app was launched with one
let initialProtocolUrl: string | null = null;

// Helper to persist the NextAuth session cookie so that subsequent fetch
// requests from the renderer include proper authentication
function setNextAuthCookie(authToken: string) {
  if (!mainWindow) {
    console.error('Cannot set auth cookie – mainWindow not ready yet');
    return;
  }

  // Set expiration date to 30 days from now (in seconds since UNIX epoch)
  const expirationDate = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

  mainWindow.webContents.session.cookies.set({
    url: NEXTJS_API_URL,
    name: '__Secure-next-auth.session-token',
    value: authToken,
    domain: new URL(NEXTJS_API_URL).hostname,
    path: '/',
    // For SameSite=None, secure must be true. Localhost is considered secure even over HTTP
    secure: true,
    httpOnly: false,
    // The renderer is served from the file:// protocol which is cross-site
    // with respect to http://localhost:3000. To make sure the cookie is
    // sent with XHR/fetch requests we need SameSite=None -> 'no_restriction'.
    sameSite: 'no_restriction',
    expirationDate: expirationDate,
  });

  mainWindow.webContents.session.cookies.set({
    url: NEXTJS_API_URL,
    name: 'next-auth.session-token',
    value: authToken,
    domain: new URL(NEXTJS_API_URL).hostname,
    path: '/',
    // For SameSite=None, secure must be true. Localhost is considered secure even over HTTP
    secure: true,
    httpOnly: false,
    // The renderer is served from the file:// protocol which is cross-site
    // with respect to http://localhost:3000. To make sure the cookie is
    // sent with XHR/fetch requests we need SameSite=None -> 'no_restriction'.
    sameSite: 'no_restriction',
    expirationDate: expirationDate,
  });

  // Force write cookies to disk immediately
  mainWindow.webContents.session.cookies.flushStore();

  // Notify the renderer that the auth cookie has been updated
  mainWindow.webContents.send('ipc-auth-cookie-updated');
}

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
      } else if (isWindows) {
        audioTapInstance = await startAudioTapWin(audioTapConfig);
      } else {
        throw new Error(
          `Unsupported platform: ${process.platform}. ClozerAI Desktop only supports macOS and Windows.`,
        );
      }

      return Status.RECORDING;
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

// Add new IPC handler for toggling content protection
ipcMain.on('ipc-toggle-content-protection', (_, disabled: boolean) => {
  if (mainWindow) {
    mainWindow.setContentProtection(!disabled);
    console.log(`Content protection ${disabled ? 'disabled' : 'enabled'}`);
  }
});

// Add new IPC handler for toggling privacy mode
ipcMain.on('ipc-toggle-privacy', (_, isPrivate: boolean) => {
  if (mainWindow) {
    mainWindow.setContentProtection(isPrivate);
  }
});

// Add clipboard handler
ipcMain.handle('ipc-write-clipboard', async (_, text: string) => {
  try {
    clipboard.writeText(text);
    console.log('Text written to clipboard successfully');
  } catch (error) {
    console.error('Error writing to clipboard:', error);
    throw error;
  }
});

// Add manual auth token handler
ipcMain.handle('ipc-store-auth-token', async (_, authToken: string) => {
  try {
    setNextAuthCookie(authToken);
    console.log('Auth token set successfully via manual input');
    return true;
  } catch (error) {
    console.error('Error setting auth token:', error);
    throw error;
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

  const prefix = 'clozerai://';
  if (!url.startsWith(prefix)) {
    console.log('Invalid protocol');
    return;
  }

  const urlWithoutPrefix = url.replace(prefix, '');
  console.log('URL without prefix:', urlWithoutPrefix);

  // Parse the URL to extract path and query parameters
  const [path, queryString] = urlWithoutPrefix.split('?');
  const params = new URLSearchParams(queryString || '');

  if (path === 'auth') {
    // Handle auth-only URL: clozerai://auth?authToken=...
    const authToken = params.get('authToken');
    if (authToken) {
      console.log('Received auth token from protocol');
      if (mainWindow) {
        if (mainWindow.isMinimized()) {
          mainWindow.restore();
        }
        mainWindow.focus();
        // Set cookies ...
        setNextAuthCookie(authToken);
      } else {
        // Store the URL to handle it once the main window is ready
        initialProtocolUrl = url;
      }
    } else {
      console.log('No auth token found in auth URL');
    }
  } else if (path === 'session') {
    // Handle session URL: clozerai://session?callSessionId=...&authToken=...
    const callSessionId = params.get('callSessionId');
    const authToken = params.get('authToken');

    if (callSessionId && authToken) {
      console.log(
        'Received session ID and auth token from protocol:',
        callSessionId,
      );
      if (mainWindow) {
        if (mainWindow.isMinimized()) {
          mainWindow.restore();
        }
        mainWindow.focus();
        // Set cookies ...
        setNextAuthCookie(authToken);
        mainWindow.webContents.send('ipc-load-session', callSessionId);
      } else {
        // Store the URL to handle it once the main window is ready
        initialProtocolUrl = url;
      }
    } else {
      console.log('Missing callSessionId or authToken in session URL');
    }
  } else {
    console.log('Invalid path in protocol URL:', path);
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
    if (isWindows) {
      const protocolArg = argv.find((arg) => arg.startsWith('clozerai://'));
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

if (isWindows) {
  // process.argv[0] is the executable, process.argv[1] is the first argument
  const protocolArg = process.argv.find((arg) => arg.startsWith('clozerai://'));
  if (protocolArg) {
    initialProtocolUrl = protocolArg;
  }
}

const createWindow = async () => {
  if (isDebug) {
    await installExtensions();
  }

  // Hide the dock icon on macOS
  if (process.platform === 'darwin') {
    app.dock?.hide();
  }

  mainWindow = new BrowserWindow({
    show: isWindows,
    icon: getAssetPath('icons/512x512.png'),
    webPreferences: {
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      // Enable microphone access
      experimentalFeatures: true,
      allowRunningInsecureContent: false,
    },
    alwaysOnTop: true,
    transparent: true,
    frame: false,
    roundedCorners: false,
    hasShadow: false,
    fullscreenable: false,
    minimizable: false,
    hiddenInMissionControl: true,
    skipTaskbar: true,
  });

  // Hardening
  mainWindow.setContentProtection(true);
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.setResizable(false);

  // Handle permissions for media devices
  mainWindow.webContents.session.setPermissionRequestHandler(
    (_, permission, callback) => {
      if (permission === 'media') {
        // Automatically grant media permission (includes microphone)
        callback(true);
      } else {
        callback(false);
      }
    },
  );

  // Windows-specific tweaks
  if (isWindows) {
    mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
    mainWindow.webContents.setBackgroundThrottling(false);
  }

  const { workArea: area } = screen.getPrimaryDisplay();
  mainWindow.setPosition(area.x, area.y);
  mainWindow.setSize(area.width, area.height);

  // Initially ignore mouse events (overlay style)
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  mainWindow.loadURL(resolveHtmlPath('index.html'));

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }

    mainWindow.show();

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
  app.setAsDefaultProtocolClient('clozerai');

  createWindow();

  // Register global shortcuts for both macOS and Windows
  if (process.platform === 'darwin') {
    // macOS shortcuts with Command key
    globalShortcut.register('Command+E', () => {
      if (mainWindow) {
        mainWindow.webContents.send('ipc-toggle-hide');
      }
    });

    globalShortcut.register('Command+H', () => {
      if (mainWindow) {
        mainWindow.webContents.send('ipc-answer-question');
      }
    });

    globalShortcut.register('Command+G', () => {
      if (mainWindow) {
        mainWindow.webContents.send('ipc-what-to-ask');
      }
    });

    globalShortcut.register('Command+Backspace', () => {
      if (mainWindow) {
        mainWindow.webContents.send('ipc-clear-messages');
      }
    });

    globalShortcut.register('Command+Left', () => {
      if (mainWindow) {
        mainWindow.webContents.send('ipc-move-window-left');
      }
    });

    globalShortcut.register('Command+Right', () => {
      if (mainWindow) {
        mainWindow.webContents.send('ipc-move-window-right');
      }
    });
  } else if (isWindows) {
    // Windows shortcuts with Ctrl key
    globalShortcut.register('Ctrl+E', () => {
      if (mainWindow) {
        mainWindow.webContents.send('ipc-toggle-hide');
      }
    });

    globalShortcut.register('Ctrl+H', () => {
      if (mainWindow) {
        mainWindow.webContents.send('ipc-answer-question');
      }
    });

    globalShortcut.register('Ctrl+G', () => {
      if (mainWindow) {
        mainWindow.webContents.send('ipc-what-to-ask');
      }
    });

    globalShortcut.register('Ctrl+Backspace', () => {
      if (mainWindow) {
        mainWindow.webContents.send('ipc-clear-messages');
      }
    });

    globalShortcut.register('Ctrl+Left', () => {
      if (mainWindow) {
        mainWindow.webContents.send('ipc-move-window-left');
      }
    });

    globalShortcut.register('Ctrl+Right', () => {
      if (mainWindow) {
        mainWindow.webContents.send('ipc-move-window-right');
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
