import { ArrowRight, RotateCcw } from "lucide-react";
import type { View } from "../../app/navigation";
import { Panel } from "../../components/Panel";
import { StatusPill } from "../../components/StatusPill";
import { isCaptureValid, toggleSignal } from "../../domain/captureProfile";
import type { CaptureProfile, RecordingMode, SignalKind } from "../../domain/captureProfile";

const MODES: Array<{ value: RecordingMode; label: string; hint: string }> = [
  { value: "stream", label: "Só transmitir", hint: "Apenas transmite ao vivo; não grava arquivo." },
  { value: "record", label: "Gravar", hint: "Grava o ECG bruto no driver durante a experiência." },
  { value: "hybrid", label: "Híbrido", hint: "Transmite ao vivo e grava ao mesmo tempo." },
];

const SIGNALS: SignalKind[] = ["ecg", "rr", "hr", "hrv"];

interface RecordingModeViewProps {
  capture: CaptureProfile;
  /** Sensores conectados mais os já presentes no perfil salvo. */
  sensors: string[];
  onChange: (next: CaptureProfile) => void;
  onNavigate: (view: View) => void;
  onReset: () => void;
}

/**
 * Perfil de captura da sessão. A seleção segue no experience.lifecycle "started"
 * e chega ao driver pela ponte, via /control.
 */
export function RecordingModeView({ capture, onChange, onNavigate, onReset, sensors }: RecordingModeViewProps) {
  const isValid = isCaptureValid(capture);
  const recordsToFile = capture.mode !== "stream";

  const hasSignal = (clientId: string, signal: SignalKind): boolean =>
    capture.sensors.find((sensor) => sensor.clientId === clientId)?.signals.includes(signal) ?? false;

  // O ECG bruto só faz sentido quando há gravação; trocar para "só transmitir" o desliga.
  const selectMode = (mode: RecordingMode) =>
    onChange({ ...capture, mode, rawEcg: mode === "stream" ? false : capture.rawEcg });

  return (
    <section className="content-grid subject-grid">
      <Panel
        title="Modo de gravação"
        action={
          <StatusPill
            tone={isValid ? "ok" : "warn"}
            label={isValid ? "Configuração válida" : "Selecione ao menos 1 sinal"}
          />
        }
      >
        <fieldset className="form-block choice-group">
          <legend className="field-label">Como os sinais serão tratados</legend>
          {MODES.map((mode) => (
            <label className="checkbox-line" key={mode.value}>
              <input
                checked={capture.mode === mode.value}
                name="recording-mode"
                type="radio"
                onChange={() => selectMode(mode.value)}
              />
              <span>
                <strong>{mode.label}</strong>
                <span className="choice-hint">{mode.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="form-block">
          <label className="checkbox-line">
            <input
              checked={capture.rawEcg}
              disabled={!recordsToFile}
              type="checkbox"
              onChange={(event) => onChange({ ...capture, rawEcg: event.target.checked })}
            />
            <span>
              Capturar ECG bruto em arquivo
              {!recordsToFile && <span className="choice-hint">Disponível nos modos Gravar e Híbrido.</span>}
            </span>
          </label>
          <p className="muted-copy">As alterações são salvas automaticamente neste navegador.</p>
          <div className="form-actions">
            <button className="command-button" type="button" onClick={onReset}>
              <RotateCcw aria-hidden size={15} /> Restaurar padrão
            </button>
            <button className="command-button strong" type="button" onClick={() => onNavigate("session")}>
              Ir para o Controle da sessão <ArrowRight aria-hidden size={15} />
            </button>
          </div>
        </div>
      </Panel>

      <Panel title="Sensores e sinais">
        {sensors.length === 0 ? (
          <p className="empty-state">
            Nenhum sensor conectado. Conecte um sensor (por exemplo, a ponte do Polar H10) ou inicie um simulador para
            escolher os sinais.
          </p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Sensor</th>
                  {SIGNALS.map((signal) => (
                    <th key={signal} scope="col">
                      {signal.toUpperCase()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sensors.map((clientId) => (
                  <tr key={clientId}>
                    <th className="mono" scope="row">
                      {clientId}
                    </th>
                    {SIGNALS.map((signal) => (
                      <td key={signal}>
                        <input
                          aria-label={`${signal.toUpperCase()} de ${clientId}`}
                          checked={hasSignal(clientId, signal)}
                          type="checkbox"
                          onChange={() => onChange(toggleSignal(capture, clientId, signal))}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted-copy">
          A seleção é enviada ao iniciar a experiência (experience.lifecycle → ponte → /control do driver).
          {!isValid && " Os modos Gravar e Híbrido exigem ao menos um sinal marcado."}
        </p>
      </Panel>
    </section>
  );
}
