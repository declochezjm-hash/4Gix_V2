import { Anvil, Moon, Sun } from "lucide-react";
import { type ChangeEvent, useRef, useState } from "react";
import {
	type ColorTheme,
	getStoredTheme,
	toggleColorTheme,
} from "../../lib/theme";
import { useDagStore } from "../../store/dagStore";

export function TopBar() {
	const saveCurrentWorkflow = useDagStore((s) => s.saveCurrentWorkflow);
	const importLocalWorkflowFile = useDagStore((s) => s.importLocalWorkflowFile);
	const runDag = useDagStore((s) => s.runDag);
	const running = useDagStore((s) => s.running);
	const error = useDagStore((s) => s.error);
	const importNotice = useDagStore((s) => s.importNotice);
	const lastExecution = useDagStore((s) => s.lastExecution);
	const nodes = useDagStore((s) => s.nodes);

	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const [colorTheme, setColorTheme] = useState<ColorTheme>(() =>
		getStoredTheme(),
	);

	const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (file) void importLocalWorkflowFile(file);
		event.target.value = "";
	};

	return (
		<header className="topbar">
			<div className="brand">
				<Anvil
					className="brand__anvil"
					size={22}
					strokeWidth={1.25}
					aria-hidden
				/>
				<span className="logo">4GIx</span>
				<button
					type="button"
					className="theme-toggle"
					title={
						colorTheme === "dark"
							? "Passer en mode clair"
							: "Passer en mode sombre"
					}
					aria-label={
						colorTheme === "dark"
							? "Passer en mode clair"
							: "Passer en mode sombre"
					}
					onClick={() => setColorTheme(toggleColorTheme(colorTheme))}
				>
					{colorTheme === "dark" ? (
						<Sun size={18} strokeWidth={2} aria-hidden />
					) : (
						<Moon size={18} strokeWidth={2} aria-hidden />
					)}
				</button>
			</div>
			<div className="topbar__actions">
				<input
					type="file"
					id="fmw-file-input"
					ref={fileInputRef}
					className="import-file-input"
					accept=".fmw,.fmwt,.json,.4gix.json,.zip,.xlsx,.xls,.csv,.gpkg,.geojson,.kml,.kmz,.dxf,.shp,.tif,.tiff"
					onChange={handleFileChange}
				/>

				<button
					type="button"
					id="btn-import-fmw-json"
					className="import-file-btn"
					onClick={() => fileInputRef.current?.click()}
					title="Importe .fmw, JSON workflow ou .zip Shapefile — exécution 4GIx"
				>
					<svg
						className="import-file-btn__icon"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						aria-hidden
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth="2"
							d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
						/>
					</svg>
					Importer (.fmw / .json / .zip)
				</button>

				<button
					type="button"
					className="ghost-btn"
					onClick={() => void saveCurrentWorkflow()}
					disabled={nodes.length === 0}
				>
					Enregistrer
				</button>
				{lastExecution ? (
					<span
						className={`status status--${String(lastExecution.status).toLowerCase()}`}
					>
						{lastExecution.status} · {Math.round(lastExecution.duration_ms)} ms
						· {lastExecution.node_count} nœuds
					</span>
				) : (
					<span className="status">{nodes.length} nœud(s)</span>
				)}
				{error ? <span className="status status--error">{error}</span> : null}
				{importNotice ? (
					<span className="status status--completed">{importNotice}</span>
				) : null}
				<button
					type="button"
					className="run-btn"
					onClick={() => void runDag()}
					disabled={running || nodes.length === 0}
					title="Exécute le graphe avec le moteur ETL 4GIx (PostGIS, transformers SIG)"
				>
					{running ? "Exécution…" : "Execute workflow (4GIx)"}
				</button>
			</div>
		</header>
	);
}
