/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

const app = document.querySelector<HTMLElement>("#app");

if (!app) {
  throw new Error("Application root element is missing.");
}

app.textContent = "QFFMatcher is ready for implementation.";
