export function roundLabel(round: number, totalRounds: number): string {
  if (round === totalRounds) return 'Chung kết';
  if (round === totalRounds - 1) return 'Bán kết';
  if (round === totalRounds - 2) return 'Tứ kết';
  return `Vòng ${String(round)}`;
}

export function fixtureStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    PENDING_PARTICIPANTS: 'Chờ xác định vận động viên',
    READY: 'Sẵn sàng chuẩn bị',
    MATCH_PREPARED: 'Đã chuẩn bị trận',
    AWAITING_WINNER: 'Chờ quyết định hòa',
    COMPLETED: 'Đã hoàn thành',
  };
  return labels[status] ?? 'Chưa xác định trạng thái';
}
