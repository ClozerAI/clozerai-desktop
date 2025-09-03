'use client';

import { useState, useRef, useCallback } from 'react';

import {
  RealtimeClient,
  RealtimeTranscriptionConfig,
} from '@speechmatics/real-time-client';
import { toast } from 'sonner';
import { DictionaryEntry } from './transcriptTypes';

export const audioWorkletCode = `
class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = [];
    this._lastSendTime = currentTime;
  }

  process(inputs) {
    const input = inputs[0];
    if (input.length > 0) {
      const inputChannel = input[0];
      this._buffer.push(...inputChannel);

      // Send data every 500ms (adjust as needed)
      if (currentTime - this._lastSendTime >= 0.5) {
        this.port.postMessage(this._buffer);
        this._buffer = [];
        this._lastSendTime = currentTime;
      }
    }
    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);
`;

export const initializeSpeechmaticsSession = async (
  apiKey: string,
  language: string,
  audioContext: AudioContext,
  onData: (transcript: string) => void,
  onPartialData: (partialTranscript: string) => void,
  onError: (error: any) => void,
  dictionaryEntries: DictionaryEntry[],
): Promise<RealtimeClient> => {
  const realtimeClient = new RealtimeClient();

  realtimeClient.addEventListener('receiveMessage', ({ data }) => {
    if (data.message === 'AddTranscript') {
      onData(data.metadata.transcript);
    } else if (data.message === 'AddPartialTranscript') {
      onPartialData(data.metadata.transcript);
    } else if (data.message === 'EndOfTranscript') {
      onPartialData('');
    } else if (data.message === 'Error') {
      onError(data);
    }
  });

  let domain = undefined;
  if (language.includes(':')) {
    language = language.split(':')[0]!;
    domain = language.split(':')[1]!;
  }

  const sessionConfig: RealtimeTranscriptionConfig = {
    transcription_config: {
      language,
      operating_point: 'enhanced',
      enable_partials: true,
      max_delay: 1,
      domain,
      audio_filtering_config: {
        volume_threshold: 6,
      },
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
      encoding: 'pcm_f32le',
      sample_rate: audioContext.sampleRate,
    },
  };

  await realtimeClient.start(apiKey, sessionConfig);
  return realtimeClient;
};

export default function useMicrophoneTranscription(
  onNewTranscript: (transcript: string) => void,
  onNewPartialTranscript: (partialTranscript: string) => void,
) {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [bufferHealth, setBufferHealth] = useState<number>(0);
  const currentApiKeyRef = useRef<string | null>(null);
  const currentLanguageRef = useRef<string | null>(null);
  const currentDictionaryEntriesRef = useRef<DictionaryEntry[] | null>(null);

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

      // Try to reinitialize the session if we have the credentials
      if (
        currentApiKeyRef.current &&
        currentLanguageRef.current !== null &&
        currentDictionaryEntriesRef.current !== null
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

    // Calculate buffer health: ratio of processing time to audio time
    const health = 1 - processingTime / audioTime;
    setBufferHealth(health);

    lastProcessTimeRef.current = endTime;
    processingAudioRef.current = false;

    // If we have more chunks, schedule the next processing
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
  ): Promise<void> => {
    try {
      // Store the credentials for potential reconnection
      currentApiKeyRef.current = apiKey;
      currentLanguageRef.current = language;
      currentDictionaryEntriesRef.current = dictionaryEntries;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
      });

      // Store the stream reference for cleanup
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
        'Error accessing microphone. Please check your microphone permissions.',
      );
      cleanupRecording();
    }
  };

  const switchApiKey = async (
    newApiKey: string,
    language: string,
    dictionaryEntries: DictionaryEntry[] = [],
  ): Promise<void> => {
    try {
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

      // Start new session with new API key and same language
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
