import { store } from '../data/store';

export function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function q<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  return root.querySelector<T>(selector)!;
}

export function personOptions(selected?: string): string {
  return store.people
    .map((p) => `<option value="${esc(p.id)}" ${p.id === selected ? 'selected' : ''}>${esc(p.identity.name)}</option>`)
    .join('');
}
