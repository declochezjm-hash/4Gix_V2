import { Loader2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { type DirectChatTurn, parseChatHistory } from "../../lib/directProcess";
import { useDagStore } from "../../store/dagStore";

export function DirectAgentChatPanel({ nodeId }: { nodeId: string }) {
	const nodes = useDagStore((s) => s.nodes);
	const runDirectProcess = useDagStore((s) => s.runDirectProcess);
	const updateNodeParams = useDagStore((s) => s.updateNodeParams);

	const node = nodes.find((n) => n.id === nodeId);
	const history = parseChatHistory(node?.data.params?.chat_history);
	const storedPrompt =
		typeof node?.data.params?.prompt === "string" ? node.data.params.prompt : "";
	const running = node?.data.status === "RUNNING" || node?.data.status === "running";

	const [prompt, setPrompt] = useState(storedPrompt);

	useEffect(() => {
		setPrompt(storedPrompt);
	}, [storedPrompt]);

	const send = () => {
		const text = prompt.trim();
		if (!text || running) return;
		updateNodeParams(nodeId, { prompt: text });
		void runDirectProcess(nodeId, text);
	};

	return (
		<div className="direct-agent-chat">
			<p className="direct-agent-chat__hint">
				Enchaînez des instructions : chaque envoi réutilise le jeu de données entrant
				(nœud parent) et met à jour la sortie de ce nœud.
			</p>
			<ul className="direct-agent-chat__history">
				{history.length === 0 ? (
					<li className="direct-agent-chat__empty">Aucun prompt exécuté.</li>
				) : (
					history.map((turn: DirectChatTurn) => (
						<li
							key={`${turn.executedAt}:${turn.prompt}`}
							className={
								turn.ok
									? "direct-agent-chat__turn"
									: "direct-agent-chat__turn direct-agent-chat__turn--error"
							}
						>
							<span className="direct-agent-chat__prompt">{turn.prompt}</span>
							<small>
								{turn.ok
									? `${turn.featureCountAfter ?? "?"} entité(s) · ${new Date(turn.executedAt).toLocaleString("fr-FR")}`
									: turn.error || "Erreur"}
							</small>
						</li>
					))
				)}
			</ul>
			<div className="direct-agent-chat__composer">
				<textarea
					className="direct-agent-chat__input"
					rows={3}
					placeholder="Ex. « Calcule la surface », puis « Garde uniquement les surfaces > 500 »"
					value={prompt}
					disabled={running}
					onChange={(e) => setPrompt(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
							e.preventDefault();
							send();
						}
					}}
				/>
				<button
					type="button"
					className="direct-agent-chat__send"
					disabled={running || !prompt.trim()}
					onClick={send}
				>
					{running ? (
						<Loader2 size={16} className="n8n-node--direct-agent__spin" />
					) : (
						<Sparkles size={16} />
					)}
					Exécuter
				</button>
			</div>
		</div>
	);
}
