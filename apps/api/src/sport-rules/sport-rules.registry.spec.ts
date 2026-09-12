import { SportRulesRegistry } from './sport-rules.registry';
import { SportGroupRulesNotImplementedError } from './sport-rules.errors';

describe('SportRulesRegistry', () => {
  const registry = new SportRulesRegistry();

  it('resolves ONE_ON_ONE_COMBAT', () => {
    expect(registry.resolve('ONE_ON_ONE_COMBAT').code).toBe('ONE_ON_ONE_COMBAT');
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
});
