import { NodeModal } from "./NodeModal";

/** Conservé pour compatibilité — la vue n8n est la modale 3 colonnes. */
export function NodeInspector() {
	return <NodeModal />;
}

export { INSPECTOR_BY_NODE_TYPE, resolveInspector } from "./inspectorRegistry";
