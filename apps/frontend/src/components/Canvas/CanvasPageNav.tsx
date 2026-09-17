import { useDagStore } from "../../store/dagStore";

export function CanvasPageNav() {
	const enabled = useDagStore((s) => s.canvasPaginationEnabled);
	const pages = useDagStore((s) => s.canvasPages);
	const pageIndex = useDagStore((s) => s.canvasPageIndex);
	const setCanvasPage = useDagStore((s) => s.setCanvasPage);
	const setCanvasPaginationEnabled = useDagStore((s) => s.setCanvasPaginationEnabled);
	const rebuildCanvasPages = useDagStore((s) => s.rebuildCanvasPages);
	const tidyUpWorkflow = useDagStore((s) => s.tidyUpWorkflow);
	const nodeCount = useDagStore((s) => s.nodes.length);

	if (!pages.length) return null;

	const total = pages.length;
	const showBar = enabled || total > 1;

	if (!showBar) return null;

	const visibleCount = pages[pageIndex]?.length ?? 0;

	return (
		<nav className="canvas-page-nav" aria-label="Pages du workflow">
			<button
				type="button"
				className="ghost-btn canvas-page-nav__btn"
				disabled={enabled && pageIndex <= 0}
				onClick={() => setCanvasPage(pageIndex - 1)}
				title="Page précédente"
			>
				‹
			</button>
			<span className="canvas-page-nav__label">
				{enabled ? (
					<>
						Page <strong>{pageIndex + 1}</strong> / {total}
						<small>{visibleCount} nœud(s) visibles</small>
					</>
				) : (
					<>
						Vue complète <small>{nodeCount} nœuds</small>
					</>
				)}
			</span>
			<button
				type="button"
				className="ghost-btn canvas-page-nav__btn"
				disabled={enabled && pageIndex >= total - 1}
				onClick={() => setCanvasPage(pageIndex + 1)}
				title="Page suivante"
			>
				›
			</button>
			<button
				type="button"
				className="ghost-btn canvas-page-nav__toggle"
				onClick={() => setCanvasPaginationEnabled(!enabled)}
				title={
					enabled
						? "Afficher tout le graphe (peut être dense)"
						: "Paginer le graphe pour plus de lisibilité"
				}
			>
				{enabled ? "Tout afficher" : "Paginer"}
			</button>
			<button
				type="button"
				className="ghost-btn canvas-page-nav__toggle"
				onClick={() => {
					tidyUpWorkflow();
					rebuildCanvasPages();
				}}
				title="Réorganiser les nœuds et recalculer les pages"
			>
				Réorganiser
			</button>
		</nav>
	);
}
