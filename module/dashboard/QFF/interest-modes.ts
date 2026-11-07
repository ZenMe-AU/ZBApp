export interface InterestSubmode {
  text: string;
  weight: number;
  vector: number[] | null;
  embeddedText: string | null;
}

export interface InterestMode {
  description: string;
  vector: number[] | null;
  submodes: InterestSubmode[];
}

export interface InterestModesFile {
  embedding_model: { name: string; version: string; dimensions: number };
  modes: Record<string, InterestMode>;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isVector = (value: unknown): value is number[] | null =>
  value === null || (Array.isArray(value) && value.every((x) => typeof x === 'number' && Number.isFinite(x)));

export function parseInterestModes(value: unknown): InterestModesFile {
  if (!isObject(value) || !isObject(value.embedding_model) || !isObject(value.modes)) {
    throw new Error('Invalid interest-modes.json: expected embedding_model and modes objects');
  }
  const model = value.embedding_model;
  if (
    typeof model.name !== 'string' || !model.name ||
    typeof model.version !== 'string' ||
    typeof model.dimensions !== 'number' || !Number.isInteger(model.dimensions) || model.dimensions <= 0
  ) {
    throw new Error('Invalid interest-modes.json: invalid embedding model metadata');
  }
  const modes: Record<string, InterestMode> = {};
  for (const [name, mode] of Object.entries(value.modes)) {
    if (!name.trim() || !isObject(mode) || typeof mode.description !== 'string' ||
      !isVector(mode.vector) || !Array.isArray(mode.submodes) || !mode.submodes.length) {
      throw new Error(`Invalid interest mode "${name}": expected description, vector and nonempty submodes`);
    }
    const submodes: InterestSubmode[] = mode.submodes.map((submode: unknown, i: number) => {
      if (!isObject(submode) || typeof submode.text !== 'string' || !submode.text.trim() ||
        typeof submode.weight !== 'number' || !Number.isFinite(submode.weight) || submode.weight < 0 ||
        !isVector(submode.vector) ||
        (submode.embeddedText !== null && typeof submode.embeddedText !== 'string')) {
        throw new Error(`Invalid submode ${i + 1} of "${name}": expected text, nonnegative weight, vector and embeddedText`);
      }
      return { text: submode.text, weight: submode.weight, vector: submode.vector, embeddedText: submode.embeddedText };
    });
    const totalWeight = submodes.reduce((sum, s) => sum + s.weight, 0);
    if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
      throw new Error(`Invalid interest mode "${name}": total submode weight must be positive and finite`);
    }
    modes[name] = { description: mode.description, vector: mode.vector, submodes };
  }
  return {
    embedding_model: { name: model.name, version: model.version, dimensions: model.dimensions },
    modes,
  };
}

// Preserve the embedding inputs used before consolidation.
export const submodeInput = (name: string, submode: InterestSubmode): string => `${name}: ${submode.text}`;

export function submodeIssue(name: string, submode: InterestSubmode, dimensions: number): string | null {
  if (submode.embeddedText !== submodeInput(name, submode)) return 'submode text changed; refresh embeddings';
  if (!submode.vector?.length) return 'missing submode vector; refresh embeddings';
  if (submode.vector.length !== dimensions) return 'submode vector dimensions differ; refresh embeddings';
  return null;
}

export function averageMode(name: string, mode: InterestMode, dimensions: number): number[] {
  const totalWeight = mode.submodes.reduce((sum, s) => sum + s.weight, 0);
  const vector: number[] = Array(dimensions).fill(0);
  for (const submode of mode.submodes) {
    if (submode.weight === 0) continue;
    const issue = submodeIssue(name, submode, dimensions);
    if (issue) throw new Error(`${name}: ${issue} (${submode.text})`);
    const source = submode.vector;
    if (!source) throw new Error(`${name}: missing submode vector`);
    for (let i = 0; i < dimensions; i++) vector[i] += source[i] * (submode.weight / totalWeight);
  }
  if (!vector.every(Number.isFinite)) throw new Error(`${name}: averaged vector contains non-finite values`);
  return vector;
}

export function modeIssue(name: string, mode: InterestMode, dimensions: number): string | null {
  for (const submode of mode.submodes) {
    if (submode.weight === 0) continue;
    const issue = submodeIssue(name, submode, dimensions);
    if (issue) return issue;
  }
  if (!mode.vector?.length) return 'missing calculated mode vector; run calculate-mode-vectors';
  const expected = averageMode(name, mode, dimensions);
  if (mode.vector.length !== dimensions || mode.vector.some((x, i) => x !== expected[i])) {
    return 'mode average is stale; run calculate-mode-vectors';
  }
  return null;
}

export function clearChangedSubmodes(file: InterestModesFile): number {
  let cleared = 0;
  for (const [name, mode] of Object.entries(file.modes)) {
    for (const submode of mode.submodes) {
      if (submode.embeddedText !== submodeInput(name, submode)) {
        if (submode.vector !== null) cleared++;
        if (mode.vector !== null) cleared++;
        submode.vector = null;
        submode.embeddedText = null;
        mode.vector = null;
      }
    }
  }
  return cleared;
}

export function applyModeEdits(current: InterestModesFile, draft: InterestModesFile): InterestModesFile {
  const result = parseInterestModes(draft);
  result.embedding_model = { ...current.embedding_model };
  for (const [name, mode] of Object.entries(result.modes)) {
    const previous = current.modes[name];
    for (const submode of mode.submodes) {
      const existing = previous?.submodes.find((s) => s.text === submode.text);
      submode.vector = existing?.vector ?? null;
      submode.embeddedText = existing?.embeddedText ?? null;
    }
    const unchanged = previous && JSON.stringify(previous.submodes.map((s) => [s.text, s.weight])) ===
      JSON.stringify(mode.submodes.map((s) => [s.text, s.weight]));
    mode.vector = unchanged ? previous.vector : null;
  }
  clearChangedSubmodes(result);
  return result;
}
