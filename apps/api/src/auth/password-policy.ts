import { Buffer } from 'node:buffer';

export const MIN_PASSWORD_CHARACTERS = 8;
export const MAX_BCRYPT_PASSWORD_BYTES = 72;

export type PasswordValidationCode = 'PASSWORD_TOO_SHORT' | 'PASSWORD_TOO_LONG';

export function passwordValidationCode(
  password: string,
): PasswordValidationCode | null {
  if (password.length < MIN_PASSWORD_CHARACTERS) return 'PASSWORD_TOO_SHORT';
  if (Buffer.byteLength(password, 'utf8') > MAX_BCRYPT_PASSWORD_BYTES)
    return 'PASSWORD_TOO_LONG';
  return null;
}

export function passwordValidationMessage(
  code: PasswordValidationCode,
): string {
  return code === 'PASSWORD_TOO_SHORT'
    ? 'Password must contain at least 8 characters'
    : 'Password must not exceed 72 UTF-8 bytes';
}
