export const money = (amount: number) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount);

export const date = (value: string | null) =>
  value ? formatDateTime(new Date(value)) : 'Chưa có';

function formatDateTime(value: Date): string {
  if (Number.isNaN(value.getTime())) {
    return 'Chưa có';
  }

  const date = [value.getDate(), value.getMonth() + 1, value.getFullYear()]
    .map((part, index) => (index < 2 ? part.toString().padStart(2, '0') : String(part)))
    .join('/');
  const time = [value.getHours(), value.getMinutes()]
    .map((part) => part.toString().padStart(2, '0'))
    .join(':');

  return `${date} ${time}`;
}
