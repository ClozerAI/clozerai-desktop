import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export type InterviewSession = {
  // Base fields from the database schema
  userId: string;
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
  saveSummary: boolean;
  loadingSummary: boolean;
  errorSummary: string | null;
  deleted: boolean;

  // Additional computed fields added by the API
  expired: boolean; // Computed from endsAt < new Date()
  timeLeft: number | null; // Computed from endsAt.getTime() - new Date().getTime()
  resumeString: string | null;
  canExtend: boolean;
};

export function useInterviewSession(interviewSessionId: string | null) {
  return useQuery<InterviewSession>({
    queryKey: ['interviewSession', interviewSessionId],
    queryFn: () =>
      fetch(
        `https://www.parakeet-ai.com/api/interviewSession?interviewSessionId=${interviewSessionId}`,
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
    enabled: !!interviewSessionId,
    refetchInterval: 1000 * 5,
  });
}
