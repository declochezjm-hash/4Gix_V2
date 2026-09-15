import { useEffect, useState } from "react";
import type { CatalogNode } from "../../lib/api";
import type { N8nGroup } from "../../lib/n8nCatalog";
import { catalogSubgroups } from "../../lib/n8nCatalog";
import { ChevronDown, ChevronRight, groupLucideIcon } from "../../lib/n8nIcons";
import { NodePanelEntry } from "./NodePanelEntry";

type NodePanelCategoryAccordionProps = {
	group: N8nGroup;
	nodes: CatalogNode[];
	expanded: boolean;
	onToggle: () => void;
	onSelectNode: (entry: CatalogNode) => void;
	defaultOpenSubgroups?: boolean;
};

export function NodePanelCategoryAccordion({
	group,
	nodes,
	expanded,
	onToggle,
	onSelectNode,
	defaultOpenSubgroups = false,
}: NodePanelCategoryAccordionProps) {
	const Icon = groupLucideIcon(group.id);
	const subgroups = catalogSubgroups(nodes);
	const [openSubs, setOpenSubs] = useState<Set<string>>(() => {
		if (defaultOpenSubgroups) {
			return new Set(subgroups.map((s) => s.id));
		}
		if (expanded && subgroups.length) {
			return new Set([subgroups[0].id]);
		}
		return new Set();
	});

	useEffect(() => {
		if (!expanded || nodes.length === 0) return;
		const subs = catalogSubgroups(nodes);
		if (!subs.length) return;
		setOpenSubs((prev) => {
			if (prev.size > 0) return prev;
			if (defaultOpenSubgroups) {
				return new Set(subs.map((sub) => sub.id));
			}
			return new Set([subs[0].id]);
		});
	}, [expanded, nodes, defaultOpenSubgroups]);

	const toggleSub = (id: string) => {
		setOpenSubs((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	return (
		<section className="n8n-panel__category">
			<button
				type="button"
				className={`n8n-panel__category-head ${expanded ? "is-open" : ""}`}
				onClick={onToggle}
				aria-expanded={expanded}
			>
				<span className="n8n-panel__category-icon" aria-hidden>
					<Icon size={22} strokeWidth={1.75} />
				</span>
				<span className="n8n-panel__category-copy">
					<strong>{group.shortTitle}</strong>
					<small>{group.description}</small>
				</span>
				<ChevronRight
					size={18}
					strokeWidth={2}
					className="n8n-panel__category-chevron"
					aria-hidden
				/>
			</button>
			{expanded ? (
				<div className="n8n-panel__category-body">
					{nodes.length === 0 ? (
						<p className="n8n-panel__empty">Aucun nœud dans cette catégorie.</p>
					) : (
						subgroups.map((sub) => {
							const subOpen = openSubs.has(sub.id);
							return (
								<div key={sub.id} className="n8n-panel__subgroup">
									<button
										type="button"
										className="n8n-panel__subgroup-head"
										onClick={() => toggleSub(sub.id)}
										aria-expanded={subOpen}
									>
										<span>{sub.title}</span>
										<ChevronDown
											size={16}
											strokeWidth={2}
											className={
												subOpen
													? "n8n-panel__subgroup-chevron is-open"
													: "n8n-panel__subgroup-chevron"
											}
											aria-hidden
										/>
									</button>
									{subOpen ? (
										<ul className="n8n-panel__subgroup-list">
											{sub.nodes.map((entry) => (
												<NodePanelEntry
													key={entry.node_type}
													entry={entry}
													accent={group.color}
													onSelect={onSelectNode}
													showChevron={false}
												/>
											))}
										</ul>
									) : null}
								</div>
							);
						})
					)}
				</div>
			) : null}
		</section>
	);
}
