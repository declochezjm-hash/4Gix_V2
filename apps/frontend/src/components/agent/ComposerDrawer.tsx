import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { graphForComposerAgent } from "../../hooks/useComposerAgent";
import {
	enrichNodesWithSnapshots,
	extractContextMentions,
	resolveArchitectSourceNodeId,
	toolCallBadgeLabel,
} from "../../lib/composerCanvas";
import { useDagStore } from "../../store/dagStore";
import { useComposerAgentContext } from "./ComposerAgentContext";

export function ComposerDrawer() {
	const open = useDagStore((s) => s.composerDrawerOpen);
	const setOpen = useDagStore((s) => s.setComposerDrawerOpen);
	const nodes = useDagStore((s) => s.nodes);
	const edges = useDagStore((s) => s.edges);
	const snapshots = useDagStore((s) => s.snapshots);
	const selectedNodeId = useDagStore((s) => s.selectedNodeId);

	const {
		agentMode,
		setAgentMode,
		globalPlan,
		globalObjective,
		setGlobalObjective,
		currentStepIndex,
		totalSteps,
		isStepComplete,
		stepSummary,
		nextStepHint,
		stepLoading,
		stepError,
		startStepArchitect,
		regenerateCurrentStep,
		resetStepArchitect,
		sendPrompt,
		isThinking,
		thoughts,
		messages,
		proposedNodes,
		proposedEdges,
		error,
		hasProposals,
		acceptAll,
		rejectAll,
		validateAndAdvanceStep,
		adjustStepPrompt,
		setAdjustStepPrompt,
		mappingChoices,
		applyMappingChoice,
	} = useComposerAgentContext();

	const [targetedPrompt, setTargetedPrompt] = useState("");
	const drawerRef = useRef<HTMLElement | null>(null);

	const sourceNodeId = useMemo(
		() => resolveArchitectSourceNodeId(nodes, edges, selectedNodeId),
		[nodes, edges, selectedNodeId],
	);

	const anchorNodeId = selectedNodeId || sourceNodeId || "";

	const enrichedGraph = useMemo(
		() =>
			graphForComposerAgent({
				nodes: enrichNodesWithSnapshots(nodes, snapshots),
				edges,
			}),
		[nodes, edges, snapshots],
	);

	const launchStepPlan = useCallback(async () => {
		if (!sourceNodeId || !globalObjective.trim()) return;
		await startStepArchitect(globalObjective, sourceNodeId, nodes, edges, snapshots);
	}, [edges, globalObjective, nodes, snapshots, sourceNodeId, startStepArchitect]);

	const submitTargeted = useCallback(async () => {
		const trimmed = targetedPrompt.trim();
		if (!trimmed || isThinking) return;
		await sendPrompt(trimmed, enrichedGraph, {
			selectedNodeId: anchorNodeId || undefined,
			nodeId: anchorNodeId || undefined,
			sourceNodeId,
			contextMentions: extractContextMentions(trimmed),
		});
	}, [
		anchorNodeId,
		enrichedGraph,
		isThinking,
		sendPrompt,
		targetedPrompt,
		sourceNodeId,
	]);

	const stopArchitect = useCallback(() => {
		resetStepArchitect();
		rejectAll();
		setOpen(false);
	}, [rejectAll, resetStepArchitect, setOpen]);

	useEffect(() => {
		if (!open) return;
		const onKey = (event: globalThis.KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				stopArchitect();
				return;
			}
			if (
				agentMode === "step" &&
				(event.metaKey || event.ctrlKey) &&
				event.key === "Enter"
			) {
				const tag = (event.target as HTMLElement | null)?.tagName;
				if (tag === "TEXTAREA" || tag === "INPUT") return;
				event.preventDefault();
				if (hasProposals && !stepLoading && !isStepComplete) {
					void validateAndAdvanceStep();
				}
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [
		agentMode,
		hasProposals,
		isStepComplete,
		open,
		stepLoading,
		stopArchitect,
		validateAndAdvanceStep,
	]);

	if (!open) return null;

	const toolMessages = messages.filter((item) => item.type === "tool_call");
	const stepNumber = Math.min(currentStepIndex + 1, totalSteps || 1);

	return (
		<aside
			ref={drawerRef}
			className="composer-drawer"
			role="dialog"
			aria-label="Agent Composer"
		>
			<header className="composer-drawer__head">
				<div>
					<h2>Agent Composer</h2>
					<small>Ctrl+I · Esc pour fermer</small>
				</div>
				<button
					type="button"
					className="composer-drawer__close"
					onClick={() => setOpen(false)}
					aria-label="Fermer"
				>
					×
				</button>
			</header>

			<div className="composer-drawer__modes" role="tablist">
				<button
					type="button"
					role="tab"
					className={agentMode === "step" ? "is-active" : ""}
					onClick={() => setAgentMode("step")}
				>
					Auto-Architecte (étape par étape)
				</button>
				<button
					type="button"
					role="tab"
					className={agentMode === "targeted" ? "is-active" : ""}
					onClick={() => setAgentMode("targeted")}
				>
					Assistant ciblé
				</button>
			</div>

			<div className="composer-drawer__body">
				{agentMode === "step" ? (
					<>
						{globalPlan.length > 0 ? (
							<section className="step-architect__plan">
								<p className="step-architect__plan-title">
									Étape {stepNumber} / {totalSteps || globalPlan.length}
								</p>
								<ol className="step-architect__stepper">
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
										</li>
									))}
								</ol>
							</section>
						) : null}

						<label className="composer-drawer__field">
							Objectif global
							<textarea
								rows={3}
								placeholder="Reprojection EPSG:2154, filtrage des parcelles > 1000 m² et export GeoJSON"
								value={globalObjective}
								onChange={(e) => setGlobalObjective(e.target.value)}
								disabled={stepLoading}
							/>
						</label>
						{!globalPlan.length ? (
							<button
								type="button"
								className="composer-drawer__primary"
								disabled={stepLoading || !globalObjective.trim() || !sourceNodeId}
								onClick={() => void launchStepPlan()}
							>
								{stepLoading ? "Planification…" : "Générer le plan"}
							</button>
						) : null}
						{!sourceNodeId ? (
							<p className="composer-drawer__warn">
								Sélectionnez un reader ou branchez une source sur le canvas.
							</p>
						) : null}

						{stepSummary ? (
							<section className="step-architect__current">
								<h3>Étape courante</h3>
								<p>{stepSummary}</p>
								{nextStepHint ? (
									<p className="step-architect__hint">Ensuite : {nextStepHint}</p>
								) : null}
							</section>
						) : null}

						{isStepComplete ? (
							<p className="step-architect__complete">
								Plan terminé — tous les nœuds ont été validés.
							</p>
						) : null}

						{stepError ? (
							<p className="composer-agent-panel__error">{stepError}</p>
						) : null}

						<label className="composer-drawer__field">
							Ajuster l&apos;étape courante
							<textarea
								rows={2}
								placeholder="Précision pour régénérer uniquement cette étape…"
								value={adjustStepPrompt}
								onChange={(e) => setAdjustStepPrompt(e.target.value)}
								disabled={!globalPlan.length || stepLoading}
							/>
						</label>
						<button
							type="button"
							className="composer-drawer__adjust"
							disabled={!globalPlan.length || stepLoading}
							onClick={() =>
								void regenerateCurrentStep(adjustStepPrompt, nodes, edges, snapshots)
							}
						>
							Ajuster l&apos;étape
						</button>
					</>
				) : (
					<>
						<p className="composer-agent-panel__hint">
							Mutations directes sur le graphe (aperçu violet). Source :{" "}
							{anchorNodeId || "non définie"}.
						</p>
						<textarea
							className="composer-agent-panel__prompt"
							rows={4}
							placeholder="Décrivez la transformation… (@Schema, @Input)"
							value={targetedPrompt}
							onChange={(e) => setTargetedPrompt(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && !e.shiftKey) {
									e.preventDefault();
									void submitTargeted();
								}
							}}
						/>
						<button
							type="button"
							className="composer-agent-panel__send"
							disabled={isThinking || !targetedPrompt.trim()}
							onClick={() => void submitTargeted()}
						>
							{isThinking ? "Génération…" : "Envoyer"}
						</button>
						{thoughts.length ? (
							<ul className="composer-agent-panel__thoughts">
								{thoughts.map((thought) => (
									<li key={thought}>{thought}</li>
								))}
							</ul>
						) : null}
						{toolMessages.length ? (
							<div className="composer-agent-panel__tools">
								{toolMessages.map((message) => (
									<span key={`${message.tool}-${message.summary ?? ""}`}>
										{toolCallBadgeLabel(message.summary, message.tool)}
									</span>
								))}
							</div>
						) : null}
						{error ? <p className="composer-agent-panel__error">{error}</p> : null}
						{mappingChoices.length ? (
							<section className="composer-agent-panel__mapping-choices">
								<h3>Propositions de mappage</h3>
								<ul>
									{mappingChoices.map((choice) => (
										<li key={choice.id}>
											<p>
												<strong>{choice.label}</strong>
												<br />
												<span>{choice.description}</span>
											</p>
											<button
												type="button"
												className="composer-agent-panel__accept"
												disabled={isThinking}
												onClick={() =>
													void applyMappingChoice(choice.id, enrichedGraph, {
														selectedNodeId: anchorNodeId || undefined,
														nodeId: anchorNodeId || undefined,
														sourceNodeId,
													})
												}
											>
												Appliquer
											</button>
										</li>
									))}
								</ul>
							</section>
						) : null}
						{hasProposals ? (
							<div className="composer-agent-panel__review">
								<p>
									{proposedNodes.length} nœud(s) · {proposedEdges.length} liaison(s) en
									prévisualisation
								</p>
								<div>
									<button
										type="button"
										className="composer-agent-panel__accept"
										disabled={!anchorNodeId}
										onClick={() => anchorNodeId && acceptAll(anchorNodeId)}
									>
										Accept All
									</button>
									<button
										type="button"
										className="composer-agent-panel__reject"
										onClick={rejectAll}
									>
										Reject
									</button>
								</div>
							</div>
						) : null}
					</>
				)}
			</div>

			{agentMode === "step" && globalPlan.length > 0 ? (
				<footer className="composer-drawer__footer">
					<button
						type="button"
						className="composer-drawer__validate"
						disabled={!hasProposals || stepLoading || isStepComplete}
						onClick={() => void validateAndAdvanceStep()}
					>
						Valider &amp; passer à l&apos;étape suivante (⌘/Ctrl+Enter)
					</button>
					<button
						type="button"
						className="composer-drawer__stop"
						onClick={stopArchitect}
					>
						Terminer / Stopper
					</button>
				</footer>
			) : null}
		</aside>
	);
}
