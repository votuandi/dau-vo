import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import {
  getApiErrorMessage,
  notifyMutationError,
  notifyMutationSuccess,
} from '@/features/admin-management/presentation';
import {
  tournamentAthletesQueryOptions,
  tournamentMatchCountsQueryOptions,
  tournamentMatchesQueryOptions,
  tournamentQueryKeys,
  tournamentWeightClassesQueryOptions,
} from '@/features/admin-management/queries';
import { ApiClientError } from '@/services/api/client';
import {
  adminManagementApi,
  type AdminTournament,
  type BracketPreview,
  type BracketDrawSetup,
  type ActiveBracket,
} from '@/services/api/admin-management';
import { TournamentStatus } from '@/types/shared';
import {
  bracketRoundLabel as roundLabel,
  MatchLifecycle,
} from '@martial-arts-scoring/shared-types';
import { presentDisplayState, presentLifecycle, presentPhase } from '@/features/match-presentation';
import { BracketChart } from './bracket-chart';
import { BracketPreviewPanel } from './bracket-preview-dialog';
import { BracketDrawSetupDialog } from './bracket-draw-setup-dialog';
import { bracketQueryKeys } from './query-keys';
import { WeightClassMatchTabs } from './weight-class-match-tabs';
import { ManualMatchCreationForm } from './manual-match-creation-form';
import { BracketStaffingEditor } from './bracket-staffing-editor';

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
  const matches = useQuery(
    tournamentMatchesQueryOptions(
      tournament.id,
      selectedId ? { weightClassId: selectedId } : { unassigned: true },
    ),
  );
  const matchCounts = useQuery(tournamentMatchCountsQueryOptions(tournament.id));
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
  // Only the documented code means drawing is safe. A failed request is not an absent bracket.
  const isNoBracket =
    bracket.isError &&
    bracket.error instanceof ApiClientError &&
    bracket.error.status === 404 &&
    bracket.error.body.code === 'BRACKET_NOT_FOUND';
  type DrawWorkflow =
    | 'idle'
    | 'loadingSetup'
    | 'configuring'
    | 'generatingPreview'
    | 'reviewingPreview'
    | 'confirming'
    | 'error';
  const [workflow, setWorkflow] = useState<DrawWorkflow>('idle');
  const [preview, setPreview] = useState<BracketPreview | null>(null);
  const [drawSetup, setDrawSetup] = useState<BracketDrawSetup | null>(null);
  const [designatedByeAthleteIds, setDesignatedByeAthleteIds] = useState<readonly string[]>([]);
  // A key is created once for each user action and survives mutation retries.
  const [confirmationKey, setConfirmationKey] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [decisionFixture, setDecisionFixture] = useState<ActiveBracket['fixtures'][number] | null>(
    null,
  );
  const [decisionReason, setDecisionReason] = useState('');
  const [decisionKey, setDecisionKey] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  // Prevent a stale successful query from flashing a bracket after cancellation.
  const [confirmedCancelled, setConfirmedCancelled] = useState(false);
  const drawWeightClassRef = useRef(selectedId);
  const workflowEpochRef = useRef(0);
  const workflowAbortRef = useRef<AbortController | null>(null);
  const winnerReasonRef = useRef<HTMLTextAreaElement>(null);
  const cancelReasonRef = useRef<HTMLTextAreaElement>(null);
  const resetDraw = () => {
    setWorkflow('idle');
    setPreview(null);
    setDrawSetup(null);
    setDesignatedByeAthleteIds([]);
    setConfirmationKey(null);
    setDialogError(null);
  };
  const currentWorkflow = (weightClassId: string, epoch: number) =>
    selectedId === weightClassId && workflowEpochRef.current === epoch;
  const beginWorkflow = (weightClassId: string) => {
    workflowAbortRef.current?.abort();
    const controller = new AbortController();
    workflowAbortRef.current = controller;
    workflowEpochRef.current += 1;
    return { weightClassId, epoch: workflowEpochRef.current, signal: controller.signal };
  };
  useEffect(() => {
    if (drawWeightClassRef.current !== selectedId) {
      workflowAbortRef.current?.abort();
      workflowAbortRef.current = null;
      workflowEpochRef.current += 1;
      resetDraw();
      setCancelOpen(false);
      setCancelError(null);
      setConfirmedCancelled(false);
      drawWeightClassRef.current = selectedId;
    }
  }, [selectedId]);
  const draw = useMutation({
    mutationFn: async (input: {
      readonly context: {
        readonly weightClassId: string;
        readonly epoch: number;
        readonly signal: AbortSignal;
      };
      readonly setupToken: string;
      readonly designatedByeAthleteIds: readonly string[];
    }) => {
      return adminManagementApi.previewBracket(
        tournament.id,
        input.context.weightClassId,
        { setupToken: input.setupToken, designatedByeAthleteIds: input.designatedByeAthleteIds },
        { signal: input.context.signal },
      );
    },
    onSuccess: (value, input) => {
      if (!currentWorkflow(input.context.weightClassId, input.context.epoch)) return;
      setDialogError(null);
      setPreview(value);
      setConfirmationKey(crypto.randomUUID());
      setWorkflow('reviewingPreview');
    },
    onError: (error, input) => {
      if (!currentWorkflow(input.context.weightClassId, input.context.epoch)) return;
      const stale =
        error instanceof ApiClientError &&
        [
          'BRACKET_ROSTER_CHANGED',
          'BRACKET_DRAW_SETUP_EXPIRED',
          'BRACKET_DRAW_SETUP_INVALID',
        ].includes(error.body.code ?? '');
      setDialogError(
        stale
          ? 'Danh sách vận động viên đã thay đổi hoặc phiên thiết lập đã hết hạn.'
          : getApiErrorMessage(error, 'Không thể bốc thăm.'),
      );
      setWorkflow('error');
    },
  });
  const setupDraw = useMutation({
    mutationFn: (context: {
      readonly weightClassId: string;
      readonly epoch: number;
      readonly signal: AbortSignal;
    }) =>
      adminManagementApi.getBracketDrawSetup(tournament.id, context.weightClassId, {
        signal: context.signal,
      }),
    onSuccess: (value, context) => {
      if (!currentWorkflow(context.weightClassId, context.epoch)) return;
      setDialogError(null);
      setDesignatedByeAthleteIds([]);
      setDrawSetup(value);
      setWorkflow('configuring');
    },
    onError: (error, context) => {
      if (!currentWorkflow(context.weightClassId, context.epoch)) return;
      setDialogError(getApiErrorMessage(error, 'Không thể chuẩn bị bốc thăm.'));
      setWorkflow('error');
    },
  });
  const confirm = useMutation({
    mutationFn: (input: {
      readonly context: {
        readonly weightClassId: string;
        readonly epoch: number;
        readonly signal: AbortSignal;
      };
      readonly previewToken: string;
      readonly idempotencyKey: string;
    }) =>
      adminManagementApi.confirmBracket(
        tournament.id,
        input.context.weightClassId,
        { previewToken: input.previewToken, idempotencyKey: input.idempotencyKey },
        { signal: input.context.signal },
      ),
    onSuccess: (_value, input) => {
      if (!currentWorkflow(input.context.weightClassId, input.context.epoch)) return;
      setPreview(null);
      setConfirmationKey(null);
      setDialogError(null);
      setWorkflow('idle');
      notifyMutationSuccess('Đã xác nhận nhánh đấu.');
      void Promise.all([
        qc.invalidateQueries({
          queryKey: bracketQueryKeys.detail(tournament.id, input.context.weightClassId),
        }),
        qc.invalidateQueries({ queryKey: tournamentQueryKeys.matches(tournament.id) }),
        qc.invalidateQueries({ queryKey: tournamentQueryKeys.weightClasses(tournament.id) }),
        qc.invalidateQueries({ queryKey: ['admin', 'tournaments', tournament.id, 'athletes'] }),
      ]);
    },
    onError: (error, input) => {
      if (!currentWorkflow(input.context.weightClassId, input.context.epoch)) return;
      const stale =
        error instanceof ApiClientError &&
        ['BRACKET_ROSTER_CHANGED', 'BRACKET_PREVIEW_EXPIRED', 'BRACKET_PREVIEW_INVALID'].includes(
          error.body.code ?? '',
        );
      if (stale) {
        setConfirmationKey(null);
        setDialogError(
          'Danh sách vận động viên đã thay đổi hoặc phiên bốc thăm đã hết hạn. Hãy bốc thăm mới.',
        );
        setWorkflow('error');
      } else {
        setDialogError(getApiErrorMessage(error, 'Không thể xác nhận nhánh đấu.'));
        setWorkflow('reviewingPreview');
      }
    },
  });
  const prepare = useMutation({
    mutationFn: async (fixtureId: string) => {
      const bracketId = bracket.data?.bracket.id;
      if (!bracketId) throw new Error('Bracket is unavailable');
      return adminManagementApi.prepareBracketFixtureMatch(tournament.id, bracketId, fixtureId);
    },
    onSuccess: (value) => {
      notifyMutationSuccess('Đã chuẩn bị trận đấu.');
      void Promise.all([
        qc.invalidateQueries({
          queryKey: bracketQueryKeys.detail(tournament.id, selectedId ?? ''),
        }),
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
        { entrantId, reason: decisionReason.trim(), idempotencyKey: decisionKey ?? '' },
      );
    },
    onSuccess: () => {
      setDecisionFixture(null);
      setDecisionReason('');
      setDecisionKey(null);
      notifyMutationSuccess('Đã xác định người thắng.');
      void Promise.all([
        qc.invalidateQueries({
          queryKey: bracketQueryKeys.detail(tournament.id, selectedId ?? ''),
        }),
        qc.invalidateQueries({ queryKey: tournamentQueryKeys.matches(tournament.id) }),
      ]);
    },
    onError: (error) => {
      notifyMutationError(error, 'Không thể xác định người thắng. Trạng thái có thể đã thay đổi.');
    },
  });
  const cancelBracket = useMutation({
    mutationFn: () =>
      adminManagementApi.cancelBracket(tournament.id, selectedId ?? '', cancelReason.trim()),
    onSuccess: () => {
      setCancelOpen(false);
      setCancelReason('');
      setCancelError(null);
      setConfirmedCancelled(true);
      qc.removeQueries({
        queryKey: bracketQueryKeys.detail(tournament.id, selectedId ?? ''),
        exact: true,
      });
      void Promise.all([
        qc.invalidateQueries({
          queryKey: bracketQueryKeys.detail(tournament.id, selectedId ?? ''),
        }),
        qc.invalidateQueries({ queryKey: tournamentQueryKeys.weightClasses(tournament.id) }),
        qc.invalidateQueries({ queryKey: tournamentQueryKeys.matches(tournament.id) }),
        qc.invalidateQueries({ queryKey: tournamentQueryKeys.matchCounts(tournament.id) }),
        qc.invalidateQueries({ queryKey: ['admin', 'tournaments', tournament.id, 'athletes'] }),
      ]);
    },
    onError: (error) => {
      setCancelError(getApiErrorMessage(error, 'Không thể hủy nhánh đấu.'));
    },
  });
  const staffing = useMutation({
    mutationFn: (input: {
      readonly weightClassId: string;
      readonly roundNumber: number;
      readonly count: number;
    }) =>
      adminManagementApi.updateBracketRoundStaffing(
        tournament.id,
        input.weightClassId,
        input.roundNumber,
        input.count,
      ),
    onSuccess: (_, input) => {
      if (input.weightClassId !== selectedId) return;
      void qc.invalidateQueries({
        queryKey: bracketQueryKeys.detail(tournament.id, input.weightClassId),
      });
      notifyMutationSuccess('Đã cập nhật số trọng tài.');
    },
    onError: (error) => {
      notifyMutationError(error, 'Không thể cập nhật số trọng tài.');
    },
  });
  const counts = useMemo(
    () =>
      new Map(
        matchCounts.data?.counts.map(({ weightClassId, count }) => [
          weightClassId ?? '__unassigned',
          count,
        ]) ?? [],
      ),
    [matchCounts.data],
  );
  const unassigned = counts.get('__unassigned') ?? 0;
  const blocked =
    !selectedId ||
    athletes.isPending ||
    (athletes.data?.items.length ?? 0) < 2 ||
    tournament.status === TournamentStatus.ARCHIVED ||
    isReadOnly ||
    !isNoBracket;
  const reason = isReadOnly
    ? 'Bạn chỉ có quyền xem.'
    : tournament.status === TournamentStatus.ARCHIVED
      ? 'Giải đấu đã lưu trữ.'
      : athletes.isError
        ? getApiErrorMessage(athletes.error, 'Không thể tải vận động viên. Hãy thử lại.')
        : bracket.isSuccess
          ? 'Hạng cân này đã có nhánh đấu được xác nhận.'
          : bracket.isError
            ? getApiErrorMessage(bracket.error, 'Không thể tải nhánh đấu. Hãy thử lại.')
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
          resetDraw();
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
      {weights.isError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4" role="alert">
          <p className="text-sm text-destructive">
            {getApiErrorMessage(weights.error, 'Không thể tải hạng cân.')}
          </p>
          <Button
            className="mt-3"
            onClick={() => void weights.refetch()}
            size="sm"
            type="button"
            variant="outline"
          >
            Thử lại
          </Button>
        </div>
      ) : null}
      <div id="weight-class-match-panel" role="tabpanel">
        {selectedId ? (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="font-black">{active.find((x) => x.id === selectedId)?.name}</h3>
              </div>
              <Button
                disabled={blocked || draw.isPending || setupDraw.isPending}
                onClick={() => {
                  setConfirmedCancelled(false);
                  setDialogError(null);
                  setWorkflow('loadingSetup');
                  if (selectedId) setupDraw.mutate(beginWorkflow(selectedId));
                }}
                type="button"
              >
                {setupDraw.isPending ? 'Đang chuẩn bị…' : 'Bốc thăm, chia nhánh đấu'}
              </Button>
              {bracket.data?.bracket.status === 'ACTIVE' && !isReadOnly ? (
                <Button
                  disabled={cancelBracket.isPending}
                  onClick={() => {
                    setCancelError(null);
                    setCancelOpen(true);
                  }}
                  type="button"
                  variant="outline"
                >
                  Hủy / bốc thăm lại
                </Button>
              ) : null}
            </div>
            {preview && ['reviewingPreview', 'confirming'].includes(workflow) ? (
              <BracketPreviewPanel
                error={dialogError}
                canConfirm={Boolean(confirmationKey) && !dialogError}
                onCancel={() => {
                  if (!confirm.isPending) {
                    resetDraw();
                  }
                }}
                onConfirm={() => {
                  setWorkflow('confirming');
                  if (selectedId && confirmationKey) {
                    confirm.mutate({
                      context: beginWorkflow(selectedId),
                      previewToken: preview.previewToken,
                      idempotencyKey: confirmationKey,
                    });
                  }
                }}
                onChangeDesignatedAthletes={() => {
                  setPreview(null);
                  setDialogError(null);
                  setWorkflow('configuring');
                }}
                onRedraw={() => {
                  // The old randomized result must not remain visible during a redraw.
                  setPreview(null);
                  setConfirmationKey(null);
                  setDialogError(null);
                  setWorkflow('generatingPreview');
                  if (selectedId && drawSetup) {
                    draw.mutate({
                      context: beginWorkflow(selectedId),
                      setupToken: drawSetup.setupToken,
                      designatedByeAthleteIds,
                    });
                  }
                }}
                pending={draw.isPending || confirm.isPending}
                preview={preview}
              />
            ) : workflow === 'generatingPreview' ? (
              <div
                aria-label="Đang tạo bản xem trước nhánh đấu"
                className="mt-5 h-72 animate-pulse rounded-xl bg-muted"
                role="status"
              >
                <span className="sr-only">Đang tạo bản xem trước nhánh đấu.</span>
              </div>
            ) : workflow === 'error' && !drawSetup ? (
              <div
                className="mt-5 rounded-xl border border-destructive/30 bg-destructive/5 p-4"
                role="alert"
              >
                <p className="text-sm text-destructive">{dialogError}</p>
                <Button
                  className="mt-3"
                  onClick={() => {
                    setWorkflow('loadingSetup');
                    if (selectedId) setupDraw.mutate(beginWorkflow(selectedId));
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Thử lại
                </Button>
              </div>
            ) : confirmedCancelled || isNoBracket ? (
              <p className="mt-5 rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                Hạng cân này chưa được bốc thăm chia nhánh đấu
              </p>
            ) : bracket.data ? (
              <>
                <div className="mt-5">
                  <BracketChart data={bracket.data} />
                </div>
                <BracketStaffingEditor
                  data={bracket.data}
                  disabled={isReadOnly || bracket.data.bracket.status !== 'ACTIVE'}
                  pending={staffing.isPending}
                  onSave={(roundNumber, count) => {
                    staffing.mutate({ weightClassId: selectedId, roundNumber, count });
                  }}
                />
                <FixtureList
                  data={bracket.data}
                  disabled={isReadOnly || prepare.isPending || cancelBracket.isPending}
                  onPrepare={(id) => {
                    prepare.mutate(id);
                  }}
                  onDecide={(fixture) => {
                    setDecisionFixture(fixture);
                    setDecisionKey(crypto.randomUUID());
                  }}
                />
              </>
            ) : bracket.isPending ? (
              <div className="mt-5 h-48 animate-pulse rounded-xl bg-muted" />
            ) : athletes.isError ? (
              <div
                className="mt-5 rounded-xl border border-destructive/30 bg-destructive/5 p-4"
                role="alert"
              >
                <p className="text-sm text-destructive">{reason}</p>
                <Button
                  className="mt-3"
                  onClick={() => void athletes.refetch()}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Thử lại
                </Button>
              </div>
            ) : (
              <div
                className="mt-5 rounded-xl border border-destructive/30 bg-destructive/5 p-4"
                role="alert"
              >
                <p className="text-sm text-destructive">{reason}</p>
                <Button
                  className="mt-3"
                  onClick={() => void bracket.refetch()}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Thử lại
                </Button>
              </div>
            )}
          </>
        ) : (
          <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
            Hạng cân chưa xác định.
          </p>
        )}
      </div>
      {drawSetup && ['configuring', 'generatingPreview', 'error'].includes(workflow) ? (
        <BracketDrawSetupDialog
          error={dialogError}
          onClose={resetDraw}
          onReload={() => {
            setWorkflow('loadingSetup');
            if (selectedId) setupDraw.mutate(beginWorkflow(selectedId));
          }}
          onSubmit={(ids) => {
            setDesignatedByeAthleteIds(ids);
            setDialogError(null);
            setPreview(null);
            setWorkflow('generatingPreview');
            if (selectedId) {
              draw.mutate({
                context: beginWorkflow(selectedId),
                setupToken: drawSetup.setupToken,
                designatedByeAthleteIds: ids,
              });
            }
          }}
          pending={workflow === 'generatingPreview'}
          selectedIds={designatedByeAthleteIds}
          setup={drawSetup}
        />
      ) : null}
      {decisionFixture ? (
        <Dialog
          description="Xác nhận quyết định hòa này và ghi rõ lý do."
          initialFocusRef={winnerReasonRef}
          onClose={() => {
            setDecisionFixture(null);
            setDecisionKey(null);
          }}
          pending={decide.isPending}
          title="Chọn người thắng"
        >
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
            ref={winnerReasonRef}
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
                setDecisionKey(null);
              }}
              type="button"
              variant="outline"
            >
              Hủy
            </Button>
          </div>
        </Dialog>
      ) : null}
      {cancelOpen ? (
        <Dialog
          description="Thao tác này lưu nhánh cũ vào lịch sử và không xóa mã truy cập hay dữ liệu trận đấu."
          initialFocusRef={cancelReasonRef}
          onClose={() => {
            setCancelOpen(false);
          }}
          pending={cancelBracket.isPending}
          title="Hủy nhánh đấu?"
        >
          <textarea
            className="mt-4 w-full rounded border p-2"
            maxLength={500}
            onChange={(e) => {
              setCancelReason(e.target.value);
            }}
            placeholder="Lý do hủy (bắt buộc)"
            ref={cancelReasonRef}
            value={cancelReason}
          />
          {cancelError ? (
            <p className="mt-3 text-sm text-destructive" role="alert">
              {cancelError}
            </p>
          ) : null}
          <div className="mt-4 flex gap-2">
            <Button
              disabled={!cancelReason.trim() || cancelBracket.isPending}
              onClick={() => {
                cancelBracket.mutate();
              }}
              type="button"
            >
              Xác nhận hủy
            </Button>
            <Button
              disabled={cancelBracket.isPending}
              onClick={() => {
                setCancelOpen(false);
              }}
              type="button"
              variant="outline"
            >
              Quay lại
            </Button>
          </div>
        </Dialog>
      ) : null}
      <p aria-atomic="true" aria-live="polite" className="sr-only">
        {workflow === 'loadingSetup'
          ? 'Đang chuẩn bị bốc thăm.'
          : workflow === 'generatingPreview'
            ? 'Đang tạo bản xem trước nhánh đấu.'
            : workflow === 'reviewingPreview'
              ? 'Bản xem trước nhánh đấu đã sẵn sàng.'
              : cancelBracket.isPending
                ? 'Đang hủy nhánh đấu.'
                : confirmedCancelled
                  ? 'Đã hủy nhánh đấu.'
                  : ''}
      </p>
      <div className="grid items-start gap-6 border-t pt-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <StandaloneMatchList matches={matches} />
        <ManualMatchCreationForm
          isReadOnly={isReadOnly}
          tournament={tournament}
          weightClass={
            selectedId ? (active.find((weight) => weight.id === selectedId) ?? null) : null
          }
        />
      </div>
    </section>
  );
}

function StandaloneMatchList({
  matches,
}: {
  readonly matches: ReturnType<
    typeof useQuery<Awaited<ReturnType<typeof adminManagementApi.listMatches>>>
  >;
}) {
  if (matches.isPending)
    return (
      <div className="space-y-3">
        <h3 className="font-black">Trận riêng lẻ</h3>
        <div className="h-16 animate-pulse rounded-xl bg-muted" />
        <div className="h-16 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  if (matches.isError)
    return (
      <div role="alert">
        <h3 className="font-black">Trận riêng lẻ</h3>
        <p className="mt-2 text-sm text-destructive">
          {getApiErrorMessage(matches.error, 'Không thể tải danh sách trận.')}
        </p>
        <Button
          className="mt-3"
          onClick={() => void matches.refetch()}
          size="sm"
          type="button"
          variant="outline"
        >
          Thử lại
        </Button>
      </div>
    );
  const standalone = matches.data.matches.filter((match) => !match.bracketFixtureId);
  return (
    <div>
      <h3 className="font-black">Trận riêng lẻ</h3>
      {standalone.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
          Chưa có trận riêng lẻ trong hạng cân này.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {standalone.map((match) => (
            <li className="rounded-lg border p-3" key={match.id}>
              <Link className="font-bold underline" to={`/admin/matches/${match.id}`}>
                {match.publicId}
              </Link>{' '}
              · {match.athletes.map((athlete) => athlete.name).join(' — ')}
            </li>
          ))}
        </ul>
      )}
    </div>
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
          <h4 className="text-sm font-bold">{roundLabel(round, data.bracket.roundCount)}</h4>
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
                    {f.displayReference} ·{' '}
                    {f.match
                      ? `${presentLifecycle(f.match.lifecycle).label} · ${presentPhase(f.match.phase).label}`
                      : presentDisplayState(f.displayState).label}
                  </div>
                  <p className="text-sm">
                    RED: {person('RED')} — BLUE: {person('BLUE')}
                  </p>
                  {f.winnerEntrant && f.match?.lifecycle === MatchLifecycle.COMPLETED ? (
                    <p className="text-sm">Người thắng: {f.winnerEntrant.snapshotName}</p>
                  ) : null}
                  {f.roundNumber === data.bracket.roundCount && data.bracket.championEntrant ? (
                    <p className="text-sm font-bold">
                      Vô địch: {data.bracket.championEntrant.snapshotName}
                    </p>
                  ) : null}
                  {f.displayState === 'NOT_READY' ? (
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
