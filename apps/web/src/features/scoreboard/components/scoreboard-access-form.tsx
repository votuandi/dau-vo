import { useId, useState, type SyntheticEvent } from 'react';
import { AlertCircle, ArrowRight, Check, LoaderCircle, RadioTower, Swords } from 'lucide-react';
import { toast } from '@/components/ui/toast';
import { supervisorScoreboardApi } from '@/services/api/scoreboard';
import { normalizeMatchId, validateMatchIdChange } from '../scoreboard-view-model';
import type { ScoreboardSource } from '../scoreboard-source';

/** Shared by initial entry and switching from either tracking mode. */
export function ScoreboardAccessForm({
  source,
  onSelect,
  onCancel,
  onPendingChange,
}: {
  readonly onPendingChange?: (pending: boolean) => void;
  readonly source?: ScoreboardSource;
  readonly onSelect: (source: ScoreboardSource) => void;
  readonly onCancel?: () => void;
}) {
  const hintId = useId();
  const errorId = useId();
  const [mode, setMode] = useState(source?.kind ?? 'match');
  const [matchId, setMatchId] = useState(source?.kind === 'match' ? source.matchPublicId : '');
  const [tournamentCode, setTournamentCode] = useState(
    source?.kind === 'supervisor' ? source.tournamentCode : '',
  );
  const [scoreboardCode, setScoreboardCode] = useState(
    source?.kind === 'supervisor' ? source.scoreboardCode : '',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputClass =
    'mt-2 h-14 w-full rounded-xl border border-slate-400 bg-white px-4 font-mono text-xl font-semibold uppercase tracking-wider text-slate-950 shadow-sm outline-none transition-[border-color,box-shadow] duration-150 placeholder:font-sans placeholder:text-base placeholder:font-normal placeholder:normal-case placeholder:tracking-normal placeholder:text-slate-500 hover:border-slate-500 focus:border-blue-700 focus:ring-4 focus:ring-blue-100 disabled:cursor-wait disabled:bg-slate-100';

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (mode === 'match') {
      const change = validateMatchIdChange(
        matchId,
        source?.kind === 'match' ? source.matchPublicId : '',
      );
      if (!change.ok) {
        setError(change.error);
        toast({ title: change.error, variant: 'destructive' });
        return;
      }
      onSelect({ kind: 'match', matchPublicId: change.matchId });
      return;
    }
    setBusy(true);
    onPendingChange?.(true);
    try {
      const tournament = tournamentCode.trim().toUpperCase();
      const code = scoreboardCode.trim().toUpperCase();
      const access = await supervisorScoreboardApi.login(tournament, code);
      onSelect({ kind: 'supervisor', tournamentCode: tournament, scoreboardCode: code, access });
    } catch {
      setError('Không thể mở bảng điểm. Vui lòng kiểm tra mã giải đấu, mã giám sát và kết nối.');
    } finally {
      setBusy(false);
      onPendingChange?.(false);
    }
  }

  return (
    <form
      className="space-y-6 text-slate-900"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <div
        className="grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1.5"
        aria-label="Cách mở bảng điểm"
      >
        {(['match', 'supervisor'] as const).map((kind) => (
          <button
            key={kind}
            aria-pressed={mode === kind}
            disabled={busy}
            className={`flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border px-2 py-3 text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 disabled:cursor-wait ${mode === kind ? 'border-slate-200 bg-white text-blue-800 shadow-sm' : 'border-transparent text-slate-600 hover:bg-white/70 hover:text-slate-900'}`}
            onClick={() => {
              setMode(kind);
              setError('');
            }}
            type="button"
          >
            {kind === 'match' ? (
              <Swords aria-hidden="true" className="size-4 shrink-0" />
            ) : (
              <RadioTower aria-hidden="true" className="size-4 shrink-0" />
            )}
            {kind === 'match' ? 'Mã trận đấu' : 'Mã giám sát'}
            {mode === kind ? (
              <Check aria-hidden="true" className="hidden size-4 shrink-0 sm:block" />
            ) : null}
          </button>
        ))}
      </div>
      <p id={hintId} className="text-sm leading-6 text-slate-600">
        {mode === 'match'
          ? 'Hiển thị trực tiếp một trận đấu theo mã được nhập.'
          : 'Bảng điểm tự chuyển theo trận giám sát đang điều hành.'}
      </p>
      {mode === 'match' ? (
        <label className="block text-sm font-semibold text-slate-800">
          Mã trận đấu
          <input
            autoCapitalize="characters"
            autoComplete="off"
            autoFocus
            className={inputClass}
            aria-describedby={error ? errorId : hintId}
            aria-invalid={Boolean(error)}
            maxLength={32}
            spellCheck={false}
            placeholder="VD: A72K9P"
            required
            disabled={busy}
            value={matchId}
            onChange={(event) => {
              setMatchId(event.target.value);
            }}
          />
        </label>
      ) : (
        <>
          <label className="block text-sm font-semibold text-slate-800">
            Mã giải đấu
            <input
              autoCapitalize="characters"
              autoComplete="off"
              className={inputClass}
              aria-describedby={error ? errorId : hintId}
              aria-invalid={Boolean(error)}
              maxLength={32}
              required
              disabled={busy}
              value={tournamentCode}
              onChange={(event) => {
                setTournamentCode(event.target.value);
              }}
            />
          </label>
          <label className="block text-sm font-semibold text-slate-800">
            Mã xem bảng điểm của giám sát
            <input
              autoCapitalize="characters"
              autoComplete="off"
              className={inputClass}
              aria-describedby={error ? errorId : hintId}
              aria-invalid={Boolean(error)}
              maxLength={32}
              autoFocus
              placeholder="VD: GS01"
              required
              disabled={busy}
              value={scoreboardCode}
              onChange={(event) => {
                setScoreboardCode(event.target.value);
              }}
            />
          </label>
        </>
      )}
      {mode === 'supervisor' ? (
        <p className="text-sm leading-6 text-slate-600">
          Dùng mã xem cố định như GS01, không phải mã đăng nhập điều hành.
        </p>
      ) : null}
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-800"
        >
          <AlertCircle aria-hidden="true" className="mt-1 size-4 shrink-0" />
          {error}
        </p>
      ) : null}
      <div className="flex gap-3 border-t border-slate-200 pt-5">
        {onCancel ? (
          <button
            className="min-h-12 cursor-pointer rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 disabled:cursor-wait"
            onClick={onCancel}
            type="button"
            disabled={busy}
          >
            Hủy
          </button>
        ) : null}
        <button
          className="flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors duration-150 hover:bg-blue-800 active:bg-blue-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none"
          disabled={
            busy ||
            (mode === 'match'
              ? !normalizeMatchId(matchId)
              : !tournamentCode.trim() || !scoreboardCode.trim())
          }
          type="submit"
        >
          {busy ? (
            <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" />
          ) : null}
          {busy ? 'ĐANG KẾT NỐI' : source ? 'LƯU MÃ THEO DÕI' : 'MỞ BẢNG ĐIỂM'}
          {!busy ? <ArrowRight aria-hidden="true" className="size-4" /> : null}
        </button>
      </div>
    </form>
  );
}
