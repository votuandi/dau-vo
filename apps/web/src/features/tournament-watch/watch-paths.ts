export const WATCH_PATH = '/watch';

export const watchTournamentPath = (code: string, tab?: 'bracket') =>
  `${WATCH_PATH}/${encodeURIComponent(code)}${tab ? `?tab=${tab}` : ''}`;

export const watchResultPath = (code: string, matchPublicId: string) =>
  `${WATCH_PATH}/${encodeURIComponent(code)}/matches/${encodeURIComponent(matchPublicId)}`;

export const normalizeWatchCode = (value: string) => value.trim().toUpperCase();
