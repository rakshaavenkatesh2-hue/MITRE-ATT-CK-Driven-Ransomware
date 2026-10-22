const API = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000/api";

export type Risk = "normal" | "suspicious" | "high_risk";
export type Telemetry = {
  file_ops_per_min: number;
  write_ratio: number;
  rename_ratio: number;
  mean_entropy: number;
  distinct_files_modified: number;
  extension_change_ratio: number;
  process_count: number;
  burstiness: number;
  access_denied_count: number;
  suspicious_operation_count: number;
};
export type Event = {
  event_id: string;
  timestamp: string;
  process_label: string;
  activity_type: string;
  risk_level: Risk;
  risk_score: number;
  explanation: string;
  simulated: boolean;
  telemetry: Telemetry;
};
export type Prediction = {
  label: Risk;
  risk_score: number;
  probabilities: Record<Risk, number>;
  explanation: { feature: string; observed_value: number; importance: number; note: string }[];
  reasons: string[];
  investigation_steps: string[];
  mitre_mappings: string[];
  disclaimer: string;
};
export type Evaluation = {
  selected_model: string;
  metrics: Record<string, number>;
  confusion_matrix: number[][];
  classes: string[];
  feature_importance: { feature: string; importance: number; description: string }[];
  comparison: Record<string, Record<string, number>>;
  dataset: Record<string, string | number>;
  limitations: string[];
};
export type Demo = { status: "idle" | "running" | "paused" | "completed"; total: number; processed: number; events: Event[] };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new Error("Cannot reach the local API. Start the backend at http://127.0.0.1:8000.");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail ?? `API request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  health: () => request<{ status: string }>("/health"),
  events: () => request<Event[]>("/events?limit=100"),
  metrics: () => request<Evaluation>("/metrics"),
  predict: (telemetry: Telemetry) => request<Prediction>("/predict", { method: "POST", body: JSON.stringify(telemetry) }),
  demo: (action: "start" | "step" | "pause" | "resume" | "reset" | "status") =>
    request<Demo>(`/demo/${action === "status" ? "status" : action}`, action === "status" ? undefined : { method: "POST" }),
};
