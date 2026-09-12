import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { GeneratedAccessCodesPanel } from '@/components/generated-access-codes-panel';
import {
  getApiErrorMessage,
  notifyMutationError,
  notifyMutationSuccess,
} from '@/features/admin-management/presentation';
import {
  tournamentAthletesQueryOptions,
  tournamentMatchesQueryOptions,
  tournamentQueryKeys,
  tournamentWeightClassesQueryOptions,
} from '@/features/admin-management/queries';
import { ApiClientError } from '@/services/api/client';
import {
  adminManagementApi,
  type AdminMatch,
  type AdminTournament,
  type BracketPreview,
  type GeneratedAccessCode,
  type ActiveBracket,
} from '@/services/api/admin-management';
import { TournamentStatus } from '@/types/shared';
import { BracketChart } from './bracket-chart';
import { BracketPreviewDialog } from './bracket-preview-dialog';
import { bracketQueryKeys } from './query-keys';
import { WeightClassMatchTabs } from './weight-class-match-tabs';

export function TournamentMatchesPage({
  tournament,
  isReadOnly,
}: {
  readonly tournament: AdminTournament;
  readonly isReadOnly: boolean;
}) {
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const weights = useQuery(tournamentWeightClassesQueryOptions(tournament.id));
  const matches = useQuery(tournamentMatchesQueryOptions(tournament.id));
  const active = useMemo(
    () => weights.data?.weightClasses.filter((x) => x.isActive) ?? [],
    [weights.data],
  );
  const selectedParam = params.get('weightClassId');
  const selectedId =
    selectedParam === '__unassigned'
      ? null
      : active.some((x) => x.id === selectedParam)
        ? selectedParam
        : (active[0]?.id ?? null);
  useEffect(() => {
    if (weights.isSuccess && selectedParam !== '__unassigned' && selectedId !== selectedParam)
      setParams(
        (old) => {
          const next = new URLSearchParams(old);
          if (selectedId) next.set('weightClassId', selectedId);
          else next.delete('weightClassId');
          return next;
        },
        { replace: true },
      );
  }, [selectedId, selectedParam, setParams, weights.isSuccess]);
  const athletes = useQuery({
    ...tournamentAthletesQueryOptions(tournament.id, {
      page: 1,
      pageSize: 100,
      isActive: true,
      ...(selectedId ? { weightClassId: selectedId } : {}),
    }),
    enabled: Boolean(selectedId),
  });
  const bracket = useQuery({
    queryKey: bracketQueryKeys.detail(tournament.id, selectedId ?? ''),
    queryFn: () => adminManagementApi.getBracket(tournament.id, selectedId ?? ''),
    enabled: Boolean(selectedId),
    retry: false,
  });
  const [preview, setPreview] = useState<BracketPreview | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [generatedCodes, setGeneratedCodes] = useState<readonly GeneratedAccessCode[]>([]);
  const [preparedMatch, setPreparedMatch] = useState<AdminMatch | null>(null);
  const [decisionFixture, setDecisionFixture] = useState<ActiveBracket['fixtures'][number] | null>(
    null,
  );
  const [decisionReason, setDecisionReason] = useState('');
  const draw = useMutation({
    mutationFn: () => adminManagementApi.previewBracket(tournament.id, selectedId ?? ''),
    onSuccess: (value) => {
      setDialogError(null);
      setPreview(value);
    },
    onError: (error) => {
      notifyMutationError(error, 'Không thể bốc thăm.');
    },
  });
  const confirm = useMutation({
    mutationFn: () =>
      adminManagementApi.confirmBracket(tournament.id, selectedId ?? '', {
        previewToken: preview?.previewToken ?? '',
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: () => {
      setPreview(null);
      setDialogError(null);
      notifyMutationSuccess('Đã xác nhận nhánh đấu.');
      void Promise.all([
        qc.invalidateQueries({ queryKey: bracketQueryKeys.all }),
        qc.invalidateQueries({ queryKey: tournamentQueryKeys.matches(tournament.id) }),
        qc.invalidateQueries({ queryKey: tournamentQueryKeys.weightClasses(tournament.id) }),
        qc.invalidateQueries({ queryKey: ['admin', 'tournaments', tournament.id, 'athletes'] }),
      ]);
    },
    onError: (error) => {
      const stale =
        error instanceof ApiClientError &&
        ['BRACKET_ROSTER_CHANGED', 'BRACKET_PREVIEW_EXPIRED', 'BRACKET_PREVIEW_INVALID'].includes(
          error.body.code ?? '',
        );
      if (stale) {
        setPreview(null);
        setDialogError(
          'Danh sách vận động viên đã thay đổi hoặc phiên bốc thăm đã hết hạn. Hãy bốc thăm mới.',
        );
      } else setDialogError(getApiErrorMessage(error, 'Không thể xác nhận nhánh đấu.'));
    },
  });
  const prepare = useMutation({
    mutationFn: async (fixtureId: string) => {
      const bracketId = bracket.data?.bracket.id;
      if (!bracketId) throw new Error('Bracket is unavailable');
      return adminManagementApi.prepareBracketFixtureMatch(tournament.id, bracketId, fixtureId);
    },
    onSuccess: (value) => {
      setGeneratedCodes(value.accessCodes);
      setPreparedMatch(value.match);
      notifyMutationSuccess('Đã chuẩn bị trận đấu.');
      void Promise.all([
        qc.invalidateQueries({ queryKey: bracketQueryKeys.all }),
        qc.invalidateQueries({ queryKey: tournamentQueryKeys.matches(tournament.id) }),
        qc.invalidateQueries({ queryKey: ['admin', 'matches', value.match.id] }),
      ]);
    },
    onError: (error) => {
      notifyMutationError(error, 'Không thể chuẩn bị trận đấu.');
    },
  });
  const decide = useMutation({
    mutationFn: async (entrantId: string) => {
      if (!bracket.data || !decisionFixture) throw new Error('Fixture is unavailable');
      return adminManagementApi.decideBracketFixtureWinner(
        tournament.id,
        bracket.data.bracket.id,
        decisionFixture.id,
        { entrantId, reason: decisionReason.trim(), idempotencyKey: crypto.randomUUID() },
      );
    },
    onSuccess: () => {
      setDecisionFixture(null);
      setDecisionReason('');
      notifyMutationSuccess('Đã xác định người thắng.');
      void Promise.all([
        qc.invalidateQueries({ queryKey: bracketQueryKeys.all }),
        qc.invalidateQueries({ queryKey: tournamentQueryKeys.matches(tournament.id) }),
      ]);
    },
    onError: (error) => {
      notifyMutationError(error, 'Không thể xác định người thắng. Trạng thái có thể đã thay đổi.');
    },
  });
  const counts = useMemo(
    () =>
      new Map<string, number>(
        matches.data?.matches.reduce((map, match) => {
          const key = match.weightClassId ?? '__unassigned';
          map.set(key, (map.get(key) ?? 0) + 1);
          return map;
        }, new Map<string, number>()) ?? [],
      ),
    [matches.data],
  );
  const unassigned = counts.get('__unassigned') ?? 0;
  const blocked =
    !selectedId ||
    athletes.isPending ||
    (athletes.data?.items.length ?? 0) < 2 ||
    tournament.status === TournamentStatus.ARCHIVED ||
    isReadOnly ||
    bracket.isSuccess;
  const reason = isReadOnly
    ? 'Bạn chỉ có quyền xem.'
    : tournament.status === TournamentStatus.ARCHIVED
      ? 'Giải đấu đã lưu trữ.'
      : bracket.isSuccess
        ? 'Hạng cân này đã có nhánh đấu được xác nhận.'
        : athletes.isPending
          ? 'Đang tải vận động viên.'
          : !selectedId
            ? 'Chưa có hạng cân hoạt động.'
            : 'Cần ít nhất hai vận động viên đang hoạt động.';
  return (
    <section className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
      <div>
        <h2 className="text-xl font-black">Các trận đấu</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Nhánh đấu theo hạng cân và các trận riêng lẻ.
        </p>
      </div>
      <WeightClassMatchTabs
        classes={active}
        counts={counts}
        onSelect={(id) => {
          setParams((old) => {
            const next = new URLSearchParams(old);
            if (id) next.set('weightClassId', id);
            else next.set('weightClassId', '__unassigned');
            return next;
          });
        }}
        selectedId={selectedId}
        unassignedCount={unassigned}
      />
      <div id="weight-class-match-panel" role="tabpanel">
        {selectedId ? (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="font-black">{active.find((x) => x.id === selectedId)?.name}</h3>
              </div>
              <Button
                disabled={blocked || draw.isPending}
                onClick={() => {
                  draw.mutate();
                }}
                type="button"
              >
                {draw.isPending ? 'Đang bốc thăm…' : 'Bốc thăm, chia nhánh đấu'}
              </Button>
            </div>
            {bracket.data ? (
              <>
                <div className="mt-5">
                  <BracketChart data={bracket.data} />
                </div>
                <FixtureList
                  data={bracket.data}
                  disabled={isReadOnly || prepare.isPending}
                  onPrepare={(id) => {
                    prepare.mutate(id);
                  }}
                  onDecide={(fixture) => {
                    setDecisionFixture(fixture);
                  }}
                />
              </>
            ) : bracket.isPending ? (
              <div className="mt-5 h-48 animate-pulse rounded-xl bg-muted" />
            ) : (
              <p className="mt-5 text-sm text-muted-foreground">{reason}</p>
            )}
          </>
        ) : (
          <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
            Hạng cân chưa xác định.
          </p>
        )}
      </div>
      {generatedCodes.length && preparedMatch ? (
        <GeneratedAccessCodesPanel
          accessCodes={generatedCodes}
          matchPublicId={preparedMatch.publicId}
          onDismiss={() => {
            setGeneratedCodes([]);
          }}
          title={`Mã truy cập trận ${preparedMatch.publicId}`}
        />
      ) : null}
      {decisionFixture ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4"
          role="dialog"
          aria-labelledby="winner-decision-title"
        >
          <div className="w-full max-w-md rounded-xl bg-card p-5 shadow-xl">
            <h3 className="font-black" id="winner-decision-title">
              Chọn người thắng
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Xác nhận quyết định hòa này và ghi rõ lý do.
            </p>
            <label className="mt-4 block text-sm font-bold" htmlFor="winner-reason">
              Lý do
            </label>
            <textarea
              className="mt-1 w-full rounded border p-2"
              id="winner-reason"
              maxLength={500}
              onChange={(e) => {
                setDecisionReason(e.target.value);
              }}
              value={decisionReason}
            />
            <div className="mt-4 flex flex-wrap gap-2">
              {decisionFixture.slots.map((slot) => {
                const entrant = slot.resolvedEntrant;
                return entrant ? (
                  <Button
                    disabled={decide.isPending || !decisionReason.trim()}
                    key={slot.side}
                    onClick={() => {
                      decide.mutate(entrant.id);
                    }}
                    type="button"
                  >
                    Chọn {entrant.snapshotName}
                  </Button>
                ) : null;
              })}
              <Button
                disabled={decide.isPending}
                onClick={() => {
                  setDecisionFixture(null);
                }}
                type="button"
                variant="outline"
              >
                Hủy
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="border-t pt-5">
        <h3 className="font-black">Trận riêng lẻ</h3>
        {matches.data?.matches
          .filter(
            (m) =>
              !m.bracketFixtureId &&
              (selectedId ? m.weightClassId === selectedId : m.weightClassId === null),
          )
          .map((match) => (
            <li className="mt-3 rounded-lg border p-3" key={match.id}>
              <Link className="font-bold underline" to={`/admin/matches/${match.id}`}>
                {match.publicId}
              </Link>{' '}
              · {match.athletes.map((a) => a.name).join(' — ')}
            </li>
          ))}
      </div>
      {preview ? (
        <BracketPreviewDialog
          error={dialogError}
          onCancel={() => {
            if (!confirm.isPending) {
              setPreview(null);
              setDialogError(null);
            }
          }}
          onConfirm={() => {
            confirm.mutate();
          }}
          onRedraw={() => {
            draw.mutate();
          }}
          pending={draw.isPending || confirm.isPending}
          preview={preview}
        />
      ) : null}
    </section>
  );
}

function FixtureList({
  data,
  disabled,
  onPrepare,
  onDecide,
}: {
  readonly data: ActiveBracket;
  readonly disabled: boolean;
  readonly onPrepare: (id: string) => void;
  readonly onDecide: (fixture: ActiveBracket['fixtures'][number]) => void;
}) {
  const groups = new Map<number, typeof data.fixtures>();
  for (const f of data.fixtures)
    groups.set(f.roundNumber, [...(groups.get(f.roundNumber) ?? []), f]);
  return (
    <div className="mt-5 space-y-4">
      <h3 className="font-black">Lịch fixture theo vòng</h3>
      {[...groups].map(([round, fixtures]) => (
        <section key={round}>
          <h4 className="text-sm font-bold">
            {round === data.bracket.roundCount ? 'Chung kết' : `Vòng ${String(round)}`}
          </h4>
          <ul className="mt-2 space-y-2">
            {fixtures.map((f) => {
              const person = (side: 'RED' | 'BLUE') => {
                const s = f.slots.find((x) => x.side === side);
                return (
                  s?.resolvedEntrant?.snapshotName ??
                  (s?.sourceFixtureId
                    ? `Chờ người thắng ${data.fixtures.find((x) => x.id === s.sourceFixtureId)?.displayReference ?? ''}`
                    : 'Chờ xác định')
                );
              };
              return (
                <li className="rounded-xl border p-3" key={f.id}>
                  <div className="font-bold">
                    {f.displayReference} · {f.status}
                  </div>
                  <p className="text-sm">
                    RED: {person('RED')} — BLUE: {person('BLUE')}
                  </p>
                  {f.winnerEntrant ? (
                    <p className="text-sm">Người thắng: {f.winnerEntrant.snapshotName}</p>
                  ) : null}
                  {f.roundNumber === data.bracket.roundCount && data.bracket.championEntrant ? (
                    <p className="text-sm font-bold">
                      Vô địch: {data.bracket.championEntrant.snapshotName}
                    </p>
                  ) : null}
                  {f.status === 'PENDING_PARTICIPANTS' ? (
                    <p className="text-sm text-muted-foreground">
                      Đang chờ kết quả các trận trước.
                    </p>
                  ) : null}
                  {f.status === 'READY' ? (
                    <Button
                      className="mt-2"
                      disabled={disabled}
                      onClick={() => {
                        onPrepare(f.id);
                      }}
                      size="sm"
                      type="button"
                    >
                      Chuẩn bị trận
                    </Button>
                  ) : null}
                  {f.status === 'MATCH_PREPARED' && f.match ? (
                    <Link
                      className="mt-2 inline-block text-sm font-bold underline"
                      to={`/admin/matches/${f.match.id}`}
                    >
                      Mở trận {f.match.publicId}
                    </Link>
                  ) : null}
                  {f.status === 'AWAITING_WINNER' ? (
                    <>
                      <p className="text-sm text-muted-foreground">Chờ xác định người thắng.</p>
                      <Button
                        className="mt-2"
                        disabled={disabled}
                        onClick={() => {
                          onDecide(f);
                        }}
                        size="sm"
                        type="button"
                      >
                        Chọn người thắng
                      </Button>
                    </>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
