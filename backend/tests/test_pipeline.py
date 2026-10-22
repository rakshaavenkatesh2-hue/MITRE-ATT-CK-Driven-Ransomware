import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.feature_extraction import OperationRecord, extract_window_features
from app.model import EVALUATION_PATH, MODEL_PATH, load_or_train
from app.schemas import Telemetry
from app.synthetic import generate_dataset

client = TestClient(app)


def sample():
    return {
        "file_ops_per_min": 22,
        "write_ratio": 0.2,
        "rename_ratio": 0.02,
        "mean_entropy": 4.4,
        "distinct_files_modified": 8,
        "extension_change_ratio": 0.01,
        "process_count": 2,
        "burstiness": 0.1,
        "access_denied_count": 0,
        "suspicious_operation_count": 0,
    }


def test_synthetic_data_is_reproducible_and_balanced():
    x1, y1 = generate_dataset(samples_per_class=10)
    x2, y2 = generate_dataset(samples_per_class=10)
    assert x1.equals(x2)
    assert np.array_equal(y1, y2)
    assert set(np.bincount(y1)) == {10}


def test_feature_extraction_aggregates_safe_operation_metadata():
    records = [
        OperationRecord(elapsed_seconds=1, file_token="a", operation="modify",
                        process_label="editor", entropy=6.0, extension_changed=True),
        OperationRecord(elapsed_seconds=1.5, file_token="b", operation="rename",
                        process_label="editor", entropy=4.0),
        OperationRecord(elapsed_seconds=30, file_token="a", operation="write",
                        process_label="sync", entropy=7.0, access_denied=True,
                        suspicious_indicator=True),
    ]
    features = extract_window_features(records)
    assert features.file_ops_per_min == 3
    assert features.write_ratio == pytest.approx(2 / 3)
    assert features.rename_ratio == pytest.approx(1 / 3)
    assert features.distinct_files_modified == 2
    assert features.extension_change_ratio == pytest.approx(1 / 2)
    assert features.process_count == 2
    assert features.access_denied_count == 1
    assert features.suspicious_operation_count == 1


def test_feature_extraction_rejects_records_outside_window():
    record = OperationRecord(elapsed_seconds=60, file_token="a", operation="read",
                             process_label="test")
    with pytest.raises(ValueError):
        extract_window_features([record])


def test_telemetry_validation_rejects_out_of_range_and_extra_fields():
    with pytest.raises(ValueError):
        Telemetry(**{**sample(), "mean_entropy": 9})
    response = client.post("/api/predict", json={**sample(), "unknown": 1})
    assert response.status_code == 422


def test_prediction_and_metrics_contract():
    result = client.post("/api/predict", json=sample())
    assert result.status_code == 200
    data = result.json()
    assert data["label"] in {"normal", "suspicious", "high_risk"}
    assert 0 <= data["risk_score"] <= 100
    assert data["explanation"] and data["reasons"]
    metrics = client.get("/api/metrics")
    assert metrics.status_code == 200
    assert len(metrics.json()["confusion_matrix"]) == 3


def test_trained_model_is_saved_reloaded_and_predicts():
    assert MODEL_PATH.is_file()
    assert EVALUATION_PATH.is_file()
    model, evaluation = load_or_train()
    prediction = model.predict(np.asarray([Telemetry(**sample()).as_features()]))
    assert prediction[0] in (0, 1, 2)
    assert evaluation["selected_model"] in {"Random Forest", "Logistic Regression"}


def test_demo_only_emits_synthetic_events():
    client.post("/api/demo/reset")
    started = client.post("/api/demo/start")
    assert started.status_code == 200
    assert started.json()["status"] == "running"
    status = client.post("/api/demo/step").json()
    assert status["processed"] == 1
    assert all(event["simulated"] for event in status["events"])
    client.post("/api/demo/reset")
