import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { buildMarkerAnnotation, buildMarkerArguments, COMMAND_TOPICS, createMarkerId } from "../domain/api";
import { commandRecipients } from "../domain/commandHistory";
import { isRunBoundaryEvent, resetExperienceRun } from "../domain/experienceRun";
import type { ExperienceRunState } from "../domain/experienceRun";
import {
  buildPersistedExperienceSession,
  clearExperienceSession,
  loadExperienceSession,
  saveExperienceSession,
} from "../domain/experiencePersistence";
import { deriveReadiness, requiredActions } from "../domain/hubStatus";
import { latestExperienceMarker } from "../domain/markers";
import { deriveManagedSensors, sensorPublishTopics } from "../domain/sensorManager";
import { deriveSensorDataStream, deriveSensorTelemetrySummaries, serializeSensorDataStreamJson } from "../domain/sensorTelemetry";
import { deriveSessionState } from "../domain/sessionState";
import { createDemoSubjectProfile, isDemoSubjectProfile } from "../domain/subjectProfile";
import {
  DEMO_EXPERIENCES,
  EXPERIENCES_STORAGE_KEY,
  SURVEYS_STORAGE_KEY,
  createSampleSurveyRecords,
  deleteSurveyRecord,
  isSampleSurveyRecord,
  loadExperiences,
  loadSurveyRecords,
  saveExperiences,
  saveSurveyRecords,
  seedDemoSurveyData,
  stripDemoSurveyData,
  upsertSurveyRecord,
} from "../domain/surveys";
import type { SubjectSurveyRecord } from "../domain/surveys";
import { TOPICS } from "../domain/topics";
import type { StatusResponse, StreamEvent } from "../domain/types";
import { downloadTextFile, fileTimestamp } from "../lib/download";
import { browserStorage } from "../lib/storage";
import { useLatestRef } from "../lib/useLatestRef";
import { useCommandDispatch } from "./hooks/useCommandDispatch";
import { useExperienceLifecycle } from "./hooks/useExperienceLifecycle";
import type { ExperienceLifecycle } from "./hooks/useExperienceLifecycle";
import { useHubSettings } from "./hooks/useHubSettings";
import { useHubSocket } from "./hooks/useHubSocket";
import { useHubStatus } from "./hooks/useHubStatus";
import { useSessionSetup } from "./hooks/useSessionSetup";
import { useStreamBuffer } from "./hooks/useStreamBuffer";
import { useToasts } from "./hooks/useToasts";

/** Telemetria de alta frequência: entra na interface agrupada por frame. */
const HIGH_FREQUENCY_TOPICS = new Set(["hrv.raw", "sensor.preview", "unreal.state"]);
const KNOWN_TOPICS = new Set<string>(TOPICS);
const SENSOR_STREAM_ROW_LIMIT = 200;
const PERSISTENCE_DEBOUNCE_MS = 250;

export type MarkerDelivery = "command" | "annotation" | "failed";
export type HubOperatingMode = "demo" | "real" | "unknown";

function detectHubOperatingMode(
  sessionId: string | undefined,
  status: StatusResponse | null,
): HubOperatingMode {
  if (!sessionId) {
    return "unknown";
  }
  if (sessionId.startsWith("session-real")) {
    return "real";
  }
  if (sessionId.startsWith("session-demo")) {
    return "demo";
  }
  if (status?.sensorManager?.sensors.some((sensor) => sensor.source === "simulator")) {
    return "demo";
  }
  return "unknown";
}

/**
 * Compõe o estado do dashboard: configuração, retrato do hub, stream ao vivo,
 * lifecycle da experiência e comandos. As telas recebem fatias deste objeto.
 */
export function useDashboard() {
  const settings = useHubSettings();
  const setup = useSessionSetup();
  const { toasts, notify, dismiss: dismissToast } = useToasts();
  const [surveyRecords, setSurveyRecords] = useState<SubjectSurveyRecord[]>(() => {
    return loadSurveyRecords(browserStorage);
  });
  const [experiences, setExperiences] = useState<string[]>(() => {
    return loadExperiences(browserStorage);
  });
  const lastHandledModeKeyRef = useRef<string | null>(null);
  const lastOperatingModeRef = useRef<HubOperatingMode>("unknown");
  const subjectRef = useLatestRef(setup.subject);
  const surveyRecordsRef = useLatestRef(surveyRecords);
  const experiencesRef = useLatestRef(experiences);
  const [restoredSession] = useState(() => loadExperienceSession(browserStorage));
  const runRef = useRef<ExperienceRunState>(restoredSession?.experienceRun ?? resetExperienceRun());
  // O socket e o polling nascem antes do lifecycle; os callbacks o alcançam por esta ref.
  const lifecycleRef = useRef<ExperienceLifecycle | null>(null);

  const stream = useStreamBuffer(restoredSession?.experienceEvents ?? []);
  const hub = useHubStatus(settings.endpoint, (nextStatus) => lifecycleRef.current?.reconcileWithStatus(nextStatus));

  const handleStreamEvent = (event: StreamEvent) => {
    const isHighFrequency = HIGH_FREQUENCY_TOPICS.has(event.envelope.topic ?? "");
    if (!isHighFrequency) {
      stream.pushNow(event);
    }
    const outcome = lifecycleRef.current?.handleStreamEvent(event) ?? { consumed: false, capture: false };
    if (outcome.consumed) {
      return;
    }
    const run = runRef.current;
    const belongsToExperience =
      outcome.capture || run.status === "running" || run.status === "paused" || isRunBoundaryEvent(event, run);
    if (isHighFrequency) {
      stream.queue(event, belongsToExperience);
    } else if (belongsToExperience) {
      stream.capture(event);
    }
  };

  const socket = useHubSocket(settings.endpoint, settings.token, {
    onEvent: handleStreamEvent,
    onDisconnect: () => lifecycleRef.current?.handleDisconnect(),
    onDispose: stream.discardQueued,
  });

  const { events, experienceEvents } = stream;
  const { health, status } = hub;
  const clients = useMemo(() => status?.clients ?? [], [status]);
  const sessionEvents = useMemo(
    () => [...events, ...experienceEvents].sort((left, right) => Date.parse(right.receivedAt) - Date.parse(left.receivedAt)),
    [events, experienceEvents],
  );
  const sessionState = useMemo(() => deriveSessionState(sessionEvents), [sessionEvents]);
  const sensorSummaries = useMemo(() => deriveSensorTelemetrySummaries(clients, events), [clients, events]);
  const managedSensors = useMemo(() => deriveManagedSensors(status, events), [events, status]);
  const sensorDataStream = useMemo(
    () => deriveSensorDataStream(clients, events, SENSOR_STREAM_ROW_LIMIT, managedSensors),
    [clients, events, managedSensors],
  );
  const readiness = useMemo(() => deriveReadiness(health, status), [health, status]);
  const actions = useMemo(() => requiredActions(health, status), [health, status]);
  const latestMarker = useMemo(() => latestExperienceMarker(sessionEvents), [sessionEvents]);

  const commands = useCommandDispatch({
    endpoint: settings.endpoint,
    token: settings.token,
    status,
    runRef,
    initialHistory: restoredSession?.commandHistory ?? [],
    initialOperationalHistory: restoredSession?.operationalCommandHistory ?? restoredSession?.commandHistory ?? [],
    onSettled: () => void hub.refresh(),
  });

  const lifecycle = useExperienceLifecycle({
    initialRun: runRef.current,
    wasRestored: restoredSession !== null,
    runRef,
    status,
    managedSensors,
    sessionState,
    isDispatchingSensorCommand: commands.isDispatchingSensor,
    isSocketOpen: socket.isOpen,
    send: socket.send,
    refresh: () => void hub.refresh(),
    buildStartContext: () => ({
      capture: setup.capture,
      ...(setup.subjectSnapshot ? { subject: setup.subjectSnapshot } : {}),
    }),
  });

  useLayoutEffect(() => {
    lifecycleRef.current = lifecycle;
  });

  // Persiste a experiência local para sobreviver a um recarregamento do navegador.
  const { history: commandHistory, operationalHistory } = commands;
  const experienceRun = lifecycle.run;
  useEffect(() => {
    const hasLocalExperience =
      experienceRun.status !== "not_started" || experienceEvents.length > 0 || commandHistory.length > 0;
    if (!hasLocalExperience) {
      clearExperienceSession(browserStorage);
      return;
    }
    const timer = window.setTimeout(() => {
      saveExperienceSession(
        browserStorage,
        buildPersistedExperienceSession(experienceRun, experienceEvents, commandHistory, undefined, operationalHistory),
      );
    }, PERSISTENCE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [commandHistory, experienceEvents, experienceRun, operationalHistory]);

  // Sensores podem publicar em tópicos fora da lista oficial; assina-os sob demanda.
  const { state: socketState, subscribe } = socket;
  useEffect(() => {
    if (!status || socketState !== "connected") {
      return;
    }
    subscribe(sensorPublishTopics(status).filter((topic) => !COMMAND_TOPICS.has(topic) && !KNOWN_TOPICS.has(topic)));
  }, [socketState, status, subscribe]);

  const { dispatchUnreal } = commands;
  const { send } = socket;
  const addMarker = useCallback(
    (label: string, note: string): MarkerDelivery => {
      const marker = { markerId: createMarkerId(), label, note };
      // Com Unreal inscrito, ele é a fonte do marker (ACK + experience.marker); sem ele,
      // o dashboard publica a anotação direto, evitando markers duplicados na timeline.
      if (commandRecipients(clients).length > 0) {
        dispatchUnreal("add-marker", buildMarkerArguments(marker));
        return "command";
      }
      return send(buildMarkerAnnotation(marker, runRef.current.runId)) ? "annotation" : "failed";
    },
    [clients, dispatchUnreal, send],
  );

  const exportSensorDataStream = useCallback(() => {
    const exportedAt = new Date().toISOString();
    const filename = `datatracevr-sensor-data-${fileTimestamp(exportedAt)}.json`;
    downloadTextFile(filename, serializeSensorDataStreamJson(sensorDataStream, exportedAt), "application/json");
    notify(`Arquivo ${filename} exportado.`);
  }, [notify, sensorDataStream]);

  const upsertSurvey = useCallback((record: SubjectSurveyRecord) => {
    setSurveyRecords((prev) => {
      const next = upsertSurveyRecord(prev, record);
      saveSurveyRecords(browserStorage, next);
      return next;
    });
  }, []);

  const deleteSurvey = useCallback((id: string) => {
    setSurveyRecords((prev) => {
      const next = deleteSurveyRecord(prev, id);
      saveSurveyRecords(browserStorage, next);
      return next;
    });
  }, []);

  const importSurveyRecords = useCallback((incoming: SubjectSurveyRecord[], replace = false) => {
    setSurveyRecords((prev) => {
      const next = replace ? incoming : [...incoming, ...prev];
      saveSurveyRecords(browserStorage, next);
      return next;
    });
  }, []);

  const loadSampleSurveys = useCallback(() => {
    const nonSample = surveyRecordsRef.current.filter((r) => !isSampleSurveyRecord(r));
    const nextRecords = [...nonSample, ...createSampleSurveyRecords()];
    const nextExperiences = Array.from(new Set([...experiencesRef.current, ...DEMO_EXPERIENCES]));
    saveSurveyRecords(browserStorage, nextRecords);
    saveExperiences(browserStorage, nextExperiences);
    setSurveyRecords(nextRecords);
    setExperiences(nextExperiences);
  }, [experiencesRef, surveyRecordsRef]);

  const clearAllSurveys = useCallback(() => {
    saveSurveyRecords(browserStorage, []);
    saveExperiences(browserStorage, []);
    setSurveyRecords([]);
    setExperiences([]);
  }, []);

  const addExperience = useCallback((name: string) => {
    const clean = name.trim();
    if (!clean) return;
    setExperiences((prev) => {
      if (prev.includes(clean)) return prev;
      const next = [...prev, clean];
      saveExperiences(browserStorage, next);
      return next;
    });
  }, []);

  const removeExperience = useCallback((name: string) => {
    setExperiences((prev) => {
      const next = prev.filter((item) => item !== name);
      saveExperiences(browserStorage, next);
      return next;
    });
    setSurveyRecords((prev) => {
      const next = prev.filter((record) => record.systemName !== name);
      if (next.length !== prev.length) {
        saveSurveyRecords(browserStorage, next);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === SURVEYS_STORAGE_KEY) {
        setSurveyRecords(loadSurveyRecords(browserStorage));
      }
      if (event.key === EXPERIENCES_STORAGE_KEY) {
        setExperiences(loadExperiences(browserStorage));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const currentHubSessionId = hub.health?.sessionId;
  const operatingMode = detectHubOperatingMode(currentHubSessionId, status);
  const { clearLiveEvents } = stream;
  const { setSubject, clearSubject } = setup;
  useEffect(() => {
    if (!currentHubSessionId || operatingMode === "unknown") {
      return;
    }
    const modeKey = `${operatingMode}:${currentHubSessionId}`;
    if (lastHandledModeKeyRef.current === modeKey) {
      return;
    }
    const previousMode = lastOperatingModeRef.current;
    lastHandledModeKeyRef.current = modeKey;
    lastOperatingModeRef.current = operatingMode;

    if (operatingMode === "demo") {
      // No modo demo, gera participantes e experiências mockadas para testes e demonstração.
      const seeded = seedDemoSurveyData(surveyRecordsRef.current, experiencesRef.current);
      if (seeded.changed) {
        saveSurveyRecords(browserStorage, seeded.records);
        saveExperiences(browserStorage, seeded.experiences);
        setSurveyRecords(seeded.records);
        setExperiences(seeded.experiences);
      }
      if (!subjectRef.current) {
        setSubject(createDemoSubjectProfile());
      }
      if (previousMode === "real") {
        notify("Modo demo ativado: participantes e experiências mockadas carregados.");
      }
      return;
    }

    // Ao ativar o modo real, limpa eventos simulados do Ao Vivo e remove participantes/experiências mockados.
    clearLiveEvents();
    const stripped = stripDemoSurveyData(surveyRecordsRef.current, experiencesRef.current);
    if (stripped.changed) {
      saveSurveyRecords(browserStorage, stripped.records);
      saveExperiences(browserStorage, stripped.experiences);
      setSurveyRecords(stripped.records);
      setExperiences(stripped.experiences);
    }
    if (isDemoSubjectProfile(subjectRef.current)) {
      clearSubject();
    }
    if (previousMode === "demo") {
      notify("Modo real ativado: participantes e experiências de demonstração removidos.");
    }
  }, [
    clearLiveEvents,
    clearSubject,
    currentHubSessionId,
    experiencesRef,
    notify,
    operatingMode,
    setSubject,
    subjectRef,
    surveyRecordsRef,
  ]);

  return {
    settings,
    setup,
    hub,
    socket,
    commands,
    lifecycle,
    events,
    experienceEvents,
    clients,
    sessionState,
    sensorSummaries,
    managedSensors,
    sensorDataStream,
    readiness,
    actions,
    latestMarker,
    addMarker,
    exportSensorDataStream,
    surveyRecords,
    experiences,
    addExperience,
    removeExperience,
    upsertSurvey,
    deleteSurvey,
    importSurveyRecords,
    loadSampleSurveys,
    clearAllSurveys,
    toasts,
    notify,
    dismissToast,
  };
}

export type Dashboard = ReturnType<typeof useDashboard>;
