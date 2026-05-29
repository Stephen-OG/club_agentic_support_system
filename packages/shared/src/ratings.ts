export type SatisfactionRating = 1 | 2 | 3 | 4 | 5;

const validRatings = new Set<SatisfactionRating>([1, 2, 3, 4, 5]);

export function normalizeSatisfactionRating(value: unknown): SatisfactionRating | null {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return null;
  }

  return validRatings.has(value as SatisfactionRating) ? (value as SatisfactionRating) : null;
}
