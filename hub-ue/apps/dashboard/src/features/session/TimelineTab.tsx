import { useMemo, useState } from "react";
import { Panel } from "../../components/Panel";
import { StatusPill } from "../../components/StatusPill";
import type { AnalyticSessionTimelineItem, ExperienceRunState } from "../../domain/experienceRun";
import { deriveTimelineFilterOptions, filterSessionTimeline } from "../../domain/timelineTools";
import type { TimelineKindFilter } from "../../domain/timelineTools";
import { SessionTimeline } from "./SessionTimeline";
import { SessionTimelineControls } from "./SessionTimelineControls";

const ALL = "all";

interface TimelineTabProps {
  hasUnrealClient: boolean;
  runStatus: ExperienceRunState["status"];
  timeline: AnalyticSessionTimelineItem[];
}

/** Timeline analítica da experiência com busca e filtros por origem e tipo. */
export function TimelineTab({ hasUnrealClient, runStatus, timeline }: TimelineTabProps) {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState(ALL);
  const [kind, setKind] = useState<TimelineKindFilter>(ALL);

  const filterOptions = useMemo(() => deriveTimelineFilterOptions(timeline), [timeline]);
  const visibleTimeline = useMemo(
    () => filterSessionTimeline(timeline, { kind, query, source }),
    [kind, query, source, timeline],
  );
  const filtersActive = query.trim().length > 0 || source !== ALL || kind !== ALL;

  const clearFilters = () => {
    setQuery("");
    setSource(ALL);
    setKind(ALL);
  };

  return (
    <Panel
      className="timeline-panel"
      title="Timeline da sessão"
      action={
        <StatusPill
          tone={visibleTimeline.length > 0 ? "ok" : "muted"}
          label={`${visibleTimeline.length} de ${timeline.length} visíveis`}
        />
      }
    >
      <SessionTimelineControls
        filtersActive={filtersActive}
        kind={kind}
        options={filterOptions}
        query={query}
        runStatus={runStatus}
        source={source}
        onClearFilters={clearFilters}
        onKindChange={setKind}
        onQueryChange={setQuery}
        onSourceChange={setSource}
      />
      <SessionTimeline
        filtersActive={filtersActive}
        hasUnrealClient={hasUnrealClient}
        runStatus={runStatus}
        timeline={visibleTimeline}
        totalCount={timeline.length}
        onClearFilters={clearFilters}
      />
    </Panel>
  );
}
