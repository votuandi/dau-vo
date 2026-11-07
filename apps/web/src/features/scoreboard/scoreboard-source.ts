import type { SupervisorBoardAccess } from '@/services/api/scoreboard';

export type ScoreboardSource =
  | { readonly kind: 'match'; readonly matchPublicId: string }
  | {
      readonly kind: 'supervisor';
      readonly tournamentCode: string;
      readonly scoreboardCode: string;
      readonly access: SupervisorBoardAccess;
    };
