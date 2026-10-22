"""Aggregate safe, structured operation metadata into one model telemetry window.

This adapter accepts metadata only; it never reads file contents or file paths.
"""
from collections import Counter

from pydantic import BaseModel, ConfigDict, Field

from .schemas import Telemetry


class OperationRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    elapsed_seconds: float = Field(ge=0)
    file_token: str = Field(min_length=1, max_length=128)
    operation: str = Field(pattern="^(read|write|modify|rename)$")
    process_label: str = Field(min_length=1, max_length=128)
    entropy: float | None = Field(default=None, ge=0, le=8)
    extension_changed: bool = False
    access_denied: bool = False
    suspicious_indicator: bool = False


def extract_window_features(records: list[OperationRecord], window_seconds: int = 60) -> Telemetry:
    """Calculate bounded telemetry from structured operation metadata for one time window."""
    if window_seconds <= 0:
        raise ValueError("window_seconds must be positive")
    if any(record.elapsed_seconds >= window_seconds for record in records):
        raise ValueError("record elapsed_seconds must be within the requested window")
    total = len(records)
    modifying = [record for record in records if record.operation in ("write", "modify")]
    extension_changed_files = {record.file_token for record in records if record.extension_changed}
    modified_files = {record.file_token for record in modifying}
    per_second = Counter(int(record.elapsed_seconds) for record in records)
    peak = max(per_second.values(), default=0)
    average = total / window_seconds
    burstiness = (peak - average) / peak if peak else 0.0
    entropies = [record.entropy for record in records if record.entropy is not None]
    return Telemetry(
        file_ops_per_min=total * 60 / window_seconds,
        write_ratio=len(modifying) / total if total else 0.0,
        rename_ratio=sum(record.operation == "rename" for record in records) / total if total else 0.0,
        mean_entropy=sum(entropies) / len(entropies) if entropies else 0.0,
        distinct_files_modified=len(modified_files),
        extension_change_ratio=len(extension_changed_files & modified_files) / len(modified_files)
        if modified_files else 0.0,
        process_count=len({record.process_label for record in records}),
        burstiness=burstiness,
        access_denied_count=sum(record.access_denied for record in records),
        suspicious_operation_count=sum(record.suspicious_indicator for record in records),
    )
