// Fase 2 — Tela de seleção de modo de gravação (exigência ②).
//
// Componente controlado: o App mantém o CaptureProfile e a persistência.
// A seleção é publicada no experience.lifecycle started e segue até o driver via /control.

import type { CaptureProfile, RecordingMode, SignalKind } from "./captureProfile";
import { isCaptureValid, toggleSignal } from "./captureProfile";

const MODES: Array<{ value: RecordingMode; label: string; hint: string }> = [
  { value: "stream", label: "Stream-only", hint: "Apenas transmite; não grava arquivo." },
  { value: "record", label: "Record", hint: "Grava ECG bruto no driver durante a experiência." },
  { value: "hybrid", label: "Hybrid", hint: "Transmite e grava sob comando." },
];

const SIGNALS: SignalKind[] = ["ecg", "rr", "hr", "hrv"];

export function RecordingModeView({
  capture,
  sensors,
  onChange,
}: {
  capture: CaptureProfile;
  sensors: string[];
  onChange: (next: CaptureProfile) => void;
}) {
  const valid = isCaptureValid(capture);

  const hasSignal = (clientId: string, signal: SignalKind): boolean =>
    capture.sensors.find((sensor) => sensor.clientId === clientId)?.signals.includes(signal) ?? false;

  return (
    <section className="content-grid subject-grid">
      <section className="panel">
        <header className="panel-header">
          <span>Modo de gravação</span>
          <span className={`status-pill ${valid ? "ok" : "warn"}`}>
            {valid ? "Configuração válida" : "Selecione ao menos 1 sinal"}
          </span>
        </header>
        <div className="panel-body">
          <div className="form-block">
            {MODES.map((mode) => (
              <label className="checkbox-line" key={mode.value}>
                <input
                  type="radio"
                  name="recording-mode"
                  checked={capture.mode === mode.value}
                  onChange={() => onChange({ ...capture, mode: mode.value })}
                />
                <span>
                  <strong>{mode.label}</strong> — {mode.hint}
                </span>
              </label>
            ))}
            <label className="checkbox-line">
              <input
                type="checkbox"
                checked={capture.rawEcg}
                onChange={(event) => onChange({ ...capture, rawEcg: event.target.checked })}
              />
              Capturar ECG bruto em arquivo
            </label>
          </div>
        </div>
      </section>

      <section className="panel">
        <header className="panel-header">
          <span>Sensores e sinais</span>
        </header>
        <div className="panel-body">
          {sensors.length === 0 ? (
            <p className="muted-copy">
              Nenhum sensor conectado. Conecte um sensor (ex.: a ponte do Polar) para selecionar sinais.
            </p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Sensor</th>
                  {SIGNALS.map((signal) => (
                    <th key={signal}>{signal.toUpperCase()}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sensors.map((clientId) => (
                  <tr key={clientId}>
                    <td className="mono">{clientId}</td>
                    {SIGNALS.map((signal) => (
                      <td key={signal}>
                        <input
                          type="checkbox"
                          checked={hasSignal(clientId, signal)}
                          onChange={() => onChange(toggleSignal(capture, clientId, signal))}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="muted-copy">
            A seleção é enviada ao iniciar a experiência (experience.lifecycle → ponte → /control do driver).
          </p>
        </div>
      </section>
    </section>
  );
}
