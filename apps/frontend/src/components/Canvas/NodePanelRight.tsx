import { useEffect, useMemo, useRef, useState } from "react";
import { matchesNodeSearch } from "../../config/nodeRegistry";
import { groupCatalog, type N8nGroupId } from "../../lib/n8nCatalog";
import { ArrowLeft, Search } from "../../lib/n8nIcons";
import { useDagStore } from "../../store/dagStore";
import { NodePanelCategoryAccordion } from "./NodePanelCategoryAccordion";

export function NodePanelRight() {
	const open = useDagStore((s) => s.nodePanelOpen);
	const closeNodePanel = useDagStore((s) => s.closeNodePanel);
	const catalog = useDagStore((s) => s.catalog);
	const insertNodeFromPanel = useDagStore((s) => s.insertNodeFromPanel);
	const loadCatalog = useDagStore((s) => s.loadCatalog);
	const catalogLoaded = useDagStore((s) => s.catalogLoaded);
	const panelError = useDagStore((s) => s.error);
	const pendingConnect = useDagStore((s) => s.pendingConnect);
	const pendingEdgeInsert = useDagStore((s) => s.pendingEdgeInsert);
	const [query, setQuery] = useState("");
	const [expandedGroups, setExpandedGroups] = useState<Set<N8nGroupId>>(
		new Set(),
	);
	const searchRef = useRef<HTMLInputElement | null>(null);

	useEffect(() => {
		if (!open) return;
		setQuery("");
		// Une catégorie ouverte par défaut pour montrer l’accordéon (style n8n).
		setExpandedGroups(new Set<N8nGroupId>(["data"]));
		void loadCatalog();
		const timer = window.setTimeout(() => searchRef.current?.focus(), 40);
		return () => window.clearTimeout(timer);
	}, [open, loadCatalog]);

	useEffect(() => {
		if (!open) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") closeNodePanel();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, closeNodePanel]);

	const searching = query.trim().length > 0;

	const grouped = useMemo(() => {
		const filtered = searching
			? catalog.filter((entry) => matchesNodeSearch(entry, query))
			: catalog;
		return groupCatalog(filtered);
	}, [catalog, query, searching]);

	useEffect(() => {
		if (!searching) return;
		setExpandedGroups(
			new Set(
				grouped
					.filter(({ nodes }) => nodes.length > 0)
					.map(({ group }) => group.id),
			),
		);
	}, [searching, grouped]);

	const toggleGroup = (id: N8nGroupId) => {
		setExpandedGroups((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	if (!open) return null;

	return (
		<aside className="n8n-panel" aria-label="Ajouter un nœud">
			<header className="n8n-panel__head">
				<div>
					<p className="n8n-panel__kicker">
						{pendingEdgeInsert
							? "Insérer sur la liaison"
							: pendingConnect
								? "Connecter un nœud"
								: "Ajouter un nœud"}
					</p>
					<h2>What happens next?</h2>
					<p className="n8n-panel__hint">
						Cliquez une catégorie pour l’ouvrir ou la fermer.
					</p>
				</div>
				<button
					type="button"
					className="n8n-icon-btn n8n-icon-btn--lucide"
					onClick={closeNodePanel}
					aria-label="Fermer le panneau"
				>
					<ArrowLeft size={20} strokeWidth={2} aria-hidden />
				</button>
			</header>
			<div className="n8n-panel__search">
				<Search
					size={16}
					strokeWidth={2}
					className="n8n-panel__search-icon"
					aria-hidden
				/>
				<input
					ref={searchRef}
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder="Search nodes..."
					aria-label="Search nodes"
				/>
			</div>
			{catalogLoaded && catalog.length === 0 ? (
				<div className="n8n-panel__empty n8n-panel__empty--block">
					<p>
						{panelError ||
							"Impossible de charger les nœuds. Vérifiez que l’API tourne sur le port 8000."}
					</p>
					<button
						type="button"
						className="ghost-btn"
						onClick={() => void loadCatalog()}
					>
						Réessayer
					</button>
				</div>
			) : null}
			<div className="n8n-panel__list n8n-panel__list--accordion">
				{searching
					? grouped.map(({ group, nodes }) =>
							nodes.length === 0 ? null : (
								<NodePanelCategoryAccordion
									key={group.id}
									group={group}
									nodes={nodes}
									expanded={expandedGroups.has(group.id)}
									onToggle={() => toggleGroup(group.id)}
									onSelectNode={insertNodeFromPanel}
									defaultOpenSubgroups
								/>
							),
						)
					: grouped.map(({ group, nodes }) => (
							<NodePanelCategoryAccordion
								key={group.id}
								group={group}
								nodes={nodes}
								expanded={expandedGroups.has(group.id)}
								onToggle={() => toggleGroup(group.id)}
								onSelectNode={insertNodeFromPanel}
							/>
						))}
				{searching && !grouped.some(({ nodes }) => nodes.length > 0) ? (
					<p className="n8n-panel__empty">
						Aucun nœud ne correspond à la recherche.
					</p>
				) : null}
			</div>
		</aside>
	);
}
