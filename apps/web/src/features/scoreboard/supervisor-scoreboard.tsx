import { useEffect, useState, type ReactNode } from 'react';
import { ApiClientError } from '@/services/api/client';
import { supervisorScoreboardApi, type SupervisorBoardAccess } from '@/services/api/scoreboard';
import type { ScoreboardSource } from './scoreboard-source';
import { ScoreboardAccessForm } from './components/scoreboard-access-form';
import { ScoreboardHeader } from './components/scoreboard-header';
import { useScreenWakeLock } from './display-controls';

export function SupervisorScoreboard({
  source,
  renderMatch,
  onSelect,
}: {
  readonly source: Extract<ScoreboardSource, { kind: 'supervisor' }>;
  readonly renderMatch: (matchPublicId: string, reconnecting: boolean) => ReactNode;
  readonly onSelect: (source: ScoreboardSource) => void;
}) {
  const [access, setAccess] = useState<SupervisorBoardAccess | null>(source.access);
  const [error, setError] = useState('');
  const [reconnecting, setReconnecting] = useState(false);
  useScreenWakeLock();

  const token = access?.token;
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const state = await supervisorScoreboardApi.state(token, controller.signal);
        if (controller.signal.aborted) return;
        setAccess((previous) => previous && { ...previous, ...state });
        setReconnecting(false);
      } catch (cause) {
        if (controller.signal.aborted) return;
        if (cause instanceof ApiClientError && (cause.status === 401 || cause.status === 403)) {
          setAccess(null);
          setError('Mã giám sát đã hết hiệu lực. Vui lòng nhập lại.');
          return;
        }
        setReconnecting(true);
      }
      timer = setTimeout(() => {
        void poll();
      }, 2000);
    };
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [token]);

  if (!access)
    return (
      <main className="arena-background grid min-h-dvh place-items-center p-4 text-white">
        <div className="w-full max-w-lg space-y-6 rounded-3xl border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl">
          <h1 className="text-3xl font-black">Bảng điểm</h1>
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            {error}
          </p>
          <ScoreboardAccessForm source={source} onSelect={onSelect} />
        </div>
      </main>
    );

  if (access.matchPublicId) return renderMatch(access.matchPublicId, reconnecting);

  return (
    <main className="arena-background flex min-h-dvh flex-col gap-[clamp(0.5rem,1.6vmin,1.25rem)] p-[clamp(0.5rem,1.6vmin,1.25rem)] text-white">
      <ScoreboardHeader
        source={source}
        onSelect={onSelect}
        status={reconnecting ? 'disconnected' : 'connected'}
        hasSnapshot
      />
      <section className="grid flex-1 content-center justify-items-center gap-5 p-6 text-center">
        <h1 className="max-w-4xl text-balance text-3xl font-black sm:text-5xl">
          {access.tournamentName}
        </h1>
        <p role="status" className="text-xl font-semibold text-sky-100 sm:text-2xl">
          Trận đấu chưa bắt đầu
        </p>
      </section>
    </main>
  );
}
