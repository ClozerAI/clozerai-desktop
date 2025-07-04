import { useEffect, useMemo, useState, useRef } from 'react';
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
  Laptop,
  Text,
  ArrowLeft,
  ArrowRight,
  Stars,
} from 'lucide-react';
import { CodeBlock } from './components/CodeBlock';
import { Button } from './components/ui/button';
import { cn } from './lib/utils';
import SessionTimerTooltip from './components/SessionTimerTooltip';
import { Status } from './lib/useAudioTap';
import icon from '../../assets/icon.png';
import iconNoText from '../../assets/iconNoText.png';

// @ts-ignore
import Markdown, { Components } from 'react-markdown';
import { Tooltip, TooltipContent } from './components/ui/tooltip';
import { TooltipTrigger } from './components/ui/tooltip';
import { Input } from './components/ui/input';
import useVersion from './lib/useVersion';
import useSessionTranscription, {
  AI_HELP_PROMPT,
  WHAT_TO_ASK_PROMPT,
} from './lib/useSessionTranscription';
import CombinedTranscriptBubbles from './components/CombinedTranscriptBubbles';

const isMac = window.electron?.platform === 'darwin';

function ShortcutIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return isMac ? <Command className={className} /> : 'Ctrl';
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

  const [callSessionId, setCallSessionId] = useState<string | null>(null);
  const [inputCallSessionId, setInputCallSessionId] = useState<string>('');
  const [showEnterIdManually, setShowEnterIdManually] = useState(false);

  const {
    // Call session data
    callSession,
    callSessionLoading,

    // Activate session
    generateSpeechmaticsSession,
    generateSpeechmaticsSessionLoading,

    // Session expiration
    sessionExpired,
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
    isLoading: isLoading,
    handleGenerateResponse,
    handleClearAllAnswers,
    chatInput,
    setChatInput,

    // Combined transcript
    combinedTranscript,
    clearTranscripts,
  } = useSessionTranscription({
    callSessionId,
    version: version || 'unknown',
  });

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
    handleClearAllAnswers();
    onMouseLeave();
  }

  const markdownComponents = useMemo(() => {
    return {
      code: CodeBlock as Components['code'],
    };
  }, []);

  const setHideAndResize = (value: boolean) => {
    setHide(value);
  };

  // Update keyboard shortcut handlers
  useEffect(() => {
    if (!window.electron?.ipcRenderer) return;

    const toggleHideHandler = () => {
      setHideAndResize(!hideRef.current);
    };

    const unsubscribeToggleHide = window.electron.ipcRenderer.on(
      'ipc-toggle-hide',
      toggleHideHandler,
    );

    const unsubscribeAnswerQuestion = window.electron.ipcRenderer.on(
      'ipc-answer-question',
      () => {
        if (activatedSession && combinedTranscript.length > 0) {
          handleGenerateResponse(undefined, AI_HELP_PROMPT);
        }
      },
    );

    const unsubscribeWhatToAsk = window.electron.ipcRenderer.on(
      'ipc-what-to-ask',
      () => {
        if (activatedSession) {
          handleGenerateResponse(undefined, WHAT_TO_ASK_PROMPT);
        }
      },
    );

    const unsubscribeAnalyseScreen = window.electron.ipcRenderer.on(
      'ipc-analyse-screen',
      () => {
        if (activatedSession) {
          handleGenerateResponseWithScreenshot();
        }
      },
    );

    const unsubscribeMoveLeft = window.electron.ipcRenderer.on(
      'ipc-move-window-left',
      handleMoveLeft,
    );

    const unsubscribeMoveRight = window.electron.ipcRenderer.on(
      'ipc-move-window-right',
      handleMoveRight,
    );

    return () => {
      unsubscribeToggleHide();
      unsubscribeAnswerQuestion();
      unsubscribeWhatToAsk();
      unsubscribeAnalyseScreen();
      unsubscribeMoveLeft();
      unsubscribeMoveRight();
    };
  }, [handleGenerateResponse, handleGenerateResponseWithScreenshot]);

  // Add new useEffect for protocol handling
  useEffect(() => {
    if (!window.electron?.ipcRenderer) return;

    const loadSessionHandler = (...args: unknown[]) => {
      console.log('Received args:', args);
      const sessionId = args[0] as string;
      console.log('Received session ID from protocol:', sessionId);
      // Set the session ID to trigger loading
      setCallSessionId(sessionId);
      setInputCallSessionId(sessionId);
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
  }, [setCallSessionId, setInputCallSessionId, setHideAndResize]);

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

  // Add state for window sizing and positioning
  const [windowWidth, _setWindowWidth] = useState<number>(1000);
  const windowWidthRef = useRef(1000);
  function setWindowWidth(newWindowWidth: number) {
    _setWindowWidth(newWindowWidth);
    windowWidthRef.current = newWindowWidth;
  }

  const [windowPosition, setWindowPosition] = useState<number>(0); // offset from center

  // Window control functions
  function handleMoveLeft() {
    setWindowPosition((prev) => {
      const screenWidth = window.screen.width;
      const minPosition = -(screenWidth - windowWidthRef.current) / 2;
      const newPosition = Math.max(prev - 100, minPosition);
      console.log('Move Left:', {
        screenWidth,
        windowWidth: windowWidthRef.current,
        minPosition,
        prev,
        newPosition,
      });
      return newPosition;
    });
  }

  function handleMoveRight() {
    setWindowPosition((prev) => {
      const screenWidth = window.screen.width;
      const maxPosition = (screenWidth - windowWidthRef.current) / 2;
      const newPosition = Math.min(prev + 100, maxPosition);
      console.log('Move Right:', {
        screenWidth,
        windowWidth: windowWidthRef.current,
        maxPosition,
        prev,
        newPosition,
      });
      return newPosition;
    });
  }

  function handleWidenWindow() {
    setWindowWidth(Math.min(window.screen.width, windowWidthRef.current + 100));
  }

  function handleNarrowWindow() {
    setWindowWidth(Math.max(600, windowWidthRef.current - 100));
  }

  function handleResetWindow() {
    setWindowWidth(1000);
    setWindowPosition(0);
  }

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

  const isSessionValid = callSession && !callSession.expired;

  const nonActivatedSession =
    callSession && !callSession.speechmaticsApiKey && !callSession.expired;

  useEffect(() => {
    if (nonActivatedSession || (sessionExpired && !callSession?.trial)) {
      generateSpeechmaticsSession();
    }
  }, [
    nonActivatedSession,
    generateSpeechmaticsSession,
    sessionExpired,
    callSession,
  ]);

  const activatedSession =
    callSession && callSession.speechmaticsApiKey && !callSession.expired;

  if (hide) {
    return (
      <div className="flex flex-col w-full gap-2 items-center min-h-screen">
        <div
          className="flex flex-col gap-2 items-center justify-center p-2.5 bg-black/50 rounded-lg"
          style={{
            transform: `translateX(${windowPosition}px)`,
          }}
        >
          <div className="flex flex-col w-full justify-center items-center gap-1">
            <div className="flex flex-row justify-between w-full h-full">
              <div className="flex flex-row justify-center gap-2">
                <img width="102" alt="icon" src={icon} />
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

                  <TooltipContent
                    side="top"
                    className="flex flex-row items-center gap-1"
                  >
                    <ShortcutIcon /> + E
                  </TooltipContent>
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
      className="max-h-screen overflow-hidden flex flex-col w-full gap-2 items-center min-h-screen"
      onMouseLeave={onMouseLeave}
    >
      <div
        className="flex flex-col gap-2 items-center justify-center h-full p-2.5 bg-black/50 rounded-lg text-center"
        style={{
          width: `${windowWidth}px`,
          transform: `translateX(${windowPosition}px)`,
        }}
      >
        <div className="flex flex-col w-full justify-center items-center gap-1">
          <div className="flex flex-row justify-between  w-full h-full">
            <div className="flex flex-row justify-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  {windowWidth > 600 ? (
                    <img
                      width="102"
                      alt="icon"
                      src={icon}
                      onClick={handleLogoClick}
                      onMouseEnter={onMouseEnter}
                      onMouseLeave={onMouseLeave}
                    />
                  ) : (
                    <img
                      width="32"
                      alt="icon"
                      src={iconNoText}
                      onClick={handleLogoClick}
                      onMouseEnter={onMouseEnter}
                      onMouseLeave={onMouseLeave}
                    />
                  )}
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

                <TooltipContent
                  side="top"
                  className="flex flex-row items-center gap-1"
                >
                  <ShortcutIcon /> + E
                </TooltipContent>
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
                    <div className="flex flex-col gap-2">
                      <div className="text-sm text-center mb-1">
                        Window Controls
                      </div>
                      <div className="flex flex-row items-center gap-1">
                        <Button
                          onMouseEnter={onMouseEnter}
                          onMouseLeave={onMouseLeave}
                          size="sm"
                          onClick={handleMoveLeft}
                          className="bg-transparent hover:bg-white/20"
                          title={`Move Left (${isMac ? '⌘' : 'Ctrl'}+←)`}
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </Button>

                        <Button
                          onMouseEnter={onMouseEnter}
                          onMouseLeave={onMouseLeave}
                          size="sm"
                          onClick={handleMoveRight}
                          className="bg-transparent hover:bg-white/20"
                          title={`Move Right (${isMac ? '⌘' : 'Ctrl'}+→)`}
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
                      <div className="text-xs text-gray-400 text-center">
                        Move: <ShortcutIcon className="inline w-3 h-3" /> +{' '}
                        <ArrowLeft className="inline w-3 h-3" /> /{' '}
                        <ShortcutIcon className="inline w-3 h-3" /> +{' '}
                        <ArrowRight className="inline w-3 h-3" />
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>

            <div className="flex flex-row items-center gap-2">
              {!activatedSession && (
                <a target="_blank" href="https://www.clozerai.com/dashboard">
                  <Button
                    onMouseEnter={onMouseEnter}
                    onMouseLeave={onMouseLeave}
                    size="sm"
                  >
                    Dashboard
                  </Button>
                </a>
              )}
              {activatedSession && callSession?.trial && (
                <SessionTimerTooltip
                  timeLeft={timeLeft}
                  isExtendingSession={generateSpeechmaticsSessionLoading}
                  willAutoExtend={willAutoExtend}
                  canAutoExtend={canAutoExtend}
                  trial={callSession?.trial}
                  canExtend={callSession?.canExtend}
                />
              )}
              {activatedSession && audioTapStatus === Status.RECORDING ? (
                <Button
                  onMouseEnter={onMouseEnter}
                  onMouseLeave={onMouseLeave}
                  size="sm"
                  onClick={stopAudioTapRecording}
                  className="flex flex-row items-center gap-2"
                >
                  <Laptop className="w-4 h-4" />
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
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onMouseEnter={onMouseEnter}
                        onMouseLeave={onMouseLeave}
                        size="sm"
                        onClick={handleStartAudioTapTranscription}
                        disabled={audioTapStatus === Status.STARTING}
                      >
                        {audioTapStatus === Status.STARTING
                          ? 'Connecting...'
                          : 'Start'}
                        <Laptop className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      Start listening to computer audio.
                    </TooltipContent>
                  </Tooltip>
                )
              )}
              {activatedSession && isRecordingMicrophone ? (
                <Button
                  onMouseEnter={onMouseEnter}
                  onMouseLeave={onMouseLeave}
                  size="sm"
                  onClick={handleStopMicrophoneTranscription}
                  className="flex flex-row items-center gap-2"
                >
                  <Mic className="w-4 h-4" />
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
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onMouseEnter={onMouseEnter}
                        onMouseLeave={onMouseLeave}
                        size="sm"
                        onClick={handleStartMicrophoneTranscription}
                        disabled={startingMicrophoneTranscription}
                      >
                        {startingMicrophoneTranscription
                          ? 'Connecting...'
                          : 'Start'}
                        <Mic className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent
                      side="bottom"
                      className="max-w-[350px] text-center"
                    >
                      Start listening to your microphone. <br /> Note: You need
                      to use headphones to prevent the computer audio from being
                      picked up.
                    </TooltipContent>
                  </Tooltip>
                )
              )}
              <Button
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
                size="sm"
                variant="destructive"
                onClick={handleExit}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
          {activatedSession &&
            (audioTapStatus === Status.RECORDING || isRecordingMicrophone) && (
              <div className="min-h-8 w-full text-white text-center flex flex-row items-center justify-center">
                <div className="relative h-8 w-full overflow-hidden">
                  <div className="text-white absolute right-0 min-w-full items-center whitespace-nowrap flex flex-row gap-1">
                    {combinedTranscript.length > 0 ? (
                      <div className="flex-1 text-left flex flex-row gap-1 justify-start">
                        {combinedTranscript.map((t) => (
                          <div className="flex flex-row gap-1 justify-start">
                            {t.finalTranscript}
                            <span className="opacity-70 w-full text-left">
                              {t.partialTranscript}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="opacity-70 w-full text-left">
                        Listening...
                      </span>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm">
                          <Text className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="w-[400px]" side="bottom">
                        <CombinedTranscriptBubbles
                          combinedTranscript={combinedTranscript}
                          isRecordingMicrophone={isRecordingMicrophone}
                          isRecordingShare={audioTapStatus === Status.RECORDING}
                        />
                      </TooltipContent>
                    </Tooltip>
                    <Button
                      onMouseEnter={onMouseEnter}
                      onMouseLeave={onMouseLeave}
                      size="sm"
                      onClick={clearTranscripts}
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
                placeholder="Call Session ID"
                className="bg-white w-full max-w-xs"
                value={inputCallSessionId}
                disabled={isLoading}
                onChange={(e) => setInputCallSessionId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setCallSessionId(inputCallSessionId);
                  }
                }}
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
              />
              <Button
                onClick={() => setCallSessionId(inputCallSessionId)}
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
                disabled={callSessionLoading}
              >
                {callSessionLoading ? 'Loading...' : 'Load'}
              </Button>
            </div>
          )}
          {callSessionLoading && (
            <div className="text-white bg-black/50 rounded-lg p-2 px-4">
              Loading session...
            </div>
          )}
          {!activatedSession && generateSpeechmaticsSessionLoading && (
            <div className="text-white bg-black/50 rounded-lg p-2 px-4">
              Loading session...
            </div>
          )}
          {sessionExpired && callSession?.trial && (
            <div className="text-white bg-black/50 rounded-lg p-2 px-4">
              Session has expired. Please create and start a new one in the
              dashboard.
            </div>
          )}
          {activatedSession && (
            <div className="flex flex-row items-center gap-2 mt-1 w-full justify-center">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      onMouseEnter={onMouseEnter}
                      onMouseLeave={onMouseLeave}
                      size="sm"
                      disabled={!combinedTranscript.length}
                      onClick={() =>
                        handleGenerateResponse(undefined, AI_HELP_PROMPT)
                      }
                    >
                      <Stars className="w-4 h-4" /> AI Help
                    </Button>
                  </span>
                </TooltipTrigger>

                {combinedTranscript.length > 0 ? (
                  <TooltipContent>
                    <div className="flex flex-row items-center gap-1">
                      <ShortcutIcon /> + G
                    </div>
                  </TooltipContent>
                ) : (
                  <TooltipContent>
                    You need to start listening to answer questions.
                  </TooltipContent>
                )}
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      onMouseEnter={onMouseEnter}
                      onMouseLeave={onMouseLeave}
                      size="sm"
                      onClick={() =>
                        handleGenerateResponse(undefined, WHAT_TO_ASK_PROMPT)
                      }
                    >
                      <Stars className="w-4 h-4" /> What to ask?
                    </Button>
                  </span>
                </TooltipTrigger>

                {combinedTranscript.length > 0 ? (
                  <TooltipContent>
                    <div className="flex flex-row items-center gap-1">
                      <ShortcutIcon /> + H
                    </div>
                  </TooltipContent>
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
                <TooltipContent className="flex flex-row items-center gap-1">
                  <ShortcutIcon /> + K
                </TooltipContent>
              </Tooltip>
              <div className="bg-white/50 w-px h-4" />
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleGenerateResponse(chatInput);
                }}
                className="flex flex-row w-full items-center gap-2 max-w-sm"
              >
                <Input
                  placeholder="Type a manual message..."
                  className="w-full border-none text-white bg-white/10 placeholder:text-white/50 pr-17"
                  onMouseEnter={onMouseEnter}
                  onMouseLeave={onMouseLeave}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                />
                <Button
                  size="sm"
                  className="-ml-17"
                  onMouseEnter={onMouseEnter}
                  onMouseLeave={onMouseLeave}
                  disabled={chatInput.length === 0}
                >
                  Send
                </Button>
              </form>
            </div>
          )}
        </div>
      </div>
      {messages.length && activatedSession ? (
        <div
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          className="min-h-12 relative flex flex-col w-full gap-2 p-2.5 bg-black/85 rounded-lg text-white overflow-y-auto"
          style={{
            width: `${windowWidth}px`,
            transform: `translateX(${windowPosition}px)`,
          }}
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

              <TooltipContent
                side="top"
                className="flex flex-row items-center gap-1"
              >
                <ShortcutIcon /> + Backspace
              </TooltipContent>
            </Tooltip>
          </div>
          {/* Show the selected assistant message */}
          {currentAssistantMessage && (
            <Markdown components={markdownComponents}>
              {currentAssistantMessage.content
                // Convert bullet character • to markdown list item
                .replace(/^•\s+/gm, '- ')
                // Also handle other common bullet characters
                .replace(/^‣\s+/gm, '- ')
                .replace(/^▪\s+/gm, '- ')
                .replace(/^▫\s+/gm, '- ')
                .replace(/^‧\s+/gm, '- ')}
            </Markdown>
          )}
          {isLoading && <div>Thinking...</div>}
        </div>
      ) : null}
    </div>
  );
}
