export const SHAPEFILE_INCOMPLETE_CHAT_MESSAGE =
	"Un Shapefile nécessite au minimum les fichiers .shp, .shx et .dbf. Veuillez téléverser une archive .zip contenant l'ensemble de ces fichiers.";

export function isShapefileIncompleteError(message: string): boolean {
	const lower = message.toLowerCase();
	return (
		lower.includes("shapefile incomplet") ||
		lower.includes("manque .shx") ||
		lower.includes("manque .dbf") ||
		message.includes(SHAPEFILE_INCOMPLETE_CHAT_MESSAGE)
	);
}
