const { app, BrowserWindow, shell, dialog } = require('electron');
const http = require('http');
const path = require('path');
const fs = require('fs/promises');

const APP_NAME = 'Relatório Financeiro IBPV';

app.setName(APP_NAME);

// Usa uma pasta sem acentos e separada das versões antigas, evitando cache corrompido.
const userDataPath = process.env.IBPV_SMOKE_SCREENSHOT
  ? path.join(path.dirname(process.env.IBPV_SMOKE_SCREENSHOT), 'electron-smoke-profile')
  : path.join(app.getPath('appData'), 'IBPV', 'RelatorioFinanceiro');
app.setPath('userData', userDataPath);

function startLocalWebServer() {
  const webRoot = path.resolve(__dirname, 'web-dist');
  const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
  };

  const server = http.createServer(async (request, response) => {
    try {
      if (process.env.IBPV_SMOKE_SCREENSHOT) {
        await fs.appendFile(`${process.env.IBPV_SMOKE_SCREENSHOT}.server.txt`, `${request.method} ${request.url}\n`);
      }
      const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
      const relativePath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, '') || 'index.html';
      const filePath = path.resolve(webRoot, relativePath);
      const isInsideWebRoot = filePath === webRoot || filePath.startsWith(`${webRoot}${path.sep}`);

      if (!isInsideWebRoot) {
        response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Acesso negado');
        return;
      }

      const body = await fs.readFile(filePath);
      const contentType = contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
      response.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      });
      response.end(body);
    } catch (error) {
      if (process.env.IBPV_SMOKE_SCREENSHOT) {
        await fs.appendFile(`${process.env.IBPV_SMOKE_SCREENSHOT}.server.txt`, `ERROR ${error.stack || error}\n`);
      }
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Arquivo não encontrado');
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({ server, url: `http://127.0.0.1:${address.port}/index.html` });
    });
  });
}

function installDownloadHandler(session, ownerWindow) {
  session.on('will-download', async (event, item) => {
    const suggestedName = item.getFilename();
    item.pause();

    const result = await dialog.showSaveDialog(ownerWindow, {
      title: 'Salvar arquivo',
      defaultPath: path.join(app.getPath('downloads'), suggestedName),
      buttonLabel: 'Salvar'
    });

    if (result.canceled || !result.filePath) {
      item.cancel();
      return;
    }

    item.setSavePath(result.filePath);
    item.resume();
  });
}

function createWindow(appUrl) {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1050,
    minHeight: 680,
    title: APP_NAME,
    backgroundColor: '#f8f4ef',
    autoHideMenuBar: true,
    show: false,
    icon: path.join(__dirname, 'app', 'assets', 'logo-ibpv.ico'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.js'),
      spellcheck: false
    }
  });

  installDownloadHandler(win.webContents.session, win);

  if (process.env.IBPV_SMOKE_SCREENSHOT) {
    let smokeFinished = false;
    const smokeEvents = [];
    const finishSmoke = async (reason) => {
      if (smokeFinished) return;
      smokeFinished = true;
      try {
        smokeEvents.push({ event: 'capture', reason, url: win.webContents.getURL() });
        const image = await win.webContents.capturePage();
        await fs.writeFile(process.env.IBPV_SMOKE_SCREENSHOT, image.toPNG());
        await fs.writeFile(`${process.env.IBPV_SMOKE_SCREENSHOT}.json`, JSON.stringify(smokeEvents, null, 2));
      } finally {
        app.quit();
      }
    };

    win.webContents.on('console-message', (_event, level, message) => {
      smokeEvents.push({ event: 'console', level, message });
    });
    win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      smokeEvents.push({ event: 'did-fail-load', errorCode, errorDescription, validatedURL });
    });
    win.webContents.on('render-process-gone', (_event, details) => {
      smokeEvents.push({ event: 'render-process-gone', details });
      fs.writeFile(`${process.env.IBPV_SMOKE_SCREENSHOT}.json`, JSON.stringify(smokeEvents, null, 2));
    });
    win.webContents.once('did-finish-load', () => {
      smokeEvents.push({ event: 'did-finish-load' });
      setTimeout(() => finishSmoke('did-finish-load'), 1800);
    });
    setTimeout(() => finishSmoke('timeout'), 7000);
  } else {
    win.once('ready-to-show', () => {
      win.show();
      win.focus();
    });
  }

  const loading = win.loadURL(appUrl);
  if (process.env.IBPV_SMOKE_SCREENSHOT) {
    win.show();
    loading.catch((error) => fs.writeFile(
      `${process.env.IBPV_SMOKE_SCREENSHOT}.load-error.txt`,
      String(error && error.stack ? error.stack : error)
    ));
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    if (url === 'about:blank' || /^blob:/i.test(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true
          }
        }
      };
    }
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    try {
      const isAllowed = new URL(url).origin === new URL(appUrl).origin;
      if (process.env.IBPV_SMOKE_SCREENSHOT) {
        fs.appendFile(`${process.env.IBPV_SMOKE_SCREENSHOT}.server.txt`, `NAVIGATE ${url} allowed=${isAllowed}\n`);
      }
      if (!isAllowed) event.preventDefault();
    } catch (error) {
      event.preventDefault();
    }
  });
}

let localWebServer;
let localAppUrl;

app.whenReady().then(async () => {
  const localApp = await startLocalWebServer();
  localWebServer = localApp.server;
  localAppUrl = localApp.url;
  createWindow(localAppUrl);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && localAppUrl) createWindow(localAppUrl);
  });
}).catch((error) => {
  dialog.showErrorBox(APP_NAME, `Não foi possível iniciar o aplicativo.\n\n${error.message}`);
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (localWebServer) localWebServer.close();
});
