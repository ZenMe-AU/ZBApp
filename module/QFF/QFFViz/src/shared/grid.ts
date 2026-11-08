import { createGrid, type ColDef, type GridApi } from 'ag-grid-community';

export function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], obj);
}

export function setPath(obj: unknown, path: string, value: unknown): void {
  const keys = path.split('.');
  const last = keys.pop()!;
  (getPath(obj, keys.join('.')) as Record<string, unknown>)[last] = value;
}

export function splitLines(value: unknown): string[] {
  return String(value ?? '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export const longText = {
  cellEditor: 'agLargeTextCellEditor',
  cellEditorPopup: true,
  cellEditorParams: { maxLength: 10000, rows: 12, cols: 70 },
  wrapText: true,
  autoHeight: true,
  cellClass: 'cell-pre',
  minWidth: 220,
} satisfies ColDef;

/** Column editing a string[] at a dotted path as one item per line. */
export function listCol(field: string, headerName: string): ColDef {
  return {
    ...longText,
    headerName,
    colId: field,
    editable: true,
    valueGetter: (p) => ((getPath(p.data, field) as string[] | undefined) ?? []).join('\n'),
    valueSetter: (p) => {
      setPath(p.data, field, splitLines(p.newValue));
      return true;
    },
  };
}

function toText(value: unknown): string {
  if (Array.isArray(value)) return value.every((x) => typeof x === 'number') ? value.join(', ') : value.join('\n');
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return String(value ?? '');
}

function fromText(old: unknown, text: string): unknown {
  if (typeof old === 'number') return Number(text);
  if (Array.isArray(old)) {
    return old.length > 0 && old.every((x) => typeof x === 'number') ? text.split(',').map(Number) : splitLines(text);
  }
  if (typeof old === 'object' && old !== null) return JSON.parse(text);
  return text;
}

/** Vertical key/value editor for any flat object; values keep their original JSON type. */
export function kvGrid(el: HTMLElement, obj: object, onChange: () => void, readOnly: string[] = []): GridApi {
  const rec = obj as Record<string, unknown>;
  return createGrid<{ key: string }>(el, {
    rowData: Object.keys(rec).map((key) => ({ key })),
    columnDefs: [
      { field: 'key', width: 180, cellClass: 'kv-key' },
      {
        ...longText,
        headerName: 'value',
        flex: 1,
        editable: (p) => !readOnly.includes(p.data!.key),
        valueGetter: (p) => toText(rec[p.data!.key]),
        valueSetter: (p) => {
          try {
            rec[p.data.key] = fromText(rec[p.data.key], String(p.newValue ?? ''));
            return true;
          } catch {
            return false;
          }
        },
      },
    ],
    domLayout: 'autoHeight',
    onCellValueChanged: onChange,
  });
}
