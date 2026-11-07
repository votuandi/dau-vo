import { describe, expect, it } from 'vitest';
import { MatchDisplayState, MatchLifecycle, MatchPhase } from '@/types/shared';
import {
  presentDisplayState,
  presentLifecycle,
  presentOfficialStatus,
  presentPhase,
} from './match-presentation';

describe('match presentation', () => {
  const lifecycles: readonly MatchLifecycle[] = [
    MatchLifecycle.READY,
    MatchLifecycle.IN_PROGRESS,
    MatchLifecycle.SUSPENDED,
    MatchLifecycle.COMPLETED,
  ];
  const displayStates: readonly MatchDisplayState[] = [
    MatchDisplayState.NOT_READY,
    MatchDisplayState.READY,
    MatchDisplayState.IN_PROGRESS,
    MatchDisplayState.SUSPENDED,
    MatchDisplayState.COMPLETED,
  ];
  const phases: readonly MatchPhase[] = [
    MatchPhase.WAITING,
    MatchPhase.ROUND_1_RUNNING,
    MatchPhase.ROUND_1_PAUSED,
    MatchPhase.BREAK,
    MatchPhase.ROUND_2_RUNNING,
    MatchPhase.ROUND_2_PAUSED,
    MatchPhase.AWAITING_RESULT_SAVE,
    MatchPhase.FINISHED,
  ];

  it.each(lifecycles)('presents lifecycle %s', (value) => {
    const presentation = presentLifecycle(value);
    expect(typeof presentation.label).toBe('string');
    expect(typeof presentation.variant).toBe('string');
  });

  it.each(displayStates)('presents display state %s', (value) => {
    const presentation = presentDisplayState(value);
    expect(typeof presentation.label).toBe('string');
    expect(typeof presentation.help).toBe('string');
  });

  it.each(phases)('presents phase %s', (value) => {
    const presentation = presentPhase(value);
    expect(typeof presentation.label).toBe('string');
    expect(typeof presentation.variant).toBe('string');
  });

  it('uses the actual regulation round number and the next round during breaks', () => {
    expect(presentPhase(MatchPhase.ROUND_2_RUNNING, 3).label).toBe('Hiệp 3');
    expect(presentPhase(MatchPhase.ROUND_2_PAUSED, 3).label).toBe('Hiệp 3 tạm dừng');
    expect(presentPhase(MatchPhase.BREAK, 2).help).toBe('Chờ bắt đầu hiệp 3.');
  });

  it.each(['READY', 'IN_MATCH', 'DISABLED'] as const)('presents official status %s', (value) => {
    expect(presentOfficialStatus(value).label).toMatch(/Sẵn sàng|Trong trận|Đình chỉ/u);
  });
});
