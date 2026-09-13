import type { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../config/environment';
import { BracketDrawSetupTokenService } from './bracket-draw-setup-token.service';
import { summarizeBracket } from './bracket-summary';

const tournamentId = '11111111-1111-4111-8111-111111111111';
const weightClassId = '22222222-2222-4222-8222-222222222222';
const fingerprint = 'a'.repeat(64);
const now = new Date('2026-09-12T12:00:00.000Z');

function service() {
  return new BracketDrawSetupTokenService({
    getOrThrow: () => 'setup-secret-that-is-independent-and-long-enough',
  } as unknown as ConfigService<EnvironmentVariables, true>);
}

describe('BracketDrawSetupTokenService', () => {
  it('rejects token tampering, expiry, wrong scope, and stale roster', () => {
    const tokens = service();
    const issued = tokens.issue(
      {
        tournamentId,
        weightClassId,
        rosterFingerprint: fingerprint,
        summary: summarizeBracket(3),
      },
      now,
    );
    const [payload, signature] = issued.setupToken.split('.');
    expect(() =>
      tokens.verify(
        `${payload}x.${signature}`,
        { tournamentId, weightClassId, rosterFingerprint: fingerprint },
        now,
      ),
    ).toThrow('BRACKET_DRAW_SETUP_INVALID');
    expect(() =>
      tokens.verify(
        issued.setupToken,
        {
          tournamentId: weightClassId,
          weightClassId,
          rosterFingerprint: fingerprint,
        },
        now,
      ),
    ).toThrow('BRACKET_DRAW_SETUP_INVALID');
    expect(() =>
      tokens.verify(
        issued.setupToken,
        {
          tournamentId,
          weightClassId: tournamentId,
          rosterFingerprint: fingerprint,
        },
        now,
      ),
    ).toThrow('BRACKET_DRAW_SETUP_INVALID');
    expect(() =>
      tokens.verify(
        issued.setupToken,
        { tournamentId, weightClassId, rosterFingerprint: 'b'.repeat(64) },
        now,
      ),
    ).toThrow('BRACKET_DRAW_SETUP_INVALID');
    expect(() =>
      tokens.verify(
        issued.setupToken,
        { tournamentId, weightClassId, rosterFingerprint: fingerprint },
        new Date('2026-09-12T12:05:00.000Z'),
      ),
    ).toThrow('BRACKET_DRAW_SETUP_EXPIRED');
  });
});
