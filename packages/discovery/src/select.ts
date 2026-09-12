import type { InspectionResult, ProjectConfig, RunDiagnostic, TargetCandidate } from "@dsrd/contracts";
export type TargetSelection = { status: "selected"; candidate: TargetCandidate } | { status: "needs_configuration" | "unsupported_target"; diagnostics: RunDiagnostic[] };
export function selectTarget(inspection: InspectionResult, selection: { targetId?: string; config?: ProjectConfig }): TargetSelection {
  const id = selection.targetId ?? selection.config?.target.id;
  if (id) { const candidate = inspection.candidates.find((value) => value.id === id); return candidate ? { status: "selected", candidate } : { status: "needs_configuration", diagnostics: [{ code: "unknown_target", message: `target not found: ${id}`, path: ["target"] }] }; }
  if (inspection.candidates.length === 1) return { status: "selected", candidate: inspection.candidates[0] };
  return { status: "needs_configuration", diagnostics: [{ code: "target_selection_required", message: inspection.candidates.length === 0 ? "no supported target found" : "multiple targets require explicit selection", path: ["target"] }] };
}
