'use client';

import { useState, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { DictionaryEntry } from './transcriptTypes';
import {
  audioWorkletCode,
  initializeSpeechmaticsSession,
} from './useMicrophoneTranscription';
import { RealtimeClient } from '@speechmatics/real-time-client';

export default function useAudioTapWindows(
  onNewTranscript: (transcript: string) => void,
  onNewPartialTranscript: (partialTranscript: string) => void,
) {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [bufferHealth, setBufferHealth] = useState<number>(0);

  const currentApiKeyRef = useRef<string | null>(null);
  const currentLanguageRef = useRef<string | null>(null);
  const currentDictionaryEntriesRef = useRef<DictionaryEntry[] | null>(null);
  const currentBackgroundFilteringRef = useRef<number | null>(null);

  const realtimeClientRef = useRef<RealtimeClient | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioBufferRef = useRef<Float32Array[]>([]);
  const processingAudioRef = useRef<boolean>(false);
  const lastProcessTimeRef = useRef<number>(Date.now());

  const cleanupRecording = useCallback(() => {
    if (
      realtimeClientRef.current &&
      realtimeClientRef.current.socketState === 'open'
    ) {
      realtimeClientRef.current.stopRecognition();
      realtimeClientRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    setIsRecording(false);
    audioBufferRef.current = [];
    setBufferHealth(0);
    currentApiKeyRef.current = null;
    currentLanguageRef.current = null;
    currentDictionaryEntriesRef.current = null;
  }, []);

  const stopRecording = useCallback(() => {
    cleanupRecording();
  }, [cleanupRecording]);

  const processAudioBuffer = useCallback(async () => {
    if (
      processingAudioRef.current ||
      !realtimeClientRef.current ||
      audioBufferRef.current.length === 0
    )
      return;

    processingAudioRef.current = true;
    const startTime = Date.now();
    const chunks = audioBufferRef.current.splice(0, 4);

    if (
      !realtimeClientRef.current ||
      realtimeClientRef.current.socketState !== 'open'
    ) {
      toast.error('Session closed or disconnected during audio processing');

      if (
        currentApiKeyRef.current &&
        currentLanguageRef.current !== null &&
        currentDictionaryEntriesRef.current !== null &&
        currentBackgroundFilteringRef.current !== null
      ) {
        try {
          const client = await initializeSpeechmaticsSession(
            currentApiKeyRef.current,
            currentLanguageRef.current,
            audioContextRef.current!,
            onNewTranscript,
            onNewPartialTranscript,
            (error) => {
              toast.error('Speechmatics session error:', error);
            },
            currentDictionaryEntriesRef.current,
            currentBackgroundFilteringRef.current,
          );
          realtimeClientRef.current = client;
        } catch (error) {
          if (error instanceof Error) {
            toast.error('Failed to reinitialize session: ' + error.message);
          } else {
            toast.error('Failed to reinitialize session');
          }
          cleanupRecording();
          return;
        }
      } else {
        toast.error('No credentials to reinitialize session');
        cleanupRecording();
        return;
      }
    }

    for (const chunk of chunks) {
      try {
        realtimeClientRef.current.sendAudio(chunk.buffer);
      } catch (error) {
        console.error('Error sending audio:', error);
        if (error instanceof Error) {
          toast.error('Error processing Audio: ' + error.message);
        } else {
          toast.error('Error processing Audio');
        }
        return;
      }
    }

    const endTime = Date.now();
    const processingTime = endTime - startTime;
    const audioTime = chunks.length * 250; // 250ms per chunk

    const health = 1 - processingTime / audioTime;
    setBufferHealth(health);

    lastProcessTimeRef.current = endTime;
    processingAudioRef.current = false;

    if (audioBufferRef.current.length > 0) {
      setTimeout(processAudioBuffer, 0);
    }
  }, [
    cleanupRecording,
    currentApiKeyRef,
    currentLanguageRef,
    onNewTranscript,
    onNewPartialTranscript,
  ]);

  const startTranscription = async (
    apiKey: string,
    language: string,
    dictionaryEntries: DictionaryEntry[],
    backgroundFiltering: number,
  ): Promise<void> => {
    try {
      currentApiKeyRef.current = apiKey;
      currentLanguageRef.current = language;
      currentDictionaryEntriesRef.current = dictionaryEntries;
      currentBackgroundFilteringRef.current = backgroundFiltering;

      // Request system audio via display media (loopback). Video track is minimized.
      const stream = await navigator.mediaDevices.getDisplayMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
        // Some platforms require video to be requested; keep it tiny to minimize overhead.
        video: {
          width: 1,
          height: 1,
          frameRate: 1,
        },
      } as DisplayMediaStreamOptions);

      mediaStreamRef.current = stream;

      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      const blob = new Blob([audioWorkletCode], {
        type: 'application/javascript',
      });
      const workletUrl = URL.createObjectURL(blob);

      await audioContext.audioWorklet.addModule(workletUrl);

      const sourceNode = audioContext.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(audioContext, 'audio-processor');
      workletNodeRef.current = workletNode;

      const client = await initializeSpeechmaticsSession(
        apiKey,
        language,
        audioContext,
        onNewTranscript,
        onNewPartialTranscript,
        (error) => {
          toast.error('Speechmatics session error:', error);
        },
        dictionaryEntries,
        backgroundFiltering,
      );
      realtimeClientRef.current = client;

      workletNode.port.onmessage = (event) => {
        audioBufferRef.current.push(new Float32Array(event.data));
        processAudioBuffer();
      };

      sourceNode.connect(workletNode);
      workletNode.connect(audioContext.destination);

      setIsRecording(true);
    } catch (error) {
      toast.error(
        'Error capturing system audio. Please check screen/audio capture permissions.',
      );
      cleanupRecording();
    }
  };

  const switchApiKey = async (
    newApiKey: string,
    language: string,
    dictionaryEntries: DictionaryEntry[],
    backgroundFiltering: number,
  ): Promise<void> => {
    try {
      currentApiKeyRef.current = newApiKey;
      currentLanguageRef.current = language;
      currentDictionaryEntriesRef.current = dictionaryEntries;
      currentBackgroundFilteringRef.current = backgroundFiltering;

      if (!realtimeClientRef.current || !isRecording) {
        throw new Error('No active transcription session to switch API key');
      }

      if (
        realtimeClientRef.current &&
        realtimeClientRef.current.socketState === 'open'
      ) {
        realtimeClientRef.current.stopRecognition();
        realtimeClientRef.current = null;
      }

      const client = await initializeSpeechmaticsSession(
        newApiKey,
        language,
        audioContextRef.current!,
        onNewTranscript,
        onNewPartialTranscript,
        (error) => {
          toast.error('Speechmatics session error:', error);
        },
        dictionaryEntries,
        backgroundFiltering,
      );
      realtimeClientRef.current = client;
    } catch (error) {
      if (error instanceof Error) {
        toast.error('Error switching API key: ' + error.message);
      } else {
        toast.error('Error switching API key');
      }
      cleanupRecording();
    }
  };

  return {
    isRecording,
    startTranscription,
    stopRecording,
    bufferHealth,
    switchApiKey,
  };
}
