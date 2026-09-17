import { Component, type ErrorInfo, type ReactNode } from "react";

type CanvasErrorBoundaryProps = {
	children: ReactNode;
	className?: string;
	onReset?: () => void;
};

type CanvasErrorBoundaryState = {
	error: Error | null;
};

export class CanvasErrorBoundary extends Component<
	CanvasErrorBoundaryProps,
	CanvasErrorBoundaryState
> {
	state: CanvasErrorBoundaryState = { error: null };

	static getDerivedStateFromError(error: Error): CanvasErrorBoundaryState {
		return { error };
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		console.error("[4GIx canvas]", error, info.componentStack);
	}

	private handleRetry = () => {
		this.setState({ error: null });
		this.props.onReset?.();
	};

	render() {
		if (this.state.error) {
			const className = ["canvas-error-boundary", this.props.className || ""]
				.filter(Boolean)
				.join(" ");
			return (
				<div className={className} role="alert">
					<h3>Impossible d&apos;afficher le canvas</h3>
					<p>
						L&apos;import ou le graphe courant contient des données invalides. Corrigez
						le JSON ou rechargez un workflow valide.
					</p>
					<pre>{this.state.error.message}</pre>
					<button type="button" className="ghost-btn" onClick={this.handleRetry}>
						Réessayer l&apos;affichage
					</button>
				</div>
			);
		}
		if (this.props.className) {
			return <div className={this.props.className}>{this.props.children}</div>;
		}
		return this.props.children;
	}
}
