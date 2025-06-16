import { useEffect, useCallback, useMemo, useState, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import {
  Mic,
  X,
  Command,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  RotateCcw,
  MoreHorizontal,
  RefreshCcw,
  Info,
  Video,
} from 'lucide-react';
import { CodeBlock } from './components/CodeBlock';
import { Button } from './components/ui/button';
import { cn } from './lib/utils';
import SessionTimerTooltip from './components/SessionTimerTooltip';
import { useAudioTap, Status } from './lib/useAudioTap';
import { useInterviewSession } from './lib/useInterviewSession';
import { useExtendSession } from './lib/useExtendSession';
import { useActivateSession } from './lib/useActivateSession';
import icon from '../../assets/icon.png';

// @ts-ignore
import Markdown, { Components } from 'react-markdown';
import { Tooltip, TooltipContent } from './components/ui/tooltip';
import { TooltipTrigger } from './components/ui/tooltip';
import { useMutation } from '@tanstack/react-query';
import { Input } from './components/ui/input';
import useVersion from './lib/useVersion';
import resizeImage from './lib/resizeImage';

const isMac = window.electron?.platform === 'darwin';

function ShortcutIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return <Command className={className} />;
}

export default function App() {
  const { data: version, isLoading: loadingVersion } = useVersion();

  const [hide, _setHide] = useState(false);
  const hideRef = useRef(false);
  const setHide = (value: boolean) => {
    hideRef.current = value;
    _setHide(value);
    if (value) {
      onMouseLeave();
    }
  };

  const [inputInterviewSessionId, setInputInterviewSessionId] =
    useState<string>('');
  const [interviewSessionId, setInterviewSessionId] = useState<string | null>(
    null,
  );

  const [showEnterIdManually, setShowEnterIdManually] = useState(false);

  const {
    data: interviewSession,
    error: interviewSessionError,
    isLoading: interviewSessionLoading,
    refetch: refetchInterviewSession,
    isSuccess: interviewSessionIsSuccess,
  } = useInterviewSession(interviewSessionId);

  const interviewSessionErrorRef = useRef(interviewSessionError);
  if (interviewSessionError || interviewSessionIsSuccess)
    interviewSessionErrorRef.current = interviewSessionError;

  function handleLoadInterviewSession() {
    interviewSessionErrorRef.current = null;
    if (inputInterviewSessionId !== interviewSessionId) {
      setInterviewSessionId(inputInterviewSessionId);
    } else {
      refetchInterviewSession();
    }
  }

  useEffect(() => {
    if (interviewSession?.speechmaticsApiKey && !interviewSession.expired) {
      startListening();
    }
  }, [interviewSession?.speechmaticsApiKey]);

  const timeLeft = interviewSession?.endsAt
    ? new Date(interviewSession.endsAt).getTime() - new Date().getTime()
    : null;

  // Force rerender every second if less than 60 seconds left
  const [_, setTick] = useState(0);

  useEffect(() => {
    if (timeLeft !== null && timeLeft <= 125000 && timeLeft > 0) {
      const interval = setInterval(() => {
        setTick((t) => t + 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [timeLeft]);

  const {
    mutate: activateSession,
    error: activateSessionError,
    isPending: isActivatingSession,
  } = useActivateSession(version || 'unknown', interviewSession?.id);

  const { mutate: extendSession, isPending: isExtendingSession } =
    useExtendSession(interviewSession?.id, (res) => {
      switchSpeechmaticsApiKey(res.speechmaticsApiKey!);
    });

  const {
    status,
    error: audioTapError,
    startListening,
    stopListening,
    finalTranscription,
    partialTranscription,
    clearTranscription,
    switchSpeechmaticsApiKey,
    clearError,
  } = useAudioTap(
    interviewSession?.speechmaticsApiKey,
    interviewSession?.language,
  );

  const {
    mutateAsync: captureScreenshotMutate,
    isPending: isCapturingScreenshot,
    error: captureScreenshotError,
  } = useMutation({
    mutationFn: window.electron?.ipcRenderer.captureScreenshot,
  });

  const { messages, append, stop, setMessages, isLoading, error } = useChat({
    api: 'https://www.parakeet-ai.com/api/chat',
    body: {
      interviewSessionId: interviewSession?.id,
      resumeString: interviewSession?.resumeString,
    },
  });

  useEffect(() => {
    if (error) {
      console.error('Error in useChat:', error);
    }
  }, [error]);

  // Helper function to manage message history
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

  const handleGenerateResponse = useCallback(
    async (customMessage?: string) => {
      stop();
      await new Promise((resolve) => setTimeout(resolve, 0));

      prepareMessagesForNewMessage();

      append({
        role: 'user',
        content: customMessage || finalTranscription + partialTranscription,
      });

      if (!customMessage) {
        clearTranscription();
      }
    },
    [
      stop,
      prepareMessagesForNewMessage,
      append,
      finalTranscription,
      partialTranscription,
      clearTranscription,
    ],
  );

  const handleGenerateResponseWithScreenshot = useCallback(async () => {
    stop();

    try {
      const dataUrl = await captureScreenshotMutate();

      // Resize the image to max 1080p before sending
      const resizedDataUrl = await resizeImage(dataUrl);

      prepareMessagesForNewMessage();

      // Send as a new user message containing text + image
      append({
        role: 'user',
        content:
          "This is a screenshot of the interviewee's screen. Analyze the screen and provide a useful response.",
        data: { imageUrl: resizedDataUrl },
      });
    } catch (err) {
      console.error('Listen error:', err);
    }
  }, [stop, captureScreenshotMutate, append, prepareMessagesForNewMessage]);

  function onMouseEnter() {
    window.electron?.ipcRenderer.sendMessage(
      'ipc-toggle-ignore-mouse-events',
      false,
    );
  }

  function onMouseLeave() {
    window.electron?.ipcRenderer.sendMessage(
      'ipc-toggle-ignore-mouse-events',
      true,
    );
  }

  function handleExit() {
    window.electron?.ipcRenderer.quitApp();
  }

  function handleClearAIAnswer() {
    stop();
    setMessages([]);
    onMouseLeave();
  }

  const markdownComponents = useMemo(() => {
    return {
      code: CodeBlock as Components['code'],
    };
  }, []);

  const isSessionValid = interviewSession && !interviewSession.expired;

  const expiredSession = interviewSession && interviewSession.expired;

  const nonActivatedSession =
    interviewSession &&
    !interviewSession.speechmaticsApiKey &&
    !interviewSession.expired;

  const activatedSession =
    interviewSession &&
    interviewSession.speechmaticsApiKey &&
    !interviewSession.expired;

  useEffect(() => {
    if (!activatedSession) {
      stopListening();
    }
  }, [activatedSession]);

  const willAutoExtend = !!(
    interviewSession?.timeLeft &&
    interviewSession.timeLeft < 360000 &&
    !isExtendingSession &&
    interviewSession?.canExtend &&
    !interviewSession?.trial
  );

  const canAutoExtend = !!(
    interviewSession?.timeLeft &&
    interviewSession.timeLeft > 360000 &&
    !isExtendingSession &&
    interviewSession?.canExtend &&
    !interviewSession?.trial
  );

  const [hasAutoExtended, setHasAutoExtended] = useState(false);

  useEffect(() => {
    if (
      willAutoExtend &&
      interviewSession?.timeLeft &&
      interviewSession.timeLeft < 60000 &&
      !hasAutoExtended
    ) {
      setHasAutoExtended(true);
      extendSession();
    }
  }, [willAutoExtend, hasAutoExtended, interviewSession?.timeLeft]);

  useEffect(() => {
    if (
      interviewSession?.timeLeft &&
      interviewSession.timeLeft > 60000 &&
      hasAutoExtended
    ) {
      setHasAutoExtended(false);
    }
  }, [interviewSession?.timeLeft, hasAutoExtended]);

  const setHideAndResize = (value: boolean) => {
    setHide(value);
    if (window.electron?.ipcRenderer) {
      window.electron.ipcRenderer.sendMessage(
        'ipc-set-window-width',
        value ? 280 : 1000, // 1000 is your default width
      );
    }
  };

  // Update keyboard shortcut handlers
  useEffect(() => {
    if (!window.electron?.ipcRenderer) return;

    const toggleHideHandler = () => {
      setHideAndResize(!hideRef.current);
    };

    const answerQuestionHandler = () => {
      if (activatedSession && status === Status.LISTENING) {
        handleGenerateResponse();
      }
    };

    const analyseScreenHandler = () => {
      if (activatedSession) {
        handleGenerateResponseWithScreenshot();
      }
    };

    const unsubscribeToggleHide = window.electron.ipcRenderer.on(
      'ipc-toggle-hide',
      toggleHideHandler,
    );

    const unsubscribeAnswerQuestion = window.electron.ipcRenderer.on(
      'ipc-answer-question',
      answerQuestionHandler,
    );

    const unsubscribeAnalyseScreen = window.electron.ipcRenderer.on(
      'ipc-analyse-screen',
      analyseScreenHandler,
    );

    return () => {
      unsubscribeToggleHide();
      unsubscribeAnswerQuestion();
      unsubscribeAnalyseScreen();
    };
  }, [
    activatedSession,
    status,
    handleGenerateResponse,
    handleGenerateResponseWithScreenshot,
  ]);

  // Add new useEffect for protocol handling
  useEffect(() => {
    if (!window.electron?.ipcRenderer) return;

    const loadSessionHandler = (...args: unknown[]) => {
      console.log('Received args:', args);
      const sessionId = args[0] as string;
      console.log('Received session ID from protocol:', sessionId);
      // Set the session ID to trigger loading
      setInterviewSessionId(sessionId);
      setInputInterviewSessionId(sessionId);
      // Show the window if it's hidden
      if (hideRef.current) {
        setHideAndResize(false);
      }
    };

    const unsubscribeLoadSession = window.electron.ipcRenderer.on(
      'ipc-load-session',
      loadSessionHandler,
    );

    return () => {
      unsubscribeLoadSession();
    };
  }, [setInterviewSessionId, setInputInterviewSessionId, setHideAndResize]);

  // Add window positioning functions
  function handleMoveLeft() {
    window.electron?.ipcRenderer.sendMessage('ipc-move-window-left');
  }

  function handleMoveRight() {
    window.electron?.ipcRenderer.sendMessage('ipc-move-window-right');
  }

  function handleWidenWindow() {
    window.electron?.ipcRenderer.sendMessage('ipc-widen-window');
  }

  function handleNarrowWindow() {
    window.electron?.ipcRenderer.sendMessage('ipc-narrow-window');
  }

  function handleResetWindow() {
    window.electron?.ipcRenderer.sendMessage('ipc-reset-window');
  }

  // Add state for tracking logo clicks and content protection
  const [logoClickCount, setLogoClickCount] = useState(0);
  const [contentProtectionDisabled, setContentProtectionDisabled] =
    useState(false);
  const logoClickTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Add function to handle logo clicks
  const handleLogoClick = (event: React.MouseEvent<HTMLImageElement>) => {
    // Only proceed if Command key is held
    if (!event.metaKey) {
      setLogoClickCount(0); // Optionally reset if not held
      return;
    }
    const newCount = logoClickCount + 1;
    setLogoClickCount(newCount);

    // Clear existing timeout
    if (logoClickTimeoutRef.current) {
      clearTimeout(logoClickTimeoutRef.current);
    }

    if (newCount === 5) {
      // Toggle content protection after 5 clicks
      const newState = !contentProtectionDisabled;
      setContentProtectionDisabled(newState);
      window.electron?.ipcRenderer.sendMessage(
        'ipc-toggle-content-protection',
        newState,
      );
      setLogoClickCount(0);
    } else {
      // Reset counter after 2 seconds if not reached 5 clicks
      logoClickTimeoutRef.current = setTimeout(() => {
        setLogoClickCount(0);
      }, 2000);
    }
  };

  useEffect(() => {
    if (!window.electron?.ipcRenderer) return;

    const clearMessagesHandler = () => {
      handleClearAIAnswer();
    };

    const unsubscribeClearMessages = window.electron.ipcRenderer.on(
      'ipc-clear-messages',
      clearMessagesHandler,
    );

    return () => {
      unsubscribeClearMessages();
    };
  }, [handleClearAIAnswer]);

  // Add state for assistant message navigation
  const [assistantMessageIndex, setAssistantMessageIndex] = useState<number>(0);

  // Filter only assistant messages
  const assistantMessages = useMemo(() => {
    const tempMessages = messages.filter((m) => m.role === 'assistant');
    if (messages[messages.length - 1]?.role === 'user') {
      // Add a thinking message to the end of the messages if the last message is a user
      tempMessages.push({
        id: 'thinking',
        role: 'assistant',
        content: '',
        parts: [],
      });
    }
    return tempMessages;
  }, [messages]);

  // Determine which assistant message to show
  const currentAssistantMessage =
    assistantMessages.length === 0
      ? null
      : assistantMessageIndex === null
        ? assistantMessages[assistantMessages.length - 1]
        : assistantMessages[assistantMessageIndex];

  // Handlers for navigation
  const handlePrevAssistantMessage = () => {
    if (assistantMessages.length === 0) return;
    setAssistantMessageIndex((prev) => {
      return Math.max(prev - 1, 0);
    });
  };

  const handleNextAssistantMessage = () => {
    if (assistantMessages.length === 0) return;
    setAssistantMessageIndex((prev) => {
      return prev + 1;
    });
  };

  // Reset index when new message arrives
  useEffect(() => {
    setAssistantMessageIndex(assistantMessages.length - 1);
  }, [assistantMessages.length]);

  if (hide) {
    return (
      <div className="flex flex-col w-full gap-2">
        <div className="flex flex-col gap-2 items-center justify-center h-full p-2.5 bg-black/50 rounded-lg">
          <div className="flex flex-col w-full justify-center items-center gap-1">
            <div className="flex flex-row justify-between  w-full h-full">
              <div className="flex flex-row justify-center gap-2">
                <img width="150" alt="icon" src={icon} />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onMouseEnter={onMouseEnter}
                      onMouseLeave={onMouseLeave}
                      size="sm"
                      onClick={() => setHideAndResize(false)}
                    >
                      Show
                    </Button>
                  </TooltipTrigger>
                  {isMac && (
                    <TooltipContent
                      side="top"
                      className="flex flex-row items-center gap-1"
                    >
                      <ShortcutIcon /> + E
                    </TooltipContent>
                  )}
                </Tooltip>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleExit}
                  onMouseEnter={onMouseEnter}
                  onMouseLeave={onMouseLeave}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="max-h-screen overflow-hidden flex flex-col w-full gap-2"
      onMouseLeave={onMouseLeave}
    >
      <div className="flex flex-col gap-2 items-center justify-center h-full p-2.5 bg-black/50 rounded-lg text-center">
        <div className="flex flex-col w-full justify-center items-center gap-1">
          <div className="flex flex-row justify-between  w-full h-full">
            <div className="flex flex-row justify-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <img
                    width="150"
                    alt="icon"
                    src={icon}
                    onClick={handleLogoClick}
                    className="cursor-pointer"
                    onMouseEnter={onMouseEnter}
                    onMouseLeave={onMouseLeave}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  {loadingVersion ? 'Loading...' : version}
                  {contentProtectionDisabled
                    ? ' (Content Protection Disabled)'
                    : ''}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onMouseEnter={onMouseEnter}
                    onMouseLeave={onMouseLeave}
                    size="sm"
                    onClick={() => setHideAndResize(true)}
                  >
                    Hide
                  </Button>
                </TooltipTrigger>
                {isMac && (
                  <TooltipContent
                    side="top"
                    className="flex flex-row items-center gap-1"
                  >
                    <ShortcutIcon /> + E
                  </TooltipContent>
                )}
              </Tooltip>

              <div className="flex flex-row items-center">
                {/* Window positioning buttons in tooltip */}
                <Tooltip delayDuration={100}>
                  <TooltipTrigger asChild>
                    <Button
                      onMouseEnter={onMouseEnter}
                      onMouseLeave={onMouseLeave}
                      size="sm"
                      className="bg-transparent shadow-none"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent
                    side="bottom"
                    className="p-2 border border-neutral-800"
                    onPointerEnter={(e) => e.preventDefault()}
                    onPointerLeave={(e) => e.preventDefault()}
                  >
                    <div className="flex flex-row items-center gap-1">
                      <Button
                        onMouseEnter={onMouseEnter}
                        onMouseLeave={onMouseLeave}
                        size="sm"
                        onClick={handleMoveLeft}
                        className="bg-transparent hover:bg-white/20"
                        title="Move Left"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>

                      <Button
                        onMouseEnter={onMouseEnter}
                        onMouseLeave={onMouseLeave}
                        size="sm"
                        onClick={handleMoveRight}
                        className="bg-transparent hover:bg-white/20"
                        title="Move Right"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>

                      <Button
                        onMouseEnter={onMouseEnter}
                        onMouseLeave={onMouseLeave}
                        size="sm"
                        onClick={handleNarrowWindow}
                        className="bg-transparent hover:bg-white/20"
                        title="Narrow"
                      >
                        <Minimize2 className="w-4 h-4" />
                      </Button>

                      <Button
                        onMouseEnter={onMouseEnter}
                        onMouseLeave={onMouseLeave}
                        size="sm"
                        onClick={handleWidenWindow}
                        className="bg-transparent hover:bg-white/20"
                        title="Widen"
                      >
                        <Maximize2 className="w-4 h-4" />
                      </Button>

                      <Button
                        onMouseEnter={onMouseEnter}
                        onMouseLeave={onMouseLeave}
                        size="sm"
                        onClick={handleResetWindow}
                        className="bg-transparent hover:bg-white/20"
                        title="Reset Position & Size"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </Button>
                    </div>
                  </TooltipContent>
                </Tooltip>
                {/* Info icon and tooltip */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" className="bg-transparent shadow-none">
                      <Info className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent
                    side="bottom"
                    className="max-w-[420px] text-center leading-5 border border-neutral-800"
                  >
                    Ensure you're using the latest versions of your OS and video
                    calling software. Always test ParakeetAI's privacy in a safe
                    environment before your actual interview.{' '}
                    <a
                      href="https://www.youtube.com/watch?v=svlsxESqGCc"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-4"
                      onMouseEnter={onMouseEnter}
                      onMouseLeave={onMouseLeave}
                    >
                      <Video className="inline size-4" /> Video Tutorial
                    </a>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>

            <div className="flex flex-row items-center gap-2">
              {!activatedSession && (
                <a target="_blank" href="https://www.parakeet-ai.com/dashboard">
                  <Button
                    onMouseEnter={onMouseEnter}
                    onMouseLeave={onMouseLeave}
                    size="sm"
                  >
                    Dashboard
                  </Button>
                </a>
              )}
              {activatedSession && (
                <SessionTimerTooltip
                  timeLeft={timeLeft}
                  isExtendingSession={isExtendingSession}
                  willAutoExtend={willAutoExtend}
                  canAutoExtend={canAutoExtend}
                  trial={interviewSession?.trial}
                  canExtend={interviewSession?.canExtend}
                />
              )}
              {activatedSession && status === Status.LISTENING ? (
                <Button
                  onMouseEnter={onMouseEnter}
                  onMouseLeave={onMouseLeave}
                  size="sm"
                  onClick={stopListening}
                  className="flex flex-row items-center gap-2"
                >
                  Stop Listening
                  <span
                    className={cn(
                      'h-3 w-3 rounded-full bg-red-500 shadow-lg',
                      'animate-[pulse_1.5s_cubic-bezier(0.4,0,0.6,1)_infinite]',
                      'before:-ml-1.5 before:absolute before:h-3 before:w-3 before:rounded-full before:bg-red-500/50',
                      'before:animate-[ping_1.5s_cubic-bezier(0,0,0.2,1)_infinite]',
                    )}
                  />
                </Button>
              ) : (
                activatedSession && (
                  <Button
                    onMouseEnter={onMouseEnter}
                    onMouseLeave={onMouseLeave}
                    size="sm"
                    onClick={() => startListening()}
                    disabled={status === Status.STARTING}
                  >
                    {status === Status.STARTING
                      ? 'Connecting...'
                      : 'Start Listening'}
                    <Mic className="w-4 h-4" />
                  </Button>
                )
              )}
              <Button
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
                size="sm"
                variant="destructive"
                onClick={handleExit}
              >
                Exit
              </Button>
            </div>
          </div>
          {activatedSession && status === Status.LISTENING && (
            <div className="min-h-8 w-full text-white text-center flex flex-row items-center justify-center">
              <div className="relative h-8 w-full overflow-hidden">
                <div className="text-white absolute right-0 min-w-full items-center whitespace-nowrap flex flex-row gap-1">
                  {finalTranscription || partialTranscription ? (
                    <>
                      {finalTranscription}
                      <span className="opacity-70 w-full text-left">
                        {partialTranscription}
                      </span>
                    </>
                  ) : (
                    <span className="opacity-70 w-full text-left">
                      Listening...
                    </span>
                  )}
                  <Button
                    onMouseEnter={onMouseEnter}
                    onMouseLeave={onMouseLeave}
                    size="sm"
                    onClick={clearTranscription}
                  >
                    Clear
                  </Button>
                </div>
              </div>
            </div>
          )}
          {!isSessionValid && (
            <div className="text-white bg-black/50 rounded-lg p-2 px-4">
              Create a session in the dashboard and click "Open in Desktop App"
              to start.{' '}
              {!showEnterIdManually && (
                <span
                  onClick={() => setShowEnterIdManually(true)}
                  onMouseEnter={onMouseEnter}
                  onMouseLeave={onMouseLeave}
                  className="underline"
                >
                  Enter ID manually.
                </span>
              )}
            </div>
          )}
          {showEnterIdManually && !isSessionValid && (
            <div className="flex flex-row items-center gap-2 w-full justify-center">
              <Input
                placeholder="Interview Session ID"
                className="bg-white w-full max-w-xs"
                value={inputInterviewSessionId}
                disabled={
                  interviewSessionLoading && !interviewSessionErrorRef.current
                }
                onChange={(e) => setInputInterviewSessionId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleLoadInterviewSession();
                  }
                }}
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
              />
              <Button
                onClick={handleLoadInterviewSession}
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
                disabled={
                  interviewSessionLoading && !interviewSessionErrorRef.current
                }
              >
                {interviewSessionLoading && !interviewSessionErrorRef.current
                  ? 'Loading...'
                  : 'Load'}
              </Button>
            </div>
          )}
          {interviewSessionLoading && !interviewSessionErrorRef.current && (
            <div className="text-white bg-black/50 rounded-lg p-2 px-4">
              Loading session...
            </div>
          )}
          {interviewSessionErrorRef.current && (
            <div className="text-white bg-black/50 rounded-lg p-2 px-4">
              Interview Session Error:{' '}
              {interviewSessionErrorRef.current.message}
            </div>
          )}
          {nonActivatedSession && (
            <>
              <div className="flex flex-row items-center gap-2">
                <Button
                  onMouseEnter={onMouseEnter}
                  onMouseLeave={onMouseLeave}
                  size="sm"
                  onClick={() => activateSession()}
                  disabled={isActivatingSession}
                >
                  {isActivatingSession
                    ? 'Activating...'
                    : 'Activate and Connect'}
                </Button>
              </div>
              {!interviewSession.trial && (
                <div className="text-white bg-black/50 rounded-lg p-2 px-4">
                  Activating the session will use 0.5 of an interview credit. 1
                  minute before the session ends it will auto extend for another
                  30 minutes.
                </div>
              )}
            </>
          )}
          {activateSessionError && (
            <div className="text-white bg-black/50 rounded-lg p-2 px-4">
              Activate Session Error: {activateSessionError.message}
            </div>
          )}
          {expiredSession && (
            <div className="text-white bg-black/50 rounded-lg p-2 px-4">
              Session has expired. Please create and start a new one in the
              dashboard.
            </div>
          )}
          {audioTapError && (
            <div className="text-white bg-black/50 rounded-lg p-2 px-4 flex flex-row items-center gap-2">
              <span>Audio Tap Error: {audioTapError}</span>
              <Button
                size="sm"
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
                onClick={() => startListening()}
              >
                Retry <RefreshCcw className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
                onClick={() => clearError()}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          )}
          {activatedSession && (
            <div className="flex flex-row items-center gap-2 mt-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      onMouseEnter={onMouseEnter}
                      onMouseLeave={onMouseLeave}
                      size="sm"
                      disabled={status !== Status.LISTENING}
                      onClick={() => handleGenerateResponse()}
                    >
                      Answer Question
                    </Button>
                  </span>
                </TooltipTrigger>

                {status === Status.LISTENING ? (
                  isMac ? (
                    <TooltipContent>
                      <div className="flex flex-row items-center gap-1">
                        <ShortcutIcon /> + G
                      </div>
                    </TooltipContent>
                  ) : null
                ) : (
                  <TooltipContent>
                    You need to start listening to answer questions.
                  </TooltipContent>
                )}
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onMouseEnter={onMouseEnter}
                    onMouseLeave={onMouseLeave}
                    disabled={isCapturingScreenshot}
                    size="sm"
                    onClick={handleGenerateResponseWithScreenshot}
                  >
                    {isCapturingScreenshot ? 'Capturing...' : 'Analyse Screen'}
                  </Button>
                </TooltipTrigger>
                {isMac && (
                  <TooltipContent className="flex flex-row items-center gap-1">
                    <ShortcutIcon /> + K
                  </TooltipContent>
                )}
              </Tooltip>
            </div>
          )}
        </div>
        {captureScreenshotError && (
          <div className="text-white bg-black/50 rounded-lg p-2 px-4">
            Capture Screenshot Error: {captureScreenshotError.message}
          </div>
        )}
      </div>
      {messages.length && activatedSession ? (
        <div
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          className="min-h-12 relative flex flex-col w-full gap-2 p-2.5 bg-black/85 rounded-lg text-white overflow-y-auto"
        >
          {/* Navigation Buttons */}
          <div className="flex flex-row justify-between">
            <div className="flex flex-row gap-2 items-center">
              <Button
                size="sm"
                onClick={handlePrevAssistantMessage}
                disabled={
                  assistantMessageIndex === 0 || assistantMessages.length === 0
                }
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                onClick={handleNextAssistantMessage}
                disabled={
                  assistantMessageIndex === null ||
                  assistantMessageIndex >= assistantMessages.length - 1
                }
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="absolute top-2 right-2"
                  size="sm"
                  onClick={handleClearAIAnswer}
                  onMouseEnter={onMouseEnter}
                  onMouseLeave={onMouseLeave}
                >
                  <X className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              {isMac && (
                <TooltipContent
                  side="top"
                  className="flex flex-row items-center gap-1"
                >
                  <ShortcutIcon /> + Backspace
                </TooltipContent>
              )}
            </Tooltip>
          </div>
          {/* Show the selected assistant message */}
          {currentAssistantMessage && (
            <Markdown components={markdownComponents}>
              {currentAssistantMessage.content}
            </Markdown>
          )}
          {isLoading && <div>Thinking...</div>}
        </div>
      ) : null}
    </div>
  );
}
