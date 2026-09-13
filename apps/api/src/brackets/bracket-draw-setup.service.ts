import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BracketStatus, TournamentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SportGroupRulesNotImplementedError } from '../sport-rules/sport-rules.errors';
import { SportRulesRegistry } from '../sport-rules/sport-rules.registry';
import { summarizeBracket } from './bracket-summary';
import { BracketDrawSetupTokenService } from './bracket-draw-setup-token.service';
import { BracketPreviewService } from './bracket-preview.service';

@Injectable()
export class BracketDrawSetupService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SportRulesRegistry) private readonly sportRules: SportRulesRegistry,
    @Inject(BracketPreviewService)
    private readonly previews: BracketPreviewService,
    @Inject(BracketDrawSetupTokenService)
    private readonly tokens: BracketDrawSetupTokenService,
  ) {}

  async setup(tournamentId: string, weightClassId: string) {
    const tournament = await this.prisma.tournament.findFirst({
      where: { id: tournamentId, softDeletedAt: null },
      select: {
        status: true,
        sport: { select: { sportGroup: { select: { code: true } } } },
      },
    });
    if (!tournament)
      throw new NotFoundException({
        code: 'TOURNAMENT_NOT_FOUND',
        message: 'Tournament not found',
      });
    if (tournament.status === TournamentStatus.ARCHIVED)
      throw this.fail(
        'TOURNAMENT_ARCHIVED',
        'Archived tournaments cannot create bracket draws',
      );
    const weightClass = await this.prisma.tournamentWeightClass.findFirst({
      where: { id: weightClassId, tournamentId, isActive: true },
      select: { id: true },
    });
    if (!weightClass)
      throw new NotFoundException({
        code: 'WEIGHT_CLASS_NOT_FOUND',
        message: 'Weight class not found',
      });
    try {
      if (
        this.sportRules.resolve(tournament.sport.sportGroup.code).athleteColors
          .length !== 2
      )
        throw this.fail(
          'BRACKET_SPORT_GROUP_UNSUPPORTED',
          'Sport group does not support two-participant single-elimination brackets',
        );
    } catch (error) {
      if (error instanceof SportGroupRulesNotImplementedError)
        throw this.fail(
          'BRACKET_SPORT_GROUP_UNSUPPORTED',
          'Sport group does not support two-participant single-elimination brackets',
        );
      throw error;
    }
    if (
      await this.prisma.tournamentBracket.findFirst({
        where: {
          tournamentId,
          weightClassId,
          status: { in: [BracketStatus.ACTIVE, BracketStatus.COMPLETED] },
        },
        select: { id: true },
      })
    )
      throw this.fail(
        'BRACKET_ALREADY_EXISTS',
        'A current bracket already exists for this weight class',
      );
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
      throw this.fail(
        'BRACKET_INSUFFICIENT_ATHLETES',
        'At least two eligible athletes are required',
      );
    let summary;
    try {
      summary = summarizeBracket(athletes.length);
    } catch {
      throw this.fail(
        'BRACKET_ATHLETE_LIMIT_EXCEEDED',
        'Bracket cannot contain more than 64 athletes',
      );
    }
    const rosterFingerprint = this.previews.rosterFingerprint(athletes);
    const token = this.tokens.issue({
      tournamentId,
      weightClassId,
      rosterFingerprint,
      summary,
    });
    return {
      setupToken: token.setupToken,
      expiresAt: token.expiresAt,
      summary,
      eligibleAthletes: athletes.map((a) => ({
        id: a.id,
        name: a.name,
        organizationName: a.organization?.name ?? null,
        imageUrl: a.imagePath ? `/api/media/${a.imagePath}` : null,
      })),
    };
  }

  private fail(code: string, message: string) {
    return new ConflictException({ code, message });
  }
}
