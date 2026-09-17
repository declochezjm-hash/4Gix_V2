import { useState } from "react";
import { downloadWorkspaceExport } from "../../lib/workspaceExport";
import { useDagStore } from "../../store/dagStore";

export function WorkflowExportModal() {
	const open = useDagStore((s) => s.exportModalOpen);
	const queue = useDagStore((s) => s.exportQueue);
	const close = useDagStore((s) => s.closeExportModal);
	const [busyId, setBusyId] = useState<string | null>(null);
	const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set());
	const [error, setError] = useState<string | null>(null);

	if (!open || queue.length === 0) {
		return null;
	}

	const allSaved = queue.every((item) => savedIds.has(item.nodeId));

	return (
		<div className="workflow-export-modal" role="dialog" aria-modal="true">
			<div className="workflow-export-modal__card">
				<header>
					<h2>Exports prêts</h2>
					<p>
						Le traitement est terminé. Choisissez où enregistrer chaque fichier sur
						votre ordinateur.
					</p>
				</header>
				{error ? <p className="workflow-export-modal__error">{error}</p> : null}
				<ul className="workflow-export-modal__list">
					{queue.map((item) => (
						<li key={item.nodeId}>
							<div>
								<strong>{item.label}</strong>
								<small>{item.meta.suggestedName}</small>
							</div>
							<button
								type="button"
								className="n8n-test-btn"
								disabled={busyId !== null}
								onClick={() => {
									setBusyId(item.nodeId);
									setError(null);
									void downloadWorkspaceExport(item.nodeId, item.meta)
										.then(() => {
											setSavedIds((prev) => new Set(prev).add(item.nodeId));
										})
										.catch((err: unknown) => {
											setError(
												err instanceof Error
													? err.message
													: "Échec de l'enregistrement.",
											);
										})
										.finally(() => setBusyId(null));
								}}
							>
								{savedIds.has(item.nodeId)
									? "Enregistré ✓"
									: busyId === item.nodeId
										? "Enregistrement…"
										: "Enregistrer…"}
							</button>
						</li>
					))}
				</ul>
				<footer>
					<button type="button" className="ghost-btn" onClick={() => close()}>
						{allSaved ? "Fermer" : "Plus tard"}
					</button>
				</footer>
			</div>
		</div>
	);
}
