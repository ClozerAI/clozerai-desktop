import { useMutation } from '@tanstack/react-query';

type AiAnswerToSave = {
  callSessionId: string;
  content: string;
  role: 'user' | 'assistant';
  createdAt: Date;
};

export function useSaveAiAnswers() {
  return useMutation<{ success: true; saved: number }, Error, AiAnswerToSave>({
    mutationFn: async ({ callSessionId, content, role, createdAt }) => {
      return fetch('https://www.clozerai.com/api/callSession/saveAiAnswers', {
        method: 'POST',
        body: JSON.stringify({ callSessionId, content, role, createdAt }),
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
