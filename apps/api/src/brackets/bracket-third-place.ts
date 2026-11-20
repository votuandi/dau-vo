import { ConflictException } from '@nestjs/common';
import {
  AuditEventType,
  BracketFixtureStatus,
  BracketSlotSourceOutcome,
  BracketStatus,
  type Prisma,
} from '@prisma/client';
import {
  isThirdPlaceRound,
  thirdPlaceRoundNumber,
} from '@martial-arts-scoring/shared-types';

export const THIRD_PLACE_DISPLAY_REFERENCE = 'H3-M01';

export const THIRD_PLACE_MATCH_LOCKED = {
  code: 'BRACKET_THIRD_PLACE_MATCH_LOCKED',
  message:
    'Trận tranh hạng 3 đã được chuẩn bị hoặc đã có kết quả nên không thể tắt',
};
export const THIRD_PLACE_BRACKET_COMPLETED = {
  code: 'BRACKET_THIRD_PLACE_BRACKET_COMPLETED',
  message: 'Nhánh đấu đã hoàn tất nên không thể thay đổi trận tranh hạng 3',
};

/** The entrant of a decided fixture who did not win it. */
export function fixtureLoserId(fixture: {
  readonly winnerEntrantId: string | null;
  readonly slots: readonly { readonly resolvedEntrantId: string | null }[];
}): string | null {
  if (!fixture.winnerEntrantId) return null;
  return (
    fixture.slots.find(
      (slot) =>
        slot.resolvedEntrantId !== null &&
        slot.resolvedEntrantId !== fixture.winnerEntrantId,
    )?.resolvedEntrantId ?? null
  );
}

/**
 * Adds or removes the third-place fixture of an active bracket so it matches
 * the weight class setting. It needs two real semi-finals (a bye leaves only
 * one semi-final loser); its slots take each semi-final's loser.
 */
export async function syncThirdPlaceFixture(
  tx: Prisma.TransactionClient,
  bracketId: string,
  enabled: boolean,
): Promise<'created' | 'removed' | 'unchanged'> {
  const bracket = await tx.tournamentBracket.findUniqueOrThrow({
    where: { id: bracketId },
    select: { id: true, roundCount: true, status: true },
  });
  const roundNumber = thirdPlaceRoundNumber(bracket.roundCount);
  const existing = await tx.bracketFixture.findFirst({
    where: { bracketId, roundNumber },
    select: { id: true, status: true, match: { select: { id: true } } },
  });
  if (enabled === Boolean(existing)) return 'unchanged';
  if (bracket.status !== BracketStatus.ACTIVE)
    throw new ConflictException(THIRD_PLACE_BRACKET_COMPLETED);

  if (existing) {
    if (
      existing.match !== null ||
      existing.status === BracketFixtureStatus.MATCH_PREPARED ||
      existing.status === BracketFixtureStatus.AWAITING_WINNER ||
      existing.status === BracketFixtureStatus.COMPLETED
    )
      throw new ConflictException(THIRD_PLACE_MATCH_LOCKED);
    await tx.bracketFixture.delete({ where: { id: existing.id } });
    await tx.bracketRoundStaffing.deleteMany({
      where: { bracketId, roundNumber },
    });
    return 'removed';
  }

  // Lock the semi-finals so a result recorded meanwhile cannot miss the new slots.
  await tx.$queryRaw`
    SELECT id FROM bracket_fixtures
    WHERE bracket_id = ${bracketId}::uuid AND round_number = ${bracket.roundCount - 1}
    ORDER BY id FOR UPDATE
  `;
  const semiFinals = await tx.bracketFixture.findMany({
    where: { bracketId, roundNumber: bracket.roundCount - 1 },
    orderBy: { position: 'asc' },
    select: {
      id: true,
      winnerEntrantId: true,
      slots: { select: { resolvedEntrantId: true } },
    },
  });
  if (bracket.roundCount < 2 || semiFinals.length !== 2) return 'unchanged';
  const slots = semiFinals.map((semiFinal, index) => ({
    side: index === 0 ? ('RED' as const) : ('BLUE' as const),
    sourceFixtureId: semiFinal.id,
    sourceOutcome: BracketSlotSourceOutcome.LOSER,
    resolvedEntrantId: fixtureLoserId(semiFinal),
  }));
  await tx.bracketFixture.create({
    data: {
      bracketId,
      roundNumber,
      position: 1,
      displayReference: THIRD_PLACE_DISPLAY_REFERENCE,
      status: slots.every((slot) => slot.resolvedEntrantId)
        ? BracketFixtureStatus.READY
        : BracketFixtureStatus.PENDING_PARTICIPANTS,
      slots: { create: slots },
    },
  });
  // The third-place match starts with the final's settings; organisers can change them.
  const final = await tx.bracketRoundStaffing.findUnique({
    where: {
      bracketId_roundNumber: { bracketId, roundNumber: bracket.roundCount },
    },
  });
  await tx.bracketRoundStaffing.create({
    data: {
      bracketId,
      roundNumber,
      ...(final
        ? {
            requiredJudgeCount: final.requiredJudgeCount,
            regulationRoundCount: final.regulationRoundCount,
            roundDurationMs: final.roundDurationMs,
            scoringMethod: final.scoringMethod,
            supervisorScoringEnabled: final.supervisorScoringEnabled,
            scoringThreshold: final.scoringThreshold,
          }
        : {}),
    },
  });
  return 'created';
}

/**
 * A bracket is complete once its final has a winner and, when it has one, the
 * third-place match too. Called after every decision or retraction of either.
 */
export async function refreshBracketCompletion(
  tx: Prisma.TransactionClient,
  bracketId: string,
): Promise<void> {
  const bracket = await tx.tournamentBracket.findUniqueOrThrow({
    where: { id: bracketId },
    select: {
      id: true,
      status: true,
      roundCount: true,
      tournamentId: true,
      weightClassId: true,
      championEntrantId: true,
      fixtures: { select: { roundNumber: true, winnerEntrantId: true } },
    },
  });
  if (bracket.status === BracketStatus.CANCELLED) return;
  const final = bracket.fixtures.find(
    (fixture) => fixture.roundNumber === bracket.roundCount,
  );
  const thirdPlace = bracket.fixtures.find((fixture) =>
    isThirdPlaceRound(fixture.roundNumber, bracket.roundCount),
  );
  const champion = final?.winnerEntrantId ?? null;
  const complete =
    champion !== null && (!thirdPlace || thirdPlace.winnerEntrantId !== null);
  if (complete) {
    if (
      bracket.status === BracketStatus.COMPLETED &&
      bracket.championEntrantId === champion
    )
      return;
    await tx.tournamentBracket.update({
      where: { id: bracketId },
      data: {
        status: BracketStatus.COMPLETED,
        completedAt: new Date(),
        championEntrantId: champion,
      },
    });
    await tx.auditLog.create({
      data: {
        eventType: AuditEventType.BRACKET_COMPLETED,
        metadata: {
          bracketId,
          tournamentId: bracket.tournamentId,
          weightClassId: bracket.weightClassId,
          championEntrantId: champion,
        },
      },
    });
    return;
  }
  if (bracket.status === BracketStatus.COMPLETED)
    await tx.tournamentBracket.update({
      where: { id: bracketId },
      data: {
        status: BracketStatus.ACTIVE,
        completedAt: null,
        championEntrantId: null,
      },
    });
}
