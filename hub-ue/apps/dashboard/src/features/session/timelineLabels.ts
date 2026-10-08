import type { ExperiencePhase } from "../../domain/experienceRun";
import type { SessionTimelineKind } from "../../domain/markers";

const KIND_LABEL: Record<SessionTimelineKind, string> = {
  marker: "Marker",
  state: "Estado",
  biometric: "Biometria",
  lifecycle: "Lifecycle",
  sensor: "Sensor",
};

const PHASE_LABEL: Record<ExperiencePhase, string> = {
  running: "em execução",
  paused: "em pausa",
};

export function timelineKindLabel(kind: SessionTimelineKind): string {
  return KIND_LABEL[kind];
}

export function experiencePhaseLabel(phase: ExperiencePhase): string {
  return PHASE_LABEL[phase];
}
