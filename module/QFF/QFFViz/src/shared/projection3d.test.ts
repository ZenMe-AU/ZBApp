import { describe, it, expect } from 'vitest';
import { project3d } from './projection3d';

describe('3D t-SNE projection', () => {
  const vectors = Array.from({ length: 12 }, (_, i) =>
    Array.from({ length: 6 }, (_, j) => Math.sin(i * 0.7 + j) + Math.cos(i + j * 0.3)));

  it('produces repeatable, finite 3D coordinates without mutating vectors or global randomness', () => {
    const before = structuredClone(vectors);
    const random = Math.random;
    const first = project3d(vectors, 'tsne');
    const second = project3d(vectors, 'tsne');
    expect(first.coords).toHaveLength(vectors.length);
    expect(first.coords.every((point) => point.length === 3 && point.every(Number.isFinite))).toBe(true);
    expect(first.coords).toEqual(second.coords);
    expect(new Set(first.coords.map((point) => point.join(','))).size).toBeGreaterThan(1);
    expect(first.info).toContain('perplexity 3');
    expect(first.info).toContain('seed 42');
    expect(vectors).toEqual(before);
    expect(Math.random).toBe(random);
  });

  it('uses the existing PCA fallback for too few points', () => {
    const result = project3d(vectors.slice(0, 3), 'tsne');
    expect(result.coords).toEqual(project3d(vectors.slice(0, 3), 'pca').coords);
    expect(result.info).toContain('Too few points for 3D t-SNE; using PCA.');
  });

  it('handles the minimum supported point count with bounded perplexity', () => {
    const result = project3d(vectors.slice(0, 4), 'tsne');
    expect(result.coords).toHaveLength(4);
    expect(result.coords.every((point) => point.length === 3 && point.every(Number.isFinite))).toBe(true);
    expect(result.info).toContain('perplexity 2');
  });

  it('rejects zero vectors instead of displaying invalid coordinates', () => {
    expect(() => project3d([...vectors, [0, 0, 0, 0, 0, 0]], 'tsne')).toThrow('non-zero vectors');
  });
});
