/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { describe, expect, it } from "vitest";
import { isDuplicateOption } from "./optionValidation";

describe("isDuplicateOption", () => {
  it("detects an existing option after trimming and ignoring case", () => {
    expect(isDuplicateOption([{ text: "김지오" }, { text: " 김지오 " }], 1)).toBe(true);
    expect(isDuplicateOption([{ text: "Apple" }, { text: "apple" }], 1)).toBe(true);
  });

  it("allows the option after it becomes unique", () => {
    expect(isDuplicateOption([{ text: "김지오" }, { text: "김지우" }], 1)).toBe(false);
  });

  it("allows empty editing rows", () => {
    expect(isDuplicateOption([{ text: "" }, { text: " " }], 1)).toBe(false);
  });
});
