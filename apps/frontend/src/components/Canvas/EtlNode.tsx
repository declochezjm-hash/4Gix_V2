import { Handle, type NodeProps, Position } from "@xyflow/react";
import type { FlowNodeData } from "../../lib/api";
import { nodeChrome } from "../../lib/n8nCatalog";
import { catalogEntryIcon, N8nIconBadge } from "../../lib/n8nIcons";
import { useDagStore } from "../../store/dagStore";
import { NodeActionBar } from "./NodeActionBar";

const HANDLE_LABEL: Record<string, string> = {
	input: "Input",
	input_a: "A",
	input_b: "B",
	output: "Success",
	passed: "Passed",
	failed: "Failed",
	rejected: "Error",
	unique: "Unique",
	duplicate: "Duplicate",
	merged: "Merged",
	unmerged_request: "Unmerged_Request",
	unmerged_supplier: "Unmerged_Supplier",
	inside: "Inside",
	outside: "Outside",
	point: "Point",
	linestring: "Line",
	polygon: "Polygon",
	multipolygon: "MultiPolygon",
	null: "Null",
	else: "Else",
	clipper: "Clipper",
	request: "Request",
	supplier: "Supplier",
	base: "Base",
	candidates: "Candidates",
	related: "Related",
	unrelated: "Unrelated",
	output1: "OUTPUT1",
	output2: "OUTPUT2",
	output3: "OUTPUT3",
};

function labelOf(handleId: string): string {
	return HANDLE_LABEL[handleId] || handleId;
}

function statusLabel(payload: FlowNodeData): string {
	if (payload.disabled) return "Deactivated";
	const status = payload.status || "idle";
	if (status === "RUNNING" || status === "running") return "Running…";
	if (status === "FAILED" || status === "error") return payload.error || "Failed";
	if (status === "COMPLETED" || status === "success") {
		return payload.durationMs != null
			? `Success · ${Math.round(payload.durationMs)} ms`
			: "Success";
	}
	return "Idle";
}

export function EtlNode({ id, data, selected }: NodeProps) {
	const payload = (data || {}) as FlowNodeData;
	const nodeType = payload.nodeType || "unknown_node";
	const category = payload.category || "Transformer";
	const chrome = nodeChrome({
		nodeType,
		category,
	});
	const openNodePanel = useDagStore((s) => s.openNodePanel);
	const canvasLocked = useDagStore((s) => s.canvasLocked);
	const inHandles = payload.inputHandles?.length ? payload.inputHandles : ["input"];
	const outHandles = payload.outputHandles?.length ? payload.outputHandles : ["output"];
	const status = payload.status || "idle";
	const failed = status === "FAILED" || status === "error";
	const running = status === "RUNNING" || status === "running";
	const ghost = Boolean(payload.isGhost);
	const rows = Math.max(inHandles.length, outHandles.length, 1);

	return (
		<>
			<NodeActionBar nodeId={id} visible={Boolean(selected) && !ghost} />
			<div
				className={`n8n-node ${selected ? "is-selected" : ""} ${running ? "is-running" : ""} ${failed ? "is-failed" : ""} ${payload.disabled ? "is-disabled" : ""} ${ghost ? "ghost-node-overlay" : ""} ${payload.nodeType === "composer_agent" ? "n8n-node--composer" : ""} ${payload.nodeType === "auto_architect_agent" ? "n8n-node--auto-architect" : ""}`}
				style={{ minHeight: 88 + Math.max(0, rows - 1) * 18 }}
			>
				{ghost ? (
					<span className="ghost-node-overlay__badge">Proposed by Agent</span>
				) : null}
				{inHandles.map((handleId, index) => (
					<Handle
						key={`in-${handleId}`}
						type="target"
						position={Position.Left}
						id={handleId}
						className="n8n-handle n8n-handle--in"
						isConnectable={!canvasLocked}
						style={{ top: `${((index + 1) / (inHandles.length + 1)) * 100}%` }}
					>
						<span className="n8n-handle__tip n8n-handle__tip--in">
							{labelOf(handleId)}
						</span>
					</Handle>
				))}
				<N8nIconBadge
					icon={catalogEntryIcon({
						node_type: nodeType,
						category,
					})}
					color={chrome.color}
					size={16}
					className="n8n-node__icon"
				/>
				<strong className="n8n-node__label">{payload.label}</strong>
				<span className="n8n-node__sub">{statusLabel(payload)}</span>
				<button
					type="button"
					className="n8n-node__plus"
					title="Ajouter un nœud"
					onClick={(event) => {
						event.stopPropagation();
						openNodePanel({
							nodeId: id,
							handleId: outHandles[0] || "output",
						});
					}}
				>
					+
				</button>
				{outHandles.map((handleId, index) => (
					<div
						key={`out-wrap-${handleId}`}
						className="n8n-handle-out-wrap"
						style={{
							top: `${((index + 1) / (outHandles.length + 1)) * 100}%`,
						}}
					>
						<span className="n8n-handle__label n8n-handle__label--out">
							{labelOf(handleId)}
						</span>
						<Handle
							type="source"
							position={Position.Right}
							id={handleId}
							className="n8n-handle n8n-handle--out"
							isConnectable={!canvasLocked}
						/>
					</div>
				))}
			</div>
		</>
	);
}
