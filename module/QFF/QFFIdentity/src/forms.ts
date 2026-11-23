/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */
type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
let errorId = 0;
const controls = (form: HTMLFormElement) => [...form.querySelectorAll<Control>("input, textarea, select")];
const key = (control: Control) => control.dataset.errorKey || control.name;

export function clearFieldError(control: Control) {
  const id = control.dataset.fieldError;
  if (!id) return;
  document.getElementById(id)?.remove();
  const description = control.getAttribute("aria-describedby")?.split(" ").filter(value => value !== id).join(" ");
  if (description) control.setAttribute("aria-describedby", description); else control.removeAttribute("aria-describedby");
  control.removeAttribute("aria-invalid");
  delete control.dataset.fieldError;
}

export function clearFieldErrors(form: HTMLFormElement) { controls(form).forEach(clearFieldError); }

export function showFieldErrors(form: HTMLFormElement, errors: Record<string, string>, focus = true) {
  clearFieldErrors(form);
  let first: Control | undefined;
  for (const control of controls(form)) {
    const message = errors[key(control)];
    if (!message) continue;
    const error = document.createElement("span");
    error.id = `field-error-${++errorId}`;
    error.className = "field-error";
    error.setAttribute("role", "alert");
    error.textContent = message;
    control.closest("label")!.append(error);
    control.setAttribute("aria-invalid", "true");
    control.setAttribute("aria-describedby", [control.getAttribute("aria-describedby"), error.id].filter(Boolean).join(" "));
    control.dataset.fieldError = error.id;
    first ??= control;
  }
  if (focus && first) { first.focus({ preventScroll: true }); first.scrollIntoView({ block: "nearest" }); }
}

export function validateForm(form: HTMLFormElement) {
  const errors: Record<string, string> = {};
  for (const control of controls(form)) {
    if (control.disabled) continue;
    const label = control.getAttribute("aria-label") || control.closest("label")?.firstChild?.textContent?.trim() || "this field";
    if (control.required && !control.value.trim()) errors[key(control)] = `${control instanceof HTMLSelectElement ? "Choose" : "Enter"} ${label.toLowerCase()}.`;
    else if (control instanceof HTMLInputElement && control.type === "number" && (control.value || control.validity.badInput)) {
      if (control.validity.badInput || control.validity.stepMismatch) errors[key(control)] = `${label} must be a whole number.`;
      else if (control.validity.rangeOverflow || control.validity.rangeUnderflow) errors[key(control)] = `${label} must be between ${control.min} and ${control.max}.`;
    } else if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
      if (control.maxLength > 0 && control.value.length > control.maxLength) errors[key(control)] = `${label} must be ${control.maxLength} characters or fewer.`;
    }
  }
  showFieldErrors(form, errors);
  return Object.keys(errors).length === 0;
}
