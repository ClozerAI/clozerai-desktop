import { useState, useEffect, useRef } from 'react';

export enum Status {
  IDLE = 'idle',
  STARTING = 'starting',
  LISTENING = 'listening',
  ERROR = 'error',
}

export function useAudioTap(apiKey?: string | null, language?: string) {
  const [status, setStatus] = useState<Status>(Status.IDLE);
  const [error, setError] = useState<string | null>(null);
  const [isCleaningUp, setIsCleaningUp] = useState(false);

  const [finalTranscription, setFinalTranscription] = useState('');
  const [partialTranscription, setPartialTranscription] = useState('');
  const finalTranscriptionRef = useRef(finalTranscription);

  useEffect(() => {
    finalTranscriptionRef.current = finalTranscription;
  }, [finalTranscription]);

  // Cleanup verification function
  const ensureCleanup = async (): Promise<void> => {
    if (isCleaningUp) {
      console.log('Cleanup already in progress, waiting...');
      // Wait for cleanup to complete
      return new Promise((resolve) => {
        const checkCleanup = () => {
          if (!isCleaningUp) {
            resolve();
          } else {
            setTimeout(checkCleanup, 100);
          }
        };
        checkCleanup();
      });
    }
  };

  useEffect(() => {
    const offStatus = window.electron?.ipcRenderer.on(
      'ipc-audio-tap-status',
      (...args: unknown[]) => {
        const [status, errMsg] = args as [string, string?];
        if (status === 'error') {
          setStatus(Status.ERROR);
          setError(errMsg || 'Unknown error');
          setIsCleaningUp(false); // Reset cleanup state on error
        }
      },
    );

    const offPartialTranscript = window.electron?.ipcRenderer.on(
      'ipc-audio-tap-partial-transcript',
      (...args: unknown[]) => {
        const [text] = args as [string];
        // Only set partial transcript if we're listening and not cleaning up
        if (status === Status.LISTENING && !isCleaningUp) {
          setPartialTranscription(text);
        }
      },
    );

    const offFinalTranscript = window.electron?.ipcRenderer.on(
      'ipc-audio-tap-final-transcript',
      (...args: unknown[]) => {
        const [text] = args as [string];
        // Only add to final transcript if we're listening and not cleaning up
        if (status === Status.LISTENING && !isCleaningUp) {
          setFinalTranscription((prev) => prev + text);
        }
      },
    );

    return () => {
      offStatus && offStatus();
      offPartialTranscript && offPartialTranscript();
      offFinalTranscript && offFinalTranscript();
    };
  }, [status, isCleaningUp]);

  const startListening = async (newApiKey?: string) => {
    if (!apiKey && !newApiKey) {
      throw new Error('No API key provided.');
    }

    await ensureCleanup();

    setError(null);
    setStatus(Status.STARTING);

    try {
      const response = await window.electron?.ipcRenderer.startAudioTap(
        newApiKey || apiKey || '',
        language || 'en',
      );

      setStatus(response);
    } catch (error) {
      setStatus(Status.ERROR);
      setError(
        error instanceof Error
          ? error.message.replace(
              "Error invoking remote method 'ipc-start-audio-tap': Error:",
              '',
            )
          : 'Unknown error',
      );
    }
  };

  const stopListening = async () => {
    try {
      setIsCleaningUp(true);
      console.log('Stopping audio tap from renderer...');

      const response = await window.electron?.ipcRenderer.stopAudioTap();
      setStatus(response);

      console.log('Audio tap stopped from renderer');
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Could not stop listening',
      );
    } finally {
      setIsCleaningUp(false);
    }
  };

  const clearTranscription = () => {
    setFinalTranscription('');
    setPartialTranscription('');
  };

  // Switch Speechmatics API Key
  const switchSpeechmaticsApiKey = async (newApiKey: string) => {
    try {
      console.log('Switching Speechmatics API key...');
      await stopListening();
      console.log('Previous audio tap stopped, starting with new API key...');
      await startListening(newApiKey);
      console.log('Audio tap started with new API key');
    } catch (error) {
      setStatus(Status.ERROR);
      setError(
        error instanceof Error
          ? error.message
          : 'Error switching Speechmatics API key',
      );
    }
  };

  const clearError = () => {
    setError(null);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (status === Status.LISTENING) {
        console.log('Component unmounting, cleaning up audio tap...');
        // Fire and forget cleanup on unmount
        stopListening().catch(console.error);
      }
    };
  }, []); // Empty dependency array so this only runs on unmount

  return {
    status,
    error,
    finalTranscription,
    partialTranscription,
    isCleaningUp,
    clearTranscription,
    startListening,
    stopListening,
    switchSpeechmaticsApiKey,
    clearError,
  };
}
