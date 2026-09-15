import type { Edge, Node } from "@xyflow/react";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
	FlowNodeData,
	StepArchitectPreviousStep,
	StepArchitectResult,
} from "../../lib/api";
import {
	type ExecutionHealResult,
	executionHealAgent,
	stepArchitectAgent,
} from "../../lib/api";
import {
	appendMaterializedProposals,
	applyArchitectSequentialLayout,
	ghostEdgeFromArchitectPayload,
	ghostNodeFromArchitectPayload,
	collectArchitectBranchNodeIds,
	graphForStepArchitectRequest,
	materializeComposerEdge,
	resolveArchitectLayoutAnchorId,
	resolveUpstreamDataSourceId,
} from "../../lib/composerCanvas";
import { useDagStore } from "../../store/dagStore";
import { useComposerAgentContext } from "../agent/ComposerAgentContext";

export type ArchitectChatMessage = {
	role: "user" | "assistant" | "system";
	content: string;
	at: string;
};

function parseArchitectChat(raw: unknown): ArchitectChatMessage[] {
	if (!Array.isArray(raw)) return [];
	return raw.filter(
		(item): item is ArchitectChatMessage =>
			typeof item === "object" &&
			item !== null &&
			typeof (item as ArchitectChatMessage).content === "string",
	);
}

/** Reader en amont (arêtes) pour l'API step-architect (inspect schéma). */
function resolveSourceNodeId(
	nodes: Node<FlowNodeData>[],
	edges: Edge[],
	targetNodeId: string,
	explicitSourceId: string | null,
): string | null {
	if (explicitSourceId?.trim()) return explicitSourceId.trim();
	const upstream = resolveUpstreamDataSourceId(nodes, edges, targetNodeId);
	if (upstream) return upstream;
	const parentEdge = edges.find((edge) => edge.target === targetNodeId);
	return parentEdge?.source ?? null;
}

function errorMessage(err: unknown): string {
	if (err instanceof Error) return err.message;
	return "Échec de l'appel au serveur.";
}

export function AutoArchitectInspector({ nodeId }: { nodeId: string }) {
	const nodes = useDagStore((s) => s.nodes);
	const edges = useDagStore((s) => s.edges);
	const updateNodeParams = useDagStore((s) => s.updateNodeParams);
	const setStepProposals = useDagStore((s) => s.setStepProposals);
	const discardStoreProposals = useDagStore((s) => s.discardProposals);
	const setArchitectGenerating = useDagStore((s) => s.setArchitectGenerating);
	const setArchitectSession = useDagStore((s) => s.setArchitectSession);
	const appendStepProposals = useDagStore((s) => s.appendStepProposals);
	const stepProposalNodes = useDagStore((s) => s.stepProposalNodes);
	const architectGlobalPlan = useDagStore((s) => s.architectGlobalPlan);
	const architectStepIndex = useDagStore((s) => s.architectStepIndex);
	const architectTotalSteps = useDagStore((s) => s.architectTotalSteps);
	const architectPreviousSteps = useDagStore((s) => s.architectPreviousSteps);
	const architectSourceNodeId = useDagStore((s) => s.architectSourceNodeId);
	const architectGlobalObjective = useDagStore(
		(s) => s.architectGlobalObjective,
	);
	const lastExecution = useDagStore((s) => s.lastExecution);
	const edgePathStyle = useDagStore((s) => s.edgePathStyle);

	const { setProposedNodes, setProposedEdges, rejectAll, setAgentMode } =
		useComposerAgentContext();

	const node = nodes.find((item) => item.id === nodeId);
	const storedObjective =
		typeof node?.data.params?.global_objective === "string"
			? node.data.params.global_objective
			: "";
	const chatHistory = parseArchitectChat(
		node?.data.params?.architect_chat_history,
	);

	const [autoAdvance, setAutoAdvance] = useState<boolean>(
		node?.data.params?.auto_advance !== false,
	);
	const [promptText, setPromptText] = useState(
		storedObjective || architectGlobalObjective,
	);
	const [thinkingOpen, setThinkingOpen] = useState(true);
	const [thinkingLog, setThinkingLog] = useState<string[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [isGenerating, setIsGenerating] = useState(false);
	const [inspectorError, setInspectorError] = useState<string | null>(null);
	const [proactiveSuggestions, setProactiveSuggestions] = useState<string[]>(
		[],
	);
	const [pendingHeal, setPendingHeal] = useState<ExecutionHealResult | null>(
		null,
	);
	const lastHealExecutionIdRef = useRef<string | null>(null);
	const inFlightRef = useRef(false);
	const autoAdvanceRef = useRef(autoAdvance);
	autoAdvanceRef.current = autoAdvance;

	useEffect(() => {
		setPromptText(storedObjective || architectGlobalObjective);
	}, [storedObjective, architectGlobalObjective]);

	useEffect(() => {
		if (node?.data.params?.auto_advance === undefined) return;
		setAutoAdvance(node.data.params.auto_advance !== false);
	}, [node?.data.params?.auto_advance]);

	useEffect(() => {
		setAgentMode("step");
	}, [setAgentMode]);

	const dataSourceId = useMemo(
		() => resolveSourceNodeId(nodes, edges, nodeId, architectSourceNodeId),
		[nodes, edges, nodeId, architectSourceNodeId],
	);

	const hasProposals = stepProposalNodes.length > 0;
	const generating = isGenerating || isLoading;
	const globalPlan = architectGlobalPlan;
	const totalSteps = architectTotalSteps || globalPlan.length;
	const currentStepIndex = architectStepIndex;

	const pushThinking = useCallback((line: string) => {
		setThinkingLog((prev) => [...prev, line]);
	}, []);

	const beginLoading = useCallback(() => {
		setIsLoading(true);
		setIsGenerating(true);
		setInspectorError(null);
		setArchitectGenerating(true);
	}, [setArchitectGenerating]);

	const endLoading = useCallback(() => {
		setIsLoading(false);
		setIsGenerating(false);
		setArchitectGenerating(false);
	}, [setArchitectGenerating]);

	const syncProposals = useCallback(
		(proposedNodes: Node<FlowNodeData>[], proposedEdges: Edge[]) => {
			setStepProposals(proposedNodes, proposedEdges);
			setProposedNodes([]);
			setProposedEdges([]);
		},
		[setProposedEdges, setProposedNodes, setStepProposals],
	);

	const appendChat = useCallback(
		(...messages: ArchitectChatMessage[]) => {
			const current = useDagStore
				.getState()
				.nodes.find((item) => item.id === nodeId);
			const hist = parseArchitectChat(
				current?.data.params?.architect_chat_history,
			);
			updateNodeParams(nodeId, {
				architect_chat_history: [...hist, ...messages],
			});
		},
		[nodeId, updateNodeParams],
	);

	const applyHealFromResult = useCallback(
		(heal: ExecutionHealResult) => {
			if (!heal.proposed_node || !heal.proposed_edge) return;
			const healNode = ghostNodeFromArchitectPayload(heal.proposed_node);
			const healEdge = ghostEdgeFromArchitectPayload(heal.proposed_edge);
			const failedId = heal.failed_node_id;
			const parentSource = String(
				(heal.proposed_edge as { source?: string }).source ?? "",
			);
			const state = useDagStore.getState();
			const filteredEdges = state.edges.filter(
				(edge) =>
					!(
						failedId &&
						edge.target === failedId &&
						edge.source === parentSource
					),
			);
			const proposalEdges = [healEdge];
			if (failedId) {
				proposalEdges.push(
					materializeComposerEdge(
						{
							id: `heal-follow-${healNode.id}-${failedId}`,
							source: healNode.id,
							target: failedId,
							sourceHandle: "output",
							targetHandle: "input",
						},
						edgePathStyle,
					),
				);
			}
			const merged = appendMaterializedProposals(
				state.nodes,
				filteredEdges,
				edgePathStyle,
				[healNode],
				proposalEdges,
			);
			useDagStore.setState({ nodes: merged.nodes, edges: merged.edges });
			appendChat({
				role: "assistant",
				content:
					"Correctif appliqué sur le canvas — relancez l'exécution du workflow.",
				at: new Date().toISOString(),
			});
			setPendingHeal(null);
			pushThinking("Correctif géométrie matérialisé sur le canvas.");
		},
		[appendChat, edgePathStyle, pushThinking],
	);

	const applyHealCorrective = useCallback(() => {
		if (pendingHeal) applyHealFromResult(pendingHeal);
	}, [applyHealFromResult, pendingHeal]);

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
		if (!failedNodeId || !dataSourceId) return;

		lastHealExecutionIdRef.current = lastExecution.execution_id;
		const objective = architectGlobalObjective || promptText.trim();
		const state = useDagStore.getState();
		void executionHealAgent({
			error_message: errText,
			failed_node_id: failedNodeId,
			global_objective: objective,
			source_node_id: dataSourceId,
			current_graph: graphForStepArchitectRequest(
				state.nodes,
				state.edges,
				state.snapshots,
				[],
				[],
			),
		})
			.then((heal) => {
				const chatContent =
					(typeof heal.chat_message === "string" && heal.chat_message) ||
					(heal.ok
						? `${heal.explanation || "Erreur détectée."}\n\nCorrectif proposé : Vertex Creator (XY) ou bascule CSV.`
						: "");
				if (chatContent) {
					appendChat({
						role: "assistant",
						content: chatContent,
						at: new Date().toISOString(),
					});
					pushThinking(heal.explanation || chatContent);
				}
				if (!heal.ok) return;
				setPendingHeal(heal);
				const autoHeal = node?.data.params?.auto_heal !== false;
				if (autoHeal && heal.proposed_node && heal.proposed_edge) {
					applyHealFromResult(heal);
				}
			})
			.catch(() => {
				/* ignore — pas de correctif applicable */
			});
	}, [
		lastExecution,
		dataSourceId,
		architectGlobalObjective,
		promptText,
		node?.data.params?.auto_heal,
		appendChat,
		pushThinking,
		applyHealFromResult,
	]);

	const reportError = useCallback(
		(message: string) => {
			setInspectorError(message);
			pushThinking(message);
			useDagStore.setState({ error: message });
		},
		[pushThinking],
	);

	const runArchitectPipeline = useCallback(
		async (
			objective: string,
			dataSourceId: string,
			options: {
				/** Enchaîner les appels jusqu'à la fin du plan (prévisualisation A→B→C). */
				continueUntilComplete: boolean;
				materialize: boolean;
				initialPreviousSteps?: StepArchitectPreviousStep[];
				initialStepIndex?: number;
				layoutStartNodeId?: string;
			},
		) => {
			const canvasNodes = useDagStore.getState().nodes;
			let lastNodeId = resolveArchitectLayoutAnchorId(
				canvasNodes,
				options.layoutStartNodeId ?? nodeId,
			);
			const ghostNodesAcc: Node<FlowNodeData>[] = [];
			const ghostEdgesAcc: Edge[] = [];
			let previousSteps = options.initialPreviousSteps ?? [];
			let stepIndex = options.initialStepIndex ?? 0;
			let total = 8;
			let planLength = 0;
			let firstResult: StepArchitectResult | null = null;

			while (stepIndex < total) {
				const state = useDagStore.getState();
				const result = await stepArchitectAgent({
					global_objective: objective,
					current_step_index: stepIndex,
					previous_steps: previousSteps,
					current_graph: graphForStepArchitectRequest(
						state.nodes,
						state.edges,
						state.snapshots,
						ghostNodesAcc,
						ghostEdgesAcc,
					),
					source_node_id: dataSourceId,
					layout_anchor_node_id: lastNodeId,
				});

				if (!firstResult) firstResult = result;
				if (result.total_steps != null && result.total_steps > 0) {
					total = result.total_steps;
				} else if (result.global_plan?.length) {
					total = result.global_plan.length;
				}
				if (result.global_plan?.length) {
					planLength = result.global_plan.length;
					total = Math.max(total, planLength);
				}
				setArchitectSession({
					globalPlan: result.global_plan || [],
					stepIndex: result.current_step_index ?? stepIndex,
					totalSteps: result.total_steps ?? result.global_plan?.length ?? 0,
					previousSteps,
					sourceNodeId: dataSourceId,
					globalObjective: objective,
				});
				if (result.step_summary) {
					pushThinking(`Étape ${stepIndex + 1} : ${result.step_summary}`);
				}

				if (!result.proposed_node) break;

				const rawNode = ghostNodeFromArchitectPayload(
					result.proposed_node as Record<string, unknown>,
				);
				const dataParentId = String(
					(result.proposed_edge as { source?: string } | undefined)?.source ||
						dataSourceId,
				);
				const attachToSource = Boolean(result.attach_to_source);
				const chainLayoutAnchor =
					typeof result.layout_anchor_node_id === "string" &&
					result.layout_anchor_node_id.trim()
						? result.layout_anchor_node_id.trim()
						: dataParentId;
				const layoutAnchorId = attachToSource
					? resolveArchitectLayoutAnchorId(
							[...state.nodes, ...ghostNodesAcc],
							nodeId,
						)
					: chainLayoutAnchor;
				const laid = applyArchitectSequentialLayout(
					[...state.nodes, ...ghostNodesAcc],
					[...state.edges, ...ghostEdgesAcc],
					layoutAnchorId,
					rawNode,
					ghostEdgesAcc,
					{
						dataParentId,
						branchIndex: attachToSource ? (result.branch_index ?? 0) : 0,
					},
				);
				ghostNodesAcc.push(laid.node);
				const proposedEdgeRaw = result.proposed_edge;
				if (
					proposedEdgeRaw &&
					typeof proposedEdgeRaw === "object" &&
					(proposedEdgeRaw as { source?: string }).source &&
					(proposedEdgeRaw as { target?: string }).target
				) {
					const apiEdge = ghostEdgeFromArchitectPayload(
						proposedEdgeRaw as Record<string, unknown>,
					);
					apiEdge.target = laid.node.id;
					if (
						!ghostEdgesAcc.some(
							(edge) =>
								edge.source === apiEdge.source &&
								edge.target === apiEdge.target,
						)
					) {
						ghostEdgesAcc.push(apiEdge);
					}
				} else if (laid.edge) {
					ghostEdgesAcc.push(laid.edge);
				}
				if (!attachToSource) {
					lastNodeId = laid.node.id;
				}

				previousSteps = [
					...previousSteps,
					{
						index: stepIndex,
						node_id: laid.node.id,
						step_summary:
							result.step_summary ||
							result.global_plan?.[stepIndex] ||
							`Étape ${stepIndex + 1}`,
						branch_id: result.branch_id,
					},
				];
				stepIndex += 1;
				total = result.total_steps ?? total;

				syncProposals(ghostNodesAcc, ghostEdgesAcc);
				setArchitectSession({
					previousSteps,
					stepIndex,
					totalSteps: total,
				});

				const expectedSteps = planLength || total;
				if (stepIndex >= expectedSteps) break;
				if (!options.continueUntilComplete) break;
			}

			if (options.materialize && ghostNodesAcc.length) {
				appendStepProposals(ghostNodesAcc, ghostEdgesAcc);
				discardStoreProposals();
				rejectAll();
			}

			return { firstResult, ghostNodesAcc, ghostEdgesAcc, stepIndex, total };
		},
		[
			appendStepProposals,
			discardStoreProposals,
			nodeId,
			pushThinking,
			rejectAll,
			setArchitectSession,
			syncProposals,
		],
	);

	const handleApplyAll = useCallback(
		async (options?: { parentLoading?: boolean }) => {
			const ownsLoading = !options?.parentLoading;
			if (ownsLoading) {
				if (inFlightRef.current) return;
				inFlightRef.current = true;
				beginLoading();
			}

			const objective = architectGlobalObjective || promptText.trim();
			const sourceId = resolveSourceNodeId(
				useDagStore.getState().nodes,
				useDagStore.getState().edges,
				nodeId,
				architectSourceNodeId,
			);

			if (!objective || !sourceId) {
				const msg = !sourceId
					? "Aucune source détectée : reliez un reader au nœud Auto-Architect (ou placez un reader sur le canvas)."
					: "Saisissez un objectif global avant d’appliquer le pipeline.";
				reportError(`Erreur : ${msg}`);
				if (ownsLoading) {
					inFlightRef.current = false;
					endLoading();
				}
				return;
			}

			if (ownsLoading) {
				pushThinking("Consolidation du pipeline sur le canvas…");
			}

			try {
				const dag = useDagStore.getState();
				const staleNodeIds = new Set<string>();
				for (const step of dag.architectPreviousSteps) {
					if (typeof step.node_id === "string" && step.node_id.trim()) {
						staleNodeIds.add(step.node_id.trim());
					}
				}
				for (const proposal of dag.stepProposalNodes) {
					staleNodeIds.add(proposal.id);
				}
				const branchIds = collectArchitectBranchNodeIds(
					dag.edges,
					sourceId,
					new Set([nodeId]),
				);
				for (const id of branchIds) staleNodeIds.add(id);
				if (staleNodeIds.size > 0) {
					useDagStore.setState({
						nodes: dag.nodes.filter((item) => !staleNodeIds.has(item.id)),
						edges: dag.edges.filter(
							(edge) =>
								!staleNodeIds.has(edge.source) &&
								!staleNodeIds.has(edge.target),
						),
					});
				}

				discardStoreProposals();
				rejectAll();
				setArchitectSession({
					stepIndex: 0,
					previousSteps: [],
				});

				await runArchitectPipeline(objective, sourceId, {
					continueUntilComplete: true,
					materialize: true,
					initialPreviousSteps: [],
					initialStepIndex: 0,
					layoutStartNodeId: nodeId,
				});

				discardStoreProposals();
				rejectAll();
				pushThinking("Pipeline appliqué sur le canvas.");
				useDagStore.setState({
					inspectorOpen: false,
					importNotice: "Pipeline consolidé sur le canvas.",
					error: null,
				});
			} catch (err) {
				reportError(errorMessage(err));
			} finally {
				if (ownsLoading) {
					inFlightRef.current = false;
					setIsGenerating(false);
					setIsLoading(false);
					endLoading();
				}
			}
		},
		[
			architectGlobalObjective,
			architectPreviousSteps,
			architectSourceNodeId,
			architectStepIndex,
			appendStepProposals,
			beginLoading,
			discardStoreProposals,
			endLoading,
			globalPlan,
			nodeId,
			runArchitectPipeline,
			promptText,
			pushThinking,
			rejectAll,
			reportError,
			setArchitectSession,
		],
	);

	const handleGenerate = async () => {
		const trimmed = promptText.trim();
		if (!trimmed || inFlightRef.current) return;

		const autoAdvanceEnabled = autoAdvanceRef.current;

		const sourceId = resolveSourceNodeId(
			useDagStore.getState().nodes,
			useDagStore.getState().edges,
			nodeId,
			useDagStore.getState().architectSourceNodeId,
		);
		if (!sourceId) {
			const msg =
				"Aucune source détectée : reliez un reader au nœud Auto-Architect (ou placez un reader sur le canvas).";
			reportError(`Erreur : ${msg}`);
			return;
		}

		inFlightRef.current = true;
		beginLoading();
		setThinkingLog([]);
		pushThinking("Analyse de l'objectif et appel step-architect…");
		updateNodeParams(nodeId, {
			global_objective: trimmed,
			source_node_id: sourceId,
		});
		updateNodeParams(nodeId, { auto_advance: autoAdvanceEnabled });
		appendChat({
			role: "user",
			content: trimmed,
			at: new Date().toISOString(),
		});

		try {
			discardStoreProposals();
			rejectAll();
			setArchitectSession({
				globalPlan: [],
				stepIndex: 0,
				totalSteps: 0,
				previousSteps: [],
				sourceNodeId: sourceId,
				globalObjective: trimmed,
			});

			const { firstResult, stepIndex } = await runArchitectPipeline(
				trimmed,
				sourceId,
				{
					continueUntilComplete: true,
					materialize: autoAdvanceEnabled,
					layoutStartNodeId: nodeId,
				},
			);

			const planText = (firstResult?.global_plan || []).join(" → ");
			const suggestions = firstResult?.proactive_suggestions ?? [];
			const notices = firstResult?.geometry_notices ?? [];
			setProactiveSuggestions(suggestions);
			appendChat({
				role: "assistant",
				content: planText ? `Plan : ${planText}` : "Plan généré.",
				at: new Date().toISOString(),
			});
			if (notices.length) {
				appendChat({
					role: "assistant",
					content: notices.join(" "),
					at: new Date().toISOString(),
				});
			}
			if (suggestions.length) {
				appendChat({
					role: "assistant",
					content: `Suggestions :\n${suggestions.map((item) => `• ${item}`).join("\n")}`,
					at: new Date().toISOString(),
				});
			}
			pushThinking(
				planText
					? `Plan : ${planText}`
					: "Plan prêt — prévisualisation étape 1.",
			);

			if (autoAdvanceEnabled && stepIndex > 0) {
				pushThinking("Pipeline appliqué sur le canvas (auto-advance).");
				useDagStore.setState({
					inspectorOpen: false,
					importNotice: "Pipeline consolidé sur le canvas.",
					error: null,
				});
			}
		} catch (err) {
			reportError(errorMessage(err));
		} finally {
			inFlightRef.current = false;
			setIsGenerating(false);
			setIsLoading(false);
			endLoading();
		}
	};

	const handleReject = () => {
		discardStoreProposals();
		rejectAll();
		setArchitectSession({
			globalPlan: [],
			stepIndex: 0,
			totalSteps: 0,
			previousSteps: [],
		});
		setThinkingLog([]);
		setInspectorError(null);
		pushThinking("Propositions rejetées.");
	};

	const stepNumber = Math.min(currentStepIndex + 1, totalSteps || 1);
	const canApplyPipeline = hasProposals || globalPlan.length > 0;

	return (
		<div className="auto-architect-inspector">
			<div className="auto-architect-inspector__chat">
				<ul className="auto-architect-inspector__history">
					{chatHistory.length === 0 ? (
						<li className="auto-architect-inspector__empty">
							Décrivez l&apos;objectif global du pipeline à construire.
						</li>
					) : (
						chatHistory.map((message) => (
							<li
								key={`${message.at}-${message.role}-${message.content.slice(0, 48)}`}
								className={`auto-architect-inspector__bubble auto-architect-inspector__bubble--${message.role}`}
							>
								{message.content}
							</li>
						))
					)}
				</ul>
				<label className="auto-architect-inspector__field">
					Objectif global
					<textarea
						rows={4}
						placeholder="Reprojection EPSG:2154, filtrage des parcelles > 1000 m² et export GeoJSON"
						value={promptText}
						disabled={generating}
						onChange={(e) => setPromptText(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
								e.preventDefault();
								void handleGenerate();
							}
						}}
					/>
				</label>
				<label className="auto-architect-inspector__toggle">
					<input
						type="checkbox"
						checked={autoAdvance}
						disabled={generating}
						onChange={(e) => {
							const next = e.target.checked;
							setAutoAdvance(next);
							updateNodeParams(nodeId, { auto_advance: next });
						}}
					/>
					Avancement automatique (Auto-advance)
				</label>
				<label className="auto-architect-inspector__toggle">
					<input
						type="checkbox"
						checked={node?.data.params?.auto_heal !== false}
						disabled={generating}
						onChange={(e) => {
							updateNodeParams(nodeId, { auto_heal: e.target.checked });
						}}
					/>
					Auto-correction après échec (géométrie / CRS)
				</label>
				{proactiveSuggestions.length > 0 ? (
					<ul className="auto-architect-inspector__suggestions">
						{proactiveSuggestions.map((item) => (
							<li key={item}>{item}</li>
						))}
					</ul>
				) : null}
				{pendingHeal?.ok ? (
					<button
						type="button"
						className="composer-agent-panel__accept"
						disabled={generating}
						onClick={() => applyHealCorrective()}
					>
						Appliquer le correctif
					</button>
				) : null}
				{!dataSourceId ? (
					<p className="auto-architect-inspector__warn">
						Aucune source détectée : reliez la sortie d’un reader (CSV,
						Shapefile…) à l’entrée de ce nœud, ou ajoutez au moins un reader sur
						le canvas.
					</p>
				) : (
					<p className="auto-architect-inspector__source-hint">
						Source pour le plan : <code>{dataSourceId}</code>
					</p>
				)}
				{inspectorError ? (
					<p className="auto-architect-inspector__warn" role="alert">
						{inspectorError}
					</p>
				) : null}
				<button
					type="button"
					className="auto-architect-inspector__send"
					disabled={generating || !promptText.trim()}
					onClick={() => void handleGenerate()}
				>
					{generating ? (
						<>
							<Loader2 size={16} className="n8n-node--direct-agent__spin" />
							Génération…
						</>
					) : (
						"Envoyer / Générer le pipeline"
					)}
				</button>
			</div>

			<button
				type="button"
				className="composer-agent-panel__accordion"
				onClick={() => setThinkingOpen((value) => !value)}
				aria-expanded={thinkingOpen}
			>
				<span>Thinking process…</span>
				<span>{thinkingOpen ? "▾" : "▸"}</span>
			</button>
			{thinkingOpen ? (
				<ul className="composer-agent-panel__thoughts">
					{thinkingLog.length ? (
						thinkingLog.map((line) => <li key={line}>{line}</li>)
					) : (
						<li className="composer-agent-panel__muted">
							{generating
								? "Planification step-architect…"
								: "Les logs apparaîtront après l'envoi."}
						</li>
					)}
				</ul>
			) : null}

			{globalPlan.length > 0 ? (
				<section className="step-architect__plan">
					<p className="step-architect__plan-title">
						Étape {stepNumber} / {totalSteps || globalPlan.length}
					</p>
					<ol className="step-architect__stepper auto-architect-inspector__stepper">
						{globalPlan.map((label, index) => (
							<li
								key={label}
								className={
									index < currentStepIndex
										? "is-done"
										: index === currentStepIndex
											? "is-current"
											: ""
								}
							>
								{label}
								{index < globalPlan.length - 1 ? (
									<span className="auto-architect-inspector__arrow"> ➔ </span>
								) : null}
							</li>
						))}
					</ol>
				</section>
			) : null}

			<footer className="auto-architect-inspector__footer">
				<button
					type="button"
					className="composer-agent-panel__accept"
					disabled={generating || !canApplyPipeline}
					onClick={() => void handleApplyAll()}
					title="Matérialise toutes les étapes du plan"
				>
					Appliquer tout le pipeline
				</button>
				<button
					type="button"
					className="composer-agent-panel__reject"
					disabled={generating}
					onClick={handleReject}
				>
					Rejeter / Annuler
				</button>
			</footer>
		</div>
	);
}
