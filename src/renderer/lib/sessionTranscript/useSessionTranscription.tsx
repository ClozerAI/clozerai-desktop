'use client';

import { useCallback, useEffect, useState } from 'react';
import useAudioTap, { Status } from './useAudioTap';
import useMicrophoneTranscription from './useMicrophoneTranscription';
import useCombinedTranscript from './useCombinedTranscript';
import { CreateMessage, Message, useChat } from '@ai-sdk/react';
import { useMutation } from '@tanstack/react-query';
import resizeImage from '../resizeImage';
import { toast } from 'sonner';
import { api, NEXTJS_API_URL, RouterOutputs } from '../trpc/react';
import { osVersion, os } from '../useVersion';

type UseSessionTranscriptionProps = {
  callSessionId: string | null;
  version: string;
};

export default function useSessionTranscription({
  callSessionId,
  version,
}: UseSessionTranscriptionProps) {
  const {
    data: callSession,
    isLoading: callSessionLoading,
    error: callSessionError,
  } = api.callSession.get.useQuery(
    { id: callSessionId || '' },
    {
      enabled: !!callSessionId,
      refetchInterval: 15000,
    },
  );

  useEffect(() => {
    if (callSessionError) {
      toast.error(callSessionError.message);
    }
  }, [callSessionError]);

  const utils = api.useUtils();

  // Session mutations
  const {
    mutateAsync: _generateSpeechmaticsSession,
    isPending: generateSpeechmaticsSessionLoading,
    error: generateSpeechmaticsSessionError,
  } = api.callSession.generateSpeechmaticsSession.useMutation({
    onSuccess: (data) => {
      utils.callSession.get.setData({ id: data.id }, data);
      handleSessionExtended(data);
    },
    onError: (error) => {
      console.error('Error activating speechmatics session:', error);
    },
  });

  const generateSpeechmaticsSession = useCallback(
    async (id: string) => {
      return _generateSpeechmaticsSession({
        id,
        platform: 'desktop-app',
        osVersion,
        version,
        os,
      });
    },
    [_generateSpeechmaticsSession],
  );

  useEffect(() => {
    if (generateSpeechmaticsSessionError) {
      toast.error(generateSpeechmaticsSessionError.message);
    }
  }, [generateSpeechmaticsSessionError]);

  // Transcription states
  const [startingMicrophoneTranscription, setStartingMicrophoneTranscription] =
    useState(false);

  // Combined transcript management
  const {
    addTranscript: addToCombinedTranscript,
    getCombinedTranscriptString,
    clearCombinedTranscript,
    combinedTranscript,
  } = useCombinedTranscript(callSession?.id, callSession?.saveTranscription);

  // audio tap transcription hook
  const {
    status: audioTapStatus,
    startTranscription: startAudioTapTranscription,
    stopRecording: stopAudioTapRecording,
    switchApiKey: switchAudioTapApiKey,
  } = useAudioTap(
    (transcript) => {
      if (!transcript) return;

      addToCombinedTranscript(transcript, 'share', false);
    },
    (partialTranscript) => {
      addToCombinedTranscript(partialTranscript, 'share', true);
    },
  );

  // Microphone transcription hook
  const {
    isRecording: isRecordingMicrophone,
    startTranscription: startMicrophoneTranscription,
    stopRecording: stopMicrophoneRecording,
    switchApiKey: switchMicrophoneApiKey,
  } = useMicrophoneTranscription(
    (transcript) => {
      if (!transcript) return;

      addToCombinedTranscript(transcript, 'microphone', false);
    },
    (partialTranscript) => {
      addToCombinedTranscript(partialTranscript, 'microphone', true);
    },
  );

  const { mutate: saveAiAnswer } = api.aiAnswers.save.useMutation();
  const { mutate: pingSession } = api.callSession.ping.useMutation();

  // Chat functionality
  const { messages, append, stop, setMessages, status } = useChat({
    api: `${NEXTJS_API_URL}/api/chat`,
    body: {
      callSessionId: callSession?.id,
      userId: callSession?.userId,
      workspaceId: callSession?.workspaceId,
    },
    onError: (error) => {
      toast.error(error.message);
    },
    onFinish: (message) => {
      if (
        message.role === 'assistant' &&
        callSession?.id &&
        callSession.saveTranscription
      ) {
        saveAiAnswer({
          callSessionId: callSession?.id,
          content: message.content,
          role: message.role,
          createdAt: message.createdAt || new Date(),
        });
      }
    },
    experimental_throttle: 50,
  });

  function appendAndSave(message: Message | CreateMessage) {
    append(message);

    if (
      message.role === 'user' &&
      callSession?.id &&
      callSession.saveTranscription
    ) {
      saveAiAnswer({
        callSessionId: callSession?.id,
        content: message.content,
        role: message.role,
        createdAt: message.createdAt || new Date(),
      });
    }
  }

  const [chatInput, setChatInput] = useState('');

  // Session timer and expiration handling
  const [now, setTime] = useState<Date>(new Date());
  const timeLeft = callSession?.speechmaticsTokenExpiresAt
    ? new Date(callSession.speechmaticsTokenExpiresAt).getTime() - now.getTime()
    : null;

  const [hasAutoExtended, setHasAutoExtended] = useState(false);
  const [
    hasChatActivitySinceLastExtension,
    setHasChatActivitySinceLastExtension,
  ] = useState(true);

  const { data: user } = api.user.getUserProfile.useQuery();

  // Auto-extension logic
  const willAutoExtend = !!(
    callSession?.timeLeft &&
    callSession.timeLeft < 360000 &&
    !generateSpeechmaticsSessionLoading &&
    (user?.currentWorkspace
      ? user.currentWorkspace.hasActiveSubscription
      : user?.hasActiveSubscription) &&
    !callSession.trial &&
    hasChatActivitySinceLastExtension
  );

  const canAutoExtend = !!(
    callSession?.timeLeft &&
    callSession.timeLeft > 360000 &&
    !generateSpeechmaticsSessionLoading &&
    (user?.currentWorkspace
      ? user.currentWorkspace.hasActiveSubscription
      : user?.hasActiveSubscription) &&
    !callSession.trial &&
    hasChatActivitySinceLastExtension
  );

  // Session extended handler
  async function handleSessionExtended(
    newCallSession: RouterOutputs['callSession']['get'],
  ) {
    let speechmaticsApiKey = newCallSession?.speechmaticsApiKey!;

    if (audioTapStatus === Status.RECORDING) {
      switchAudioTapApiKey(speechmaticsApiKey!, newCallSession.language);
    }
    if (isRecordingMicrophone) {
      switchMicrophoneApiKey(speechmaticsApiKey!, newCallSession.language);
    }

    setHasChatActivitySinceLastExtension(false);
  }

  // Start audio tap recording
  const handleStartAudioTapTranscription = useCallback(async () => {
    if (!callSession) return;

    try {
      let speechmaticsApiKey = callSession.speechmaticsApiKey;
      if (!speechmaticsApiKey) {
        const activatedCallSession = await generateSpeechmaticsSession(
          callSession.id,
        );
        speechmaticsApiKey = activatedCallSession.speechmaticsApiKey;
      }

      await startAudioTapTranscription(
        speechmaticsApiKey!,
        callSession.language,
      );
    } catch (error) {
      console.error('Audio tap transcription error:', error);
    }
  }, [callSession, generateSpeechmaticsSession, startAudioTapTranscription]);

  // Start microphone transcription
  const handleStartMicrophoneTranscription = useCallback(async () => {
    if (!callSession) return;

    setStartingMicrophoneTranscription(true);

    try {
      let speechmaticsApiKey = callSession.speechmaticsApiKey;
      if (!speechmaticsApiKey) {
        const activatedCallSession = await generateSpeechmaticsSession(
          callSession.id,
        );
        speechmaticsApiKey = activatedCallSession.speechmaticsApiKey;
      }

      await startMicrophoneTranscription(
        speechmaticsApiKey!,
        callSession.language,
      );
    } finally {
      setStartingMicrophoneTranscription(false);
    }
  }, [callSession, generateSpeechmaticsSession, startMicrophoneTranscription]);

  // Stop microphone transcription
  const handleStopMicrophoneTranscription = useCallback(() => {
    stopMicrophoneRecording();
  }, [stopMicrophoneRecording]);

  // Chat message preparation
  const prepareMessagesForNewMessage = useCallback(() => {
    // Keep at most last 10 messages and remove images from any older user messages
    const newMessages = messages.slice(-10).map((m, idx, arr) => {
      const isLast = idx === arr.length - 1;
      // @ts-expect-error
      if (m.role === 'user' && m.data?.imageUrl && !isLast) {
        // @ts-expect-error
        return { ...m, data: { ...m.data, imageUrl: undefined } };
      }
      return m;
    });
    setMessages(newMessages);
  }, [messages, setMessages]);

  // Generate AI response
  const handleGenerateResponse = useCallback(
    async (promptId: 'ai-help' | 'what-to-say' | 'direct-message' | string) => {
      setHasChatActivitySinceLastExtension(true);

      stop();
      await new Promise((resolve) => setTimeout(resolve, 0));

      prepareMessagesForNewMessage();

      let content =
        promptId === 'direct-message'
          ? '**Direct Message from Sales Agent**: ' + chatInput
          : chatInput || getCombinedTranscriptString();

      // Pass task in message data instead of appending to content
      appendAndSave({
        role: 'user',
        content,
        data: { promptId },
      });

      if (promptId === 'direct-message') {
        setChatInput('');
      } else {
        clearCombinedTranscript();
      }
    },
    [
      stop,
      prepareMessagesForNewMessage,
      appendAndSave,
      getCombinedTranscriptString,
      clearCombinedTranscript,
    ],
  );

  const {
    mutateAsync: captureScreenshotMutate,
    isPending: isCapturingScreenshot,
    error: captureScreenshotError,
  } = useMutation({
    mutationFn: window.electron?.ipcRenderer.captureScreenshot,
  });

  useEffect(() => {
    if (captureScreenshotError) {
      toast.error(captureScreenshotError.message);
    }
  }, [captureScreenshotError]);

  const handleGenerateResponseWithScreenshot = useCallback(async () => {
    setHasChatActivitySinceLastExtension(true);

    stop();

    try {
      const dataUrl = await captureScreenshotMutate();

      // Resize the image to max 1080p before sending
      const resizedDataUrl = await resizeImage(dataUrl);

      prepareMessagesForNewMessage();

      // Send as a new user message containing text + image
      appendAndSave({
        role: 'user',
        content: 'Analyze the screen and provide a useful response.',
        data: { imageUrl: resizedDataUrl, promptId: 'analyze-screen' },
      });
    } catch (err) {
      console.error('Listen error:', err);
    }
  }, [
    stop,
    captureScreenshotMutate,
    appendAndSave,
    prepareMessagesForNewMessage,
  ]);

  // Stop all recordings
  const handleStopAllRecording = useCallback(() => {
    stopAudioTapRecording();
    stopMicrophoneRecording();
  }, [stopAudioTapRecording, stopMicrophoneRecording]);

  // Clear all chat messages
  const handleClearAllAnswers = useCallback(() => {
    stop();
    setMessages([]);
  }, [stop, setMessages]);

  // Reset all session state - for when exiting with active session
  const handleResetSession = useCallback(() => {
    // Stop all recording
    stopAudioTapRecording();
    stopMicrophoneRecording();

    // Clear all AI messages and chat
    stop();
    setMessages([]);

    // Clear combined transcripts
    clearCombinedTranscript();

    // Clear chat input
    setChatInput('');
  }, [
    stopAudioTapRecording,
    stopMicrophoneRecording,
    stop,
    setMessages,
    clearCombinedTranscript,
    setChatInput,
  ]);

  // Effects

  // Timer update effect
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => {
      clearInterval(interval);
    };
  }, []);

  // Stop recording when session expires
  useEffect(() => {
    if (callSession?.hasEnded) {
      handleStopAllRecording();
    }
  }, [callSession?.hasEnded, stopAudioTapRecording, stopMicrophoneRecording]);

  // Auto-extension logic
  useEffect(() => {
    if (
      willAutoExtend &&
      timeLeft &&
      timeLeft < 60000 &&
      !hasAutoExtended &&
      !callSession.hasEnded
    ) {
      setHasAutoExtended(true);
      if (callSession) {
        generateSpeechmaticsSession(callSession.id);
      }
    }
  }, [
    willAutoExtend,
    timeLeft,
    hasAutoExtended,
    callSession,
    generateSpeechmaticsSession,
  ]);

  useEffect(() => {
    if (timeLeft && timeLeft > 60000 && hasAutoExtended) {
      setHasAutoExtended(false);
    }
  }, [timeLeft, hasAutoExtended]);

  // Ping system: send ping every 15 seconds when session is active
  useEffect(() => {
    if (!callSession || callSession.hasEnded || !callSession.activatedAt) {
      return;
    }

    pingSession({ callSessionId: callSession.id });

    const interval = setInterval(() => {
      pingSession({ callSessionId: callSession.id });
    }, 15000); // 15 seconds

    return () => {
      clearInterval(interval);
    };
  }, [callSession]);

  return {
    // Call session data
    callSession,
    callSessionLoading,
    callSessionError,

    // Generate speechmatics session
    generateSpeechmaticsSession,
    generateSpeechmaticsSessionLoading,
    generateSpeechmaticsSessionError,

    // Session expiration
    timeLeft,
    willAutoExtend,
    canAutoExtend,

    // Audio tap transcription
    audioTapStatus,
    handleStartAudioTapTranscription,
    stopAudioTapRecording,

    // Microphone transcription
    isRecordingMicrophone,
    startingMicrophoneTranscription,
    handleStartMicrophoneTranscription,
    handleStopMicrophoneTranscription,

    // Screenshot functionality
    isCapturingScreenshot,
    handleGenerateResponseWithScreenshot,

    // Chat functionality
    messages,
    isLoading: status === 'submitted' || status === 'streaming',
    chatInput,
    setChatInput,
    handleGenerateResponse,
    handleClearAllAnswers,

    // Combined transcript
    combinedTranscript,
    clearTranscripts: clearCombinedTranscript,

    // Session reset
    handleResetSession,
  };
}
