const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const http = require("http");

const BACKEND_HOST = process.env.FOURGIX_HOST || "127.0.0.1";
const BACKEND_PORT = Number(process.env.FOURGIX_PORT || 8000);
const HEALTH_URL = `http://${BACKEND_HOST}:${BACKEND_PORT}/api/health`;
const SHUTDOWN_URL = `http://${BACKEND_HOST}:${BACKEND_PORT}/api/shutdown`;
const HEALTH_TIMEOUT_MS = 60_000;
const HEALTH_INTERVAL_MS = 400;
const VITE_DEV_URL = process.env.FOURGIX_VITE_URL || "http://127.0.0.1:5173";

/** @type {import('child_process').ChildProcess | null} */
let backendProcess = null;
/** @type {import('child_process').ChildProcess | null} */
let backendSpawnedByShell = false;
/** @type {BrowserWindow | null} */
let mainWindow = null;
let isQuitting = false;

function repoRoot() {
  return path.resolve(__dirname, "..", "..");
}

function frontendDistIndex() {
  return path.join(repoRoot(), "apps", "frontend", "dist", "index.html");
}

function backendEntryPath() {
  const packaged = path.join(process.resourcesPath, "backend", "main.py");
  if (app.isPackaged && fs.existsSync(packaged)) {
    return packaged;
  }
  return path.join(repoRoot(), "apps", "backend", "main.py");
}

function resolvePythonExecutable() {
  if (process.env.FOURGIX_PYTHON) {
    return process.env.FOURGIX_PYTHON;
  }
  const sidecar = process.env.FOURGIX_PYTHON_SIDECAR;
  if (sidecar && fs.existsSync(sidecar)) {
    return sidecar;
  }
  if (process.platform === "win32") {
    return "python";
  }
  return "python3";
}

function checkHealthOnce() {
  return new Promise((resolve) => {
    const req = http.get(HEALTH_URL, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function spawnBackend() {
  const python = resolvePythonExecutable();
  const script = backendEntryPath();
  const env = {
    ...process.env,
    FOURGIX_HOST: BACKEND_HOST,
    FOURGIX_PORT: String(BACKEND_PORT),
    PYTHONUNBUFFERED: "1",
  };

  backendProcess = spawn(python, [script], {
    cwd: path.dirname(script),
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  backendSpawnedByShell = true;

  backendProcess.stdout?.on("data", (chunk) => {
    console.log(`[backend] ${chunk.toString().trim()}`);
  });
  backendProcess.stderr?.on("data", (chunk) => {
    console.error(`[backend] ${chunk.toString().trim()}`);
  });
  backendProcess.on("exit", (code, signal) => {
    console.log(`[backend] exit code=${code} signal=${signal}`);
    backendProcess = null;
    backendSpawnedByShell = false;
  });
}

function waitForHealth() {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(HEALTH_URL, (res) => {
        res.resume();
        if (res.statusCode === 200) {
          resolve();
          return;
        }
        schedule();
      });
      req.on("error", schedule);
      req.setTimeout(2000, () => {
        req.destroy();
        schedule();
      });

      function schedule() {
        if (Date.now() > deadline) {
          reject(
            new Error(
              `Backend indisponible (${HEALTH_URL}). Port ${BACKEND_PORT} libre ?`,
            ),
          );
          return;
        }
        setTimeout(tick, HEALTH_INTERVAL_MS);
      }
    };
    tick();
  });
}

function checkViteDevServer() {
  return new Promise((resolve) => {
    const req = http.get(VITE_DEV_URL, (res) => {
      res.resume();
      resolve(res.statusCode && res.statusCode < 500);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function ensureBackend() {
  if (process.env.FOURGIX_SKIP_BACKEND === "1") {
    return;
  }
  const alreadyUp = await checkHealthOnce();
  const restartInDev =
    !app.isPackaged && process.env.FOURGIX_KEEP_BACKEND !== "1";
  if (alreadyUp && restartInDev) {
    console.log("[backend] Rechargement du code Python (mode dev)…");
    await postShutdown();
    await new Promise((resolve) => setTimeout(resolve, 900));
  } else if (alreadyUp) {
    console.log(`[backend] Déjà actif sur ${HEALTH_URL}`);
    return;
  }
  spawnBackend();
  await waitForHealth();
}

async function loadFrontend(window) {
  if (process.env.FOURGIX_FRONTEND_URL) {
    await window.loadURL(process.env.FOURGIX_FRONTEND_URL);
    return;
  }

  const useDev = process.env.FOURGIX_DEV === "1";
  const distIndex = frontendDistIndex();

  if (useDev) {
    const viteUp = await checkViteDevServer();
    if (viteUp) {
      await window.loadURL(VITE_DEV_URL);
      return;
    }
    console.warn(
      `[frontend] ${VITE_DEV_URL} indisponible — bascule sur le build dist.`,
    );
  }

  if (fs.existsSync(distIndex)) {
    await window.loadFile(distIndex);
    return;
  }

  const fallback = path.join(__dirname, "fallback.html");
  if (fs.existsSync(fallback)) {
    await window.loadFile(fallback);
    return;
  }

  throw new Error(
    "Aucune UI trouvée. Lancez : cd apps/frontend && npm install && npm run build",
  );
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  loadFrontend(mainWindow).catch((err) => {
    console.error(err);
    dialog.showErrorBox(
      "4GIx — interface introuvable",
      `${err.message}\n\nBuild : cd apps/frontend && npm run build\nDev : cd apps/frontend && npm run dev (avec FOURGIX_DEV=1)`,
    );
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function postShutdown() {
  return new Promise((resolve) => {
    const req = http.request(
      SHUTDOWN_URL,
      { method: "POST", timeout: 3000 },
      (res) => {
        res.resume();
        resolve();
      },
    );
    req.on("error", () => resolve());
    req.on("timeout", () => {
      req.destroy();
      resolve();
    });
    req.end();
  });
}

async function stopBackend() {
  if (!backendProcess || !backendSpawnedByShell) {
    return;
  }
  await postShutdown();
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 1500));
    if (backendProcess && !backendProcess.killed) {
      backendProcess.kill("SIGKILL");
    }
  }
  backendProcess = null;
  backendSpawnedByShell = false;
}

async function bootstrap() {
  await ensureBackend();
  createWindow();
}

app.whenReady().then(bootstrap).catch((err) => {
  console.error(err);
  dialog.showErrorBox("4GIx — démarrage impossible", String(err.message || err));
  app.quit();
});

app.on("before-quit", async (event) => {
  if (isQuitting) {
    return;
  }
  isQuitting = true;
  event.preventDefault();
  await stopBackend();
  app.exit(0);
});

app.on("window-all-closed", async () => {
  await stopBackend();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle("dialog:openFile", async (_event, options = {}) => {
  const filters = options.filters || [
    { name: "Données SIG", extensions: ["shp", "gpkg", "csv", "geojson", "json"] },
    { name: "Shapefile", extensions: ["shp"] },
    { name: "GeoPackage", extensions: ["gpkg"] },
    { name: "CSV", extensions: ["csv"] },
  ];
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: options.properties || ["openFile"],
    filters,
    title: options.title || "Sélectionner un fichier",
  });
  if (result.canceled) {
    return { canceled: true, filePaths: [] };
  }
  return { canceled: false, filePaths: result.filePaths };
});
