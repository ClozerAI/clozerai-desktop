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

// Configure electron-log for main process
log.transports.file.level = 'info';
log.transports.console.level = 'info';

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

    autoUpdater.autoInstallOnAppQuit = true;

    // Set up event listeners
    this.setupEventListeners();

    // TODO: Remove this once we have a signed build for Windows
    if (isWindows) {
      return;
    }
    // Check for updates automatically
    autoUpdater.checkForUpdatesAndNotify();
  }

  private setupEventListeners() {
    autoUpdater.on('checking-for-update', () => {
      log.info('Checking for update...');
      mainWindow?.webContents.send('ipc-update-checking');
    });

    autoUpdater.on('update-available', (info) => {
      log.info('Update available:', info);
      mainWindow?.webContents.send('ipc-update-available', info);
    });

    autoUpdater.on('update-not-available', (info) => {
      log.info('Update not available:', info);
      mainWindow?.webContents.send('ipc-update-not-available', info);
    });

    autoUpdater.on('error', (err) => {
      log.error('Error in auto-updater:', err);
      mainWindow?.webContents.send('ipc-update-error', err.message);
    });

    autoUpdater.on('download-progress', (progressObj) => {
      log.info('Download progress:', progressObj);
      mainWindow?.webContents.send('ipc-update-download-progress', progressObj);
    });

    autoUpdater.on('update-downloaded', (info) => {
      log.info('Update downloaded:', info);
      mainWindow?.webContents.send('ipc-update-downloaded', info);
    });
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
async function setNextAuthCookie(authToken: string) {
  if (!mainWindow) {
    log.error('Cannot set auth cookie – mainWindow not ready yet');
    return;
  }

  log.info(
    'Setting auth cookie for token:',
    authToken.substring(0, 20) + '...',
  );

  // Set expiration date to 30 days from now (in seconds since UNIX epoch)
  const expirationDate = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

  try {
    await mainWindow.webContents.session.cookies.set({
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

    await mainWindow.webContents.session.cookies.set({
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

    log.info('Auth cookies set successfully');

    // Force write cookies to disk immediately
    await mainWindow.webContents.session.cookies.flushStore();
    log.info('Cookies flushed to disk');

    // Notify the renderer that the auth cookie has been updated
    mainWindow.webContents.send('ipc-auth-cookie-updated');
    log.info('Auth cookie update notification sent to renderer');
  } catch (error) {
    log.error('Error setting auth cookies:', error);
  }
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
      log.error('Error starting audio tap', error);
      throw error;
    }
  },
);

ipcMain.handle('ipc-stop-audio-tap', async (_) => {
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
    log.error('Error listening screenshot:', error);
    throw error;
  }
});

// Add new IPC handler for toggling content protection
ipcMain.on('ipc-toggle-content-protection', (_, disabled: boolean) => {
  if (mainWindow) {
    mainWindow.setContentProtection(!disabled);
    log.info(`Content protection ${disabled ? 'disabled' : 'enabled'}`);
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
    log.info('Text written to clipboard successfully');
  } catch (error) {
    log.error('Error writing to clipboard:', error);
    throw error;
  }
});

// Add manual auth token handler
ipcMain.handle('ipc-store-auth-token', async (_, authToken: string) => {
  try {
    await setNextAuthCookie(authToken);
    return true;
  } catch (error) {
    log.error('Error setting auth token:', error);
    throw error;
  }
});

// Add update handlers
ipcMain.handle('ipc-check-for-updates', async () => {
  try {
    // TODO: Remove this once we have a signed build for Windows
    if (isWindows) {
      log.info('Auto-updates are disabled on Windows (unsigned builds).');
      return null;
    }
    return await autoUpdater.checkForUpdatesAndNotify();
  } catch (error) {
    log.error('Error checking for updates:', error);
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
    .catch(log.error);
};

// Handle protocol URL (extract into a function for reuse)
async function handleProtocolUrl(url: string) {
  log.info('Received protocol URL:', url);

  const prefix = 'clozerai://';
  if (!url.startsWith(prefix)) {
    log.info('Invalid protocol');
    return;
  }

  const urlWithoutPrefix = url.replace(prefix, '');
  log.info('URL without prefix:', urlWithoutPrefix);

  // Parse the URL to extract path and query parameters
  const [path, queryString] = urlWithoutPrefix.split('?');

  // Normalize path by removing trailing slashes (Windows may include them)
  const normalizedPath = path.replace(/\/+$/, '');

  // On Windows, command line arguments might have URL encoding issues
  // Decode the query string to ensure proper parsing
  const decodedQueryString = queryString ? decodeURIComponent(queryString) : '';
  log.info('Decoded query string:', decodedQueryString);

  const params = new URLSearchParams(decodedQueryString);

  if (normalizedPath === 'auth') {
    // Handle auth URL: clozerai://auth?payload=...
    const payload = params.get('payload');
    log.info('Extracted payload:', payload);
    if (payload) {
      try {
        // The payload might still be URL-encoded, so decode it if needed
        let decodedPayload = payload;
        try {
          // Try to decode if it's still URL-encoded
          const testDecode = decodeURIComponent(payload);
          if (testDecode !== payload) {
            decodedPayload = testDecode;
            log.info('Further decoded payload:', decodedPayload);
          }
        } catch (e) {
          // If decoding fails, use original payload
          log.info('Payload does not need further decoding');
        }

        const decoded = JSON.parse(
          Buffer.from(decodedPayload, 'base64').toString('utf8'),
        );
        const authToken: string | undefined = decoded.authToken;
        if (authToken) {
          log.info('Received auth token from protocol');
          if (mainWindow) {
            if (mainWindow.isMinimized()) {
              mainWindow.restore();
            }
            mainWindow.focus();
            // Set cookies ...
            await setNextAuthCookie(authToken);
          } else {
            // Store the URL to handle it once the main window is ready
            initialProtocolUrl = url;
          }
        } else {
          log.info('No auth token found in auth payload');
        }
      } catch (e) {
        log.error('Invalid payload in auth protocol URL:', e);
      }
    } else {
      log.info('Missing payload in auth URL');
    }
  } else if (normalizedPath === 'session') {
    // Handle session URL: clozerai://session?payload=...
    const payload = params.get('payload');
    log.info('Extracted session payload:', payload);
    if (payload) {
      try {
        // The payload might still be URL-encoded, so decode it if needed
        let decodedPayload = payload;
        try {
          // Try to decode if it's still URL-encoded
          const testDecode = decodeURIComponent(payload);
          if (testDecode !== payload) {
            decodedPayload = testDecode;
            log.info('Further decoded session payload:', decodedPayload);
          }
        } catch (e) {
          // If decoding fails, use original payload
          log.info('Session payload does not need further decoding');
        }

        const decoded = JSON.parse(
          Buffer.from(decodedPayload, 'base64').toString('utf8'),
        );
        const callSessionId: string | undefined = decoded.callSessionId;
        const authToken: string | undefined = decoded.authToken;

        if (callSessionId && authToken) {
          log.info(
            'Received session ID and auth token from protocol:',
            callSessionId,
          );
          if (mainWindow) {
            if (mainWindow.isMinimized()) {
              mainWindow.restore();
            }
            mainWindow.focus();
            // Set cookies ...
            await setNextAuthCookie(authToken);
            mainWindow.webContents.send('ipc-load-session', callSessionId);
          } else {
            // Store the URL to handle it once the main window is ready
            initialProtocolUrl = url;
          }
        } else {
          log.info('Missing callSessionId or authToken in session payload');
        }
      } catch (e) {
        log.error('Invalid payload in session protocol URL:', e);
      }
    } else {
      log.info('Missing payload in session URL');
    }
  } else {
    log.info('Invalid path in protocol URL:', normalizedPath);
  }
}

// Register the open-url event listener BEFORE app.whenReady()
app.on('open-url', async (event, url) => {
  event.preventDefault();
  await handleProtocolUrl(url);
});

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', async (_event, argv, _workingDirectory) => {
    // On Windows, protocol URLs are passed in argv
    if (isWindows) {
      const protocolArg = argv.find((arg) => arg.startsWith('clozerai://'));
      if (protocolArg) {
        await handleProtocolUrl(protocolArg);
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
  log.info(
    'Windows detected, checking process.argv for protocol URL:',
    process.argv,
  );
  const protocolArg = process.argv.find((arg) => arg.startsWith('clozerai://'));
  if (protocolArg) {
    log.info('Found protocol URL in process.argv:', protocolArg);
    initialProtocolUrl = protocolArg;
  } else {
    log.info('No protocol URL found in process.argv');
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

  mainWindow.on('ready-to-show', async () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }

    mainWindow.show();

    // Handle any stored protocol URL after the window is ready
    if (initialProtocolUrl) {
      await handleProtocolUrl(initialProtocolUrl);
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

  // TODO: Remove this once we have a signed build for Windows
  if (!isWindows) {
    new AppUpdater();
  } else {
    log.info('Auto-updater is disabled on Windows (unsigned builds).');
  }
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
