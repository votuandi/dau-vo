export const bracketQueryKeys = {
  all: ['admin', 'brackets'] as const,
  detail: (tournamentId: string, weightClassId: string) =>
    ['admin', 'brackets', tournamentId, weightClassId] as const,
};
