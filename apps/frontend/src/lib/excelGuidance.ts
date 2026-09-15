export const EXCEL_MISSING_OPENPYXL_CHAT_MESSAGE =
	"Le moteur de lecture Excel (openpyxl) est absent sur le serveur. Pour débloquer immédiatement le traitement, vous pouvez exporter votre fichier sous format .csv et le déposer sur le canvas.";

export function isOpenpyxlMissingError(message: string): boolean {
	const lower = message.toLowerCase();
	return (
		lower.includes("openpyxl") &&
		(lower.includes("import") ||
			lower.includes("install") ||
			lower.includes("missing") ||
			lower.includes("optional dependency") ||
			lower.includes("absent") ||
			message.includes(EXCEL_MISSING_OPENPYXL_CHAT_MESSAGE))
	);
}
