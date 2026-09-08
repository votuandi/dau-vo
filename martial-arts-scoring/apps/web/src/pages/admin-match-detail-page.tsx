import { useState, type SyntheticEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { GeneratedAccessCodesPanel } from '@/components/generated-access-codes-panel';
import { ClipboardCopyButton } from '@/components/ui/clipboard-copy-button';
import { AdminMatchMonitoring } from '@/features/admin-management/admin-match-monitoring';
import { Button } from '@/components/ui/button';
import {
  accessCodeRoleLabels,
  accessCodeRoles,
  formatDateTime,
  getApiErrorMessage,
  inputClassName,
  matchStatusLabels,
  millisecondsToSeconds,
  secondsToMilliseconds,
} from '@/features/admin-management/presentation';
import {
  matchQueryKeys,
  matchQueryOptions,
  tournamentQueryKeys,
} from '@/features/admin-management/queries';
import {
  adminManagementApi,
  type AdminMatch,
  type GeneratedAccessCode,
  type MatchAthleteInput,
  type UpdateMatchInput,
} from '@/services/api/admin-management';
import { AthleteColor, type MatchAccessRole } from '@/types/shared';

interface AthleteFormValue {
  readonly name: string;
  readonly organization: string;
}

function getAthleteValue(match: AdminMatch, color: AthleteColor): AthleteFormValue {
  const athlete = match.athletes.find((item) => item.color === color);
  return athlete
    ? { name: athlete.name, organization: athlete.organization }
    : { name: '', organization: '' };
}

function toAthleteInput(color: AthleteColor, value: AthleteFormValue): MatchAthleteInput {
  return {
    color,
    name: value.name.trim(),
    organization: value.organization.trim(),
  };
}

function MatchEditor({ match }: { readonly match: AdminMatch }) {
  const queryClient = useQueryClient();
  const [roundDurationSeconds, setRoundDurationSeconds] = useState(
    millisecondsToSeconds(match.roundDurationMs),
  );
  const [breakDurationSeconds, setBreakDurationSeconds] = useState(
    millisecondsToSeconds(match.breakDurationMs),
  );
  const [redAthlete, setRedAthlete] = useState(() => getAthleteValue(match, AthleteColor.RED));
  const [blueAthlete, setBlueAthlete] = useState(() => getAthleteValue(match, AthleteColor.BLUE));
  const [validationError, setValidationError] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: (input: UpdateMatchInput) => adminManagementApi.updateMatch(match.id, input),
    onSuccess: async (response) => {
      queryClient.setQueryData(matchQueryKeys.detail(match.id), response);
      await queryClient.invalidateQueries({
        queryKey: tournamentQueryKeys.matches(match.tournamentId),
      });
    },
  });

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    updateMutation.reset();

    const roundDurationMs = secondsToMilliseconds(roundDurationSeconds);
    const breakDurationMs = secondsToMilliseconds(breakDurationSeconds);
    if (roundDurationMs === null || breakDurationMs === null) {
      setValidationError('Thời lượng phải là số giây nguyên lớn hơn 0.');
      return;
    }
    if (
      !redAthlete.name.trim() ||
      !redAthlete.organization.trim() ||
      !blueAthlete.name.trim() ||
      !blueAthlete.organization.trim()
    ) {
      setValidationError('Nhập đầy đủ tên và đơn vị cho cả hai vận động viên.');
      return;
    }

    setValidationError(null);
    updateMutation.mutate({
      roundDurationMs,
      breakDurationMs,
      athletes: [
        toAthleteInput(AthleteColor.RED, redAthlete),
        toAthleteInput(AthleteColor.BLUE, blueAthlete),
      ],
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
      <h2 className="text-xl font-black tracking-tight">Cấu hình trận đấu</h2>
      <form className="mt-5 space-y-6" noValidate onSubmit={handleSubmit}>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-sm font-semibold">Trạng thái</p>
            <div className="mt-2 flex h-11 items-center rounded-md border border-input bg-muted/40 px-3 text-sm font-bold">
              {matchStatusLabels[match.status]}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Trạng thái được điều khiển bởi giám định viên trong trận đấu.
            </p>
          </div>
          <div>
            <label className="text-sm font-semibold" htmlFor="round-duration">
              Thời lượng hiệp (giây)
            </label>
            <input
              className={inputClassName}
              disabled={updateMutation.isPending}
              id="round-duration"
              min={1}
              onChange={(event) => {
                setRoundDurationSeconds(event.target.value);
              }}
              step={1}
              type="number"
              value={roundDurationSeconds}
            />
          </div>
          <div>
            <label className="text-sm font-semibold" htmlFor="break-duration">
              Thời gian nghỉ (giây)
            </label>
            <input
              className={inputClassName}
              disabled={updateMutation.isPending}
              id="break-duration"
              min={1}
              onChange={(event) => {
                setBreakDurationSeconds(event.target.value);
              }}
              step={1}
              type="number"
              value={breakDurationSeconds}
            />
          </div>
        </div>

        <fieldset className="grid gap-4 md:grid-cols-2" disabled={updateMutation.isPending}>
          <legend className="mb-3 text-sm font-bold">Vận động viên</legend>
          <div className="rounded-xl border-2 border-red-200 bg-red-50/60 p-4">
            <h3 className="font-black text-red-800">Góc Đỏ</h3>
            <label className="mt-3 block text-sm font-semibold" htmlFor="edit-red-athlete-name">
              Họ tên
            </label>
            <input
              className={inputClassName}
              id="edit-red-athlete-name"
              maxLength={255}
              onChange={(event) => {
                setRedAthlete((current) => ({ ...current, name: event.target.value }));
              }}
              value={redAthlete.name}
            />
            <label
              className="mt-3 block text-sm font-semibold"
              htmlFor="edit-red-athlete-organization"
            >
              Đơn vị
            </label>
            <input
              className={inputClassName}
              id="edit-red-athlete-organization"
              maxLength={255}
              onChange={(event) => {
                setRedAthlete((current) => ({ ...current, organization: event.target.value }));
              }}
              value={redAthlete.organization}
            />
          </div>
          <div className="rounded-xl border-2 border-blue-200 bg-blue-50/60 p-4">
            <h3 className="font-black text-blue-800">Góc Xanh</h3>
            <label className="mt-3 block text-sm font-semibold" htmlFor="edit-blue-athlete-name">
              Họ tên
            </label>
            <input
              className={inputClassName}
              id="edit-blue-athlete-name"
              maxLength={255}
              onChange={(event) => {
                setBlueAthlete((current) => ({ ...current, name: event.target.value }));
              }}
              value={blueAthlete.name}
            />
            <label
              className="mt-3 block text-sm font-semibold"
              htmlFor="edit-blue-athlete-organization"
            >
              Đơn vị
            </label>
            <input
              className={inputClassName}
              id="edit-blue-athlete-organization"
              maxLength={255}
              onChange={(event) => {
                setBlueAthlete((current) => ({ ...current, organization: event.target.value }));
              }}
              value={blueAthlete.organization}
            />
          </div>
        </fieldset>

        {validationError ? (
          <p className="text-sm text-destructive" role="alert">
            {validationError}
          </p>
        ) : null}
        {updateMutation.isError ? (
          <p
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            role="alert"
          >
            {getApiErrorMessage(updateMutation.error, 'Không thể cập nhật trận đấu.')}
          </p>
        ) : null}
        {updateMutation.isSuccess ? (
          <p className="text-sm font-semibold text-emerald-700" role="status">
            Đã lưu thông tin trận đấu.
          </p>
        ) : null}

        <Button disabled={updateMutation.isPending} type="submit">
          {updateMutation.isPending ? 'Đang lưu…' : 'Lưu thay đổi'}
        </Button>
      </form>
    </section>
  );
}

function AccessCodesManager({ match }: { readonly match: AdminMatch }) {
  const queryClient = useQueryClient();
  const [generatedCodes, setGeneratedCodes] = useState<readonly GeneratedAccessCode[]>([]);

  const regenerateMutation = useMutation({
    mutationFn: (role: MatchAccessRole | 'ALL') =>
      role === 'ALL'
        ? adminManagementApi.regenerateAllMatchCodes(match.id)
        : adminManagementApi.regenerateMatchCode(match.id, role),
    onSuccess: async (response) => {
      setGeneratedCodes(response.accessCodes);
      await queryClient.invalidateQueries({ queryKey: matchQueryKeys.detail(match.id) });
    },
  });

  function regenerate(role: MatchAccessRole | 'ALL') {
    const label = role === 'ALL' ? 'toàn bộ bốn mã' : `mã ${accessCodeRoleLabels[role]}`;
    if (
      window.confirm(`Tạo lại ${label}? Mọi phiên đang dùng mã cũ tương ứng sẽ bị vô hiệu hóa.`)
    ) {
      regenerateMutation.reset();
      setGeneratedCodes([]);
      regenerateMutation.mutate(role);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-black tracking-tight">Mã truy cập trận</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Hệ thống chỉ lưu mã đã băm. Tạo lại mã sẽ đăng xuất các phiên đang dùng thông tin cũ.
          </p>
        </div>
        <Button
          disabled={regenerateMutation.isPending}
          onClick={() => {
            regenerate('ALL');
          }}
          type="button"
          variant="destructive"
        >
          {regenerateMutation.isPending && regenerateMutation.variables === 'ALL'
            ? 'Đang tạo lại…'
            : 'Tạo lại cả 4 mã'}
        </Button>
      </div>

      {generatedCodes.length > 0 ? (
        <div className="mt-6">
          <GeneratedAccessCodesPanel
            accessCodes={generatedCodes}
            matchPublicId={match.publicId}
            onDismiss={() => {
              setGeneratedCodes([]);
            }}
          />
        </div>
      ) : null}
      {regenerateMutation.isError ? (
        <p
          className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          role="alert"
        >
          {getApiErrorMessage(regenerateMutation.error, 'Không thể tạo lại mã truy cập.')}
        </p>
      ) : null}

      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {accessCodeRoles.map((role) => {
          const metadata = match.accessCodes.find((accessCode) => accessCode.role === role);
          return (
            <li className="rounded-xl border border-border p-4" key={role}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold">{accessCodeRoleLabels[role]}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {metadata ? `Cập nhật ${formatDateTime(metadata.updatedAt)}` : 'Chưa có mã'}
                  </p>
                </div>
                <Button
                  disabled={regenerateMutation.isPending}
                  onClick={() => {
                    regenerate(role);
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {regenerateMutation.isPending && regenerateMutation.variables === role
                    ? 'Đang tạo…'
                    : 'Tạo lại'}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function AdminMatchDetailPage() {
  const { matchId } = useParams<{ matchId: string }>();
  if (!matchId) {
    return <p className="mx-auto w-full max-w-4xl text-sm text-destructive">Thiếu mã trận đấu.</p>;
  }

  return <MatchDetailContent matchId={matchId} />;
}

function MatchDetailContent({ matchId }: { readonly matchId: string }) {
  const matchQuery = useQuery(matchQueryOptions(matchId));

  if (matchQuery.isPending) {
    return (
      <p className="mx-auto w-full max-w-6xl text-sm text-muted-foreground">Đang tải trận đấu…</p>
    );
  }

  if (matchQuery.isError) {
    return (
      <section
        className="mx-auto w-full max-w-xl rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700"
        role="alert"
      >
        <h1 className="text-xl font-black">Không thể mở trận đấu</h1>
        <p className="mt-2 text-sm">
          {getApiErrorMessage(
            matchQuery.error,
            'Trận đấu không tồn tại hoặc máy chủ không phản hồi.',
          )}
        </p>
        <div className="mt-4 flex gap-2">
          <Button onClick={() => void matchQuery.refetch()} size="sm" type="button">
            Thử lại
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/admin/tournaments">Về danh sách giải</Link>
          </Button>
        </div>
      </section>
    );
  }

  const match = matchQuery.data.match;
  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <header>
        <Link
          className="text-sm font-semibold text-muted-foreground hover:text-foreground"
          to={`/admin/tournaments/${match.tournamentId}`}
        >
          ← Về giải đấu
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-4xl font-black tracking-[0.18em] md:text-5xl">
            {match.publicId}
          </h1>
          <ClipboardCopyButton
            accessibleLabel="Sao chép mã trận đấu"
            label="Sao chép ID"
            value={match.publicId}
          />
          <span className="rounded-full border border-primary/10 bg-accent px-3 py-1 text-xs font-bold text-accent-foreground">
            {matchStatusLabels[match.status]}
          </span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Match ID công khai · Tạo {formatDateTime(match.createdAt)}
        </p>
      </header>

      <MatchEditor key={match.updatedAt} match={match} />
      <AdminMatchMonitoring matchId={match.id} />
      <AccessCodesManager match={match} />
    </div>
  );
}
