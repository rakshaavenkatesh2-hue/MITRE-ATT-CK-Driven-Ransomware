# Synthetic Ransomware Behaviour Detection Prototype

A local, defensive research prototype for analysing **synthetic file-system and process telemetry**. It includes a scikit-learn baseline, FastAPI contracts, and a React dashboard for inspection and safe simulation. It does not monitor endpoints or touch user files.

> A classification is a probabilistic indicator for human review, not evidence that a device is infected. All built-in examples and live-simulation records are synthetic.

## Architecture

```text
React + TypeScript dashboard (frontend/)
             │ HTTP / JSON
             ▼
FastAPI validation + API contracts (backend/app/main.py, schemas.py)
             │
     ┌───────┴─────────────┐
     ▼                     ▼
Classification        In-memory event store
Random Forest /       synthetic demo and
Logistic Regression   submitted observations
     │
     ▼
Reproducible synthetic data → stratified holdout metrics → local joblib artifacts
```

Responsibilities are deliberately separated: `model.py` handles the baseline classifier and its evaluation; `features.py` defines the telemetry feature contract; `feature_extraction.py` aggregates structured operation metadata into a bounded telemetry window without reading paths or content; the prediction endpoint supplies a distinct risk score and alert guidance; event presentation belongs to the API/frontend. The synthetic training generator creates labeled feature-level windows with documented distributions; it does not claim that those samples were collected from raw file events. Behavioural anomaly detection and log analysis are **not implemented** and can be integrated behind separate modules later.

## Prerequisites

- Python 3.12 (64-bit recommended for the listed scientific-package wheels)
- Node.js 18+ and npm
- PowerShell on Windows

Python 3.15 was present in the inspection environment, but installing pandas attempted a source build and stopped because Visual Studio build tools were unavailable. Use Python 3.12 for this setup unless the scientific-package wheels for a newer interpreter are confirmed available.

## Windows PowerShell setup

Open two VS Code terminals from the project root.

### Terminal 1 — backend

```powershell
cd .\backend
py -3.12 -m venv .venv312
.\.venv312\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
python train.py
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The first training command writes the locally generated model, evaluation, and labeled `synthetic_telemetry.csv` to `backend/artifacts/`. The API also trains on first startup if the model/evaluation artifacts are absent. The generated artifacts are reproducible from seed 42 and are not source-controlled requirements.

If PowerShell blocks activation, run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` in that terminal, then activate the environment.

### Terminal 2 — frontend

```powershell
cd .\frontend
npm install
Copy-Item .env.example .env
npm run dev
```

Open the URL Vite prints (normally `http://127.0.0.1:5173`). Set `VITE_API_URL` in `frontend/.env` to change the API base URL. The local API allows the default Vite localhost origins.

### Checks

```powershell
# Backend, from backend/ with its virtual environment active
pytest

# Frontend, from frontend/
npm run build
npm test
```

Interactive API documentation is available at `http://127.0.0.1:8000/docs`.

## Demonstration

1. Start the backend and frontend using the commands above.
2. Open **Detection lab** and choose **Load normal example**, then **Analyse telemetry**.
3. Load the **suspicious example** and analyse it to compare the risk assessment, class probabilities, and contributing features.
4. Open **Live simulation** and start the stream. It emits deterministic synthetic feature windows to the same model, one window at a time. Pause, resume, or reset it at any time.
5. View recorded API-session observations under **Event investigation**. They are held in memory and cleared when the backend restarts.

The synthetic stream does not read, create, rename, encrypt, or delete files.

## Model, labels, and metrics

`backend/app/synthetic.py` generates balanced, seeded normal, suspicious, and high-risk feature distributions with intentional overlap. A stratified train/test split is made first; model selection uses a separate stratified validation split from the training partition. The selected estimator is refit on the full training partition, and both candidate models are scored on the untouched test partition for comparison. A Random Forest is compared with scaled Logistic Regression, and the higher validation macro-F1 model is selected. The backend reports precision, recall, F1, accuracy, normal-class false-positive rate, and a 3×3 confusion matrix calculated from the held-out synthetic test records. It reports the calculated values, not hand-entered performance claims.

Synthetic test metrics describe this generator only. They must not be presented as real-world ransomware detection results. The model has no externally validated dataset, real prevalence estimate, temporal split, or field calibration. Feature importance is global model importance, not a causal account of a single prediction. Per-event explanations also display observations and heuristic reason combinations; neither is a proof of malicious activity.

### Feature contract

The accepted API fields and bounds are specified in `backend/app/schemas.py`; the ordered model vector is in `backend/app/features.py`. `backend/app/feature_extraction.py` documents the separate metadata aggregation adapter, suitable for a future authorized telemetry provider. Extension-change share is calculated over distinct modified file tokens.

| Feature | Interpretation and caveat |
|---|---|
| File operations/minute | Depends on the observation window and workload. |
| Write/modification share | Ordinary software can perform many writes. |
| Rename share | Bulk organization and installers can rename many files. |
| Mean entropy, 0–8 | Compression, encryption, and file type affect entropy. |
| Distinct modified files | Depends on monitoring scope and workload size. |
| Extension-change share | Renaming can be benign and does not prove encryption. |
| Process count | Depends on telemetry scope and process attribution. |
| Burstiness, 0–1 | Batch jobs and sync clients can naturally create bursts. |
| Access-denied count | Often reflects ordinary permissions or errors. |
| Suspicious-operation count | A future upstream heuristic; quality and provenance are important. |

No individual feature is treated as definitive evidence.

## Stable API / event schema

All routes are prefixed with `/api`. JSON request/response schemas are validated with Pydantic.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | API/model readiness and telemetry mode |
| POST | `/predict` | Validate telemetry, predict class/risk, return reasons and add a session event |
| GET | `/metrics` | Actual held-out evaluation, comparison, confusion matrix, and importance |
| GET | `/events?limit=50&risk=normal` | Recent in-memory records, optionally filtered by risk |
| POST | `/demo/start` | Start deterministic safe synthetic stream |
| POST | `/demo/step` | Process one synthetic window while running |
| POST | `/demo/pause`, `/demo/resume`, `/demo/reset` | Control or clear the in-memory demo |
| GET | `/demo/status` | Read simulation state and generated events |

`Telemetry` is the stable feature input: numeric, bounded, and rejects unknown keys. `DetectionEvent` includes `event_id`, UTC timestamp, process label, activity type, predicted risk level and score, explanation, `simulated` marker, and the observed telemetry. A teammate can add separate log-analysis or anomaly outputs as distinct fields/services without conflating them with the classifier. Do not send raw file contents or execute submitted files.

## MTT / CK research status

`backend/app/research.py` is an explicit **placeholder**, not an implementation. The names, definitions, and source papers for MTT and CK have not been verified; this project does not expand those names or claim Random Forest reproduces them. When the references are supplied, implement their verified mathematical rules as an independent detector with its own tests and compare it against this working baseline. The current classifier remains usable without that research component.

## Security and remaining limitations

- Local-only prototype; no endpoint agent, persistence, authentication, or production hardening.
- The event store and simulation state are in-memory and reset on backend restart.
- Synthetic distributions are illustrative, not trained on real victim data or an operational dataset.
- ATT&CK references are heuristic context only; telemetry does not establish that a technique occurred.
- Risk score is a simple probability-weighted presentation score, not a calibrated probability of compromise.
- Real endpoint monitoring would require explicit authorization, privacy review, and a separate safe design.
