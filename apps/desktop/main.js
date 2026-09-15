const { app, BrowserWindow, ipcMain } = require("electron");
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

/** @type {import('child_process').ChildProcess | null} */
let backendProcess = null;
/** @type {BrowserWindow | null} */
let mainWindow = null;
let isQuitting = false;

function repoRoot() {
  return path.resolve(__dirname, "..", "..");
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

  backendProcess.stdout?.on("data", (chunk) => {
    console.log(`[backend] ${chunk.toString().trim()}`);
  });
  backendProcess.stderr?.on("data", (chunk) => {
    console.error(`[backend] ${chunk.toString().trim()}`);
  });
  backendProcess.on("exit", (code, signal) => {
    console.log(`[backend] exit code=${code} signal=${signal}`);
    backendProcess = null;
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
          reject(new Error(`Backend indisponible après ${HEALTH_TIMEOUT_MS}ms (${HEALTH_URL})`));
          return;
        }
        setTimeout(tick, HEALTH_INTERVAL_MS);
      }
    };
    tick();
  });
}

function resolveFrontendUrl() {
  if (process.env.FOURGIX_FRONTEND_URL) {
    return process.env.FOURGIX_FRONTEND_URL;
  }
  const distIndex = path.join(repoRoot(), "apps", "frontend", "dist", "index.html");
  if (fs.existsSync(distIndex)) {
    return `file://${distIndex.replace(/\\/g, "/")}`;
  }
  if (process.env.FOURGIX_DEV === "1") {
    return "http://127.0.0.1:5173";
  }
  const fallback = path.join(__dirname, "fallback.html");
  if (fs.existsSync(fallback)) {
    return `file://${fallback.replace(/\\/g, "/")}`;
  }
  return `http://${BACKEND_HOST}:${BACKEND_PORT}/api/health`;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const url = resolveFrontendUrl();
  mainWindow.loadURL(url);
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
  if (!backendProcess) {
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
}

async function bootstrap() {
  spawnBackend();
  await waitForHealth();
  createWindow();
}

app.whenReady().then(bootstrap).catch((err) => {
  console.error(err);
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
  if (BrowserWindow.getAllWindows().length === 0 && backendProcess) {
    createWindow();
  }
});

ipcMain.handle("dialog:openFile", async (_event, options = {}) => {
  const { dialog } = require("electron");
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
