import { ScoringThreshold } from '@martial-arts-scoring/shared-types';

/**
 * Spells out the chosen condition for the current scorers, e.g. "Có 4 người cho điểm:
 * 3 giám định và 1 trọng tài thì VĐV được cộng điểm khi số lượt cho điểm lớn hơn 2".
 * Before a condition is chosen it only states the scorers and asks for a choice.
 */
export function scoringThresholdHint(input: {
  readonly judgeCount: number;
  readonly supervisorScores: boolean;
  readonly threshold: ScoringThreshold | null;
}): string {
  const supervisors = input.supervisorScores ? 1 : 0;
  const scorers = input.judgeCount + supervisors;
  const people = `Có ${String(scorers)} người cho điểm: ${String(input.judgeCount)} giám định và ${String(supervisors)} trọng tài`;
  if (input.threshold === null)
    return `${people}. Hãy chọn điều kiện để xác định khi nào VĐV được cộng điểm.`;
  const comparison =
    input.threshold === ScoringThreshold.AT_LEAST_HALF ? 'lớn hơn hoặc bằng' : 'lớn hơn';
  return `${people} thì VĐV được cộng điểm khi số lượt cho điểm ${comparison} ${String(scorers / 2)}`;
}
