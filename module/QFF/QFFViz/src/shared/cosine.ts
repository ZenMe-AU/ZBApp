export const hasVector = (v: number[] | null | undefined): v is number[] => !!v?.length;

/** Cosine similarity; 0 when either vector is missing (stale or not yet embedded). */
export function cosine(a: number[] | null | undefined, b: number[] | null | undefined): number {
  if (!hasVector(a) || !hasVector(b)) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
