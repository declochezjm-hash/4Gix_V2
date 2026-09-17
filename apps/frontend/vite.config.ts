import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	base: "./",
	plugins: [react()],
	optimizeDeps: {
		include: [
			"@deck.gl/core",
			"@deck.gl/layers",
			"@deck.gl/mapbox",
			"maplibre-gl",
			"lucide-react",
		],
	},
	server: {
		host: "127.0.0.1",
		port: 5173,
		strictPort: true,
		proxy: {
			"/api": {
				target: process.env.VITE_PROXY_TARGET || "http://127.0.0.1:8000",
				changeOrigin: true,
				ws: true,
			},
			"/health": {
				target: process.env.VITE_PROXY_TARGET || "http://127.0.0.1:8000",
				changeOrigin: true,
			},
		},
	},
});
