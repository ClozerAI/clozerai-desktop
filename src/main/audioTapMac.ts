import getAssetPath from './getAssetPath';
import os from 'os';
import { ChildProcess, spawn } from 'child_process';
import {
  AudioFormatRawEncodingEnum,
  RealtimeClient,
  ReceiveMessageEvent,
} from '@speechmatics/real-time-client';
import log from 'electron-log';
import { DictionaryEntry } from '@/renderer/lib/sessionTranscript/transcriptTypes';

interface AudioTapConfig {
  speechmaticsApiKey: string;
  language: string;
  dictionaryEntries: DictionaryEntry[];
  onPartial?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (error: Error) => void;
}

export interface AudioTapResult {
  cleanup: () => Promise<void>;
  isRunning: () => boolean;
  isCleanedUp: () => boolean;
}

export type StartAudioTap = (config: AudioTapConfig) => Promise<AudioTapResult>;

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

export const startAudioTapMac: StartAudioTap = async ({
  speechmaticsApiKey,
  language,
  dictionaryEntries,
  onPartial,
  onFinal,
  onError,
}) => {
  log.info('Starting audio tap on macOS');

  checkMacOSVersion();

  let client: RealtimeClient | null = null;
  let clientReady = false;
  let cleanupCalled = false;
  let cleanupComplete = false;
  let audioProcess: ChildProcess | null = null;
  // Store event handlers so we can remove them during cleanup
  let receiveMessageHandler: ((evt: ReceiveMessageEvent) => void) | null = null;
  let socketStateChangeHandler: ((event: any) => void) | null = null;

  // Retry logic state
  let retryCount = 0;
  const maxRetries = 2;
  let isRetrying = false;

  const startAudioProcess = () => {
    const exePath = getAssetPath('AudioTapModuleMac_universal');
    audioProcess = spawn(exePath, [], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    audioProcess.on('error', (error) => {
      handleError(new Error(`Audio capture process error: ${error.message}`));
    });

    audioProcess.on('exit', (code, signal) => {
      if (!cleanupCalled) {
        const errorMessage = `Audio capture process exited with code ${code}, signal ${signal}`;
        log.info(errorMessage);

        // Only retry for process exit codes if we haven't exceeded max retries
        if (retryCount < maxRetries && !isRetrying) {
          retryCount++;
          isRetrying = true;
          log.info(
            `Attempting restart ${retryCount}/${maxRetries} for audio process...`,
          );
          try {
            startAudioProcess();
            isRetrying = false;
            log.info(`Audio process restart attempt ${retryCount} completed`);
          } catch (error) {
            isRetrying = false;
            handleError(
              new Error(
                `Failed to restart audio process: ${error instanceof Error ? error.message : 'Unknown error'}`,
              ),
            );
          }
        } else {
          handleError(new Error(errorMessage));
        }
      }
    });

    // Handle stderr for debugging
    if (audioProcess.stderr) {
      audioProcess.stderr.on('data', (data) => {
        const lines = data.toString().trim().split('\n');
        for (const line of lines) {
          if (line.startsWith('INFO:')) {
            log.info('Audio capture info:', line);
          } else {
            handleError(new Error(line.substring('ERROR:'.length).trim()));
          }
        }
      });
    }

    // Pipe audio data to Speechmatics
    if (audioProcess.stdout) {
      audioProcess.stdout.on('data', (audioData: Buffer) => {
        // Reset retry counter when we receive valid audio data
        if (retryCount > 0) {
          log.info('Received valid audio data, resetting retry counter');
          retryCount = 0;
        }

        if (client && clientReady && !cleanupCalled) {
          try {
            if (client.socketState !== 'open') {
              handleError(
                new Error('Speechmatics socket closed during audio capture'),
              );
            }
            client.sendAudio(audioData);
          } catch (error) {
            log.error('Error sending audio to Speechmatics:', error);
            // Propagate the error instead of just logging it
            handleError(
              new Error(
                `Failed to send audio to Speechmatics: ${error instanceof Error ? error.message : 'Unknown error'}`,
              ),
            );
          }
        }
      });
    }
  };

  const handleError = (error: unknown) => {
    log.error('Audio capture error:', error);
    onError?.(error as Error);
    cleanup();
  };

  const cleanup = async (): Promise<void> => {
    if (cleanupCalled) {
      // If cleanup is already in progress, wait for it to complete
      return new Promise((resolve) => {
        const checkCleanup = () => {
          if (cleanupComplete) {
            resolve();
          } else {
            setTimeout(checkCleanup, 50);
          }
        };
        checkCleanup();
      });
    }

    cleanupCalled = true;
    log.info('Starting audio tap cleanup...');

    return new Promise<void>((resolve) => {
      let audioProcessClosed = false;
      let speechmaticsClientClosed = false;
      let cleanupTimer: NodeJS.Timeout;

      const checkCleanupComplete = () => {
        if (audioProcessClosed && speechmaticsClientClosed) {
          cleanupComplete = true;
          clearTimeout(cleanupTimer);
          log.info('Audio tap cleanup complete');
          resolve();
        }
      };

      // Set a maximum cleanup time of 5 seconds
      cleanupTimer = setTimeout(() => {
        log.warn('Audio tap cleanup timed out, forcing completion');
        audioProcessClosed = true;
        speechmaticsClientClosed = true;
        cleanupComplete = true;
        resolve();
      }, 5000);

      // Clean up audio process
      if (audioProcess && !audioProcess.killed) {
        audioProcess.once('exit', () => {
          log.info('Audio process exited during cleanup');
          audioProcessClosed = true;
          checkCleanupComplete();
        });

        audioProcess.kill('SIGTERM');

        // Force kill after 2 seconds if it doesn't exit gracefully
        setTimeout(() => {
          if (audioProcess && !audioProcess.killed) {
            log.warn('Force killing audio process');
            audioProcess.kill('SIGKILL');
          }
        }, 2000);
      } else {
        audioProcessClosed = true;
      }

      // Clean up Speechmatics client more thoroughly
      if (client) {
        // Remove event listeners to prevent further callbacks
        if (receiveMessageHandler) {
          client.removeEventListener('receiveMessage', receiveMessageHandler);
          receiveMessageHandler = null;
        }
        if (socketStateChangeHandler) {
          client.removeEventListener(
            'socketStateChange',
            socketStateChangeHandler,
          );
          socketStateChangeHandler = null;
        }

        // Stop recognition with timeout
        const stopRecognition = async () => {
          try {
            await client!.stopRecognition({ noTimeout: true });
            log.info('Speechmatics client stopped gracefully');
          } catch (error) {
            log.error('Error stopping recognition:', error);
          } finally {
            speechmaticsClientClosed = true;
            checkCleanupComplete();
          }
        };

        // Add a fallback timeout for stopRecognition
        setTimeout(() => {
          if (!speechmaticsClientClosed) {
            log.warn('Speechmatics client stop timed out, forcing closure');
            speechmaticsClientClosed = true;
            checkCleanupComplete();
          }
        }, 3000);

        stopRecognition();
      } else {
        speechmaticsClientClosed = true;
      }

      // Reset all state
      client = null;
      audioProcess = null;
      clientReady = false;

      // Check if we can complete immediately
      checkCleanupComplete();
    });
  };

  try {
    client = new RealtimeClient();

    return new Promise((resolve, reject) => {
      try {
        receiveMessageHandler = (evt: ReceiveMessageEvent) => {
          const data = evt.data;
          if (data.message === 'RecognitionStarted') {
            clientReady = true;
            startAudioProcess();

            resolve({
              cleanup,
              isRunning: () =>
                !!(
                  client &&
                  client.socketState !== 'closed' &&
                  audioProcess &&
                  !audioProcess.killed &&
                  !cleanupCalled
                ),
              isCleanedUp: () => cleanupComplete,
            });
          } else if (data.message === 'AddPartialTranscript') {
            if (!cleanupCalled) {
              onPartial?.(data.metadata.transcript);
            }
          } else if (data.message === 'AddTranscript') {
            if (!cleanupCalled) {
              onFinal?.(data.metadata.transcript);
            }
          } else if (data.message === 'Error') {
            const errorDetails = `${data.type || 'Unknown'} - ${data.reason || 'No reason provided'}`;
            log.error('Speechmatics error details:', data);
            handleError(new Error(`Speechmatics error: ${errorDetails}`));
          } else if (data.message === 'Info') {
            log.info('Received info:', data);
          } else if (data.message === 'Warning') {
            log.warn('Speechmatics warning:', data);
          } else if (data.message === 'AudioAdded') {
            // Do nothing
          } else {
            // Log unknown message types to help debug potential silent failures
            log.info('Unknown Speechmatics message:', data);
          }
        };

        socketStateChangeHandler = (event) => {
          log.info('Speechmatics socket state changed:', event.socketState);
          if (event.socketState === 'closed' && !cleanupCalled) {
            handleError(new Error('Speechmatics socket closed'));
          } else if (event.socketState === 'error' && !cleanupCalled) {
            handleError(new Error('Speechmatics socket error'));
          } else if (event.socketState === 'disconnected' && !cleanupCalled) {
            handleError(new Error('Speechmatics disconnected'));
          }
        };

        client!.addEventListener('receiveMessage', receiveMessageHandler);
        client!.addEventListener('socketStateChange', socketStateChangeHandler);

        (async () => {
          try {
            await client!.start(speechmaticsApiKey, {
              transcription_config: {
                language,
                operating_point: 'enhanced',
                enable_partials: true,
                max_delay: 1,
                additional_vocab: dictionaryEntries.map((entry) => ({
                  content: entry.word,
                  sounds_like: entry.pronunciation
                    .split(',')
                    .map((pronunciation) => pronunciation.trim())
                    .filter((pronunciation) => pronunciation.length > 0),
                })),
              },
              audio_format: {
                type: 'raw',
                encoding: 'pcm_f32le' as AudioFormatRawEncodingEnum,
                sample_rate: 16000,
              },
            });
          } catch (error) {
            handleError(error);
            reject(error);
          }
        })();
      } catch (error) {
        handleError(error);
        reject(error);
      }
    });
  } catch (error) {
    handleError(error);
    throw error;
  }
};
