import { UMAP } from 'umap-js';
import TSNE from 'tsne-js';
import { cosine, pca, seededRandom } from './vectors';

export type Projection3d = 'pca' | 'umap' | 'tsne';

export function project3d(vectors: number[][], method: Projection3d): { coords: number[][]; info: string } {
  if (method === 'pca' || vectors.length < 4) {
    const { coords, explained } = pca(vectors, 3);
    const share = explained.map((e) => `${(e * 100).toFixed(1)}%`).join(' + ');
    return {
      coords,
      info: `${method !== 'pca' ? `Too few points for 3D ${method === 'tsne' ? 't-SNE' : 'UMAP'}; using PCA. ` : ''}PCA axes explain ${share} = ${(explained.reduce((s, e) => s + e, 0) * 100).toFixed(1)}% of variance`,
    };
  }
  if (method === 'tsne') {
    const perplexity = Math.min(30, Math.max(2, Math.floor((vectors.length - 1) / 3)));
    const model = new TSNE({ dim: 3, perplexity, learningRate: 100, nIter: 500, metric: 'euclidean' });
    const normalized = vectors.map((vector) => {
      const norm = Math.hypot(...vector);
      if (!norm) throw new Error('t-SNE requires non-zero vectors');
      return vector.map((value) => value / norm);
    });
    model.init({ data: normalized, type: 'dense' });
    // Replace the library's random initialization without changing global Math.random.
    const random = seededRandom(42);
    const initial = model.outputEmbedding.data;
    for (let i = 0; i < initial.length; i++) {
      initial[i] = Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random()) * 1e-4;
    }
    model.run();
    const coords = model.getOutput();
    if (coords.some((point) => point.length !== 3 || point.some((value) => !Number.isFinite(value)))) {
      throw new Error('t-SNE produced invalid coordinates');
    }
    return {
      coords,
      info: `t-SNE (unit-normalized Euclidean, perplexity ${perplexity}, 500 iterations, seed 42): inspect local neighbourhoods, not inter-cluster distances`,
    };
  }
  const neighbors = Math.min(15, vectors.length - 1);
  const umap = new UMAP({
    nComponents: 3, nNeighbors: neighbors, minDist: 0.1,
    distanceFn: (a, b) => 1 - cosine(a, b), random: seededRandom(42),
  });
  return { coords: umap.fit(vectors), info: `UMAP (cosine, ${neighbors} neighbours, seed 42): inspect local neighbourhoods, not inter-cluster distances` };
}
