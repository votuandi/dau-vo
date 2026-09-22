import { assertRoundDescriptor } from './round-descriptor';

describe('RoundDescriptor', () => {
  it('keeps restarted overtime attempts as independent persisted identities', () => {
    expect(
      assertRoundDescriptor({
        stage: 'OVERTIME',
        roundNumber: 1,
        attemptNumber: 1,
      }),
    ).toEqual({ stage: 'OVERTIME', roundNumber: 1, attemptNumber: 1 });
    expect(
      assertRoundDescriptor({
        stage: 'OVERTIME',
        roundNumber: 1,
        attemptNumber: 2,
      }),
    ).toEqual({ stage: 'OVERTIME', roundNumber: 1, attemptNumber: 2 });
  });

  it('rejects ambiguous descriptors', () => {
    expect(() =>
      assertRoundDescriptor({
        stage: 'OVERTIME',
        roundNumber: 1,
        attemptNumber: 0,
      }),
    ).toThrow('Invalid round descriptor');
  });
});
