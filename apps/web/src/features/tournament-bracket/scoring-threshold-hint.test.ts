import { describe, expect, it } from 'vitest';
import { ScoringThreshold } from '@martial-arts-scoring/shared-types';
import { scoringThresholdHint } from './scoring-threshold-hint';

describe('scoringThresholdHint', () => {
  it.each([
    [
      3,
      true,
      ScoringThreshold.MORE_THAN_HALF,
      'Có 4 người cho điểm: 3 giám định và 1 trọng tài thì VĐV được cộng điểm khi số lượt cho điểm lớn hơn 2',
    ],
    [
      3,
      true,
      ScoringThreshold.AT_LEAST_HALF,
      'Có 4 người cho điểm: 3 giám định và 1 trọng tài thì VĐV được cộng điểm khi số lượt cho điểm lớn hơn hoặc bằng 2',
    ],
    [
      6,
      false,
      ScoringThreshold.MORE_THAN_HALF,
      'Có 6 người cho điểm: 6 giám định và 0 trọng tài thì VĐV được cộng điểm khi số lượt cho điểm lớn hơn 3',
    ],
    [
      6,
      false,
      ScoringThreshold.AT_LEAST_HALF,
      'Có 6 người cho điểm: 6 giám định và 0 trọng tài thì VĐV được cộng điểm khi số lượt cho điểm lớn hơn hoặc bằng 3',
    ],
    [
      2,
      false,
      null,
      'Có 2 người cho điểm: 2 giám định và 0 trọng tài. Hãy chọn điều kiện để xác định khi nào VĐV được cộng điểm.',
    ],
  ] as const)('explains %i judges, TT %s, %s', (judgeCount, supervisorScores, threshold, hint) => {
    expect(scoringThresholdHint({ judgeCount, supervisorScores, threshold })).toBe(hint);
  });
});
