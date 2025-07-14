import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CallSession } from './useCallSession';

// --- Add these helper functions ---
function formatMacOSVersion(version: string): string {
  const major = parseInt(version.split('.')[0], 10);
  const macNames: { [key: number]: string } = {
    14: 'Sonoma',
    13: 'Ventura',
    12: 'Monterey',
    11: 'Big Sur',
    10: 'Catalina or earlier', // 10.15 is Catalina, 10.14 is Mojave, etc.
  };
  const name = macNames[major] || 'Unknown macOS';
  return `macOS ${name}`;
}

function formatWindowsVersion(version: string): string {
  if (version.startsWith('10.0.22')) {
    return `Windows 11`;
  }
  if (
    version.startsWith('10.0.19') ||
    version.startsWith('10.0.18') ||
    version.startsWith('10.0.17') ||
    version.startsWith('10.0.16') ||
    version.startsWith('10.0.15') ||
    version.startsWith('10.0.14') ||
    version.startsWith('10.0.13') ||
    version.startsWith('10.0.12') ||
    version.startsWith('10.0.11') ||
    version.startsWith('10.0.10')
  ) {
    return `Windows 10`;
  }
  if (version.startsWith('6.3.')) {
    return `Windows 8.1`;
  }
  if (version.startsWith('6.2.')) {
    return `Windows 8`;
  }
  if (version.startsWith('6.1.')) {
    return `Windows 7`;
  }
  return `Windows (Unknown version: ${version})`;
}

function formatOSVersion(os: string, version: string): string {
  if (os === 'macos') return formatMacOSVersion(version);
  if (os === 'windows') return formatWindowsVersion(version);
  return `${os} ${version}`;
}
// --- End helper functions ---

export function useGenerateSpeechmaticsSession(
  version: string,
  callSessionId: string | null,
  onSuccess: (res: CallSession) => void,
) {
  const queryClient = useQueryClient();
  return useMutation<CallSession>({
    mutationFn: async () => {
      if (!callSessionId) {
        throw new Error('Call session ID is required');
      }

      const os: 'macos' | 'windows' | 'unknown' =
        (window as any).electron?.platform === 'darwin'
          ? 'macos'
          : (window as any).electron?.platform === 'win32'
            ? 'windows'
            : 'unknown';

      const osVersionRaw = (window as any).electron?.osVersion || 'unknown';
      const osVersion = formatOSVersion(os, osVersionRaw);

      return fetch(
        'https://www.clozerai.com/api/callSession/generateSpeechmaticsSession',
        {
          method: 'POST',
          body: JSON.stringify({
            callSessionId,
            os,
            osVersion,
            version,
          }),
        },
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
      });
    },
    onSuccess: (res) => {
      queryClient.setQueryData<CallSession>(
        ['callSession', callSessionId],
        res,
      );
      onSuccess(res);
    },
  });
}
