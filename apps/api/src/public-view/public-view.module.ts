import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/admin-auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PublicViewController } from './public-view.controller';

@Module({ imports: [AuthModule, PrismaModule], controllers: [PublicViewController] })
export class PublicViewModule {}
