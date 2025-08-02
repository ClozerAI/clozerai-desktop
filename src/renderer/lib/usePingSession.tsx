import { useMutation } from '@tanstack/react-query';
import { CallSession } from './useCallSession';

export function usePingSession() {
  return useMutation<CallSession, Error, { callSessionId: string }>({
    mutationFn: async ({ callSessionId }: { callSessionId: string }) => {
      return fetch('https://www.clozerai.com/api/callSession/ping', {
        method: 'POST',
        body: JSON.stringify({
          callSessionId,
        }),
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
