import Editor, { type Monaco } from "@monaco-editor/react";
import { useMemo, useRef } from "react";
import {
	DEFAULT_PYTHON_CODE,
	DEFAULT_SQL_CODE,
	defaultCodeForLanguage,
} from "./codeTemplates";

const PYTHON_SNIPPETS = [
	{ label: "gdf", detail: "GeoDataFrame", insertText: "gdf" },
	{ label: "items", detail: "List[dict]", insertText: "items" },
	{ label: "feature", detail: "GeoJSON Feature", insertText: "feature" },
	{
		label: "gdf.geometry.area",
		detail: "surface",
		insertText: "gdf.geometry.area",
	},
	{
		label: "return output_gdf",
		detail: "retour flux",
		insertText: "return output_gdf",
	},
];

const SQL_SNIPPETS = [
	{ label: "items", detail: "table attributs", insertText: "items" },
	{ label: "gdf", detail: "vue alias items", insertText: "gdf" },
	{ label: "__row_id__", detail: "lien géométrie", insertText: "__row_id__" },
	{
		label: "SELECT * FROM items",
		detail: "requête de base",
		insertText: "SELECT *\nFROM items",
	},
];

type CodeEditorParamProps = {
	mode: string;
	language: string;
	code: string;
	onChange: (patch: {
		mode?: string;
		language?: string;
		code?: string;
	}) => void;
};

export function CodeEditorParam({
	mode,
	language,
	code,
	onChange,
}: CodeEditorParamProps) {
	const monacoRef = useRef<Monaco | null>(null);
	const editorLang = language === "sql" ? "sql" : "python";

	const beforeMount = (monaco: Monaco) => {
		monacoRef.current = monaco;
		const register = (lang: string, snippets: typeof PYTHON_SNIPPETS) => {
			monaco.languages.registerCompletionItemProvider(lang, {
				triggerCharacters: [".", " "],
				provideCompletionItems: (model, position) => {
					const word = model.getWordUntilPosition(position);
					const range = {
						startLineNumber: position.lineNumber,
						endLineNumber: position.lineNumber,
						startColumn: word.startColumn,
						endColumn: word.endColumn,
					};
					return {
						suggestions: snippets.map((item) => ({
							label: item.label,
							kind: monaco.languages.CompletionItemKind.Variable,
							insertText: item.insertText,
							detail: item.detail,
							range,
						})),
					};
				},
			});
		};
		register("python", PYTHON_SNIPPETS);
		register("sql", SQL_SNIPPETS);
	};

	const modeLabel = useMemo(
		() =>
			mode === "per_item" ? "Run for Each Item" : "Run Once for All Items",
		[mode],
	);

	const switchLanguage = (nextLanguage: string) => {
		const current = code.trim();
		const patch: { language: string; code?: string } = {
			language: nextLanguage,
		};
		if (
			current === DEFAULT_PYTHON_CODE.trim() ||
			current === DEFAULT_SQL_CODE.trim() ||
			!current
		) {
			patch.code = defaultCodeForLanguage(nextLanguage);
		}
		onChange(patch);
	};

	return (
		<div className="code-editor-param">
			<div className="code-editor-param__toolbar">
				<label>
					Mode
					<select
						value={mode || "all_items"}
						onChange={(event) => onChange({ mode: event.target.value })}
					>
						<option value="all_items">Run Once for All Items</option>
						<option value="per_item">Run for Each Item</option>
					</select>
				</label>
				<label>
					Language
					<select
						value={language || "python"}
						onChange={(event) => switchLanguage(event.target.value)}
					>
						<option value="python">Python</option>
						<option value="sql">SQL</option>
					</select>
				</label>
				<span className="code-editor-param__hint">{modeLabel}</span>
			</div>
			<div className="code-editor-param__surface">
				<Editor
					height="420px"
					language={editorLang}
					theme="vs-dark"
					value={code}
					beforeMount={beforeMount}
					onChange={(value) => onChange({ code: value ?? "" })}
					options={{
						minimap: { enabled: false },
						fontSize: 13,
						lineNumbers: "on",
						scrollBeyondLastLine: false,
						automaticLayout: true,
						tabSize: 4,
						padding: { top: 12, bottom: 12 },
						wordWrap: "on",
					}}
				/>
			</div>
			{language === "sql" ? (
				<p className="code-editor-param__note">
					SQL SELECT sur <code>items</code> / <code>gdf</code> — inclure{" "}
					<code>__row_id__</code> pour conserver les géométries.
				</p>
			) : (
				<p className="code-editor-param__note">
					Variables injectées : <code>gdf</code>, <code>items</code>,{" "}
					<code>feature</code> (mode par entité).
				</p>
			)}
		</div>
	);
}
