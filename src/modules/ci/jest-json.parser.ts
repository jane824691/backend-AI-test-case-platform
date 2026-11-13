import { ParsedJUnitTest } from './junit.parser';

interface JestAssertionResult {
  title?: unknown;
  fullName?: unknown;
  status?: unknown;
  duration?: unknown;
  failureMessages?: unknown;
}

interface JestSuiteResult {
  name?: unknown;
  testFilePath?: unknown;
  assertionResults?: unknown;
}

function text(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value : null; }

function outcome(status: unknown): ParsedJUnitTest['outcome'] {
  if (status === 'passed') return 'passed';
  if (status === 'pending' || status === 'skipped' || status === 'todo' || status === 'disabled') return 'skipped';
  if (status === 'error') return 'error';
  return 'failed';
}

/** Parses Jest's `--json --outputFile=test-results.json` result schema. */
export function parseJestJson(source: string): ParsedJUnitTest[] {
  let report: unknown;
  try { report = JSON.parse(source); } catch { throw new Error('Test-results artifact is not valid JSON.'); }
  if (!report || typeof report !== 'object' || !Array.isArray((report as { testResults?: unknown }).testResults)) {
    throw new Error('Test-results JSON is not a Jest report with a testResults array.');
  }
  const tests: ParsedJUnitTest[] = [];
  for (const suite of (report as { testResults: JestSuiteResult[] }).testResults) {
    if (!Array.isArray(suite.assertionResults)) continue;
    const suiteName = text(suite.name) ?? text(suite.testFilePath);
    for (const assertion of suite.assertionResults as JestAssertionResult[]) {
      // Jest title is the `it(...)` value; prefer it because TC prefixes belong there.
      const testName = text(assertion.title) ?? text(assertion.fullName) ?? 'Unnamed test';
      const identifier = testName.match(/^\[(TC-[A-Za-z0-9_-]+)\](?:\s|$)/)?.[1] ?? null;
      const duration = typeof assertion.duration === 'number' && Number.isFinite(assertion.duration) ? Math.round(assertion.duration) : null;
      const failures = Array.isArray(assertion.failureMessages) ? assertion.failureMessages.filter((value): value is string => typeof value === 'string').join('\n').slice(0, 10000) || null : null;
      tests.push({ identifier, suiteName, testName, outcome: outcome(assertion.status), durationMs: duration, failureMessage: failures });
    }
  }
  return tests;
}
