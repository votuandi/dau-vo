export type BracketFixtureState =
  'PENDING_PARTICIPANTS' | 'READY' | 'MATCH_PREPARED' | 'AWAITING_WINNER' | 'COMPLETED';

export function bracketRoundLabel(roundNumber: number, roundCount: number): string {
  const roundsFromFinal = roundCount - roundNumber;
  if (roundsFromFinal === 0) return 'Chung kết';
  if (roundsFromFinal === 1) return 'Bán kết';
  if (roundsFromFinal === 2) return 'Tứ kết';
  return `Vòng ${roundNumber}`;
}

export function bracketFixtureStatusLabel(status: string): string {
  const labels: Record<BracketFixtureState, string> = {
    PENDING_PARTICIPANTS: 'Chờ xác định vận động viên',
    READY: 'Sẵn sàng chuẩn bị',
    MATCH_PREPARED: 'Đã chuẩn bị trận',
    AWAITING_WINNER: 'Chờ quyết định hòa',
    COMPLETED: 'Đã hoàn thành',
  };
  return labels[status as BracketFixtureState] ?? 'Chưa xác định trạng thái';
}

export function isBracketFixtureAwaitingWinner(status: string): boolean {
  return status === 'AWAITING_WINNER';
}
