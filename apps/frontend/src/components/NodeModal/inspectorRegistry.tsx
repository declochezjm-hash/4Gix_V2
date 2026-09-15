import type { ComponentType } from "react";

import { AutoArchitectInspector } from "../inspectors/AutoArchitectInspector";

export type InspectorComponentProps = { nodeId: string };

/** Registre des inspecteurs CONFIGURATION par `nodeType`. */
export const INSPECTOR_BY_NODE_TYPE: Record<
	string,
	ComponentType<InspectorComponentProps>
> = {
	auto_architect_agent: AutoArchitectInspector,
};

export function resolveInspector(
	nodeType: string,
): ComponentType<InspectorComponentProps> | null {
	return INSPECTOR_BY_NODE_TYPE[nodeType] ?? null;
}
