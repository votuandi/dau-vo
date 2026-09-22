import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { type InspectorCommandIdentity } from './command-identity';

/**
 * The single locking authorization boundary for inspector mutations.  Legacy
 * credentials are deliberately excluded once a modern assignment exists.
 */
@Injectable()
export class InspectorAuthorizationService {
  async lockAndVerify(
    tx: Prisma.TransactionClient,
    matchId: string,
    identity: InspectorCommandIdentity,
    error: Error,
  ): Promise<void> {
    const rows =
      identity.kind === 'official'
        ? await tx.$queryRaw<Array<{ id: string }>>`
            SELECT a."id"
            FROM "match_official_assignments" a
            JOIN "tournament_official_sessions" s ON s."official_id" = a."official_id"
            WHERE a."id"=${identity.assignmentId}::uuid
              AND a."match_id"=${matchId}::uuid
              AND a."official_id"=${identity.officialId}::uuid
              AND a."role"='INSPECTOR' AND a."released_at" IS NULL
              AND s."id"=${identity.officialSessionId}::uuid
              AND s."active"=true AND s."revoked_at" IS NULL
              AND s."expires_at">clock_timestamp()
            FOR UPDATE OF a, s`
        : await tx.$queryRaw<Array<{ id: string }>>`
            SELECT s."id"
            FROM "match_sessions" s
            JOIN "match_access_codes" c ON c."id" = s."access_code_id"
            WHERE s."id"=${identity.sessionId}::uuid
              AND s."match_id"=${matchId}::uuid
              AND s."token_hash"=${identity.sessionTokenHash}
              AND s."role"='INSPECTOR' AND c."access_role"='INSPECTOR'
              AND s."active"=true AND s."revoked_at" IS NULL
              AND s."expires_at">clock_timestamp()
              AND NOT EXISTS (
                SELECT 1 FROM "match_official_assignments" a
                WHERE a."match_id"=s."match_id" AND a."released_at" IS NULL
              )
            FOR UPDATE OF s`;
    if (rows.length !== 1) throw error;
  }
}
