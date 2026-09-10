const { app, BrowserWindow } = require('electron');
const path = require('path');

const isSmokeTest = process.argv.includes('--smoke-test');

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
        "Boolean(document.getElementById('icon') && document.getElementById('glow'))",
        true
      );
      app.exit(hasExpectedElements ? 0 : 1);
    } catch (error) {
      app.exit(1);
    }
  });

  window.loadFile(path.join(__dirname, 'index.html'));
  window.once('ready-to-show', () => {
    if (!isSmokeTest) {
      window.show();
    }
  });
}

app.whenReady().then(() => {
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
