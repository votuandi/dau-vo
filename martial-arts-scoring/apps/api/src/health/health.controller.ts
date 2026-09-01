import { Controller, Get, Inject } from '@nestjs/common';

import { HealthService } from './health.service';
import type { HealthReport } from './health.types';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(HealthService) private readonly healthService: HealthService,
  ) {}

  @Get()
  check(): Promise<HealthReport> {
    return this.healthService.check();
  }
}
