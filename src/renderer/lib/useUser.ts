import { useQuery } from '@tanstack/react-query';

export type User = {
  id: string;
  email: string;
  name?: string;
  // Add other user properties as needed
};

export function useUser() {
  return useQuery<User>({
    queryKey: ['user'],
    queryFn: async () => {
      const response = await fetch(
        'http://localhost:3000/api/callSession/user',
        {
          method: 'GET',
          credentials: 'include', // This is still important
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        // If response is not ok (status >= 400), throw an error
        const errorData = await response
          .json()
          .catch(() => ({ message: 'Unknown error' }));
        throw new Error(
          errorData.error || `Request failed with status ${response.status}`,
        );
      }

      return response.json();
    },
    retry: false,
  });
}
