import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { DictionaryEntry } from './transcriptTypes';

export enum Status {
  IDLE = 'idle',
  STARTING = 'starting',
  RECORDING = 'recording',
}

export default function useAudioTapMac(
  onNewTranscript: (transcript: string) => void,
  onNewPartialTranscript: (partialTranscript: string) => void,
) {
  const [status, setStatus] = useState<Status>(Status.IDLE);
  const [isCleaningUp, setIsCleaningUp] = useState(false);

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
          setStatus(Status.IDLE);
          toast.error(errMsg || 'Unknown error');
          setIsCleaningUp(false); // Reset cleanup state on error
        }
      },
    );

    const offPartialTranscript = window.electron?.ipcRenderer.on(
      'ipc-audio-tap-partial-transcript',
      (...args: unknown[]) => {
        const [text] = args as [string];
        // Only set partial transcript if we're listening and not cleaning up
        if (status === Status.RECORDING && !isCleaningUp) {
          onNewPartialTranscript(text);
        }
      },
    );

    const offFinalTranscript = window.electron?.ipcRenderer.on(
      'ipc-audio-tap-final-transcript',
      (...args: unknown[]) => {
        const [text] = args as [string];
        // Only add to final transcript if we're listening and not cleaning up
        if (status === Status.RECORDING && !isCleaningUp) {
          onNewTranscript(text);
        }
      },
    );

    return () => {
      offStatus && offStatus();
      offPartialTranscript && offPartialTranscript();
      offFinalTranscript && offFinalTranscript();
    };
  }, [status, isCleaningUp]);

  const startTranscription = async (
    apiKey: string,
    language: string,
    dictionaryEntries: DictionaryEntry[],
    backgroundFiltering: number,
  ) => {
    await ensureCleanup();

    setStatus(Status.STARTING);

    try {
      const response = await window.electron?.ipcRenderer.startAudioTapMac(
        apiKey,
        language,
        dictionaryEntries,
        backgroundFiltering,
      );

      setStatus(response);
    } catch (error) {
      setStatus(Status.IDLE);

      // Improved error handling to extract meaningful error messages
      let errorMessage = 'Unknown error';

      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (error && typeof error === 'object') {
        // Handle ErrorEvent and other objects that might have message property
        if ('message' in error && typeof error.message === 'string') {
          errorMessage = error.message;
        } else if ('error' in error && error.error instanceof Error) {
          errorMessage = error.error.message;
        } else if ('reason' in error && typeof error.reason === 'string') {
          errorMessage = error.reason;
        } else {
          // Try to get a string representation
          errorMessage = String(error);
        }
      } else if (typeof error === 'string') {
        errorMessage = error;
      }

      toast.error(errorMessage);
    }
  };

  const stopRecording = async () => {
    try {
      setIsCleaningUp(true);
      console.log('Stopping audio tap from renderer...');

      const response = await window.electron?.ipcRenderer.stopAudioTap();
      setStatus(response);

      console.log('Audio tap stopped from renderer');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not stop transcription',
      );
    } finally {
      setIsCleaningUp(false);
    }
  };

  // Switch Speechmatics API Key
  const switchApiKey = async (
    newApiKey: string,
    language: string,
    dictionaryEntries: DictionaryEntry[],
    backgroundFiltering: number,
  ) => {
    try {
      console.log('Switching Speechmatics API key...');
      await stopRecording();
      console.log('Previous audio tap stopped, starting with new API key...');
      await startTranscription(
        newApiKey,
        language,
        dictionaryEntries,
        backgroundFiltering,
      );
      console.log('Audio tap started with new API key');
    } catch (error) {
      setStatus(Status.IDLE);
      toast.error(
        error instanceof Error
          ? error.message
          : 'Error switching Speechmatics API key',
      );
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (status === Status.RECORDING) {
        console.log('Component unmounting, cleaning up audio tap...');
        // Fire and forget cleanup on unmount
        stopRecording().catch((error) => {
          toast.error(
            error instanceof Error ? error.message : 'Error stopping audio tap',
          );
        });
      }
    };
  }, []); // Empty dependency array so this only runs on unmount

  return {
    status,
    isCleaningUp,
    startTranscription,
    stopRecording,
    switchApiKey,
  };
}
