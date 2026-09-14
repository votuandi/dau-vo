export enum AthleteColor {
  RED = 'RED',
  BLUE = 'BLUE',
}

export enum TournamentStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  FINISHED = 'FINISHED',
  ARCHIVED = 'ARCHIVED',
}

export enum MatchStatus {
  WAITING = 'WAITING',
  ROUND_1_RUNNING = 'ROUND_1_RUNNING',
  ROUND_1_PAUSED = 'ROUND_1_PAUSED',
  BREAK = 'BREAK',
  ROUND_2_RUNNING = 'ROUND_2_RUNNING',
  ROUND_2_PAUSED = 'ROUND_2_PAUSED',
  FINISHED = 'FINISHED',
}

export enum MatchRole {
  REFEREE = 'REFEREE',
  INSPECTOR = 'INSPECTOR',
}

export enum TournamentOfficialRole {
  REFEREE = 'REFEREE',
  INSPECTOR = 'INSPECTOR',
}

export enum RefereeSlot {
  REFEREE_1 = 'REFEREE_1',
  REFEREE_2 = 'REFEREE_2',
  REFEREE_3 = 'REFEREE_3',
}

export enum MatchAccessRole {
  REFEREE_1 = 'REFEREE_1',
  REFEREE_2 = 'REFEREE_2',
  REFEREE_3 = 'REFEREE_3',
  INSPECTOR = 'INSPECTOR',
}
