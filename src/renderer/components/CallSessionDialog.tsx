'use client';

import { Button } from '@/renderer/components/ui/button';
import { api } from '@/renderer/lib/trpc/react';
import { useEffect, useState } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
  DialogClose,
  DialogHeader,
} from '@/renderer/components/ui/dialog';
import { Input } from '@/renderer/components/ui/input';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/renderer/components/ui/select';
import transcriptionLanguageMap, {
  TranscriptionLanguage,
} from '@/renderer/lib/transcriptLanguageMap';
import { Textarea } from '@/renderer/components/ui/textarea';
import { Bot, Briefcase, Globe, Notebook } from 'lucide-react';
import { Switch } from '@/renderer/components/ui/switch';
import { millisecondsToTimeString } from '@/renderer/lib/millisecondsToTimeString';
import { toast } from 'sonner';
import { aiModelLogoMap, aiModelNameMap } from '@/renderer/lib/aiModels';
import {
  DEFAULT_AI_MODEL,
  DEFAULT_LANGUAGE,
  DEFAULT_SAVE_TRANSCRIPTION,
  DEFAULT_BACKGROUND_FILTERING,
} from '@/renderer/lib/callSessionDefaults';
import CallScriptSelector from '@/renderer/components/CallScriptSelector';
import { LabelWithTooltip } from './LabelWithTooltip';
import type { sessionAIModelEnum } from '@nextjs-types/server/db/schema.js' with { 'resolution-mode': 'import' };
import BackgroundFilteringSelector from './BackgroundFilteringSelector';
import LanguageSelector from './LanguageSelector';
import AIModelSelector from './AIModelSelector';

type CallSessionDialogProps = {
  open: boolean;
  setOpen: (open: boolean) => void;
  isTrial: boolean;
  nextTrialSessionAllowedAt: Date;
  onCreated: (id: string) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
};

export default function CallSessionDialog(props: CallSessionDialogProps) {
  const { open, setOpen } = props;
  const utils = api.useUtils();

  const { data: callSession, isLoading: isLoadingCallSession } =
    api.callSession.getMany.useQuery({
      limit: 1,
      offset: 0,
    });

  const lastSessionLanguage = callSession?.data?.[0]?.language;
  const lastSessionAiModel = callSession?.data?.[0]?.aiModel;
  const lastSessionSaveTranscription =
    callSession?.data?.[0]?.saveTranscription;
  const lastSessionCallScriptId = callSession?.data?.[0]?.callScriptId;
  const lastSessionBackgroundFiltering =
    callSession?.data?.[0]?.backgroundFiltering;

  useEffect(() => {
    // Don't set the last session language/ai model if the user has already selected a language/ai model
    if (isLoadingCallSession) {
      return;
    }

    if (callSession?.data?.[0]) {
      setLanguage(callSession.data[0].language as TranscriptionLanguage);
      setAiModel(callSession.data[0].aiModel);
      setSaveTranscription(callSession.data[0].saveTranscription);
      setBackgroundFiltering(
        callSession.data[0].backgroundFiltering.toString(),
      );
    }
  }, [callSession]);

  // Different mutations based on mode
  const { mutate: createMutation, isPending: createMutationPending } =
    api.callSession.create.useMutation({
      onSuccess: (data) => {
        utils.callSession.getMany.refetch();
        utils.user.getUserProfile.refetch();
        setOpen(false);
        props.onCreated(data.id);
      },
      onError: (error) => {
        toast.error(error.message);
      },
    });

  // Get initial values based on mode
  const getInitialValues = () => {
    return {
      clientName: '',
      clientDescription: '',
      language:
        (lastSessionLanguage as TranscriptionLanguage) ?? DEFAULT_LANGUAGE,
      aiModel: lastSessionAiModel ?? DEFAULT_AI_MODEL,
      saveTranscription:
        lastSessionSaveTranscription ?? DEFAULT_SAVE_TRANSCRIPTION,
      callScriptId: lastSessionCallScriptId ?? null,
      backgroundFiltering:
        lastSessionBackgroundFiltering?.toString() ??
        DEFAULT_BACKGROUND_FILTERING.toString(),
    };
  };

  const initialValues = getInitialValues();

  // Form state
  const [clientName, setClientName] = useState(initialValues.clientName || '');
  const [clientDescription, setClientDescription] = useState(
    initialValues.clientDescription || '',
  );
  const [language, setLanguage] = useState<TranscriptionLanguage>(
    initialValues.language,
  );
  const [saveTranscription, setSaveTranscription] = useState(
    initialValues.saveTranscription,
  );
  const [aiModel, setAiModel] = useState<
    (typeof sessionAIModelEnum.enumValues)[number]
  >(initialValues.aiModel);
  const [callScriptId, setCallScriptId] = useState<string | null>(
    initialValues.callScriptId,
  );
  const [backgroundFiltering, setBackgroundFiltering] = useState(
    initialValues.backgroundFiltering,
  );

  // Trial session time tracking (only for create mode)
  const [now, setTime] = useState<Date>(new Date());
  useEffect(() => {
    if (!props.isTrial) return;

    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, [props.isTrial]);

  const trialSessionAllowed =
    props.isTrial && props.nextTrialSessionAllowedAt
      ? props.nextTrialSessionAllowedAt < now
      : true;

  const timeLeft = props.nextTrialSessionAllowedAt
    ? props.nextTrialSessionAllowedAt.getTime() - now.getTime()
    : 0;

  // Reset form to initial state
  const resetForm = () => {
    const values = getInitialValues();
    setClientName(values.clientName || '');
    setClientDescription(values.clientDescription || '');
    setLanguage(values.language);
    setSaveTranscription(values.saveTranscription);
    setAiModel(values.aiModel);
    setCallScriptId(values.callScriptId);
    setBackgroundFiltering(values.backgroundFiltering);
  };

  // Reset form when dialog opens or mode/session changes
  useEffect(() => {
    if (open) {
      resetForm();
    }
  }, [open]);

  async function handleSubmit() {
    if (!language) {
      toast.error('Please select a language.');
      return;
    }

    if (!aiModel) {
      toast.error('Please select an AI model.');
      return;
    }

    createMutation({
      clientName,
      clientDescription,
      language,
      trial: props.isTrial || false,
      saveTranscription,
      aiModel,
      callScriptId,
      backgroundFiltering: Number(backgroundFiltering),
    });
  }

  // Helper function to render form content
  function renderFormContent() {
    return (
      <>
        <DialogHeader>
          <DialogTitle>
            {props.isTrial ? '⏰ Trial Call (10 min)' : 'Call'}
          </DialogTitle>
          <DialogDescription>
            Configure your call session settings below. This is a 10 minute
            trial session. The timer will not start until you connect your
            screen sharing.
            <br />
            You won't be able to create another trial session for 11 minutes
            after this one ends.
          </DialogDescription>
        </DialogHeader>

        {/* Client Information Section */}
        <div className="flex flex-col gap-y-4">
          <div className="flex flex-col gap-y-1">
            <LabelWithTooltip
              icon={<Briefcase className="h-4 w-4" />}
              tooltip="Enter the name of the client you're calling. This helps the AI provide relevant suggestions and answers."
            >
              Client{' '}
              <span className="text-muted-foreground text-xs">(Optional)</span>
            </LabelWithTooltip>
            <Input
              placeholder="Microsoft..."
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-y-1">
            <LabelWithTooltip
              icon={<Notebook className="h-4 w-4" />}
              tooltip="Optional description of the client's business or industry. This provides additional context for the AI."
            >
              Client Description{' '}
              <span className="text-muted-foreground text-xs">(Optional)</span>
            </LabelWithTooltip>
            <Textarea
              placeholder="IT company that provides software solutions..."
              value={clientDescription}
              onChange={(e) => setClientDescription(e.target.value)}
            />
          </div>
        </div>

        <div className="border-t border-gray-200" />

        <div className="flex flex-col gap-y-4">
          <LanguageSelector
            selectedLanguage={language}
            onLanguageChange={setLanguage}
            disabled={isLoadingCallSession}
          />

          <CallScriptSelector
            selectedScriptId={callScriptId}
            onScriptChange={setCallScriptId}
          />

          <div className="border-t border-gray-200" />

          <AIModelSelector
            selectedModel={aiModel}
            onModelChange={setAiModel}
            disabled={isLoadingCallSession}
          />
        </div>

        {/* Background Filtering Section */}
        <BackgroundFilteringSelector
          selectedLevel={backgroundFiltering}
          onLevelChange={setBackgroundFiltering}
        />

        <div className="border-t border-gray-200" />

        {/* Save Transcript Section */}
        <div className="flex flex-col gap-y-1">
          <div className="flex flex-row items-center gap-x-2">
            <LabelWithTooltip tooltip="Enable this to save a transcript of your call for later review and analysis. Legal Disclaimer: You must comply with all applicable recording laws. Many jurisdictions require consent from all parties being recorded.">
              Save Transcript
            </LabelWithTooltip>
            <Switch
              checked={saveTranscription}
              onCheckedChange={setSaveTranscription}
            />
          </div>
        </div>
      </>
    );
  }

  const renderTrigger = () => {
    return (
      <DialogTrigger asChild>
        <Button
          onMouseEnter={props.onMouseEnter}
          onMouseLeave={props.onMouseLeave}
        >
          {props.isTrial ? <>Start Trial Session</> : <>Start Session</>}
        </Button>
      </DialogTrigger>
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {renderTrigger()}
      <DialogContent className="max-w-2xl">
        <form
          className="flex flex-col gap-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          {renderFormContent()}

          <DialogFooter className="mt-2">
            <DialogClose asChild>
              <Button
                type="button"
                variant="outline"
                className="flex-1 flex-row items-center gap-1"
              >
                Close
              </Button>
            </DialogClose>
            <Button
              type="submit"
              disabled={
                createMutationPending ||
                !trialSessionAllowed ||
                isLoadingCallSession
              }
              className="flex-1 flex-row items-center gap-1"
            >
              {createMutationPending
                ? 'Starting...'
                : !trialSessionAllowed && props.isTrial
                  ? `⏰ ${millisecondsToTimeString(timeLeft)}`
                  : props.isTrial
                    ? props.isTrial
                      ? 'Create Trial Session'
                      : 'Create Session'
                    : 'Create Session'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
