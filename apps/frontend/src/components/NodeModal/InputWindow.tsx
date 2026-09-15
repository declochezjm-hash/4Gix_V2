import { useDagStore } from "../../store/dagStore";
import { DataPane } from "./DataPane";

export function InputWindow() {
	const selectedNodeId = useDagStore((s) => s.selectedNodeId);
	const snapshots = useDagStore((s) => s.snapshots);
	const snapshot = selectedNodeId ? snapshots[selectedNodeId] : undefined;

	return (
		<DataPane
			title="INPUT"
			subtitle="Arborescence JSON · Data-Map · Raster"
			data={snapshot?.input_snapshot ?? null}
			empty="Aucune donnée d'entrée. Lancez Test step pour exécuter ce nœud."
			accent="#3B82F6"
		/>
	);
}
