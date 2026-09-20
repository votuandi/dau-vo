import { MatchDisplayState, MatchLifecycle, MatchPhase } from '@/types/shared';

export type MatchSemanticVariant = 'neutral' | 'info' | 'warning' | 'success' | 'danger';

export interface MatchPresentation {
  readonly label: string;
  readonly help: string;
  readonly variant: MatchSemanticVariant;
}

const impossible = (value: never): never => {
  throw new Error(`Unsupported match presentation value: ${String(value)}`);
};

export function presentLifecycle(value: MatchLifecycle): MatchPresentation {
  switch (value) {
    case MatchLifecycle.NOT_STARTED:
      return {
        label: 'Chưa bắt đầu',
        help: 'Trận đã được chuẩn bị và đang chờ bắt đầu.',
        variant: 'neutral',
      };
    case MatchLifecycle.IN_PROGRESS:
      return { label: 'Đang diễn ra', help: 'Trận đang được điều hành.', variant: 'info' };
    case MatchLifecycle.SUSPENDED:
      return {
        label: 'Tạm hoãn',
        help: 'Điểm và kết quả đã ghi nhận được giữ lại.',
        variant: 'warning',
      };
    case MatchLifecycle.COMPLETED:
      return { label: 'Hoàn thành', help: 'Kết quả chính thức đã được lưu.', variant: 'success' };
    default:
      return impossible(value);
  }
}

export function presentDisplayState(value: MatchDisplayState): MatchPresentation {
  switch (value) {
    case MatchDisplayState.NOT_READY:
      return {
        label: 'Chưa sẵn sàng',
        help: 'Đang chờ kết quả các trận trước.',
        variant: 'neutral',
      };
    case MatchDisplayState.READY:
      return { label: 'Sẵn sàng', help: 'Có thể chuẩn bị trận.', variant: 'info' };
    case MatchDisplayState.NOT_STARTED:
      return {
        label: 'Chưa bắt đầu',
        help: 'Trận đã được chuẩn bị và đang chờ bắt đầu.',
        variant: 'neutral',
      };
    case MatchDisplayState.IN_PROGRESS:
      return { label: 'Đang diễn ra', help: 'Trận đang được điều hành.', variant: 'info' };
    case MatchDisplayState.SUSPENDED:
      return {
        label: 'Tạm hoãn',
        help: 'Điểm và kết quả đã ghi nhận được giữ lại.',
        variant: 'warning',
      };
    case MatchDisplayState.COMPLETED:
      return { label: 'Hoàn thành', help: 'Kết quả chính thức đã được lưu.', variant: 'success' };
    default:
      return impossible(value);
  }
}

export function presentPhase(value: MatchPhase): MatchPresentation {
  switch (value) {
    case MatchPhase.WAITING:
      return { label: 'Chờ bắt đầu', help: 'Chờ bắt đầu hiệp 1.', variant: 'neutral' };
    case MatchPhase.ROUND_1_RUNNING:
      return { label: 'Hiệp 1', help: 'Hiệp 1 đang diễn ra.', variant: 'info' };
    case MatchPhase.ROUND_1_PAUSED:
      return { label: 'Hiệp 1 tạm dừng', help: 'Đồng hồ đang dừng.', variant: 'warning' };
    case MatchPhase.BREAK:
      return { label: 'Nghỉ giữa hiệp', help: 'Chờ bắt đầu hiệp 2.', variant: 'neutral' };
    case MatchPhase.ROUND_2_RUNNING:
      return { label: 'Hiệp 2', help: 'Hiệp 2 đang diễn ra.', variant: 'info' };
    case MatchPhase.ROUND_2_PAUSED:
      return { label: 'Hiệp 2 tạm dừng', help: 'Đồng hồ đang dừng.', variant: 'warning' };
    case MatchPhase.AWAITING_RESULT_SAVE:
      return {
        label: 'Chờ xác nhận kết quả',
        help: 'Các hiệp đã kết thúc, chờ giám định xác nhận kết quả.',
        variant: 'warning',
      };
    case MatchPhase.FINISHED:
      return {
        label: 'Kết quả cuối cùng',
        help: 'Kết quả chính thức đã được lưu.',
        variant: 'success',
      };
    default:
      return impossible(value);
  }
}

export function presentOfficialStatus(value: 'READY' | 'IN_MATCH' | 'DISABLED'): MatchPresentation {
  switch (value) {
    case 'READY':
      return { label: 'Sẵn sàng', help: 'Có thể được phân công.', variant: 'success' };
    case 'IN_MATCH':
      return { label: 'Trong trận', help: 'Đang được phân công ở một trận.', variant: 'info' };
    case 'DISABLED':
      return { label: 'Đình chỉ', help: 'Không thể được phân công.', variant: 'danger' };
    default:
      return impossible(value);
  }
}

export const matchVariantClassName: Record<MatchSemanticVariant, string> = {
  neutral: 'border-border bg-muted text-foreground',
  info: 'border-sky-200 bg-sky-50 text-sky-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  danger: 'border-red-200 bg-red-50 text-red-800',
};

export function isRunningPhase(phase: MatchPhase | undefined): boolean {
  return phase === MatchPhase.ROUND_1_RUNNING || phase === MatchPhase.ROUND_2_RUNNING;
}

export function isPausedPhase(phase: MatchPhase | undefined): boolean {
  return phase === MatchPhase.ROUND_1_PAUSED || phase === MatchPhase.ROUND_2_PAUSED;
}
