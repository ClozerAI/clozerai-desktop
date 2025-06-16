import { useQuery } from '@tanstack/react-query';

export default function useVersion() {
  return useQuery({
    queryKey: ['version'],
    queryFn: window.electron.getVersion,
  });
}
