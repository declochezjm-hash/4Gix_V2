import { useMemo } from "react";
import {
	driverFromWriterNode,
	exportMetaFromSnapshot,
	isFileWriterNode,
} from "../../lib/workspaceExport";
import { useDagStore } from "../../store/dagStore";
import { DataPane } from "./DataPane";
import { ExportDownloadBanner } from "./ExportDownloadBanner";

export function OutputWindow() {
	const selectedNodeId = useDagStore((s) => s.selectedNodeId);
	const nodes = useDagStore((s) => s.nodes);
	const snapshots = useDagStore((s) => s.snapshots);
	const node = nodes.find((n) => n.id === selectedNodeId);
	const snapshot = selectedNodeId ? snapshots[selectedNodeId] : undefined;
	const data = snapshot?.output_snapshot ?? snapshot?.preview ?? null;

	const exportMeta = useMemo(() => {
		if (!node || !snapshot) return null;
		if (!isFileWriterNode(node.data.nodeType, node.data.requestedNodeType)) {
			return null;
		}
		return exportMetaFromSnapshot(snapshot.metadata, {
			...node.data.params,
			driver:
				node.data.params.driver ||
				driverFromWriterNode(node.data.params, node.data.requestedNodeType),
		});
	}, [node, snapshot]);

	const showBanner =
		exportMeta &&
		selectedNodeId &&
		(snapshot?.status === "COMPLETED" || snapshot?.status === "success");

	return (
		<>
			{showBanner && exportMeta && selectedNodeId ? (
				<ExportDownloadBanner
					nodeId={selectedNodeId}
					meta={exportMeta}
					onDismiss={undefined}
				/>
			) : null}
			<DataPane
				title="OUTPUT"
				subtitle={
					snapshot
						? `${snapshot.status} · ${Math.round(snapshot.duration_ms || 0)} ms`
						: "Entités résultantes · MapLibre / Deck.gl 3D"
				}
				data={data}
				empty="Aucune sortie. Execute Node pour inspecter le type d'entité, les attributs et la géométrie."
				accent="#22C55E"
				executionStatus={snapshot?.status}
				dataKey={selectedNodeId ?? undefined}
			/>
		</>
	);
}
