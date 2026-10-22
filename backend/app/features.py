"""Feature contract shared by synthetic-data generation and API validation."""

FEATURES = [
    "file_ops_per_min",
    "write_ratio",
    "rename_ratio",
    "mean_entropy",
    "distinct_files_modified",
    "extension_change_ratio",
    "process_count",
    "burstiness",
    "access_denied_count",
    "suspicious_operation_count",
]

FEATURE_DESCRIPTIONS = {
    "file_ops_per_min": "File operations per minute; elevated legitimate workloads are possible.",
    "write_ratio": "Share of observed operations that are writes or modifications.",
    "rename_ratio": "Share of operations that are renames; bulk organization can look similar.",
    "mean_entropy": "Mean byte entropy estimate (0–8); compressed files can also be high entropy.",
    "distinct_files_modified": "Number of distinct files modified in the window; scale depends on telemetry scope.",
    "extension_change_ratio": "Share of modified files with an extension change; not proof of encryption.",
    "process_count": "Distinct process labels observed; broad monitoring increases this value.",
    "burstiness": "Concentration of operations in short bursts (0–1).",
    "access_denied_count": "Denied operations; often caused by ordinary permissions or software errors.",
    "suspicious_operation_count": "Count of heuristic operation indicators; source and quality matter.",
}

