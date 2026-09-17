import type { Edge, Node } from "@xyflow/react";
import { type Dispatch, type SetStateAction, useCallback, useState } from "react";

import type {
	FlowNodeData,
	NodeSnapshot,
	StepArchitectPreviousStep,
	StepArchitectResult,
} from "../lib/api";
import { stepArchitectAgent } from "../lib/api";
import {
	applyArchitectSequentialLayout,
	ghostNodeFromArchitectPayload,
	graphForAgentRequest,
	resolveArchitectLayoutAnchorId,
} from "../lib/composerCanvas";

export type ComposerAgentMode = "step" | "targeted";

export function useStepArchitect(
	discardProposals: () => void,
	setProposedNodes: Dispatch<SetStateAction<Node<FlowNodeData>[]>>,
	setProposedEdges: Dispatch<SetStateAction<Edge[]>>,
) {
	const [agentMode, setAgentMode] = useState<ComposerAgentMode>("targeted");
	const [globalPlan, setGlobalPlan] = useState<string[]>([]);
	const [globalObjective, setGlobalObjective] = useState("");
	const [currentStepIndex, setCurrentStepIndex] = useState(0);
	const [totalSteps, setTotalSteps] = useState(0);
	const [isStepComplete, setIsStepComplete] = useState(false);
	const [previousSteps, setPreviousSteps] = useState<StepArchitectPreviousStep[]>([]);
	const [stepSummary, setStepSummary] = useState<string | null>(null);
	const [nextStepHint, setNextStepHint] = useState<string | null>(null);
	const [sourceNodeId, setSourceNodeId] = useState<string | null>(null);
	const [stepLoading, setStepLoading] = useState(false);
	const [stepError, setStepError] = useState<string | null>(null);

	const applyStepResult = useCallback(
		(
			result: StepArchitectResult,
			context?: {
				nodes: Node<FlowNodeData>[];
				edges: Edge[];
				sourceId: string;
				layoutAnchorId: string;
				previousSteps: StepArchitectPreviousStep[];
				stepIndex: number;
			},
		) => {
			setGlobalPlan(result.global_plan || []);
			setTotalSteps(result.total_steps ?? result.global_plan?.length ?? 0);
			setCurrentStepIndex(result.current_step_index ?? 0);
			setIsStepComplete(Boolean(result.is_complete));
			setStepSummary(result.step_summary ?? null);
			setNextStepHint(result.next_step_hint ?? null);
			discardProposals();
			if (result.proposed_node && typeof result.proposed_node === "object") {
				const rawNode = ghostNodeFromArchitectPayload(
					result.proposed_node as Record<string, unknown>,
				);
				if (context) {
					const laid = applyArchitectSequentialLayout(
						context.nodes,
						context.edges,
						context.layoutAnchorId,
						rawNode,
						[],
						{
							dataParentId: context.sourceId,
						},
					);
					setProposedNodes([laid.node]);
					setProposedEdges(laid.edge ? [laid.edge] : []);
					return;
				}
				setProposedNodes([rawNode]);
			}
		},
		[discardProposals, setProposedEdges, setProposedNodes],
	);

	const fetchStep = useCallback(
		async (
			objective: string,
			stepIndex: number,
			prevSteps: StepArchitectPreviousStep[],
			sourceId: string,
			nodes: Node<FlowNodeData>[],
			edges: Edge[],
			snapshots: Record<string, NodeSnapshot>,
		) => {
			setStepLoading(true);
			setStepError(null);
			try {
				const result = await stepArchitectAgent({
					global_objective: objective,
					current_step_index: stepIndex,
					previous_steps: prevSteps,
					current_graph: graphForAgentRequest(nodes, edges, snapshots),
					source_node_id: sourceId,
					layout_anchor_node_id: resolveArchitectLayoutAnchorId(
						nodes,
						prevSteps[prevSteps.length - 1]?.node_id ?? sourceId,
					),
				});
				const layoutAnchorId = resolveArchitectLayoutAnchorId(
					nodes,
					prevSteps[prevSteps.length - 1]?.node_id ?? sourceId,
				);
				applyStepResult(result, {
					nodes,
					edges,
					sourceId,
					layoutAnchorId,
					previousSteps: prevSteps,
					stepIndex,
				});
				return result;
			} catch (err) {
				setStepError(err instanceof Error ? err.message : "Échec step-architect.");
				throw err;
			} finally {
				setStepLoading(false);
			}
		},
		[applyStepResult],
	);

	const resetStepArchitect = useCallback(() => {
		setGlobalPlan([]);
		setGlobalObjective("");
		setCurrentStepIndex(0);
		setTotalSteps(0);
		setIsStepComplete(false);
		setPreviousSteps([]);
		setStepSummary(null);
		setNextStepHint(null);
		setSourceNodeId(null);
		setStepError(null);
		discardProposals();
	}, [discardProposals]);

	const startStepArchitect = useCallback(
		async (
			objective: string,
			sourceId: string,
			nodes: Node<FlowNodeData>[],
			edges: Edge[],
			snapshots: Record<string, NodeSnapshot>,
		) => {
			const trimmed = objective.trim();
			if (!trimmed || !sourceId) return null;
			setGlobalObjective(trimmed);
			setSourceNodeId(sourceId);
			setPreviousSteps([]);
			setCurrentStepIndex(0);
			return fetchStep(trimmed, 0, [], sourceId, nodes, edges, snapshots);
		},
		[fetchStep],
	);

	const regenerateCurrentStep = useCallback(
		async (
			adjustment: string,
			nodes: Node<FlowNodeData>[],
			edges: Edge[],
			snapshots: Record<string, NodeSnapshot>,
		) => {
			if (!globalObjective || !sourceNodeId) return;
			const trimmed = adjustment.trim();
			const objective = trimmed
				? `${globalObjective}\nPrécision étape ${currentStepIndex + 1}: ${trimmed}`
				: globalObjective;
			discardProposals();
			await fetchStep(
				objective,
				currentStepIndex,
				previousSteps,
				sourceNodeId,
				nodes,
				edges,
				snapshots,
			);
		},
		[
			currentStepIndex,
			discardProposals,
			fetchStep,
			globalObjective,
			previousSteps,
			sourceNodeId,
		],
	);

	return {
		agentMode,
		setAgentMode,
		globalPlan,
		globalObjective,
		setGlobalObjective,
		currentStepIndex,
		totalSteps,
		isStepComplete,
		previousSteps,
		setPreviousSteps,
		stepSummary,
		nextStepHint,
		sourceNodeId,
		stepLoading,
		stepError,
		startStepArchitect,
		fetchStep,
		regenerateCurrentStep,
		resetStepArchitect,
		setCurrentStepIndex,
	};
}
