"""Schéma Pydantic v2 du pipeline compilé (étapes ETL)."""

from __future__ import annotations

from typing import Annotated, Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, field_validator


class StepOptions(BaseModel):
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


class GpkgReaderOptions(StepOptions):
    filepath: str
    layer: Optional[str] = None


class GeoJsonReaderOptions(StepOptions):
    filepath: str


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
    model_config = ConfigDict(extra="allow")

    input: Optional[str] = None
    left: Optional[str] = None
    right: Optional[str] = None


class StepOutput(BaseModel):
    model_config = ConfigDict(extra="allow")

    success: List[str] = Field(default_factory=list)
    error: List[str] = Field(default_factory=list)
    output: List[str] = Field(default_factory=list)


class Step(BaseModel):
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
    type: Literal["CsvReader"]
    options: CsvReaderOptions


class ShapefileReader(Step):
    type: Literal["ShapefileReader"]
    options: ShapefileReaderOptions


class GpkgReader(Step):
    type: Literal["GpkgReader"]
    options: GpkgReaderOptions


class GeoJsonReader(Step):
    type: Literal["GeoJsonReader"]
    options: GeoJsonReaderOptions


class FilterTransformer(Step):
    type: Literal["FilterTransformer"]
    options: FilterTransformerOptions


class ReprojectTransformer(Step):
    type: Literal["ReprojectTransformer"]
    options: ReprojectTransformerOptions


class SpatialJoiner(Step):
    type: Literal["SpatialJoiner"]
    options: SpatialJoinerOptions


class FileWriter(Step):
    type: Literal["FileWriter"]
    options: FileWriterOptions


TypedStep = Annotated[
    Union[
        CsvReader,
        ShapefileReader,
        GpkgReader,
        GeoJsonReader,
        FilterTransformer,
        ReprojectTransformer,
        SpatialJoiner,
        FileWriter,
    ],
    Field(discriminator="type"),
]

_TYPED_STEPS_ADAPTER = TypeAdapter(List[TypedStep])


class Properties(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    parameters: Dict[str, Any] = Field(default_factory=dict)


class Definition(BaseModel):
    model_config = ConfigDict(extra="forbid")

    properties: Properties = Field(default_factory=Properties)
    trigger: Literal["creator"] = "creator"
    steps: List[Step] = Field(default_factory=list)

    def typed_steps(self) -> List[TypedStep]:
        return _TYPED_STEPS_ADAPTER.validate_python(
            [step.model_dump() for step in self.steps]
        )

