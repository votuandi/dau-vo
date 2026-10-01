export function shuffle<T>(values: readonly T[]): T[] {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    const current = shuffled[index] as T;
    shuffled[index] = shuffled[randomIndex] as T;
    shuffled[randomIndex] = current;
  }
  return shuffled;
}
