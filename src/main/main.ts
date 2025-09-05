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
  screen,
  session,
  desktopCapturer,
  globalShortcut,
} from 'electron';
import log from 'electron-log';
import { resolveHtmlPath } from './util';
import getAssetPath from './getAssetPath';
import { WebSocket } from 'ws';
import registerIpcHandlers from './registerIpcHandlers';
import registerGlobalShortcuts from './registerGlobalShortcuts';
import AppUpdater from './AppUpdater';
import handleProtocolUrl from './handleProtocolUrl';

// Configure electron-log for main process
log.transports.file.level = 'info';
log.transports.console.level = 'info';

// Make WebSocket available globally
(global as any).WebSocket = WebSocket;

export const isWindows = process.platform === 'win32';

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  require('electron-debug').default({ showDevTools: false });
}

// Store reference for persistent settings
let store: any = null;

// Initialize electron-store asynchronously
const initializeStore = async () => {
  const Store = (await import('electron-store')).default;
  store = new Store({
    defaults: {
      zoomLevel: 0, // Default zoom level
    },
  });
  return store;
};

// Set App User Model ID for Windows (must be before creating any windows)
if (isWindows) {
  app.setAppUserModelId('org.clozerai.ClozerAI');
}

let mainWindow: BrowserWindow | null = null;

// Register IPC handlers (works even before window exists via getter)
registerIpcHandlers({
  getMainWindow: () => mainWindow,
  getStore: () => store,
});

// Store the initial protocol URL if the app was launched with one
let initialProtocolUrl: string | null = null;

// Helper function to set initial protocol URL
const setInitialProtocolUrl = (url: string | null) => {
  initialProtocolUrl = url;
};

// Register the open-url event listener BEFORE app.whenReady()
app.on('open-url', async (event, url) => {
  event.preventDefault();
  await handleProtocolUrl(url, () => mainWindow, setInitialProtocolUrl);
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
        await handleProtocolUrl(
          protocolArg,
          () => mainWindow,
          setInitialProtocolUrl,
        );
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
  });

  // Hardening
  mainWindow.setContentProtection(false);
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

    // Initialize store and restore zoom level
    try {
      await initializeStore();
      if (store) {
        const savedZoomLevel = store.get('zoomLevel', 0);
        mainWindow.webContents.setZoomLevel(savedZoomLevel);
        console.log(`Restored zoom level: ${savedZoomLevel}`);
      }
    } catch (error) {
      console.error('Error initializing store or restoring zoom level:', error);
    }

    mainWindow.show();

    // Handle any stored protocol URL after the window is ready
    if (initialProtocolUrl) {
      await handleProtocolUrl(
        initialProtocolUrl,
        () => mainWindow,
        setInitialProtocolUrl,
      );
      initialProtocolUrl = null;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    // Exit the app when main window is closed
    app.quit();
  });

  // Handle renderer process crashes
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    log.error('Renderer process crashed:', details);
    // Exit the app when renderer crashes
    app.quit();
  });

  // Handle unresponsive renderer
  mainWindow.on('unresponsive', () => {
    log.warn('Main window became unresponsive');
    // Exit the app when main window becomes unresponsive
    app.quit();
  });

  // Open urls in the user's browser
  mainWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
  });

  // Enable AppUpdater for both Windows and macOS
  // Windows will check for updates but use browser downloads
  // macOS will use the full auto-updater functionality
  new AppUpdater(() => mainWindow);
};

app.whenReady().then(async () => {
  // Register the custom protocol
  app.setAsDefaultProtocolClient('clozerai');

  createWindow();

  // Enable display media capture with system audio (loopback). This helps
  // getDisplayMedia({ audio: true }) in the renderer capture system audio on Windows.
  try {
    session.defaultSession.setDisplayMediaRequestHandler(
      (_request, callback) => {
        desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
          // Grant access to the first screen and enable loopback audio
          callback({ video: sources[0], audio: 'loopback' as any });
        });
      },
      { useSystemPicker: true },
    );
  } catch (e) {
    log.warn('Failed to set display media request handler:', e);
  }

  // Register global shortcuts for both macOS and Windows
  registerGlobalShortcuts({
    getMainWindow: () => mainWindow,
  });
});

// Unregister all shortcuts when the app quits
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
  app.quit();
});
