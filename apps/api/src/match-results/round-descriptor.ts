/** Stable identity for a timed scoring segment. Never infer overtime from a
 * display round number: every restarted overtime attempt has its own identity. */
export type RoundDescriptor =
  | { stage: 'REGULATION'; roundNumber: number; attemptNumber: 0 }
  | { stage: 'OVERTIME'; roundNumber: 1; attemptNumber: number };

export function assertRoundDescriptor(
  descriptor: RoundDescriptor,
): RoundDescriptor {
  if (
    descriptor.stage === 'REGULATION' &&
    descriptor.attemptNumber === 0 &&
    Number.isInteger(descriptor.roundNumber) &&
    descriptor.roundNumber >= 1 &&
    descriptor.roundNumber <= 20
  )
    return descriptor;
  if (
    descriptor.stage === 'OVERTIME' &&
    descriptor.roundNumber === 1 &&
    Number.isInteger(descriptor.attemptNumber) &&
    descriptor.attemptNumber >= 1
  )
    return descriptor;
  throw new Error('Invalid round descriptor');
}
