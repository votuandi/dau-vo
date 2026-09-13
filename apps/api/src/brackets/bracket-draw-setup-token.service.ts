import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { EnvironmentVariables } from '../config/environment';
import type { BracketSummary } from './bracket-summary';

const TOKEN_VERSION = 1;
const TOKEN_TTL_SECONDS = 5 * 60;

export interface BracketDrawSetupTokenClaims {
  version: number;
  tournamentId: string;
  weightClassId: string;
  rosterFingerprint: string;
  summary: BracketSummary;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
}

@Injectable()
export class BracketDrawSetupTokenService {
  private readonly secret: string;

  constructor(
    @Inject(ConfigService) config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.secret = config.getOrThrow('BRACKET_PREVIEW_SECRET', { infer: true });
  }

  issue(
    input: Omit<
      BracketDrawSetupTokenClaims,
      'version' | 'issuedAt' | 'expiresAt' | 'nonce'
    >,
    now = new Date(),
  ) {
    const issuedAt = Math.floor(now.getTime() / 1000);
    const expiresAt = issuedAt + TOKEN_TTL_SECONDS;
    const claims: BracketDrawSetupTokenClaims = {
      ...input,
      version: TOKEN_VERSION,
      issuedAt,
      expiresAt,
      nonce: randomBytes(16).toString('base64url'),
    };
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    return {
      setupToken: `${payload}.${this.signature(payload)}`,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
    };
  }

  verify(
    token: string,
    context: Pick<
      BracketDrawSetupTokenClaims,
      'tournamentId' | 'weightClassId' | 'rosterFingerprint'
    >,
    now = new Date(),
  ): BracketDrawSetupTokenClaims {
    const [payload, signature, ...extra] = token.split('.');
    if (!payload || !signature || extra.length)
      throw new Error('BRACKET_DRAW_SETUP_INVALID');
    const expected = Buffer.from(this.signature(payload));
    const received = Buffer.from(signature);
    if (
      expected.length !== received.length ||
      !timingSafeEqual(expected, received)
    )
      throw new Error('BRACKET_DRAW_SETUP_INVALID');
    let claims: BracketDrawSetupTokenClaims;
    try {
      claims = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      ) as BracketDrawSetupTokenClaims;
    } catch {
      throw new Error('BRACKET_DRAW_SETUP_INVALID');
    }
    const summary = claims.summary;
    if (
      claims.version !== TOKEN_VERSION ||
      claims.tournamentId !== context.tournamentId ||
      claims.weightClassId !== context.weightClassId ||
      claims.rosterFingerprint !== context.rosterFingerprint ||
      !/^[a-f0-9]{64}$/i.test(claims.rosterFingerprint) ||
      !claims.nonce ||
      !Number.isSafeInteger(claims.issuedAt) ||
      !Number.isSafeInteger(claims.expiresAt) ||
      !summary ||
      typeof summary !== 'object' ||
      !Number.isSafeInteger(summary.athleteCount) ||
      !Number.isSafeInteger(summary.bracketSize) ||
      !Number.isSafeInteger(summary.roundCount) ||
      !Number.isSafeInteger(summary.totalFixtureCount) ||
      !Number.isSafeInteger(summary.firstRoundFixtureCount) ||
      !Number.isSafeInteger(summary.byeCount)
    )
      throw new Error('BRACKET_DRAW_SETUP_INVALID');
    if (
      claims.issuedAt > Math.floor(now.getTime() / 1000) ||
      claims.expiresAt <= claims.issuedAt ||
      claims.expiresAt - claims.issuedAt > TOKEN_TTL_SECONDS
    )
      throw new Error('BRACKET_DRAW_SETUP_INVALID');
    if (claims.expiresAt <= Math.floor(now.getTime() / 1000))
      throw new Error('BRACKET_DRAW_SETUP_EXPIRED');
    return claims;
  }

  private signature(payload: string) {
    return createHmac('sha256', this.secret)
      .update(payload)
      .digest('base64url');
  }
}
