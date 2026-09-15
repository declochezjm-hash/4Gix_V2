"""Schéma Pydantic v2 du DAG SirenSpark embarqué (MVP 4GIx V02)."""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, field_validator


class StepOptions(BaseModel):
    """Options génériques d'une étape (params 4GIx → options SirenSpark)."""

    model_config = ConfigDict(extra="allow")

    filepath: Optional[str] = None
    path: Optional[str] = None
    header: Optional[bool] = True
    delimiter: Optional[str] = None
    encoding: Optional[str] = None
    layer: Optional[str] = None
    column_name: Optional[str] = "geometry"
    source_crs: Optional[str] = None
    target_crs: Optional[str] = None
    source_srid: Optional[str] = None
    new_srid: Optional[str] = None
    field: Optional[str] = None
    operator: Optional[str] = None
    value: Optional[Any] = None
    join_type: Optional[str] = None
    join_keys: Optional[List[str]] = None
    predicate: Optional[str] = None
    left_geom: Optional[str] = "geometry"
    right_geom: Optional[str] = "geometry"
    driver: Optional[str] = None
    format: Optional[str] = None
    crs: Optional[str] = None


class CsvReaderOptions(StepOptions):
    filepath: str
    header: bool = True
    delimiter: str = ","
    encoding: Optional[str] = None


class ShapefileReaderOptions(StepOptions):
    filepath: str
    encoding: Optional[str] = None


class FilterTransformerOptions(StepOptions):
    field: str
    operator: str = "equals"
    value: Any = None


class ReprojectTransformerOptions(StepOptions):
    column_name: str = "geometry"
    source_crs: str = "EPSG:4326"
    target_crs: str = "EPSG:2154"


class SpatialJoinerOptions(StepOptions):
    join_type: str = "inner"
    predicate: str = "intersects"
    join_keys: Optional[List[str]] = None
    left_geom: str = "geometry"
    right_geom: str = "geometry"


class FileWriterOptions(StepOptions):
    filepath: str
    driver: str = "GeoJSON"
    crs: Optional[str] = None


class StepInput(BaseModel):
    """Ports d'entrée nommés (ids des étapes amont)."""

    model_config = ConfigDict(extra="allow")

    input: Optional[str] = None
    left: Optional[str] = None
    right: Optional[str] = None
    request: Optional[str] = None
    supplier: Optional[str] = None


class StepOutput(BaseModel):
    """Ports de sortie : successeurs en cas de succès / erreur."""

    model_config = ConfigDict(extra="allow")

    success: List[str] = Field(default_factory=list)
    error: List[str] = Field(default_factory=list)
    output: List[str] = Field(default_factory=list)


class Step(BaseModel):
    """Étape générique du DAG SirenSpark."""

    model_config = ConfigDict(extra="forbid")

    id: str
    type: str
    options: StepOptions = Field(default_factory=StepOptions)
    input: Optional[StepInput] = None
    output: Optional[StepOutput] = None

    @field_validator("id")
    @classmethod
    def id_must_not_be_empty(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("L'identifiant d'étape ne peut pas être vide.")
        return stripped


class CsvReader(Step):
    type: Literal["CsvReader", "CSVReader", "csv_reader"] = "CsvReader"
    options: CsvReaderOptions


class ShapefileReader(Step):
    type: Literal["ShapefileReader", "shapefile_reader"] = "ShapefileReader"
    options: ShapefileReaderOptions


class FilterTransformer(Step):
    type: Literal["FilterTransformer", "attribute_filter", "filter"] = "FilterTransformer"
    options: FilterTransformerOptions


class ReprojectTransformer(Step):
    type: Literal["ReprojectTransformer", "Reprojector", "reproject", "reprojector"] = (
        "ReprojectTransformer"
    )
    options: ReprojectTransformerOptions


class SpatialJoiner(Step):
    type: Literal["SpatialJoiner", "Joiner", "spatial_join"] = "SpatialJoiner"
    options: SpatialJoinerOptions
    input: StepInput


class FileWriter(Step):
    type: Literal["FileWriter", "JSONFileWriter", "GeoJSONFileWriter", "ShapefileWriter", "file_writer"] = (
        "FileWriter"
    )
    options: FileWriterOptions


TypedStep = Union[
    CsvReader,
    ShapefileReader,
    FilterTransformer,
    ReprojectTransformer,
    SpatialJoiner,
    FileWriter,
]


class Properties(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    parameters: Dict[str, Any] = Field(default_factory=dict)


class Definition(BaseModel):
    """Modèle racine d'un projet SirenSpark compilé depuis le canvas 4GIx."""

    model_config = ConfigDict(extra="forbid")

    properties: Properties = Field(default_factory=Properties)
    trigger: Literal["creator"] = "creator"
    steps: List[Step] = Field(default_factory=list)

    def typed_steps(self) -> List[TypedStep]:
        """Valide chaque étape contre le schéma spécialisé (CsvReader, FileWriter, …)."""
        adapter = TypeAdapter(List[TypedStep])
        return adapter.validate_python([step.model_dump() for step in self.steps])

    def step_by_id(self, step_id: str) -> Optional[Step]:
        for step in self.steps:
            if step.id == step_id:
                return step
        return None
