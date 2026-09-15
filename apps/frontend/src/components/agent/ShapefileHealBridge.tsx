import { useEffect, useRef } from "react";

import { executionHealAgent } from "../../lib/api";
import { graphForStepArchitectRequest } from "../../lib/composerCanvas";
import {
	EXCEL_MISSING_OPENPYXL_CHAT_MESSAGE,
	isOpenpyxlMissingError,
} from "../../lib/excelGuidance";
import {
	isShapefileIncompleteError,
	SHAPEFILE_INCOMPLETE_CHAT_MESSAGE,
} from "../../lib/shapefileGuidance";
import { useDagStore } from "../../store/dagStore";
import { useComposerAgentContext } from "./ComposerAgentContext";

/**
 * Messages proactifs Composer après échec Shapefile Reader ou lecture Excel (openpyxl).
 */
export function ShapefileHealBridge() {
	const lastExecution = useDagStore((s) => s.lastExecution);
	const nodes = useDagStore((s) => s.nodes);
	const edges = useDagStore((s) => s.edges);
	const snapshots = useDagStore((s) => s.snapshots);
	const shapefileProactivePrompt = useDagStore(
		(s) => s.shapefileProactivePrompt,
	);
	const clearShapefileProactivePrompt = useDagStore(
		(s) => s.clearShapefileProactivePrompt,
	);
	const setComposerDrawerOpen = useDagStore((s) => s.setComposerDrawerOpen);
	const { pushProactiveAssistant } = useComposerAgentContext();
	const lastHealExecutionIdRef = useRef<string | null>(null);
	const lastPromptRef = useRef<string | null>(null);

	useEffect(() => {
		const prompt = shapefileProactivePrompt?.trim();
		if (!prompt || prompt === lastPromptRef.current) return;
		lastPromptRef.current = prompt;
		pushProactiveAssistant(prompt);
		setComposerDrawerOpen(true);
		clearShapefileProactivePrompt();
	}, [
		shapefileProactivePrompt,
		pushProactiveAssistant,
		setComposerDrawerOpen,
		clearShapefileProactivePrompt,
	]);

	useEffect(() => {
		if (
			!lastExecution ||
			String(lastExecution.status).toUpperCase() !== "FAILED"
		) {
			return;
		}
		if (lastHealExecutionIdRef.current === lastExecution.execution_id) return;

		const failedSnap = (lastExecution.snapshots || []).find(
			(snap) =>
				String(snap.status).toUpperCase() === "FAILED" ||
				snap.status === "error",
		);
		const errText =
			failedSnap?.error ||
			lastExecution.error ||
			"Échec d'exécution sans détail.";
		const failedNodeId = failedSnap?.node_id;
		if (!failedNodeId) return;

		const failedNode = nodes.find((n) => n.id === failedNodeId);
		const nodeType = failedNode?.data.nodeType;
		const isShapefileHeal =
			nodeType === "shapefile_reader" && isShapefileIncompleteError(errText);
		const isExcelHeal =
			nodeType === "excel_reader" || isOpenpyxlMissingError(errText);
		if (!isShapefileHeal && !isExcelHeal) return;

		lastHealExecutionIdRef.current = lastExecution.execution_id;

		void executionHealAgent({
			error_message: errText,
			failed_node_id: failedNodeId,
			global_objective: "",
			source_node_id: failedNodeId,
			current_graph: graphForStepArchitectRequest(
				nodes,
				edges,
				snapshots,
				[],
				[],
			),
		})
			.then((heal) => {
				const content =
					(typeof heal.chat_message === "string" && heal.chat_message) ||
					(isExcelHeal
						? EXCEL_MISSING_OPENPYXL_CHAT_MESSAGE
						: isShapefileHeal
							? SHAPEFILE_INCOMPLETE_CHAT_MESSAGE
							: "");
				if (!content) return;
				pushProactiveAssistant(content);
				if (
					heal.suggest_shapefile_zip_upload ||
					heal.suggest_excel_openpyxl_install ||
					isExcelHeal
				) {
					setComposerDrawerOpen(true);
				}
			})
			.catch(() => {
				if (isExcelHeal) {
					pushProactiveAssistant(EXCEL_MISSING_OPENPYXL_CHAT_MESSAGE);
				} else {
					pushProactiveAssistant(SHAPEFILE_INCOMPLETE_CHAT_MESSAGE);
				}
				setComposerDrawerOpen(true);
			});
	}, [
		lastExecution,
		nodes,
		edges,
		snapshots,
		pushProactiveAssistant,
		setComposerDrawerOpen,
	]);

	return null;
}
