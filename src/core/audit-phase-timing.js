import { performance } from "node:perf_hooks";

export const AUDIT_PROFILE_PHASES = Object.freeze([
  "traversal-and-text-read",
  "project-and-build-ownership",
  "source-discovery-and-index",
  "test-parsing-and-index",
  "evidence-classification-and-artifact"
]);

export function startAuditPhase(onPhaseTiming) {
  return typeof onPhaseTiming === "function" ? performance.now() : undefined;
}

export function finishAuditPhase(onPhaseTiming, adapterId, phase, startedAt) {
  if (startedAt === undefined) return;
  onPhaseTiming({
    adapterId,
    phase,
    durationMs: performance.now() - startedAt
  });
}
