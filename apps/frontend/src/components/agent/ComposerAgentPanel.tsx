import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";

import { graphForComposerAgent } from "../../hooks/useComposerAgent";
import {
	extractContextMentions,
	resolveUpstreamDataSourceId,
	toolCallBadgeLabel,
} from "../../lib/composerCanvas";
import { useDagStore } from "../../store/dagStore";
import { useComposerAgentContext } from "./ComposerAgentContext";

type MentionOption = {
	token: string;
	label: string;
	description: string;
};

function parseMentionQuery(value: string, cursor: number): string | null {
	const before = value.slice(0, cursor);
	const at = before.lastIndexOf("@");
	if (at < 0) return null;
	const fragment = before.slice(at + 1);
	if (/\s/.test(fragment)) return null;
	return fragment;
}

export function ComposerAgentPanel({ composerNodeId }: { composerNodeId: string }) {
	const {
		isThinking,
		isLoading,
		isGenerating,
		thoughts,
		messages,
		proposedNodes,
		proposedEdges,
		error,
		sendPrompt,
		acceptAll,
		rejectAll,
		hasProposals,
		setComposerBusy,
		mappingChoices,
		applyMappingChoice,
	} = useComposerAgentContext();

	const composerBusy = isGenerating || isLoading;

	const nodes = useDagStore((s) => s.nodes);
	const edges = useDagStore((s) => s.edges);
	const snapshots = useDagStore((s) => s.snapshots);
	const updateNodeParams = useDagStore((s) => s.updateNodeParams);
	const closeInspector = useDagStore((s) => s.closeInspector);

	const composerNode = nodes.find((node) => node.id === composerNodeId);
	const replaceDownstream = composerNode?.data.params?.replace_downstream !== false;
	const storedPrompt =
		typeof composerNode?.data.params?.prompt === "string"
			? composerNode.data.params.prompt
			: "";

	const [promptText, setPromptText] = useState(storedPrompt);
	const [thoughtsOpen, setThoughtsOpen] = useState(true);
	const [mentionQuery, setMentionQuery] = useState<string | null>(null);
	const [mentionIndex, setMentionIndex] = useState(0);
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);

	useEffect(() => {
		setPromptText(storedPrompt);
	}, [storedPrompt]);

	const sourceNodeId = useMemo(
		() => resolveUpstreamDataSourceId(nodes, edges, composerNodeId),
		[nodes, edges, composerNodeId],
	);

	const mentionOptions = useMemo((): MentionOption[] => {
		const base: MentionOption[] = [
			{
				token: "@Schema",
				label: "@Schema",
				description: "Colonnes, types et CRS du nœud sélectionné",
			},
			{
				token: "@Input",
				label: "@Input",
				description: "Données d'entrée du nœud actif",
			},
		];
		return [
			...base,
			...nodes.map((node) => ({
				token: `@${node.id}`,
				label: `@${node.data.label || node.id}`,
				description: node.id,
			})),
		];
	}, [nodes]);

	const filteredMentions = useMemo(() => {
		if (mentionQuery == null) return [];
		const q = mentionQuery.toLowerCase();
		return mentionOptions.filter(
			(option) =>
				option.token.toLowerCase().includes(q) ||
				option.label.toLowerCase().includes(q),
		);
	}, [mentionOptions, mentionQuery]);

	const persistPrompt = (value: string) => {
		updateNodeParams(composerNodeId, { prompt: value });
	};

	const syncMentionMenu = (value: string, cursor: number) => {
		setMentionQuery(parseMentionQuery(value, cursor));
		setMentionIndex(0);
	};

	const insertMention = (token: string) => {
		const field = textareaRef.current;
		if (!field) return;
		const cursor = field.selectionStart ?? promptText.length;
		const before = promptText.slice(0, cursor);
		const after = promptText.slice(cursor);
		const at = before.lastIndexOf("@");
		if (at < 0) return;
		const next = `${before.slice(0, at)}${token} ${after}`;
		setPromptText(next);
		persistPrompt(next);
		setMentionQuery(null);
		const pos = at + token.length + 1;
		window.requestAnimationFrame(() => {
			field.focus();
			field.setSelectionRange(pos, pos);
		});
	};

	const composerGraphPayload = () =>
		graphForComposerAgent({
			nodes: nodes.map((node) => {
				const snap = snapshots[node.id];
				if (!snap) return node;
				return {
					...node,
					data: {
						...node.data,
						outputSnapshot: snap.output_snapshot ?? snap.preview,
						inputSnapshot: snap.input_snapshot,
					},
				};
			}),
			edges,
		});

	const handleSend = async () => {
		const trimmed = promptText.trim();
		if (!trimmed || composerBusy) return;
		persistPrompt(trimmed);
		const enriched = composerGraphPayload();
		try {
			await sendPrompt(trimmed, enriched, {
				nodeId: composerNodeId,
				selectedNodeId: composerNodeId,
				sourceNodeId,
				contextMentions: extractContextMentions(trimmed),
			});
		} catch (err) {
			console.error("ComposerAgent handleSend:", err);
		} finally {
			setComposerBusy(false);
		}
	};

	const onPromptKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		if (mentionQuery != null && filteredMentions.length) {
			if (event.key === "ArrowDown") {
				event.preventDefault();
				setMentionIndex((i) => (i + 1) % filteredMentions.length);
				return;
			}
			if (event.key === "ArrowUp") {
				event.preventDefault();
				setMentionIndex(
					(i) => (i - 1 + filteredMentions.length) % filteredMentions.length,
				);
				return;
			}
			if (event.key === "Enter" || event.key === "Tab") {
				event.preventDefault();
				insertMention(filteredMentions[mentionIndex].token);
				return;
			}
		}
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			void handleSend();
		}
	};

	const toolMessages = messages.filter((item) => item.type === "tool_call");
	const inspectResult = useMemo(() => {
		for (let i = messages.length - 1; i >= 0; i -= 1) {
			const item = messages[i];
			if (item.type === "tool_call" && item.tool === "inspect_input_schema") {
				return item.result?.inspect;
			}
		}
		return undefined;
	}, [messages]);
	const inspectFields = useMemo(() => {
		if (!inspectResult || typeof inspectResult !== "object") return [];
		const fields = (inspectResult as { fields?: unknown }).fields;
		if (!Array.isArray(fields)) return [];
		return fields.filter(
			(item): item is { name: string; type?: string } =>
				typeof item === "object" &&
				item !== null &&
				typeof (item as { name?: unknown }).name === "string",
		);
	}, [inspectResult]);

	return (
		<div className="composer-agent-panel">
			<p className="composer-agent-panel__hint">
				Ce nœud sera remplacé par le graphe proposé à l&apos;acceptation
				{replaceDownstream ? " (y compris la chaîne en aval)." : " (seul ce nœud)."}
			</p>
			<label className="composer-agent-panel__toggle">
				<input
					type="checkbox"
					checked={replaceDownstream}
					onChange={(event) =>
						updateNodeParams(composerNodeId, {
							replace_downstream: event.target.checked,
						})
					}
				/>
				Remplacer aussi les nœuds en aval
			</label>

			<button
				type="button"
				className="composer-agent-panel__accordion"
				onClick={() => setThoughtsOpen((value) => !value)}
				aria-expanded={thoughtsOpen}
			>
				<span>{composerBusy || isThinking ? "Thinking…" : "Thinking process"}</span>
				<span>{thoughtsOpen ? "▾" : "▸"}</span>
			</button>
			{thoughtsOpen ? (
				<ul className="composer-agent-panel__thoughts">
					{thoughts.length ? (
						thoughts.map((thought) => <li key={thought}>{thought}</li>)
					) : (
						<li className="composer-agent-panel__muted">
							{composerBusy || isThinking
								? "Chargement / Analyse…"
								: "Les réflexions de l’agent apparaîtront ici."}
						</li>
					)}
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

			{inspectResult && typeof inspectResult === "object" ? (
				<section className="composer-agent-panel__schema">
					<h3>Schéma @Input</h3>
					{(inspectResult as { ok?: boolean }).ok === false ? (
						<p className="composer-agent-panel__muted">
							{String(
								(inspectResult as { error?: string }).error || "Inspection impossible.",
							)}
						</p>
					) : (
						<>
							<p>
								<strong>
									{String(
										(inspectResult as { label?: string }).label ||
											(inspectResult as { node_id?: string }).node_id,
									)}
								</strong>
								{" · "}
								{String((inspectResult as { node_type?: string }).node_type)}
							</p>
							{inspectFields.length ? (
								<ul>
									{inspectFields.map((field) => (
										<li key={field.name}>
											<code>{field.name}</code>
											{field.type ? <span>{field.type}</span> : null}
										</li>
									))}
								</ul>
							) : (
								<p className="composer-agent-panel__muted">
									Aucune colonne dans l&apos;aperçu — exécutez Test step sur le nœud
									amont.
								</p>
							)}
						</>
					)}
				</section>
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
									disabled={composerBusy}
									onClick={() =>
										void applyMappingChoice(choice.id, composerGraphPayload(), {
											nodeId: composerNodeId,
											selectedNodeId: composerNodeId,
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

			<textarea
				ref={textareaRef}
				className="composer-agent-panel__prompt"
				rows={4}
				placeholder="Décrivez la transformation… (@Schema, @Input)"
				value={promptText}
				onChange={(event) => {
					setPromptText(event.target.value);
					syncMentionMenu(
						event.target.value,
						event.target.selectionStart ?? event.target.value.length,
					);
				}}
				onBlur={() => persistPrompt(promptText)}
				onKeyDown={onPromptKeyDown}
			/>
			{mentionQuery != null && filteredMentions.length ? (
				<ul className="composer-agent-panel__mentions">
					{filteredMentions.map((option, index) => (
						<li key={option.token}>
							<button
								type="button"
								className={index === mentionIndex ? "is-active" : undefined}
								onMouseDown={(event) => {
									event.preventDefault();
									insertMention(option.token);
								}}
							>
								<strong>{option.label}</strong>
								<small>{option.description}</small>
							</button>
						</li>
					))}
				</ul>
			) : null}

			<button
				type="button"
				className="composer-agent-panel__send"
				disabled={composerBusy || !promptText.trim()}
				onClick={() => void handleSend()}
			>
				{composerBusy ? "Génération…" : "Envoyer"}
			</button>

			{hasProposals ? (
				<div className="composer-agent-panel__review">
					<p>
						{proposedNodes.length} nœud(s) · {proposedEdges.length} liaison(s) en
						prévisualisation (violet)
					</p>
					<div>
						<button
							type="button"
							className="composer-agent-panel__accept"
							onClick={() => {
								acceptAll(composerNodeId);
								closeInspector();
							}}
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
		</div>
	);
}
