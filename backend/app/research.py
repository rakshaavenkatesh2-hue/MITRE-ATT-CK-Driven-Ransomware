"""Extension point for verified MTT/CK research rules; intentionally not an implementation."""


class ProposedMttCkDetector:
    """Placeholder only: supply verified papers and rules before implementing this component."""

    def predict(self, telemetry: dict) -> None:
        raise NotImplementedError(
            "MTT/CK rules are unverified. The baseline ML classifier runs independently."
        )

