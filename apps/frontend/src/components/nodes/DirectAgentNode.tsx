import { Handle, type NodeProps, Position } from "@xyflow/react";
import { Loader2, Sparkles } from "lucide-react";
import { type KeyboardEvent, useCallback, useEffect, useState } from "react";

import type { FlowNodeData } from "../../lib/api";
import { nodeChrome } from "../../lib/n8nCatalog";
import { catalogEntryIcon, N8nIconBadge } from "../../lib/n8nIcons";
import { useDagStore } from "../../store/dagStore";
import { NodeActionBar } from "../Canvas/NodeActionBar";

export function DirectAgentNode({ id, data, selected }: NodeProps) {
	const payload = data as FlowNodeData;
	const chrome = nodeChrome({
		nodeType: payload.nodeType,
		category: payload.category,
	});
	const canvasLocked = useDagStore((s) => s.canvasLocked);
	const runDirectProcess = useDagStore((s) => s.runDirectProcess);
	const updateNodeParams = useDagStore((s) => s.updateNodeParams);

	const storedPrompt =
		typeof payload.params?.prompt === "string" ? payload.params.prompt : "";
	const [prompt, setPrompt] = useState(storedPrompt);

	useEffect(() => {
		setPrompt(storedPrompt);
	}, [storedPrompt]);

	const status = payload.status || "idle";
	const running = status === "RUNNING" || status === "running";
	const failed = status === "FAILED" || status === "error";

	const execute = useCallback(() => {
		const text = prompt.trim();
		if (!text || running) return;
		updateNodeParams(id, { prompt: text });
		void runDirectProcess(id, text);
	}, [id, prompt, running, runDirectProcess, updateNodeParams]);

	const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			execute();
		}
	};

	return (
		<>
			<NodeActionBar nodeId={id} visible={Boolean(selected)} />
			<div
				className={`n8n-node n8n-node--direct-agent ${selected ? "is-selected" : ""} ${running ? "is-running" : ""} ${failed ? "is-failed" : ""} ${payload.disabled ? "is-disabled" : ""}`}
				style={{ minHeight: 132, minWidth: 220 }}
			>
				<span className="n8n-node--direct-agent__badge">Cursor Agent 2.5</span>
				<Handle
					type="target"
					position={Position.Left}
					id="input"
					className="n8n-handle n8n-handle--in"
					isConnectable={!canvasLocked}
					style={{ top: "50%" }}
				>
					<span className="n8n-handle__tip n8n-handle__tip--in">Input</span>
				</Handle>
				<N8nIconBadge
					icon={catalogEntryIcon({
						node_type: payload.nodeType,
						category: payload.category,
					})}
					color={chrome.color}
					size={16}
					className="n8n-node__icon"
				/>
				<strong className="n8n-node__label">{payload.label}</strong>
				<div className="n8n-node--direct-agent__prompt">
					<input
						type="text"
						className="n8n-node--direct-agent__input"
						placeholder="Instruction spatiale…"
						value={prompt}
						disabled={running || payload.disabled}
						onChange={(e) => setPrompt(e.target.value)}
						onKeyDown={onKeyDown}
						onClick={(e) => e.stopPropagation()}
					/>
					<button
						type="button"
						className="n8n-node--direct-agent__run"
						title="Exécuter"
						disabled={running || !prompt.trim() || payload.disabled}
						onClick={(e) => {
							e.stopPropagation();
							execute();
						}}
					>
						{running ? (
							<Loader2 size={16} className="n8n-node--direct-agent__spin" />
						) : (
							<Sparkles size={16} />
						)}
					</button>
				</div>
				<span className="n8n-node__sub">
					{running
						? "Traitement…"
						: failed
							? payload.error || "Échec"
							: payload.durationMs != null
								? `OK · ${Math.round(payload.durationMs)} ms`
								: "Prêt"}
				</span>
				<div className="n8n-handle-out-wrap" style={{ top: "50%" }}>
					<span className="n8n-handle__label n8n-handle__label--out">
						Output
					</span>
					<Handle
						type="source"
						position={Position.Right}
						id="output"
						className="n8n-handle n8n-handle--out"
						isConnectable={!canvasLocked}
					/>
				</div>
			</div>
		</>
	);
}
