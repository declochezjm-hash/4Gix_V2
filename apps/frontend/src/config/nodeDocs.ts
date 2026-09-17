import type { CatalogNode, SchemaProperty } from "../lib/api";
import { nodePresentation } from "./nodeRegistry";

export interface NodeDoc {
	title: string;
	summary: string;
	description: string;
	parametersHelp: {
		name: string;
		type: string;
		description: string;
		example?: string;
	}[];
	howToUse: string[];
	portsHelp: { port: string; description: string }[];
	example: { input: string; output: string };
}

const DOC_ALIASES: Record<string, string> = {
	code_node: "python_caller",
	buffer: "bufferer",
};

export const NODE_DOCS: Record<string, NodeDoc> = {
	shapefile_reader: {
		title: "Shapefile Reader",
		summary: "Lit les fichiers vectoriels ESRI Shapefile (.shp ou .zip).",
		description:
			"Ce nœud extrait les géométries (points, lignes, polygones) et la table d'attributs (.dbf) d'un Shapefile. Il gère la reprojection automatique en EPSG:4326 pour l'affichage cartographique tout en préservant le CRS natif pour les calculs.",
		parametersHelp: [
			{
				name: "Chemin / File Path",
				type: "Fichier / String",
				description: "Chemin du fichier .zip ou .shp à charger.",
				example: "/workspace/uploads/parcelles.zip",
			},
			{
				name: "Nom de couche",
				type: "String",
				description: "Nom attribué au jeu de données lu.",
				example: "parcelles_cadastre",
			},
			{
				name: "Encodage (.cpg)",
				type: "Select",
				description: "Encodage des caractères du fichier .dbf.",
				example: "UTF-8 / ISO-8859-1",
			},
		],
		howToUse: [
			"Glissez-déposez un fichier .zip (comprenant .shp, .dbf, .shx, .prj) directement sur le canvas ou sélectionnez-le dans les paramètres.",
			"Exécutez l'étape via le bouton « Test step » ou la barre d'action.",
			"Inspectez les attributs lus dans l'onglet « Tableau » et les entités sur la « Carte ».",
		],
		portsHelp: [
			{
				port: "output",
				description: "Émet la FeatureCollection contenant les attributs et géométries.",
			},
		],
		example: {
			input: "Archive parcelles.zip contenant le Shapefile cadastral",
			output:
				"Flux de 450 entités surfaciques avec leurs attributs (ID, Commune, Surface)",
		},
	},
	excel_reader: {
		title: "Excel Reader",
		summary: "Incorpore des données tabulaires depuis des fichiers .xlsx ou .xls.",
		description:
			"Lit les lignes d'une feuille Excel. Si des colonnes de coordonnées (X/Y, lon/lat) sont détectées automatiquement, le nœud génère des points en EPSG:4326 pour la carte.",
		parametersHelp: [
			{
				name: "Fichier Excel",
				type: "Fichier / String",
				description: "Chemin dans /workspace (souvent rempli au drag-and-drop).",
				example: "/workspace/uploads/clients.xlsx",
			},
			{
				name: "Feuille (Sheet Name)",
				type: "String",
				description: "Nom de la feuille à lire. Vide = première feuille.",
				example: "Donnees_2026",
			},
		],
		howToUse: [
			"Importez un fichier .xlsx ou .xls sur le canvas.",
			"Indiquez la feuille à lire si besoin.",
			"Lancez « Test step » : onglet Tableau pour les attributs ; Carte si colonnes X/Y ou longitude/latitude présentes.",
		],
		portsHelp: [
			{ port: "output", description: "Émet les enregistrements du tableau." },
		],
		example: {
			input: "Fichier clients.xlsx avec colonnes Nom, latitude, longitude",
			output: "Table attributaire + points sur la carte",
		},
	},
	csv_reader: {
		title: "CSV Reader",
		summary: "Parse des fichiers texte tabulaires (.csv).",
		description:
			"Détecte automatiquement le séparateur et l'encodage. Les colonnes de coordonnées reconnues permettent de construire une couche ponctuelle pour la carte.",
		parametersHelp: [
			{
				name: "Fichier CSV",
				type: "Fichier / String",
				description: "Chemin du fichier CSV dans le workspace.",
				example: "/workspace/uploads/export.csv",
			},
			{
				name: "Encodage",
				type: "String",
				description: "Vide = détection (UTF-8, ISO-8859-1, …).",
				example: "utf-8",
			},
			{
				name: "Séparateur",
				type: "String",
				description: "Un caractère. Vide = détection (, ; tab).",
				example: ";",
			},
		],
		howToUse: [
			"Glissez-déposez un .csv sur le canvas.",
			"Ajustez encodage ou séparateur uniquement si la détection échoue.",
			"Exécutez le nœud et consultez Tableau / Carte dans la sortie.",
		],
		portsHelp: [
			{
				port: "output",
				description: "Enregistrements tabulaires ou FeatureCollection.",
			},
		],
		example: {
			input: "stations.csv avec colonnes x, y, nom",
			output: "Points géoréférencés + attributs",
		},
	},
	gpkg_reader: {
		title: "GeoPackage Reader",
		summary: "Lit les couches vectorielles d'un fichier OGC .gpkg.",
		description:
			"Charge une couche du GeoPackage, expose la table d'attributs et reprojette la géométrie en EPSG:4326 pour l'inspecteur carte.",
		parametersHelp: [
			{
				name: "Fichier .gpkg",
				type: "Fichier",
				description: "Chemin du GeoPackage.",
				example: "/workspace/uploads/layers.gpkg",
			},
			{
				name: "Couche",
				type: "String",
				description: "Nom de la couche. Vide = première couche.",
				example: "parcelles",
			},
		],
		howToUse: [
			"Déposez un .gpkg sur le canvas.",
			"Choisissez la couche si le fichier en contient plusieurs.",
			"Test step → Tableau et Carte en WGS84.",
		],
		portsHelp: [
			{ port: "output", description: "FeatureCollection de la couche active." },
		],
		example: {
			input: "cadastre.gpkg, couche « parcelles »",
			output: "Polygones + attributs, carte centrée sur l'emprise",
		},
	},
	geojson_reader: {
		title: "GeoJSON Reader",
		summary: "Importe des entités depuis un fichier ou un GeoJSON inline.",
		description:
			"Lit une FeatureCollection GeoJSON. Le fichier peut être fourni par chemin workspace ou par collage dans le paramètre GeoJSON.",
		parametersHelp: [
			{
				name: "Fichier GeoJSON",
				type: "Fichier",
				description: "Chemin .geojson dans /workspace.",
				example: "/workspace/uploads/zones.geojson",
			},
			{
				name: "GeoJSON",
				type: "Textarea",
				description: "Contenu inline (alternative au fichier).",
				example: '{"type":"FeatureCollection","features":[...]}',
			},
		],
		howToUse: [
			"Déposez un .geojson ou renseignez le chemin après upload.",
			"Désactivez « jeu d'exemple » si vous utilisez vos données.",
			"Exécutez et visualisez Tableau / Carte.",
		],
		portsHelp: [{ port: "output", description: "FeatureCollection GeoJSON." }],
		example: {
			input: "zones.geojson (polygones d'étude)",
			output: "Entités prêtes pour buffer, jointure, etc.",
		},
	},
	kml_reader: {
		title: "KML / KMZ Reader",
		summary: "Lit les données vectorielles Google Earth (.kml, .kmz).",
		description:
			"Convertit les géométries KML en flux GeoJSON pour le pipeline 4GIx, avec vue carte en EPSG:4326.",
		parametersHelp: [
			{
				name: "Fichier",
				type: "Fichier",
				description: "Chemin .kml ou .kmz.",
				example: "/workspace/uploads/site.kmz",
			},
		],
		howToUse: [
			"Importez le fichier par glisser-déposer.",
			"Lancez Test step.",
			"Vérifiez la carte et les attributs KML dans la sortie.",
		],
		portsHelp: [{ port: "output", description: "Entités vectorielles issues du KML." }],
		example: {
			input: "tracé.kml de sentiers",
			output: "Lignes géoréférencées",
		},
	},
	dxf_reader: {
		title: "CAD / DXF Reader",
		summary: "Importe des géométries AutoCAD (.dxf).",
		description:
			"Extrait lignes, polylignes et hachures par calque. Les entités sont converties en GeoJSON pour analyse SIG.",
		parametersHelp: [
			{
				name: "Fichier DXF",
				type: "Fichier",
				description: "Chemin du DXF (pas de DWG binaire).",
				example: "/workspace/uploads/plan.dxf",
			},
			{
				name: "CRS source",
				type: "EPSG",
				description: "Système de coordonnées du dessin.",
				example: "EPSG:2154",
			},
			{
				name: "Calques",
				type: "String",
				description: "Liste de calques séparés par des virgules (vide = tous).",
				example: "ROUTE,BATI",
			},
		],
		howToUse: [
			"Convertissez un DWG en DXF si nécessaire.",
			"Importez le DXF et filtrez les calques optionnellement.",
			"Exécutez et inspectez les géométries sur la carte.",
		],
		portsHelp: [{ port: "output", description: "FeatureCollection par entité DXF." }],
		example: {
			input: "plan_voirie.dxf, calque ROUTE",
			output: "Polylignes routières en WGS84",
		},
	},
	attribute_manager: {
		title: "Edit Fields (AttributeManager)",
		summary: "Ajoute, renomme, supprime ou modifie la valeur des attributs.",
		description:
			"Nœud central pour manipuler la structure des données. Il permet de réorganiser la table d'attributs avant écriture ou analyse.",
		parametersHelp: [
			{
				name: "Rename Fields",
				type: "Mapping",
				description: "Associe un ancien nom de colonne à un nouveau nom.",
				example: "SUP_M2 ➔ surface_m2",
			},
			{
				name: "Remove Fields",
				type: "List",
				description: "Liste des colonnes à supprimer de la table.",
				example: "TEMP_ID, OLD_CODE",
			},
			{
				name: "Add/Set Fields",
				type: "Expression",
				description: "Crée une nouvelle colonne avec une valeur fixe ou calculée.",
				example: "statut = 'VALIDE'",
			},
		],
		howToUse: [
			"Connectez un nœud source (Reader) sur le port d'entrée.",
			"Définissez les règles de renommage ou de suppression dans la table de paramètres.",
			"Lancez l'exécution pour valider la nouvelle structure d'attributs.",
		],
		portsHelp: [
			{
				port: "output",
				description: "Flux de données avec le nouveau schéma d'attributs.",
			},
		],
		example: {
			input: "Champs: [ID_PARC, CODE_INSEE, TEMP_VAL]",
			output: "Champs réorganisés: [id_parcelle, code_commune]",
		},
	},
	python_caller: {
		title: "Code / Python Transformer",
		summary: "Exécute un script Python / GeoPandas sur le flux de données.",
		description:
			"Permet d'appliquer des traitements avancés personnalisés. Vous disposez de la variable « gdf » (GeoDataFrame GeoPandas) contenant les entités entrantes.",
		parametersHelp: [
			{
				name: "Mode",
				type: "Select",
				description:
					"Exécuter une fois pour tout le jeu de données (« all_items ») ou ligne par ligne.",
				example: "Run Once for All Items",
			},
			{
				name: "Code Python",
				type: "Code Editor",
				description:
					"Script à exécuter. Doit retourner un GeoDataFrame ou une liste d'objets.",
				example: "gdf['surf'] = gdf.geometry.area",
			},
		],
		howToUse: [
			"Rédigez votre script Python dans l'éditeur Monaco.",
			"Manipulez l'objet « gdf » (GeoPandas) ou « items » (liste de dictionnaires).",
			"Retournez l'objet transformé à la fin du script.",
		],
		portsHelp: [
			{
				port: "output",
				description: "Résultat retourné par le script Python.",
			},
			{
				port: "rejected",
				description: "Capture le message d'erreur si le script échoue.",
			},
		],
		example: {
			input: "Code: gdf['perimetre'] = gdf.geometry.length / return gdf",
			output: "Données enrichies de la colonne « perimetre »",
		},
	},
	bufferer: {
		title: "Create Buffer (Bufferer)",
		summary: "Génère une zone tampon autour de chaque géométrie.",
		description:
			"Calcule un polygone d'extension spatiale à une distance paramétrée autour de chaque point, ligne ou polygone.",
		parametersHelp: [
			{
				name: "Distance",
				type: "Number",
				description:
					"Rayon de la zone tampon dans l'unité du CRS natif (ou en mètres).",
				example: "50.0",
			},
			{
				name: "Unité",
				type: "Select",
				description: "Unité de mesure (Mètres, Kilomètres).",
				example: "Mètres",
			},
		],
		howToUse: [
			"Connectez une couche en entrée.",
			"Renseignez la distance de buffer souhaitée.",
			"Exécutez le nœud pour obtenir les entités surfaciques générées.",
		],
		portsHelp: [
			{
				port: "output",
				description: "Géométries transformées en zones tampons.",
			},
		],
		example: {
			input: "Points de stations de métro",
			output: "Polygones représentant un rayon de 300 m autour de chaque station",
		},
	},
};

function schemaParamType(prop: SchemaProperty): string {
	if (prop.enum?.length) return "Select";
	if (prop.format === "code" || prop.format === "sql") return "Code Editor";
	if (prop.format === "mapping") return "Mapping";
	if (prop.format === "epsg") return "EPSG";
	if (prop.type === "number" || prop.type === "integer") return "Number";
	if (prop.type === "boolean") return "Boolean";
	return "String";
}

function buildFallbackDoc(entry: CatalogNode): NodeDoc {
	const pres = nodePresentation(entry);
	const props = entry.schema?.properties || {};
	const parametersHelp = Object.entries(props).map(([key, prop]) => ({
		name: prop.title || key,
		type: schemaParamType(prop),
		description: prop.description || "—",
		example: prop.default != null ? String(prop.default) : undefined,
	}));

	const outputs = entry.output_handles?.length ? entry.output_handles : ["output"];
	const portsHelp = outputs.map((port) => ({
		port,
		description:
			port === "rejected"
				? "Flux rejeté ou erreurs de traitement."
				: "Sortie principale du nœud.",
	}));

	return {
		title: pres.displayName,
		summary: pres.paletteDescription || entry.description,
		description: entry.description || pres.paletteDescription,
		parametersHelp,
		howToUse: [
			"Configurez les paramètres dans l'onglet Parameters.",
			"Connectez les nœuds en amont sur le port d'entrée si nécessaire.",
			"Cliquez sur « Test step » pour exécuter ce nœud seul et inspecter INPUT / OUTPUT.",
		],
		portsHelp,
		example: {
			input: `Données en entrée depuis le graphe (${entry.category})`,
			output: "Résultat visible dans l'onglet OUTPUT (Tableau, Carte, JSON).",
		},
	};
}

export function resolveNodeDocKey(nodeType: string): string {
	return DOC_ALIASES[nodeType] || nodeType;
}

export function getNodeDoc(
	nodeType: string,
	catalogEntry?: CatalogNode | null,
): NodeDoc {
	const key = resolveNodeDocKey(nodeType);
	if (NODE_DOCS[key]) return NODE_DOCS[key];
	if (catalogEntry) return buildFallbackDoc(catalogEntry);
	return {
		title: nodeType,
		summary: "Documentation à compléter pour ce type de nœud.",
		description:
			"Consultez les paramètres du schéma backend (get_schema) et exécutez Test step pour explorer le comportement.",
		parametersHelp: [],
		howToUse: [
			"Ouvrez l'onglet Parameters pour les champs disponibles.",
			"Utilisez Test step après configuration.",
		],
		portsHelp: [{ port: "output", description: "Sortie du nœud." }],
		example: {
			input: "—",
			output: "—",
		},
	};
}
