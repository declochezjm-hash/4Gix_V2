import { Anvil, LayoutGrid, Workflow } from "lucide-react";

import type { AppView } from "../../store/dagStore";
import { useDagStore } from "../../store/dagStore";

export function AppSidebar() {
	const appView = useDagStore((s) => s.appView);
	const setAppView = useDagStore((s) => s.setAppView);
	const nodeCount = useDagStore((s) => s.nodes.length);

	const items: { id: AppView; label: string; icon: typeof Workflow }[] = [
		{ id: "overview", label: "Vue d'ensemble", icon: LayoutGrid },
		{ id: "editor", label: "Éditeur", icon: Workflow },
	];

	return (
		<nav className="app-sidebar" aria-label="Navigation principale">
			<div className="app-sidebar__brand" title="4GIx">
				<Anvil size={20} strokeWidth={1.25} aria-hidden />
			</div>
			<ul className="app-sidebar__list">
				{items.map(({ id, label, icon: Icon }) => (
					<li key={id}>
						<button
							type="button"
							className={`app-sidebar__item${appView === id ? " is-active" : ""}`}
							onClick={() => setAppView(id)}
							title={label}
						>
							<Icon size={20} strokeWidth={1.75} aria-hidden />
							<span className="app-sidebar__item-label">{label}</span>
							{id === "editor" && nodeCount > 0 ? (
								<span className="app-sidebar__badge">{nodeCount}</span>
							) : null}
						</button>
					</li>
				))}
			</ul>
		</nav>
	);
}
