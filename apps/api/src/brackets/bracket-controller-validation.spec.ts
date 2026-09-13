import 'reflect-metadata';

import {
  BadRequestException,
  type INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';

import { AdminManagementService } from '../admin-management/admin-management.service';
import { AdminTournamentsController } from '../admin-management/admin-tournaments.controller';
import { TournamentImageService } from '../admin-management/tournament-image.service';
import { AuthGuard } from '../auth/admin-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { BracketConfirmationService } from './bracket-confirmation.service';
import { BracketFixturesController } from './bracket-fixtures.controller';
import { BracketOutcomeService } from './bracket-outcome.service';
import { BracketPreviewController } from './bracket-preview.controller';
import { BracketPreviewService } from './bracket-preview.service';
import { ConfirmBracketDto } from './dto/confirm-bracket.dto';
import { DecideBracketWinnerDto } from './dto/decide-bracket-winner.dto';
import { BracketCancellationService } from './bracket-cancellation.service';
import { BracketDrawSetupService } from './bracket-draw-setup.service';
import { CancelBracketDto } from './dto/cancel-bracket.dto';
import { MatchListQueryDto } from '../admin-management/dto/match-list-query.dto';

const tournamentId = '11111111-1111-4111-8111-111111111111';
const weightClassId = '22222222-2222-4222-8222-222222222222';
const bracketId = '33333333-3333-4333-8333-333333333333';
const fixtureId = '44444444-4444-4444-8444-444444444444';
const entrantId = '55555555-5555-4555-8555-555555555555';

describe('bracket and match-filter controller validation', () => {
  const management = {
    assertTournamentAccess: jest.fn(),
    listMatches: jest.fn().mockImplementation((_id, query) => {
      if (query.weightClassId && query.unassigned === 'true')
        throw new BadRequestException({
          code: 'INVALID_MATCH_FILTER',
          message: 'weightClassId and unassigned cannot be combined',
        });
      return [];
    }),
  };
  const confirmations = { confirm: jest.fn().mockResolvedValue({}) };
  const outcomes = { manuallyDecide: jest.fn().mockResolvedValue({}) };
  const prisma = {
    $transaction: jest.fn(async (work: (tx: unknown) => unknown) =>
      work({ bracketFixture: { findFirst: jest.fn().mockResolvedValue({}) } }),
    ),
  };
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [
        BracketPreviewController,
        BracketFixturesController,
        AdminTournamentsController,
      ],
      providers: [
        { provide: AdminManagementService, useValue: management },
        { provide: TournamentImageService, useValue: {} },
        { provide: BracketPreviewService, useValue: { preview: jest.fn() } },
        { provide: BracketDrawSetupService, useValue: { setup: jest.fn() } },
        { provide: BracketConfirmationService, useValue: confirmations },
        {
          provide: BracketCancellationService,
          useValue: { cancel: jest.fn() },
        },
        { provide: BracketOutcomeService, useValue: outcomes },
        { provide: PrismaService, useValue: prisma },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.use(
      (
        req: Request & { user?: { id: string; role: UserRole } },
        _res: Response,
        next: NextFunction,
      ) => {
        req.user = { id: 'admin-user', role: UserRole.ADMIN };
        next();
      },
    );
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
        whitelist: true,
      }),
    );
    await app.init();
  });

  afterAll(() => app?.close());

  it('retains DTO metatypes for decorated inputs', () => {
    expect(
      Reflect.getMetadata(
        'design:paramtypes',
        BracketPreviewController.prototype,
        'confirm',
      ),
    ).toContain(ConfirmBracketDto);
    expect(
      Reflect.getMetadata(
        'design:paramtypes',
        BracketFixturesController.prototype,
        'decideWinner',
      ),
    ).toContain(DecideBracketWinnerDto);
    expect(
      Reflect.getMetadata(
        'design:paramtypes',
        BracketPreviewController.prototype,
        'cancel',
      ),
    ).toContain(CancelBracketDto);
    expect(
      Reflect.getMetadata(
        'design:paramtypes',
        AdminTournamentsController.prototype,
        'listMatches',
      ),
    ).toContain(MatchListQueryDto);
  });

  it('rejects an empty cancellation reason', async () => {
    await request(app.getHttpServer())
      .post(
        `/api/admin/tournaments/${tournamentId}/weight-classes/${weightClassId}/bracket/cancel`,
      )
      .send({ reason: '   ' })
      .expect(400);
  });

  it.each([
    [{ idempotencyKey: 'key' }],
    [{ previewToken: 1, idempotencyKey: 'key' }],
    [{ previewToken: 'x'.repeat(8193), idempotencyKey: 'key' }],
    [{ previewToken: 'token', idempotencyKey: 'not a key' }],
    [{ previewToken: 'token', idempotencyKey: 'key', extra: true }],
  ])('rejects invalid confirmation payloads with 400', async (body) => {
    await request(app.getHttpServer())
      .post(
        `/api/admin/tournaments/${tournamentId}/weight-classes/${weightClassId}/bracket/confirm`,
      )
      .send(body)
      .expect(400);
    expect(confirmations.confirm).not.toHaveBeenCalled();
  });

  it('normalizes a valid confirmation idempotency key before calling its service', async () => {
    await request(app.getHttpServer())
      .post(
        `/api/admin/tournaments/${tournamentId}/weight-classes/${weightClassId}/bracket/confirm`,
      )
      .send({ previewToken: 'token', idempotencyKey: '  confirm-key  ' })
      .expect(201);
    expect(confirmations.confirm).toHaveBeenLastCalledWith(
      tournamentId,
      weightClassId,
      { previewToken: 'token', idempotencyKey: 'confirm-key' },
      'admin-user',
    );
  });

  it('rejects invalid manual-winner payloads without a controller trim failure', async () => {
    for (const body of [
      { reason: 'reason', idempotencyKey: 'key' },
      { entrantId, reason: 1, idempotencyKey: 'key' },
      { entrantId: 'not-a-uuid', reason: 'reason', idempotencyKey: 'key' },
      { entrantId, reason: 'x'.repeat(501), idempotencyKey: 'key' },
      { entrantId, reason: 'reason', idempotencyKey: 'key', extra: true },
    ]) {
      await request(app.getHttpServer())
        .post(
          `/api/admin/tournaments/${tournamentId}/brackets/${bracketId}/fixtures/${fixtureId}/decide-winner`,
        )
        .send(body)
        .expect(400);
    }
    expect(outcomes.manuallyDecide).not.toHaveBeenCalled();
  });

  it('normalizes a valid manual-winner reason before calling its service', async () => {
    await request(app.getHttpServer())
      .post(
        `/api/admin/tournaments/${tournamentId}/brackets/${bracketId}/fixtures/${fixtureId}/decide-winner`,
      )
      .send({
        entrantId,
        reason: '  tiebreak  ',
        idempotencyKey: '  winner-key  ',
      })
      .expect(201);
    expect(outcomes.manuallyDecide).toHaveBeenLastCalledWith(
      expect.anything(),
      fixtureId,
      entrantId,
      'admin-user',
      'tiebreak',
      'winner-key',
    );
  });

  it.each([
    'weightClassId=not-a-uuid',
    'unassigned=not-a-boolean',
    'unknown=value',
  ])('rejects invalid match filters deterministically', async (query) => {
    await request(app.getHttpServer())
      .get(`/api/admin/tournaments/${tournamentId}/matches?${query}`)
      .expect(400);
  });

  it('passes valid filters through and preserves the conflicting-filter envelope', async () => {
    await request(app.getHttpServer())
      .get(`/api/admin/tournaments/${tournamentId}/matches?unassigned=true`)
      .expect(200);
    expect(management.listMatches).toHaveBeenLastCalledWith(tournamentId, {
      unassigned: 'true',
    });

    await request(app.getHttpServer())
      .get(
        `/api/admin/tournaments/${tournamentId}/matches?weightClassId=${weightClassId}&unassigned=true`,
      )
      .expect(400)
      .expect({
        code: 'INVALID_MATCH_FILTER',
        message: 'weightClassId and unassigned cannot be combined',
      });
  });
});
