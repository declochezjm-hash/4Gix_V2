import { type ReactNode, useState } from "react";

type JsonTreeProps = {
	data: unknown;
	name?: string;
	depth?: number;
};

export function JsonTree({ data, name = "root", depth = 0 }: JsonTreeProps) {
	if (data === null || data === undefined) {
		return (
			<div className="json-row" style={{ paddingLeft: depth * 14 }}>
				{name ? <span className="json-key">{name}</span> : null}
				<span className="json-null">null</span>
			</div>
		);
	}
	if (Array.isArray(data) || (typeof data === "object" && data !== null)) {
		return (
			<Branch
				name={name}
				depth={depth}
				preview={Array.isArray(data) ? `[${data.length}]` : "{…}"}
			>
				{Array.isArray(data)
					? data
							.slice(0, 80)
							.map((item, index) => (
								<JsonTree
									key={index}
									name={String(index)}
									data={item}
									depth={depth + 1}
								/>
							))
					: Object.entries(data as Record<string, unknown>)
							.filter(([key]) => key !== "preview_png_base64")
							.map(([key, value]) => (
								<JsonTree key={key} name={key} data={value} depth={depth + 1} />
							))}
			</Branch>
		);
	}
	return (
		<div className="json-row" style={{ paddingLeft: depth * 14 }}>
			{name ? <span className="json-key">{name}</span> : null}
			<span className="json-val">{formatValue(data)}</span>
		</div>
	);
}

function Branch({
	name,
	preview,
	depth,
	children,
}: {
	name: string;
	preview: string;
	depth: number;
	children: ReactNode;
}) {
	const [open, setOpen] = useState(depth < 2);
	return (
		<div className="json-branch">
			<button
				type="button"
				className="json-toggle"
				style={{ paddingLeft: depth * 14 }}
				onClick={() => setOpen((value) => !value)}
			>
				<span className="json-chevron">{open ? "▾" : "▸"}</span>
				<span className="json-key">{name}</span>
				{!open ? <span className="json-preview">{preview}</span> : null}
			</button>
			{open ? children : null}
		</div>
	);
}

function formatValue(value: unknown): string {
	if (typeof value === "string") return value;
	if (typeof value === "boolean" || typeof value === "number") {
		return String(value);
	}
	return JSON.stringify(value);
}
