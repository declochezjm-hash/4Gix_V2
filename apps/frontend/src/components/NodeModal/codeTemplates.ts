export const DEFAULT_PYTHON_CODE = `# Transformer les données entrantes avec GeoPandas
# 'gdf' contient le GeoDataFrame courant (géométries + attributs)

gdf['surface_m2'] = gdf.geometry.area
output_gdf = gdf[gdf['surface_m2'] > 100]

return output_gdf
`;

export const DEFAULT_SQL_CODE = `-- Tables : items, gdf (attributs + __row_id__)
-- Conservez __row_id__ pour garder les géométries.

SELECT *
FROM items
WHERE 1 = 1
`;

export function defaultCodeForLanguage(language: string): string {
	return language === "sql" ? DEFAULT_SQL_CODE : DEFAULT_PYTHON_CODE;
}
