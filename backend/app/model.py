"""Train, evaluate and persist the local synthetic-data baseline."""
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from .features import FEATURES, FEATURE_DESCRIPTIONS
from .synthetic import LABELS, SEED, generate_dataset

ARTIFACT_DIR = Path(__file__).resolve().parents[1] / "artifacts"
MODEL_PATH = ARTIFACT_DIR / "classifier.joblib"
EVALUATION_PATH = ARTIFACT_DIR / "evaluation.joblib"


def train_and_evaluate() -> tuple[object, dict]:
    x, y = generate_dataset()
    x_train, x_test, y_train, y_test = train_test_split(
        x, y, test_size=0.25, random_state=SEED, stratify=y
    )

    def create_models():
        return {
            "Random Forest": RandomForestClassifier(
                n_estimators=160, max_depth=12, min_samples_leaf=2,
                class_weight="balanced", random_state=SEED, n_jobs=1,
            ),
            "Logistic Regression": make_pipeline(
                StandardScaler(),
                LogisticRegression(max_iter=1500, class_weight="balanced", random_state=SEED),
            ),
        }

    x_fit, x_validation, y_fit, y_validation = train_test_split(
        x_train, y_train, test_size=0.2, random_state=SEED + 1, stratify=y_train
    )
    validation_scores = {}
    for name, estimator in create_models().items():
        estimator.fit(x_fit, y_fit)
        validation_scores[name] = f1_score(
            y_validation, estimator.predict(x_validation), average="macro", zero_division=0
        )
    selected = max(validation_scores, key=validation_scores.get)

    models = create_models()
    outcomes = {}
    matrices = {}
    for name, estimator in models.items():
        estimator.fit(x_train, y_train)
        pred = estimator.predict(x_test)
        matrix = confusion_matrix(y_test, pred, labels=[0, 1, 2])
        matrices[name] = matrix
        per_class = []
        for class_index in range(3):
            true_positive = int(matrix[class_index, class_index])
            false_positive = int(matrix[:, class_index].sum() - true_positive)
            false_negative = int(matrix[class_index, :].sum() - true_positive)
            denom = true_positive + false_positive
            per_class.append({
                "precision": true_positive / denom if denom else 0.0,
                "recall": true_positive / (true_positive + false_negative)
                if true_positive + false_negative else 0.0,
                "f1": 2 * true_positive / (2 * true_positive + false_positive + false_negative)
                if 2 * true_positive + false_positive + false_negative else 0.0,
            })
        normal_false_positive = int(matrix[0, 1:].sum())
        outcomes[name] = {
            "accuracy": float(accuracy_score(y_test, pred)),
            "macro_precision": float(precision_score(y_test, pred, average="macro", zero_division=0)),
            "macro_recall": float(recall_score(y_test, pred, average="macro", zero_division=0)),
            "macro_f1": float(f1_score(y_test, pred, average="macro", zero_division=0)),
            "normal_false_positive_rate": normal_false_positive / int(matrix[0, :].sum()),
            "per_class": per_class,
        }
    estimator = models[selected]
    matrix = matrices[selected]
    if selected == "Random Forest":
        importances = estimator.feature_importances_
    else:
        importances = np.mean(np.abs(estimator[-1].coef_), axis=0)
        importances = importances / importances.sum()
    evaluation = {
        "selected_model": selected,
        "metrics": {key: value for key, value in outcomes[selected].items() if key != "per_class"},
        "confusion_matrix": matrix.tolist(),
        "classes": [LABELS[idx] for idx in range(3)],
        "feature_importance": [
            {"feature": name, "importance": float(importance),
             "description": FEATURE_DESCRIPTIONS[name]}
            for name, importance in sorted(
                zip(FEATURES, importances), key=lambda pair: pair[1], reverse=True
            )
        ],
        "comparison": {
            name: {key: value for key, value in scores.items() if key != "per_class"}
            for name, scores in outcomes.items()
        },
        "dataset": {
            "source": "Reproducible synthetic telemetry; generated in this project",
            "seed": SEED,
            "samples": int(len(y)),
            "samples_per_class": int(len(y) // 3),
            "test_fraction": 0.25,
        },
        "limitations": [
            "Metrics measure separation in this synthetic generator, not real-world detection performance.",
            "Feature distributions intentionally overlap and do not encode a single-feature rule.",
            "Feature values depend on monitoring scope, process mix, and benign workload.",
            "No calibrated real-world prevalence, endpoint dataset, or temporal validation is included.",
        ],
    }
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    dataset = x.copy()
    dataset["label"] = [LABELS[int(label)] for label in y]
    dataset.to_csv(ARTIFACT_DIR / "synthetic_telemetry.csv", index=False)
    joblib.dump(estimator, MODEL_PATH)
    joblib.dump(evaluation, EVALUATION_PATH)
    return estimator, evaluation


def load_or_train() -> tuple[object, dict]:
    if MODEL_PATH.exists() and EVALUATION_PATH.exists():
        return joblib.load(MODEL_PATH), joblib.load(EVALUATION_PATH)
    return train_and_evaluate()
