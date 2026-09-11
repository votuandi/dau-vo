export type DependencyStatus = 'down' | 'up';

export interface DependencyHealth {
  latencyMs: number;
  status: DependencyStatus;
}

export interface HealthReport {
  services: {
    api: { status: 'up' };
    postgres: DependencyHealth;
    redis: DependencyHealth;
  };
  status: 'degraded' | 'ok';
  timestamp: string;
  uptimeSeconds: number;
}

export interface LivenessReport {
  status: 'ok';
  timestamp: string;
  uptimeSeconds: number;
}
