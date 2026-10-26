/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

const normalizeOption = (value: string) => value.trim().toLocaleLowerCase();

export function isDuplicateOption(options: { text: string }[], index: number): boolean {
  const value = normalizeOption(options[index]?.text ?? "");
  return value !== "" && options.some((option, optionIndex) => optionIndex !== index && normalizeOption(option.text) === value);
}
