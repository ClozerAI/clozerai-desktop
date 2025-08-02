import { useQuery } from '@tanstack/react-query';

export type CallSession = {
  // Base fields from the database schema
  userId: string | null;
  id: string;
  company: string;
  language: string;
  jobDescription: string;
  shortJobDescription: string;
  extraContext: string;
  createdAt: Date;
  activatedAt: Date | null;
  endsAt: Date | null;
  trial: boolean;
  resumeId: string | null;
  speechmaticsApiKey: string | null;
  simpleLanguage: boolean;
  extended: number;
  saveTranscription: boolean;
  loadingSummary: boolean;
  errorSummary: string | null;
  deleted: boolean;
  workspaceId: string | null;

  // Additional computed fields added by the API
  speechmaticsTokenExpired: boolean; // Computed from endsAt < new Date()
  hasEnded: boolean; // Computed from endsAt < new Date()
  timeLeft: number | null; // Computed from endsAt.getTime() - new Date().getTime()
  canExtend: boolean;

  // Additional real-time prompt fields
  builtInPrompts: {
    id: string;
    title: string;
    prompt: string;
    description: string;
  }[];
  realTimePrompts: {
    id: string;
    createdAt: Date | null;
    userId: string | null;
    workspaceId: string | null;
    title: string;
    prompt: string;
  }[];
};

export function useCallSession(callSessionId: string | null) {
  return useQuery<CallSession>({
    queryKey: ['callSession', callSessionId],
    queryFn: () =>
      fetch(
        `https://www.clozerai.com/api/callSession?callSessionId=${callSessionId}`,
      ).then(async (res) => {
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
      }),
    enabled: !!callSessionId,
    refetchInterval: 1000 * 5,
  });
}
