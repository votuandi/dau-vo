import { Module } from '@nestjs/common';

import { RealtimeSessionRegistryService } from './realtime-session-registry.service';
import { RealtimeOfficialRoutingService } from './realtime-official-routing.service';

@Module({
  exports: [RealtimeSessionRegistryService, RealtimeOfficialRoutingService],
  providers: [RealtimeSessionRegistryService, RealtimeOfficialRoutingService],
})
export class RealtimeCoreModule {}
