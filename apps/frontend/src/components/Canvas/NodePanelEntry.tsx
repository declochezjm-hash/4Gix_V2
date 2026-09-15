import { nodePresentation, paletteSubtitle } from "../../config/nodeRegistry";
import type { CatalogNode } from "../../lib/api";
import {
	ChevronRight,
	catalogEntryIcon,
	N8nIconBadge,
} from "../../lib/n8nIcons";

type NodePanelEntryProps = {
	entry: CatalogNode;
	accent: string;
	onSelect: (entry: CatalogNode) => void;
	subtitle?: string;
	showChevron?: boolean;
};

export function NodePanelEntry({
	entry,
	accent,
	onSelect,
	subtitle,
	showChevron = true,
}: NodePanelEntryProps) {
	const pres = nodePresentation(entry);
	return (
		<li>
			<button
				type="button"
				className="n8n-panel__node-btn"
				onClick={() => onSelect(entry)}
			>
				<N8nIconBadge icon={catalogEntryIcon(entry)} color={accent} size={15} />
				<span className="n8n-panel__node-copy">
					<strong>{pres.displayName}</strong>
					<small>{paletteSubtitle(entry, subtitle)}</small>
				</span>
				{showChevron ? (
					<ChevronRight
						size={16}
						strokeWidth={2}
						className="n8n-panel__chevron"
						aria-hidden
					/>
				) : null}
			</button>
		</li>
	);
}
