import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import { BrowserWindow } from 'electron';
import { isWindows } from './main';

class AppUpdater {
  private mainWindow: BrowserWindow | null;

  constructor(getMainWindow: () => BrowserWindow | null) {
    this.mainWindow = null;
    log.transports.file.level = 'info';
    autoUpdater.logger = log;

    // Store the getter function to access mainWindow
    const getWindow = getMainWindow;

    // Override the mainWindow getter to use the passed function
    Object.defineProperty(this, 'mainWindow', {
      get: () => getWindow(),
    });

    // Configure the update server to point to the release repository
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'JureSotosek',
      repo: 'clozerai-desktop-releases',
    });

    // Set up event listeners
    this.setupEventListeners();
    autoUpdater.checkForUpdatesAndNotify();
  }

  private setupEventListeners() {
    autoUpdater.on('checking-for-update', () => {
      log.info('Checking for update...');
      this.mainWindow?.webContents.send('ipc-update-checking');
    });

    autoUpdater.on('update-available', (info) => {
      log.info('Update available:', info);
      this.mainWindow?.webContents.send('ipc-update-available', info);
    });

    autoUpdater.on('update-not-available', (info) => {
      log.info('Update not available:', info);
      this.mainWindow?.webContents.send('ipc-update-not-available', info);
    });

    autoUpdater.on('error', (err) => {
      log.error('Error in auto-updater:', err);
      // Only send update error for macOS
      // TODO: Remove this once we have a signed build for Windows
      if (!isWindows) {
        this.mainWindow?.webContents.send('ipc-update-error', err.message);
      }
    });

    autoUpdater.on('download-progress', (progressObj) => {
      log.info('Download progress:', progressObj);
      // Only send download progress for macOS
      // TODO: Remove this once we have a signed build for Windows
      if (!isWindows) {
        this.mainWindow?.webContents.send(
          'ipc-update-download-progress',
          progressObj,
        );
      }
    });

    autoUpdater.on('update-downloaded', (info) => {
      log.info('Update downloaded:', info);
      // Only send download completed for macOS
      // TODO: Remove this once we have a signed build for Windows
      if (!isWindows) {
        this.mainWindow?.webContents.send('ipc-update-downloaded', info);
      }
    });
  }
}

export default AppUpdater;
