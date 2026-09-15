import { useState } from "react";

import { useDagStore } from "../../store/dagStore";
import { FieldMapperUI } from "./FieldMapperUI";

type AttributeManagerConfigProps = {
	nodeId: string;
	operations: unknown;
	onOperationsChange: (json: string) => void;
};

export function AttributeManagerConfig({
	nodeId,
	operations,
	onOperationsChange,
}: AttributeManagerConfigProps) {
	const edges = useDagStore((s) => s.edges);
	const snapshots = useDagStore((s) => s.snapshots);
	const [mode, setMode] = useState<"visual" | "json">("visual");

	const operationsJson =
		typeof operations === "string"
			? operations
			: JSON.stringify(operations ?? [], null, 2);

	return (
		<div className="config-form config-form--field-mapper">
			<FieldMapperUI
				nodeId={nodeId}
				operationsJson={operationsJson}
				onOperationsChange={onOperationsChange}
				edges={edges}
				snapshots={snapshots}
				mode={mode}
				onModeChange={setMode}
			/>
		</div>
	);
}
