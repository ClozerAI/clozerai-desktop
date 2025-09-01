import { BrowserWindow } from 'electron';
import log from 'electron-log';
import { setNextAuthCookie } from './setNextAuthCookie';

export default async function handleProtocolUrl(
  url: string,
  getMainWindow: () => BrowserWindow | null,
  setInitialProtocolUrl: (url: string | null) => void,
) {
  log.info('Received protocol URL:', url);

  const prefix = 'clozerai://';
  if (!url.startsWith(prefix)) {
    log.info('Invalid protocol');
    return;
  }

  const urlWithoutPrefix = url.replace(prefix, '');
  log.info('URL without prefix:', urlWithoutPrefix);

  // Parse the URL to extract path and query parameters
  const [path, queryString] = urlWithoutPrefix.split('?');

  // Normalize path by removing trailing slashes (Windows may include them)
  const normalizedPath = path.replace(/\/+$/, '');

  // On Windows, command line arguments might have URL encoding issues
  // Decode the query string to ensure proper parsing
  const decodedQueryString = queryString ? decodeURIComponent(queryString) : '';
  log.info('Decoded query string:', decodedQueryString);

  const params = new URLSearchParams(decodedQueryString);

  if (normalizedPath === 'auth') {
    // Handle auth URL: clozerai://auth?payload=...
    const payload = params.get('payload');
    log.info('Extracted payload:', payload);
    if (payload) {
      try {
        // The payload might still be URL-encoded, so decode it if needed
        let decodedPayload = payload;
        try {
          // Try to decode if it's still URL-encoded
          const testDecode = decodeURIComponent(payload);
          if (testDecode !== payload) {
            decodedPayload = testDecode;
            log.info('Further decoded payload:', decodedPayload);
          }
        } catch (e) {
          // If decoding fails, use original payload
          log.info('Payload does not need further decoding');
        }

        const decoded = JSON.parse(
          Buffer.from(decodedPayload, 'base64').toString('utf8'),
        );
        const authToken: string | undefined = decoded.authToken;
        if (authToken) {
          log.info('Received auth token from protocol');
          const mainWindow = getMainWindow();
          if (mainWindow) {
            if (mainWindow.isMinimized()) {
              mainWindow.restore();
            }
            mainWindow.focus();
            // Set cookies ...
            await setNextAuthCookie(mainWindow, authToken);
          } else {
            // Store the URL to handle it once the main window is ready
            setInitialProtocolUrl(url);
          }
        } else {
          log.info('No auth token found in auth payload');
        }
      } catch (e) {
        log.error('Invalid payload in auth protocol URL:', e);
      }
    } else {
      log.info('Missing payload in auth URL');
    }
  } else if (normalizedPath === 'session') {
    // Handle session URL: clozerai://session?payload=...
    const payload = params.get('payload');
    log.info('Extracted session payload:', payload);
    if (payload) {
      try {
        // The payload might still be URL-encoded, so decode it if needed
        let decodedPayload = payload;
        try {
          // Try to decode if it's still URL-encoded
          const testDecode = decodeURIComponent(payload);
          if (testDecode !== payload) {
            decodedPayload = testDecode;
            log.info('Further decoded session payload:', decodedPayload);
          }
        } catch (e) {
          // If decoding fails, use original payload
          log.info('Session payload does not need further decoding');
        }

        const decoded = JSON.parse(
          Buffer.from(decodedPayload, 'base64').toString('utf8'),
        );
        const callSessionId: string | undefined = decoded.callSessionId;
        const authToken: string | undefined = decoded.authToken;

        if (callSessionId && authToken) {
          log.info(
            'Received session ID and auth token from protocol:',
            callSessionId,
          );
          const mainWindow = getMainWindow();
          if (mainWindow) {
            if (mainWindow.isMinimized()) {
              mainWindow.restore();
            }
            mainWindow.focus();
            // Set cookies ...
            await setNextAuthCookie(mainWindow, authToken);
            mainWindow.webContents.send('ipc-load-session', callSessionId);
          } else {
            // Store the URL to handle it once the main window is ready
            setInitialProtocolUrl(url);
          }
        } else {
          log.info('Missing callSessionId or authToken in session payload');
        }
      } catch (e) {
        log.error('Invalid payload in session protocol URL:', e);
      }
    } else {
      log.info('Missing payload in session URL');
    }
  } else {
    log.info('Invalid path in protocol URL:', normalizedPath);
  }
}
