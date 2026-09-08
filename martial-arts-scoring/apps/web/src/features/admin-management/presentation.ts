import { AthleteColor, MatchAccessRole, MatchStatus, TournamentStatus } from '@/types/shared';
import { ApiClientError } from '@/services/api/client';

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
  [MatchStatus.BREAK]: 'Nghỉ giữa hiệp',
  [MatchStatus.ROUND_2_RUNNING]: 'Hiệp 2',
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
    return error.body.message ?? fallback;
  }

  return fallback;
}

export function formatDate(value: string | null): string {
  if (!value) {
    return 'Chưa đặt';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' }).format(date);
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
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
