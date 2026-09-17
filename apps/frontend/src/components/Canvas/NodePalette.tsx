import type { CatalogNode } from "../../lib/api";
import { useDagStore } from "../../store/dagStore";

const CATEGORIES = ["Reader", "Transformer", "Writer"] as const;

function groupTransformers(entries: CatalogNode[]): [string, CatalogNode[]][] {
	const groups = new Map<string, CatalogNode[]>();
	for (const entry of entries) {
		const key = entry.palette_group || "Autres";
		const list = groups.get(key) || [];
		list.push(entry);
		groups.set(key, list);
	}
	return Array.from(groups.entries());
}

export function NodePalette() {
	const catalog = useDagStore((s) => s.catalog);
	const addCatalogNode = useDagStore((s) => s.addCatalogNode);

	return (
		<aside className="palette">
			<header>
				<h2>Nœuds ETL</h2>
				<p>Glissez un type sur le canvas, ou cliquez pour l'ajouter.</p>
			</header>
			{CATEGORIES.map((category) => {
				const entries = catalog.filter((n) => n.category === category);
				if (category !== "Transformer") {
					return (
						<section key={category}>
							<h3>{category}s</h3>
							<ul>
								{entries.map((entry) => (
									<PaletteItem
										key={entry.node_type}
										entry={entry}
										onAdd={addCatalogNode}
									/>
								))}
							</ul>
						</section>
					);
				}
				return (
					<section key={category}>
						<h3>Transformers</h3>
						{groupTransformers(entries).map(([group, nodes]) => (
							<div key={group} className="palette__group">
								<h4>{group}</h4>
								<ul>
									{nodes.map((entry) => (
										<PaletteItem
											key={entry.node_type}
											entry={entry}
											onAdd={addCatalogNode}
										/>
									))}
								</ul>
							</div>
						))}
					</section>
				);
			})}
		</aside>
	);
}

function PaletteItem({
	entry,
	onAdd,
}: {
	entry: CatalogNode;
	onAdd: (entry: CatalogNode) => void;
}) {
	return (
		<li>
			<button
				type="button"
				draggable
				onDragStart={(event) => {
					event.dataTransfer.setData("application/4gix-node", JSON.stringify(entry));
					event.dataTransfer.effectAllowed = "move";
				}}
				onClick={() => onAdd(entry)}
			>
				<span>{entry.label}</span>
				{entry.is_spatial ? <em>SIG</em> : null}
			</button>
		</li>
	);
}
