import { averageMode, modeIssue, submodeIssue, type InterestModesFile } from '../../../interest-modes.ts';
import { cosine } from './cosine.ts';

export interface ModePoint {
  id: string;
  mode: string;
  submode: number | null;
  text: string;
  vector: number[];
  weight: number | null;
  issue: string | null;
}

export function modeGeometry(data: InterestModesFile) {
  const points: ModePoint[] = [];
  const warnings: string[] = [];
  const dimensions = data.embedding_model.dimensions;
  for (const [name, mode] of Object.entries(data.modes)) {
    const issue = modeIssue(name, mode, dimensions);
    try {
      if (mode.submodes.some((s) => s.weight > 0 && s.vector && !s.vector.some((v) => v !== 0))) {
        throw new Error('zero-length active submode vector');
      }
      const vector = averageMode(name, mode, dimensions);
      if (!vector.some((v) => v !== 0)) throw new Error('zero-length average');
      points.push({ id: name, mode: name, submode: null, text: name, vector, weight: null, issue });
    } catch (err) {
      warnings.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
    mode.submodes.forEach((submode, index) => {
      const issue = submodeIssue(name, submode, dimensions);
      if (issue || !submode.vector?.some((v) => v !== 0)) {
        warnings.push(`${name} / ${submode.text}: ${issue ?? 'zero-length vector'}`);
        return;
      }
      points.push({
        id: `${name}:${index}`, mode: name, submode: index, text: submode.text,
        vector: submode.vector, weight: submode.weight, issue: null,
      });
    });
  }
  const parents = points.filter((p) => p.submode === null);
  const alignment = points.filter((p) => p.submode !== null).map((point) => {
    const mode = data.modes[point.mode];
    const parent = parents.find((p) => p.mode === point.mode);
    const siblings = mode.submodes.filter((_, i) => i !== point.submode);
    let siblingScore: number | null = null;
    let siblingIssue = 'No other positive-weight submodes';
    if (siblings.some((s) => s.weight > 0)) {
      try {
        if (siblings.some((s) => s.weight > 0 && s.vector && !s.vector.some((v) => v !== 0))) {
          throw new Error('Zero-length active sibling vector');
        }
        const vector = averageMode(point.mode, { ...mode, submodes: siblings }, dimensions);
        if (vector.some((v) => v !== 0)) siblingScore = cosine(point.vector, vector);
        else siblingIssue = 'Zero-length sibling average';
      } catch (err) {
        siblingIssue = err instanceof Error ? err.message : String(err);
      }
    }
    const rival = parents.filter((p) => p.mode !== point.mode)
      .map((p) => ({ mode: p.mode, score: cosine(point.vector, p.vector) }))
      .sort((a, b) => b.score - a.score)[0];
    return {
      point, parentScore: parent ? cosine(point.vector, parent.vector) : null,
      siblingScore, siblingIssue: siblingScore === null ? siblingIssue : null, rival,
      margin: siblingScore !== null && rival ? siblingScore - rival.score : null,
    };
  }).sort((a, b) => (a.siblingScore ?? Infinity) - (b.siblingScore ?? Infinity));
  return { points, warnings, alignment };
}

export function visibleModePoints(points: ModePoint[], hiddenModes: Set<string>, hiddenSubmodes: Set<string>): ModePoint[] {
  return points.filter((p) => !hiddenModes.has(p.mode) && !hiddenSubmodes.has(p.id));
}
