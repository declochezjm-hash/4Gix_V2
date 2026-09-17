import type { Edge } from "@xyflow/react";
import { Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { NodeSnapshot } from "../../lib/api";
import {
	autoPopulateRules,
	extractColumnsFromPreview,
	type FieldAction,
	type FieldRule,
	operationsToJson,
	operationsToRules,
	parseOperations,
	resolveUpstreamInputPreview,
	rulesToOperations,
} from "../../lib/fieldMapper";

const ACTIONS: { value: FieldAction; label: string }[] = [
	{ value: "keep", label: "Keep" },
	{ value: "rename", label: "Rename" },
	{ value: "remove", label: "Remove" },
	{ value: "calculate", label: "Calculate / Constant" },
];

type FieldMapperUIProps = {
	nodeId: string;
	operationsJson: string;
	onOperationsChange: (json: string) => void;
	edges: Edge[];
	snapshots: Record<string, NodeSnapshot>;
	mode: "visual" | "json";
	onModeChange: (mode: "visual" | "json") => void;
};

export function FieldMapperUI({
	nodeId,
	operationsJson,
	onOperationsChange,
	edges,
	snapshots,
	mode,
	onModeChange,
}: FieldMapperUIProps) {
	const inputPreview = useMemo(
		() => resolveUpstreamInputPreview(nodeId, edges, snapshots),
		[nodeId, edges, snapshots],
	);
	const inputColumns = useMemo(
		() => extractColumnsFromPreview(inputPreview),
		[inputPreview],
	);

	const lastPushedJsonRef = useRef<string | null>(null);
	const dirtyRef = useRef(false);
	const rulesRef = useRef<FieldRule[]>([]);

	const [rules, setRules] = useState<FieldRule[]>(() => {
		const initial = operationsToRules(parseOperations(operationsJson), inputColumns);
		rulesRef.current = initial;
		return initial;
	});
	const [rawJson, setRawJson] = useState(operationsJson);

	const pushRulesToParent = useCallback(
		(next: FieldRule[]) => {
			rulesRef.current = next;
			const json = operationsToJson(rulesToOperations(next));
			lastPushedJsonRef.current = json;
			dirtyRef.current = false;
			setRawJson(json);
			onOperationsChange(json);
		},
		[onOperationsChange],
	);

	useEffect(() => {
		const initial = operationsToRules(parseOperations(operationsJson), inputColumns);
		rulesRef.current = initial;
		setRules(initial);
		setRawJson(operationsJson);
		lastPushedJsonRef.current = operationsJson;
		dirtyRef.current = false;
	}, [operationsJson, inputColumns]);

	useEffect(() => {
		if (dirtyRef.current) {
			return;
		}
		if (operationsJson === lastPushedJsonRef.current) {
			return;
		}
		setRawJson(operationsJson);
		if (mode === "visual") {
			setRules((prev) => {
				const next = operationsToRules(
					parseOperations(operationsJson),
					inputColumns,
					prev,
				);
				rulesRef.current = next;
				return next;
			});
		}
	}, [operationsJson, mode, inputColumns]);

	const updateRule = (id: string, patch: Partial<FieldRule>) => {
		dirtyRef.current = true;
		setRules((prev) => {
			const next = prev.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule));
			rulesRef.current = next;
			return next;
		});
	};

	const commitRules = () => {
		pushRulesToParent(rulesRef.current);
	};

	const removeRule = (id: string) => {
		const next = rulesRef.current.filter((rule) => rule.id !== id);
		setRules(next);
		pushRulesToParent(next);
	};

	const addCustomField = () => {
		const next = [
			...rulesRef.current,
			{
				id: `fr_${Date.now()}`,
				source: "",
				action: "calculate" as FieldAction,
				target: "",
			},
		];
		setRules(next);
		rulesRef.current = next;
	};

	const autoPopulate = () => {
		if (!inputColumns.length) return;
		const next = autoPopulateRules(inputColumns, rulesRef.current);
		setRules(next);
		pushRulesToParent(next);
	};

	const applyRawJson = () => {
		lastPushedJsonRef.current = rawJson;
		onOperationsChange(rawJson);
		if (mode === "visual") {
			setRules((prev) => {
				const next = operationsToRules(parseOperations(rawJson), inputColumns, prev);
				rulesRef.current = next;
				return next;
			});
		}
	};

	return (
		<div className="field-mapper">
			<div className="field-mapper__mode" role="tablist">
				<button
					type="button"
					role="tab"
					className={mode === "visual" ? "is-active" : ""}
					aria-selected={mode === "visual"}
					onClick={() => onModeChange("visual")}
				>
					Visual Mapper
				</button>
				<button
					type="button"
					role="tab"
					className={mode === "json" ? "is-active" : ""}
					aria-selected={mode === "json"}
					onClick={() => onModeChange("json")}
				>
					Raw JSON
				</button>
			</div>

			{mode === "json" ? (
				<div className="field-mapper__json">
					<p className="muted">
						Liste d&apos;opérations <code>rename | delete | create</code> pour le moteur
						Edit Fields.
					</p>
					<textarea
						className="sql-field field-mapper__textarea"
						rows={14}
						value={rawJson}
						onChange={(e) => setRawJson(e.target.value)}
						onBlur={applyRawJson}
						spellCheck={false}
					/>
					<button type="button" className="ghost-btn" onClick={applyRawJson}>
						Appliquer le JSON
					</button>
				</div>
			) : (
				<>
					<div className="field-mapper__toolbar">
						<button
							type="button"
							className="field-mapper__populate"
							onClick={autoPopulate}
							disabled={!inputColumns.length}
							title={
								inputColumns.length
									? `${inputColumns.length} colonne(s) détectée(s)`
									: "Exécutez le nœud parent ou Test step pour charger l'INPUT"
							}
						>
							Auto-populate from Input
						</button>
						<span className="field-mapper__hint">
							{inputColumns.length
								? `${inputColumns.length} colonne(s) disponibles`
								: "Aucun schéma INPUT — lancez Test step sur le Reader en amont"}
						</span>
					</div>

					<div className="field-mapper__table-wrap">
						<table className="field-mapper__table">
							<thead>
								<tr>
									<th>Source</th>
									<th>Action</th>
									<th>Target / Value</th>
									<th aria-label="Actions" />
								</tr>
							</thead>
							<tbody>
								{rules.length === 0 ? (
									<tr>
										<td colSpan={4} className="field-mapper__empty">
											Aucune règle — utilisez Auto-populate ou Add New Field.
										</td>
									</tr>
								) : (
									rules.map((rule) => (
										<tr key={rule.id}>
											<td>
												<input
													className="field-mapper__source"
													type="text"
													readOnly={Boolean(
														rule.source && inputColumns.includes(rule.source),
													)}
													value={rule.source}
													placeholder="(nouveau champ)"
													onChange={(e) =>
														updateRule(rule.id, { source: e.target.value })
													}
													onBlur={commitRules}
												/>
											</td>
											<td>
												<select
													value={rule.action}
													onChange={(e) => {
														updateRule(rule.id, {
															action: e.target.value as FieldAction,
														});
														queueMicrotask(() => commitRules());
													}}
												>
													{ACTIONS.map((action) => (
														<option key={action.value} value={action.value}>
															{action.label}
														</option>
													))}
												</select>
											</td>
											<td>
												<input
													type="text"
													disabled={rule.action === "keep" || rule.action === "remove"}
													placeholder={
														rule.action === "rename"
															? "Nouveau nom de colonne"
															: rule.action === "calculate"
																? "Expression ou 'constante'"
																: "—"
													}
													value={rule.target}
													onChange={(e) =>
														updateRule(rule.id, { target: e.target.value })
													}
													onBlur={commitRules}
												/>
											</td>
											<td className="field-mapper__actions">
												<button
													type="button"
													className="field-mapper__trash"
													aria-label="Supprimer la règle"
													onClick={() => removeRule(rule.id)}
												>
													<Trash2 size={16} strokeWidth={1.75} />
												</button>
											</td>
										</tr>
									))
								)}
							</tbody>
						</table>
					</div>

					<button type="button" className="field-mapper__add" onClick={addCustomField}>
						<Plus size={16} strokeWidth={2} aria-hidden />
						Add New Field
					</button>
				</>
			)}
		</div>
	);
}
