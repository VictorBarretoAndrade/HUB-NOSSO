import { Send } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { Panel } from "../../components/Panel";
import { canAnnotateMarker } from "../../domain/commandHistory";
import { MARKER_PRESETS } from "../../domain/timelineTools";

const LABEL_MAX_LENGTH = 80;
const NOTE_MAX_LENGTH = 240;

interface MarkerFormProps {
  experienceIsActive: boolean;
  /** Há um cliente Unreal para receber o comando (senão o marker é só anotação local). */
  hasCommandRecipient: boolean;
  isDispatching: boolean;
  onAddMarker: (label: string, note: string) => void;
}

/**
 * Markers são sensíveis ao tempo: o envio é direto (Enter ou botão), sem diálogo de
 * confirmação, para o carimbo de tempo corresponder ao momento observado.
 */
export function MarkerForm({ experienceIsActive, hasCommandRecipient, isDispatching, onAddMarker }: MarkerFormProps) {
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const canSubmit = experienceIsActive && canAnnotateMarker(isDispatching, label);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    onAddMarker(label, note);
    setLabel("");
    setNote("");
  };

  const hint = !experienceIsActive
    ? "Inicie a experiência para habilitar os markers."
    : isDispatching
      ? "Aguardando o ACK do comando anterior."
      : !label.trim()
        ? "Escolha um preset ou digite um rótulo. Enter envia."
        : hasCommandRecipient
          ? "O marker será enviado ao Unreal e entra na timeline após o ACK."
          : "Sem cliente Unreal: o marker entra na timeline como anotação do dashboard.";

  return (
    <Panel className="marker-panel" title="Marker da experiência">
      <form className="form-block marker-form" onSubmit={submit}>
        <div className="preset-chip-row" role="group" aria-label="Presets de marker">
          <span>Presets</span>
          {MARKER_PRESETS.map((preset) => (
            <button
              aria-pressed={label.trim() === preset}
              className={`preset-chip ${label.trim() === preset ? "active" : ""}`}
              key={preset}
              type="button"
              onClick={() => setLabel(preset)}
            >
              {preset}
            </button>
          ))}
        </div>
        <label htmlFor="marker-label">Rótulo do marker</label>
        <input
          autoComplete="off"
          id="marker-label"
          maxLength={LABEL_MAX_LENGTH}
          placeholder="stimulus-start"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
        />
        <label htmlFor="marker-note">Observação (opcional)</label>
        <textarea
          id="marker-note"
          maxLength={NOTE_MAX_LENGTH}
          placeholder="Contexto do evento, se houver"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        <button className="command-button strong" disabled={!canSubmit} type="submit">
          <Send aria-hidden size={16} /> {isDispatching ? "Aguardando ACK…" : "Adicionar marker"}
        </button>
        <p className="muted-copy">{hint}</p>
      </form>
    </Panel>
  );
}
