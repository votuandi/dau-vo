import type { ConfigService } from '@nestjs/config';

import type { EnvironmentVariables } from '../config/environment';
import { MatchCredentialGeneratorService } from './match-credential-generator.service';

describe('MatchCredentialGeneratorService', () => {
  const generator = new MatchCredentialGeneratorService({
    getOrThrow: jest.fn().mockReturnValue(6),
  } as unknown as ConfigService<EnvironmentVariables, true>);

  it('generates human-friendly tournament public codes', () => {
    expect(generator.generateTournamentPublicCode()).toMatch(
      /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$/,
    );
  });
});
