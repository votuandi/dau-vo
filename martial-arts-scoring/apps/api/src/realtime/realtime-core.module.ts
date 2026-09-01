import { Module } from '@nestjs/common';

import { RealtimeSessionRegistryService } from './realtime-session-registry.service';

@Module({
  exports: [RealtimeSessionRegistryService],
  providers: [RealtimeSessionRegistryService],
})
export class RealtimeCoreModule {}
