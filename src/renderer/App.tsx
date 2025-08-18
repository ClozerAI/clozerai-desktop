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
  Eye,
  EyeOff,
  Download,
  Plus,
  Minus,
} from 'lucide-react';
import { Button } from './components/ui/button';
import { cn } from './lib/utils';
import SessionTimerTooltip from './components/SessionTimerTooltip';
import { Status } from './lib/sessionTranscript/useAudioTap';
import icon from '../../assets/icon.png';
import iconNoText from '../../assets/iconNoText.png';

import { Tooltip, TooltipContent } from './components/ui/tooltip';
import { TooltipTrigger } from './components/ui/tooltip';
import { Input } from './components/ui/input';
import useVersion from './lib/useVersion';
import useSessionTranscription from './lib/sessionTranscript/useSessionTranscription';
import CombinedTranscriptBubbles from './components/CombinedTranscriptBubbles';
import ChatMessage from './components/ChatMessage';
import { api, NEXTJS_API_URL } from './lib/trpc/react';
import transcriptionLanguageMap, {
  TranscriptionLanguage,
} from './lib/transcriptLanguageMap';
import { DEFAULT_LANGUAGE } from './lib/callSessionDefaults';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './components/ui/select';
import { toast } from 'sonner';

const isMac = window.electron?.platform === 'darwin';
const isWindows = window.electron?.platform === 'win32';

function ShortcutIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return isMac ? <Command className={className} /> : 'Ctrl';
}

export default function App() {
  const { data: version, isLoading: loadingVersion } = useVersion();

  const utils = api.useUtils();

  const {
    data: user,
    isLoading: loadingUser,
    error: userError,
    refetch: refetchUser,
  } = api.user.getUserProfile.useQuery(undefined, {
    retry: false,
  });

  // Fetch latest release data for Windows downloads
  const { data: releaseData, isLoading: releaseLoading } =
    api.user.getLatestRelease.useQuery(undefined, {
      retry: false,
    });

  const loggedIn = user && !userError;

  const hasActiveSubscription =
    (user?.currentWorkspace
      ? user.currentWorkspace.hasActiveSubscription
      : user?.hasActiveSubscription) || false;

  const { mutate: createCallSession, isPending: isCreatingCallSession } =
    api.callSession.create.useMutation({
      onSuccess: (data) => {
        setCallSessionId(data.id);
        utils.callSession.get.setData({ id: data.id }, data);
        // Reset Quick Start input form
        setShowQuickStartInput(false);
        setClientName('');
      },
    });

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

  // Quick Start Session client name state
  const [showQuickStartInput, setShowQuickStartInput] = useState(false);
  const [clientName, setClientName] = useState<string>('');
  const [selectedLanguage, setSelectedLanguage] =
    useState<TranscriptionLanguage>(DEFAULT_LANGUAGE);

  // Manual auth token state
  const [showEnterTokenManually, setShowEnterTokenManually] = useState(false);
  const [inputAuthToken, setInputAuthToken] = useState<string>('');
  const [isSettingAuthToken, setIsSettingAuthToken] = useState(false);

  const {
    // Call session data
    callSession,
    callSessionLoading,

    // Activate session
    generateSpeechmaticsSession,
    generateSpeechmaticsSessionLoading,

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
    isLoading: isLoading,
    handleGenerateResponse,
    handleClearAllAnswers,
    chatInput,
    setChatInput,

    // Combined transcript
    combinedTranscript,
    clearTranscripts,

    // Session reset
    handleResetSession,
  } = useSessionTranscription({
    callSessionId,
    version: version || 'unknown',
  });

  const { data: builtInPrompts, isLoading: isLoadingBuiltInPrompts } =
    api.realTimePrompts.getBuiltInPrompts.useQuery(undefined, {
      enabled: !!loggedIn,
    });

  const { data: realTimePromptsResponse, isLoading: isLoadingRealTimePrompts } =
    api.realTimePrompts.getMany.useQuery(
      {
        limit: 100,
        offset: 0,
      },
      {
        enabled: !!loggedIn,
      },
    );

  const realTimePrompts = realTimePromptsResponse?.data ?? [];

  // Fetch last session to prefill language
  const { data: lastSessions, isLoading: isLoadingLastSessions } =
    api.callSession.getMany.useQuery(
      { limit: 1, offset: 0 },
      { enabled: !!loggedIn },
    );

  useEffect(() => {
    const lastLang = lastSessions?.data?.[0]?.language as
      | TranscriptionLanguage
      | undefined;
    if (lastLang) {
      setSelectedLanguage(lastLang);
    }
  }, [lastSessions?.data?.[0]?.language]);

  const allPrompts = [
    ...(realTimePrompts || []).map((p) => ({
      id: p.id,
      title: p.title,
      description: p.prompt,
    })),
    ...(builtInPrompts?.builtInPrompts || []).map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
    })),
  ];

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

  async function handleSetAuthToken() {
    if (!inputAuthToken.trim()) {
      return;
    }

    setIsSettingAuthToken(true);
    try {
      await window.electron?.ipcRenderer.storeAuthToken(inputAuthToken.trim());
      setInputAuthToken('');
      setShowEnterTokenManually(false);
      // Refetch user data after setting the token
      refetchUser();
    } catch (error) {
      console.error('Error setting auth token:', error);
      // You could add error state here if needed
    } finally {
      setIsSettingAuthToken(false);
    }
  }

  async function handleLogout() {
    try {
      // Clear the auth token by storing an empty string
      await window.electron?.ipcRenderer.storeAuthToken('');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  }

  function handleExit() {
    if (callSessionId) {
      // If there's an active session, reset all state and clear session ID
      handleResetSession();
      setCallSessionId(null);
      setInputCallSessionId('');
      setHideAndResize(false);
    } else {
      // If no active session, quit the app
      window.electron?.ipcRenderer.quitApp();
    }
  }

  function handleClearAIAnswer() {
    handleClearAllAnswers();
    onMouseLeave();
  }

  const setHideAndResize = (value: boolean) => {
    setHide(value);
  };

  const activatedSession =
    callSession &&
    callSession.speechmaticsApiKey &&
    !callSession.speechmaticsTokenExpired;

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
        if (
          activatedSession &&
          combinedTranscript.length > 0 &&
          allPrompts &&
          allPrompts.length > 0
        ) {
          handleGenerateResponse(allPrompts[0].id);
        }
      },
    );

    const unsubscribeWhatToAsk = window.electron.ipcRenderer.on(
      'ipc-what-to-ask',
      () => {
        if (activatedSession && allPrompts && allPrompts.length > 1) {
          handleGenerateResponse(allPrompts[1].id);
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
      unsubscribeMoveLeft();
      unsubscribeMoveRight();
    };
  }, [
    handleGenerateResponse,
    handleGenerateResponseWithScreenshot,
    activatedSession,
    allPrompts,
    combinedTranscript,
    handleMoveLeft,
    handleMoveRight,
  ]);

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

  // Add new useEffect for auth cookie updates
  useEffect(() => {
    if (!window.electron?.ipcRenderer) return;

    const authCookieUpdatedHandler = () => {
      console.log('Auth cookie updated, refetching user data');
      refetchUser();
    };

    const unsubscribeAuthCookieUpdated = window.electron.ipcRenderer.on(
      'ipc-auth-cookie-updated',
      authCookieUpdatedHandler,
    );

    return () => {
      unsubscribeAuthCookieUpdated();
    };
  }, [refetchUser]);

  // Add state for tracking logo clicks and content protection
  const [logoClickCount, setLogoClickCount] = useState(0);
  const [contentProtectionDisabled, setContentProtectionDisabled] =
    useState(false);
  const logoClickTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Add state for privacy mode (default to private)
  const [isPrivate, setIsPrivate] = useState(true);

  // Add update state
  const [updateStatus, setUpdateStatus] = useState<
    'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error'
  >('idle');
  const [downloadProgress, setDownloadProgress] = useState<{
    percent: number;
  } | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

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

  // Initialize privacy mode to private on mount
  useEffect(() => {
    if (window.electron?.ipcRenderer) {
      window.electron.ipcRenderer.sendMessage('ipc-toggle-privacy', true);
    }
  }, []);

  // Add update event listeners
  useEffect(() => {
    if (!window.electron?.ipcRenderer) return;

    const updateCheckingHandler = () => {
      setUpdateStatus('checking');
      setUpdateError(null);
    };

    const updateAvailableHandler = () => {
      setUpdateStatus('available');
      setUpdateError(null);
    };

    const updateNotAvailableHandler = () => {
      setUpdateStatus('idle');
      setUpdateError(null);
    };

    const updateErrorHandler = (...args: unknown[]) => {
      const error = args[0] as string;
      setUpdateStatus('error');
      setUpdateError(error);
      toast.error(error);
    };

    const updateDownloadProgressHandler = (...args: unknown[]) => {
      const progress = args[0];
      setUpdateStatus('downloading');
      setDownloadProgress(progress as { percent: number });
      setUpdateError(null);
    };

    const updateDownloadedHandler = () => {
      setUpdateStatus('downloaded');
      setDownloadProgress(null);
      setUpdateError(null);
    };

    const unsubscribeUpdateChecking = window.electron.ipcRenderer.on(
      'ipc-update-checking',
      updateCheckingHandler,
    );

    const unsubscribeUpdateAvailable = window.electron.ipcRenderer.on(
      'ipc-update-available',
      updateAvailableHandler,
    );

    const unsubscribeUpdateNotAvailable = window.electron.ipcRenderer.on(
      'ipc-update-not-available',
      updateNotAvailableHandler,
    );

    const unsubscribeUpdateError = window.electron.ipcRenderer.on(
      'ipc-update-error',
      updateErrorHandler,
    );

    const unsubscribeUpdateDownloadProgress = window.electron.ipcRenderer.on(
      'ipc-update-download-progress',
      updateDownloadProgressHandler,
    );

    const unsubscribeUpdateDownloaded = window.electron.ipcRenderer.on(
      'ipc-update-downloaded',
      updateDownloadedHandler,
    );

    return () => {
      unsubscribeUpdateChecking();
      unsubscribeUpdateAvailable();
      unsubscribeUpdateNotAvailable();
      unsubscribeUpdateError();
      unsubscribeUpdateDownloadProgress();
      unsubscribeUpdateDownloaded();
    };
  }, []);

  // Add state for assistant message navigation
  const [assistantMessageIndex, setAssistantMessageIndex] = useState<number>(0);

  // Add state for window sizing and positioning
  const [windowWidth, _setWindowWidth] = useState<number>(700);
  const windowWidthRef = useRef(700);
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
    setWindowWidth(700);
    setWindowPosition(0);
    window.electron?.ipcRenderer.sendMessage('ipc-zoom-reset');
  }

  function handleZoomIn() {
    window.electron?.ipcRenderer.sendMessage('ipc-zoom-in');
  }

  function handleZoomOut() {
    window.electron?.ipcRenderer.sendMessage('ipc-zoom-out');
  }

  function handleZoomReset() {
    window.electron?.ipcRenderer.sendMessage('ipc-zoom-reset');
  }

  function handleTogglePrivacy() {
    const newPrivacyState = !isPrivate;
    setIsPrivate(newPrivacyState);
    window.electron?.ipcRenderer.sendMessage(
      'ipc-toggle-privacy',
      newPrivacyState,
    );
  }

  async function handleUpdateButtonClick() {
    if (updateStatus === 'error') {
      // Clear error state and check for updates again
      setUpdateStatus('idle');
      setUpdateError(null);
    } else if (updateStatus === 'downloaded') {
      handleInstallUpdate();
    } else if (updateStatus === 'available') {
      // If Windows and there's a download URL available, open browser
      if (isWindows) {
        if (!releaseData?.downloads?.windows) {
          toast.error('Loading latest release data...');
          return;
        }
        try {
          window.open(releaseData.downloads.windows, '_blank');
        } catch (error) {
          console.error('Error opening Windows download:', error);
          toast.error('Failed to open download page');
        }
      }
    }
  }

  async function handleInstallUpdate() {
    try {
      await window.electron?.ipcRenderer.installUpdate();
    } catch (error) {
      console.error('Error installing update:', error);
    }
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

  const nonActivatedSession =
    callSession &&
    !callSession.speechmaticsApiKey &&
    !callSession.speechmaticsTokenExpired;

  useEffect(() => {
    if (
      nonActivatedSession ||
      (callSession?.speechmaticsTokenExpired && !callSession?.hasEnded)
    ) {
      generateSpeechmaticsSession(callSession?.id);
    }
  }, [
    nonActivatedSession,
    generateSpeechmaticsSession,
    callSession?.speechmaticsTokenExpired,
    callSession,
  ]);

  useEffect(() => {
    if (activatedSession) {
      handleStartAudioTapTranscription();
      handleStartMicrophoneTranscription();
    }
  }, [activatedSession]);

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
                <img width="32" alt="icon" src={iconNoText} />
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
                {audioTapStatus === Status.RECORDING && (
                  <Button
                    onMouseEnter={onMouseEnter}
                    onMouseLeave={onMouseLeave}
                    size="sm"
                    onClick={() => setHideAndResize(false)}
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
                )}
                {/* Recording indicator - show when microphone is recording */}
                {isRecordingMicrophone && (
                  <Button
                    onMouseEnter={onMouseEnter}
                    onMouseLeave={onMouseLeave}
                    size="sm"
                    onClick={() => setHideAndResize(false)}
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
                )}

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
                {/* Update button - only show if there's an update available or downloading */}
                {(updateStatus === 'available' ||
                  updateStatus === 'downloading' ||
                  updateStatus === 'downloaded' ||
                  updateStatus === 'checking' ||
                  updateStatus === 'error') && (
                  <Tooltip>
                    <TooltipTrigger>
                      <Button
                        onMouseEnter={onMouseEnter}
                        onMouseLeave={onMouseLeave}
                        size="sm"
                        className={cn(
                          'bg-transparent shadow-none',
                          updateStatus === 'downloading' && 'text-yellow-500',
                          updateStatus === 'error' && 'text-red-500',
                        )}
                        disabled={
                          updateStatus === 'checking' ||
                          updateStatus === 'downloading' ||
                          (isWindows && !releaseData?.downloads?.windows) ||
                          (isMac && updateStatus === 'available')
                        }
                        onClick={handleUpdateButtonClick}
                      >
                        {updateStatus === 'downloading' && downloadProgress ? (
                          <span className="text-xs">
                            {Math.round(downloadProgress.percent)}%
                          </span>
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent
                      side="bottom"
                      className="max-w-[350px] break-words text-center"
                    >
                      {updateStatus === 'checking' && 'Checking for updates...'}
                      {updateStatus === 'available' &&
                        (isMac
                          ? 'Update available. Waiting for download...'
                          : 'Update available. Click to download.')}
                      {updateStatus === 'downloading' &&
                        'Downloading update...'}
                      {updateStatus === 'downloaded' &&
                        'Update downloaded. Click to install.'}
                      {updateStatus === 'error' && 'Error: ' + updateError}
                    </TooltipContent>
                  </Tooltip>
                )}

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

                        <Button
                          onMouseEnter={onMouseEnter}
                          onMouseLeave={onMouseLeave}
                          size="sm"
                          onClick={handleZoomOut}
                          className="bg-transparent hover:bg-white/20"
                          title={`Zoom Out (${isMac ? '⌘' : 'Ctrl'}+-)`}
                        >
                          <Minus className="w-4 h-4" />
                        </Button>

                        <Button
                          onMouseEnter={onMouseEnter}
                          onMouseLeave={onMouseLeave}
                          size="sm"
                          onClick={handleZoomIn}
                          className="bg-transparent hover:bg-white/20"
                          title={`Zoom In (${isMac ? '⌘' : 'Ctrl'}++)`}
                        >
                          <Plus className="w-4 h-4" />
                        </Button>

                        <Button
                          onMouseEnter={onMouseEnter}
                          onMouseLeave={onMouseLeave}
                          size="sm"
                          onClick={handleTogglePrivacy}
                          className="bg-transparent hover:bg-white/20"
                          title={`${isPrivate ? 'Disable' : 'Enable'} Privacy Mode`}
                        >
                          {isPrivate ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
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
                <>
                  <a target="_blank" href={`${NEXTJS_API_URL}/dashboard`}>
                    <Button
                      onMouseEnter={onMouseEnter}
                      onMouseLeave={onMouseLeave}
                      size="sm"
                    >
                      Dashboard
                    </Button>
                  </a>
                  {loggedIn && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onMouseEnter={onMouseEnter}
                          onMouseLeave={onMouseLeave}
                          size="sm"
                          onClick={handleLogout}
                        >
                          Logout
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        {user?.email} (
                        {user?.currentWorkspace?.name || 'Personal'})
                      </TooltipContent>
                    </Tooltip>
                  )}
                </>
              )}

              {activatedSession && callSession.trial && (
                <SessionTimerTooltip
                  timeLeft={timeLeft}
                  isExtendingSession={generateSpeechmaticsSessionLoading}
                  willAutoExtend={willAutoExtend}
                  canAutoExtend={canAutoExtend}
                  trial={callSession?.trial}
                  canExtend={hasActiveSubscription}
                />
              )}
              {activatedSession && audioTapStatus === Status.RECORDING ? (
                <Tooltip>
                  <TooltipTrigger asChild>
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
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Stop</TooltipContent>
                </Tooltip>
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
                <Tooltip>
                  <TooltipTrigger asChild>
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
                  </TooltipTrigger>
                  <TooltipContent
                    side="bottom"
                    className="max-w-[350px] text-center"
                  >
                    Stop <br /> Note: You need to use headphones to prevent the
                    computer audio from being picked up.
                  </TooltipContent>
                </Tooltip>
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
                          <div
                            className="flex flex-row gap-1 justify-start"
                            key={t.createdAt.getTime()}
                          >
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
                          onMouseEnter={onMouseEnter}
                          onMouseLeave={onMouseLeave}
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
          {!callSession && (
            <div className="text-white bg-black/50 rounded-lg p-2 px-4">
              Create a session in the dashboard and click "Open in Desktop App"
              to start
              {!showEnterIdManually && !showQuickStartInput && loggedIn && (
                <>
                  {' '}
                  or{' '}
                  <Button
                    onClick={() => setShowEnterIdManually(true)}
                    onMouseEnter={onMouseEnter}
                    onMouseLeave={onMouseLeave}
                    size="sm"
                  >
                    Enter Call Session ID Manually
                  </Button>
                </>
              )}
              {!showEnterIdManually && !showQuickStartInput && loggedIn && (
                <>
                  {' '}
                  or{' '}
                  <Button
                    onClick={() => setShowQuickStartInput(true)}
                    onMouseEnter={onMouseEnter}
                    onMouseLeave={onMouseLeave}
                    size="sm"
                  >
                    Quick Start Session
                  </Button>
                </>
              )}
              {loadingUser ? (
                <span> or loading...</span>
              ) : !loggedIn ? (
                <>
                  {' '}
                  or{' '}
                  <Button
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey) {
                        // Command/Ctrl + click to enter token manually
                        setShowEnterTokenManually(true);
                      } else {
                        // Regular click to open login page
                        window.open(`${NEXTJS_API_URL}/auth/desktop`, '_blank');
                      }
                    }}
                    onMouseEnter={onMouseEnter}
                    onMouseLeave={onMouseLeave}
                    size="sm"
                  >
                    Login
                  </Button>
                </>
              ) : null}
            </div>
          )}
          {showEnterIdManually && !callSession && (
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
              <Button
                onClick={() => {
                  setShowEnterIdManually(false);
                  setInputCallSessionId('');
                }}
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
                disabled={callSessionLoading}
              >
                Cancel
              </Button>
            </div>
          )}
          {showQuickStartInput && !callSession && (
            <div className="flex flex-row items-center gap-2 w-full justify-center">
              <Input
                placeholder="Client Name (optional)"
                className="bg-white w-full max-w-2xs"
                value={clientName}
                disabled={isCreatingCallSession}
                onChange={(e) => setClientName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (!isCreatingCallSession) {
                      createCallSession({
                        trial: !hasActiveSubscription,
                        clientName: clientName.trim() || undefined,
                        language: selectedLanguage,
                        callScriptId: null,
                      });
                    }
                  }
                }}
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
              />
              <Select
                value={selectedLanguage}
                onValueChange={(value) =>
                  setSelectedLanguage(value as TranscriptionLanguage)
                }
                disabled={isCreatingCallSession || isLoadingLastSessions}
              >
                <SelectTrigger
                  onMouseEnter={onMouseEnter}
                  onMouseLeave={onMouseLeave}
                  className="bg-white text-black"
                >
                  <SelectValue placeholder="Select language..." />
                </SelectTrigger>
                <SelectContent
                  onMouseEnter={onMouseEnter}
                  onMouseLeave={onMouseLeave}
                >
                  {Object.values(TranscriptionLanguage).map((lang) => (
                    <SelectItem key={lang} value={lang}>
                      {transcriptionLanguageMap[lang]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={() => {
                  if (!isCreatingCallSession) {
                    createCallSession({
                      trial: !hasActiveSubscription,
                      clientName: clientName.trim() || undefined,
                      language: selectedLanguage,
                      callScriptId: null,
                    });
                  }
                }}
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
                disabled={isCreatingCallSession}
              >
                {isCreatingCallSession ? 'Creating...' : 'Create'}
              </Button>
              <Button
                onClick={() => {
                  setShowQuickStartInput(false);
                  setClientName('');
                }}
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
                disabled={isCreatingCallSession}
              >
                Cancel
              </Button>
            </div>
          )}
          {showEnterTokenManually && userError && (
            <div className="flex flex-row items-center gap-2 w-full justify-center">
              <Input
                placeholder="Auth Token"
                className="bg-white w-full max-w-xs"
                value={inputAuthToken}
                disabled={isSettingAuthToken}
                onChange={(e) => setInputAuthToken(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSetAuthToken();
                  }
                }}
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
              />
              <Button
                onClick={handleSetAuthToken}
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
                disabled={isSettingAuthToken || !inputAuthToken.trim()}
              >
                {isSettingAuthToken ? 'Setting...' : 'Set Token'}
              </Button>
              <Button
                onClick={() => {
                  setShowEnterTokenManually(false);
                  setInputAuthToken('');
                }}
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
              >
                Cancel
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
          {callSession?.hasEnded && (
            <div className="text-white bg-black/50 rounded-lg p-2 px-4">
              Session has ended. Please create and start a new one in the
              dashboard.
            </div>
          )}
          {activatedSession && (
            <div className="flex flex-row items-center gap-2 mt-1 w-full justify-center">
              {isLoadingBuiltInPrompts || isLoadingRealTimePrompts ? (
                <span>Loading prompts...</span>
              ) : allPrompts && allPrompts.length > 0 ? (
                <div className="flex flex-row items-center gap-2">
                  {allPrompts
                    .filter(
                      (prompt) =>
                        callSession.callScriptId || prompt.id !== 'script',
                    )
                    .map((p, index) => {
                      // Add tooltips for first and second prompts
                      if (index === 0) {
                        return (
                          <Tooltip key={p.id}>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                onClick={() => handleGenerateResponse(p.id)}
                                onMouseEnter={onMouseEnter}
                                onMouseLeave={onMouseLeave}
                              >
                                {p.title}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent className="flex flex-row items-center gap-1">
                              <ShortcutIcon /> + H
                            </TooltipContent>
                          </Tooltip>
                        );
                      } else if (index === 1) {
                        return (
                          <Tooltip key={p.id}>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                onClick={() => handleGenerateResponse(p.id)}
                                onMouseEnter={onMouseEnter}
                                onMouseLeave={onMouseLeave}
                              >
                                {p.title}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent className="flex flex-row items-center gap-1">
                              <ShortcutIcon /> + G
                            </TooltipContent>
                          </Tooltip>
                        );
                      } else {
                        // Regular button for other prompts
                        return (
                          <Button
                            key={p.id}
                            size="sm"
                            onClick={() => handleGenerateResponse(p.id)}
                            onMouseEnter={onMouseEnter}
                            onMouseLeave={onMouseLeave}
                          >
                            {p.title}
                          </Button>
                        );
                      }
                    })}
                  {builtInPrompts?.isAnalyzeScreenPromptActive && (
                    <Button
                      onMouseEnter={onMouseEnter}
                      onMouseLeave={onMouseLeave}
                      disabled={isCapturingScreenshot}
                      size="sm"
                      onClick={handleGenerateResponseWithScreenshot}
                    >
                      {isCapturingScreenshot
                        ? 'Capturing...'
                        : 'Analyse Screen'}
                    </Button>
                  )}
                </div>
              ) : (
                <span className="text-white">No prompts found</span>
              )}
              <div className="bg-white/50 w-px h-4" />
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleGenerateResponse('direct-message');
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
            <ChatMessage message={currentAssistantMessage} />
          )}
          {isLoading && <div>Thinking...</div>}
        </div>
      ) : null}
    </div>
  );
}
