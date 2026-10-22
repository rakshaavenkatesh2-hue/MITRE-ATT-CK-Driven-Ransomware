import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "./App";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("dashboard", () => {
  it("navigates to telemetry analysis and renders the API prediction", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      let body: object = [];
      if (url.endsWith("/health")) body = { status: "ok" };
      else if (url.endsWith("/demo/status")) body = { status: "idle", total: 0, processed: 0, events: [] };
      else if (url.includes("/metrics")) {
        body = { selected_model: "Random Forest", metrics: {}, confusion_matrix: [], classes: [], feature_importance: [], comparison: {}, dataset: {}, limitations: [] };
      } else if (url.includes("/predict")) {
        body = {
          label: "high_risk",
          risk_score: 86,
          probabilities: { normal: 0.02, suspicious: 0.1, high_risk: 0.88 },
          explanation: [{ feature: "write_ratio", observed_value: 0.8, importance: 0.2, note: "Synthetic feature." }],
          reasons: ["Multiple synthetic indicators coincide."],
          investigation_steps: ["Review the synthetic process label."],
          mitre_mappings: ["No technique mapping supported by the current telemetry."],
          disclaimer: "Synthetic telemetry baseline only.",
        };
      }
      return { ok: true, json: async () => body } as Response;
    }));
    render(<App />);
    expect(await screen.findByText(/No events yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Detection lab/ }));
    expect(screen.getByRole("heading", { name: "Detection lab" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Analyse telemetry/ }));
    expect(await screen.findByText(/high risk/i)).toBeInTheDocument();
    expect(screen.getByText("Multiple synthetic indicators coincide.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Local API connected")).toBeInTheDocument());
  });
});
