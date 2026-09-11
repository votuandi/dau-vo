export const MIN_PASSWORD_CHARACTERS = 8;
export const MAX_BCRYPT_PASSWORD_BYTES = 72;

export function passwordUtf8ByteLength(password: string): number {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(password).byteLength;
  return new Blob([password]).size;
}

export function passwordValidationMessage(password: string): string | null {
  if (password.length < MIN_PASSWORD_CHARACTERS) return 'Mật khẩu phải có ít nhất 8 ký tự.';
  if (passwordUtf8ByteLength(password) > MAX_BCRYPT_PASSWORD_BYTES)
    return 'Mật khẩu không được vượt quá 72 byte UTF-8.';
  return null;
}
