import { AthleteColor, MatchStatus } from '@dau-vo/shared-types';
import { CheckCircle2, CloudOff, LoaderCircle, LockKeyhole } from 'lucide-react';
import { MatchAccessPage } from '@/features/match-access/match-access-page';
import { useRealtimeMatch } from '@/features/realtime/realtime-match-provider';
import { useMatchClock } from '@/features/realtime/use-match-clock';
import { useClientSessionStore } from '@/stores/client-session-store';
import { matchStatusLabels, roleLabels, errorMessages } from '@/i18n/vi';
import { ConnectionStatus } from '@/components/connection-status';
import { PageLoading } from '@/components/page-state';
import { cn } from '@/lib/utils';

export function RefereePage() {
  return <MatchAccessPage surface="REFEREE"><RefereeConsole /></MatchAccessPage>;
}

function RefereeConsole() {
  const session = useClientSessionStore((state) => state.matchSession);
  const { snapshot, connection, clockOffsetMs, pendingCommand, acceptedVote, lastError, submitVote } = useRealtimeMatch();
  const clock = useMatchClock(snapshot, clockOffsetMs);
  if (!snapshot) return <div className="min-h-dvh bg-slate-950 text-white"><PageLoading label="Đang đồng bộ trận đấu…" /></div>;
  if (connection === 'REVOKED') return <RevokedScreen />;

  const roundRunning = snapshot.match.status === MatchStatus.ROUND_1_RUNNING || snapshot.match.status === MatchStatus.ROUND_2_RUNNING;
  const canVote = connection === 'CONNECTED' && roundRunning && !pendingCommand && !acceptedVote;
  const feedback = pendingCommand?.kind === 'VOTE'
    ? `Đang gửi lựa chọn ${pendingCommand.color === AthleteColor.RED ? 'ĐỎ' : 'XANH'}…`
    : acceptedVote
      ? `Đã ghi nhận: ${acceptedVote.athleteColor === AthleteColor.RED ? 'ĐỎ' : 'XANH'}`
      : getRefereeInstruction(snapshot.match.status, connection);

  return (
    <main className="flex min-h-dvh flex-col overflow-hidden bg-slate-950 text-white">
      <header className="flex min-h-20 items-center justify-between gap-4 border-b border-white/10 px-4 pr-16 md:px-6 md:pr-20">
        <div><p className="text-xs font-black tracking-[.2em] text-amber-400">TRẬN {snapshot.match.publicId}</p><h1 className="mt-1 font-bold">{session ? roleLabels[session.role] : 'Trọng tài'}</h1></div>
        <div className="text-center"><p className="text-xs font-bold text-white/60">{matchStatusLabels[snapshot.match.status].toUpperCase()}</p><p className="font-display text-4xl font-black tabular-nums md:text-5xl">{clock.formatted}</p></div>
        <ConnectionStatus inverse phase={connection} />
      </header>
      <div className={cn('flex min-h-12 items-center justify-center gap-2 border-b border-white/10 px-4 text-center text-sm font-bold', acceptedVote && 'bg-emerald-950 text-emerald-200', pendingCommand && 'bg-amber-950 text-amber-100')} aria-live="polite">
        {pendingCommand ? <LoaderCircle className="h-4 w-4 animate-spin" /> : acceptedVote ? <CheckCircle2 className="h-4 w-4" /> : connection !== 'CONNECTED' ? <CloudOff className="h-4 w-4" /> : null}
        {feedback}
      </div>
      {lastError ? <p className="bg-red-950 px-4 py-2 text-center text-xs font-semibold text-red-100" role="alert">{errorMessages[lastError.code]}</p> : null}
      <section className="referee-button-grid flex-1 gap-3 p-3 md:gap-5 md:p-5">
        <ScoringButton color={AthleteColor.RED} disabled={!canVote} name={snapshot.red.name} onPress={() => void submitVote(AthleteColor.RED)} />
        <ScoringButton color={AthleteColor.BLUE} disabled={!canVote} name={snapshot.blue.name} onPress={() => void submitVote(AthleteColor.BLUE)} />
      </section>
    </main>
  );
}

function ScoringButton({ color, disabled, name, onPress }: { color: AthleteColor; disabled: boolean; name: string; onPress: () => void }) {
  const red = color === AthleteColor.RED;
  return <button className={cn('relative flex min-h-36 select-none flex-col items-center justify-center overflow-hidden rounded-2xl border-2 text-white shadow-2xl transition active:scale-[.99] disabled:cursor-not-allowed disabled:grayscale disabled:opacity-45', red ? 'border-red-400 bg-gradient-to-br from-red-500 to-red-800' : 'border-blue-400 bg-gradient-to-br from-blue-500 to-blue-800')} disabled={disabled} onClick={onPress}><span className="font-display text-[clamp(3rem,10vw,8rem)] font-black leading-none">{red ? 'ĐỎ' : 'XANH'}</span><span className="mt-3 max-w-[90%] truncate text-sm font-bold opacity-85 md:text-lg">{name}</span>{disabled ? <span className="absolute right-4 top-4 rounded-full bg-black/30 p-2"><LockKeyhole className="h-5 w-5" /></span> : null}</button>;
}

function getRefereeInstruction(status: MatchStatus, connection: string): string {
  if (connection !== 'CONNECTED') return 'Mất kết nối – lựa chọn không thể gửi';
  if (status === MatchStatus.WAITING) return 'Đang chờ giám định viên bắt đầu Hiệp 1';
  if (status === MatchStatus.BREAK) return 'Giải lao – đang chờ Hiệp 2';
  if (status === MatchStatus.FINISHED) return 'Trận đấu đã kết thúc';
  return 'Sẵn sàng chấm điểm';
}

function RevokedScreen() { return <main className="grid min-h-dvh place-items-center bg-slate-950 p-6 text-center text-white"><div><LockKeyhole className="mx-auto h-12 w-12 text-red-400" /><h1 className="mt-5 text-2xl font-black">Phiên đăng nhập đã được chuyển</h1><p className="mt-2 text-sm text-slate-400">Thiết bị này không còn quyền gửi lựa chọn. Vui lòng đăng nhập lại nếu cần.</p></div></main>; }
