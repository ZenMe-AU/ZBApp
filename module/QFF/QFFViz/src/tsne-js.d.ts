declare module 'tsne-js' {
  export default class TSNE {
    constructor(options: { dim: number; perplexity: number; learningRate: number; nIter: number; metric: 'euclidean' });
    outputEmbedding: { data: Float64Array };
    init(options: { data: number[][]; type: 'dense' }): void;
    run(): [number, number];
    getOutput(): number[][];
  }
}
