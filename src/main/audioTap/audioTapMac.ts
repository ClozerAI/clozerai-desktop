import getAssetPath from '../getAssetPath';
import os from 'os';
import { startAudioTapBase } from './audioTapBase';

// Add macOS version check function
const checkMacOSVersion = (): void => {
  // Only check on macOS
  if (process.platform !== 'darwin') {
    throw new Error(
      `ClozerAI Desktop requires ${process.platform}. ` +
        `Current system: ${os.release()}. ` +
        `You can use the web version of ClozerAI instead.`,
    );
  }

  // Get Darwin kernel version
  const release = os.release();
  const majorVersion = parseInt(release.split('.')[0], 10);

  // Darwin 23.x = macOS 14.x (Sonoma)
  // Darwin 22.x = macOS 13.x (Ventura)
  // Darwin 21.x = macOS 12.x (Monterey)
  // We need macOS 12.0+ (Darwin 21.0+) for ScreenCaptureKit support
  if (majorVersion < 22) {
    const darwinToMacOSMap: Record<number, string> = {
      19: '10.15 (Catalina)',
      20: '11 (Big Sur)',
      21: '12 (Monterey)',
    };

    const macOSVersion =
      darwinToMacOSMap[majorVersion] || `Unknown (Darwin ${majorVersion})`;
    throw new Error(
      `ClozerAI requires macOS 13.0 (Ventura) or later for ScreenCaptureKit support. ` +
        `Current system: macOS ${macOSVersion}. ` +
        `You can use the web version of ClozerAI instead.`,
    );
  }
};

export const startAudioTapMac = startAudioTapBase({
  checkPlatformVersion: checkMacOSVersion,
  getExecutablePath: () => getAssetPath('AudioTapModuleMac_universal'),
  audioEncoding: 'pcm_f32le',
});
