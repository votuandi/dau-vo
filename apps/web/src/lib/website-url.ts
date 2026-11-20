/** Longest advertising link the server stores. */
export const WEBSITE_URL_MAX_LENGTH = 2048;

const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z¡-￿]{2,63}$/i;

export type WebsiteUrlCheck =
  | { readonly ok: true; readonly value: string | null }
  | { readonly ok: false; readonly error: string };

/**
 * Checks a website address typed by an organiser. Blank means "no link". A
 * missing scheme becomes https://, so "nhataitro.vn" is accepted. Only http(s)
 * addresses with a real domain pass: other schemes (javascript:, data:) could
 * run script when a spectator clicks the link.
 */
export function checkWebsiteUrl(input: string): WebsiteUrlCheck {
  const trimmed = input.trim();
  if (!trimmed) return { ok: true, value: null };
  const error = 'Link không hợp lệ. Ví dụ: https://www.nhataitro.vn';
  if (/\s/.test(trimmed)) return { ok: false, error };
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  if (hasScheme && !/^https?:\/\//i.test(trimmed))
    return { ok: false, error: 'Link phải bắt đầu bằng http:// hoặc https://' };
  const candidate = hasScheme ? trimmed : `https://${trimmed}`;
  if (candidate.length > WEBSITE_URL_MAX_LENGTH)
    return { ok: false, error: 'Link quá dài (tối đa 2048 ký tự).' };
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, error };
  }
  if (url.username || url.password || !HOSTNAME.test(url.hostname)) return { ok: false, error };
  return { ok: true, value: candidate };
}

/** True for a link that is safe to open from a public page. */
export function isSafeWebsiteUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}
