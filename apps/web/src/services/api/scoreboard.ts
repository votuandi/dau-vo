import { apiClient } from './client';

interface SupervisorBoardState {
  readonly tournamentName: string;
  readonly matchPublicId: string | null;
}
export interface SupervisorBoardAccess extends SupervisorBoardState {
  readonly token: string;
}

export const supervisorScoreboardApi = {
  login: (tournamentCode: string, scoreboardCode: string) =>
    apiClient.post<SupervisorBoardAccess>(
      '/official-access/scoreboard/login',
      { tournamentCode, scoreboardCode },
      { credentials: 'omit' },
    ),
  state: (token: string, signal?: AbortSignal) =>
    apiClient.post<SupervisorBoardState>(
      '/official-access/scoreboard/state',
      { token },
      { credentials: 'omit', signal: signal ?? null },
    ),
};
