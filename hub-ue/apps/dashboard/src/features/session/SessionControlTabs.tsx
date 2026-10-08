import { useRef } from "react";
import type { KeyboardEvent } from "react";
import type { ExperienceRunState } from "../../domain/experienceRun";
import { buildSessionControlTabs } from "../../domain/sessionControlUi";
import type { SessionControlTab } from "../../domain/sessionControlUi";

interface SessionControlTabsProps {
  activeTab: SessionControlTab;
  commandCount: number;
  runStatus: ExperienceRunState["status"];
  sensorCount: number;
  timelineCount: number;
  onTabChange: (tab: SessionControlTab) => void;
}

export function sessionTabId(tab: SessionControlTab): string {
  return `session-tab-${tab}`;
}

export function sessionTabPanelId(tab: SessionControlTab): string {
  return `session-tabpanel-${tab}`;
}

/** Abas do Controle da sessão, navegáveis por setas como manda o padrão de tablist. */
export function SessionControlTabs({
  activeTab,
  commandCount,
  onTabChange,
  runStatus,
  sensorCount,
  timelineCount,
}: SessionControlTabsProps) {
  const tabs = buildSessionControlTabs(runStatus, timelineCount, sensorCount, commandCount);
  const listRef = useRef<HTMLDivElement>(null);

  const focusTab = (tab: SessionControlTab) => {
    onTabChange(tab);
    listRef.current?.querySelector<HTMLElement>(`#${sessionTabId(tab)}`)?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = tabs.findIndex((tab) => tab.id === activeTab);
    const lastIndex = tabs.length - 1;
    const targetIndex =
      event.key === "ArrowRight"
        ? (currentIndex + 1) % tabs.length
        : event.key === "ArrowLeft"
          ? (currentIndex - 1 + tabs.length) % tabs.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? lastIndex
              : -1;
    if (targetIndex >= 0) {
      event.preventDefault();
      focusTab(tabs[targetIndex].id);
    }
  };

  return (
    <div
      aria-label="Seções do controle da sessão"
      className="session-control-tabs"
      ref={listRef}
      role="tablist"
      onKeyDown={handleKeyDown}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            aria-controls={sessionTabPanelId(tab.id)}
            aria-selected={isActive}
            className={isActive ? "active" : ""}
            id={sessionTabId(tab.id)}
            key={tab.id}
            role="tab"
            tabIndex={isActive ? 0 : -1}
            type="button"
            onClick={() => onTabChange(tab.id)}
          >
            <span>{tab.label}</span>
            {typeof tab.count === "number" && <strong>{tab.count}</strong>}
          </button>
        );
      })}
    </div>
  );
}
