import { useMemo } from "react";
import { getNodeDoc } from "../../config/nodeDocs";
import type { SchemaProperty } from "../../lib/api";
import { useDagStore } from "../../store/dagStore";
import { ComposerAgentInspector } from "../inspectors/ComposerAgentInspector";
import { DirectAgentChatPanel } from "../agent/DirectAgentChatPanel";
import { resolveInspector } from "./inspectorRegistry";
import { AttributeManagerConfig } from "./AttributeManagerConfig";
import { CodeEditorParam } from "./CodeEditorParam";
import { pickExportDestination } from "../../lib/workspaceExport";
import { defaultCodeForLanguage } from "./codeTemplates";
import type { InspectorConfigTab } from "./configTabs";
import { NodeHelpPane } from "./NodeHelpPane";

function isCodeNodeType(nodeType: string): boolean {
	return nodeType === "python_caller" || nodeType === "code_node";
}

const EPSG_OPTIONS = [
	{ value: "EPSG:4326", label: "EPSG:4326 — WGS84" },
	{ value: "EPSG:3857", label: "EPSG:3857 — Web Mercator" },
	{ value: "EPSG:2154", label: "EPSG:2154 — Lambert-93" },
	{ value: "EPSG:4171", label: "EPSG:4171 — RGF93" },
	{ value: "EPSG:3945", label: "EPSG:3945 — CC45" },
	{ value: "EPSG:3946", label: "EPSG:3946 — CC46" },
	{ value: "EPSG:32631", label: "EPSG:32631 — UTM 31N" },
	{ value: "EPSG:32632", label: "EPSG:32632 — UTM 32N" },
];

function parseMapping(value: unknown): Record<string, string> {
	if (!value) return {};
	if (typeof value === "object" && !Array.isArray(value)) {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>).map(([key, val]) => [
				key,
				String(val),
			]),
		);
	}
	if (typeof value === "string") {
		try {
			return parseMapping(JSON.parse(value));
		} catch {
			return {};
		}
	}
	return {};
}

function Field({
	name,
	prop,
	value,
	onChange,
	nodeId,
	allParams,
}: {
	name: string;
	prop: SchemaProperty;
	value: unknown;
	onChange: (name: string, value: unknown) => void;
	nodeId?: string;
	allParams?: Record<string, unknown>;
}) {
	const title = prop.title || name;
	const format = prop.format || "";

	if (format === "output_path" && nodeId) {
		const current = String(value ?? prop.default ?? "");
		return (
			<div className="output-path-field">
				<span>{title}</span>
				{prop.description ? <small>{prop.description}</small> : null}
				<div className="output-path-field__row">
					<input type="text" value={current} readOnly />
					<button
						type="button"
						className="ghost-btn"
						onClick={() => {
							void pickExportDestination(nodeId, {
								driver: String(allParams?.driver ?? ""),
								currentPath: current,
							})
								.then((path) => onChange(name, path))
								.catch(() => undefined);
						}}
					>
						Parcourir…
					</button>
				</div>
			</div>
		);
	}

	if (format === "epsg") {
		const current = String(value ?? prop.default ?? "EPSG:4326");
		const known = EPSG_OPTIONS.some((option) => option.value === current);
		return (
			<label>
				{title}
				{prop.description ? <small>{prop.description}</small> : null}
				<select
					value={known ? current : "__custom__"}
					onChange={(e) =>
						onChange(
							name,
							e.target.value === "__custom__" ? current : e.target.value,
						)
					}
				>
					{EPSG_OPTIONS.map((option) => (
						<option key={option.value} value={option.value}>
							{option.label}
						</option>
					))}
					<option value="__custom__">Autre…</option>
				</select>
				{!known ? (
					<input
						type="text"
						value={current}
						onChange={(e) => onChange(name, e.target.value)}
						placeholder="EPSG:xxxx"
					/>
				) : null}
			</label>
		);
	}

	if (format === "slider") {
		const min = prop.minimum ?? 0;
		const max = prop.maximum ?? 1;
		const step = prop.multipleOf ?? (max - min) / 100;
		const numeric =
			typeof value === "number" ? value : Number(value ?? prop.default ?? min);
		return (
			<label>
				{title} <strong>{numeric}</strong>
				{prop.description ? <small>{prop.description}</small> : null}
				<input
					type="range"
					min={min}
					max={max}
					step={step}
					value={Number.isFinite(numeric) ? numeric : min}
					onChange={(e) => onChange(name, Number(e.target.value))}
				/>
			</label>
		);
	}

	if (format === "sql") {
		return (
			<label>
				{title}
				{prop.description ? <small>{prop.description}</small> : null}
				<textarea
					className="sql-field"
					rows={6}
					placeholder="SELECT * FROM samples.poi"
					value={typeof value === "string" ? value : ""}
					onChange={(e) => onChange(name, e.target.value)}
				/>
			</label>
		);
	}

	if (format === "mapping") {
		const mapping = parseMapping(value);
		const rows = Object.entries(mapping);
		const emit = (next: Record<string, string>) =>
			onChange(name, JSON.stringify(next));
		return (
			<div className="mapping-field">
				<span>{title}</span>
				{prop.description ? <small>{prop.description}</small> : null}
				{rows.map(([from, to], index) => (
					<div className="mapping-row" key={`${from}\0${to}`}>
						<input
							value={from}
							onChange={(e) => {
								const next: Record<string, string> = {};
								rows.forEach(([key, val], i) => {
									next[i === index ? e.target.value : key] = val;
								});
								emit(next);
							}}
							placeholder="colonne source"
						/>
						<span>→</span>
						<input
							value={to}
							onChange={(e) => {
								const next = { ...mapping, [from]: e.target.value };
								emit(next);
							}}
							placeholder="colonne cible"
						/>
						<button
							type="button"
							onClick={() => {
								const next = { ...mapping };
								delete next[from];
								emit(next);
							}}
						>
							×
						</button>
					</div>
				))}
				<button
					type="button"
					className="ghost-btn"
					onClick={() => emit({ ...mapping, "": "" })}
				>
					Ajouter un champ
				</button>
			</div>
		);
	}

	if (prop.enum) {
		const names = prop.enumNames || [];
		return (
			<label>
				{title}
				<select
					value={String(value ?? "")}
					onChange={(e) => onChange(name, e.target.value)}
				>
					<option value="">—</option>
					{prop.enum.map((option, index) => (
						<option key={option} value={option}>
							{names[index] || option}
						</option>
					))}
				</select>
			</label>
		);
	}
	if (prop.type === "boolean") {
		return (
			<label className="checkbox">
				<input
					type="checkbox"
					checked={Boolean(value)}
					onChange={(e) => onChange(name, e.target.checked)}
				/>
				{title}
			</label>
		);
	}
	if (format === "textarea" || prop.type === "object") {
		return (
			<label>
				{title}
				<textarea
					rows={8}
					value={
						typeof value === "string"
							? value
							: JSON.stringify(value ?? "", null, 2)
					}
					onChange={(e) => onChange(name, e.target.value)}
				/>
			</label>
		);
	}
	const inputType =
		prop.type === "integer" || prop.type === "number" ? "number" : "text";
	return (
		<label>
			{title}
			{prop.description ? <small>{prop.description}</small> : null}
			<input
				type={inputType}
				value={value === undefined || value === null ? "" : String(value)}
				onChange={(e) =>
					onChange(
						name,
						inputType === "number"
							? e.target.value === ""
								? ""
								: Number(e.target.value)
							: e.target.value,
					)
				}
			/>
		</label>
	);
}

type ConfigWindowProps = {
	tab: InspectorConfigTab;
	onTabChange: (tab: InspectorConfigTab) => void;
};

export function ConfigWindow({ tab, onTabChange }: ConfigWindowProps) {
	const selectedNodeId = useDagStore((s) => s.selectedNodeId);
	const nodes = useDagStore((s) => s.nodes);
	const catalog = useDagStore((s) => s.catalog);
	const updateNodeParams = useDagStore((s) => s.updateNodeParams);
	const updateNodeData = useDagStore((s) => s.updateNodeData);
	const node = nodes.find((n) => n.id === selectedNodeId);
	const isDirectAgent = node?.data.nodeType === "direct_agent_processor";
	const CustomInspector = node
		? resolveInspector(node.data.nodeType)
		: null;
	const catalogEntry = catalog.find(
		(item) => item.node_type === node?.data.nodeType,
	);
	const nodeDoc = useMemo(
		() => (node ? getNodeDoc(node.data.nodeType, catalogEntry) : null),
		[node, catalogEntry],
	);
	const properties = useMemo(
		() =>
			node?.data.schema?.properties || catalogEntry?.schema.properties || {},
		[node, catalogEntry],
	);

	if (!node) {
		return (
			<section className="inspector-pane n8n-code-pane">
				<header>
					<h3>CONFIGURATION</h3>
				</header>
				<div className="empty">Sélectionnez un nœud.</div>
			</section>
		);
	}

	return (
		<section className="inspector-pane n8n-code-pane">
			<header>
				<h3>CONFIGURATION</h3>
				<p>
					{isCodeNodeType(node.data.nodeType)
						? "Éditeur de code Python / SQL (Monaco) — ce nœud n’est pas un Reader fichier."
						: node.data.schema?.description ||
							catalogEntry?.description ||
							node.data.nodeType}
				</p>
				<div className="pane-tabs pane-tabs--config" role="tablist">
					<button
						type="button"
						role="tab"
						aria-selected={tab === "parameters"}
						className={tab === "parameters" ? "is-active" : ""}
						onClick={() => onTabChange("parameters")}
					>
						Paramètres
					</button>
					{isDirectAgent ? (
						<button
							type="button"
							role="tab"
							aria-selected={tab === "directChat"}
							className={tab === "directChat" ? "is-active" : ""}
							onClick={() => onTabChange("directChat")}
						>
							Tchat Direct
						</button>
					) : null}
					<button
						type="button"
						role="tab"
						aria-selected={tab === "help"}
						className={`pane-tabs__help${tab === "help" ? " is-active" : ""}`}
						onClick={() => onTabChange("help")}
						title="Documentation du nœud"
					>
						Aide
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={tab === "settings"}
						className={tab === "settings" ? "is-active" : ""}
						onClick={() => onTabChange("settings")}
					>
						Réglages
					</button>
				</div>
			</header>
			{tab === "help" && nodeDoc ? <NodeHelpPane doc={nodeDoc} /> : null}
			{tab === "settings" ? (
				<form className="config-form" onSubmit={(e) => e.preventDefault()}>
					<label>
						Node name
						<input
							value={node.data.label}
							onChange={(e) =>
								updateNodeData(node.id, { label: e.target.value })
							}
						/>
					</label>
					<label>
						Notes
						<textarea
							className="sql-field"
							rows={6}
							placeholder="Notes, expressions SQL / Python…"
							value={node.data.notes || ""}
							onChange={(e) =>
								updateNodeData(node.id, { notes: e.target.value })
							}
						/>
					</label>
					<label>
						Type
						<input value={node.data.nodeType} readOnly />
					</label>
				</form>
			) : tab === "directChat" && isDirectAgent ? (
				<DirectAgentChatPanel nodeId={node.id} />
			) : tab === "parameters" && CustomInspector ? (
				<CustomInspector nodeId={node.id} />
			) : tab === "parameters" && node.data.nodeType === "composer_agent" ? (
				<ComposerAgentInspector composerNodeId={node.id} />
			) : tab === "parameters" && isDirectAgent ? (
				<div className="config-form">
					<p className="direct-agent-chat__hint">
						Saisissez une instruction sur le nœud canvas (étincelle) ou utilisez
						l’onglet <strong>Tchat Direct</strong> pour enchaîner plusieurs
						consignes.
					</p>
				</div>
			) : tab === "parameters" && isCodeNodeType(node.data.nodeType) ? (
				<form
					className="config-form config-form--code"
					onSubmit={(e) => e.preventDefault()}
				>
					<CodeEditorParam
						mode={String(node.data.params.mode ?? "all_items")}
						language={String(node.data.params.language ?? "python")}
						code={
							typeof node.data.params.code === "string" &&
							node.data.params.code.trim()
								? node.data.params.code
								: defaultCodeForLanguage(
										String(node.data.params.language ?? "python"),
									)
						}
						onChange={(patch) => updateNodeParams(node.id, patch)}
					/>
				</form>
			) : tab === "parameters" && node.data.nodeType === "attribute_manager" ? (
				<AttributeManagerConfig
					nodeId={node.id}
					operations={node.data.params.operations}
					onOperationsChange={(json) =>
						updateNodeParams(node.id, { operations: json })
					}
				/>
			) : tab === "parameters" ? (
				<form className="config-form" onSubmit={(e) => e.preventDefault()}>
					{Object.keys(properties).length === 0 ? (
						<div className="empty">
							Aucun paramètre exposé par get_schema().
						</div>
					) : (
						Object.entries(properties).map(([name, prop]) => (
							<Field
								key={name}
								name={name}
								prop={prop}
								value={node.data.params[name]}
								nodeId={node.id}
								allParams={node.data.params}
								onChange={(key, value) =>
									updateNodeParams(node.id, { [key]: value })
								}
							/>
						))
					)}
				</form>
			) : null}
		</section>
	);
}
