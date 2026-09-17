import {
	LayoutGrid,
	LayoutList,
	MoreVertical,
	Search,
	SlidersHorizontal,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { WorkflowRecord } from "../../lib/api";
import { useDagStore } from "../../store/dagStore";

type OverviewViewMode = "comfortable" | "compact";
type WorkflowScopeFilter = "all" | "open";
type WorkflowSort = "updated" | "name" | "created";

const PAGE_SIZES = [25, 50, 100] as const;

function formatRelative(iso?: string): string {
	if (!iso) return "—";
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "—";
	const diff = Date.now() - date.getTime();
	const minutes = Math.floor(diff / 60000);
	if (minutes < 60) return `${minutes} min`;
	const hours = Math.floor(minutes / 60);
	if (hours < 48) return `${hours} h`;
	const days = Math.floor(hours / 24);
	if (days < 60) return `${days} j`;
	return date.toLocaleDateString("fr-FR");
}

function formatCreated(iso?: string): string {
	if (!iso) return "—";
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "—";
	return date.toLocaleDateString("fr-FR", {
		day: "numeric",
		month: "long",
		year: "numeric",
	});
}

export function ProjectOverview() {
	const workflows = useDagStore((s) => s.workflows);
	const workflowId = useDagStore((s) => s.workflowId);
	const loadWorkflow = useDagStore((s) => s.loadWorkflow);
	const loadWorkflows = useDagStore((s) => s.loadWorkflows);
	const setAppView = useDagStore((s) => s.setAppView);
	const newWorkflow = useDagStore((s) => s.newWorkflow);
	const duplicateWorkflow = useDagStore((s) => s.duplicateWorkflow);
	const renameWorkflow = useDagStore((s) => s.renameWorkflow);
	const deleteWorkflow = useDagStore((s) => s.deleteWorkflow);
	const importNotice = useDagStore((s) => s.importNotice);

	const [search, setSearch] = useState("");
	const [page, setPage] = useState(0);
	const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[1]);
	const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
	const [filtersOpen, setFiltersOpen] = useState(false);
	const [viewMode, setViewMode] = useState<OverviewViewMode>("comfortable");
	const [workflowScopeFilter, setWorkflowScopeFilter] =
		useState<WorkflowScopeFilter>("all");
	const [workflowSort, setWorkflowSort] = useState<WorkflowSort>("updated");
	const [highlightWorkflowId, setHighlightWorkflowId] = useState<string | null>(null);
	const filtersRef = useRef<HTMLDivElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!menuOpenId) return;
		const onPointerDown = (event: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(event.target as HTMLElement)) {
				setMenuOpenId(null);
			}
		};
		document.addEventListener("click", onPointerDown);
		return () => document.removeEventListener("click", onPointerDown);
	}, [menuOpenId]);

	useEffect(() => {
		void loadWorkflows();
	}, [loadWorkflows]);

	useEffect(() => {
		if (!highlightWorkflowId) return;
		const timer = window.setTimeout(() => setHighlightWorkflowId(null), 4000);
		return () => window.clearTimeout(timer);
	}, [highlightWorkflowId]);

	useEffect(() => {
		if (!filtersOpen) return;
		const onPointerDown = (event: MouseEvent) => {
			if (
				filtersRef.current &&
				!filtersRef.current.contains(event.target as HTMLElement)
			) {
				setFiltersOpen(false);
			}
		};
		document.addEventListener("mousedown", onPointerDown);
		return () => document.removeEventListener("mousedown", onPointerDown);
	}, [filtersOpen]);

	const workflowRows = useMemo(() => {
		const q = search.trim().toLowerCase();
		let rows = [...workflows];
		if (q) {
			rows = rows.filter(
				(w) => w.name.toLowerCase().includes(q) || w.id.toLowerCase().includes(q),
			);
		}
		if (workflowScopeFilter === "open" && workflowId) {
			rows = rows.filter((w) => w.id === workflowId);
		}
		rows.sort((a, b) => {
			if (workflowSort === "name") {
				return a.name.localeCompare(b.name, "fr");
			}
			if (workflowSort === "created") {
				const ta = new Date(a.created_at || 0).getTime();
				const tb = new Date(b.created_at || 0).getTime();
				return tb - ta;
			}
			const ta = new Date(a.updated_at || a.created_at || 0).getTime();
			const tb = new Date(b.updated_at || b.created_at || 0).getTime();
			return tb - ta;
		});
		return rows;
	}, [workflows, search, workflowScopeFilter, workflowId, workflowSort]);

	const filtersActive = workflowScopeFilter !== "all";

	const activeList = workflowRows;
	const totalPages = Math.max(1, Math.ceil(activeList.length / pageSize));
	const safePage = Math.min(page, totalPages - 1);
	const sliceStart = safePage * pageSize;
	const pageItems = activeList.slice(sliceStart, sliceStart + pageSize);

	const openWorkflow = (record: WorkflowRecord) => {
		loadWorkflow(record.id);
		setAppView("editor");
	};

	const confirmDeleteWorkflow = (record: WorkflowRecord) => {
		const ok = window.confirm(
			`Supprimer le workflow « ${record.name} » ? Cette action est irréversible.`,
		);
		if (!ok) return;
		setMenuOpenId(null);
		void deleteWorkflow(record.id);
	};

	const runDuplicateWorkflow = async (id: string) => {
		setMenuOpenId(null);
		setWorkflowSort("updated");
		setPage(0);
		const newId = await duplicateWorkflow(id);
		if (newId) {
			setHighlightWorkflowId(newId);
		}
	};

	const promptRenameWorkflow = (record: WorkflowRecord) => {
		const next = window.prompt("Nouveau nom du workflow :", record.name);
		if (next === null) return;
		const trimmed = next.trim();
		setMenuOpenId(null);
		if (!trimmed || trimmed === record.name) return;
		void renameWorkflow(record.id, trimmed);
	};

	const subtitle =
		"Workflows enregistrés sur le serveur 4GIx — ouvrez, exécutez ou créez un nouveau graphe.";

	return (
		<div className="project-overview">
			<header className="project-overview__head">
				<div className="project-overview__head-copy">
					<h1>Vue d'ensemble</h1>
					<p className="project-overview__subtitle">{subtitle}</p>
				</div>
				<button
					type="button"
					className="run-btn project-overview__create"
					onClick={() => newWorkflow()}
				>
					Créer un workflow
				</button>
			</header>

			<div className="project-overview__tabs" role="tablist">
				<button type="button" role="tab" className="is-active">
					Workflows
				</button>
				<button type="button" role="tab" className="is-disabled" disabled>
					Exécutions
				</button>
			</div>

			{importNotice ? (
				<p className="project-overview__feedback" role="status">
					{importNotice}
				</p>
			) : null}

			<div className="project-overview__toolbar">
				<div className="project-overview__search">
					<Search size={16} aria-hidden />
					<input
						type="search"
						placeholder="Rechercher"
						value={search}
						onChange={(e) => {
							setSearch(e.target.value);
							setPage(0);
						}}
					/>
				</div>
				<select
					className="project-overview__sort"
					value={workflowSort}
					onChange={(e) => {
						setWorkflowSort(e.target.value as WorkflowSort);
						setPage(0);
					}}
					aria-label="Trier"
				>
					<option value="updated">Trier par dernière mise à jour</option>
					<option value="created">Trier par date de création</option>
					<option value="name">Trier par nom</option>
				</select>
				<div className="project-overview__filters-wrap" ref={filtersRef}>
					<button
						type="button"
						className={
							filtersOpen || filtersActive
								? "project-overview__icon-btn is-active"
								: "project-overview__icon-btn"
						}
						title="Filtres"
						aria-expanded={filtersOpen}
						aria-haspopup="true"
						onClick={() => setFiltersOpen((open) => !open)}
					>
						<SlidersHorizontal size={18} />
					</button>
					{filtersOpen ? (
						<div className="project-overview__filters-popover" role="dialog">
							<p className="project-overview__filters-title">Filtres</p>
							<fieldset className="project-overview__filters-fieldset">
								<legend>Portée</legend>
								<label>
									<input
										type="radio"
										name="workflow-scope-filter"
										checked={workflowScopeFilter === "all"}
										onChange={() => {
											setWorkflowScopeFilter("all");
											setPage(0);
										}}
									/>
									Tous les workflows
								</label>
								<label>
									<input
										type="radio"
										name="workflow-scope-filter"
										checked={workflowScopeFilter === "open"}
										onChange={() => {
											setWorkflowScopeFilter("open");
											setPage(0);
										}}
									/>
									Workflow ouvert dans l&apos;éditeur
								</label>
							</fieldset>
						</div>
					) : null}
				</div>
				<button
					type="button"
					className="project-overview__icon-btn is-active"
					title={
						viewMode === "comfortable"
							? "Passer en vue compacte"
							: "Passer en vue détaillée"
					}
					onClick={() =>
						setViewMode((mode) => (mode === "comfortable" ? "compact" : "comfortable"))
					}
				>
					{viewMode === "comfortable" ? (
						<LayoutList size={18} />
					) : (
						<LayoutGrid size={18} />
					)}
				</button>
			</div>

			<ul
				className={
					viewMode === "compact"
						? "overview-cards overview-cards--compact"
						: "overview-cards"
				}
			>
				{pageItems.length === 0 ? (
					<li className="overview-cards__empty">Aucun workflow enregistré.</li>
				) : null}

				{(pageItems as WorkflowRecord[]).map((record) => {
					const count =
						(record.definition?.nodes as unknown[] | undefined)?.length ?? 0;
					const updated = formatRelative(record.updated_at || record.created_at);
					const created = formatCreated(record.created_at);
					return (
						<li
							key={record.id}
							className={
								highlightWorkflowId === record.id
									? "overview-card is-highlighted"
									: "overview-card"
							}
						>
							<button
								type="button"
								className="overview-card__main"
								onClick={() => openWorkflow(record)}
							>
								<strong>{record.name}</strong>
								<span className="overview-card__meta">
									Dernière mise à jour {updated} | Créé {created} · {count} nœud(s)
								</span>
							</button>
							<div className="overview-card__aside">
								<div
									className="overview-card__menu-wrap"
									ref={menuOpenId === record.id ? menuRef : undefined}
								>
									<button
										type="button"
										className="overview-card__menu-btn"
										aria-label="Actions"
										onClick={() =>
											setMenuOpenId(menuOpenId === record.id ? null : record.id)
										}
									>
										<MoreVertical size={18} />
									</button>
									{menuOpenId === record.id ? (
										<div
											className="overview-card__menu"
											role="menu"
											onMouseDown={(event) => event.stopPropagation()}
										>
											<button
												type="button"
												role="menuitem"
												onClick={() => {
													openWorkflow(record);
													setMenuOpenId(null);
												}}
											>
												Ouvrir
											</button>
											<button
												type="button"
												role="menuitem"
												onClick={() => {
													void runDuplicateWorkflow(record.id);
												}}
											>
												Dupliquer
											</button>
											<button
												type="button"
												role="menuitem"
												onClick={() => promptRenameWorkflow(record)}
											>
												Renommer
											</button>
											<button
												type="button"
												role="menuitem"
												className="is-danger"
												onClick={() => confirmDeleteWorkflow(record)}
											>
												Supprimer
											</button>
										</div>
									) : null}
								</div>
							</div>
						</li>
					);
				})}
			</ul>

			<footer className="project-overview__footer">
				<div className="project-overview__pager">
					<span className="project-overview__total">Total {activeList.length}</span>
					<div className="project-overview__page-nums">
						{Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
							let pageNum = i;
							if (totalPages > 7) {
								const start = Math.max(0, Math.min(safePage - 3, totalPages - 7));
								pageNum = start + i;
							}
							return (
								<button
									key={pageNum}
									type="button"
									className={
										pageNum === safePage
											? "project-overview__page-btn is-current"
											: "project-overview__page-btn"
									}
									onClick={() => setPage(pageNum)}
								>
									{pageNum + 1}
								</button>
							);
						})}
					</div>
					<select
						className="project-overview__page-size"
						value={pageSize}
						onChange={(e) => {
							setPageSize(Number(e.target.value));
							setPage(0);
						}}
						aria-label="Éléments par page"
					>
						{PAGE_SIZES.map((size) => (
							<option key={size} value={size}>
								{size}/page
							</option>
						))}
					</select>
				</div>
			</footer>
		</div>
	);
}
