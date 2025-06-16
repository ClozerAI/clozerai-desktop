import getAssetPath from '../getAssetPath';
import os from 'os';
import { startAudioTapBase } from './audioTapBase';

// Add Windows version check function
const checkWindowsVersion = (): void => {
  if (process.platform !== 'win32') {
    throw new Error(
      `ParakeetAI Desktop requires ${process.platform}. ` +
        `Current system: ${os.release()}. ` +
        `You can use the web version of ParakeetAI instead.`,
    );
  }

  // os.release() returns the kernel version, e.g., '10.0.19045' for Windows 10
  const release = os.release();
  const major = parseInt(release.split('.')[0], 10);

  // Windows Vista is NT 6.0, Windows 7 is NT 6.1, Windows 8 is NT 6.2, Windows 10 is NT 10.0
  if (major < 6) {
    throw new Error(
      `ParakeetAI requires Windows Vista (NT 6.0) or later. Current system: NT ${release}. You can use the web version of ParakeetAI instead.`,
    );
  }
};

// Add architecture detection function
const getWindowsArchitecture = (): string => {
  // Get the processor architecture
  const arch = os.arch();

  switch (arch) {
    case 'x64':
      return 'x64';
    case 'ia32':
      return 'x86';
    case 'arm64':
      return 'ARM64';
    default:
      throw new Error(
        `Unsupported Windows architecture: ${arch}. ParakeetAI Desktop supports x64, x86, and ARM64 architectures.`,
      );
  }
};

export const startAudioTapWin = startAudioTapBase({
  checkPlatformVersion: checkWindowsVersion,
  getExecutablePath: () =>
    getAssetPath(`AudioTapModuleWin_${getWindowsArchitecture()}.exe`),
  audioEncoding: 'pcm_s16le',
});
