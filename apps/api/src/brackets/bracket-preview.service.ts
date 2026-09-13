import { createHash } from 'node:crypto';
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BracketStatus, TournamentStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { SportRulesRegistry } from '../sport-rules/sport-rules.registry';
import { SportGroupRulesNotImplementedError } from '../sport-rules/sport-rules.errors';
import {
  cryptoRandomSource,
  generateSingleEliminationBracket,
} from './single-elimination-bracket.generator';
import { BracketPreviewTokenService } from './bracket-preview-token.service';
import { BracketDrawSetupTokenService } from './bracket-draw-setup-token.service';
import type { PreviewBracketDto } from './dto/preview-bracket.dto';
import { MAX_BRACKET_ATHLETES, summarizeBracket } from './bracket-summary';

const TOURNAMENT_NOT_FOUND = {
  code: 'TOURNAMENT_NOT_FOUND',
  message: 'Tournament not found',
};
const WEIGHT_CLASS_NOT_FOUND = {
  code: 'WEIGHT_CLASS_NOT_FOUND',
  message: 'Weight class not found',
};

@Injectable()
export class BracketPreviewService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SportRulesRegistry) private readonly sportRules: SportRulesRegistry,
    @Inject(BracketPreviewTokenService)
    private readonly tokens: BracketPreviewTokenService,
    @Inject(BracketDrawSetupTokenService)
    private readonly setupTokens: BracketDrawSetupTokenService,
  ) {}

  async preview(
    tournamentId: string,
    weightClassId: string,
    input: PreviewBracketDto,
  ) {
    const tournament = await this.prisma.tournament.findFirst({
      where: { id: tournamentId, softDeletedAt: null },
      select: {
        status: true,
        sport: { select: { sportGroup: { select: { code: true } } } },
      },
    });
    if (!tournament) throw new NotFoundException(TOURNAMENT_NOT_FOUND);
    if (tournament.status === TournamentStatus.ARCHIVED)
      throw new ConflictException({
        code: 'TOURNAMENT_ARCHIVED',
        message: 'Archived tournaments cannot create bracket previews',
      });
    const weightClass = await this.prisma.tournamentWeightClass.findFirst({
      where: { id: weightClassId, tournamentId, isActive: true },
      select: { id: true },
    });
    if (!weightClass) throw new NotFoundException(WEIGHT_CLASS_NOT_FOUND);
    try {
      const rules = this.sportRules.resolve(tournament.sport.sportGroup.code);
      if (rules.athleteColors.length !== 2)
        throw new ConflictException({
          code: 'BRACKET_SPORT_GROUP_UNSUPPORTED',
          message:
            'Sport group does not support two-participant single-elimination brackets',
        });
    } catch (error) {
      if (error instanceof SportGroupRulesNotImplementedError)
        throw new ConflictException({
          code: 'BRACKET_SPORT_GROUP_UNSUPPORTED',
          message:
            'Sport group does not support two-participant single-elimination brackets',
        });
      throw error;
    }
    const activeBracket = await this.prisma.tournamentBracket.findFirst({
      where: {
        tournamentId,
        weightClassId,
        status: { in: [BracketStatus.ACTIVE, BracketStatus.COMPLETED] },
      },
      select: { id: true },
    });
    if (activeBracket)
      throw new ConflictException({
        code: 'BRACKET_ALREADY_EXISTS',
        message: 'A current bracket already exists for this weight class',
      });
    const athletes = await this.prisma.tournamentAthlete.findMany({
      where: {
        tournamentId,
        weightClassId,
        isActive: true,
        weightClass: { isActive: true },
        OR: [{ organizationId: null }, { organization: { isActive: true } }],
      },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        name: true,
        birthYear: true,
        imagePath: true,
        isActive: true,
        weightClassId: true,
        updatedAt: true,
        organizationId: true,
        organization: {
          select: { id: true, name: true, isActive: true, updatedAt: true },
        },
      },
    });
    if (athletes.length < 2)
      throw new ConflictException({
        code: 'BRACKET_INSUFFICIENT_ATHLETES',
        message: 'At least two eligible athletes are required',
      });
    if (athletes.length > MAX_BRACKET_ATHLETES)
      throw new ConflictException({
        code: 'BRACKET_ATHLETE_LIMIT_EXCEEDED',
        message: `Bracket cannot contain more than ${MAX_BRACKET_ATHLETES} athletes`,
      });
    const rosterFingerprint = this.rosterFingerprint(athletes);
    try {
      this.setupTokens.verify(input.setupToken, {
        tournamentId,
        weightClassId,
        rosterFingerprint,
      });
    } catch (error) {
      const code =
        error instanceof Error && error.message === 'BRACKET_DRAW_SETUP_EXPIRED'
          ? error.message
          : 'BRACKET_DRAW_SETUP_INVALID';
      throw new ConflictException({
        code,
        message:
          code === 'BRACKET_DRAW_SETUP_EXPIRED'
            ? 'Bracket draw setup has expired'
            : 'Bracket draw setup is invalid or the eligible roster changed',
      });
    }
    const eligibleIds = new Set(athletes.map((athlete) => athlete.id));
    const summary = summarizeBracket(athletes.length);
    if (input.designatedByeAthleteIds.some((id) => !eligibleIds.has(id)))
      throw new ConflictException({
        code: 'BRACKET_BYE_ATHLETE_INELIGIBLE',
        message: 'Every designated bye athlete must be currently eligible',
      });
    if (input.designatedByeAthleteIds.length > summary.byeCount)
      throw new ConflictException({
        code: 'BRACKET_BYE_SELECTION_EXCESSIVE',
        message: `At most ${summary.byeCount} athletes may be designated for a bye`,
      });
    const generated = generateSingleEliminationBracket({
      athleteIds: athletes.map(({ id }) => id),
      designatedByeAthleteIds: input.designatedByeAthleteIds,
      randomSource: cryptoRandomSource,
      maxAthletes: MAX_BRACKET_ATHLETES,
    });
    const byId = new Map(athletes.map((athlete) => [athlete.id, athlete]));
    const placements = generated.initialEntrants.map((placement) => ({
      ...placement,
      athlete:
        placement.athleteId === null
          ? null
          : this.snapshot(byId.get(placement.athleteId)!),
      isBye: placement.athleteId === null,
    }));
    const token = this.tokens.issue({
      tournamentId,
      weightClassId,
      placements: generated.initialEntrants,
      rosterFingerprint,
      designatedByeAthleteIds: [...input.designatedByeAthleteIds].sort(),
    });
    return {
      previewToken: token.previewToken,
      expiresAt: token.expiresAt,
      rosterFingerprint,
      summary: summarizeBracket(generated.athleteCount),
      initialEntrants: placements,
      rounds: generated.rounds,
      fixtures: generated.fixtures,
    };
  }

  rosterFingerprint(
    athletes: readonly {
      id: string;
      isActive: boolean;
      weightClassId: string;
      updatedAt: Date;
      organizationId: string | null;
      organization: { id: string; isActive: boolean; updatedAt: Date } | null;
    }[],
  ): string {
    const canonical = athletes
      .map((athlete) => ({
        athleteId: athlete.id,
        active: athlete.isActive,
        weightClassId: athlete.weightClassId,
        updatedAt: athlete.updatedAt.toISOString(),
        organizationId: athlete.organizationId,
        organization:
          athlete.organization === null
            ? null
            : {
                id: athlete.organization.id,
                active: athlete.organization.isActive,
                updatedAt: athlete.organization.updatedAt.toISOString(),
              },
      }))
      .sort((a, b) => a.athleteId.localeCompare(b.athleteId));
    return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  }

  private snapshot(athlete: {
    id: string;
    name: string;
    birthYear: number;
    imagePath: string | null;
    organization: { name: string } | null;
  }) {
    return {
      id: athlete.id,
      name: athlete.name,
      birthYear: athlete.birthYear,
      organizationName: athlete.organization?.name ?? null,
      imageUrl: athlete.imagePath ? `/api/media/${athlete.imagePath}` : null,
    };
  }
}
