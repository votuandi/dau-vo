import { SportRulesRegistry } from './sport-rules.registry';
import { SportGroupRulesNotImplementedError } from './sport-rules.errors';

describe('SportRulesRegistry', () => {
  const registry = new SportRulesRegistry();

  it('resolves ONE_ON_ONE_COMBAT', () => {
    expect(registry.resolve('ONE_ON_ONE_COMBAT').code).toBe(
      'ONE_ON_ONE_COMBAT',
    );
  });

  it('gives sports in the same group the same definition', () => {
    const voGay = registry.resolve('ONE_ON_ONE_COMBAT');
    const anotherOneOnOneSport = registry.resolve('ONE_ON_ONE_COMBAT');
    expect(anotherOneOnOneSport).toBe(voGay);
  });

  it('fails closed for unsupported groups', () => {
    expect(() => registry.resolve('FUTURE_GROUP')).toThrow(
      SportGroupRulesNotImplementedError,
    );
  });

  it('allows any positive judge count, including even counts', () => {
    const rules = registry.resolve('ONE_ON_ONE_COMBAT');
    expect(rules.minimumRequiredRefereeCount).toBe(1);
    expect(rules.requiresOddRefereeCount).toBe(false);
    expect([1, 2, 3, 4].map(rules.judgeMajority)).toEqual([1, 2, 2, 3]);
  });
});
