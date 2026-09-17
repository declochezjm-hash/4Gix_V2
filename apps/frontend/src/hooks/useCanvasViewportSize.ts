import { useLayoutEffect, useRef, useState } from "react";

export type ViewportSize = { width: number; height: number };

export function measureCanvasViewportSize(): ViewportSize {
	const topbar =
		document.querySelector(".topbar")?.getBoundingClientRect().height ?? 49;
	const sidebar =
		document.querySelector(".app-sidebar")?.getBoundingClientRect().width ?? 56;
	return {
		width: Math.max(320, Math.floor(window.innerWidth - sidebar)),
		height: Math.max(280, Math.floor(window.innerHeight - topbar)),
	};
}

/** Taille en pixels pour le conteneur React Flow (évite l’erreur #004). */
export function useCanvasViewportSize() {
	const hostRef = useRef<HTMLDivElement>(null);
	const [size, setSize] = useState<ViewportSize>(() =>
		typeof window !== "undefined"
			? measureCanvasViewportSize()
			: { width: 960, height: 640 },
	);

	useLayoutEffect(() => {
		const host = hostRef.current;
		if (!host) return;

		const apply = () => {
			const rect = host.getBoundingClientRect();
			let width = Math.floor(rect.width);
			let height = Math.floor(rect.height);
			if (width < 16 || height < 16) {
				const fallback = measureCanvasViewportSize();
				width = fallback.width;
				height = fallback.height;
			}
			host.style.width = `${width}px`;
			host.style.height = `${height}px`;
			setSize((prev) =>
				prev.width === width && prev.height === height ? prev : { width, height },
			);
		};

		apply();
		const observer = new ResizeObserver(() => apply());
		observer.observe(host);
		if (host.parentElement) {
			observer.observe(host.parentElement);
		}
		window.addEventListener("resize", apply);
		return () => {
			observer.disconnect();
			window.removeEventListener("resize", apply);
		};
	}, []);

	return { hostRef, size };
}
