import { useEffect, useState } from "react";
import { ComposerAgentProvider } from "./components/agent/ComposerAgentContext";
import { ComposerDrawer } from "./components/agent/ComposerDrawer";
import { ShapefileHealBridge } from "./components/agent/ShapefileHealBridge";
import { CanvasErrorBoundary } from "./components/Canvas/CanvasErrorBoundary";
import { FlowCanvas } from "./components/Canvas/FlowCanvas";
import { NodePanelRight } from "./components/Canvas/NodePanelRight";
import { TopBar } from "./components/Header/TopBar";
import { NodeModal } from "./components/NodeModal/NodeModal";
import { AppSidebar } from "./components/Shell/AppSidebar";
import { ProjectOverview } from "./components/Shell/ProjectOverview";
import { isFmwFilename } from "./lib/api";
import { WorkflowExportModal } from "./components/export/WorkflowExportModal";
import { useDagStore } from "./store/dagStore";

export default function App() {
	const loadCatalog = useDagStore((s) => s.loadCatalog);
	const loadWorkflows = useDagStore((s) => s.loadWorkflows);
	const importLocalWorkflowFile = useDagStore((s) => s.importLocalWorkflowFile);
	const selectedNodeId = useDagStore((s) => s.selectedNodeId);
	const openInspector = useDagStore((s) => s.openInspector);
	const composerDrawerOpen = useDagStore((s) => s.composerDrawerOpen);
	const setComposerDrawerOpen = useDagStore((s) => s.setComposerDrawerOpen);
	const deleteNode = useDagStore((s) => s.deleteNode);
	const copyNode = useDagStore((s) => s.copyNode);
	const pasteNode = useDagStore((s) => s.pasteNode);
	const duplicateNode = useDagStore((s) => s.duplicateNode);
	const toggleNodeDisabled = useDagStore((s) => s.toggleNodeDisabled);
	const renameSelectedNode = useDagStore((s) => s.renameSelectedNode);
	const tidyUpWorkflow = useDagStore((s) => s.tidyUpWorkflow);
	const appView = useDagStore((s) => s.appView);
	const [fmwDragOver, setFmwDragOver] = useState(false);

	const handleFmwDrop = (file: File | undefined) => {
		if (!file) return;
		const lower = file.name.toLowerCase();
		if (!isFmwFilename(file.name) && !lower.endsWith(".json")) return;
		void importLocalWorkflowFile(file);
		setFmwDragOver(false);
	};

	useEffect(() => {
		void loadCatalog();
		void loadWorkflows();
	}, [loadCatalog, loadWorkflows]);

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			const tag = (event.target as HTMLElement | null)?.tagName;
			if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
			if (event.key === "F2" && selectedNodeId) {
				event.preventDefault();
				renameSelectedNode(selectedNodeId);
			}
			if (event.key === "Delete" && selectedNodeId) {
				event.preventDefault();
				deleteNode(selectedNodeId);
			}
			if (event.key.toLowerCase() === "d" && selectedNodeId && !event.ctrlKey) {
				event.preventDefault();
				toggleNodeDisabled(selectedNodeId);
			}
			if (event.ctrlKey && event.key.toLowerCase() === "c" && selectedNodeId) {
				event.preventDefault();
				copyNode(selectedNodeId);
			}
			if (event.ctrlKey && event.key.toLowerCase() === "d" && selectedNodeId) {
				event.preventDefault();
				duplicateNode(selectedNodeId);
			}
			if (event.ctrlKey && event.key.toLowerCase() === "v") {
				event.preventDefault();
				pasteNode();
			}
			if (event.shiftKey && event.altKey && event.key.toLowerCase() === "t") {
				event.preventDefault();
				tidyUpWorkflow();
			}
			if (event.key === "Enter" && selectedNodeId) {
				openInspector(selectedNodeId);
			}
			if (event.ctrlKey && event.key.toLowerCase() === "i") {
				event.preventDefault();
				setComposerDrawerOpen(!composerDrawerOpen);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [
		selectedNodeId,
		deleteNode,
		copyNode,
		pasteNode,
		duplicateNode,
		toggleNodeDisabled,
		renameSelectedNode,
		tidyUpWorkflow,
		openInspector,
		composerDrawerOpen,
		setComposerDrawerOpen,
	]);

	return (
		<div className="app-shell">
			<AppSidebar />
			<div className="app-main">
				<WorkflowExportModal />
				<TopBar />
				{appView === "overview" ? (
					<ProjectOverview key="overview" />
				) : (
					<CanvasErrorBoundary className="workspace workspace--error-fallback">
						<ComposerAgentProvider>
						<div
							className={`workspace__editor${fmwDragOver ? " workspace--fmw-drop" : ""}`}
							onDragOver={(event) => {
								if (!event.dataTransfer.types.includes("Files")) return;
								event.preventDefault();
								event.dataTransfer.dropEffect = "copy";
								setFmwDragOver(true);
							}}
							onDragLeave={(event) => {
								const next = event.relatedTarget as Element | null;
								if (next && event.currentTarget.contains(next)) return;
								setFmwDragOver(false);
							}}
							onDrop={(event) => {
								event.preventDefault();
								setFmwDragOver(false);
								handleFmwDrop(event.dataTransfer.files?.[0]);
							}}
						>
							<main className="workspace__main">
								{fmwDragOver ? (
									<div className="fmw-drop-overlay" aria-hidden>
										Déposer un projet (.fmw / .json)
									</div>
								) : null}
								<FlowCanvas />
								<NodePanelRight />
								<NodeModal />
								<ShapefileHealBridge />
								<ComposerDrawer />
							</main>
						</div>
						</ComposerAgentProvider>
					</CanvasErrorBoundary>
				)}
			</div>
		</div>
	);
}
