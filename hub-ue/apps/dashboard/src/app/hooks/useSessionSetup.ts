import { useCallback, useEffect, useMemo, useState } from "react";
import { createDefaultCaptureProfile, isCaptureValid, loadCaptureProfile, saveCaptureProfile } from "../../domain/captureProfile";
import type { CaptureProfile } from "../../domain/captureProfile";
import {
  clearSubjectProfile,
  loadSubjectProfile,
  saveSubjectProfile,
  subjectSnapshotForRun,
  validateSubjectForStart,
} from "../../domain/subjectProfile";
import type { SubjectProfile, SubjectSnapshot } from "../../domain/subjectProfile";
import { browserStorage } from "../../lib/storage";

export interface SessionSetup {
  subject: SubjectProfile | null;
  subjectSnapshot: SubjectSnapshot | undefined;
  capture: CaptureProfile;
  /** Pendências de preparação que o operador deveria resolver antes de iniciar. */
  pendingIssues: string[];
  setSubject: (next: SubjectProfile) => void;
  clearSubject: () => void;
  setCapture: (next: CaptureProfile) => void;
  resetCapture: () => void;
}

/** Preparação da sessão: cadastro do sujeito e perfil de captura, persistidos localmente. */
export function useSessionSetup(): SessionSetup {
  const [subject, setSubject] = useState<SubjectProfile | null>(() => loadSubjectProfile(browserStorage));
  const [capture, setCapture] = useState<CaptureProfile>(
    () => loadCaptureProfile(browserStorage) ?? createDefaultCaptureProfile(),
  );

  useEffect(() => {
    if (subject) {
      saveSubjectProfile(browserStorage, subject);
    }
  }, [subject]);

  useEffect(() => {
    saveCaptureProfile(browserStorage, capture);
  }, [capture]);

  const clearSubject = useCallback(() => {
    clearSubjectProfile(browserStorage);
    setSubject(null);
  }, []);

  const resetCapture = useCallback(() => setCapture(createDefaultCaptureProfile()), []);

  const subjectSnapshot = useMemo(() => (subject ? subjectSnapshotForRun(subject) : undefined), [subject]);

  const pendingIssues = useMemo(() => {
    const issues = subject ? validateSubjectForStart(subject) : ["Nenhum sujeito cadastrado para esta sessão."];
    if (!isCaptureValid(capture)) {
      issues.push("O modo de gravação exige ao menos um sinal selecionado.");
    }
    return issues;
  }, [capture, subject]);

  return { subject, subjectSnapshot, capture, pendingIssues, setSubject, clearSubject, setCapture, resetCapture };
}
