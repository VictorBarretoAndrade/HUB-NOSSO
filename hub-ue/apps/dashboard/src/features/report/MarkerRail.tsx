import type { FocusEvent, KeyboardEvent } from "react";
import type {
  BiometricChartMarkerGroup,
  MarkerGroupExpansionItem,
  MarkerGroupExpansionLayout,
} from "../../domain/experienceAnalytics";
import { markerGroupTooltip } from "./markerFormat";
import type { MarkerFocus } from "./useMarkerFocus";

const MARKER_LABEL_HEIGHT = 16;
const MARKER_ANCHOR_Y = 224;
const MARKER_STEM_TOP_Y = 222;

/** Grupo de um único marker, usado para descrever um item da expansão de um cluster. */
export function expansionItemAsGroup(group: BiometricChartMarkerGroup, item: MarkerGroupExpansionItem): BiometricChartMarkerGroup {
  return {
    id: `${group.id}:${item.markerId}`,
    x: item.x + item.width / 2,
    labelX: item.x,
    labelY: item.y,
    labelWidth: 0,
    displayLabel: item.label,
    markers: [item.marker],
    isCluster: false,
  };
}

/** Enter/Espaço fixam o destaque; Esc o remove (equivalentes de teclado ao clique). */
function activationKeyHandler(onActivate: () => void, onDismiss: () => void) {
  return (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onActivate();
    } else if (event.key === "Escape") {
      onDismiss();
    }
  };
}

function focusLeftElement(event: FocusEvent<SVGGElement>): boolean {
  return !event.currentTarget.contains(event.relatedTarget as Node | null);
}

interface MarkerRailProps {
  /** Layout da expansão do grupo ativo, quando ele agrupa vários markers. */
  activeExpansion: MarkerGroupExpansionLayout | null;
  focus: MarkerFocus;
  groups: BiometricChartMarkerGroup[];
}

/** Trilho de markers sob o gráfico: rótulos clicáveis e a expansão de clusters. */
export function MarkerRail({ activeExpansion, focus, groups }: MarkerRailProps) {
  return (
    <>
      {groups.map((group) => {
        const isActive = focus.activeGroupId === group.id;
        return (
          <g
            className={`chart-marker-rail-entry ${isActive ? "active" : ""}`}
            key={group.id}
            onMouseEnter={() => focus.hoverGroup(group.id)}
            onMouseLeave={focus.clearHover}
          >
            <g
              aria-label={markerGroupTooltip(group)}
              className={`chart-marker-group ${group.isCluster ? "cluster" : "single"} ${isActive ? "active" : ""}`}
              role="button"
              tabIndex={0}
              onBlur={(event) => {
                if (focusLeftElement(event)) {
                  focus.clearHover();
                }
              }}
              onClick={(event) => {
                event.stopPropagation();
                focus.togglePinnedGroup(group.id);
              }}
              onFocus={() => focus.hoverGroup(group.id)}
              onKeyDown={activationKeyHandler(() => focus.togglePinnedGroup(group.id), focus.dismiss)}
            >
              <line x1={group.x} x2={group.x} y1={MARKER_STEM_TOP_Y} y2={group.labelY + MARKER_LABEL_HEIGHT / 2} />
              <circle cx={group.x} cy={MARKER_ANCHOR_Y} r={group.isCluster ? 4 : 3} />
              <rect x={group.labelX} y={group.labelY} width={group.labelWidth} height={MARKER_LABEL_HEIGHT} rx="2" />
              <text x={group.labelX + group.labelWidth / 2} y={group.labelY + 11} textAnchor="middle">
                {group.displayLabel}
              </text>
            </g>

            {isActive && activeExpansion && (
              <g className="chart-marker-expansion">
                <rect
                  x={activeExpansion.x}
                  y={activeExpansion.y}
                  width={activeExpansion.width}
                  height={activeExpansion.height}
                  rx="3"
                />
                {activeExpansion.items.map((item) => (
                  <g
                    aria-label={markerGroupTooltip(expansionItemAsGroup(group, item))}
                    className={`chart-marker-expansion-item ${focus.activeMarkerId === item.markerId ? "active" : ""}`}
                    key={item.markerId}
                    role="button"
                    tabIndex={0}
                    onBlur={(event) => {
                      if (focusLeftElement(event)) {
                        focus.leaveMarker(item.markerId);
                      }
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      focus.togglePinnedMarker(group.id, item.markerId);
                    }}
                    onFocus={() => focus.hoverMarker(group.id, item.markerId)}
                    onKeyDown={activationKeyHandler(() => focus.togglePinnedMarker(group.id, item.markerId), focus.dismiss)}
                    onMouseEnter={() => focus.hoverMarker(group.id, item.markerId)}
                    onMouseLeave={() => focus.leaveMarker(item.markerId)}
                  >
                    <rect x={item.x} y={item.y} width={item.width} height={MARKER_LABEL_HEIGHT} rx="2" />
                    <text x={item.x + item.width / 2} y={item.y + 11} textAnchor="middle">
                      {item.label}
                    </text>
                  </g>
                ))}
              </g>
            )}
          </g>
        );
      })}
    </>
  );
}
