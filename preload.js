import { contextBridge as l, ipcRenderer as i } from "electron";
const r = {
  config: {
    get: () => i.invoke("config:get")
  },
  backend: {
    status: () => i.invoke("backend:status"),
    restart: () => i.invoke("backend:restart")
  },
  dialog: {
    openDirectory: () => i.invoke("dialog:openDirectory"),
    openFile: (e) => i.invoke("dialog:openFile", e),
    openFiles: (e) => i.invoke("dialog:openFiles", e),
    saveFile: (e) => i.invoke("dialog:saveFile", e)
  },
  fs: {
    readFile: (e) => i.invoke("fs:readFile", e),
    writeFile: (e, o, n) => i.invoke("fs:writeFile", e, o, n),
    readDir: (e) => i.invoke("fs:readDir", e),
    exists: (e) => i.invoke("fs:exists", e),
    mkdir: (e) => i.invoke("fs:mkdir", e),
    walkDirectory: (e) => i.invoke("fs:walkDirectory", e)
  },
  shell: {
    openExternal: (e) => i.invoke("shell:openExternal", e),
    showItemInFolder: (e) => i.invoke("shell:showItemInFolder", e)
  },
  app: {
    getPath: (e) => i.invoke("app:getPath", e),
    getVersion: () => i.invoke("app:getVersion")
  },
  on: (e, o) => {
    const n = (s, ...t) => o(...t);
    return i.on(e, n), () => i.removeListener(e, n);
  },
  off: (e, o) => {
    i.removeListener(e, o);
  }
};
l.exposeInMainWorld("electronAPI", r);
async function a() {
  try {
    const e = await r.config.get();
    window.__WRYTICA_RUNTIME__ = e, console.log("[Preload] Runtime config initialized:", e);
  } catch (e) {
    console.error("[Preload] Failed to initialize runtime config:", e), window.__WRYTICA_RUNTIME__ = {
      backendUrl: "http://127.0.0.1:8000",
      desktop: !0,
      version: "0.0.0"
    };
  }
}
a();
console.log("[Preload] Electron preload script loaded");
