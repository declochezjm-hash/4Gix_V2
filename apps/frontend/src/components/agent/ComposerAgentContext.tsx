import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";
import { useComposerAgent } from "../../hooks/useComposerAgent";
import { useStepArchitect } from "../../hooks/useStepArchitect";
import type { StepArchitectPreviousStep } from "../../lib/api";
import { useDagStore } from "../../store/dagStore";

type ComposerAgentContextValue = ReturnType<typeof useComposerAgent> &
	ReturnType<typeof useStepArchitect> & {
		acceptAll: (anchorNodeId: string) => void;
		rejectAll: () => void;
		hasProposals: boolean;
		validateAndAdvanceStep: () => Promise<boolean>;
		applyEntirePipeline: () => Promise<void>;
		adjustStepPrompt: string;
		setAdjustStepPrompt: (value: string) => void;
	};

const ComposerAgentContext = createContext<ComposerAgentContextValue | null>(null);

export function ComposerAgentProvider({ children }: { children: ReactNode }) {
	const agent = useComposerAgent();
	const step = useStepArchitect(
		agent.discardProposals,
		agent.setProposedNodes,
		agent.setProposedEdges,
	);
	const [adjustStepPrompt, setAdjustStepPrompt] = useState("");

	const applyComposerReplacement = useDagStore((s) => s.applyComposerReplacement);
	const appendStepProposals = useDagStore((s) => s.appendStepProposals);
	const _nodes = useDagStore((s) => s.nodes);
	const _edges = useDagStore((s) => s.edges);
	const _snapshots = useDagStore((s) => s.snapshots);

	const hasProposals = agent.proposedNodes.length > 0 || agent.proposedEdges.length > 0;

	const acceptAll = useCallback(
		(anchorNodeId: string) => {
			if (!agent.proposedNodes.length && !agent.proposedEdges.length) return;
			applyComposerReplacement(anchorNodeId, agent.proposedNodes, agent.proposedEdges);
			agent.discardProposals();
		},
		[agent, applyComposerReplacement],
	);

	const discardStoreProposals = useDagStore((s) => s.discardProposals);

	const rejectAll = useCallback(() => {
		agent.discardProposals();
		discardStoreProposals();
	}, [agent, discardStoreProposals]);

	const validateAndAdvanceStep = useCallback(async (): Promise<boolean> => {
		if (!step.sourceNodeId || !step.globalObjective) return false;
		if (!agent.proposedNodes.length) return false;

		const proposedNode = agent.proposedNodes[0];
		appendStepProposals(
			agent.proposedNodes,
			agent.proposedEdges.length ? agent.proposedEdges : [],
		);

		const entry: StepArchitectPreviousStep = {
			index: step.currentStepIndex,
			node_id: proposedNode.id,
			step_summary: step.stepSummary || `Étape ${step.currentStepIndex + 1}`,
		};
		const nextPrevious = [...step.previousSteps, entry];
		step.setPreviousSteps(nextPrevious);
		agent.discardProposals();
		setAdjustStepPrompt("");

		const nextIndex = step.currentStepIndex + 1;
		const result = await step.fetchStep(
			step.globalObjective,
			nextIndex,
			nextPrevious,
			step.sourceNodeId,
			useDagStore.getState().nodes,
			useDagStore.getState().edges,
			useDagStore.getState().snapshots,
		);
		return Boolean(result?.proposed_node) && !result?.is_complete;
	}, [agent, appendStepProposals, step]);

	const applyEntirePipeline = useCallback(async () => {
		const maxIterations = Math.max(step.totalSteps, 12) + 2;
		for (let i = 0; i < maxIterations; i += 1) {
			const continuePipeline = await validateAndAdvanceStep();
			if (!continuePipeline) break;
		}
	}, [step.totalSteps, validateAndAdvanceStep]);

	const value = useMemo(
		() => ({
			...agent,
			...step,
			acceptAll,
			rejectAll,
			hasProposals,
			validateAndAdvanceStep,
			applyEntirePipeline,
			adjustStepPrompt,
			setAdjustStepPrompt,
		}),
		[
			agent,
			step,
			acceptAll,
			rejectAll,
			hasProposals,
			validateAndAdvanceStep,
			applyEntirePipeline,
			adjustStepPrompt,
		],
	);

	return (
		<ComposerAgentContext.Provider value={value}>
			{children}
		</ComposerAgentContext.Provider>
	);
}

export function useComposerAgentContext(): ComposerAgentContextValue {
	const ctx = useContext(ComposerAgentContext);
	if (!ctx) {
		throw new Error(
			"useComposerAgentContext doit être utilisé dans ComposerAgentProvider",
		);
	}
	return ctx;
}
