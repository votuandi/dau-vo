export type BracketFixtureState =
  'PENDING_PARTICIPANTS' | 'READY' | 'MATCH_PREPARED' | 'AWAITING_WINNER' | 'COMPLETED';

/**
 * The third-place match ("Tranh hạng 3") is stored one round after the final so
 * it has its own round settings; it is played before the final.
 */
export function thirdPlaceRoundNumber(roundCount: number): number {
  return roundCount + 1;
}

export function isThirdPlaceRound(roundNumber: number, roundCount: number): boolean {
  return roundCount >= 2 && roundNumber === thirdPlaceRoundNumber(roundCount);
}

export const THIRD_PLACE_ROUND_LABEL = 'Tranh hạng 3';

export function bracketRoundLabel(roundNumber: number, roundCount: number): string {
  if (isThirdPlaceRound(roundNumber, roundCount)) return THIRD_PLACE_ROUND_LABEL;
  const roundsFromFinal = roundCount - roundNumber;
  if (roundsFromFinal === 0) return 'Chung kết';
  if (roundsFromFinal === 1) return 'Bán kết';
  if (roundsFromFinal === 2) return 'Tứ kết';
  return `Vòng ${roundNumber}`;
}

export function bracketFixtureStatusLabel(status: string): string {
  const labels: Record<BracketFixtureState, string> = {
    PENDING_PARTICIPANTS: 'Chờ xác định vận động viên',
    READY: 'Sẵn sàng',
    MATCH_PREPARED: 'Sẵn sàng',
    AWAITING_WINNER: 'Chờ quyết định hòa',
    COMPLETED: 'Đã hoàn thành',
  };
  return labels[status as BracketFixtureState] ?? 'Chưa xác định trạng thái';
}

export function isBracketFixtureAwaitingWinner(status: string): boolean {
  return status === 'AWAITING_WINNER';
}
