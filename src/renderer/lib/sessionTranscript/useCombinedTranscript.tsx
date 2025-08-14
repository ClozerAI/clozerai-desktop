import { useState, useCallback, useEffect, useRef } from 'react';
import { api } from '../trpc/react';

export type TranscriptEntry = {
  finalTranscript: string;
  partialTranscript: string;
  type: 'microphone' | 'share' | 'combined';
  createdAt: Date;
  lastUpdated: Date;
  willNotChangeFurther: boolean;
  saved: boolean;
};

const updateTimeThreshold = 2500;
const createTimeThreshold = 60000;

export default function useCombinedTranscript(
  callSessionId: string | undefined,
  saveTranscript: boolean | undefined,
) {
  const [combinedTranscript, setCombinedTranscript] = useState<
    TranscriptEntry[]
  >([]);

  const { mutate: saveMutation } = api.transcription.save.useMutation();

  // Save unsaved transcripts to the database
  const saveUnsavedTranscripts = useCallback(
    async (saveAll: boolean = false) => {
      if (!callSessionId || !saveTranscript) return;

      const unsavedTranscripts = combinedTranscript.filter(
        (entry) =>
          !entry.saved &&
          (entry.willNotChangeFurther ||
            saveAll ||
            new Date().getTime() - entry.createdAt.getTime() >
              createTimeThreshold ||
            new Date().getTime() - entry.lastUpdated.getTime() >
              updateTimeThreshold),
      );

      if (unsavedTranscripts.length > 0 && callSessionId) {
        if (saveTranscript) {
          saveMutation({
            callSessionId,
            transcripts: unsavedTranscripts.map((entry) => ({
              finalTranscript: entry.finalTranscript,
              type: entry.type,
              lastUpdated: entry.lastUpdated,
              createdAt: entry.createdAt,
            })),
          });
        }

        // Mark as saved in local state
        setCombinedTranscript((prev) =>
          prev.map((entry) =>
            unsavedTranscripts.includes(entry)
              ? { ...entry, saved: true }
              : entry,
          ),
        );
      }
    },
    [combinedTranscript, callSessionId],
  );

  // Store the latest version of saveUnsavedTranscripts in a ref
  const saveUnsavedTranscriptsRef = useRef(saveUnsavedTranscripts);
  saveUnsavedTranscriptsRef.current = saveUnsavedTranscripts;

  // Set up interval to save unsaved transcripts
  useEffect(() => {
    const interval = setInterval(() => {
      saveUnsavedTranscriptsRef.current();
    }, 5000);

    return () => {
      clearInterval(interval);
    };
  }, []); // Empty dependency array - interval only set up once

  const addTranscript = useCallback(
    (
      transcript: string,
      type: 'microphone' | 'share' | 'combined',
      isPartial: boolean = false,
    ) => {
      setCombinedTranscript((currentTranscript) => {
        // Handle empty partial transcript - clear the last message's partial transcript
        if (isPartial && (!transcript || transcript.trim() === '')) {
          const lastTranscriptIndex = currentTranscript
            .map((entry, index) => (entry.type === type ? index : -1))
            .filter((index) => index !== -1)
            .pop();

          if (lastTranscriptIndex !== undefined) {
            const updated = currentTranscript.map((t, index) => {
              if (index === lastTranscriptIndex) {
                return { ...t, partialTranscript: '' };
              }
              return t;
            });
            // Filter out entries with no content
            return updated.filter(
              (entry) =>
                entry.finalTranscript.trim() !== '' ||
                entry.partialTranscript.trim() !== '',
            );
          }
          return currentTranscript.filter(
            (entry) =>
              entry.finalTranscript.trim() !== '' ||
              entry.partialTranscript.trim() !== '',
          );
        }

        if (!transcript)
          return currentTranscript.filter(
            (entry) =>
              entry.finalTranscript.trim() !== '' ||
              entry.partialTranscript.trim() !== '',
          );

        const lastTranscript = [...currentTranscript]
          .reverse()
          .find((t) => t.type === type);

        const shouldMerge =
          lastTranscript &&
          new Date().getTime() - lastTranscript.createdAt.getTime() <
            createTimeThreshold &&
          (new Date().getTime() - lastTranscript.lastUpdated.getTime() <
            updateTimeThreshold ||
            transcript.trim().length <= 1);

        let updatedTranscript;

        if (shouldMerge && !isPartial) {
          // Merge with existing transcript
          updatedTranscript = currentTranscript.map((t) => {
            if (t === lastTranscript) {
              return {
                ...t,
                finalTranscript: t.finalTranscript + transcript,
                lastUpdated:
                  currentTranscript[currentTranscript.length - 1]?.type === type
                    ? new Date()
                    : t.lastUpdated,
                saved: false, // Mark as unsaved when modified
              };
            }
            return t;
          });
        } else if (shouldMerge && isPartial) {
          // Update partial transcript
          updatedTranscript = currentTranscript.map((t) => {
            if (t === lastTranscript) {
              return {
                ...t,
                partialTranscript: transcript,
                lastUpdated:
                  currentTranscript[currentTranscript.length - 1]?.type === type
                    ? new Date()
                    : t.lastUpdated,
              };
            }
            return t;
          });
        } else {
          // Create new transcript entry
          const clearedTranscript = currentTranscript.map((t) => {
            if (t.type === type) {
              return {
                ...t,
                partialTranscript:
                  lastTranscript && t === lastTranscript
                    ? ''
                    : t.partialTranscript,
                willNotChangeFurther: true,
              };
            }
            return t;
          });

          updatedTranscript = [
            ...clearedTranscript,
            {
              finalTranscript: isPartial ? '' : transcript,
              partialTranscript: isPartial ? transcript : '',
              type,
              lastUpdated: new Date(),
              createdAt: new Date(),
              saved: false,
              willNotChangeFurther: false,
            },
          ];
        }

        // Filter out entries with no content
        return updatedTranscript.filter(
          (entry) =>
            entry.finalTranscript.trim() !== '' ||
            entry.partialTranscript.trim() !== '',
        );
      });
    },
    [],
  );

  const getCombinedTranscriptString = useCallback(() => {
    return combinedTranscript
      .map((t) =>
        t.type === 'microphone'
          ? `**Sales Agent Said**: ${t.finalTranscript + t.partialTranscript}`
          : t.type === 'share'
            ? `**Client Said**: ${t.finalTranscript + t.partialTranscript}`
            : `**Combined Transcript**: ${t.finalTranscript + t.partialTranscript}`,
      )
      .join('\n\n');
  }, [combinedTranscript]);

  const clearCombinedTranscript = useCallback(() => {
    // Save any unsaved transcripts before clearing
    saveUnsavedTranscripts(true);

    setCombinedTranscript([]);
  }, [saveUnsavedTranscripts]);

  return {
    addTranscript,
    getCombinedTranscriptString,
    clearCombinedTranscript,
    combinedTranscript,
    saveUnsavedTranscripts,
  };
}
