import { app, BrowserWindow, ipcMain, dialog, Menu, shell, nativeTheme } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;
let backendStarting = false;
let backendReady = false;

function getLogDir() {
  return path.join(app.getPath('userData'), 'logs');
}

function writeStartupLog(message: string, extra?: unknown) {
  try {
    const logDir = getLogDir();
    fs.mkdirSync(logDir, { recursive: true });
    const logPath = path.join(logDir, 'desktop-startup.log');
    const line = `[${new Date().toISOString()}] ${message}${extra !== undefined ? ` ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}\n`;
    fs.appendFileSync(logPath, line, 'utf8');
  } catch {
    // Avoid crashing on logging failure
  }
}

const BACKEND_PORT = 8000;
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;

const SUPPORTED_EXTENSIONS = new Set([
  '.txt', '.md', '.json', '.csv', '.ts', '.tsx', '.js', '.jsx',
  '.py', '.html', '.css', '.xml', '.yaml', '.yml', '.log', '.java',
  '.c', '.cpp', '.h', '.hpp', '.go', '.rs', '.sql', '.sh', '.bat', '.ps1',
  '.rst', '.adoc', '.tex', '.rtf', '.doc', '.docx', '.pdf',
  '.jpg', '.jpeg', '.png', '.webp'
]);

const SKIP_PATTERNS = new Set([
  'node_modules', '.git', '.svn', '__pycache__', '.venv', 'venv',
  'dist', 'build', '.next', '.nuxt', 'target', '.idea', '.vscode',
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb'
]);

interface FileEntryResult {
  path: string;
  name: string;
  size: number;
  ext: string;
}

interface RuntimeConfig {
  backendUrl: string;
  desktop: boolean;
  version: string;
}

function getBackendDir() {
  if (isDev) {
    return path.resolve(__dirname, '..', 'backend');
  }

  return path.join(process.resourcesPath, 'backend');
}

function findBackendPython(): string | null {
  const backendDir = getBackendDir();
  
  const venvCandidates = [
    path.join(backendDir, '.venv_runtime', 'Scripts', 'python.exe'),
    path.join(backendDir, '.venv_runtime', 'bin', 'python'),
    path.join(backendDir, '.venv', 'Scripts', 'python.exe'),
    path.join(backendDir, '.venv', 'bin', 'python'),
    path.join(backendDir, '.venv_runtime_win', 'Scripts', 'python.exe'),
    path.join(backendDir, '.venv_runtime_win', 'bin', 'python'),
  ];
  
  for (const venvPath of venvCandidates) {
    if (fs.existsSync(venvPath)) {
      return venvPath;
    }
  }
  
  const pointerFile = path.join(backendDir, '.runtime_venv_path.txt');
  if (fs.existsSync(pointerFile)) {
    const savedPath = fs.readFileSync(pointerFile, 'utf-8').trim();
    const pythonPath = process.platform === 'win32'
      ? path.join(savedPath, 'Scripts', 'python.exe')
      : path.join(savedPath, 'bin', 'python');
    if (fs.existsSync(pythonPath)) {
      return pythonPath;
    }
  }
  
  return null;
}

async function checkBackendHealth(retries = 30, delay = 1000): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(`${BACKEND_URL}/health`);
      if (response.ok) {
        console.log('[Electron] Backend is ready!');
        writeStartupLog('Backend health check passed');
        backendReady = true;
        return true;
      }
    } catch {
      // Backend not ready yet
    }
    
    if (i < retries - 1) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  return false;
}

async function startBackend(): Promise<boolean> {
  if (backendStarting || backendReady) {
    return backendReady;
  }
  
  backendStarting = true;
  console.log('[Electron] Starting backend server...');
  writeStartupLog('Starting backend server', { isDev, backendDir: getBackendDir() });
  
  const pythonPath = findBackendPython();
  if (!pythonPath) {
    console.error('[Electron] Backend Python not found. Run "npm run backend:setup" first.');
    writeStartupLog('Backend Python not found');
    backendStarting = false;
    return false;
  }
  
  const backendDir = getBackendDir();
  writeStartupLog('Resolved backend runtime', { pythonPath, backendDir });
  
  try {
    if (process.platform === 'win32') {
      const portCheck = spawn('cmd.exe', ['/c', 'netstat', '-ano'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      });
      
      let portOutput = '';
      portCheck.stdout.on('data', (data) => { portOutput += data.toString(); });
      
      await new Promise<void>((resolve) => {
        portCheck.on('close', resolve);
        setTimeout(resolve, 1000);
      });
      
      const portMatch = portOutput.match(new RegExp(`:\\d+\\.\\d+\\.\\d+\\.\\d+:${BACKEND_PORT}\\s+LISTENING\\s+(\\d+)`));
      if (portMatch) {
        const pid = parseInt(portMatch[1]);
        try {
          process.kill(pid);
          console.log(`[Electron] Killed existing process on port ${BACKEND_PORT}`);
        } catch {
          // Process might not exist
        }
      }
    }
  } catch (err) {
    console.warn('[Electron] Port check warning:', err);
  }
  
  const backendScript = path.join(backendDir, 'main.py');
  writeStartupLog('Backend script path resolved', { backendScript, exists: fs.existsSync(backendScript) });
  
  backendProcess = spawn(pythonPath, [
    '-m', 'uvicorn', 'main:app',
    '--host', '127.0.0.1',
    '--port', BACKEND_PORT.toString(),
    '--log-level', 'info'
  ], {
    cwd: backendDir,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
    windowsHide: true
  });
  
  backendProcess.stdout?.on('data', (data) => {
    const output = data.toString().trim();
    if (output) {
      console.log(`[Backend] ${output}`);
      writeStartupLog('Backend stdout', output);
    }
  });
  
  backendProcess.stderr?.on('data', (data) => {
    const output = data.toString().trim();
    if (output) {
      if (!output.includes('INFO:')) {
        console.warn(`[Backend] ${output}`);
      }
      writeStartupLog('Backend stderr', output);
    }
  });
  
  backendProcess.on('error', (err) => {
    console.error('[Electron] Backend process error:', err);
    writeStartupLog('Backend process error', String(err));
    backendStarting = false;
    backendReady = false;
  });
  
  backendProcess.on('close', (code) => {
    console.log(`[Electron] Backend exited with code ${code}`);
    writeStartupLog('Backend process exited', { code });
    backendProcess = null;
    backendStarting = false;
    backendReady = false;
  });
  
  const ready = await checkBackendHealth();
  backendStarting = false;
  
  if (!ready) {
    console.error('[Electron] Backend failed to start within timeout');
    writeStartupLog('Backend failed to become healthy in time');
  }
  
  return ready;
}

function createMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Workspace Folder...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow!, {
              properties: ['openDirectory']
            });
            if (!result.canceled && result.filePaths.length > 0) {
              mainWindow?.webContents.send('workspace:selected', result.filePaths[0]);
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Alt+F4',
          click: () => app.quit()
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Wrytica',
          click: () => {
            dialog.showMessageBox(mainWindow!, {
              type: 'info',
              title: 'About Wrytica',
              message: 'Wrytica - AI Document Assistant',
              detail: `Version ${app.getVersion()}\n\nElectron Desktop Application\n\nDocument processing with AI assistance.`
            });
          }
        },
        {
          label: 'View Logs',
          click: () => {
            const logDir = path.join(app.getPath('userData'), 'logs');
            shell.openPath(logDir).catch(() => {});
          }
        }
      ]
    }
  ];
  
  if (process.platform === 'darwin') {
    template.unshift({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    });
  }
  
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

async function createWindow() {
  console.log('[Electron] Creating main window...');
  writeStartupLog('Creating main window');
  
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1a1a2e' : '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true
    },
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default'
  });
  
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    console.log('[Electron] Window ready and shown');
    writeStartupLog('Window ready-to-show');
  });
  
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  
  if (isDev) {
    console.log('[Electron] Loading dev server at http://localhost:5180');
    writeStartupLog('Loading dev URL');
    await mainWindow.loadURL('http://localhost:5180');
    mainWindow.webContents.openDevTools();
  } else {
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
    console.log('[Electron] Loading production build from:', indexPath);
    writeStartupLog('Loading production index', { indexPath, exists: fs.existsSync(indexPath) });
    await mainWindow.loadFile(indexPath);
  }

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    writeStartupLog('Renderer failed to load', { errorCode, errorDescription, validatedURL });
  });

  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    writeStartupLog('Preload failed to load', { preloadPath, error: String(error) });
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    writeStartupLog('Renderer process gone', details);
  });
  
  createMenu();
}

function setupIpcHandlers() {
  ipcMain.handle('config:get', (): RuntimeConfig => {
    return {
      backendUrl: BACKEND_URL,
      desktop: true,
      version: app.getVersion()
    };
  });
  
  ipcMain.handle('backend:status', () => {
    return {
      starting: backendStarting,
      ready: backendReady,
      url: BACKEND_URL
    };
  });
  
  ipcMain.handle('backend:restart', async () => {
    console.log('[Electron] Restarting backend...');
    if (backendProcess) {
      backendProcess.kill();
      backendProcess = null;
    }
    backendReady = false;
    backendStarting = false;
    return await startBackend();
  });
  
  ipcMain.handle('dialog:openDirectory', async () => {
    console.log('[IPC] dialog:openDirectory called');
    writeStartupLog('IPC dialog:openDirectory called');
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Workspace Folder'
    });
    
    if (result.canceled || result.filePaths.length === 0) {
      console.log('[IPC] dialog:openDirectory canceled/empty');
      writeStartupLog('IPC dialog:openDirectory canceled/empty');
      return null;
    }
    console.log('[IPC] dialog:openDirectory selected', result.filePaths[0]);
    writeStartupLog('IPC dialog:openDirectory selected', result.filePaths[0]);
    return result.filePaths[0];
  });
  
  ipcMain.handle('dialog:openFile', async (_, filters?: Electron.FileFilter[]) => {
    const defaultFilters: Electron.FileFilter[] = [
      { name: 'Documents', extensions: ['pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'txt', 'md'] },
      { name: 'All Files', extensions: ['*'] }
    ];
    
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      title: 'Open Document',
      filters: filters || defaultFilters
    });
    
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    
    return result.filePaths[0];
  });
  
  ipcMain.handle('dialog:openFiles', async (_, filters?: Electron.FileFilter[]) => {
    const defaultFilters: Electron.FileFilter[] = [
      { name: 'Documents', extensions: ['pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'txt', 'md'] },
      { name: 'All Files', extensions: ['*'] }
    ];
    
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile', 'multiSelections'],
      title: 'Open Documents',
      filters: filters || defaultFilters
    });
    
    if (result.canceled || result.filePaths.length === 0) {
      return [];
    }
    
    return result.filePaths;
  });
  
  ipcMain.handle('dialog:saveFile', async (_, options?: { defaultPath?: string; filters?: Electron.FileFilter[] }) => {
    const defaultFilters: Electron.FileFilter[] = [
      { name: 'Text', extensions: ['txt', 'md'] },
      { name: 'All Files', extensions: ['*'] }
    ];
    
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: 'Save File',
      defaultPath: options?.defaultPath,
      filters: options?.filters || defaultFilters
    });
    
    if (result.canceled) {
      return null;
    }
    
    return result.filePath;
  });
  
  ipcMain.handle('fs:readFile', async (_, filePath: string) => {
    try {
      const content = await fs.promises.readFile(filePath);
      return { success: true, data: content.toString('base64'), isBase64: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });
  
  ipcMain.handle('fs:writeFile', async (_, filePath: string, content: string, encoding: 'utf8' | 'base64' = 'utf8') => {
    try {
      const data = encoding === 'base64' ? Buffer.from(content, 'base64') : content;
      await fs.promises.writeFile(filePath, data);
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });
  
  ipcMain.handle('fs:readDir', async (_, dirPath: string) => {
    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      return {
        success: true,
        entries: entries.map(entry => ({
          name: entry.name,
          isDirectory: entry.isDirectory(),
          isFile: entry.isFile()
        }))
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });
  
  ipcMain.handle('fs:exists', async (_, filePath: string) => {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  });
  
  ipcMain.handle('fs:mkdir', async (_, dirPath: string) => {
    try {
      await fs.promises.mkdir(dirPath, { recursive: true });
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });
  
  ipcMain.handle('shell:openExternal', async (_, url: string) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });
  
  ipcMain.handle('shell:showItemInFolder', async (_, filePath: string) => {
    shell.showItemInFolder(filePath);
    return { success: true };
  });
  
  ipcMain.handle('app:getPath', (_, name: 'home' | 'appData' | 'userData' | 'temp' | 'desktop' | 'documents') => {
    return app.getPath(name);
  });
  
  ipcMain.handle('app:getVersion', () => app.getVersion());

  ipcMain.handle('fs:walkDirectory', async (_, dirPath: string): Promise<{ success: boolean; files?: FileEntryResult[]; error?: string }> => {
    try {
      console.log('[IPC] fs:walkDirectory called', dirPath);
      writeStartupLog('IPC fs:walkDirectory called', dirPath);
      if (!dirPath || typeof dirPath !== 'string') {
        return { success: false, error: 'Invalid directory path' };
      }

      const normalizedPath = path.normalize(dirPath);
      const stats = await fs.promises.stat(normalizedPath);
      if (!stats.isDirectory()) {
        return { success: false, error: 'Path is not a directory' };
      }

      const files: FileEntryResult[] = [];

      async function walkDir(currentPath: string, depth: number = 0): Promise<void> {
        if (depth > 20) return;

        const entries = await fs.promises.readdir(currentPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(currentPath, entry.name);
          const relativePath = path.relative(normalizedPath, fullPath);
          const pathParts = relativePath.toLowerCase().split(/[\\/]/);

          if (pathParts.some(part => SKIP_PATTERNS.has(part))) {
            continue;
          }

          if (entry.isDirectory()) {
            await walkDir(fullPath, depth + 1);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (SUPPORTED_EXTENSIONS.has(ext)) {
              try {
                const fileStats = await fs.promises.stat(fullPath);
                files.push({
                  path: fullPath,
                  name: entry.name,
                  size: fileStats.size,
                  ext
                });
              } catch {
                // Skip files we can't stat
              }
            }
          }
        }
      }

      await walkDir(normalizedPath);
      console.log('[IPC] fs:walkDirectory success', { dirPath: normalizedPath, files: files.length });
      writeStartupLog('IPC fs:walkDirectory success', { dirPath: normalizedPath, files: files.length });
      return { success: true, files };
    } catch (err) {
      console.error('[IPC] fs:walkDirectory failed', err);
      writeStartupLog('IPC fs:walkDirectory failed', String(err));
      return { success: false, error: String(err) };
    }
  });
}

app.whenReady().then(async () => {
  console.log('[Electron] App ready, initializing...');
  writeStartupLog('App ready');
  
  setupIpcHandlers();
  
  await startBackend();
  await createWindow();
  
  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  console.log('[Electron] All windows closed');
  writeStartupLog('All windows closed');
  
  if (backendProcess) {
    console.log('[Electron] Stopping backend...');
    writeStartupLog('Stopping backend on window-all-closed');
    backendProcess.kill();
    backendProcess = null;
  }
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  console.log('[Electron] App quitting...');
  writeStartupLog('Before quit');
  
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
});

process.on('uncaughtException', (err) => {
  console.error('[Electron] Uncaught exception:', err);
  writeStartupLog('Uncaught exception', String(err?.stack || err));
});

process.on('unhandledRejection', (reason) => {
  console.error('[Electron] Unhandled rejection:', reason);
  writeStartupLog('Unhandled rejection', String(reason));
});
