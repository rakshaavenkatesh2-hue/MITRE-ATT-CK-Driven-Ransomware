"""Reproducible, transparent synthetic telemetry. Not representative of real victims."""
import numpy as np
import pandas as pd

from .features import FEATURES

SEED = 42
LABELS = {0: "normal", 1: "suspicious", 2: "high_risk"}


def generate_dataset(samples_per_class: int = 500, seed: int = SEED) -> tuple[pd.DataFrame, np.ndarray]:
    if samples_per_class < 10:
        raise ValueError("samples_per_class must be at least 10")
    rng = np.random.default_rng(seed)
    groups = []
    labels = []
    profiles = [
        # Central tendencies and spreads are chosen to overlap; no single feature defines a class.
        ([28, .24, .04, 4.5, 8, .01, 3, .14, 1, 0],
         [14, .14, .04, .8, 6, .02, 2, .10, 2, 1]),
        ([95, .52, .18, 5.3, 38, .12, 5, .48, 3, 2],
         [35, .18, .10, .9, 22, .12, 3, .18, 4, 2]),
        ([260, .82, .38, 7.1, 130, .72, 7, .84, 8, 9],
         [75, .12, .16, .55, 45, .18, 3, .10, 8, 4]),
    ]
    for label, (means, stds) in enumerate(profiles):
        rows = rng.normal(means, stds, size=(samples_per_class, len(FEATURES)))
        rows[:, 0] = np.clip(rows[:, 0], 0, 100_000)
        for idx in (1, 2, 5, 7):
            rows[:, idx] = np.clip(rows[:, idx], 0, 1)
        rows[:, 3] = np.clip(rows[:, 3], 0, 8)
        for idx, maximum in ((4, 1_000_000), (6, 10_000), (8, 1_000_000), (9, 1_000_000)):
            rows[:, idx] = np.clip(np.rint(rows[:, idx]), 0, maximum)
        groups.append(rows)
        labels.extend([label] * samples_per_class)
    return pd.DataFrame(np.vstack(groups), columns=FEATURES), np.asarray(labels, dtype=int)

