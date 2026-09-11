import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type LegacyAdmin = {
  id: string;
  username: string;
  ownedTournamentCount: bigint;
  proposedTournamentLimit: bigint;
};

async function main() {
  // This is intentionally a single read-only SELECT. It is safe to run before
  // `prisma migrate deploy` once the subscriptions schema is present.
  const affected = await prisma.$queryRaw<LegacyAdmin[]>`
    SELECT
      u.id::text AS "id",
      u.username AS "username",
      COUNT(t.id) FILTER (WHERE t.soft_deleted_at IS NULL) AS "ownedTournamentCount",
      GREATEST(3, COUNT(t.id) FILTER (WHERE t.soft_deleted_at IS NULL)) AS "proposedTournamentLimit"
    FROM users u
    LEFT JOIN admin_entitlements e ON e.user_id = u.id
    LEFT JOIN tournaments t ON t.owner_user_id = u.id
    WHERE u.role = 'ADMIN'
      AND u.is_active = true
      AND u.deleted_at IS NULL
      AND e.user_id IS NULL
    GROUP BY u.id, u.username
    ORDER BY u.created_at ASC, u.id ASC;
  `;

  if (affected.length === 0) {
    console.log(
      'No active, non-deleted legacy ADMIN users require a transitional entitlement.',
    );
    return;
  }

  console.log(
    `${affected.length} legacy ADMIN user(s) will receive a 12-month transitional entitlement:`,
  );
  console.table(
    affected.map((admin) => ({
      id: admin.id,
      username: admin.username,
      ownedNonSoftDeletedTournaments: Number(admin.ownedTournamentCount),
      proposedTournamentLimit: Number(admin.proposedTournamentLimit),
    })),
  );
}

main()
  .catch((error: unknown) => {
    console.error('Legacy ADMIN entitlement preflight failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
