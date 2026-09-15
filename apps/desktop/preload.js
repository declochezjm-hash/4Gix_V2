const { contextBridge, ipcRenderer } = require("electron");

const DEFAULT_FILTERS = {
  shp: [{ name: "Shapefile", extensions: ["shp"] }],
  gpkg: [{ name: "GeoPackage", extensions: ["gpkg"] }],
  csv: [{ name: "CSV", extensions: ["csv"] }],
  all: [
    { name: "Données SIG", extensions: ["shp", "gpkg", "csv", "geojson", "json"] },
    { name: "Tous les fichiers", extensions: ["*"] },
  ],
};

contextBridge.exposeInMainWorld("fourGixDesktop", {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },

  /**
   * Ouvre une boîte de dialogue native de sélection de fichier.
   * @param {object} [options]
   * @param {'shp'|'gpkg'|'csv'|'all'} [options.kind]
   * @param {import('electron').FileFilter[]} [options.filters]
   * @param {string} [options.title]
   * @returns {Promise<{ canceled: boolean, filePaths: string[] }>}
   */
  showOpenDialog(options = {}) {
    const kind = options.kind || "all";
    const filters = options.filters || DEFAULT_FILTERS[kind] || DEFAULT_FILTERS.all;
    return ipcRenderer.invoke("dialog:openFile", {
      filters,
      title: options.title,
      properties: options.properties,
    });
  },

  pickShapefile() {
    return this.showOpenDialog({ kind: "shp", title: "Choisir un Shapefile (.shp)" });
  },

  pickGeoPackage() {
    return this.showOpenDialog({ kind: "gpkg", title: "Choisir un GeoPackage (.gpkg)" });
  },

  pickCsv() {
    return this.showOpenDialog({ kind: "csv", title: "Choisir un fichier CSV" });
  },
});
