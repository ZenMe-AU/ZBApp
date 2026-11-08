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

/** Opens the shared info popup; html must be trusted static markup. */
export function openInfo(title: string, html: string): void {
  const dialog = q<HTMLDialogElement>(document, '#info-dialog');
  q(dialog, 'h3').textContent = title;
  q(dialog, '.body').innerHTML = html;
  dialog.showModal();
}

export function initInfoDialog(): void {
  const dialog = q<HTMLDialogElement>(document, '#info-dialog');
  dialog.addEventListener('click', (e) => {
    const r = dialog.getBoundingClientRect();
    // Backdrop clicks report the dialog as target, so test whether the point is outside its box.
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
  });
  // A page-level keydown handler (likely Plotly) calls preventDefault on Escape, suppressing the native cancel.
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') dialog.close();
  });
}
