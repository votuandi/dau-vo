import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { EnvironmentVariables } from '../config/environment';

const TOKEN_VERSION = 1;
const TOKEN_TTL_SECONDS = 5 * 60;

export interface BracketPreviewTokenClaims {
  version: number;
  tournamentId: string;
  weightClassId: string;
  placements: readonly { drawPosition: number; athleteId: string | null }[];
  rosterFingerprint: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
}

@Injectable()
export class BracketPreviewTokenService {
  private readonly secret: string;

  constructor(
    @Inject(ConfigService)
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.secret = config.getOrThrow('BRACKET_PREVIEW_SECRET', { infer: true });
  }

  issue(
    input: Omit<
      BracketPreviewTokenClaims,
      'version' | 'issuedAt' | 'expiresAt' | 'nonce'
    >,
    now = new Date(),
  ): {
    previewToken: string;
    expiresAt: string;
  } {
    const issuedAt = Math.floor(now.getTime() / 1000);
    const expiresAt = issuedAt + TOKEN_TTL_SECONDS;
    const claims: BracketPreviewTokenClaims = {
      ...input,
      version: TOKEN_VERSION,
      issuedAt,
      expiresAt,
      nonce: randomBytes(16).toString('base64url'),
    };
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    return {
      previewToken: `${payload}.${this.signature(payload)}`,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
    };
  }

  verify(
    token: string,
    context: Pick<BracketPreviewTokenClaims, 'tournamentId' | 'weightClassId'>,
    now = new Date(),
  ): BracketPreviewTokenClaims {
    const [payload, signature, ...extra] = token.split('.');
    if (!payload || !signature || extra.length)
      throw new Error('BRACKET_PREVIEW_INVALID');
    const expected = Buffer.from(this.signature(payload));
    const received = Buffer.from(signature);
    if (
      expected.length !== received.length ||
      !timingSafeEqual(expected, received)
    )
      throw new Error('BRACKET_PREVIEW_INVALID');
    let claims: BracketPreviewTokenClaims;
    try {
      claims = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      ) as BracketPreviewTokenClaims;
    } catch {
      throw new Error('BRACKET_PREVIEW_INVALID');
    }
    if (
      claims.version !== TOKEN_VERSION ||
      claims.tournamentId !== context.tournamentId ||
      claims.weightClassId !== context.weightClassId ||
      !Array.isArray(claims.placements) ||
      typeof claims.rosterFingerprint !== 'string' ||
      typeof claims.nonce !== 'string' ||
      !Number.isSafeInteger(claims.issuedAt) ||
      !Number.isSafeInteger(claims.expiresAt)
    )
      throw new Error('BRACKET_PREVIEW_INVALID');
    if (claims.expiresAt <= Math.floor(now.getTime() / 1000))
      throw new Error('BRACKET_PREVIEW_EXPIRED');
    return claims;
  }

  private signature(payload: string): string {
    return createHmac('sha256', this.secret)
      .update(payload)
      .digest('base64url');
  }
}
