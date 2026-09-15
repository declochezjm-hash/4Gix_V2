import { useState } from "react";
import {
	downloadWorkspaceExport,
	type WorkspaceExportMeta,
} from "../../lib/workspaceExport";

type ExportDownloadBannerProps = {
	nodeId: string;
	meta: WorkspaceExportMeta;
	onDismiss?: () => void;
};

export function ExportDownloadBanner({
	nodeId,
	meta,
	onDismiss,
}: ExportDownloadBannerProps) {
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	return (
		<div className="export-download-banner" role="status">
			<p>Export terminé. Choisissez où enregistrer le fichier sur votre ordinateur.</p>
			{error ? <small className="export-download-banner__error">{error}</small> : null}
			<div className="export-download-banner__actions">
				<button
					type="button"
					className="n8n-test-btn"
					disabled={busy}
					onClick={() => {
						setBusy(true);
						setError(null);
						void downloadWorkspaceExport(nodeId, meta)
							.then(() => onDismiss?.())
							.catch((err: unknown) => {
								setError(
									err instanceof Error
										? err.message
										: "Échec du téléchargement.",
								);
							})
							.finally(() => setBusy(false));
					}}
				>
					{busy ? "Enregistrement…" : "Enregistrer sur le disque…"}
				</button>
				{onDismiss ? (
					<button type="button" className="ghost-btn" onClick={onDismiss}>
						Plus tard
					</button>
				) : null}
			</div>
		</div>
	);
}
