/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */
type Confirmation = { title: string; message: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean };

export function keepDialogFocus(dialog: HTMLDialogElement) {
  dialog.addEventListener("keydown", event => {
    if (event.key !== "Tab") return;
    const controls = [...dialog.querySelectorAll<HTMLElement>("button, input, select, textarea, [tabindex]")]
      .filter(el => !el.hasAttribute("disabled") && el.tabIndex >= 0 && el.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
}

export function confirmAction(options: Confirmation): Promise<boolean> {
  let dialog = document.querySelector<HTMLDialogElement>("#confirm-dialog");
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.id = "confirm-dialog";
    dialog.setAttribute("aria-labelledby", "confirm-title");
    dialog.setAttribute("aria-describedby", "confirm-copy");
    dialog.innerHTML = '<h2 id="confirm-title"></h2><p id="confirm-copy"></p><form method="dialog" class="dialog-actions"><button value="cancel" autofocus></button><button value="confirm"></button></form>';
    keepDialogFocus(dialog);
    document.body.append(dialog);
  }
  if (dialog.open) return Promise.resolve(false);
  const opener = document.activeElement as HTMLElement | null;
  dialog.querySelector("h2")!.textContent = options.title;
  dialog.querySelector("p")!.textContent = options.message;
  dialog.querySelector('[value="cancel"]')!.textContent = options.cancelLabel || "Keep editing";
  const accept = dialog.querySelector<HTMLButtonElement>('[value="confirm"]')!;
  accept.textContent = options.confirmLabel || "Discard changes";
  accept.className = options.danger ? "danger" : "primary";
  dialog.returnValue = "cancel";
  return new Promise(resolve => {
    dialog!.addEventListener("close", () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
      resolve(dialog!.returnValue === "confirm");
    }, { once: true });
    dialog!.showModal();
  });
}
