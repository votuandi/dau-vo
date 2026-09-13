import type { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import type { EnvironmentVariables } from '../config/environment';
import { BracketPreviewTokenService } from './bracket-preview-token.service';

const tournamentId = '11111111-1111-4111-8111-111111111111';
const weightClassId = '22222222-2222-4222-8222-222222222222';
const now = new Date('2026-09-12T12:00:00.000Z');

function service() {
  return new BracketPreviewTokenService({
    getOrThrow: () => 'preview-secret-that-is-independent-and-long-enough',
  } as unknown as ConfigService<EnvironmentVariables, true>);
}

describe('BracketPreviewTokenService', () => {
  it('signs and verifies context-bound placement and roster claims', () => {
    const tokens = service();
    const issued = tokens.issue(
      {
        tournamentId,
        weightClassId,
        placements: [
          { drawPosition: 1, athleteId: tournamentId },
          { drawPosition: 2, athleteId: null },
        ],
        rosterFingerprint: 'a'.repeat(64),
      },
      now,
    );

    expect(
      tokens.verify(issued.previewToken, { tournamentId, weightClassId }, now),
    ).toMatchObject({
      tournamentId,
      weightClassId,
      rosterFingerprint: 'a'.repeat(64),
      version: 1,
    });
  });

  it('rejects a tampered, expired, or wrong-context token', () => {
    const tokens = service();
    const issued = tokens.issue(
      {
        tournamentId,
        weightClassId,
        placements: [],
        rosterFingerprint: 'a'.repeat(64),
      },
      now,
    );
    const [payload, signature] = issued.previewToken.split('.');
    expect(() =>
      tokens.verify(
        `${payload}x.${signature}`,
        { tournamentId, weightClassId },
        now,
      ),
    ).toThrow('BRACKET_PREVIEW_INVALID');
    expect(() =>
      tokens.verify(
        issued.previewToken,
        { tournamentId: weightClassId, weightClassId },
        now,
      ),
    ).toThrow('BRACKET_PREVIEW_INVALID');
    expect(() =>
      tokens.verify(
        issued.previewToken,
        { tournamentId, weightClassId },
        new Date('2026-09-12T12:05:00.000Z'),
      ),
    ).toThrow('BRACKET_PREVIEW_EXPIRED');
  });

  it.each([
    ['future-issued', { issuedAt: Math.floor(now.getTime() / 1000) + 1 }],
    ['invalid fingerprint', { rosterFingerprint: 'not-a-sha256-fingerprint' }],
    ['invalid placement', { placements: [{ drawPosition: 0, athleteId: 1 }] }],
  ])('rejects signed tokens with %s claims', (unused, override) => {
    const tokens = service();
    const claims = {
      version: 1,
      tournamentId,
      weightClassId,
      placements: [{ drawPosition: 1, athleteId: tournamentId }],
      rosterFingerprint: 'a'.repeat(64),
      issuedAt: 1_789_948_800,
      expiresAt: 1_789_949_100,
      nonce: 'nonce',
      ...override,
    };
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const signature = createHmac(
      'sha256',
      'preview-secret-that-is-independent-and-long-enough',
    )
      .update(payload)
      .digest('base64url');
    expect(() =>
      tokens.verify(
        `${payload}.${signature}`,
        { tournamentId, weightClassId },
        now,
      ),
    ).toThrow('BRACKET_PREVIEW_INVALID');
  });
});
