import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Download, Loader2, Maximize2, Minimize2 } from 'lucide-react';
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
} from '@/services/api/admin-management';
import { TournamentStatus } from '@/types/shared';
import { BracketChart } from './bracket-chart';
import { downloadBracketPdf } from './download-bracket-pdf';
import { BracketPreviewPanel } from './bracket-preview-dialog';
import { BracketDrawSetupDialog } from './bracket-draw-setup-dialog';
import { BracketAthleteSwapDialog } from './bracket-athlete-swap-dialog';
import { bracketQueryKeys } from './query-keys';
import { WeightClassMatchTabs } from './weight-class-match-tabs';
import { ManualMatchCreationForm } from './manual-match-creation-form';
import { BracketStaffingEditor } from './bracket-staffing-editor';
import { CancelBracketDialog } from './cancel-bracket-dialog';
import { FixtureList } from './fixture-list';
import { bracketPdfFileName, type BracketFixture } from './fixture-presentation';
import { IntermissionDurationForm } from './intermission-duration-form';
import { StandaloneMatchList } from './standalone-match-list';
import { WinnerDecisionDialog } from './winner-decision-dialog';

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
  const selectedWeightClass = active.find((weightClass) => weightClass.id === selectedId);
  const [isBracketExpanded, setIsBracketExpanded] = useState(true);
  const bracketChartRef = useRef<HTMLDivElement>(null);
  const [isDownloadingBracket, setIsDownloadingBracket] = useState(false);
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
  const [byeStrategy, setByeStrategy] = useState<'RANDOM' | 'MANUAL' | 'SEEDED'>('RANDOM');
  // A key is created once for each user action and survives mutation retries.
  const [confirmationKey, setConfirmationKey] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [swapAthleteId, setSwapAthleteId] = useState<string | null>(null);
  const [swapError, setSwapError] = useState<string | null>(null);
  const [decision, setDecision] = useState<{
    readonly fixture: BracketFixture;
    readonly initialWinnerId: string | null;
  } | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  // Prevent a stale successful query from flashing a bracket after cancellation.
  const [confirmedCancelled, setConfirmedCancelled] = useState(false);
  const drawWeightClassRef = useRef(selectedId);
  const workflowEpochRef = useRef(0);
  const workflowAbortRef = useRef<AbortController | null>(null);
  const swapVersionRef = useRef(0);
  const resetDraw = () => {
    setWorkflow('idle');
    setPreview(null);
    setDrawSetup(null);
    setDesignatedByeAthleteIds([]);
    setByeStrategy('RANDOM');
    setConfirmationKey(null);
    setDialogError(null);
    setSwapAthleteId(null);
    setSwapError(null);
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
      setDecision(null);
      setConfirmedCancelled(false);
      setIsBracketExpanded(true);
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
      readonly byeStrategy: 'RANDOM' | 'MANUAL' | 'SEEDED';
    }) => {
      return adminManagementApi.previewBracket(
        tournament.id,
        input.context.weightClassId,
        {
          setupToken: input.setupToken,
          designatedByeAthleteIds: input.designatedByeAthleteIds,
          byeStrategy: input.byeStrategy,
        },
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
  const swap = useMutation({
    mutationFn: (input: {
      readonly athleteId: string;
      readonly swapWithAthleteId: string;
      readonly version: number;
    }) => {
      if (!preview || !selectedId) throw new Error('Bracket preview is unavailable');
      return adminManagementApi.swapPreviewAthlete(tournament.id, selectedId, {
        previewToken: preview.previewToken,
        athleteId: input.athleteId,
        swapWithAthleteId: input.swapWithAthleteId,
      });
    },
    onSuccess: (value, input) => {
      if (input.version !== swapVersionRef.current) return;
      setPreview(value);
      setConfirmationKey(crypto.randomUUID());
      setSwapAthleteId(null);
      setSwapError(null);
    },
    onError: (error, input) => {
      if (input.version !== swapVersionRef.current) return;
      const stale =
        error instanceof ApiClientError &&
        ['BRACKET_ROSTER_CHANGED', 'BRACKET_PREVIEW_EXPIRED', 'BRACKET_PREVIEW_INVALID'].includes(
          error.body.code ?? '',
        );
      setSwapError(
        stale
          ? 'Bản xem trước đã hết hạn hoặc danh sách vận động viên đã thay đổi. Hãy bốc thăm mới.'
          : getApiErrorMessage(error, 'Không thể đổi vị trí vận động viên.'),
      );
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
      notifyMutationSuccess('Đã cập nhật số giám định.');
    },
    onError: (error) => {
      notifyMutationError(error, 'Không thể cập nhật số giám định.');
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
                  onClick={() => {
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
                onEditAthlete={(athleteId) => {
                  setSwapError(null);
                  setSwapAthleteId(athleteId);
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
                      byeStrategy,
                    });
                  }
                }}
                pending={draw.isPending || confirm.isPending || swap.isPending}
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
                <div className="mt-5 rounded-xl border border-border bg-muted/10">
                  <div className="flex items-center justify-between gap-3 p-4">
                    <h4 className="font-bold">Sơ đồ nhánh đấu</h4>
                    <div className="flex items-center gap-2">
                      <Button
                        aria-label="Tải sơ đồ nhánh đấu PDF"
                        aria-busy={isDownloadingBracket}
                        disabled={isDownloadingBracket}
                        onClick={() => {
                          void (async () => {
                            if (!bracketChartRef.current) return;
                            setIsDownloadingBracket(true);
                            try {
                              await downloadBracketPdf(
                                bracketChartRef.current,
                                bracketPdfFileName({
                                  tournamentName: tournament.name,
                                  sportName: tournament.sport.name,
                                  weightClassName: selectedWeightClass?.name ?? selectedId,
                                }),
                              );
                            } catch (error) {
                              notifyMutationError(
                                error,
                                'Không thể tải sơ đồ PDF. Vui lòng thử lại.',
                              );
                            } finally {
                              setIsDownloadingBracket(false);
                            }
                          })();
                        }}
                        size="icon"
                        title="Tải sơ đồ nhánh đấu PDF"
                        type="button"
                        variant="outline"
                      >
                        <Download aria-hidden="true" />
                      </Button>
                      <Button
                        disabled={isDownloadingBracket}
                        aria-controls="bracket-chart"
                        aria-expanded={isBracketExpanded}
                        aria-label={isBracketExpanded ? 'Thu gọn sơ đồ' : 'Mở rộng sơ đồ'}
                        onClick={() => {
                          setIsBracketExpanded((expanded) => !expanded);
                        }}
                        size="icon"
                        title={isBracketExpanded ? 'Thu gọn sơ đồ' : 'Mở rộng sơ đồ'}
                        type="button"
                        variant="outline"
                      >
                        {isBracketExpanded ? (
                          <Minimize2 aria-hidden="true" />
                        ) : (
                          <Maximize2 aria-hidden="true" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <div hidden={!isBracketExpanded} id="bracket-chart" ref={bracketChartRef}>
                    <BracketChart
                      data={bracket.data}
                      decisionDisabled={isReadOnly}
                      onDecideWinner={(fixture, entrantId) => {
                        setDecision({ fixture, initialWinnerId: entrantId });
                      }}
                    />
                  </div>
                </div>
                <BracketStaffingEditor
                  data={bracket.data}
                  disabled={isReadOnly || bracket.data.bracket.status !== 'ACTIVE'}
                  pending={staffing.isPending}
                  onSave={(roundNumber, count) => {
                    staffing.mutate({ weightClassId: selectedId, roundNumber, count });
                  }}
                />
                <IntermissionDurationForm
                  initialSeconds={selectedWeightClass?.intermissionDurationSeconds ?? 0}
                  isReadOnly={isReadOnly}
                  key={`${selectedId}:${String(selectedWeightClass?.intermissionDurationSeconds ?? 0)}`}
                  tournamentId={tournament.id}
                  weightClassId={selectedId}
                />
                <FixtureList
                  data={bracket.data}
                  disabled={isReadOnly || prepare.isPending}
                  onPrepare={(id) => {
                    prepare.mutate(id);
                  }}
                  onDecide={(fixture) => {
                    setDecision({ fixture, initialWinnerId: null });
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
          onSubmit={(ids, byeStrategy) => {
            setDesignatedByeAthleteIds(ids);
            setByeStrategy(byeStrategy);
            setDialogError(null);
            setPreview(null);
            setWorkflow('generatingPreview');
            if (selectedId) {
              draw.mutate({
                context: beginWorkflow(selectedId),
                setupToken: drawSetup.setupToken,
                designatedByeAthleteIds: ids,
                byeStrategy,
              });
            }
          }}
          pending={workflow === 'generatingPreview'}
          selectedIds={designatedByeAthleteIds}
          setup={drawSetup}
        />
      ) : null}
      {isDownloadingBracket ? (
        <Dialog
          title="Đang tạo file PDF nhánh đấu"
          description="Vui lòng chờ trong khi tạo và tải file PDF."
          pending
          onClose={() => {
            // This progress dialog closes when the PDF operation finishes.
          }}
        >
          <div
            className="mt-5 flex justify-center"
            role="status"
            aria-label="Đang tạo file PDF nhánh đấu"
          >
            <Loader2 aria-hidden="true" className="size-8 animate-spin text-primary" />
          </div>
        </Dialog>
      ) : null}
      {decision && selectedId && bracket.data ? (
        <WinnerDecisionDialog
          bracketId={bracket.data.bracket.id}
          fixture={decision.fixture}
          initialWinnerId={decision.initialWinnerId}
          key={decision.fixture.id}
          onClose={() => {
            setDecision(null);
          }}
          tournamentId={tournament.id}
          weightClassId={selectedId}
        />
      ) : null}
      {cancelOpen && selectedId ? (
        <CancelBracketDialog
          onCancelled={() => {
            setCancelOpen(false);
            setConfirmedCancelled(true);
          }}
          onClose={() => {
            setCancelOpen(false);
          }}
          tournamentId={tournament.id}
          weightClassId={selectedId}
        />
      ) : null}
      {preview && swapAthleteId ? (
        <BracketAthleteSwapDialog
          athleteId={swapAthleteId}
          error={swapError}
          onClose={() => {
            if (!swap.isPending) {
              setSwapAthleteId(null);
              setSwapError(null);
            }
          }}
          onSubmit={(swapWithAthleteId) => {
            swapVersionRef.current += 1;
            swap.mutate({
              athleteId: swapAthleteId,
              swapWithAthleteId,
              version: swapVersionRef.current,
            });
          }}
          pending={swap.isPending}
          preview={preview}
        />
      ) : null}
      <p aria-atomic="true" aria-live="polite" className="sr-only">
        {workflow === 'loadingSetup'
          ? 'Đang chuẩn bị bốc thăm.'
          : workflow === 'generatingPreview'
            ? 'Đang tạo bản xem trước nhánh đấu.'
            : workflow === 'reviewingPreview'
              ? 'Bản xem trước nhánh đấu đã sẵn sàng.'
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
