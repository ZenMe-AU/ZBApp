import { UMAP } from 'umap-js';
import { cosine, pca, seededRandom } from './vectors';

export type Projection3d = 'pca' | 'umap';

export function project3d(vectors: number[][], method: Projection3d): { coords: number[][]; info: string } {
  if (method === 'pca' || vectors.length < 4) {
    const { coords, explained } = pca(vectors, 3);
    const share = explained.map((e) => `${(e * 100).toFixed(1)}%`).join(' + ');
    return {
      coords,
      info: `${method === 'umap' ? 'Too few points for 3D UMAP; using PCA. ' : ''}PCA axes explain ${share} = ${(explained.reduce((s, e) => s + e, 0) * 100).toFixed(1)}% of variance`,
    };
  }
  const neighbors = Math.min(15, vectors.length - 1);
  const umap = new UMAP({
    nComponents: 3, nNeighbors: neighbors, minDist: 0.1,
    distanceFn: (a, b) => 1 - cosine(a, b), random: seededRandom(42),
  });
  return { coords: umap.fit(vectors), info: `UMAP (cosine, ${neighbors} neighbours, seed 42): inspect local neighbourhoods, not inter-cluster distances` };
}
