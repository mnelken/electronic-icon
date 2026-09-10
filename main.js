const { app, BrowserWindow, session } = require('electron');
const path = require('path');

const isSmokeTest = process.argv.includes('--smoke-test');

function isTrustedMediaRequest(webContents, requestingOrigin, details = {}) {
  const currentUrl = webContents.getURL();
  const isLocalRenderer = currentUrl.startsWith('file://');
  const isLocalOrigin = !requestingOrigin || requestingOrigin.startsWith('file://');
  const mediaTypes = details.mediaTypes || [];

  return isLocalRenderer && isLocalOrigin && (mediaTypes.length === 0 || mediaTypes.includes('video'));
}

function createWindow() {
  const window = new BrowserWindow({
    show: false,
    backgroundColor: '#000000',
    frame: false,
    fullscreen: true,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });
  window.webContents.once('did-fail-load', () => {
    if (isSmokeTest) {
      app.exit(1);
    }
  });
  window.webContents.once('did-finish-load', async () => {
    if (!isSmokeTest) {
      return;
    }

    try {
      const hasExpectedElements = await window.webContents.executeJavaScript(
        `new Promise((resolve) => {
          const deadline = Date.now() + 10000;

          const checkReady = () => {
            const image = document.getElementById('icon');
            const canvas = document.getElementById('glow');

            if (!canvas || !image) {
              resolve(false);
              return;
            }

            if (image.complete && image.naturalWidth > 0) {
              resolve(true);
              return;
            }

            if (Date.now() >= deadline) {
              resolve(false);
              return;
            }

            setTimeout(checkReady, 100);
          };

          checkReady();
        })`,
        true
      );
      app.exit(hasExpectedElements ? 0 : 1);
    } catch (error) {
      app.exit(1);
    }
  });

  window.loadFile(path.join(__dirname, 'index.html'), {
    query: isSmokeTest ? { smokeTest: '1' } : undefined
  });
  window.once('ready-to-show', () => {
    if (!isSmokeTest) {
      window.show();
    }
  });
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    if (permission === 'media') {
      return isTrustedMediaRequest(webContents, requestingOrigin, details);
    }

    return false;
  });

  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback, details) => {
      const requestingOrigin = details.securityOrigin || details.requestingUrl || '';
      callback(permission === 'media' && isTrustedMediaRequest(webContents, requestingOrigin, details));
    }
  );

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
