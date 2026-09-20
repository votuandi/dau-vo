import { describe, expect, it } from 'vitest';
import { MatchDisplayState, MatchLifecycle, MatchPhase } from '@/types/shared';
import {
  presentDisplayState,
  presentLifecycle,
  presentOfficialStatus,
  presentPhase,
} from './match-presentation';

describe('match presentation', () => {
  it.each(Object.values(MatchLifecycle))('presents lifecycle %s', (value) => {
    expect(presentLifecycle(value)).toMatchObject({
      label: expect.any(String),
      variant: expect.any(String),
    });
  });

  it.each(Object.values(MatchDisplayState))('presents display state %s', (value) => {
    expect(presentDisplayState(value)).toMatchObject({
      label: expect.any(String),
      help: expect.any(String),
    });
  });

  it.each(Object.values(MatchPhase))('presents phase %s', (value) => {
    expect(presentPhase(value)).toMatchObject({
      label: expect.any(String),
      variant: expect.any(String),
    });
  });

  it.each(['READY', 'IN_MATCH', 'DISABLED'] as const)('presents official status %s', (value) => {
    expect(presentOfficialStatus(value).label).toMatch(/Sẵn sàng|Trong trận|Đình chỉ/u);
  });
});
