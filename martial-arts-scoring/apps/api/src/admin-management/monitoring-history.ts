interface MonitoringScoringWindow {
  roundElapsedMs: number | null;
  startedAt: Date;
}

interface MonitoringScoreEvent {
  createdAt: Date;
  occurredAt: Date | null;
  roundId: string | null;
  roundElapsedMs: number | null;
}

export function monitoringScoringWindow<T extends MonitoringScoringWindow>(
  window: T,
): T & { occurredAt: Date } {
  return { ...window, occurredAt: window.startedAt };
}

export function monitoringScoreEvent<T extends MonitoringScoreEvent>(
  event: T,
  scoringWindow: MonitoringScoringWindow | null,
): T & { occurredAt: Date; roundElapsedMs: number | null } {
  return {
    ...event,
    occurredAt: scoringWindow?.startedAt ?? event.occurredAt ?? event.createdAt,
    roundElapsedMs:
      scoringWindow?.roundElapsedMs ??
      (event.roundId === null ? null : event.roundElapsedMs),
  };
}
