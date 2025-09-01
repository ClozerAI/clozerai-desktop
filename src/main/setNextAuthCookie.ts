import { NEXTJS_API_URL } from '@/renderer/lib/trpc/react';
import { BrowserWindow } from 'electron';
import log from 'electron-log';

// requests from the renderer include proper authentication
export async function setNextAuthCookie(
  mainWindow: BrowserWindow,
  authToken: string,
) {
  if (!mainWindow) {
    log.error('Cannot set auth cookie – mainWindow not ready yet');
    return;
  }

  log.info(
    'Setting auth cookie for token:',
    authToken.substring(0, 20) + '...',
  );

  // Set expiration date to 30 days from now (in seconds since UNIX epoch)
  const expirationDate = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

  try {
    await mainWindow.webContents.session.cookies.set({
      url: NEXTJS_API_URL,
      name: '__Secure-next-auth.session-token',
      value: authToken,
      domain: new URL(NEXTJS_API_URL).hostname,
      path: '/',
      // For SameSite=None, secure must be true. Localhost is considered secure even over HTTP
      secure: true,
      httpOnly: false,
      // The renderer is served from the file:// protocol which is cross-site
      // with respect to http://localhost:3000. To make sure the cookie is
      // sent with XHR/fetch requests we need SameSite=None -> 'no_restriction'.
      sameSite: 'no_restriction',
      expirationDate: expirationDate,
    });

    await mainWindow.webContents.session.cookies.set({
      url: NEXTJS_API_URL,
      name: 'next-auth.session-token',
      value: authToken,
      domain: new URL(NEXTJS_API_URL).hostname,
      path: '/',
      // For SameSite=None, secure must be true. Localhost is considered secure even over HTTP
      secure: true,
      httpOnly: false,
      // The renderer is served from the file:// protocol which is cross-site
      // with respect to http://localhost:3000. To make sure the cookie is
      // sent with XHR/fetch requests we need SameSite=None -> 'no_restriction'.
      sameSite: 'no_restriction',
      expirationDate: expirationDate,
    });

    log.info('Auth cookies set successfully');

    // Force write cookies to disk immediately
    await mainWindow.webContents.session.cookies.flushStore();
    log.info('Cookies flushed to disk');

    // Notify the renderer that the auth cookie has been updated
    mainWindow.webContents.send('ipc-auth-cookie-updated');
    log.info('Auth cookie update notification sent to renderer');
  } catch (error) {
    log.error('Error setting auth cookies:', error);
  }
}
