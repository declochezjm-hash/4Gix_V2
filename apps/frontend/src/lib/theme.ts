export type ColorTheme = "dark" | "light";

const STORAGE_KEY = "4gix-color-theme";

export function getStoredTheme(): ColorTheme {
	try {
		const value = localStorage.getItem(STORAGE_KEY);
		return value === "light" ? "light" : "dark";
	} catch {
		return "dark";
	}
}

export function applyColorTheme(theme: ColorTheme): void {
	document.documentElement.dataset.theme = theme;
	try {
		localStorage.setItem(STORAGE_KEY, theme);
	} catch {
		/* ignore */
	}
}

export function initColorTheme(): ColorTheme {
	const theme = getStoredTheme();
	applyColorTheme(theme);
	return theme;
}

export function toggleColorTheme(current: ColorTheme): ColorTheme {
	const next = current === "dark" ? "light" : "dark";
	applyColorTheme(next);
	return next;
}

export function readColorTheme(): ColorTheme {
	return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function canvasDotsColor(theme: ColorTheme = readColorTheme()): string {
	return theme === "light" ? "#c5cdd8" : "#3a3b40";
}
