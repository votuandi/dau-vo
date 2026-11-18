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

export interface MonitoringJudgeVote {
  athleteColor: 'RED' | 'BLUE';
  judgePosition: number | null;
  judgeSlot: string | null;
  serverReceivedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Older scoring windows can lack their JudgeVote rows, while their resolution
 * audit record still contains the authoritative vote trail. Use it only as a
 * history fallback; persisted JudgeVote rows remain the primary source.
 */
export function monitoringAuditJudgeVotes(
  metadata: unknown,
  scoringWindowId: string,
): MonitoringJudgeVote[] {
  if (
    !isRecord(metadata) ||
    metadata.action !== 'SCORING_WINDOW_RESOLVED' ||
    metadata.scoringWindowId !== scoringWindowId ||
    !Array.isArray(metadata.votes)
  ) {
    return [];
  }

  return metadata.votes.flatMap((vote) => {
    if (
      !isRecord(vote) ||
      (vote.athlete !== 'RED' && vote.athlete !== 'BLUE') ||
      typeof vote.serverReceivedAt !== 'string'
    ) {
      return [];
    }

    return [
      {
        athleteColor: vote.athlete,
        judgePosition:
          typeof vote.judgePosition === 'number' ? vote.judgePosition : null,
        judgeSlot: typeof vote.judgeSlot === 'string' ? vote.judgeSlot : null,
        serverReceivedAt: vote.serverReceivedAt,
      },
    ];
  });
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

/** Reconstruct pause intervals from the persisted server clock in control audits. */
export function monitoringPauseLookup(
  audits: readonly {
    eventType: string;
    metadata: unknown;
  }[],
): (roundId: string | null | undefined, occurredAt: Date) => boolean {
  const controls = audits
    .flatMap((audit) => {
      if (
        !isRecord(audit.metadata) ||
        typeof audit.metadata.roundId !== 'string'
      )
        return [];
      const paused = audit.eventType === 'ROUND_PAUSED';
      if (!paused && audit.eventType !== 'ROUND_RESUMED') return [];
      const timestamp = paused
        ? audit.metadata.pausedAt
        : audit.metadata.resumedAt;
      if (typeof timestamp !== 'string') return [];
      const time = Date.parse(timestamp);
      return Number.isFinite(time)
        ? [{ roundId: audit.metadata.roundId, paused, time }]
        : [];
    })
    .sort((a, b) => a.time - b.time);
  const intervals = new Map<string, Array<{ start: number; end: number }>>();
  for (const control of controls) {
    const rounds = intervals.get(control.roundId) ?? [];
    const last = rounds.at(-1);
    if (control.paused) {
      if (!last || last.end !== Infinity)
        rounds.push({ start: control.time, end: Infinity });
    } else if (last?.end === Infinity) {
      last.end = control.time;
    }
    intervals.set(control.roundId, rounds);
  }
  return (roundId, occurredAt) =>
    roundId != null &&
    (intervals
      .get(roundId)
      ?.some(
        (interval) =>
          occurredAt.getTime() >= interval.start &&
          occurredAt.getTime() < interval.end,
      ) ??
      false);
}
