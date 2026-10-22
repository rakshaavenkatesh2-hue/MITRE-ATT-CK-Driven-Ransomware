from datetime import datetime, timezone
import uuid

import numpy as np
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .features import FEATURES
from .model import load_or_train
from .schemas import DetectionEvent, EvaluationResponse, PredictionResponse, SimulationStatus, Telemetry
from .synthetic import LABELS, SEED, generate_dataset

MODEL, EVALUATION = load_or_train()
app = FastAPI(title="Synthetic Ransomware Behaviour Detection API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
events: list[DetectionEvent] = []
demo = {"status": "idle", "records": [], "processed": 0, "total": 0}


def classify(telemetry: Telemetry) -> PredictionResponse:
    vector = np.asarray([telemetry.as_features()], dtype=float)
    probabilities_raw = MODEL.predict_proba(vector)[0]
    probabilities = {LABELS[int(label)]: float(probability)
                     for label, probability in zip(MODEL.classes_, probabilities_raw)}
    label_index = int(np.argmax(probabilities_raw))
    label = LABELS[label_index]
    risk_score = round(55 * probabilities.get("suspicious", 0) + 100 * probabilities.get("high_risk", 0))
    importance_rows = EVALUATION["feature_importance"]
    explanation = [
        {
            "feature": row["feature"],
            "observed_value": float(getattr(telemetry, row["feature"])),
            "importance": float(row["importance"]),
            "note": row["description"],
        }
        for row in importance_rows[:4]
    ]
    reasons = []
    if telemetry.file_ops_per_min > 70 and telemetry.write_ratio > 0.45:
        reasons.append("Elevated file-operation volume coincides with a high write/modification share.")
    if telemetry.extension_change_ratio > 0.25 and telemetry.mean_entropy > 6:
        reasons.append("Extension changes and high mean entropy co-occur; compression and other benign causes remain possible.")
    if telemetry.burstiness > 0.65 and telemetry.distinct_files_modified > 50:
        reasons.append("A burst of operations affected many distinct files in this telemetry window.")
    if telemetry.suspicious_operation_count >= 4 or telemetry.access_denied_count >= 10:
        reasons.append("Additional suspicious-operation or access-denied indicators were observed.")
    if not reasons:
        reasons.append("No strong multi-feature indicator combination was present; this is a probabilistic baseline assessment.")
    investigation_steps = [
        "Verify the process label, parent process, user, and expected business purpose with the system owner.",
        "Correlate this window with trusted endpoint and application logs before taking action.",
        "If independently confirmed, follow your organization's containment and recovery procedures.",
    ]
    mitre = []
    if telemetry.extension_change_ratio > 0.25 and telemetry.mean_entropy > 6:
        mitre.append("T1486 — Data Encrypted for Impact (heuristic indicator only; not proof of encryption)")
    if not mitre:
        mitre.append("No technique mapping supported by the current telemetry.")
    return PredictionResponse(
        label=label,
        risk_score=max(0, min(100, risk_score)),
        probabilities=probabilities,
        explanation=explanation,
        reasons=reasons,
        investigation_steps=investigation_steps,
        mitre_mappings=mitre,
        disclaimer="Synthetic telemetry baseline only. A prediction is not proof of infection.",
    )


def make_event(telemetry: Telemetry, process_label: str, activity_type: str = "file activity") -> DetectionEvent:
    result = classify(telemetry)
    event = DetectionEvent(
        event_id=str(uuid.uuid4()),
        timestamp=datetime.now(timezone.utc),
        process_label=process_label,
        activity_type=activity_type,
        risk_level=result.label,
        risk_score=result.risk_score,
        explanation=" ".join(result.reasons),
        simulated=True,
        telemetry=telemetry,
    )
    events.insert(0, event)
    del events[200:]
    return event


@app.get("/api/health")
def health():
    return {"status": "ok", "model_loaded": MODEL is not None, "telemetry": "synthetic"}


@app.post("/api/predict", response_model=PredictionResponse)
def predict(telemetry: Telemetry):
    try:
        result = classify(telemetry)
        make_event(telemetry, "manual-telemetry", "manual analysis")
        return result
    except (ValueError, KeyError) as exc:
        raise HTTPException(status_code=422, detail=f"Telemetry could not be analysed: {exc}") from exc


@app.get("/api/metrics", response_model=EvaluationResponse)
def metrics():
    return EVALUATION


@app.get("/api/events", response_model=list[DetectionEvent])
def get_events(
    limit: int = Query(default=50, ge=1, le=200),
    risk: str | None = Query(default=None, pattern="^(normal|suspicious|high_risk)$"),
):
    selected = events if risk is None else [event for event in events if event.risk_level == risk]
    return selected[:limit]


@app.post("/api/demo/start", response_model=SimulationStatus)
def start_demo():
    if demo["status"] == "running":
        return demo_status()
    frame, labels = generate_dataset(samples_per_class=30, seed=SEED + 1)
    rng = np.random.default_rng(SEED + 2)
    selected = []
    # Present a mixed, reproducible sequence while ensuring all three scenarios appear.
    label_order = [0, 0, 1, 0, 2, 1, 0, 2, 0, 1, 2, 0, 1, 0, 2, 1, 0, 2, 0, 1]
    for label in label_order:
        candidates = np.flatnonzero(labels == label)
        values = frame.iloc[int(rng.choice(candidates))]
        selected.append(Telemetry(**{name: float(values[name]) for name in FEATURES}))
    demo.update({"status": "running", "records": selected, "processed": 0, "total": len(selected)})
    return demo_status()


@app.post("/api/demo/step", response_model=SimulationStatus)
def step_demo():
    if demo["status"] not in ("running",):
        raise HTTPException(status_code=409, detail="Simulation is not running.")
    if demo["processed"] < demo["total"]:
        index = demo["processed"]
        telemetry = demo["records"][index]
        make_event(telemetry, f"sim-process-{index + 1:02d}", "simulated file-operation window")
        demo["processed"] += 1
    if demo["processed"] >= demo["total"]:
        demo["status"] = "completed"
    return demo_status()


@app.post("/api/demo/pause", response_model=SimulationStatus)
def pause_demo():
    if demo["status"] == "running":
        demo["status"] = "paused"
    return demo_status()


@app.post("/api/demo/resume", response_model=SimulationStatus)
def resume_demo():
    if demo["status"] == "paused":
        demo["status"] = "running"
    return demo_status()


@app.post("/api/demo/reset", response_model=SimulationStatus)
def reset_demo():
    demo.update({"status": "idle", "records": [], "processed": 0, "total": 0})
    return demo_status()


@app.get("/api/demo/status", response_model=SimulationStatus)
def get_demo_status():
    return demo_status()


def demo_status() -> dict:
    demo_events = [event for event in events if event.process_label.startswith("sim-process-")]
    latest = demo_events[:demo["processed"]]
    return {
        "status": demo["status"],
        "total": demo["total"],
        "processed": demo["processed"],
        "events": latest,
    }
