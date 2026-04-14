import { app as f, BrowserWindow as j, ipcMain as l, dialog as y, shell as P, nativeTheme as O, Menu as F } from "electron";
import { spawn as I } from "child_process";
import s from "node:path";
import d from "node:fs";
import { fileURLToPath as R } from "node:url";
const D = s.dirname(R(import.meta.url)), _ = process.env.NODE_ENV === "development" || !f.isPackaged;
let a = null, p = null, g = !1, m = !1;
function T() {
  return s.join(f.getPath("userData"), "logs");
}
function r(e, t) {
  try {
    const n = T();
    d.mkdirSync(n, { recursive: !0 });
    const o = s.join(n, "desktop-startup.log"), c = `[${(/* @__PURE__ */ new Date()).toISOString()}] ${e}${t !== void 0 ? ` ${typeof t == "string" ? t : JSON.stringify(t)}` : ""}
`;
    d.appendFileSync(o, c, "utf8");
  } catch {
  }
}
const x = 8e3, S = `http://127.0.0.1:${x}`, L = /* @__PURE__ */ new Set([
  ".txt",
  ".md",
  ".json",
  ".csv",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".html",
  ".css",
  ".xml",
  ".yaml",
  ".yml",
  ".log",
  ".java",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".go",
  ".rs",
  ".sql",
  ".sh",
  ".bat",
  ".ps1",
  ".rst",
  ".adoc",
  ".tex",
  ".rtf",
  ".doc",
  ".docx",
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp"
]), $ = /* @__PURE__ */ new Set([
  "node_modules",
  ".git",
  ".svn",
  "__pycache__",
  ".venv",
  "venv",
  "dist",
  "build",
  ".next",
  ".nuxt",
  "target",
  ".idea",
  ".vscode",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb"
]);
function E() {
  return _ ? s.resolve(D, "..", "backend") : s.join(process.resourcesPath, "backend");
}
function N() {
  const e = E(), t = [
    s.join(e, ".venv_runtime", "Scripts", "python.exe"),
    s.join(e, ".venv_runtime", "bin", "python"),
    s.join(e, ".venv", "Scripts", "python.exe"),
    s.join(e, ".venv", "bin", "python"),
    s.join(e, ".venv_runtime_win", "Scripts", "python.exe"),
    s.join(e, ".venv_runtime_win", "bin", "python")
  ];
  for (const o of t)
    if (d.existsSync(o))
      return o;
  const n = s.join(e, ".runtime_venv_path.txt");
  if (d.existsSync(n)) {
    const o = d.readFileSync(n, "utf-8").trim(), c = process.platform === "win32" ? s.join(o, "Scripts", "python.exe") : s.join(o, "bin", "python");
    if (d.existsSync(c))
      return c;
  }
  return null;
}
async function U(e = 30, t = 1e3) {
  for (let n = 0; n < e; n++) {
    try {
      if ((await fetch(`${S}/health`)).ok)
        return console.log("[Electron] Backend is ready!"), r("Backend health check passed"), m = !0, !0;
    } catch {
    }
    n < e - 1 && await new Promise((o) => setTimeout(o, t));
  }
  return !1;
}
async function B() {
  var c, w;
  if (g || m)
    return m;
  g = !0, console.log("[Electron] Starting backend server..."), r("Starting backend server", { isDev: _, backendDir: E() });
  const e = N();
  if (!e)
    return console.error('[Electron] Backend Python not found. Run "npm run backend:setup" first.'), r("Backend Python not found"), g = !1, !1;
  const t = E();
  r("Resolved backend runtime", { pythonPath: e, backendDir: t });
  try {
    if (process.platform === "win32") {
      const i = I("cmd.exe", ["/c", "netstat", "-ano"], {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: !0
      });
      let u = "";
      i.stdout.on("data", (h) => {
        u += h.toString();
      }), await new Promise((h) => {
        i.on("close", h), setTimeout(h, 1e3);
      });
      const k = u.match(new RegExp(`:\\d+\\.\\d+\\.\\d+\\.\\d+:${x}\\s+LISTENING\\s+(\\d+)`));
      if (k) {
        const h = parseInt(k[1]);
        try {
          process.kill(h), console.log(`[Electron] Killed existing process on port ${x}`);
        } catch {
        }
      }
    }
  } catch (i) {
    console.warn("[Electron] Port check warning:", i);
  }
  const n = s.join(t, "main.py");
  r("Backend script path resolved", { backendScript: n, exists: d.existsSync(n) }), p = I(e, [
    "-m",
    "uvicorn",
    "main:app",
    "--host",
    "127.0.0.1",
    "--port",
    x.toString(),
    "--log-level",
    "info"
  ], {
    cwd: t,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env },
    windowsHide: !0
  }), (c = p.stdout) == null || c.on("data", (i) => {
    const u = i.toString().trim();
    u && (console.log(`[Backend] ${u}`), r("Backend stdout", u));
  }), (w = p.stderr) == null || w.on("data", (i) => {
    const u = i.toString().trim();
    u && (u.includes("INFO:") || console.warn(`[Backend] ${u}`), r("Backend stderr", u));
  }), p.on("error", (i) => {
    console.error("[Electron] Backend process error:", i), r("Backend process error", String(i)), g = !1, m = !1;
  }), p.on("close", (i) => {
    console.log(`[Electron] Backend exited with code ${i}`), r("Backend process exited", { code: i }), p = null, g = !1, m = !1;
  });
  const o = await U();
  return g = !1, o || (console.error("[Electron] Backend failed to start within timeout"), r("Backend failed to become healthy in time")), o;
}
function V() {
  const e = [
    {
      label: "File",
      submenu: [
        {
          label: "Open Workspace Folder...",
          accelerator: "CmdOrCtrl+O",
          click: async () => {
            const n = await y.showOpenDialog(a, {
              properties: ["openDirectory"]
            });
            !n.canceled && n.filePaths.length > 0 && (a == null || a.webContents.send("workspace:selected", n.filePaths[0]));
          }
        },
        { type: "separator" },
        {
          label: "Exit",
          accelerator: process.platform === "darwin" ? "Cmd+Q" : "Alt+F4",
          click: () => f.quit()
        }
      ]
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" }
      ]
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    },
    {
      label: "Help",
      submenu: [
        {
          label: "About Wrytica",
          click: () => {
            y.showMessageBox(a, {
              type: "info",
              title: "About Wrytica",
              message: "Wrytica - AI Document Assistant",
              detail: `Version ${f.getVersion()}

Electron Desktop Application

Document processing with AI assistance.`
            });
          }
        },
        {
          label: "View Logs",
          click: () => {
            const n = s.join(f.getPath("userData"), "logs");
            P.openPath(n).catch(() => {
            });
          }
        }
      ]
    }
  ];
  process.platform === "darwin" && e.unshift({
    label: f.name,
    submenu: [
      { role: "about" },
      { type: "separator" },
      { role: "services" },
      { type: "separator" },
      { role: "hide" },
      { role: "hideOthers" },
      { role: "unhide" },
      { type: "separator" },
      { role: "quit" }
    ]
  });
  const t = F.buildFromTemplate(e);
  F.setApplicationMenu(t);
}
async function C() {
  if (console.log("[Electron] Creating main window..."), r("Creating main window"), a = new j({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    backgroundColor: O.shouldUseDarkColors ? "#1a1a2e" : "#ffffff",
    webPreferences: {
      preload: s.join(D, "preload.js"),
      contextIsolation: !0,
      nodeIntegration: !1,
      sandbox: !1,
      webSecurity: !0
    },
    show: !1,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default"
  }), a.once("ready-to-show", () => {
    a == null || a.show(), console.log("[Electron] Window ready and shown"), r("Window ready-to-show");
  }), a.on("closed", () => {
    a = null;
  }), _)
    console.log("[Electron] Loading dev server at http://localhost:5180"), r("Loading dev URL"), await a.loadURL("http://localhost:5180"), a.webContents.openDevTools();
  else {
    const e = s.join(D, "..", "dist", "index.html");
    console.log("[Electron] Loading production build from:", e), r("Loading production index", { indexPath: e, exists: d.existsSync(e) }), await a.loadFile(e);
  }
  a.webContents.on("did-fail-load", (e, t, n, o) => {
    r("Renderer failed to load", { errorCode: t, errorDescription: n, validatedURL: o });
  }), a.webContents.on("render-process-gone", (e, t) => {
    r("Renderer process gone", t);
  }), V();
}
function W() {
  l.handle("config:get", () => ({
    backendUrl: S,
    desktop: !0,
    version: f.getVersion()
  })), l.handle("backend:status", () => ({
    starting: g,
    ready: m,
    url: S
  })), l.handle("backend:restart", async () => (console.log("[Electron] Restarting backend..."), p && (p.kill(), p = null), m = !1, g = !1, await B())), l.handle("dialog:openDirectory", async () => {
    console.log("[IPC] dialog:openDirectory called"), r("IPC dialog:openDirectory called");
    const e = await y.showOpenDialog(a, {
      properties: ["openDirectory", "createDirectory"],
      title: "Select Workspace Folder"
    });
    return e.canceled || e.filePaths.length === 0 ? (console.log("[IPC] dialog:openDirectory canceled/empty"), r("IPC dialog:openDirectory canceled/empty"), null) : (console.log("[IPC] dialog:openDirectory selected", e.filePaths[0]), r("IPC dialog:openDirectory selected", e.filePaths[0]), e.filePaths[0]);
  }), l.handle("dialog:openFile", async (e, t) => {
    const n = [
      { name: "Documents", extensions: ["pdf", "docx", "doc", "xlsx", "xls", "pptx", "ppt", "txt", "md"] },
      { name: "All Files", extensions: ["*"] }
    ], o = await y.showOpenDialog(a, {
      properties: ["openFile"],
      title: "Open Document",
      filters: t || n
    });
    return o.canceled || o.filePaths.length === 0 ? null : o.filePaths[0];
  }), l.handle("dialog:openFiles", async (e, t) => {
    const n = [
      { name: "Documents", extensions: ["pdf", "docx", "doc", "xlsx", "xls", "pptx", "ppt", "txt", "md"] },
      { name: "All Files", extensions: ["*"] }
    ], o = await y.showOpenDialog(a, {
      properties: ["openFile", "multiSelections"],
      title: "Open Documents",
      filters: t || n
    });
    return o.canceled || o.filePaths.length === 0 ? [] : o.filePaths;
  }), l.handle("dialog:saveFile", async (e, t) => {
    const n = [
      { name: "Text", extensions: ["txt", "md"] },
      { name: "All Files", extensions: ["*"] }
    ], o = await y.showSaveDialog(a, {
      title: "Save File",
      defaultPath: t == null ? void 0 : t.defaultPath,
      filters: (t == null ? void 0 : t.filters) || n
    });
    return o.canceled ? null : o.filePath;
  }), l.handle("fs:readFile", async (e, t) => {
    try {
      return { success: !0, data: (await d.promises.readFile(t)).toString("base64"), isBase64: !0 };
    } catch (n) {
      return { success: !1, error: String(n) };
    }
  }), l.handle("fs:writeFile", async (e, t, n, o = "utf8") => {
    try {
      const c = o === "base64" ? Buffer.from(n, "base64") : n;
      return await d.promises.writeFile(t, c), { success: !0 };
    } catch (c) {
      return { success: !1, error: String(c) };
    }
  }), l.handle("fs:readDir", async (e, t) => {
    try {
      return {
        success: !0,
        entries: (await d.promises.readdir(t, { withFileTypes: !0 })).map((o) => ({
          name: o.name,
          isDirectory: o.isDirectory(),
          isFile: o.isFile()
        }))
      };
    } catch (n) {
      return { success: !1, error: String(n) };
    }
  }), l.handle("fs:exists", async (e, t) => {
    try {
      return await d.promises.access(t), !0;
    } catch {
      return !1;
    }
  }), l.handle("fs:mkdir", async (e, t) => {
    try {
      return await d.promises.mkdir(t, { recursive: !0 }), { success: !0 };
    } catch (n) {
      return { success: !1, error: String(n) };
    }
  }), l.handle("shell:openExternal", async (e, t) => {
    try {
      return await P.openExternal(t), { success: !0 };
    } catch (n) {
      return { success: !1, error: String(n) };
    }
  }), l.handle("shell:showItemInFolder", async (e, t) => (P.showItemInFolder(t), { success: !0 })), l.handle("app:getPath", (e, t) => f.getPath(t)), l.handle("app:getVersion", () => f.getVersion()), l.handle("fs:walkDirectory", async (e, t) => {
    try {
      if (console.log("[IPC] fs:walkDirectory called", t), r("IPC fs:walkDirectory called", t), !t || typeof t != "string")
        return { success: !1, error: "Invalid directory path" };
      const n = s.normalize(t);
      if (!(await d.promises.stat(n)).isDirectory())
        return { success: !1, error: "Path is not a directory" };
      const c = [];
      async function w(i, u = 0) {
        if (u > 20) return;
        const k = await d.promises.readdir(i, { withFileTypes: !0 });
        for (const h of k) {
          const b = s.join(i, h.name);
          if (!s.relative(n, b).toLowerCase().split(/[\\/]/).some((v) => $.has(v))) {
            if (h.isDirectory())
              await w(b, u + 1);
            else if (h.isFile()) {
              const v = s.extname(h.name).toLowerCase();
              if (L.has(v))
                try {
                  const A = await d.promises.stat(b);
                  c.push({
                    path: b,
                    name: h.name,
                    size: A.size,
                    ext: v
                  });
                } catch {
                }
            }
          }
        }
      }
      return await w(n), console.log("[IPC] fs:walkDirectory success", { dirPath: n, files: c.length }), r("IPC fs:walkDirectory success", { dirPath: n, files: c.length }), { success: !0, files: c };
    } catch (n) {
      return console.error("[IPC] fs:walkDirectory failed", n), r("IPC fs:walkDirectory failed", String(n)), { success: !1, error: String(n) };
    }
  });
}
f.whenReady().then(async () => {
  console.log("[Electron] App ready, initializing..."), r("App ready"), W(), await B(), await C(), f.on("activate", async () => {
    j.getAllWindows().length === 0 && await C();
  });
});
f.on("window-all-closed", () => {
  console.log("[Electron] All windows closed"), r("All windows closed"), p && (console.log("[Electron] Stopping backend..."), r("Stopping backend on window-all-closed"), p.kill(), p = null), process.platform !== "darwin" && f.quit();
});
f.on("before-quit", () => {
  console.log("[Electron] App quitting..."), r("Before quit"), p && (p.kill(), p = null);
});
process.on("uncaughtException", (e) => {
  console.error("[Electron] Uncaught exception:", e), r("Uncaught exception", String((e == null ? void 0 : e.stack) || e));
});
process.on("unhandledRejection", (e) => {
  console.error("[Electron] Unhandled rejection:", e), r("Unhandled rejection", String(e));
});
