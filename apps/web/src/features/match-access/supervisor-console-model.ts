import {
  MatchExitMode,
  type MatchCompletionBlockedReason,
  type ResultCapabilityBlockedReason,
} from '@martial-arts-scoring/shared-types';
import type { RealtimeConnectionStatus } from './match-realtime';

/* Pure presentation and validation rules for the supervisor console. */

export interface ExitOption {
  readonly description: string;
  readonly destructive: boolean;
  readonly title: string;
}

export function exitOption(mode: MatchExitMode): ExitOption {
  switch (mode) {
    case MatchExitMode.CANCEL_RESULTS:
      return {
        title: 'Hủy kết quả',
        description: 'Toàn bộ kết quả hiện tại bị vô hiệu và trận trở về Chưa bắt đầu.',
        destructive: true,
      };
    case MatchExitMode.SUSPEND_KEEP_ROUND_1:
      return {
        title: 'Thoát và lưu kết quả hiệp 1',
        description: 'Dữ liệu hiệp 2 (nếu có) bị bỏ; trận chuyển sang Tạm hoãn.',
        destructive: false,
      };
    case MatchExitMode.SUSPEND_KEEP_ROUNDS_1_AND_2:
      return {
        title: 'Thoát và lưu kết quả 2 hiệp',
        description: 'Giữ cả hai hiệp, chưa chốt kết quả; trận chuyển sang Tạm hoãn.',
        destructive: false,
      };
    case MatchExitMode.SUSPEND_KEEP_V2_PHASE:
      return {
        title: 'Thoát và lưu trạng thái hiện tại',
        description: 'Giữ trạng thái V2 hiện tại để tiếp tục theo xác nhận của máy chủ.',
        destructive: false,
      };
    default:
      return mode satisfies never;
  }
}

export const connectionLabels: Record<RealtimeConnectionStatus, string> = {
  'authentication-required': 'Mất kết nối',
  connected: 'Đã kết nối',
  connecting: 'Đang kết nối lại',
  disconnected: 'Mất kết nối',
  error: 'Mất kết nối',
  reconnecting: 'Đang kết nối lại',
  revoked: 'Mất kết nối',
};

export const connectionDotClasses: Record<RealtimeConnectionStatus, string> = {
  'authentication-required': 'bg-red-500',
  connected: 'bg-emerald-400',
  connecting: 'bg-amber-400',
  disconnected: 'bg-red-500',
  error: 'bg-red-500',
  reconnecting: 'bg-amber-400',
  revoked: 'bg-red-500',
};

export const completionBlockedReasonLabels: Record<MatchCompletionBlockedReason, string> = {
  ALREADY_COMPLETED: 'Kết quả đã được lưu.',
  INVALIDATED_ROUND: 'Có hiệp đã bị hủy kết quả.',
  MATCH_SUSPENDED: 'Trận đang tạm hoãn.',
  NOT_AWAITING_RESULT_SAVE: 'Trận chưa ở bước chờ lưu kết quả.',
  RESULT_DECISION_REQUIRED: 'Cần xác định kết quả trận đấu trước khi lưu.',
  ROUND_1_NOT_ENDED: 'Hiệp 1 chưa kết thúc.',
  ROUND_2_NOT_ENDED: 'Hiệp 2 chưa kết thúc.',
  UNRESOLVED_SCORING_WINDOW: 'Đang chờ hoàn tất chấm điểm.',
};

export const appealBlockedReasonLabels: Record<ResultCapabilityBlockedReason, string> = {
  APPEAL_ALREADY_COMPLETED: 'Phúc khảo đã hoàn thành.',
  MATCH_COMPLETED: 'Trận đấu đã hoàn thành.',
  MATCH_SUSPENDED: 'Trận đấu đang tạm hoãn.',
  NOT_AWAITING_PUBLICATION: 'Trận đấu chưa ở bước công bố kết quả.',
  NOT_OVERTIME_READY: 'Trận đấu chưa sẵn sàng cho phúc khảo hiệp phụ.',
  NOT_REGULATION_APPEAL: 'Trận đấu chưa ở bước phúc khảo sau hiệp 2.',
  ROUND_SUMMARIES_MISSING: 'Thiếu dữ liệu chấm điểm đã chốt của các hiệp.',
  UNRESOLVED_SCORING_WINDOW: 'Đang chờ hoàn tất chấm điểm.',
};

export type AppealDraft = Record<'redBonus' | 'redPenalty' | 'blueBonus' | 'bluePenalty', string>;
export const emptyAppealDraft: AppealDraft = {
  redBonus: '0',
  redPenalty: '0',
  blueBonus: '0',
  bluePenalty: '0',
};
export function appealNumber(value: string): number | null {
  return /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) <= 99
    ? Number(value)
    : null;
}
export function newIdempotencyKey(): string {
  return globalThis.crypto.randomUUID();
}

export function completionHelp(
  blockedReasons: readonly MatchCompletionBlockedReason[] | undefined,
): string {
  if (!blockedReasons) return 'Đang đồng bộ điều kiện lưu kết quả từ máy chủ.';
  if (blockedReasons.length === 0) return '';
  return blockedReasons.map((reason) => completionBlockedReasonLabels[reason]).join(' ');
}
