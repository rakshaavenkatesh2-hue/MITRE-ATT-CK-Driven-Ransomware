from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .features import FEATURES


class Telemetry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    file_ops_per_min: float = Field(ge=0, le=100_000)
    write_ratio: float = Field(ge=0, le=1)
    rename_ratio: float = Field(ge=0, le=1)
    mean_entropy: float = Field(ge=0, le=8)
    distinct_files_modified: int = Field(ge=0, le=1_000_000)
    extension_change_ratio: float = Field(ge=0, le=1)
    process_count: int = Field(ge=0, le=10_000)
    burstiness: float = Field(ge=0, le=1)
    access_denied_count: int = Field(ge=0, le=1_000_000)
    suspicious_operation_count: int = Field(ge=0, le=1_000_000)

    def as_features(self) -> list[float]:
        return [float(getattr(self, name)) for name in FEATURES]


class FeatureExplanation(BaseModel):
    feature: str
    observed_value: float
    importance: float
    note: str


class PredictionResponse(BaseModel):
    label: Literal["normal", "suspicious", "high_risk"]
    risk_score: int = Field(ge=0, le=100)
    probabilities: dict[str, float]
    explanation: list[FeatureExplanation]
    reasons: list[str]
    investigation_steps: list[str]
    mitre_mappings: list[str]
    disclaimer: str


class DetectionEvent(BaseModel):
    event_id: str
    timestamp: datetime
    process_label: str
    activity_type: str
    risk_level: Literal["normal", "suspicious", "high_risk"]
    risk_score: int
    explanation: str
    simulated: bool = True
    telemetry: Telemetry


class EvaluationResponse(BaseModel):
    selected_model: str
    metrics: dict[str, float]
    confusion_matrix: list[list[int]]
    classes: list[str]
    feature_importance: list[dict[str, float | str]]
    comparison: dict[str, dict[str, float]]
    dataset: dict[str, str | int]
    limitations: list[str]


class SimulationStatus(BaseModel):
    status: Literal["idle", "running", "paused", "completed"]
    total: int
    processed: int
    events: list[DetectionEvent]

