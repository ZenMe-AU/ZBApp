import type { CellStyle } from 'ag-grid-community';
import type { PreferenceKind } from '../data/types';

const palette = ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac'];

export const personColor = (index: number): string => palette[index % palette.length];

export const kindColor: Record<PreferenceKind, string> = {
  interest: '#4e79a7',
  want: '#f28e2b',
  value: '#9467bd',
  boundary: '#d62728',
};

/** Green for positive, red for negative, opacity scaled by magnitude. */
export function heat(value: unknown, max = 1): CellStyle | undefined {
  if (typeof value !== 'number' || Number.isNaN(value)) return undefined;
  const alpha = Math.min(1, Math.abs(value) / max) * 0.65;
  return { backgroundColor: value >= 0 ? `rgba(46,157,91,${alpha})` : `rgba(214,39,40,${alpha})` };
}
