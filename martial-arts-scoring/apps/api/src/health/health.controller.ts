import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';

import { HealthService } from './health.service';
import type { HealthReport, LivenessReport } from './health.types';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(HealthService) private readonly healthService: HealthService,
  ) {}

  @Get()
  ready(): Promise<HealthReport> {
    return this.requireReady();
  }

  @Get('live')
  live(): LivenessReport {
    return this.healthService.live();
  }

  @Get('ready')
  readyProbe(): Promise<HealthReport> {
    return this.requireReady();
  }

  private async requireReady(): Promise<HealthReport> {
    const report = await this.healthService.check();

    if (report.status !== 'ok') {
      throw new ServiceUnavailableException(report);
    }

    return report;
  }
}
