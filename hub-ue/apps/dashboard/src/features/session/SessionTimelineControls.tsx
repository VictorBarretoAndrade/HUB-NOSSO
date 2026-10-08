import { X } from "lucide-react";
import type { ExperienceRunState } from "../../domain/experienceRun";
import type { TimelineFilterOptions, TimelineKindFilter } from "../../domain/timelineTools";
import { timelineKindLabel } from "./timelineLabels";

const ALL = "all";

interface SessionTimelineControlsProps {
  filtersActive: boolean;
  kind: TimelineKindFilter;
  options: TimelineFilterOptions;
  query: string;
  runStatus: ExperienceRunState["status"];
  source: string;
  onClearFilters: () => void;
  onKindChange: (kind: TimelineKindFilter) => void;
  onQueryChange: (query: string) => void;
  onSourceChange: (source: string) => void;
}

/** Mantém a opção selecionada na lista mesmo que ela não exista mais nos dados atuais. */
function withSelected<T extends string>(available: T[], selected: T | typeof ALL): T[] {
  return selected === ALL || available.includes(selected) ? available : [selected, ...available];
}

export function SessionTimelineControls({
  filtersActive,
  kind,
  onClearFilters,
  onKindChange,
  onQueryChange,
  onSourceChange,
  options,
  query,
  runStatus,
  source,
}: SessionTimelineControlsProps) {
  return (
    <div className="timeline-toolbar">
      <div className="timeline-filter-grid">
        <label htmlFor="timeline-query">
          Buscar
          <input
            id="timeline-query"
            placeholder="rótulo, observação, cliente ou detalhe"
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </label>
        <label htmlFor="timeline-source">
          Origem
          <select id="timeline-source" value={source} onChange={(event) => onSourceChange(event.target.value)}>
            <option value={ALL}>Todas as origens</option>
            {withSelected(options.sources, source).map((sourceOption) => (
              <option key={sourceOption} value={sourceOption}>
                {sourceOption}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="timeline-kind">
          Tipo
          <select id="timeline-kind" value={kind} onChange={(event) => onKindChange(event.target.value as TimelineKindFilter)}>
            <option value={ALL}>Todos os tipos</option>
            {withSelected(options.kinds, kind).map((kindOption) => (
              <option key={kindOption} value={kindOption}>
                {timelineKindLabel(kindOption)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="timeline-export-row">
        {filtersActive && (
          <button className="mini-button" type="button" onClick={onClearFilters}>
            <X aria-hidden size={14} /> Limpar filtros
          </button>
        )}
        <span>
          {runStatus === "ended"
            ? "As exportações da timeline estão na aba Relatório."
            : "As exportações ficam disponíveis na aba Relatório após encerrar a experiência."}
        </span>
      </div>
    </div>
  );
}
