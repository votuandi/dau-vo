import type { WatchManualDecisionType } from '@/services/api/watch';

export const MANUAL_DECISION_LABEL: Record<WatchManualDecisionType, string> = {
  WITHDRAWAL_OR_INJURY: 'Thắng do đối thủ bỏ cuộc hoặc chấn thương',
  ADMIN_TIEBREAK: 'Ban tổ chức chỉ định người thắng khi hoà',
  ADMIN_OVERRIDE: 'Ban tổ chức chỉ định người thắng',
};
