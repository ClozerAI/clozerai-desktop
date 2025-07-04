import { useMutation } from '@tanstack/react-query';

type TranscriptEntryToSave = {
  finalTranscript: string;
  type: 'microphone' | 'share' | 'combined';
  lastUpdated: Date;
  createdAt: Date;
};

export function useSaveTranscript() {
  return useMutation<
    { success: true; saved: number },
    Error,
    {
      callSessionId: string;
      transcripts: TranscriptEntryToSave[];
    }
  >({
    mutationFn: async ({
      callSessionId,
      transcripts,
    }: {
      callSessionId: string;
      transcripts: TranscriptEntryToSave[];
    }) => {
      if (!callSessionId) {
        throw new Error('Call session ID is required');
      }

      return fetch('https://www.clozerai.com/api/callSession/saveTranscript', {
        method: 'POST',
        body: JSON.stringify({ callSessionId, transcripts }),
      }).then(async (res) => {
        if (!res.ok) {
          // If response is not ok (status >= 400), throw an error
          const errorData = await res
            .json()
            .catch(() => ({ message: 'Unknown error' }));
          throw new Error(
            errorData.error || `Request failed with status ${res.status}`,
          );
        }
        return res.json();
      });
    },
  });
}
