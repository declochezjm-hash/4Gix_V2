import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { initColorTheme } from "./lib/theme";

initColorTheme();

const root = document.getElementById("root");
if (!root) {
	throw new Error("Élément #root introuvable");
}
ReactDOM.createRoot(root).render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
);
