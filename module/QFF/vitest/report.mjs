/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { readFile } from "node:fs/promises";

const [testReportPath, performanceMetricsPath] = process.argv.slice(2);
if (!testReportPath || !performanceMetricsPath) {
  throw new Error("Usage: node report.mjs <vitest-json-report> <performance-metrics-json>");
}

const report = JSON.parse(await readFile(testReportPath, "utf8"));
const metrics = JSON.parse(await readFile(performanceMetricsPath, "utf8"));
const assertions = (report.testResults ?? []).flatMap(result => result.assertionResults ?? []);
const total = report.numTotalTests ?? assertions.length;
const passed = report.numPassedTests ?? assertions.filter(test => test.status === "passed").length;
const failed = report.numFailedTests ?? assertions.filter(test => test.status === "failed").length;
const skipped = report.numPendingTests ?? assertions.filter(test => test.status === "pending").length;

console.log("QFF Phase 1 repository test report");
console.log(`Tests: ${passed} passed, ${failed} failed, ${skipped} skipped (${total} total)`);
console.log(`Profiles loaded: ${metrics.profiles}`);
console.log(`Preference references indexed: ${metrics.preferences}`);
console.log(`Source read: ${metrics.sourceReadMs} ms`);
console.log(`QFF write: ${metrics.writeMs} ms (${metrics.writeRowsPerSecond} rows/s)`);
console.log(`Verification read: ${metrics.verifyMs} ms`);
console.log(`Total measured: ${metrics.totalMs} ms`);
