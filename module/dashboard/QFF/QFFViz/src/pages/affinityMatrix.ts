import { createGrid, themeQuartz, type ColGroupDef } from 'ag-grid-community';
import { store } from '../data/store';
import { preferenceKinds, type PreferenceKind } from '../data/types';
import { heat, kindColor } from '../shared/colors';
import { q } from '../shared/dom';
import { normalize } from '../shared/sets';

interface Row {
  norm: string;
  keyword: string;
  kind: PreferenceKind;
}

const trim = (text: string) => (text.length > 20 ? `${text.slice(0, 20)}…` : text);

export function render(root: HTMLElement): () => void {
  root.innerHTML = `
    <div class="toolbar">
      <h2 title="Rows are keywords (per kind), columns are identity → persona. Type an affinity to add the preference, clear a cell to remove it.">Affinity matrix ⓘ</h2>
      <input class="search" placeholder="Quick filter…" />
      <input class="keyword" placeholder="New keyword row" />
      <select class="kind">${preferenceKinds.map((k) => `<option>${k}</option>`).join('')}</select>
      <button class="add">Add row</button>
      <label title="Persona column width in px; press Enter to apply">Col width <input class="col-width" type="number" min="20" max="400" value="70" style="width:60px" /></label>
    </div>
    <div class="fill matrix"></div>`;

  const rowMap = new Map<string, Row & { count: number }>();
  for (const person of store.people) {
    for (const pref of person.properties.personas.flatMap((g) => g.preferences)) {
      const key = `${pref.kind}|${normalize(pref.keyword)}`;
      const row = rowMap.get(key) ?? { norm: normalize(pref.keyword), keyword: pref.keyword, kind: pref.kind, count: 0 };
      row.count++;
      rowMap.set(key, row);
    }
  }
  const rows = [...rowMap.values()].sort((a, b) => b.count - a.count || a.norm.localeCompare(b.norm));

  const findPref = (personId: string, groupIndex: number, row: Row) =>
    store.person(personId)!.properties.personas[groupIndex].preferences.find((p) => p.kind === row.kind && normalize(p.keyword) === row.norm);

  const personGroups: ColGroupDef<Row>[] = store.people.map((person) => ({
    headerName: trim(person.identity.name),
    headerTooltip: person.identity.name,
    children: person.properties.personas.map((group, i) => ({
      colId: `${person.id}|${i}`,
      headerName: trim(group.persona),
      headerTooltip: `${person.identity.name}: ${group.persona}`,
      width: 70,
      suppressHeaderMenuButton: true,
      wrapHeaderText: true,
      autoHeaderHeight: true,
      editable: true,
      cellDataType: 'number',
      cellEditorParams: { min: -1, max: 1, step: 0.1 },
      cellStyle: (p) => heat(p.value),
      valueGetter: (p) => findPref(person.id, i, p.data!)?.affinity ?? null,
      valueSetter: (p) => {
        const value = p.newValue as number | null;
        const pref = findPref(person.id, i, p.data);
        const list = person.properties.personas[i].preferences;
        if (pref && value == null) list.splice(list.indexOf(pref), 1);
        else if (pref) pref.affinity = value!;
        else if (value != null) list.push(store.newPreference(person, p.data.keyword, p.data.kind, value));
        return true;
      },
    })),
  }));

  const api = createGrid<Row>(q(root, '.fill'), {
    rowData: rows,
    theme: themeQuartz.withParams({ spacing: 4, cellHorizontalPadding: 1, rowHeight: 24, headerHeight: 26, fontSize: 12, headerFontSize: 12 }),
    tooltipShowDelay: 300,
    defaultColDef: { sortable: true, resizable: true },
    columnDefs: [
      { field: 'keyword', pinned: 'left', width: 200, filter: true, tooltipField: 'keyword', headerTooltip: 'Keyword' },
      {
        field: 'kind',
        pinned: 'left',
        width: 80,
        headerTooltip: 'Preference kind',
        filter: true,
        cellStyle: (p) => ({ color: kindColor[p.value as PreferenceKind], fontWeight: 600 }),
      },
      ...personGroups,
    ],
    onCellValueChanged: (e) => store.touch(store.person(e.column.getColId().split('|')[0])!.properties),
  });

  q<HTMLInputElement>(root, '.search').addEventListener('input', (e) =>
    api.setGridOption('quickFilterText', (e.target as HTMLInputElement).value),
  );

  q<HTMLInputElement>(root, '.col-width').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const width = Number((e.target as HTMLInputElement).value);
    if (!(width > 0)) return;
    const ids = personGroups.flatMap((g) => g.children.map((c) => (c as { colId: string }).colId));
    api.setColumnWidths(ids.map((key) => ({ key, newWidth: width })));
  });

  q(root, '.add').addEventListener('click', () => {
    const keyword = q<HTMLInputElement>(root, '.keyword').value.trim();
    if (!keyword) return;
    const row: Row = { norm: normalize(keyword), keyword, kind: q<HTMLSelectElement>(root, '.kind').value as PreferenceKind };
    api.applyTransaction({ add: [row], addIndex: 0 });
  });

  return () => api.destroy();
}
