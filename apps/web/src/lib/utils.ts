import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string { return twMerge(clsx(inputs)); }
export function createCommandId(): string { return crypto.randomUUID(); }
export function normalizePublicId(value: string): string { return value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 12); }
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '—';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'medium' }).format(date);
}
