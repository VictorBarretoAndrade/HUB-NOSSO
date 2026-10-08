import { CHART_PLOT_WIDTH, CHART_PLOT_X } from "../../domain/experienceAnalytics";

/** Dimensões do viewBox compartilhado pelos gráficos do relatório. */
export const CHART_VIEW_BOX = "0 0 760 330";

/** Frações do eixo do tempo em que desenhamos linhas de grade e rótulos. */
export const TIME_TICKS = [0, 0.25, 0.5, 0.75, 1] as const;

/** Posição X (em unidades do viewBox) de uma fração do eixo do tempo. */
export function tickX(fraction: number): number {
  return CHART_PLOT_X + fraction * CHART_PLOT_WIDTH;
}
