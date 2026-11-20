import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { BracketStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
  refreshBracketCompletion,
  syncThirdPlaceFixture,
} from './bracket-third-place';

/** "Thực hiện trận tranh hạng 3": a weight class setting that also reshapes its active bracket. */
@Injectable()
export class BracketThirdPlaceService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  setEnabled(tournamentId: string, weightClassId: string, enabled: boolean) {
    return this.prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM tournament_weight_classes
        WHERE id = ${weightClassId}::uuid AND tournament_id = ${tournamentId}::uuid
        FOR UPDATE
      `;
      if (!locked)
        throw new NotFoundException({
          code: 'WEIGHT_CLASS_NOT_FOUND',
          message: 'Weight class not found',
        });
      const bracket = await tx.tournamentBracket.findFirst({
        where: {
          tournamentId,
          weightClassId,
          status: { in: [BracketStatus.ACTIVE, BracketStatus.COMPLETED] },
        },
        select: { id: true },
      });
      if (bracket) {
        await tx.$queryRaw`SELECT id FROM tournament_brackets WHERE id = ${bracket.id}::uuid FOR UPDATE`;
        if (
          (await syncThirdPlaceFixture(tx, bracket.id, enabled)) !== 'unchanged'
        )
          // Removing a pending third-place match can complete a bracket whose final is decided.
          await refreshBracketCompletion(tx, bracket.id);
      }
      const weightClass = await tx.tournamentWeightClass.update({
        where: { id: weightClassId },
        data: { thirdPlaceMatchEnabled: enabled },
        select: { id: true, thirdPlaceMatchEnabled: true },
      });
      return { weightClass };
    });
  }
}
