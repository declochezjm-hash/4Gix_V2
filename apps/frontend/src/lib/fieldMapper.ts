import type { Edge } from "@xyflow/react";

import type { NodeSnapshot } from "./api";
import { tableRowsFromData } from "./geo";

export type FieldAction = "keep" | "rename" | "remove" | "calculate";

export type FieldRule = {
	id: string;
	source: string;
	action: FieldAction;
	target: string;
};

export type AttributeOperation = {
	op: string;
	from?: string;
	to?: string;
	name?: string;
	expr?: string;
	value?: string;
};

function newId(): string {
	return `fr_${Math.random().toString(36).slice(2, 10)}`;
}

export function parseOperations(raw: unknown): AttributeOperation[] {
	if (raw == null || raw === "") return [];
	if (Array.isArray(raw)) return raw as AttributeOperation[];
	if (typeof raw === "string") {
		try {
			const parsed = JSON.parse(raw) as unknown;
			return Array.isArray(parsed) ? (parsed as AttributeOperation[]) : [];
		} catch {
			return [];
		}
	}
	return [];
}

export function operationsToJson(ops: AttributeOperation[]): string {
	return JSON.stringify(ops, null, 2);
}

export function rulesToOperations(rules: FieldRule[]): AttributeOperation[] {
	const ops: AttributeOperation[] = [];
	for (const rule of rules) {
		const source = rule.source.trim();
		const target = rule.target.trim();
		if (rule.action === "rename" && source && target && target !== source) {
			ops.push({ op: "rename", from: source, to: target });
		} else if (rule.action === "remove" && source) {
			ops.push({ op: "delete", name: source });
		} else if (rule.action === "calculate" && source && target) {
			ops.push({ op: "create", name: source, expr: target });
		}
	}
	return ops;
}

function ruleIdForSource(
	previous: FieldRule[],
	source: string,
	fallback: string,
): string {
	const match = previous.find((rule) => rule.source === source);
	return match?.id || fallback;
}

export function operationsToRules(
	ops: AttributeOperation[],
	knownColumns: string[] = [],
	previous: FieldRule[] = [],
): FieldRule[] {
	const rules: FieldRule[] = [];
	const handled = new Set<string>();

	for (const op of ops) {
		const kind = (op.op || "").toLowerCase();
		if (kind === "rename" && op.from) {
			handled.add(op.from);
			rules.push({
				id: ruleIdForSource(previous, op.from, newId()),
				source: op.from,
				action: "rename",
				target: op.to || "",
			});
		} else if (kind === "delete" && op.name) {
			handled.add(op.name);
			rules.push({
				id: ruleIdForSource(previous, op.name, newId()),
				source: op.name,
				action: "remove",
				target: "",
			});
		} else if (kind === "create" && op.name) {
			rules.push({
				id: ruleIdForSource(previous, op.name, newId()),
				source: op.name,
				action: "calculate",
				target: op.expr || op.value || "",
			});
		}
	}

	for (const col of knownColumns) {
		if (!handled.has(col)) {
			rules.push({
				id: ruleIdForSource(previous, col, newId()),
				source: col,
				action: "keep",
				target: "",
			});
		}
	}

	const custom = previous.filter(
		(rule) => rule.source && !knownColumns.includes(rule.source),
	);
	for (const rule of custom) {
		if (!rules.some((row) => row.id === rule.id)) {
			rules.push(rule);
		}
	}

	return rules;
}

export function autoPopulateRules(
	columns: string[],
	existing: FieldRule[],
): FieldRule[] {
	const custom = existing.filter((rule) => !rule.source);
	const bySource = new Map(
		existing.filter((rule) => rule.source).map((rule) => [rule.source, rule]),
	);
	const rows = columns.map(
		(col) =>
			bySource.get(col) || {
				id: newId(),
				source: col,
				action: "keep" as FieldAction,
				target: "",
			},
	);
	return [...rows, ...custom];
}

export function extractColumnsFromPreview(data: unknown): string[] {
	if (!data) return [];
	const meta =
		data && typeof data === "object"
			? (data as { metadata?: { columns?: string[] } }).metadata?.columns
			: undefined;
	if (Array.isArray(meta) && meta.length) {
		return meta.map((c) => String(c)).filter((c) => c !== "geometry");
	}
	const { columns } = tableRowsFromData(data);
	return columns.filter((c) => c !== "_geom" && c !== "geometry");
}

export function resolveUpstreamInputPreview(
	nodeId: string,
	edges: Edge[],
	snapshots: Record<string, NodeSnapshot>,
): unknown {
	const current = snapshots[nodeId];
	if (current?.input_snapshot != null) return current.input_snapshot;

	const incoming = edges.filter((edge) => edge.target === nodeId);
	for (const edge of incoming) {
		const parentOut = snapshots[edge.source]?.output_snapshot;
		if (parentOut != null) return parentOut;
		const parentIn = snapshots[edge.source]?.input_snapshot;
		if (parentIn != null) return parentIn;
	}
	return null;
}
