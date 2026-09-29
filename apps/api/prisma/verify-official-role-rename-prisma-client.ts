import { PrismaClient } from '@prisma/client';

const databaseUrl = process.env.DATABASE_URL;
const databaseName = 'official_role_rename_upgrade';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertDisposableUrl(url: string | undefined): asserts url is string {
  assert(
    url,
    'DATABASE_URL is required for the disposable Prisma contract check.',
  );
  const parsed = new URL(url);
  assert(
    ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname),
    'Refusing a non-loopback DATABASE_URL.',
  );
  assert(
    parsed.pathname === `/${databaseName}`,
    'Refusing a DATABASE_URL outside the disposable verification database.',
  );
}

async function main() {
  assertDisposableUrl(databaseUrl);
  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });

  try {
    const legacyJudge = await prisma.tournamentOfficial.findUniqueOrThrow({
      where: { id: '00000000-0000-0000-0000-000000000007' },
      include: { assignments: { orderBy: { id: 'asc' } } },
    });
    const legacySupervisor = await prisma.tournamentOfficial.findUniqueOrThrow({
      where: { id: '00000000-0000-0000-0000-000000000006' },
    });
    const legacyVote = await prisma.judgeVote.findUniqueOrThrow({
      where: { id: '00000000-0000-0000-0000-000000000015' },
    });
    const legacyResult = await prisma.roundAthleteResult.findUniqueOrThrow({
      where: { id: '00000000-0000-0000-0000-000000000053' },
    });
    const legacyAdjustment =
      await prisma.matchAppealAdjustment.findUniqueOrThrow({
        where: { id: '00000000-0000-0000-0000-000000000055' },
      });
    const sessions = await prisma.matchSession.findMany({
      where: {
        id: {
          in: [
            '00000000-0000-0000-0000-000000000010',
            '00000000-0000-0000-0000-000000000011',
            '00000000-0000-0000-0000-000000000018',
          ],
        },
      },
      orderBy: { id: 'asc' },
    });
    assert(legacyJudge.role === 'JUDGE', 'REFEREE did not map to JUDGE.');
    assert(
      legacySupervisor.role === 'SUPERVISOR',
      'INSPECTOR did not map to SUPERVISOR.',
    );
    assert(
      [legacyJudge.role, legacySupervisor.role].join(':') ===
        'JUDGE:SUPERVISOR',
      'Role directions were swapped.',
    );
    assert(
      legacyVote.judgeSlot === 'JUDGE_1',
      'Legacy vote did not retain JUDGE_1.',
    );
    assert(
      legacyResult.judgePoints === 3,
      'Legacy referee_points did not map to judgePoints.',
    );
    assert(
      legacyAdjustment.baseJudgeScore === 3,
      'Legacy base_referee_score did not map to baseJudgeScore.',
    );
    assert(
      sessions[0]?.role === 'SUPERVISOR' && sessions[0]?.active,
      'Legacy inspector session did not retain active SUPERVISOR state.',
    );
    assert(
      sessions[1]?.role === 'JUDGE' && sessions[1]?.active,
      'Legacy referee session did not retain active JUDGE state.',
    );
    assert(
      sessions[2]?.role === 'JUDGE' &&
        !sessions[2]?.active &&
        sessions[2]?.revokedAt,
      'Revoked legacy judge session was not preserved.',
    );
    assert(
      legacyJudge.assignments.length === 2 &&
        legacyJudge.assignments.some((assignment) => assignment.releasedAt),
      'Released legacy judge assignment was not preserved.',
    );

    const tournamentId = '00000000-0000-0000-0000-000000000004';
    const matchId = '00000000-0000-0000-0000-000000000005';
    const judge = await prisma.tournamentOfficial.create({
      data: {
        id: '00000000-0000-0000-0000-000000000041',
        tournamentId,
        role: 'JUDGE',
        name: 'Prisma judge',
        normalizedName: 'prisma judge',
        passcodeHash: 'hash',
        passcodeLookupDigest: 'c'.repeat(64),
      },
    });
    const supervisor = await prisma.tournamentOfficial.create({
      data: {
        id: '00000000-0000-0000-0000-000000000042',
        tournamentId,
        role: 'SUPERVISOR',
        name: 'Prisma supervisor',
        normalizedName: 'prisma supervisor',
        passcodeHash: 'hash',
        passcodeLookupDigest: 'd'.repeat(64),
      },
    });
    const judgeCode = await prisma.matchAccessCode.create({
      data: {
        id: '00000000-0000-0000-0000-000000000043',
        matchId,
        role: 'JUDGE_2',
        codeHash: 'prisma-judge-code',
      },
    });
    const supervisorCode = await prisma.matchAccessCode.create({
      data: {
        id: '00000000-0000-0000-0000-000000000044',
        matchId,
        role: 'SUPERVISOR',
        codeHash: 'prisma-supervisor-code',
      },
    });
    await prisma.matchSession.createMany({
      data: [
        {
          id: '00000000-0000-0000-0000-000000000045',
          matchId,
          accessCodeId: judgeCode.id,
          role: 'JUDGE',
          judgeSlot: 'JUDGE_2',
          deviceId: 'prisma-judge-device',
          tokenHash: 'prisma-judge-token',
        },
        {
          id: '00000000-0000-0000-0000-000000000046',
          matchId,
          accessCodeId: supervisorCode.id,
          role: 'SUPERVISOR',
          deviceId: 'prisma-supervisor-device',
          tokenHash: 'prisma-supervisor-token',
          active: false,
          revokedAt: new Date(),
        },
      ],
    });
    assert(
      (await prisma.tournamentOfficial.count({
        where: {
          id: { in: [judge.id, supervisor.id] },
          role: { in: ['JUDGE', 'SUPERVISOR'] },
        },
      })) === 2,
      'Prisma could not query new role enum writes.',
    );

    const assignmentsBefore = await prisma.matchOfficialAssignment.count();
    let rejected = false;
    try {
      await prisma.$transaction(async (tx) => {
        await tx.matchOfficialAssignment.create({
          data: {
            matchId,
            tournamentId,
            officialId: judge.id,
            role: 'JUDGE',
            judgePosition: 3,
            assignedBySupervisorId: judge.id,
          },
        });
      });
    } catch {
      rejected = true;
    }
    assert(rejected, 'Invalid cross-role assignment unexpectedly committed.');
    assert(
      (await prisma.matchOfficialAssignment.count()) === assignmentsBefore,
      'Invalid cross-role transaction was not rolled back.',
    );
    console.log(
      'Generated Prisma client role-rename contract verification passed.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();
