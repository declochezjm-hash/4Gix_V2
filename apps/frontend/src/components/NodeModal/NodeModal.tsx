import { useCallback, useEffect, useState } from "react";
import { nodeChrome } from "../../lib/n8nCatalog";
import { catalogEntryIcon, N8nIconBadge } from "../../lib/n8nIcons";
import { useDagStore } from "../../store/dagStore";
import { ConfigWindow } from "./ConfigWindow";
import type { InspectorConfigTab } from "./configTabs";
import { InputWindow } from "./InputWindow";
import { OutputWindow } from "./OutputWindow";

export function NodeModal() {
	const inspectorOpen = useDagStore((s) => s.inspectorOpen);
	const selectedNodeId = useDagStore((s) => s.selectedNodeId);
	const nodes = useDagStore((s) => s.nodes);
	const snapshots = useDagStore((s) => s.snapshots);
	const closeInspector = useDagStore((s) => s.closeInspector);
	const runSelectedNode = useDagStore((s) => s.runSelectedNode);
	const running = useDagStore((s) => s.running);
	const node = nodes.find((n) => n.id === selectedNodeId);
	const snapshot = selectedNodeId ? snapshots[selectedNodeId] : undefined;
	const [configTab, setConfigTab] = useState<InspectorConfigTab>("parameters");
	const onConfigTabChange = useCallback((next: InspectorConfigTab) => {
		setConfigTab(next);
	}, []);

	useEffect(() => {
		const selected = nodes.find((n) => n.id === selectedNodeId);
		setConfigTab(
			selected?.data.nodeType === "direct_agent_processor"
				? "directChat"
				: "parameters",
		);
	}, [selectedNodeId, nodes]);

	useEffect(() => {
		if (!inspectorOpen) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") closeInspector();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [inspectorOpen, closeInspector]);

	if (!inspectorOpen || !node) {
		return null;
	}

	const chrome = nodeChrome({
		nodeType: node.data.nodeType,
		category: node.data.category,
	});

	return (
		<div className="n8n-modal" role="dialog" aria-modal="true">
			<header className="n8n-modal__head">
				<div className="n8n-modal__identity">
					<N8nIconBadge
						icon={catalogEntryIcon({
							node_type: node.data.nodeType,
							category: node.data.category,
						})}
						color={chrome.color}
						size={18}
						className="n8n-modal__icon"
					/>
					<div>
						<p className="n8n-panel__kicker">{node.data.category}</p>
						<h2>{node.data.label}</h2>
						<small>
							{snapshot
								? `${snapshot.status} · ${Math.round(snapshot.duration_ms || 0)} ms`
								: node.data.nodeType}
						</small>
					</div>
				</div>
				<div className="n8n-modal__actions">
					<button
						type="button"
						className={`n8n-help-btn${configTab === "help" ? " is-active" : ""}`}
						onClick={() => setConfigTab("help")}
						title="Ouvrir l'aide de ce nœud"
					>
						Aide
					</button>
					<button
						type="button"
						className="n8n-test-btn"
						onClick={() => void runSelectedNode()}
						disabled={
							running ||
							node.data.nodeType === "composer_agent" ||
							node.data.nodeType === "direct_agent_processor" ||
							node.data.nodeType === "auto_architect_agent"
						}
						title={
							node.data.nodeType === "composer_agent"
								? "Le Composer ne s'exécute pas — Accept pour matérialiser le graphe"
								: node.data.nodeType === "direct_agent_processor"
									? "Utilisez Exécuter sur le nœud ou Tchat Direct"
									: node.data.nodeType === "auto_architect_agent"
										? "Configurez via l'inspecteur Auto-Architect"
										: undefined
						}
					>
						{running ? "Executing…" : "Test step"}
					</button>
					<button
						type="button"
						className="n8n-icon-btn"
						onClick={closeInspector}
						aria-label="Fermer"
					>
						×
					</button>
				</div>
			</header>
			<div className="n8n-modal__cols">
				<InputWindow />
				<ConfigWindow tab={configTab} onTabChange={onConfigTabChange} />
				<OutputWindow />
			</div>
		</div>
	);
}
