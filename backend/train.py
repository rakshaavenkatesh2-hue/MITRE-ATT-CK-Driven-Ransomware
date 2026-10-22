"""Generate reproducible synthetic records and train/evaluate the baseline."""
import json

from app.model import EVALUATION_PATH, train_and_evaluate


if __name__ == "__main__":
    _, evaluation = train_and_evaluate()
    print(json.dumps(evaluation, indent=2))
    print(f"\nModel and evaluation saved under: {EVALUATION_PATH.parent}")
