/** Handles File System Access API (non sérialisables) par nœud writer. */

const handles = new Map<string, FileSystemFileHandle>();

export function setNodeExportHandle(
	nodeId: string,
	handle: FileSystemFileHandle | null,
): void {
	if (!handle) {
		handles.delete(nodeId);
		return;
	}
	handles.set(nodeId, handle);
}

export function getNodeExportHandle(
	nodeId: string,
): FileSystemFileHandle | undefined {
	return handles.get(nodeId);
}

export function takeNodeExportHandle(
	nodeId: string,
): FileSystemFileHandle | undefined {
	const handle = handles.get(nodeId);
	handles.delete(nodeId);
	return handle;
}
