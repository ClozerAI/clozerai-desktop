import { useMutation, useQueryClient } from '@tanstack/react-query';
import { InterviewSession } from './useInterviewSession';

export function useExtendSession(
  interviewSessionId?: string,
  onSuccess?: (res: InterviewSession) => void,
) {
  const queryClient = useQueryClient();
  return useMutation<InterviewSession>({
    mutationFn: async () => {
      if (!interviewSessionId) {
        throw new Error('Interview session ID is required');
      }

      return fetch('https://www.parakeet-ai.com/api/interviewSession/extend', {
        method: 'POST',
        body: JSON.stringify({ interviewSessionId }),
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
    onSuccess: (res) => {
      queryClient.setQueryData<InterviewSession>(
        ['interviewSession', interviewSessionId],
        res,
      );
      onSuccess?.(res);
    },
  });
}
