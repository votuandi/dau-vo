import { AthleteColor, MatchAccessRole, MatchStatus, TournamentStatus } from '@/types/shared';
import { ApiClientError } from '@/services/api/client';
import { toast } from '@/components/ui/toast';

const apiErrorMessages: Readonly<Record<string, string>> = {
  INVALID_ACCESS_ROLE: 'Vai trò truy cập không hợp lệ.',
  INVALID_DATE: 'Ngày đã nhập không hợp lệ.',
  INVALID_ID: 'Mã định danh không hợp lệ.',
  INVALID_MATCH: 'Thông tin trận đấu không hợp lệ.',
  INVALID_MATCH_ATHLETES: 'Trận đấu phải có đúng một vận động viên Đỏ và một vận động viên Xanh.',
  DUPLICATE_MATCH_ATHLETE: 'Một vận động viên không thể thi đấu ở cả hai góc.',
  INVALID_TEXT: 'Nội dung đã nhập không hợp lệ.',
  INVALID_TOURNAMENT: 'Thông tin giải đấu không hợp lệ.',
  INVALID_TOURNAMENT_DATE_RANGE: 'Ngày bắt đầu không thể sau ngày kết thúc.',
  MATCH_ACCESS_CODE_NOT_FOUND: 'Không tìm thấy mã truy cập trận đấu.',
  MATCH_ACCESS_CODES_INCOMPLETE: 'Trận đấu chưa có đủ các mã truy cập cần thiết.',
  MATCH_NOT_FOUND: 'Không tìm thấy trận đấu.',
  MATCH_ATHLETE_NOT_FOUND: 'Vận động viên đã không còn trong danh sách đăng ký.',
  MATCH_ATHLETE_INACTIVE: 'Một vận động viên đã ngừng hoạt động. Danh sách đã được làm mới.',
  MATCH_ATHLETE_WEIGHT_CLASS_MISMATCH:
    'Hai vận động viên phải thuộc cùng một hạng cân đang hoạt động.',
  MATCH_ATHLETE_UNIT_INVALID:
    'Đơn vị của vận động viên không còn hoạt động. Danh sách đã được làm mới.',
  MATCH_ATHLETE_REPLACEMENT_UNSAFE: 'Không thể thay vận động viên sau khi trận đã có hoạt động.',
  PUBLIC_MATCH_ID_COLLISION: 'Không thể tạo mã trận đấu duy nhất. Vui lòng thử lại.',
  TOURNAMENT_ARCHIVED: 'Không thể tạo trận trong giải đấu đã lưu trữ.',
  TOURNAMENT_NOT_FOUND: 'Không tìm thấy giải đấu.',
  SPORT_NOT_FOUND: 'Không tìm thấy môn thể thao đã chọn.',
  SPORT_INACTIVE: 'Môn thể thao đã chọn hiện không còn hoạt động.',
  TOURNAMENT_SPORT_CHANGE_NOT_ALLOWED:
    'Không thể đổi môn thể thao sau khi giải đấu đã có trận đấu.',
};

export const tournamentStatuses = [
  TournamentStatus.DRAFT,
  TournamentStatus.ACTIVE,
  TournamentStatus.FINISHED,
  TournamentStatus.ARCHIVED,
] as const;

export const accessCodeRoles = [
  MatchAccessRole.REFEREE_1,
  MatchAccessRole.REFEREE_2,
  MatchAccessRole.REFEREE_3,
  MatchAccessRole.INSPECTOR,
] as const;

export const athleteColors = [AthleteColor.RED, AthleteColor.BLUE] as const;

export const tournamentStatusLabels: Record<TournamentStatus, string> = {
  [TournamentStatus.DRAFT]: 'Bản nháp',
  [TournamentStatus.ACTIVE]: 'Đang diễn ra',
  [TournamentStatus.FINISHED]: 'Đã kết thúc',
  [TournamentStatus.ARCHIVED]: 'Đã lưu trữ',
};

export const matchStatusLabels: Record<MatchStatus, string> = {
  [MatchStatus.WAITING]: 'Chờ thi đấu',
  [MatchStatus.ROUND_1_RUNNING]: 'Hiệp 1',
  [MatchStatus.ROUND_1_PAUSED]: 'Hiệp 1 tạm dừng',
  [MatchStatus.BREAK]: 'Nghỉ giữa hiệp',
  [MatchStatus.ROUND_2_RUNNING]: 'Hiệp 2',
  [MatchStatus.ROUND_2_PAUSED]: 'Hiệp 2 tạm dừng',
  [MatchStatus.FINISHED]: 'Đã kết thúc',
};

export const accessCodeRoleLabels: Record<MatchAccessRole, string> = {
  [MatchAccessRole.REFEREE_1]: 'Trọng tài 1',
  [MatchAccessRole.REFEREE_2]: 'Trọng tài 2',
  [MatchAccessRole.REFEREE_3]: 'Trọng tài 3',
  [MatchAccessRole.INSPECTOR]: 'Giám định viên',
};

export const athleteColorLabels: Record<AthleteColor, string> = {
  [AthleteColor.RED]: 'Đỏ',
  [AthleteColor.BLUE]: 'Xanh',
};

export const inputClassName =
  'mt-2 h-11 w-full rounded-lg border border-input bg-white/80 px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60';

export const textAreaClassName =
  'mt-2 min-h-24 w-full resize-y rounded-lg border border-input bg-white/80 px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60';

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError) {
    const codeMessage = error.body.code ? apiErrorMessages[error.body.code] : undefined;
    if (codeMessage) {
      return codeMessage;
    }

    const message = error.body.message;
    if (
      message &&
      message.length <= 200 &&
      !/[\r\n]/u.test(message) &&
      !/(?:Error:|at\s+\S+\s*\(|stack|Prisma)/iu.test(message)
    ) {
      return message;
    }
  }

  return fallback;
}

export function notifyMutationSuccess(message: string): void {
  toast({ title: message, variant: 'success' });
}

export function notifyMutationError(error: unknown, fallback: string): void {
  console.error('Admin mutation failed', error);
  toast({ title: getApiErrorMessage(error, fallback), variant: 'destructive' });
}

export function formatDate(value: string | null): string {
  if (!value) {
    return 'Chưa đặt';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return formatDateParts(date);
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${formatDateParts(date)} ${formatTimeParts(date)}`;
}

export function formatDateTimeWithSeconds(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${formatDateParts(date)} ${formatTimeParts(date, true)}`;
}

function formatDateParts(date: Date): string {
  return [date.getDate(), date.getMonth() + 1, date.getFullYear()]
    .map((part, index) => (index < 2 ? part.toString().padStart(2, '0') : String(part)))
    .join('/');
}

function formatTimeParts(date: Date, includeSeconds = false): string {
  const parts = [date.getHours(), date.getMinutes()];
  if (includeSeconds) {
    parts.push(date.getSeconds());
  }

  return parts.map((part) => part.toString().padStart(2, '0')).join(':');
}

export function toDateInputValue(value: string | null): string {
  return value?.slice(0, 10) ?? '';
}

export function millisecondsToSeconds(value: number): string {
  return String(value / 1000);
}

export function secondsToMilliseconds(value: string): number | null {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0 || !Number.isInteger(seconds)) {
    return null;
  }

  return seconds * 1000;
}
