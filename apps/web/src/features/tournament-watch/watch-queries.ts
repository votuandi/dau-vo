export const watchQueryKeys = {
  all: ['watch'] as const,
  overview: (code: string) => ['watch', code, 'overview'] as const,
  brackets: (code: string) => ['watch', code, 'brackets'] as const,
  result: (code: string, matchPublicId: string) =>
    ['watch', code, 'result', matchPublicId] as const,
};
