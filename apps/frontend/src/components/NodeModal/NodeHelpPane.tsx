import { BookOpen } from "lucide-react";
import type { NodeDoc } from "../../config/nodeDocs";

type NodeHelpPaneProps = {
	doc: NodeDoc;
};

export function NodeHelpPane({ doc }: NodeHelpPaneProps) {
	return (
		<div className="node-help">
			<div className="node-help__hero">
				<BookOpen size={18} strokeWidth={1.75} aria-hidden />
				<div>
					<h4>{doc.title}</h4>
					<p className="node-help__summary">{doc.summary}</p>
				</div>
			</div>

			<section className="node-help__block">
				<h5>Rôle & cas d&apos;usage</h5>
				<p>{doc.description}</p>
			</section>

			{doc.parametersHelp.length > 0 ? (
				<section className="node-help__block">
					<h5>Paramètres</h5>
					<ul className="node-help__params">
						{doc.parametersHelp.map((param) => (
							<li key={param.name}>
								<strong>{param.name}</strong>
								<span className="node-help__param-type">{param.type}</span>
								<p>{param.description}</p>
								{param.example ? (
									<code className="node-help__example">{param.example}</code>
								) : null}
							</li>
						))}
					</ul>
				</section>
			) : null}

			<section className="node-help__block">
				<h5>Ports</h5>
				<ul className="node-help__ports">
					{doc.portsHelp.map((port) => (
						<li key={port.port}>
							<code>{port.port}</code>
							<span>{port.description}</span>
						</li>
					))}
				</ul>
			</section>

			<section className="node-help__block">
				<h5>Guide d&apos;exécution</h5>
				<ol className="node-help__steps">
					{doc.howToUse.map((step) => (
						<li key={step}>{step}</li>
					))}
				</ol>
			</section>

			<section className="node-help__block node-help__example-block">
				<h5>Exemple</h5>
				<dl>
					<div>
						<dt>Entrée</dt>
						<dd>{doc.example.input}</dd>
					</div>
					<div>
						<dt>Sortie</dt>
						<dd>{doc.example.output}</dd>
					</div>
				</dl>
			</section>
		</div>
	);
}
