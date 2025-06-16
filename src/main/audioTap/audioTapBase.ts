import { ChildProcess, spawn } from 'child_process';
import {
  AudioFormatRawEncodingEnum,
  RealtimeClient,
  ReceiveMessageEvent,
} from '@speechmatics/real-time-client';

interface AudioTapConfig {
  speechmaticsApiKey: string;
  language: string;
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

interface AudioTapBaseOptions {
  checkPlatformVersion: () => void;
  getExecutablePath: () => string;
  audioEncoding: AudioFormatRawEncodingEnum;
}

export const startAudioTapBase =
  (options: AudioTapBaseOptions): StartAudioTap =>
  async ({ speechmaticsApiKey, language, onPartial, onFinal, onError }) => {
    console.log('Starting audio tap with options:', options);

    options.checkPlatformVersion();

    let client: RealtimeClient | null = null;
    let clientReady = false;
    let cleanupCalled = false;
    let cleanupComplete = false;
    let audioProcess: ChildProcess | null = null;
    // Store event handlers so we can remove them during cleanup
    let receiveMessageHandler: ((evt: ReceiveMessageEvent) => void) | null =
      null;
    let socketStateChangeHandler: ((event: any) => void) | null = null;

    const handleError = (error: unknown) => {
      console.error('Audio capture error:', error);
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
      console.log('Starting audio tap cleanup...');

      return new Promise<void>((resolve) => {
        let audioProcessClosed = false;
        let speechmaticsClientClosed = false;
        let cleanupTimer: NodeJS.Timeout;

        const checkCleanupComplete = () => {
          if (audioProcessClosed && speechmaticsClientClosed) {
            cleanupComplete = true;
            clearTimeout(cleanupTimer);
            console.log('Audio tap cleanup complete');
            resolve();
          }
        };

        // Set a maximum cleanup time of 5 seconds
        cleanupTimer = setTimeout(() => {
          console.warn('Audio tap cleanup timed out, forcing completion');
          audioProcessClosed = true;
          speechmaticsClientClosed = true;
          cleanupComplete = true;
          resolve();
        }, 5000);

        // Clean up audio process
        if (audioProcess && !audioProcess.killed) {
          audioProcess.once('exit', () => {
            console.log('Audio process exited during cleanup');
            audioProcessClosed = true;
            checkCleanupComplete();
          });

          audioProcess.kill('SIGTERM');

          // Force kill after 2 seconds if it doesn't exit gracefully
          setTimeout(() => {
            if (audioProcess && !audioProcess.killed) {
              console.warn('Force killing audio process');
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
              console.log('Speechmatics client stopped gracefully');
            } catch (error) {
              console.error('Error stopping recognition:', error);
            } finally {
              speechmaticsClientClosed = true;
              checkCleanupComplete();
            }
          };

          // Add a fallback timeout for stopRecognition
          setTimeout(() => {
            if (!speechmaticsClientClosed) {
              console.warn(
                'Speechmatics client stop timed out, forcing closure',
              );
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
        receiveMessageHandler = (evt: ReceiveMessageEvent) => {
          const data = evt.data;
          if (data.message === 'RecognitionStarted') {
            clientReady = true;

            const exePath = options.getExecutablePath();
            audioProcess = spawn(exePath, [], {
              stdio: ['ignore', 'pipe', 'pipe'],
            });

            audioProcess.on('error', (error) => {
              handleError(
                new Error(`Audio capture process error: ${error.message}`),
              );
            });

            audioProcess.on('exit', (code, signal) => {
              if (!cleanupCalled) {
                handleError(
                  new Error(
                    `Audio capture process exited with code ${code}, signal ${signal}`,
                  ),
                );
              }
            });

            // Handle stderr for debugging
            if (audioProcess.stderr) {
              audioProcess.stderr.on('data', (data) => {
                const lines = data.toString().trim().split('\n');
                for (const line of lines) {
                  if (line.startsWith('INFO:')) {
                    console.log('Audio capture info:', line);
                  } else {
                    handleError(
                      new Error(line.substring('ERROR:'.length).trim()),
                    );
                  }
                }
              });
            }

            // Pipe audio data to Speechmatics
            if (audioProcess.stdout) {
              audioProcess.stdout.on('data', (audioData: Buffer) => {
                if (client && clientReady && !cleanupCalled) {
                  try {
                    client.sendAudio(audioData);
                  } catch (error) {
                    console.error(
                      'Error sending audio to Speechmatics:',
                      error,
                    );
                  }
                }
              });

              audioProcess.stdout.on('end', () => {
                if (!cleanupCalled) {
                  cleanup();
                }
              });
            }

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
            handleError(
              new Error(`Speechmatics error: ${data.type} - ${data.reason}`),
            );
          } else if (data.message === 'Info') {
            console.log('Received info:', data);
          }
        };

        socketStateChangeHandler = (event) => {
          if (event.socketState === 'closed' && !cleanupCalled) {
            handleError(new Error('Speechmatics socket closed'));
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
              },
              audio_format: {
                type: 'raw',
                encoding: options.audioEncoding,
                sample_rate: 16000,
              },
            });
          } catch (error) {
            handleError(error);
            reject(error);
          }
        })();
      });
    } catch (error) {
      cleanup();
      throw error;
    }
  };
